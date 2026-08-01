"""
從 JSON 檔匯入 HealthKnowledgeBase 表。
用法：python scripts/import_knowledge_base.py
"""
import boto3
import json
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

region = os.getenv("AWS_REGION", "us-west-2")
dynamodb = boto3.resource("dynamodb", region_name=region)
table = dynamodb.Table("HealthKnowledgeBase")

# JSON 檔路徑（專案根目錄）
FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "HealthKnowledgeBase.json"
)


def convert_floats(obj):
    """DynamoDB 不接受 float，轉成 Decimal。"""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats(i) for i in obj]
    return obj


def main():
    if not os.path.exists(FILE_PATH):
        print(f"找不到檔案: {FILE_PATH}")
        sys.exit(1)

    with open(FILE_PATH, "r", encoding="utf-8") as f:
        entries = json.load(f)

    print(f"讀取到 {len(entries)} 筆資料，開始匯入 HealthKnowledgeBase (region={region})...\n")

    success = 0
    failed = 0

    for entry in entries:
        topic_id = entry.get("topic_id")
        if not topic_id:
            print(f"  x 缺少 topic_id，跳過: {entry.get('title', '?')}")
            failed += 1
            continue

        # 清理：DynamoDB 不允許空字串作為非 key 屬性值
        item = {}
        for k, v in entry.items():
            if v == "":
                continue
            if isinstance(v, list) and len(v) == 0:
                continue
            item[k] = convert_floats(v)

        try:
            table.put_item(Item=item)
            print(f"  ok {topic_id} | {entry.get('title', '')}")
            success += 1
        except Exception as e:
            print(f"  FAIL {topic_id} | {type(e).__name__}: {e}")
            failed += 1

    print(f"\n完成！成功: {success}，失敗: {failed}")


if __name__ == "__main__":
    main()
