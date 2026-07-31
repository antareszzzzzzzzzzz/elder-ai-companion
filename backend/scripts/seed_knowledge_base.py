"""
Seed the HealthKnowledgeBase table with sample health education entries.
"""
import boto3
import os
import sys
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

region = os.getenv("AWS_REGION", "us-east-1")
dynamodb = boto3.resource("dynamodb", region_name=region)
table = dynamodb.Table("HealthKnowledgeBase")

KNOWLEDGE_ENTRIES = [
    {
        "category": "慢性病",
        "disease_name": "糖尿病",
        "title": "糖尿病飲食注意事項",
        "content": "糖尿病患者飲食建議：1. 控制碳水化合物攝取量，選擇低升糖指數食物（如全穀類、豆類）。2. 避免含糖飲料和精製糖。3. 增加膳食纖維攝取（蔬菜、水果適量）。4. 定時定量進餐，避免暴飲暴食。5. 減少飽和脂肪攝取。6. 適量蛋白質攝取。血糖監測建議：空腹血糖目標 80-130 mg/dL，餐後兩小時血糖目標低於 180 mg/dL。",
        "keywords": ["糖尿病", "血糖", "飲食", "低糖", "升糖指數", "碳水化合物"],
        "source": "衛生福利部國民健康署",
        "source_url": "https://www.hpa.gov.tw"
    },
    {
        "category": "慢性病",
        "disease_name": "高血壓",
        "title": "高血壓日常管理",
        "content": "高血壓日常管理建議：1. 減少鈉（鹽分）攝取，每日不超過 6 公克。2. 維持健康體重（BMI 18.5-24）。3. 規律運動，每週至少 150 分鐘中等強度有氧運動。4. 限制酒精攝取。5. 戒菸。6. 按時服藥，不可自行停藥或減藥。血壓目標：一般建議控制在 130/80 mmHg 以下。量血壓建議在早晨起床後及晚上睡前各量一次。",
        "keywords": ["高血壓", "血壓", "鹽分", "降壓藥", "量血壓"],
        "source": "中華民國心臟學會",
        "source_url": "https://www.tsoc.org.tw"
    },
    {
        "category": "用藥",
        "disease_name": "一般",
        "title": "長者用藥安全須知",
        "content": "長者用藥安全提醒：1. 按照醫囑時間和劑量服藥，不可自行增減。2. 不同藥物間可能有交互作用，就醫時告知醫師所有正在服用的藥物。3. 注意藥物保存條件（避光、避熱、避潮）。4. 若忘記服藥，不要下次吃雙倍劑量。5. 注意藥物過期日期。6. 出現不適症狀應及時就醫。常見需注意的藥物交互作用：抗凝血劑與止痛藥、降壓藥與感冒藥。",
        "keywords": ["吃藥", "服藥", "藥物", "忘記吃藥", "副作用", "交互作用"],
        "source": "藥師公會全國聯合會",
        "source_url": "https://www.taiwan-pharma.org.tw"
    },
    {
        "category": "活動",
        "disease_name": "一般",
        "title": "長者運動建議",
        "content": "適合長者的運動建議：1. 有氧運動：快走、游泳、騎腳踏車，每週 150 分鐘。2. 肌力訓練：使用彈力帶、輕啞鈴，每週 2-3 次。3. 平衡訓練：太極拳、單腳站立練習，預防跌倒。4. 柔軟度：每日伸展操 10-15 分鐘。運動注意事項：運動前暖身 5-10 分鐘，運動後收操。避免空腹運動，天氣極端時在室內運動。如有胸痛、暈眩應立即停止。",
        "keywords": ["運動", "走路", "散步", "跌倒", "體力", "太極拳", "伸展"],
        "source": "衛生福利部國民健康署",
        "source_url": "https://www.hpa.gov.tw"
    },
    {
        "category": "睡眠",
        "disease_name": "一般",
        "title": "長者睡眠改善建議",
        "content": "改善睡眠品質建議：1. 維持規律作息，固定就寢和起床時間。2. 睡前避免使用 3C 產品。3. 臥室保持安靜、暗暗、溫度適宜。4. 睡前避免咖啡因和酒精。5. 白天適度活動，但避免傍晚後劇烈運動。6. 若超過 20 分鐘無法入睡，起身做輕鬆活動再回床。7. 午睡不超過 30 分鐘。若持續失眠超過一個月，建議就醫評估。",
        "keywords": ["睡不著", "失眠", "睡眠", "半夜醒", "安眠藥", "作息"],
        "source": "台灣睡眠醫學學會",
        "source_url": "https://www.tssm.org.tw"
    },
    {
        "category": "慢性病",
        "disease_name": "骨質疏鬆",
        "title": "骨質疏鬆預防與照護",
        "content": "骨質疏鬆預防建議：1. 攝取足夠鈣質：每日 1000-1200mg（乳製品、小魚乾、深綠色蔬菜）。2. 補充維生素 D：適度曬太陽（每日 15-20 分鐘）。3. 負重運動：快走、爬樓梯、跳舞。4. 避免抽菸和過量飲酒。5. 預防跌倒：居家環境安全、浴室防滑。若已確診骨質疏鬆，遵醫囑服用骨質疏鬆藥物。",
        "keywords": ["骨質疏鬆", "骨頭", "鈣", "跌倒", "骨折", "維生素D"],
        "source": "中華民國骨質疏鬆症學會",
        "source_url": "https://www.toa.org.tw"
    },
    {
        "category": "情緒",
        "disease_name": "一般",
        "title": "長者心理健康與情緒照護",
        "content": "長者心理健康建議：1. 維持社交活動，定期與親友聯繫。2. 培養興趣嗜好，保持生活目標感。3. 適度運動有助改善情緒。4. 學習接受生活變化，不要過度壓抑情緒。5. 若持續感到憂鬱、焦慮超過兩週，建議尋求專業協助。支持資源：安心專線 1925、生命線 1995、長照服務專線 1966。",
        "keywords": ["心情不好", "憂鬱", "焦慮", "孤單", "寂寞", "情緒低落", "不想動"],
        "source": "衛生福利部心理健康司",
        "source_url": "https://dep.mohw.gov.tw"
    },
    {
        "category": "慢性病",
        "disease_name": "關節炎",
        "title": "退化性關節炎照護",
        "content": "退化性關節炎照護建議：1. 維持適當體重，減輕關節負擔。2. 適度低衝擊運動：游泳、水中運動、騎固定式腳踏車。3. 避免長時間同一姿勢。4. 使用輔具（拐杖、護膝）減輕關節壓力。5. 熱敷可緩解關節僵硬。6. 急性疼痛時冰敷 15-20 分鐘。若疼痛加劇或影響日常生活，應就醫評估是否需要進一步治療。",
        "keywords": ["關節痛", "膝蓋痛", "關節炎", "膝蓋", "走路痛", "腰痠"],
        "source": "中華民國風濕病醫學會",
        "source_url": "https://www.rheumatology.org.tw"
    }
]


def main():
    print("Seeding HealthKnowledgeBase table...\n")

    for entry in KNOWLEDGE_ENTRIES:
        topic_id = str(uuid.uuid4())
        item = {
            "topic_id": topic_id,
            "category": entry["category"],
            "disease_name": entry["disease_name"],
            "title": entry["title"],
            "content": entry["content"],
            "keywords": entry["keywords"],
            "source": entry["source"],
            "source_url": entry["source_url"],
            "updated_at": datetime.utcnow().isoformat() + "Z"
        }

        try:
            table.put_item(Item=item)
            print(f"  ✓ {entry['title']}")
        except Exception as e:
            print(f"  ✗ Failed to insert {entry['title']}: {e}")

    print(f"\n✓ Seeded {len(KNOWLEDGE_ENTRIES)} knowledge base entries!")


if __name__ == "__main__":
    main()
