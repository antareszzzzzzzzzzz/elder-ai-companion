import json
import requests
from functools import wraps
from flask import request, jsonify, g
from jose import jwt, JWTError
from config import Config

# Cache JWKS keys
_jwks_cache = None


def get_jwks():
    """Fetch and cache Cognito JWKS public keys."""
    global _jwks_cache
    if _jwks_cache is None:
        response = requests.get(Config.COGNITO_JWKS_URL)
        _jwks_cache = response.json()
    return _jwks_cache


def verify_token(token: str, access_token: str = None) -> dict:
    """Verify a Cognito id_token and return claims."""
    jwks = get_jwks()

    # Get the key id from the token header
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    # Find the matching key
    key = None
    for k in jwks.get("keys", []):
        if k["kid"] == kid:
            key = k
            break

    if key is None:
        raise JWTError("Public key not found")

    # Verify the token
    decode_kwargs = {
        "algorithms": ["RS256"],
        "audience": Config.COGNITO_APP_CLIENT_ID,
        "issuer": f"https://cognito-idp.{Config.AWS_REGION}.amazonaws.com/{Config.COGNITO_USER_POOL_ID}"
    }

    if access_token:
        # 有 access_token 時（例如剛從 Cognito 換到 token 時），完整驗證 at_hash
        decode_kwargs["access_token"] = access_token
    else:
        # 日常 API 請求只有 id_token，沒有 access_token 可比對，
        # 跳過 at_hash 檢查（簽章、audience、issuer、過期時間仍然照常驗證）
        decode_kwargs["options"] = {"verify_at_hash": False}

    claims = jwt.decode(token, key, **decode_kwargs)

    return claims


def require_auth(f):
    """Decorator to require valid authentication token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid authorization header"}), 401

        token = auth_header.split(" ")[1]

        try:
            claims = verify_token(token)
            g.user_id = claims["sub"]
            g.user_email = claims.get("email", "")
        except (JWTError, Exception) as e:
            return jsonify({"error": f"Token verification failed: {str(e)}"}), 401

        return f(*args, **kwargs)

    return decorated
