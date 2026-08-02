from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import facts_table, daily_summaries_table, follows_table
from services.bedrock import generate_daily_summary, generate_weekly_summary
from services.daily_summary import run_daily_summary
from services.scheduler import trigger_now
from services.logger import summary_logger

summary_bp = Blueprint("summary", __name__)

TW_TZ = timezone(timedelta(hours=8))


def _check_permission(target_account_id: str) -> bool:
    """Check if current user can access target account (self or approved follower)."""
    if target_account_id == g.user_id:
        return True
    response = follows_table.scan(
        FilterExpression="follower_id = :fid AND followee_id = :eid AND #s = :status",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":fid": g.user_id,
            ":eid": target_account_id,
            ":status": "approved"
        }
    )
    return bool(response.get("Items"))


@summary_bp.route("/generate-daily/<target_account_id>", methods=["POST"])
@require_auth
def generate_daily(target_account_id):
    """Generate daily summary for a target account.
    Caller must be the account owner or an approved follower."""
    if not _check_permission(target_account_id):
        return jsonify({"error": "Permission denied"}), 403

    today = datetime.now(TW_TZ).date()
    today_str = today.isoformat()

    try:
        result = run_daily_summary(target_account_id, today)

        if result["status"] == "no_facts":
            return jsonify({"message": "今天沒有任何紀錄可以摘要", "summary": None})

        return jsonify({
            "date": result["date"],
            "summary": result["summary"],
            "summary_type": "daily",
            "facts_count": result["facts_count"]
        })

    except Exception as e:
        summary_logger.error(f"[{target_account_id[:8]}] Daily summary error: {type(e).__name__}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@summary_bp.route("/push-now/<target_account_id>", methods=["POST"])
@require_auth
def push_now(target_account_id):
    """立即產生今日摘要並寄送 email 通知（可重複觸發，供展示與測試用）。

    與排程走完全相同的程式碼路徑，差別只在忽略「今天已有摘要」的去重判斷，
    因此不需要先去資料庫刪掉當天的摘要就能重複展示。
    """
    if not _check_permission(target_account_id):
        return jsonify({"error": "Permission denied"}), 403

    try:
        result = trigger_now(target_account_id, extra_follower_ids=[g.user_id])

        if result["status"] != "created":
            return jsonify({
                "message": "今天沒有任何紀錄可以摘要，請先讓長輩與 AI 對話",
                "date": result["date"],
                "summary": None,
                "recipients": []
            })

        return jsonify({
            "date": result["date"],
            "summary_type": "daily",
            "facts_count": result["facts_count"],
            "recipients": result["recipients"],
            "email_enabled": result["email_enabled"]
        })

    except Exception as e:
        summary_logger.error(
            f"[{target_account_id[:8]}] 立即推播失敗: {type(e).__name__}: {e}",
            exc_info=True
        )
        return jsonify({"error": str(e)}), 500


@summary_bp.route("/generate-weekly/<target_account_id>", methods=["POST"])
@require_auth
def generate_weekly(target_account_id):
    """Generate weekly summary from existing daily summaries.
    Logic: if there are 7+ days of daily summaries before today, summarize last 7 days.
    Otherwise, summarize all available daily summaries before today."""
    if not _check_permission(target_account_id):
        return jsonify({"error": "Permission denied"}), 403

    today = datetime.now(TW_TZ).date()

    try:
        # Get all daily summaries for this account
        response = daily_summaries_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": target_account_id}
        )
        all_summaries = response.get("Items", [])

        # Filter: only daily type, before today
        daily_before_today = []
        for s in all_summaries:
            if s.get("summary_type", "daily") != "daily":
                continue
            try:
                s_date = datetime.fromisoformat(s["date"]).date() if 'T' in s.get("date", "") else datetime.strptime(s["date"], "%Y-%m-%d").date()
            except (ValueError, KeyError):
                continue
            if s_date <= today:
                daily_before_today.append(s)

        if not daily_before_today:
            return jsonify({"message": "沒有可用的每日摘要來產生本週總結", "summary": None})

        # Sort by date desc
        daily_before_today.sort(key=lambda x: x.get("date", ""), reverse=True)

        # Determine range: last 7 days if available, otherwise all
        seven_days_ago = today - timedelta(days=7)
        summaries_to_use = [s for s in daily_before_today if s.get("date", "") >= seven_days_ago.isoformat()]

        if not summaries_to_use:
            # Less than 7 days of data, use all available
            summaries_to_use = daily_before_today

        # Build text for Bedrock
        summaries_text = "\n".join([
            f"[{s['date']}] {s['summary_text']}" for s in sorted(summaries_to_use, key=lambda x: x.get("date", ""))
        ])

        date_range_start = min(s["date"] for s in summaries_to_use)
        date_range_end = max(s["date"] for s in summaries_to_use)

        # Call Bedrock
        weekly_text = generate_weekly_summary(summaries_text, date_range_start, date_range_end)

        # Save as weekly summary
        pk = f"{target_account_id}#week-{today.isoformat()}"
        daily_summaries_table.put_item(Item={
            "account_id#date": pk,
            "account_id": target_account_id,
            "date": today.isoformat(),
            "summary_type": "weekly",
            "summary_text": weekly_text
        })

        return jsonify({
            "date": today.isoformat(),
            "summary": weekly_text,
            "summary_type": "weekly",
            "date_range": f"{date_range_start} ~ {date_range_end}",
            "source_count": len(summaries_to_use)
        })

    except Exception as e:
        summary_logger.error(f"[{target_account_id[:8]}] Weekly summary error: {type(e).__name__}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@summary_bp.route("/daily/<target_account_id>", methods=["GET"])
@require_auth
def get_daily_summaries(target_account_id):
    """Get all summaries (daily + weekly) for a target account."""
    if not _check_permission(target_account_id):
        return jsonify({"error": "Permission denied"}), 403

    try:
        response = daily_summaries_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": target_account_id}
        )
        items = response.get("Items", [])
        items.sort(key=lambda x: x.get("date", ""), reverse=True)
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
