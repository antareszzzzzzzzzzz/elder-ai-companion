"""
每日摘要的 email 通知（Amazon SES）。

收件地址來源：Cognito User Pool。專案的 account_id 就是 Cognito 的 sub，
所以用 sub 反查使用者的 email 屬性，不需要在 Accounts 表額外存 email。

前置條件（在 AWS Console 完成，程式不會自動處理）：
  1. SES 驗證寄件地址，並填入 .env 的 SES_SENDER_EMAIL
  2. SES 沙箱模式下，收件地址也必須先驗證過才收得到
  3. 憑證需具備 ses:SendEmail 與 cognito-idp:ListUsers（或 AdminGetUser）權限

未設定 SES_SENDER_EMAIL 時所有寄信呼叫都會直接跳過，不影響摘要產生。
"""
import re
from email.utils import formataddr

import boto3
from botocore.exceptions import ClientError

from config import Config
from services.logger import get_logger

email_logger = get_logger("email")

# Cognito sub 應為 UUID 形式；用於避免把非預期字串拼進 Cognito Filter 運算式
_SUB_PATTERN = re.compile(r"^[A-Za-z0-9\-_]+$")

# {account_id: email 或 None}；email 幾乎不會變動，快取避免每輪都打 Cognito
_email_cache: dict = {}

_ses_client = None
_cognito_client = None


def _ses():
    global _ses_client
    if _ses_client is None:
        _ses_client = boto3.client("ses", region_name=Config.SES_REGION)
    return _ses_client


def _cognito():
    global _cognito_client
    if _cognito_client is None:
        _cognito_client = boto3.client("cognito-idp", region_name=Config.AWS_REGION)
    return _cognito_client


def email_enabled() -> bool:
    """是否具備寄信的必要設定。"""
    return bool(Config.SES_ENABLED and Config.SES_SENDER_EMAIL)


def build_source() -> str:
    """組出 SES 的 Source 欄位（收件匣顯示的寄件者）。

    有設定顯示名稱時回傳 `顯示名稱 <email>`；中文等非 ASCII 字元
    必須依 RFC 2047 編碼成 `=?utf-8?b?...?=`，直接放原字會被部分
    郵件客戶端顯示成亂碼。formataddr 帶 charset 參數會處理這件事。

    未設定名稱則退回純 email，行為與原本相同。
    """
    address = Config.SES_SENDER_EMAIL
    name = Config.SES_SENDER_NAME
    if not name:
        return address
    return formataddr((name, address), charset="utf-8")


def _extract_email(attributes: list) -> str:
    """從 Cognito 的屬性清單取出 email。"""
    for attr in attributes or []:
        if attr.get("Name") == "email":
            return (attr.get("Value") or "").strip()
    return ""


def get_user_email(account_id: str) -> str:
    """用 account_id（= Cognito sub）查該使用者的 email。

    查不到或沒有權限時回空字串，呼叫方應視為「不寄信」而非錯誤。
    結果會快取，包含查不到的情況，避免每輪重複呼叫 Cognito。
    """
    if not account_id:
        return ""

    if account_id in _email_cache:
        return _email_cache[account_id] or ""

    if not _SUB_PATTERN.match(account_id):
        email_logger.warning(f"account_id 格式不符預期，略過 Cognito 查詢: {account_id[:12]}")
        _email_cache[account_id] = None
        return ""

    pool_id = Config.COGNITO_USER_POOL_ID
    if not pool_id:
        email_logger.error("COGNITO_USER_POOL_ID 未設定，無法查詢使用者 email")
        return ""

    client = _cognito()
    address = ""
    # 區分「查得到但沒有 email」與「查詢本身失敗」：
    # 前者可以快取（結果不會變），後者不能快取，否則一次暫時性的網路或
    # 憑證問題就會讓這位使用者在本次進程存活期間永遠收不到信。
    lookup_failed = False

    # 主要方式：用 sub 過濾（ListUsers 的 Filter 支援 sub）
    try:
        response = client.list_users(
            UserPoolId=pool_id,
            Filter=f'sub = "{account_id}"',
            Limit=1
        )
        users = response.get("Users", [])
        if users:
            address = _extract_email(users[0].get("Attributes", []))
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        email_logger.warning(f"ListUsers 查詢失敗（{code}），改試 AdminGetUser")
        # 備援方式：部分設定下可直接用 sub 當 Username
        try:
            response = client.admin_get_user(UserPoolId=pool_id, Username=account_id)
            address = _extract_email(response.get("UserAttributes", []))
        except ClientError as e2:
            code2 = e2.response.get("Error", {}).get("Code", "")
            lookup_failed = True
            email_logger.error(f"AdminGetUser 也失敗（{code2}），無法取得 {account_id[:8]} 的 email")
    except Exception as e:
        lookup_failed = True
        email_logger.error(f"查詢 email 發生非預期錯誤: {type(e).__name__}: {e}", exc_info=True)

    if lookup_failed:
        # 不寫入快取，下一輪會重新嘗試
        return ""

    _email_cache[account_id] = address or None
    if address:
        email_logger.debug(f"取得 {account_id[:8]} 的 email 成功")
    else:
        email_logger.info(f"{account_id[:8]} 沒有可用的 email，不寄信")
    return address


