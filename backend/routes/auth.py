import requests
import base64
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, redirect
from config import Config
from services.dynamodb import accounts_table
from middleware.auth import require_auth, verify_token
from services.logger import auth_logger
from flask import g

TW_TZ = timezone(timedelta(hours=8))

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET"])
def login():
    """Redirect to Cognito Hosted UI for login."""
    cognito_login_url = (
        f"https://{Config.COGNITO_DOMAIN}/login?"
        f"client_id={Config.COGNITO_APP_CLIENT_ID}&"
        f"response_type=code&"
        f"scope=openid+email+profile&"
        f"redirect_uri={Config.COGNITO_REDIRECT_URI}"
    )
    return jsonify({"login_url": cognito_login_url})


@auth_bp.route("/callback", methods=["GET"])
def callback():
    """Handle Cognito OAuth callback, exchange code for tokens."""
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "Missing authorization code"}), 400

    # Exchange code for tokens
    token_url = f"https://{Config.COGNITO_DOMAIN}/oauth2/token"

    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    data = {
        "grant_type": "authorization_code",
        "client_id": Config.COGNITO_APP_CLIENT_ID,
        "code": code,
        "redirect_uri": Config.COGNITO_REDIRECT_URI
    }

    # 只有在真的設定了 Client Secret 時才加上 Basic Auth
    # SPA 類型的 App Client（如本專案）通常沒有 secret
    if Config.COGNITO_APP_CLIENT_SECRET:
        auth_string = f"{Config.COGNITO_APP_CLIENT_ID}:{Config.COGNITO_APP_CLIENT_SECRET}"
        auth_header = base64.b64encode(auth_string.encode()).decode()
        headers["Authorization"] = f"Basic {auth_header}"

    response = requests.post(token_url, headers=headers, data=data)

    if response.status_code != 200:
        auth_logger.error(f"Cognito token exchange failed: HTTP {response.status_code} — {response.text[:300]}")
        return jsonify({"error": "Token exchange failed", "detail": response.text}), 400

    tokens = response.json()
    id_token = tokens.get("id_token")

    # Verify and decode the id_token
    try:
        claims = verify_token(id_token, access_token=tokens.get("access_token"))
    except Exception as e:
        return jsonify({"error": f"Token verification failed: {str(e)}"}), 400

    user_sub = claims["sub"]
    email = claims.get("email", "")

    # Check if account exists, create if first login
    try:
        existing = accounts_table.get_item(Key={"account_id": user_sub})
        if "Item" not in existing:
            # First login: create new account record
            auth_logger.info(f"First login for user {user_sub[:8]}, creating account")
            accounts_table.put_item(Item={
                "account_id": user_sub,
                "account_handle": email.split("@")[0] if email else user_sub[:8],
                "display_name": email.split("@")[0] if email else "新使用者",
                "avatar_url": "",
                "age": None,
                "gender": None,
                "birth": "",
                "height": "",
                "weight": "",
                "chronic_conditions": "[]",
                "current_medications": "[]",
                "allergies": "[]",
                "interaction_count": 0,
                "role": "elderly",
                "binding_code": str(100000 + __import__('random').randint(0, 899999)),
                "consent_given": False,
                "consent_timestamp": "",
                "personal_notes": "",
                "created_at": datetime.now(TW_TZ).isoformat()
            })
        else:
            auth_logger.info(f"Returning user {user_sub[:8]} logged in")
    except Exception as e:
        auth_logger.error(f"DynamoDB error on account creation: {type(e).__name__}: {e}", exc_info=True)

    # Redirect to frontend with tokens
    frontend_url = Config.FRONTEND_URL
    redirect_url = (
        f"{frontend_url}/auth/callback?"
        f"id_token={id_token}&"
        f"access_token={tokens.get('access_token', '')}&"
        f"refresh_token={tokens.get('refresh_token', '')}"
    )
    return redirect(redirect_url)


@auth_bp.route("/me", methods=["GET"])
@require_auth
def get_me():
    """Get current user's account info."""
    try:
        response = accounts_table.get_item(Key={"account_id": g.user_id})
        if "Item" not in response:
            return jsonify({"error": "Account not found"}), 404
        return jsonify(response["Item"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Return Cognito logout URL."""
    logout_url = (
        f"https://{Config.COGNITO_DOMAIN}/logout?"
        f"client_id={Config.COGNITO_APP_CLIENT_ID}&"
        f"logout_uri={Config.FRONTEND_URL}"
    )
    return jsonify({"logout_url": logout_url})
