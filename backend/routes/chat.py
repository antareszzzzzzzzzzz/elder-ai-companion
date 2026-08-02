import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.dynamodb import (
    accounts_table, facts_table, fact_history_table,
    sessions_table, messages_table, dynamodb_client
)
from services.bedrock import generate_chat_response, generate_memory_operations, VALID_CATEGORIES
from services.polly import synthesize_speech
from services.knowledge_base import search_knowledge_base, format_knowledge_context
from services.logger import chat_logger

chat_bp = Blueprint("chat", __name__)

# 台灣時區 UTC+8
TW_TZ = timezone(timedelta(hours=8))


def _now_tw() -> str:
    """Return current time in ISO 8601 with +08:00 offset."""
    return datetime.now(TW_TZ).isoformat()


@chat_bp.route("/sessions", methods=["GET"])
@require_auth
def get_sessions():
    """Get all chat sessions for current user."""
    try:
        response = sessions_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": g.user_id}
        )
        items = response.get("Items", [])
        # Sort by created_at descending
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/sessions", methods=["POST"])
@require_auth
def create_session():
    """Create a new chat session."""
    data = request.get_json() or {}
    title = data.get("title", "新對話")

    session_id = str(uuid.uuid4())
    now = _now_tw()

    try:
        sessions_table.put_item(Item={
            "session_id": session_id,
            "account_id": g.user_id,
            "title": title,
            "created_at": now
        })
        return jsonify({
            "session_id": session_id,
            "account_id": g.user_id,
            "title": title,
            "created_at": now
        }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/sessions/<session_id>/messages", methods=["GET"])
@require_auth
def get_messages(session_id):
    """Get all messages in a session. Caller must own the session."""
    try:
        # 先確認這個 session 屬於目前登入者，否則只憑 session_id 就能讀到別人的對話
        session_resp = sessions_table.get_item(Key={"session_id": session_id})
        session = session_resp.get("Item")
        if not session:
            return jsonify({"error": "Session not found"}), 404
        if session.get("account_id") != g.user_id:
            chat_logger.warning(
                f"[{g.user_id[:8]}] 嘗試讀取不屬於自己的 session {session_id[:8]}，已拒絕"
            )
            return jsonify({"error": "Not authorized"}), 403

        response = messages_table.scan(
            FilterExpression="session_id = :sid",
            ExpressionAttributeValues={":sid": session_id}
        )
        items = response.get("Items", [])
        items.sort(key=lambda x: x.get("created_at", ""))
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/send", methods=["POST"])
@require_auth
def send_message():
    """Send a message and get AI response with memory operations.
    This is the core endpoint implementing the dual-call architecture."""
    data = request.get_json()
    if not data or not data.get("message"):
        return jsonify({"error": "Message is required"}), 400

    user_message = data["message"]
    session_id = data.get("session_id")
    current_time = _now_tw()

    try:
        # Create session if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
            sessions_table.put_item(Item={
                "session_id": session_id,
                "account_id": g.user_id,
                "title": user_message[:20] + "..." if len(user_message) > 20 else user_message,
                "created_at": current_time
            })
            chat_logger.info(f"New session created: {session_id}")

        chat_logger.info(f"[{g.user_id[:8]}] Message received: '{user_message[:50]}...' session={session_id[:8]}")

        # 1. Atomic increment interaction_count
        accounts_table.update_item(
            Key={"account_id": g.user_id},
            UpdateExpression="ADD interaction_count :inc",
            ExpressionAttributeValues={":inc": 1}
        )
        chat_logger.debug(f"interaction_count incremented for {g.user_id[:8]}")

        # 2. Get current facts for this user
        facts_response = facts_table.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": g.user_id}
        )
        current_facts = facts_response.get("Items", [])
        # 建立已知 fact_id 集合，用於防止萃取 LLM 幻覺不存在的 id
        known_fact_ids = {f["fact_id"] for f in current_facts}
        chat_logger.debug(f"Loaded {len(current_facts)} facts for user")

        # 2.5 Get user profile (chronic conditions, medications)
        profile_response = accounts_table.get_item(Key={"account_id": g.user_id})
        user_profile = profile_response.get("Item", {})

        # 2.6 Get caregiver care items (source='caregiver', track=True → 待提醒)
        caregiver_reminders = []
        try:
            care_resp = facts_table.scan(
                FilterExpression="account_id = :aid AND #src = :src AND track = :t",
                ExpressionAttributeNames={"#src": "source"},
                ExpressionAttributeValues={
                    ":aid": g.user_id,
                    ":src": "caregiver",
                    ":t": True
                }
            )
            caregiver_reminders = care_resp.get("Items", [])
            if caregiver_reminders:
                chat_logger.info(f"Caregiver reminders: {len(caregiver_reminders)} active items")
        except Exception as e:
            chat_logger.warning(f"Failed to load caregiver reminders: {e}")

        # 3. Search knowledge base (pre-step before generating response)
        kb_matches = search_knowledge_base(user_message)
        knowledge_context = format_knowledge_context(kb_matches) if kb_matches else None
        if kb_matches:
            chat_logger.info(f"Knowledge base: {len(kb_matches)} matches found")

        # 4. FIRST Bedrock call: Generate AI response
        chat_logger.info("Bedrock call #1: generating chat response...")
        ai_response = generate_chat_response(
            facts=current_facts,
            user_message=user_message,
            current_time=current_time,
            knowledge_context=knowledge_context,
            profile=user_profile,
            caregiver_reminders=caregiver_reminders
        )
        chat_logger.info(f"AI response generated, length={len(ai_response)}")

        # 5. SECOND Bedrock call: Generate memory operations
        chat_logger.info("Bedrock call #2: generating memory operations...")
        operations = generate_memory_operations(
            facts=current_facts,
            user_message=user_message,
            ai_response=ai_response,
            current_time=current_time,
            caregiver_reminders=caregiver_reminders
        )
        chat_logger.info(f"Memory operations: {len(operations)} ops to execute")

        # 6. Execute memory operations (code does the writing, not LLM)
        memory_updates = []
        for op in operations:
            # track 欄位缺失時安全預設為 False，不讓格式問題擋掉整筆操作
            track_flag = bool(op.get("track", False))

            if op["op"] == "add":
                fact_id = str(uuid.uuid4())
                facts_table.put_item(Item={
                    "fact_id": fact_id,
                    "account_id": g.user_id,
                    "category": op["category"],
                    "content": op["content"],
                    "track": track_flag,
                    "updated_at": current_time
                })
                memory_updates.append({"op": "add", "fact_id": fact_id, "category": op["category"], "track": track_flag})
                chat_logger.info(f"  ADD fact: [{op['category']}] {op['content'][:50]} (track={track_flag})")

            elif op["op"] == "update":
                fact_id = op["id"]
                new_content = op["content"]

                # 安全檢查：id 必須在剛才餵進萃取 prompt 的清單中（防幻覺）
                if fact_id not in known_fact_ids:
                    chat_logger.warning(f"  UPDATE rejected: fact {fact_id[:8]} not in known_fact_ids (possible hallucination)")
                    continue

                # Get existing fact
                existing = facts_table.get_item(Key={"fact_id": fact_id})
                if "Item" in existing:
                    old_content = existing["Item"]["content"]
                    history_id = str(uuid.uuid4())

                    # Atomic transaction: save history + update fact (含 track 欄位)
                    try:
                        dynamodb_client.transact_write_items(
                            TransactItems=[
                                {
                                    "Put": {
                                        "TableName": "FactHistory",
                                        "Item": {
                                            "history_id": {"S": history_id},
                                            "fact_id": {"S": fact_id},
                                            "old_content": {"S": old_content},
                                            "replaced_at": {"S": current_time}
                                        }
                                    }
                                },
                                {
                                    "Update": {
                                        "TableName": "Facts",
                                        "Key": {"fact_id": {"S": fact_id}},
                                        "UpdateExpression": "SET content = :c, updated_at = :t, track = :tr",
                                        "ExpressionAttributeValues": {
                                            ":c": {"S": new_content},
                                            ":t": {"S": current_time},
                                            ":tr": {"BOOL": track_flag}
                                        }
                                    }
                                }
                            ]
                        )
                        memory_updates.append({"op": "update", "fact_id": fact_id, "track": track_flag})
                        chat_logger.info(f"  UPDATE fact {fact_id[:8]}: '{old_content[:30]}' → '{new_content[:30]}' (track={track_flag})")
                    except Exception as e:
                        chat_logger.error(f"Transaction failed for fact update {fact_id[:8]}: {e}", exc_info=True)
                else:
                    chat_logger.warning(f"  UPDATE skipped: fact {fact_id[:8]} not found in DB")

        # 7. Save messages to Messages table (含 extracted 旗標)
        user_msg_id = str(uuid.uuid4())
        assistant_msg_id = str(uuid.uuid4())

        messages_table.put_item(Item={
            "message_id": user_msg_id,
            "session_id": session_id,
            "role": "user",
            "content": user_message,
            "extracted": True,
            "created_at": current_time
        })

        messages_table.put_item(Item={
            "message_id": assistant_msg_id,
            "session_id": session_id,
            "role": "assistant",
            "content": ai_response,
            "extracted": True,
            "created_at": _now_tw()
        })

        # 8. Generate TTS audio
        chat_logger.info("Generating TTS audio...")
        audio_base64 = synthesize_speech(ai_response)

        chat_logger.info(f"[{g.user_id[:8]}] Request complete: session={session_id[:8]}, memory_ops={len(memory_updates)}, has_audio={'yes' if audio_base64 else 'no'}")

        return jsonify({
            "session_id": session_id,
            "response": ai_response,
            "audio": audio_base64,
            "memory_updates": memory_updates
        })

    except Exception as e:
        chat_logger.error(f"[{g.user_id[:8]}] Chat endpoint error: {type(e).__name__}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
