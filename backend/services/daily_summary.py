"""
每日摘要的核心產生邏輯（不依賴 Flask request context）。

抽出的目的：讓 HTTP 路由（routes/summary.py）與背景排程執行緒
（services/scheduler.py）共用同一份邏輯。背景執行緒沒有 request
context，不能使用 g.user_id，也不能直接呼叫路由函式。

行為與原本 routes/summary.py 的 generate_daily 完全一致，
只是把「權限檢查」留在路由層，這裡只負責產生與寫入。
"""
from datetime import datetime, timezone, timedelta, date as date_type

from services.dynamodb import facts_table, daily_summaries_table
from services.bedrock import generate_daily_summary
from services.logger import summary_logger

TW_TZ = timezone(timedelta(hours=8))


def today_tw() -> date_type:
    """今天的日期（台灣時區 UTC+8）。"""
    return datetime.now(TW_TZ).date()


def daily_summary_exists(account_id: str, date_str: str) -> bool:
    """檢查某帳號在某日期是否已經產生過每日摘要。

    用於排程去重與補跑判斷：只要今天已經有摘要就不再重複產生。
    """
    pk = f"{account_id}#{date_str}"
    try:
        response = daily_summaries_table.get_item(Key={"account_id#date": pk})
        return "Item" in response
    except Exception as e:
        summary_logger.error(
            f"[{account_id[:8]}] 檢查摘要是否存在失敗: {type(e).__name__}: {e}",
            exc_info=True
        )
        # 查不到就當成不存在，交給上層決定是否嘗試產生
        return False


def run_daily_summary(account_id: str, target_date: date_type = None) -> dict:
    """產生並寫入某帳號指定日期的每日摘要。

    Args:
        account_id: 目標帳號（被追蹤者）
        target_date: 目標日期，預設今天（台灣時區）

    Returns:
        成功：{"status": "created", "date", "summary", "facts_count"}
        當天沒有紀錄：{"status": "no_facts", "date", "summary": None, "facts_count": 0}

    Raises:
        任何 DynamoDB / Bedrock 的例外都會往上拋，由呼叫方決定如何處理。
    """
    if target_date is None:
        target_date = today_tw()
    date_str = target_date.isoformat()

    # 撈該帳號全部事實卡（維持既有 scan + FilterExpression 設計）
    response = facts_table.scan(
        FilterExpression="account_id = :aid",
        ExpressionAttributeValues={":aid": account_id}
    )
    all_facts = response.get("Items", [])
    summary_logger.info(
        f"[{account_id[:8]}] 產生 {date_str} 每日摘要，total facts={len(all_facts)}"
    )

    # 篩出目標日期當天更新的事實卡
    target_facts = []
    for fact in all_facts:
        updated_at = fact.get("updated_at", "")
        try:
            fact_date = datetime.fromisoformat(updated_at).date()
            if fact_date == target_date:
                target_facts.append(fact)
        except (ValueError, AttributeError):
            continue

    if not target_facts:
        summary_logger.info(f"[{account_id[:8]}] {date_str} 沒有可摘要的紀錄")
        return {
            "status": "no_facts",
            "date": date_str,
            "summary": None,
            "facts_count": 0
        }

    # 依 category 分組
    facts_by_category = {}
    for fact in target_facts:
        category = fact.get("category", "其他")
        facts_by_category.setdefault(category, []).append(fact)

    # 呼叫 Bedrock 產生摘要
    summary_text = generate_daily_summary(facts_by_category, date_str)

    # 寫入 DailySummaries
    pk = f"{account_id}#{date_str}"
    daily_summaries_table.put_item(Item={
        "account_id#date": pk,
        "account_id": account_id,
        "date": date_str,
        "summary_type": "daily",
        "summary_text": summary_text
    })

    summary_logger.info(
        f"[{account_id[:8]}] {date_str} 每日摘要已寫入，facts_count={len(target_facts)}"
    )

    return {
        "status": "created",
        "date": date_str,
        "summary": summary_text,
        "facts_count": len(target_facts)
    }
