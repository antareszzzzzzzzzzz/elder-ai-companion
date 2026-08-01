from datetime import datetime, timedelta, timezone
from collections import defaultdict
from flask import Blueprint, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import facts_table, follows_table, accounts_table, daily_summaries_table
from services.bedrock import generate_cross_day_insights

health_overview_bp = Blueprint("health_overview", __name__)

TW_TZ = timezone(timedelta(hours=8))


@health_overview_bp.route("/<target_account_id>", methods=["GET"])
@require_auth
def get_health_overview(target_account_id):
    """Get health overview for a target account.
    Requires approved follow relationship or self."""

    # Permission check: must be self or approved follower
    if target_account_id != g.user_id:
        response = follows_table.scan(
            FilterExpression="follower_id = :fid AND followee_id = :eid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":fid": g.user_id,
                ":eid": target_account_id,
                ":status": "approved"
            }
        )
        if not response.get("Items"):
            return jsonify({"error": "Permission denied: not an approved follower"}), 403

    try:
        # Get account info (for interaction_count)
        account_resp = accounts_table.get_item(Key={"account_id": target_account_id})
        if "Item" not in account_resp:
            return jsonify({"error": "Account not found"}), 404
        account = account_resp["Item"]

        # Get all facts for this account
        facts_resp = facts_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": target_account_id}
        )
        all_facts = facts_resp.get("Items", [])

        # Get daily summaries
        summaries_resp = daily_summaries_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": target_account_id}
        )
        summaries = summaries_resp.get("Items", [])
        summaries.sort(key=lambda x: x.get("date", ""), reverse=True)

        # Filter facts by category for health view
        medication_facts = [f for f in all_facts if f.get("category") == "用藥"]
        body_facts = [f for f in all_facts if f.get("category") in ["身體", "睡眠", "活動"]]
        diet_facts = [f for f in all_facts if f.get("category") == "飲食"]
        mood_facts = [f for f in all_facts if f.get("category") == "情緒"]
        other_facts = [f for f in all_facts if f.get("category") == "其他"]

        # Sort by updated_at descending
        medication_facts.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        body_facts.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        diet_facts.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        mood_facts.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        other_facts.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

        return jsonify({
            "account_id": target_account_id,
            "display_name": account.get("display_name", ""),
            "interaction_count": account.get("interaction_count", 0),
            "daily_summaries": summaries[:14],  # Last 14 days
            "medication_facts": medication_facts[:20],
            "body_facts": body_facts[:20],
            "diet_facts": diet_facts[:20],
            "mood_facts": mood_facts[:20],
            "other_facts": other_facts[:20],
            "cross_day_insights": None  # Will be populated by generate endpoint
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@health_overview_bp.route("/<target_account_id>/insights", methods=["POST"])
@require_auth
def generate_insights(target_account_id):
    """Generate cross-day insights for a target account.
    Looks at last 7 days of facts for repeated patterns."""

    # Permission check
    if target_account_id != g.user_id:
        response = follows_table.scan(
            FilterExpression="follower_id = :fid AND followee_id = :eid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":fid": g.user_id,
                ":eid": target_account_id,
                ":status": "approved"
            }
        )
        if not response.get("Items"):
            return jsonify({"error": "Permission denied"}), 403

    try:
        # Get all facts for this account
        facts_resp = facts_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": target_account_id}
        )
        all_facts = facts_resp.get("Items", [])

        # Filter to last 7 days
        seven_days_ago = datetime.now(TW_TZ) - timedelta(days=7)
        recent_facts = []
        for fact in all_facts:
            try:
                fact_time = datetime.fromisoformat(fact["updated_at"])
                if fact_time.replace(tzinfo=None) >= seven_days_ago.replace(tzinfo=None):
                    recent_facts.append(fact)
            except (ValueError, KeyError):
                continue

        if not recent_facts:
            return jsonify({"insights": None, "message": "最近 7 天沒有紀錄"})

        # Group by category and find repeated patterns
        category_days = defaultdict(lambda: defaultdict(list))
        for fact in recent_facts:
            category = fact.get("category", "其他")
            try:
                fact_date = datetime.fromisoformat(fact["updated_at"]).date().isoformat()
            except (ValueError, KeyError):
                continue
            category_days[category][fact_date].append(fact["content"])

        # Find candidates: same category appearing on 3+ different days
        candidate_patterns = []
        for category, days_map in category_days.items():
            if len(days_map) >= 3:
                # Collect all contents for this category
                all_contents = []
                for day_contents in days_map.values():
                    all_contents.extend(day_contents)
                candidate_patterns.append({
                    "category": category,
                    "count": len(days_map),
                    "contents": "; ".join(all_contents[:5])  # Limit for prompt size
                })

        if not candidate_patterns:
            return jsonify({"insights": None, "message": "未發現重複模式"})

        # Call Bedrock to generate insights
        insights_text = generate_cross_day_insights(candidate_patterns)

        if not insights_text:
            return jsonify({"insights": None, "message": "未發現有意義的重複模式"})

        return jsonify({
            "insights": insights_text,
            "patterns_found": len(candidate_patterns)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
