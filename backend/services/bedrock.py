import json
import boto3
from config import Config
from services.logger import bedrock_logger

bedrock_runtime = boto3.client(
    "bedrock-runtime",
    region_name=Config.BEDROCK_REGION
)

VALID_CATEGORIES = ["飲食", "活動", "睡眠", "用藥", "身體", "情緒", "其他"]


def invoke_bedrock(system_prompt: str, user_message: str, max_tokens: int = 2048) -> str:
    """Invoke Bedrock model with system prompt and user message."""
    model_id = Config.BEDROCK_MODEL_ID
    bedrock_logger.info(f"Invoking model={model_id}, max_tokens={max_tokens}, user_msg_len={len(user_message)}")
    bedrock_logger.debug(f"System prompt (first 200 chars): {system_prompt[:200]}...")
    bedrock_logger.debug(f"User message: {user_message[:300]}")

    # Build request body based on model type
    if "nova" in model_id.lower():
        body = json.dumps({
            "schemaVersion": "messages-v1",
            "messages": [
                {"role": "user", "content": [{"text": user_message}]}
            ],
            "system": [{"text": system_prompt}],
            "inferenceConfig": {
                "maxTokens": max_tokens,
                "temperature": 0.7
            }
        })
    elif "anthropic" in model_id.lower() or "claude" in model_id.lower():
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_message}
            ],
            "temperature": 0.7
        })
    else:
        # Fallback to Nova format
        body = json.dumps({
            "schemaVersion": "messages-v1",
            "messages": [
                {"role": "user", "content": [{"text": user_message}]}
            ],
            "system": [{"text": system_prompt}],
            "inferenceConfig": {
                "maxTokens": max_tokens,
                "temperature": 0.7
            }
        })

    response = bedrock_runtime.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=body
    )

    response_body = json.loads(response["body"].read())
    bedrock_logger.debug(f"Raw response keys: {list(response_body.keys())}")

    # Parse response based on model type
    if "nova" in model_id.lower():
        result_text = response_body["output"]["message"]["content"][0]["text"]
    elif "anthropic" in model_id.lower() or "claude" in model_id.lower():
        result_text = response_body["content"][0]["text"]
    else:
        # Try Nova format first
        try:
            result_text = response_body["output"]["message"]["content"][0]["text"]
        except (KeyError, IndexError):
            result_text = response_body["content"][0]["text"]

    bedrock_logger.info(f"Bedrock response received, length={len(result_text)}")
    bedrock_logger.debug(f"Response (first 200 chars): {result_text[:200]}")
    return result_text


