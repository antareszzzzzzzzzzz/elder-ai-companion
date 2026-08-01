"""照護者關懷事項 API

照護者可以為已追蹤的長輩新增「關懷事項」，
這些事項會寫入 Facts 表（category='其他', source='caregiver'），
AI 在與長輩對話時會根據 track 欄位主動提醒長輩。

- track=True 且 source='caregiver'：需要長輩回應確認後才由 LLM 將 track 設為 False
- track=False 且 source='caregiver'：AI 提醒一次後即由 LLM 將 track 設為 False（標記已完成）
"""

import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import facts_table, follows_table
from services.logger import app_logger

care_items_bp = Blueprint("care_items", __name__)

TW_TZ = timezone(timedelta(hours=8))


def _now_tw() -> str:
    return datetime.now(TW_TZ).isoformat()


def _is_approved_follower(follower_id: str, followee_id: str) -> bool:
    """Check if follower_id has an approved follow relationship to followee_id."""
    response = follows_table.scan(
        FilterExpression="follower_id = :fid AND followee_id = :eid AND #s = :status",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":fid": follower_id,
            ":eid": followee_id,
            ":status": "approved"
        }
    )
    return bool(response.get("Items"))


@care_items_bp.route("/<target_account_id>", methods=["GET"])
@require_auth
def get_care_items(target_account_id):
    """取得照護者為某位長輩設定的所有關懷事項。
    權限：必須是本人或 approved follower。"""

    if target_account_id != g.user_id:
        if not _is_approved_follower(g.user_id, target_account_id):
            return jsonify({"error": "Permission denied"}), 403

    try:
        response = facts_table.scan(
            FilterExpression="account_id = :aid AND #src = :src",
            ExpressionAttributeNames={"#src": "source"},
            ExpressionAttributeValues={
                ":aid": target_account_id,
                ":src": "caregiver"
            }
        )
        items = response.get("Items", [])
        # Sort by updated_at descending
        items.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

        return jsonify(items)

    except Exception as e:
        app_logger.error(f"get_care_items error: {e}")
        return jsonify({"error": str(e)}), 500


@care_items_bp.route("/<target_account_id>", methods=["POST"])
@require_auth
def add_care_item(target_account_id):
    """照護者為長輩新增一筆關懷事項。
    寫入 Facts 表：category='其他', source='caregiver'。
    Request body: { "content": "要提醒的內容", "track": true/false }
    """

    if not _is_approved_follower(g.user_id, target_account_id):
        return jsonify({"error": "Permission denied: not an approved follower"}), 403

    data = request.get_json()
    if not data or not data.get("content"):
        return jsonify({"error": "content is required"}), 400

    content = data["content"].strip()
    if not content:
        return jsonify({"error": "content cannot be empty"}), 400

    # track: True = 需要長輩回應確認，False = 提醒一次即可
    track_flag = bool(data.get("track", True))

    fact_id = str(uuid.uuid4())
    now = _now_tw()

    try:
        facts_table.put_item(Item={
            "fact_id": fact_id,
            "account_id": target_account_id,
            "category": "其他",
            "content": content,
            "track": True,  # 新建時一律 track=True，讓 AI 提醒
            "source": "caregiver",
            "source_account_id": g.user_id,
            "require_confirmation": track_flag,  # 是否需要長輩確認才結束
            "updated_at": now
        })

        app_logger.info(f"Care item added: {fact_id[:8]} for {target_account_id[:8]} by {g.user_id[:8]}")

        return jsonify({
            "fact_id": fact_id,
            "account_id": target_account_id,
            "category": "其他",
            "content": content,
            "track": True,
            "source": "caregiver",
            "source_account_id": g.user_id,
            "require_confirmation": track_flag,
            "updated_at": now
        }), 201

    except Exception as e:
        app_logger.error(f"add_care_item error: {e}")
        return jsonify({"error": str(e)}), 500


@care_items_bp.route("/<target_account_id>/<fact_id>", methods=["DELETE"])
@require_auth
def delete_care_item(target_account_id, fact_id):
    """照護者刪除一筆關懷事項。刪除前先把 track 設為 False（停止提醒）再刪除。
    權限：必須是建立者本人（source_account_id 匹配）。"""

    try:
        response = facts_table.get_item(Key={"fact_id": fact_id})
        if "Item" not in response:
            return jsonify({"error": "Care item not found"}), 404

        item = response["Item"]

        # 確認是照護者建立的
        if item.get("source") != "caregiver":
            return jsonify({"error": "Not a caregiver care item"}), 400

        # 確認權限：必須是建立者或被照護的長輩本人
        if item.get("source_account_id") != g.user_id and item.get("account_id") != g.user_id:
            return jsonify({"error": "Permission denied"}), 403

        # 刪除
        facts_table.delete_item(Key={"fact_id": fact_id})
        app_logger.info(f"Care item deleted: {fact_id[:8]} by {g.user_id[:8]}")

        return jsonify({"fact_id": fact_id, "status": "deleted"})

    except Exception as e:
        app_logger.error(f"delete_care_item error: {e}")
        return jsonify({"error": str(e)}), 500


@care_items_bp.route("/<target_account_id>/<fact_id>/track", methods=["PUT"])
@require_auth
def update_care_item_track(target_account_id, fact_id):
    """照護者手動更新關懷事項的追蹤狀態（例如手動標記為已完成/停止提醒）。
    Request body: { "track": false }
    """

    try:
        response = facts_table.get_item(Key={"fact_id": fact_id})
        if "Item" not in response:
            return jsonify({"error": "Care item not found"}), 404

        item = response["Item"]

        if item.get("source") != "caregiver":
            return jsonify({"error": "Not a caregiver care item"}), 400

        # 權限：建立者或長輩本人
        if item.get("source_account_id") != g.user_id and item.get("account_id") != g.user_id:
            return jsonify({"error": "Permission denied"}), 403

        data = request.get_json()
        if data is None or "track" not in data:
            return jsonify({"error": "track field is required"}), 400

        track_flag = bool(data["track"])
        now = _now_tw()

        facts_table.update_item(
            Key={"fact_id": fact_id},
            UpdateExpression="SET track = :t, updated_at = :u",
            ExpressionAttributeValues={
                ":t": track_flag,
                ":u": now
            }
        )

        app_logger.info(f"Care item track updated: {fact_id[:8]} track={track_flag}")

        return jsonify({
            "fact_id": fact_id,
            "track": track_flag,
            "updated_at": now
        })

    except Exception as e:
        app_logger.error(f"update_care_item_track error: {e}")
        return jsonify({"error": str(e)}), 500
