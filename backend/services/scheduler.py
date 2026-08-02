"""
背景排程：自動產生每日摘要。

運作方式：一條 daemon thread，每 60 秒醒來一次，掃 Follows 找出
「已核准且設定了 daily_summary_time」的追蹤關係，判斷是否該產生
被追蹤者今天的每日摘要。

判斷條件刻意不是「現在剛好是設定時間」，而是
「現在（台灣時間）已經過了設定時間，且今天還沒產生過摘要」。
這樣的好處：
  - 伺服器在設定時間點沒開機 → 之後開機會自動補跑，不會整天漏掉
  - 重複觸發不會重複產生（以 DailySummaries 是否已有今天記錄為準）

注意：同一位被追蹤者可能有多位追蹤者各自設定不同時間，但
DailySummaries 的主鍵是 account_id#date，摘要本身是共用的。
因此這裡取所有追蹤者設定時間中「最早」的那個作為觸發點，
產生後所有追蹤者都會看到同一份摘要。

email 通知：摘要「由本排程新產生」時，才寄給該長輩底下所有設定了
排程的追蹤者（收件地址由 services/email_notify.py 從 Cognito 反查）。
若當天摘要已經存在（例如有人手動按過產生），排程會跳過、也不寄信，
以此避免重複寄送而不需要額外的「已寄送」狀態欄位。
"""
import threading
import time
from datetime import datetime

from botocore.exceptions import ClientError

from config import Config
from services.dynamodb import follows_table, accounts_table
from services.daily_summary import (
    TW_TZ,
    today_tw,
    daily_summary_exists,
    run_daily_summary,
)
from services.email_notify import (
    email_enabled,
    get_user_email,
    send_daily_summary_email,
)
from services.logger import summary_logger

# 每次檢查的間隔（秒）
CHECK_INTERVAL_SECONDS = 60

# 同一個 (被追蹤者, 日期) 失敗或無資料後，最短重試間隔（秒）
# 避免當天沒有任何紀錄時每分鐘都去 scan 一次
RETRY_INTERVAL_SECONDS = 900

# 代表憑證失效的錯誤碼（臨時憑證過期時會出現）
_CREDENTIAL_ERROR_CODES = {
    "ExpiredToken",
    "ExpiredTokenException",
    "InvalidClientTokenId",
    "UnrecognizedClientException",
}

# {(followee_id, date_str): 上次嘗試的 epoch 秒數}
_last_attempt: dict = {}

# {(followee_id, date_str)} — 一次性的「允許重新產生」標記。
# 使用者每次儲存推播時間就登記一次，排程觸發後立即消耗掉。
# 用途：讓「設定時間 → 等觸發」這個正常流程可以重複測試，
# 不必手動去 DynamoDB 刪掉當天的摘要。因為是一次性的，
# 不會造成每輪重複產生或重複寄信。
_force_once: set = set()

_thread = None
_thread_lock = threading.Lock()


def is_due(now_hhmm: str, scheduled_hhmm: str) -> bool:
    """判斷現在是否已經到達或超過設定時間。

    HH:MM 為零填補的 24 小時制，字典序比較等同時間先後，
    所以可以直接用字串比較。
    """
    if not scheduled_hhmm:
        return False
    return now_hhmm >= scheduled_hhmm


