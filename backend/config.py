import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # AWS
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

    # Cognito
    COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
    COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")
    COGNITO_APP_CLIENT_SECRET = os.getenv("COGNITO_APP_CLIENT_SECRET")
    COGNITO_DOMAIN = os.getenv("COGNITO_DOMAIN")
    COGNITO_REDIRECT_URI = os.getenv("COGNITO_REDIRECT_URI", "http://localhost:5000/api/auth/callback")
    COGNITO_JWKS_URL = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

    # Bedrock
    BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
    BEDROCK_REGION = os.getenv("BEDROCK_REGION", "us-east-1")

    # DynamoDB
    DYNAMODB_REGION = os.getenv("DYNAMODB_REGION", "us-east-1")

    # SES（每日摘要 email 通知）
    # SES_SENDER_EMAIL 必須是已在 SES 驗證過的寄件地址，未設定則不寄信。
    # 沙箱模式下收件地址也必須先驗證。
    SES_SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL", "").strip()
    # 收件匣上顯示的寄件者名稱（非 ASCII 會自動做 RFC 2047 編碼）
    SES_SENDER_NAME = os.getenv("SES_SENDER_NAME", "智慧長照陪伴系統").strip()
    SES_REGION = os.getenv("SES_REGION", AWS_REGION)
    # 設成 "false" 可在不動 SES_SENDER_EMAIL 的情況下暫時停用寄信
    SES_ENABLED = os.getenv("SES_ENABLED", "true").strip().lower() != "false"

    # Frontend
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
