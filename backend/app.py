import os
from flask import Flask, request as flask_request
from flask_cors import CORS
from config import Config
from services.logger import app_logger
from services.scheduler import start_scheduler
from routes.auth import auth_bp
from routes.chat import chat_bp
from routes.profile import profile_bp
from routes.follow import follow_bp
from routes.summary import summary_bp
from routes.health_overview import health_overview_bp
from routes.care_items import care_items_bp

app = Flask(__name__)
app.config.from_object(Config)
CORS(app, origins=[Config.FRONTEND_URL], supports_credentials=True)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(chat_bp, url_prefix="/api/chat")
app.register_blueprint(profile_bp, url_prefix="/api/profile")
app.register_blueprint(follow_bp, url_prefix="/api/follow")
app.register_blueprint(summary_bp, url_prefix="/api/summary")
app.register_blueprint(health_overview_bp, url_prefix="/api/health-overview")
app.register_blueprint(care_items_bp, url_prefix="/api/care-items")


@app.before_request
def log_request():
    """Log every incoming request."""
    app_logger.info(f"→ {flask_request.method} {flask_request.path} from {flask_request.remote_addr}")


@app.after_request
def log_response(response):
    """Log response status."""
    app_logger.info(f"← {response.status_code} {flask_request.method} {flask_request.path}")
    return response


@app.route("/api/health", methods=["GET"])
def health_check():
    return {"status": "ok"}, 200


DEBUG_MODE = True

if __name__ == "__main__":
    app_logger.info("=== Elder Care AI Backend starting on port 5000 ===")

    # Flask debug 的自動重載會開兩個 process（父進程負責監看檔案、子進程實際提供服務）。
    # 排程只能在實際提供服務的那個 process 啟動，否則同一天的摘要會被產生兩次。
    # 子進程的環境變數會帶 WERKZEUG_RUN_MAIN=true。
    is_serving_process = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if is_serving_process or not DEBUG_MODE:
        start_scheduler()

    app.run(debug=DEBUG_MODE, port=5000)