def generate_chat_response(facts: list, user_message: str, current_time: str,
                           knowledge_context: str = None, profile: dict = None) -> str:
    """Generate AI chat response with memory context and optional knowledge base."""
    from datetime import datetime as dt

    facts_text = ""
    tracking_text = ""
    if facts:
        today_date = dt.fromisoformat(current_time).date()

        today_items = []
        earlier_items = []
        tracking_items = []
        for f in facts:
            try:
                f_date = dt.fromisoformat(f['updated_at'].replace("Z", "+00:00")).date()
            except (ValueError, KeyError):
                f_date = None
            line = f"- [{f['category']}] {f['content']} (記錄於 {f['updated_at']})"

            # track=true 的事實卡另外收集，準備放進獨立的待追蹤區塊
            if f.get("track"):
                tracking_items.append(line)

            if f_date == today_date:
                today_items.append(line)
            else:
                earlier_items.append(line)

        parts = []
        if today_items:
            parts.append("【今天已記錄的事】\n" + "\n".join(today_items))
        if earlier_items:
            parts.append("【較早之前記錄的事，僅供參考背景，不代表使用者現在正在講這些】\n" + "\n".join(earlier_items))
        facts_text = "\n\n".join(parts)

        if tracking_items:
            tracking_text = "\n".join(tracking_items)
    else:
        facts_text = "（目前沒有任何記憶事實卡）"

    # 組出使用者基本資料文字（chronic_conditions / current_medications 存的是 JSON string）
    profile_text = "（尚未填寫個人資料）"
    if profile:
        parts = []
        if profile.get("age"):
            parts.append(f"年齡：{profile['age']}")
        if profile.get("gender"):
            parts.append(f"性別：{profile['gender']}")

        if profile.get("chronic_conditions"):
            try:
                conditions = json.loads(profile["chronic_conditions"])
                if conditions:
                    parts.append(f"慢性病：{'、'.join(conditions)}")
            except (json.JSONDecodeError, TypeError):
                pass

        if profile.get("current_medications"):
            try:
                meds = json.loads(profile["current_medications"])
                if meds:
                    meds_text = "；".join([
                        f"{m.get('name', '')}（用途：{m.get('purpose', '未標示')}）{m.get('dosage', '')} {m.get('timing', '')}".strip()
                        for m in meds
                    ])
                    parts.append(f"目前用藥：{meds_text}")
            except (json.JSONDecodeError, TypeError):
                pass

        if parts:
            profile_text = "\n".join(parts)

    system_prompt = f"""【最高優先級鐵律：禁止編造醫療資訊】
你絕對不能編造、猜測、或憑空生成任何藥名、病名、劑量、療程等醫療相關的具體資訊。
這是最重要的規則，優先於其他所有指示。
下面會提供這位使用者「目前實際已知」的基本資料與事實卡，這是你唯一能引用的資訊來源。
如果使用者問到用藥、病況、healthcare 相關問題，而下面提供的資料裡沒有出現對應的具體內容，
你只能誠實回答「目前還沒有你的相關紀錄」，並建議使用者去個人資料頁面填寫或直接告訴你細節。
絕對不可以因為想要顯得有幫助，就自己編一個聽起來合理的藥名或病名。
違反這條規則會對使用者的健康安全造成實際危害，這是不可接受的。

你是一位溫暖、有耐心的 AI 陪伴助手，專門陪伴長者聊天，同時關注他們的健康狀況。
你會用繁體中文回應，語氣親切自然，像家人一樣。

【稱謂規則】
- 不要使用「爸爸」「媽媽」「阿姨」「阿伯」這類容易猜錯、容易前後不一致的親屬或長輩稱謂。
- 一律使用中性、安全的稱呼方式，例如直接用「您」，或偶爾用「親愛的」，
  但整段對話中要保持一致，不要中途切換不同稱謂。
- 絕對不要根據猜測使用與使用者登記性別不符的稱謂。

現在時間：{current_time}

這位使用者的基本資料：
{profile_text}"""

    # 注入使用者自行編輯的重要資訊（與 AI 自動記憶卡分開）
    personal_notes = profile.get("personal_notes", "") if profile else ""
    if personal_notes.strip():
        system_prompt += f"""

【使用者自行確認的重要資訊】（此區塊由使用者本人編輯，非 AI 自動生成）
{personal_notes}"""

    if tracking_text:
        system_prompt += f"""

【待追蹤事項 —— 需要你主動關心】
{tracking_text}

【主動關懷規則】
- 若上面有待追蹤事項，且這是這段對話剛開始（使用者還沒主動提到這些事），
  可以主動關心其中「一件」，優先選最近更新、或聽起來最需要留意的那一件。
- 一次對話最多主動關心一件事，不要把待追蹤清單一次問完
  （例如不要一口氣問「膝蓋還痛嗎？新藥吃了怎樣？心情還低落嗎？」，這樣像在查房，不像陪伴）。
- 其餘待追蹤事項，等使用者自然聊到相關話題時再自然帶入，不要主動逐一詢問。
- 情緒類的待追蹤事項要謹慎：如果反覆追問使用者的低落心情，對長者本身是壓力，
  這類事項優先只放在背景參考，不用每次都主動探問。"""

    system_prompt += f"""

【AI 自動整理的記憶卡】（以下由系統自動歸納，勿與上方使用者自行確認的資訊混淆）
{facts_text}

請根據使用者的話語，結合你已知的基本資料與事實卡資訊，給予適當且個人化的回應。
【重要】事實卡只是背景參考資訊，用來幫助你理解使用者的長期狀況（例如已知的慢性病、
過去提過的習慣），但絕對不能把事實卡的內容當成使用者「這句話」講過的事。
回應時只能針對使用者這句話實際說的內容做回覆與延伸，不要把事實卡裡的舊細節
（例如過去吃過的其他食物、其他症狀）當作使用者這次也提到，更不要編造使用者沒說過的細節。
【重要】如果待追蹤事項或事實卡的內容，跟使用者這次對話實際說的內容有衝突
（例如待追蹤事項寫著「膝蓋疼痛」，但使用者這次已經說「膝蓋好多了」），
一律以使用者這次實際說的話為準，不要再追問已經確認好轉或解決的事。
如果使用者提到藥物或病症時用了模糊描述（例如「早上吃的藥」「控制血壓的藥」），
且上述基本資料或事實卡中確實有對應的具體藥名，請主動對應說出來，
讓使用者知道你確實記得他吃的是什麼藥。
【重要】如果使用者問到用藥、病況等問題，但上述基本資料與事實卡中完全沒有相關記錄，
請誠實告知「目前還沒有你的相關紀錄」，並溫和建議去個人資料頁面填寫或直接告訴你，
絕對不要編造、猜測或假設任何未經確認的藥名、病名或健康資訊。
如果使用者提到健康相關的事情，適度關心但不要過度醫療化。
回應要自然、不要列點，像真人對話一樣。
請用長輩容易理解的口語回答，避免使用「升糖指數」「膳食纖維」等專業術語，
盡量用具體食物或生活化的比喻說明，控制在 3-5 句以內。"""

    if knowledge_context:
        system_prompt += f"""

以下是相關的衛教知識庫內容，請根據這些內容回答健康相關問題，不要自行編造醫療資訊：
{knowledge_context}

如果使用者的問題與上述知識庫內容相關，請優先參考知識庫回答。"""

    return invoke_bedrock(system_prompt, user_message)

