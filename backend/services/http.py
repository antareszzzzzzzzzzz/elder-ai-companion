"""
帶自動重試的 HTTP session。

某些網路環境（防毒/防火牆的 TLS 檢查、校園網路）會間歇性地
把 HTTPS 連線 reset（WinError 10054），造成 Cognito token 交換
或 JWKS 取得隨機失敗。這裡統一提供會自動重試的 session。
"""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 連線層級的重試：connect/read 失敗（含 ConnectionReset）都會重試
_retry = Retry(
    total=5,
    connect=5,
    read=3,
    backoff_factor=0.5,  # 0.5s, 1s, 2s, 4s...
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=frozenset(["GET", "POST"]),
    raise_on_status=False,
)

_adapter = HTTPAdapter(max_retries=_retry, pool_connections=10, pool_maxsize=10)

session = requests.Session()
session.mount("https://", _adapter)
session.mount("http://", _adapter)

# 預設 timeout（秒）：連線 5s / 讀取 15s
DEFAULT_TIMEOUT = (5, 15)