def _scan_scheduled_follows() -> list:
    """撈出所有已核准且設定了 daily_summary_time 的追蹤記錄。

    這裡處理分頁：背景排程若只讀第一頁，資料量成長後會靜默漏掉部分
    使用者，而且沒有人會察覺。
    """
    items = []
    kwargs = {
        "FilterExpression": "#s = :status AND attribute_exists(daily_summary_time)",
        "ExpressionAttributeNames": {"#s": "status"},
        "ExpressionAttributeValues": {":status": "approved"},
    }
    while True:
        response = follows_table.scan(**kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def _group_by_followee(follows: list) -> dict:
    """把追蹤記錄收斂成 {followee_id: {"time": 最早設定時間, "follower_ids": [...]}}。

    time 取最早：摘要本身是共用的（DailySummaries 主鍵為 account_id#date），
    只要有任一位追蹤者的時間到了就產生。
    follower_ids 保留全部：email 要寄給每一位有設定排程的追蹤者。
    """
    result = {}
    for follow in follows:
        followee_id = follow.get("followee_id")
        follower_id = follow.get("follower_id")
        scheduled = follow.get("daily_summary_time")
        if not followee_id or not scheduled:
            continue

        entry = result.setdefault(followee_id, {"time": scheduled, "follower_ids": []})
        if scheduled < entry["time"]:
            entry["time"] = scheduled
        if follower_id and follower_id not in entry["follower_ids"]:
            entry["follower_ids"].append(follower_id)

    return result


def _elder_display_name(account_id: str) -> str:
    """取得長輩的顯示名稱，供信件標題與內容使用。"""
    try:
        response = accounts_table.get_item(Key={"account_id": account_id})
        item = response.get("Item") or {}
        return item.get("display_name") or "家人"
    except Exception as e:
        summary_logger.warning(f"取得 {account_id[:8]} 顯示名稱失敗: {type(e).__name__}: {e}")
        return "家人"


def _notify_followers_by_email(follower_ids: list, elder_name: str,
                               date_str: str, summary_text: str) -> list:
    """把摘要寄給各追蹤者，回傳成功寄達的 email 清單。

    寄信失敗絕不影響摘要本身（摘要此時已經寫入 DynamoDB）。
    """
    if not email_enabled():
        return []

    sent = []
    seen = set()
    for follower_id in follower_ids:
        try:
            address = get_user_email(follower_id)
            if not address or address in seen:
                continue
            seen.add(address)
            if send_daily_summary_email(address, elder_name, date_str, summary_text):
                sent.append(address)
        except Exception as e:
            summary_logger.error(
                f"[排程] 寄信給 {follower_id[:8]} 時發生錯誤: {type(e).__name__}: {e}",
                exc_info=True
            )
    return sent


def _should_attempt(followee_id: str, date_str: str, now_epoch: float) -> bool:
    """距離上次嘗試是否已超過最短重試間隔。"""
    last = _last_attempt.get((followee_id, date_str))
    if last is None:
        return True
    return (now_epoch - last) >= RETRY_INTERVAL_SECONDS


def _prune_last_attempt(today_str: str) -> None:
    """清掉非今日的節流紀錄與 force 標記。

    兩者都只在「當天」有意義，跨日後那些 key 永遠不會再被查詢。
    不清除的話會隨執行天數與使用者數持續成長。
    """
    for key in [k for k in _last_attempt if k[1] != today_str]:
        _last_attempt.pop(key, None)
    for key in [k for k in _force_once if k[1] != today_str]:
        _force_once.discard(key)


def request_force_run(followee_id: str) -> None:
    """登記一次「允許重新產生今天摘要」。

    由儲存推播時間的 API 呼叫。效果是下一次排程檢查若已到設定時間，
    即使當天摘要已存在也會重新產生並重新寄信，且只會生效一次。
    """
    key = (followee_id, today_tw().isoformat())
    _force_once.add(key)
    # 一併清掉節流，否則剛失敗過的項目要等 15 分鐘才會再試
    _last_attempt.pop(key, None)
    summary_logger.debug(f"已登記 {followee_id[:8]} 的一次性重新產生標記")


def run_once() -> dict:
    """執行一輪檢查。回傳統計資訊，方便測試與除錯。

    任何單一使用者的失敗都不會中斷整輪，也不會讓執行緒死掉。
    """
    stats = {
        "checked": 0, "created": 0, "skipped_exists": 0,
        "no_facts": 0, "failed": 0, "emails_sent": 0
    }

    now = datetime.now(TW_TZ)
    now_hhmm = now.strftime("%H:%M")
    today_str = today_tw().isoformat()
    now_epoch = time.time()

    _prune_last_attempt(today_str)

    try:
        follows = _scan_scheduled_follows()
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in _CREDENTIAL_ERROR_CODES:
            summary_logger.error(
                f"排程無法讀取 Follows：AWS 憑證已失效（{code}）。"
                f"請更新 backend/.env 的 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN"
            )
        else:
            summary_logger.error(f"排程掃描 Follows 失敗: {code or type(e).__name__}: {e}")
        stats["failed"] += 1
        return stats
    except Exception as e:
        summary_logger.error(f"排程掃描 Follows 失敗: {type(e).__name__}: {e}", exc_info=True)
        stats["failed"] += 1
        return stats

    schedule_map = _group_by_followee(follows)

    for followee_id, entry in schedule_map.items():
        scheduled = entry["time"]
        if not is_due(now_hhmm, scheduled):
            continue

        stats["checked"] += 1

        key = (followee_id, today_str)
        # 使用者剛儲存過推播時間 → 允許重新產生一次（含覆蓋當天既有摘要）
        forced = key in _force_once

        if not forced and daily_summary_exists(followee_id, today_str):
            stats["skipped_exists"] += 1
            continue

        if not forced and not _should_attempt(followee_id, today_str, now_epoch):
            continue

        _force_once.discard(key)
        _last_attempt[key] = now_epoch

        try:
            result = run_daily_summary(followee_id, today_tw())
            if result["status"] == "created":
                stats["created"] += 1
                summary_logger.info(
                    f"[排程] {followee_id[:8]} 的 {today_str} 每日摘要已自動產生"
                    f"（設定時間 {scheduled}，facts={result['facts_count']}）"
                )

                # 摘要已寫入，接著寄 email。寄信失敗不影響摘要，也不算整筆失敗。
                if email_enabled():
                    elder_name = _elder_display_name(followee_id)
                    sent = _notify_followers_by_email(
                        entry["follower_ids"], elder_name,
                        result["date"], result["summary"]
                    )
                    stats["emails_sent"] += len(sent)
                    if sent:
                        summary_logger.info(
                            f"[排程] {followee_id[:8]} 的摘要已寄出 {len(sent)} 封 email"
                        )
            else:
                stats["no_facts"] += 1
                summary_logger.info(
                    f"[排程] {followee_id[:8]} 今天沒有紀錄，稍後重試"
                )
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            stats["failed"] += 1
            if code in _CREDENTIAL_ERROR_CODES:
                summary_logger.error(
                    f"[排程] {followee_id[:8]} 產生摘要失敗：AWS 憑證已失效（{code}）。"
                    f"請更新 backend/.env 的三個 AWS 憑證值"
                )
            else:
                summary_logger.error(
                    f"[排程] {followee_id[:8]} 產生摘要失敗: {code or type(e).__name__}: {e}"
                )
        except Exception as e:
            stats["failed"] += 1
            summary_logger.error(
                f"[排程] {followee_id[:8]} 產生摘要失敗: {type(e).__name__}: {e}",
                exc_info=True
            )

    return stats


def trigger_now(followee_id: str, extra_follower_ids: list = None) -> dict:
    """立即產生今天的摘要並寄送通知，忽略「今天已有摘要」的去重判斷。

    供展示與手動測試使用，可重複觸發。
    DailySummaries 的主鍵是 account_id#date，`put_item` 會直接覆蓋當天既有的
    摘要，因此不需要先手動去資料庫刪除舊紀錄。

    Args:
        followee_id: 目標長輩
        extra_follower_ids: 額外要通知的對象（通常是按下按鈕的照護者本人，
            即使他沒有設定排程時間也會收到，讓展示結果可預期）

    Returns:
        {"status", "date", "facts_count", "recipients": [email...], "email_enabled"}
    """
    today = today_tw()
    date_str = today.isoformat()

    result = run_daily_summary(followee_id, today)

    # 讓排程的節流狀態與實際情況一致
    _last_attempt[(followee_id, date_str)] = time.time()

    response = {
        "status": result["status"],
        "date": date_str,
        "facts_count": result["facts_count"],
        "recipients": [],
        "email_enabled": email_enabled(),
    }

    if result["status"] != "created":
        summary_logger.info(f"[立即推播] {followee_id[:8]} {date_str} 沒有可摘要的紀錄")
        return response

    summary_logger.info(
        f"[立即推播] {followee_id[:8]} 的 {date_str} 每日摘要已產生"
        f"（facts={result['facts_count']}）"
    )

    if not email_enabled():
        return response

    # 收件人：有設排程的追蹤者 ＋ 觸發者本人
    follower_ids = list(extra_follower_ids or [])
    try:
        entry = _group_by_followee(_scan_scheduled_follows()).get(followee_id)
        if entry:
            for fid in entry["follower_ids"]:
                if fid not in follower_ids:
                    follower_ids.append(fid)
    except Exception as e:
        summary_logger.warning(
            f"[立即推播] 取得追蹤者清單失敗，僅通知觸發者: {type(e).__name__}: {e}"
        )

    elder_name = _elder_display_name(followee_id)
    response["recipients"] = _notify_followers_by_email(
        follower_ids, elder_name, date_str, result["summary"]
    )
    summary_logger.info(
        f"[立即推播] {followee_id[:8]} 已寄出 {len(response['recipients'])} 封 email"
    )
    return response


def _loop():
    mail_state = (
        f"email 通知啟用（寄件者 {Config.SES_SENDER_EMAIL}）"
        if email_enabled()
        else "email 通知未啟用（未設定 SES_SENDER_EMAIL 或 SES_ENABLED=false）"
    )
    summary_logger.info(
        f"每日摘要排程已啟動（每 {CHECK_INTERVAL_SECONDS} 秒檢查一次，時區 UTC+8）；{mail_state}"
    )
    while True:
        try:
            run_once()
        except Exception as e:
            # 最外層保險：絕不讓執行緒因為未預期的例外而死掉
            summary_logger.error(
                f"排程執行緒發生未預期錯誤: {type(e).__name__}: {e}", exc_info=True
            )
        time.sleep(CHECK_INTERVAL_SECONDS)


def start_scheduler():
    """啟動背景排程執行緒。

    重複呼叫是安全的（只會啟動一次）。
    Flask debug 模式會開兩個 process，呼叫方需自行用
    WERKZEUG_RUN_MAIN 判斷，避免排程被跑兩份。
    """
    global _thread
    with _thread_lock:
        if _thread is not None and _thread.is_alive():
            summary_logger.debug("排程執行緒已在運行，略過重複啟動")
            return _thread

        _thread = threading.Thread(
            target=_loop,
            name="daily-summary-scheduler",
            daemon=True
        )
        _thread.start()
        return _thread
