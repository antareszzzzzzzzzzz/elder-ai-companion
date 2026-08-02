import json
import random
import string
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import accounts_table

profile_bp = Blueprint("profile", __name__)


def _generate_binding_code() -> str:
    """Generate a random 6-digit binding code."""
    return ''.join(random.choices(string.digits, k=6))


def _normalize_chronic_conditions(value) -> str:
    """Validate chronic conditions and store them as a normalized JSON string."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("chronic_conditions must be a valid JSON array") from exc

    if not isinstance(value, list):
        raise ValueError("chronic_conditions must be an array")
    if len(value) > 20:
        raise ValueError("chronic_conditions cannot contain more than 20 items")

    normalized = []
    for condition in value:
        if not isinstance(condition, str):
            raise ValueError("each chronic condition must be a string")
        condition = condition.strip()
        if not condition:
            continue
        if len(condition) > 100:
            raise ValueError("each chronic condition must be 100 characters or fewer")
        if condition not in normalized:
            normalized.append(condition)

    return json.dumps(normalized, ensure_ascii=False)


@profile_bp.route("/", methods=["GET"])
@require_auth
def get_profile():
    """Get current user's profile."""
    try:
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        if "Item" not in response:
            return jsonify({"error": "Profile not found"}), 404
        profile = response["Item"]
        # Backward compatibility for accounts created before these fields existed.
        profile.setdefault("gender", None)
        profile.setdefault("chronic_conditions", "[]")
        return jsonify(profile)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/", methods=["PUT"])
@require_auth
def update_profile():
    """Update current user's profile."""
    data = request.get_json()
    if not isinstance(data, dict) or not data:
        return jsonify({"error": "No data provided"}), 400

    try:
        if "chronic_conditions" in data:
            data["chronic_conditions"] = _normalize_chronic_conditions(
                data["chronic_conditions"]
            )

        if "gender" in data:
            gender = data["gender"]
            if gender is not None and not isinstance(gender, str):
                raise ValueError("gender must be a string or null")
            if isinstance(gender, str):
                gender = gender.strip() or None
                if gender and len(gender) > 50:
                    raise ValueError("gender must be 50 characters or fewer")
            data["gender"] = gender
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    # Allowed fields to update
    allowed_fields = [
        "display_name", "account_handle", "avatar_url",
        "age", "gender", "chronic_conditions",
        "current_medications", "allergies",
        "binding_code", "birth", "height", "weight"
    ]

    update_expr_parts = []
    expr_attr_values = {}

    for field in allowed_fields:
        if field in data:
            value = data[field]
            # Ensure JSON string fields are stored as strings
            if field in ["chronic_conditions", "current_medications", "allergies"]:
                if isinstance(value, (list, dict)):
                    value = json.dumps(value, ensure_ascii=False)
            update_expr_parts.append(f"{field} = :{field}")
            expr_attr_values[f":{field}"] = value

    if not update_expr_parts:
        return jsonify({"error": "No valid fields to update"}), 400

    update_expression = "SET " + ", ".join(update_expr_parts)

    try:
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expr_attr_values
        )
        # Return updated profile
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        return jsonify(response["Item"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/search", methods=["GET"])
@require_auth
def search_user():
    """Search user by account_handle."""
    handle = request.args.get("handle")
    if not handle:
        return jsonify({"error": "handle parameter is required"}), 400

    try:
        response = accounts_table.scan(
            FilterExpression="account_handle = :h",
            ExpressionAttributeValues={":h": handle}
        )
        items = response.get("Items", [])
        # Return limited info for privacy
        results = [{
            "account_id": item["account_id"],
            "account_handle": item["account_handle"],
            "display_name": item.get("display_name", ""),
            "avatar_url": item.get("avatar_url", "")
        } for item in items]
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/role", methods=["PUT"])
@require_auth
def update_role():
    """Update current user's role (elderly or caregiver)."""
    data = request.get_json()
    if not data or not data.get("role"):
        return jsonify({"error": "role is required"}), 400

    role = data["role"]
    if role not in ("elderly", "caregiver"):
        return jsonify({"error": "role must be 'elderly' or 'caregiver'"}), 400

    try:
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression="SET #r = :role",
            ExpressionAttributeNames={"#r": "role"},
            ExpressionAttributeValues={":role": role}
        )
        # Return updated profile
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        return jsonify(response["Item"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/binding-code", methods=["PUT"])
@require_auth
def update_binding_code():
    """Update or regenerate current user's binding code.
    If 'code' is provided in body, use that (custom code).
    Otherwise, generate a random 6-digit code."""
    data = request.get_json() or {}
    code = data.get("code", "").strip()

    # Validate custom code: must be exactly 6 digits
    if code:
        if len(code) != 6 or not code.isdigit():
            return jsonify({"error": "Binding code must be exactly 6 digits"}), 400
    else:
        code = _generate_binding_code()

    try:
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression="SET binding_code = :code",
            ExpressionAttributeValues={":code": code}
        )
        # Return updated profile
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        return jsonify(response["Item"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/binding-code", methods=["GET"])
@require_auth
def get_binding_code():
    """Get current user's binding code. Generate one if not exists."""
    try:
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        if "Item" not in response:
            return jsonify({"error": "Account not found"}), 404

        item = response["Item"]
        code = item.get("binding_code")

        if not code:
            # Auto-generate if none exists
            code = _generate_binding_code()
            accounts_table.update_item(
                Key={"account_id": g.user_id},
                UpdateExpression="SET binding_code = :code",
                ExpressionAttributeValues={":code": code}
            )

        return jsonify({"binding_code": code})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/consent", methods=["POST"])
@require_auth
def give_consent():
    """Record user's consent to data collection and usage."""
    from datetime import datetime

    now = datetime.utcnow().isoformat() + "Z"

    try:
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression="SET consent_given = :cg, consent_timestamp = :ct",
            ExpressionAttributeValues={
                ":cg": True,
                ":ct": now
            }
        )
        return jsonify({"consent_given": True, "consent_timestamp": now})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/notes", methods=["PUT"])
@require_auth
def update_personal_notes():
    """Update current user's personal notes (free-text, user-edited only)."""
    data = request.get_json()
    if data is None or "personal_notes" not in data:
        return jsonify({"error": "personal_notes is required"}), 400

    personal_notes = data["personal_notes"]

    try:
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression="SET personal_notes = :pn",
            ExpressionAttributeValues={":pn": personal_notes}
        )
        return jsonify({"personal_notes": personal_notes})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
