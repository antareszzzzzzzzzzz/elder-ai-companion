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
"""
import os
import threading
import time
from datetime import datetime

from botocore.exceptions import ClientError

from services.dynamodb import follows_table
from services.daily_summary import (
    TW_TZ,
    today_tw,
    daily_summary_exists,
    run_daily_summary,
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


def _earliest_time_by_followee(follows: list) -> dict:
    """把追蹤記錄收斂成 {followee_id: 最早的設定時間}。"""
    result = {}
    for follow in follows:
        followee_id = follow.get("followee_id")
        scheduled = follow.get("daily_summary_time")
        if not followee_id or not scheduled:
            continue
        current = result.get(followee_id)
        if current is None or scheduled < current:
            result[followee_id] = scheduled
    return result


def _should_attempt(followee_id: str, date_str: str, now_epoch: float) -> bool:
    """距離上次嘗試是否已超過最短重試間隔。"""
    last = _last_attempt.get((followee_id, date_str))
    if last is None:
        return True
    return (now_epoch - last) >= RETRY_INTERVAL_SECONDS


def run_once() -> dict:
    """執行一輪檢查。回傳統計資訊，方便測試與除錯。

    任何單一使用者的失敗都不會中斷整輪，也不會讓執行緒死掉。
    """
    stats = {"checked": 0, "created": 0, "skipped_exists": 0, "no_facts": 0, "failed": 0}

    now = datetime.now(TW_TZ)
    now_hhmm = now.strftime("%H:%M")
    today_str = today_tw().isoformat()
    now_epoch = time.time()

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

    schedule_map = _earliest_time_by_followee(follows)

    for followee_id, scheduled in schedule_map.items():
        if not is_due(now_hhmm, scheduled):
            continue

        stats["checked"] += 1

        if daily_summary_exists(followee_id, today_str):
            stats["skipped_exists"] += 1
            continue

        if not _should_attempt(followee_id, today_str, now_epoch):
            continue

        _last_attempt[(followee_id, today_str)] = now_epoch

        try:
            result = run_daily_summary(followee_id, today_tw())
            if result["status"] == "created":
                stats["created"] += 1
                summary_logger.info(
                    f"[排程] {followee_id[:8]} 的 {today_str} 每日摘要已自動產生"
                    f"（設定時間 {scheduled}，facts={result['facts_count']}）"
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


def _loop():
    summary_logger.info(
        f"每日摘要排程已啟動（每 {CHECK_INTERVAL_SECONDS} 秒檢查一次，時區 UTC+8）"
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
