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
    BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")
    BEDROCK_REGION = os.getenv("BEDROCK_REGION", "us-east-1")

    # DynamoDB
    DYNAMODB_REGION = os.getenv("DYNAMODB_REGION", "us-east-1")

    # Frontend
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