def generate_memory_operations(facts: list, user_message: str, ai_response: str,
                               current_time: str) -> list:
    """Generate memory update operations from conversation.
    Returns a list of operations or empty list on failure (safety net)."""
    facts_text = ""
    if facts:
        facts_text = "\n".join([
            f"- id: {f['fact_id']}, category: {f['category']}, content: {f['content']}, track: {f.get('track', False)}"
            for f in facts
        ])
    else:
        facts_text = "（目前沒有任何事實卡）"

    system_prompt = f"""你是一個記憶管理系統。你的任務是分析對話，判斷是否需要新增或更新使用者的事實卡。

現在時間：{current_time}

使用者目前的事實卡：
{facts_text}

category 只能是以下值之一：飲食、活動、睡眠、用藥、身體、情緒、其他
不接受任何其他 category 值。

規則：
1. 只有使用者這輪明確提到的具體資訊才需要記錄（例如吃了什麼、做了什麼運動、吃了什麼藥）
2. 如果使用者只是閒聊打招呼、或問問題（例如「我該吃什麼藥」「1顆還是2顆」這種提問句），
   不算新資訊，不需要任何操作
3. 【重要：查重規則】在決定要不要新增之前，你必須先逐一比對「使用者目前的事實卡」列表，
   判斷這次對話內容是否與某一筆既有事實卡指的是「同一件事實」，即使用詞、角度、詳細程度不同。
   例如「早上吃了血壓藥」「氨氯地平是控制血壓的藥物」「早上吃的是『氨氯地平』，控制血壓」
   這三句話講的都是同一件事（早上服用氨氯地平這件事），只能算一筆事實卡，不能各自新增。
   判斷標準是「事件本身是否相同」，不是「用字是否相同」。
4. 如果判斷為同一件事實：
   - 如果既有事實卡的內容已經完整、沒有新資訊，不做任何操作
   - 如果這次對話補充了更精確或更新的資訊（例如劑量從 5mg 改成 10mg），
     用 update 操作更新既有那筆事實卡的 id，不要新增一筆新的
5. 只有確認是「事實卡列表裡完全沒有出現過的新事件」，才使用 add 操作
6. content 要簡潔描述事實本身，不要加入推測、建議，也不要重複已知資訊的不同措辭
7. 【重要：track 欄位判斷】每一筆 add 或 update 操作都必須附上 track（布林值）：
   - 若這件事涉及健康變化（例如新出現的疼痛、不適）、新開始的用藥、明顯的情緒異常、
     或任何照護者需要主動留意進展的狀態，設 track: true。
   - 若這件事是穩定的日常習慣（例如「早餐通常吃稀飯」）、已經解決或穩定的狀況、
     或使用者明確表示「不用擔心」「已經好了」，設 track: false。
   - 若是 update 一筆原本 track: true 的事實卡，且這次對話顯示該事項已經解決或穩定
     （例如使用者說「好多了」「已經不痛了」），要把 track 改成 false。
   - 不要用關鍵字或 category 自動判斷，一律根據語意判斷這件事是否值得持續關心。
   - 拿不準的情況，寧可設 false，避免待追蹤清單膨脹到失去意義。

請以純 JSON 格式回覆，不要加任何其他文字或 markdown：
{{"operations": [
  {{"op": "add", "category": "用藥", "content": "早上吃了血壓藥", "track": false}},
  {{"op": "update", "id": "fact_123", "content": "更新後的內容", "track": true}}
]}}

如果不需要任何操作，回覆：
{{"operations": []}}"""

    user_prompt = f"""使用者說：{user_message}
AI 回覆：{ai_response}

請先比對上方「使用者目前的事實卡」列表，判斷這輪對話是否為已存在的事實、需要更新的事實、
或全新的事實，再輸出對應的操作，並依規則 7 判斷每筆操作的 track 欄位。只輸出 JSON，不要其他文字。"""

    try:
        response_text = invoke_bedrock(system_prompt, user_prompt, max_tokens=1024)

        response_text = response_text.strip()

        if response_text.startswith("```"):
            lines = response_text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            response_text = "\n".join(lines)

        result = json.loads(response_text)

        if "operations" not in result:
            bedrock_logger.warning("Memory ops response missing 'operations' key, returning empty")
            return []

        valid_ops = []
        for op in result["operations"]:
            if op.get("op") == "add":
                if op.get("category") in VALID_CATEGORIES and op.get("content"):
                    # track 欄位缺失或型別不對時，安全預設為 False，不讓格式問題擋掉整筆操作
                    op["track"] = bool(op.get("track", False))
                    valid_ops.append(op)
                else:
                    bedrock_logger.warning(f"Invalid add op skipped: category={op.get('category')}")
            elif op.get("op") == "update":
                if op.get("id") and op.get("content"):
                    op["track"] = bool(op.get("track", False))
                    valid_ops.append(op)
                else:
                    bedrock_logger.warning(f"Invalid update op skipped: id={op.get('id')}")

        bedrock_logger.info(f"Memory operations parsed: {len(valid_ops)} valid ops from {len(result['operations'])} total")
        return valid_ops

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        # Safety net: JSON parse failure → no memory changes
        bedrock_logger.error(f"SAFETY NET triggered — memory JSON parse failed: {type(e).__name__}: {e}")
        bedrock_logger.error(f"Raw response text was: {response_text[:500] if 'response_text' in dir() else 'N/A'}")
        return []