def _build_body(elder_name: str, date_str: str, summary_text: str) -> tuple:
    """組出純文字與 HTML 兩種版本的信件內容。"""
    text = (
        f"{elder_name} 的每日摘要（{date_str}）\n"
        f"{'-' * 32}\n\n"
        f"{summary_text}\n\n"
        f"{'-' * 32}\n"
        f"本信件由智慧長照陪伴系統自動寄出。\n"
        f"摘要內容由 AI 依當日對話紀錄整理，僅供生活陪伴參考，"
        f"不構成醫療診斷或治療建議。\n"
    )

    # 使用者資料一律經過轉義後才放進 HTML，避免內容被當成標籤解析
    def esc(value: str) -> str:
        return (
            str(value)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    safe_summary = esc(summary_text).replace("\n", "<br>")
    html = f"""<html><body style="font-family:'Segoe UI',sans-serif;color:#334155;line-height:1.7">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <h2 style="color:#0f766e;margin-bottom:4px">{esc(elder_name)} 的每日摘要</h2>
    <p style="color:#94a3b8;margin-top:0;font-size:14px">{esc(date_str)}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;font-size:16px">
      {safe_summary}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
      本信件由智慧長照陪伴系統自動寄出。摘要內容由 AI 依當日對話紀錄整理，
      僅供生活陪伴參考，不構成醫療診斷或治療建議。
    </p>
  </div>
</body></html>"""

    return text, html


def send_daily_summary_email(to_email: str, elder_name: str, date_str: str,
                             summary_text: str) -> bool:
    """寄出每日摘要通知信。成功回 True，跳過或失敗回 False（不拋例外）。"""
    if not email_enabled():
        return False
    if not to_email:
        return False

    subject = f"[每日摘要] {elder_name} {date_str}"
    text_body, html_body = _build_body(elder_name, date_str, summary_text)

    try:
        _ses().send_email(
            Source=build_source(),
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
        )
        email_logger.info(f"每日摘要信已寄出 → {to_email}（{elder_name} {date_str}）")
        return True

    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "MessageRejected":
            # 沙箱模式最常見的原因：收件地址尚未在 SES 驗證
            email_logger.error(
                f"SES 拒收寄往 {to_email} 的信件（MessageRejected）。"
                f"沙箱模式下收件地址必須先在 SES 驗證，寄件地址為 {Config.SES_SENDER_EMAIL}"
            )
        elif code in ("ExpiredToken", "ExpiredTokenException",
                      "InvalidClientTokenId", "UnrecognizedClientException"):
            email_logger.error(
                f"寄信失敗：AWS 憑證已失效（{code}）。請更新 backend/.env 的三個 AWS 憑證值"
            )
        elif code == "AccessDenied":
            email_logger.error("寄信失敗：目前憑證沒有 ses:SendEmail 權限")
        else:
            email_logger.error(f"寄信失敗（{code}）: {e}")
        return False

    except Exception as e:
        email_logger.error(f"寄信發生非預期錯誤: {type(e).__name__}: {e}", exc_info=True)
        return False
