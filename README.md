# 🏥 智慧長照陪伴系統

> **以生成式 AI 縮短長照資源落差**
> 
> 2026 雲湧智生：臺灣生成式 AI 應用黑客松 ｜ 命題類別：數位創生

---

## 專案簡介

針對臺灣醫療與照護資源匱乏地區，打造以「人機協作，生活支持陪伴」為核心精神的智慧陪伴平台。系統運用大型語言模型（LLM）的自然語言能力，讓長者以口語方式與 AI 助手「小安」進行即時互動，同時自動將對話中的健康資訊結構化，供照護者與家屬即時掌握長者近況。

---

## 核心功能

| 模組 | 說明 |
|------|------|
| **語音互動陪伴** | 結合 STT/TTS 與 LLM，長者以口語自然對話，無需打字。具備時間感知、記憶感知與主動關懷能力 |
| **生活記錄與智慧摘要** | 從對話中自動擷取飲食、活動、睡眠、用藥等資訊，每日/每週自動生成結構化摘要 |
| **照護者資訊介面** | 照護者可遠端查看長者基本資料、AI 摘要時間軸、記憶卡片、跨日洞察分析 |
| **知識庫增強** | 收錄衛教資料，AI 回答健康問題時引用專業知識，不編造醫療資訊 |
| **主動關懷機制** | AI 記住長者健康變化，下次對話主動追蹤進展，模擬真實照護者行為 |

---

## 技術架構

```
┌─────────────────────────────────────────────────┐
│                    前端 (React)                    │
│  TypeScript · TailwindCSS 4 · Framer Motion      │
└───────────────────────┬─────────────────────────┘
                        │ HTTPS / WebSocket
┌───────────────────────┴─────────────────────────┐
│                  後端 (Flask API)                  │
└──┬──────────┬──────────┬──────────┬─────────────┘
   │          │          │          │
┌──┴──┐  ┌───┴───┐  ┌───┴───┐  ┌──┴──────┐
│Bedrock│  │ Polly │  │Cognito│  │DynamoDB │
│(LLM) │  │(TTS)  │  │(Auth) │  │(Storage)│
└──────┘  └───────┘  └───────┘  └─────────┘
```

| 層級 | 技術 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + TailwindCSS 4 + Framer Motion |
| 後端 | Python Flask + flask-cors |
| AI | Amazon Bedrock (claude sonnet 4.5) |
| 語音合成 | Amazon Polly (Neural, Zhiyu) |
| 語音辨識 | AWS Transcribe (WebSocket 串流) + Web Speech API fallback |
| 資料庫 | Amazon DynamoDB (8 tables) |
| 認證 | AWS Cognito (OAuth 2.0 + JWT) |

---

## 專案結構

```
elder-ai-companion/
├── backend/                 # Flask 後端 API
│   ├── routes/              # API 路由 (auth, chat, profile, follow, summary, health_overview)
│   ├── services/            # 服務層 (bedrock, dynamodb, polly, knowledge_base, logger)
│   ├── middleware/          # JWT 認證中間件
│   ├── stt_service/         # 獨立 STT WebSocket 服務
│   ├── scripts/             # 資料庫建表 & 種子資料
│   ├── .env.example         # 環境變數範本
│   └── requirements.txt     # Python 依賴
├── frontend/                # React 前端
│   ├── src/
│   │   ├── pages/           # 頁面元件
│   │   ├── store/           # 全域狀態管理
│   │   └── services/        # API 封裝 & 語音服務
│   ├── .env.example         # 環境變數範本
│   └── package.json         # Node.js 依賴
├── docs/                    # 文件
│   ├── 生成式AI技術應用說明.md
│   ├── 數據及資料應用說明.md
│   ├── 系統功能說明.md
│   └── 專案簡介.md
├── start.bat                # Windows 一鍵啟動腳本
└── README.md                # 本文件
```

---

## 快速開始

### 前置需求

- Python 3.10+
- Node.js 18+
- AWS 帳號（已設定 credentials）
- AWS 資源已建立（Cognito User Pool、DynamoDB 8 張表、Bedrock model access）

### 安裝

```bash
# 後端
cd backend
pip install -r requirements.txt

# STT 服務
cd backend/stt_service
pip install -r requirements.txt

# 前端
cd frontend
npm install
```

### 設定環境變數

```bash
# 後端
cp backend/.env.example backend/.env
# 編輯 backend/.env 填入 AWS 設定

# 前端
cp frontend/.env.example frontend/.env
# 編輯 frontend/.env 填入 Cognito 設定
```

### 啟動

**Windows 一鍵啟動：**
```bash
double-click start.bat
```

**手動啟動（三個終端機）：**
```bash
# Terminal 1: 後端
cd backend && python app.py

# Terminal 2: STT 服務（可選）
cd backend/stt_service && python main.py

# Terminal 3: 前端
cd frontend && npm run dev
```

打開瀏覽器進入 `http://localhost:5173`

---

## 使用者旅程

### 長輩端

1. 登入（Cognito OAuth2）→ 首次使用簽署同意書
2. 進入「小安助手」聊天介面
3. 語音或文字與 AI 對話 → AI 即時回覆並朗讀
4. 系統自動擷取健康資訊 → 生成記憶卡片
5. 個人資料頁查看記憶卡片、管理綁定碼

### 照護者端

1. 登入 → 切換為照護者角色
2. 輸入長輩帳號 + 6 碼綁定碼 → 送出追蹤請求
3. 長輩核准後 → 照護者首頁出現家人卡片
4. 點入「專屬照護區」查看健康摘要、記憶卡片、跨日洞察
5. 可觸發生成每日摘要 / 本週總結

---

## 個資保護

- ✅ 所有展示資料為模擬或去識別化資料
- ✅ 使用者同意機制（首次使用前必須確認）
- ✅ JWT 認證 + 追蹤關係權限檢查
- ✅ 綁定雙重驗證（帳號 + 6 碼授權碼 + 長輩核准）
- ✅ 資料傳輸 HTTPS 加密
- ✅ DynamoDB 靜態加密
- ✅ 明確資料保留政策（對話 30 天、摘要長期保留）
- ✅ 使用者可隨時要求刪除資料

---

## AWS 服務使用

| 服務 | 用途 |
|------|------|
| Amazon Bedrock | LLM 對話生成 + 記憶萃取 + 摘要 + 洞察 |
| Amazon Polly | 中文語音合成 |
| AWS Transcribe | 即時語音辨識 |
| Amazon DynamoDB | 全部資料儲存 |
| AWS Cognito | 使用者認證授權 |

---

## 開發工具

- 使用 **Kiro** 進行開發與架構設計

---

## 團隊成員

<!-- TODO: 之後補上各成員姓名與負責模組 -->

---

## 授權

本專案為 2026 雲湧智生黑客松參賽作品。
