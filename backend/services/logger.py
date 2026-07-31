"""
Centralized logging configuration for the Elder Care AI backend.

Log files are stored in backend/logs/ directory:
  - app.log         : All logs (DEBUG and above)
  - error.log       : ERROR and CRITICAL only
  - bedrock.log     : Bedrock AI calls (request/response tracking)
  - chat.log        : Chat endpoint activity

Logs also print to console (INFO and above) for development convenience.
"""
import os
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Create logs directory
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Common format
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _create_file_handler(filename, level=logging.DEBUG, max_bytes=5*1024*1024, backup_count=5):
    """Create a rotating file handler."""
    path = os.path.join(LOG_DIR, filename)
    handler = RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8")
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    return handler


def _create_console_handler(level=logging.INFO):
    """Create a console handler."""
    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    return handler


def get_logger(name: str) -> logging.Logger:
    """Get a configured logger by name.

    Args:
        name: Logger name (typically module name like 'chat', 'bedrock', 'auth')

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(f"eldercare.{name}")

    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    # All logs → app.log
    logger.addHandler(_create_file_handler("app.log", level=logging.DEBUG))

    # Errors only → error.log
    logger.addHandler(_create_file_handler("error.log", level=logging.ERROR))

    # Console output
    logger.addHandler(_create_console_handler(level=logging.INFO))

    # Module-specific log files for key modules
    if name in ("bedrock", "chat", "auth", "stt"):
        logger.addHandler(_create_file_handler(f"{name}.log", level=logging.DEBUG))

    return logger


# Pre-configured loggers for common modules
app_logger = get_logger("app")
chat_logger = get_logger("chat")
bedrock_logger = get_logger("bedrock")
auth_logger = get_logger("auth")
follow_logger = get_logger("follow")
polly_logger = get_logger("polly")
knowledge_logger = get_logger("knowledge")
summary_logger = get_logger("summary")
dynamo_logger = get_logger("dynamodb")