def generate_daily_summary(facts_by_category: dict, date_str: str) -> str:
    """Generate daily summary from today's facts grouped by category."""
    facts_text = ""
    for category, items in facts_by_category.items():
        facts_text += f"\n【{category}】\n"
        for item in items:
            facts_text += f"  - {item['content']}\n"

    system_prompt = """你是一位健康紀錄摘要助手。請根據以下今日的事實卡紀錄，
生成一段簡潔自然的中文每日摘要。用溫暖親切的語氣，像在跟家人報告今天的狀況。
不要列點，用自然段落描述即可。如果某個類別沒有紀錄就跳過，不要提到「沒有紀錄」。"""

    user_prompt = f"""日期：{date_str}
今日紀錄：
{facts_text}

請生成今日摘要："""

    return invoke_bedrock(system_prompt, user_prompt, max_tokens=512)


def generate_cross_day_insights(candidate_patterns: list) -> str:
    """Generate cross-day insights from repeated patterns.
    Returns insight text or empty string if no meaningful insights."""
    if not candidate_patterns:
        return ""

    patterns_text = "\n".join([
        f"- [{p['category']}] 出現 {p['count']} 天：{p['contents']}"
        for p in candidate_patterns
    ])

    system_prompt = """你是一位健康觀察助手。以下是使用者最近 7 天的事實卡中，
重複出現的模式。請根據這些模式，生成 1-3 句簡短的觀察洞察。

要求：
1. 用關心的語氣，像家人提醒一樣
2. 指出重複出現的模式，但不要下醫療診斷
3. 如果模式值得留意，適度建議就醫或注意
4. 不要編造不存在的關聯
5. 用繁體中文回應"""

    user_prompt = f"""近 7 天重複出現的模式：
{patterns_text}

請生成觀察洞察："""

    return invoke_bedrock(system_prompt, user_prompt, max_tokens=256)


def generate_weekly_summary(summaries_text: str, date_start: str, date_end: str) -> str:
    """Generate weekly summary from multiple daily summaries."""

    system_prompt = """你是一位健康紀錄摘要助手。以下是一位長者過去數天的每日摘要，
請將這些摘要歸納為一段本週總結。用溫暖親切的語氣，像在跟家人報告這位長者這週整體的狀況。
不要逐日重述，而是歸納出整體趨勢、值得注意的變化、和正面的進展。
不要列點，用自然段落描述即可。用繁體中文回應。"""

    user_prompt = f"""期間：{date_start} 至 {date_end}
每日摘要紀錄：
{summaries_text}

請生成本週總結："""

    return invoke_bedrock(system_prompt, user_prompt, max_tokens=512)
