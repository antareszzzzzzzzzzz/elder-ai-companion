import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import follows_table, accounts_table

TW_TZ = timezone(timedelta(hours=8))

follow_bp = Blueprint("follow", __name__)


@follow_bp.route("/request", methods=["POST"])
@require_auth
def follow_request():
    """Send a follow request to another user.
    Requires both followee_handle and binding_code for verification."""
    data = request.get_json()
    if not data or not data.get("followee_handle"):
        return jsonify({"error": "followee_handle is required"}), 400
    if not data.get("binding_code"):
        return jsonify({"error": "binding_code is required"}), 400

    followee_handle = data["followee_handle"]
    binding_code = data["binding_code"].strip()

    # Find the followee by handle
    try:
        response = accounts_table.scan(
            FilterExpression="account_handle = :h",
            ExpressionAttributeValues={":h": followee_handle}
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404

        followee = items[0]
        followee_id = followee["account_id"]

        # Verify binding code
        stored_code = followee.get("binding_code", "")
        if not stored_code or stored_code != binding_code:
            return jsonify({"error": "綁定碼錯誤，請確認後再試"}), 403

        # Cannot follow yourself
        if followee_id == g.user_id:
            return jsonify({"error": "Cannot follow yourself"}), 400

        # Check if already following or pending
        existing = follows_table.scan(
            FilterExpression="follower_id = :fid AND followee_id = :eid AND #s <> :rejected",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":fid": g.user_id,
                ":eid": followee_id,
                ":rejected": "rejected"
            }
        )
        if existing.get("Items"):
            return jsonify({"error": "Already following or request pending"}), 409

        # Create follow request
        follow_id = str(uuid.uuid4())
        now = datetime.now(TW_TZ).isoformat()

        follows_table.put_item(Item={
            "follow_id": follow_id,
            "follower_id": g.user_id,
            "followee_id": followee_id,
            "status": "pending",
            "created_at": now
        })

        return jsonify({
            "follow_id": follow_id,
            "status": "pending",
            "followee_id": followee_id
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/approve", methods=["POST"])
@require_auth
def approve_follow():
    """Approve a pending follow request."""
    data = request.get_json()
    if not data or not data.get("follow_id"):
        return jsonify({"error": "follow_id is required"}), 400

    follow_id = data["follow_id"]

    try:
        # Get the follow record
        response = follows_table.get_item(Key={"follow_id": follow_id})
        if "Item" not in response:
            return jsonify({"error": "Follow request not found"}), 404

        item = response["Item"]

        # Only the followee can approve
        if item["followee_id"] != g.user_id:
            return jsonify({"error": "Not authorized"}), 403

        if item["status"] != "pending":
            return jsonify({"error": "Request is not pending"}), 400

        # Update status to approved
        follows_table.update_item(
            Key={"follow_id": follow_id},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "approved"}
        )

        return jsonify({"follow_id": follow_id, "status": "approved"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/reject", methods=["POST"])
@require_auth
def reject_follow():
    """Reject a pending follow request."""
    data = request.get_json()
    if not data or not data.get("follow_id"):
        return jsonify({"error": "follow_id is required"}), 400

    follow_id = data["follow_id"]

    try:
        response = follows_table.get_item(Key={"follow_id": follow_id})
        if "Item" not in response:
            return jsonify({"error": "Follow request not found"}), 404

        item = response["Item"]

        if item["followee_id"] != g.user_id:
            return jsonify({"error": "Not authorized"}), 403

        if item["status"] != "pending":
            return jsonify({"error": "Request is not pending"}), 400

        # Update status to rejected (keep record, don't delete)
        follows_table.update_item(
            Key={"follow_id": follow_id},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "rejected"}
        )

        return jsonify({"follow_id": follow_id, "status": "rejected"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/my-following", methods=["GET"])
@require_auth
def my_following():
    """Get list of accounts I'm following (approved only)."""
    try:
        response = follows_table.scan(
            FilterExpression="follower_id = :fid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":fid": g.user_id,
                ":status": "approved"
            }
        )
        items = response.get("Items", [])

        # Enrich with account info
        result = []
        for item in items:
            account_resp = accounts_table.get_item(Key={"account_id": item["followee_id"]})
            if "Item" in account_resp:
                acc = account_resp["Item"]
                result.append({
                    "follow_id": item["follow_id"],
                    "account_id": acc["account_id"],
                    "account_handle": acc.get("account_handle", ""),
                    "display_name": acc.get("display_name", ""),
                    "avatar_url": acc.get("avatar_url", "")
                })

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/my-followers", methods=["GET"])
@require_auth
def my_followers():
    """Get list of accounts following me (approved only)."""
    try:
        response = follows_table.scan(
            FilterExpression="followee_id = :eid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":eid": g.user_id,
                ":status": "approved"
            }
        )
        items = response.get("Items", [])

        result = []
        for item in items:
            account_resp = accounts_table.get_item(Key={"account_id": item["follower_id"]})
            if "Item" in account_resp:
                acc = account_resp["Item"]
                result.append({
                    "follow_id": item["follow_id"],
                    "account_id": acc["account_id"],
                    "account_handle": acc.get("account_handle", ""),
                    "display_name": acc.get("display_name", ""),
                    "avatar_url": acc.get("avatar_url", "")
                })

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/pending-requests", methods=["GET"])
@require_auth
def pending_requests():
    """Get pending follow requests for current user (as followee)."""
    try:
        response = follows_table.scan(
            FilterExpression="followee_id = :eid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":eid": g.user_id,
                ":status": "pending"
            }
        )
        items = response.get("Items", [])

        result = []
        for item in items:
            account_resp = accounts_table.get_item(Key={"account_id": item["follower_id"]})
            if "Item" in account_resp:
                acc = account_resp["Item"]
                result.append({
                    "follow_id": item["follow_id"],
                    "account_id": acc["account_id"],
                    "account_handle": acc.get("account_handle", ""),
                    "display_name": acc.get("display_name", ""),
                    "avatar_url": acc.get("avatar_url", ""),
                    "created_at": item.get("created_at", "")
                })

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/remove", methods=["POST"])
@require_auth
def remove_follow():
    """Remove a follow relationship. Either the follower or followee can remove it."""
    data = request.get_json()
    if not data or not data.get("follow_id"):
        return jsonify({"error": "follow_id is required"}), 400

    follow_id = data["follow_id"]

    try:
        response = follows_table.get_item(Key={"follow_id": follow_id})
        if "Item" not in response:
            return jsonify({"error": "Follow relationship not found"}), 404

        item = response["Item"]

        # Only follower or followee can remove
        if item["follower_id"] != g.user_id and item["followee_id"] != g.user_id:
            return jsonify({"error": "Not authorized"}), 403

        # Delete the follow record
        follows_table.delete_item(Key={"follow_id": follow_id})

        return jsonify({"follow_id": follow_id, "status": "removed"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@follow_bp.route("/my-pending-sent", methods=["GET"])
@require_auth
def my_pending_sent():
    """Get pending follow requests that I sent (as follower), not yet approved."""
    try:
        response = follows_table.scan(
            FilterExpression="follower_id = :fid AND #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":fid": g.user_id,
                ":status": "pending"
            }
        )
        items = response.get("Items", [])

        result = []
        for item in items:
            account_resp = accounts_table.get_item(Key={"account_id": item["followee_id"]})
            if "Item" in account_resp:
                acc = account_resp["Item"]
                result.append({
                    "follow_id": item["follow_id"],
                    "account_id": acc["account_id"],
                    "account_handle": acc.get("account_handle", ""),
                    "display_name": acc.get("display_name", ""),
                    "avatar_url": acc.get("avatar_url", ""),
                    "created_at": item.get("created_at", "")
                })

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
