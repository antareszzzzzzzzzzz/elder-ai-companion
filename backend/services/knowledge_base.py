import re
from services.dynamodb import health_kb_table
from services.logger import knowledge_logger


def search_knowledge_base(user_message: str) -> list:
    """Search HealthKnowledgeBase by keyword matching.
    Returns list of matching knowledge entries."""
    knowledge_logger.debug(f"Searching knowledge base for: {user_message[:100]}")

    # Scan all entries (for a small knowledge base, this is acceptable)
    try:
        response = health_kb_table.scan()
        items = response.get("Items", [])
        knowledge_logger.debug(f"Knowledge base has {len(items)} entries")
    except Exception as e:
        knowledge_logger.error(f"Knowledge base scan error: {type(e).__name__}: {e}", exc_info=True)
        return []

    matches = []
    user_message_lower = user_message.lower()

    for item in items:
        keywords = item.get("keywords", [])
        for keyword in keywords:
            # Simple keyword matching: check if keyword appears in user message
            if keyword.lower() in user_message_lower:
                matches.append(item)
                break
            # Also try regex for more flexible matching
            try:
                if re.search(keyword, user_message, re.IGNORECASE):
                    matches.append(item)
                    break
            except re.error:
                continue

    if matches:
        knowledge_logger.info(f"Knowledge base matched {len(matches)} entries: {[m.get('title', '') for m in matches]}")
    else:
        knowledge_logger.debug("No knowledge base matches found")

    return matches


def format_knowledge_context(matches: list) -> str:
    """Format matched knowledge entries into context string for Bedrock prompt."""
    if not matches:
        return ""

    context_parts = []
    for entry in matches:
        part = f"【{entry.get('title', '')}】\n"
        part += f"分類：{entry.get('category', '')}\n"
        part += f"內容：{entry.get('content', '')}\n"
        if entry.get("source"):
            part += f"來源：{entry.get('source', '')}"
            if entry.get("source_url"):
                part += f" ({entry.get('source_url')})"
            part += "\n"
        context_parts.append(part)

    return "\n---\n".join(context_parts)
