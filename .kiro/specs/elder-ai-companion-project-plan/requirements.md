# 需求文件：智慧長照陪伴系統專案規劃

## 文件狀態

- 規格名稱：`elder-ai-companion-project-plan`
- 工作流程：Requirements First
- 文件語言：繁體中文
- 規格性質：依現有程式碼與文件反向整理的提案及開發規劃基線
- 本階段範圍：只建立需求規格，不修改產品程式碼、不執行實作任務
- 架構優先依據：`.kiro/steering/架構鎖定規格.md`

## 現況盤點依據

本文件已交叉盤點下列現有資產：

- 前端：`frontend/src/App.tsx`、`pages/`、`components/NotificationBell.tsx`、`services/api.ts`、`services/speech.ts`、`store/MockDataContext.tsx`
- 主後端：`backend/app.py`、`routes/`、`middleware/auth.py`
- AI 與資料服務：`backend/services/bedrock.py`、`knowledge_base.py`、`polly.py`、`daily_summary.py`、`scheduler.py`、`email_notify.py`、`dynamodb.py`
- STT 服務：`backend/stt_service/main.py`
- 建表與啟動：`backend/scripts/create_tables.py`、`start.bat`
- 知識資料：`HealthKnowledgeBase.json`
- 專案文件：`docs/專案簡介.md`、`系統功能說明.md`、`系統架構圖.md`、`數據及資料應用說明.md`、`技術限制與未來規劃.md`、`使用說明.md`
- 架構治理：`.kiro/steering/架構鎖定規格.md`

## Introduction

> 本節以繁體中文說明提案摘要、目標、角色與現況範圍。

### 目標與痛點

智慧長照陪伴系統面向臺灣偏鄉、獨居或照護資源不足情境，處理三項已由現有功能對應的問題：長輩使用文字介面的門檻、日常生活與健康資訊散落在對話中、照護者難以持續掌握長輩近況。系統以語音優先的 AI 陪伴降低操作門檻，將對話中的生活資訊整理為記憶卡與摘要，並以經長輩核准的追蹤關係提供照護者健康總覽及通知。

本系統定位為生活陪伴與資訊整理工具，不是醫療診斷、治療、緊急救援或用藥決策系統。現有前端的緊急呼叫按鈕已註解停用，後端沒有緊急呼叫流程，因此緊急救援不納入本規格基線。

### 角色

- 長輩：使用語音或文字與 AI 助手「小安」互動、維護個人資料、查看記憶卡、管理綁定碼、核准或拒絕追蹤請求。
- 照護者：以帳號代碼與六位數綁定碼提出追蹤請求，在長輩核准後查看健康總覽、記憶卡、每日摘要與每週摘要，並設定每日摘要排程。

### 現況範圍判定

- 已有程式路徑：Cognito 登入、角色切換、使用同意、文字與語音聊天、對話 session、Bedrock 回覆、記憶萃取、Polly 播放、記憶卡、衛教知識檢索、追蹤綁定、健康總覽、跨日洞察 API、每日與每週摘要、應用內排程、站內摘要通知、SES 郵件、八張 DynamoDB 表。
- 已有後端但前端入口停用：跨日洞察產生端點存在，但照護者頁面的觸發按鈕目前註解停用。
- 文件有敘述但未找到完整程式證據：Messages 保留 30 天後自動清除、使用者完整資料刪除、正式環境 HTTPS/WSS 終止與部署設定。上述項目不宣告為目前已完成能力。
- 未納入現況基線：緊急呼叫、向量檢索、Speech-to-Speech、EventBridge、Lambda、外部佇列、ORM、新增 DynamoDB 表。

## Glossary

- **智慧長照陪伴系統**：本規格涵蓋的 React 前端、Flask 主後端、STT 服務及 AWS 整合整體。
- **React 前端**：以 Vite、React 19、TypeScript 實作並於開發環境使用 5173 port 的瀏覽器應用程式。
- **Flask 主後端**：以 Flask、flask-cors 與 Blueprint 實作並於開發環境使用 5000 port 的 HTTP API。
- **STT 服務**：以 FastAPI、uvicorn 與 WebSocket 實作並於開發環境使用 8001 port 的語音轉文字服務。
- **長輩**：Accounts 角色值為 `elderly` 的使用者。
- **照護者**：Accounts 角色值為 `caregiver` 的使用者。
- **小安**：智慧長照陪伴系統提供給長輩的 AI 陪伴助手名稱。
- **Cognito 認證模組**：以 AWS Cognito Hosted UI、OAuth authorization code flow 與 RS256 JWT 驗證使用者身分的模組。
- **ID Token**：Cognito 簽發並由 React 前端儲存在 `localStorage` 的 `id_token`。
- **Account ID**：Cognito ID Token 的 `sub`，也是 Accounts 的主鍵及後端授權判斷身分。
- **Bedrock 服務**：Amazon Bedrock 模型呼叫服務；所有模型呼叫統一經 `invoke_bedrock`。
- **Call #1**：每輪對話用於產生小安文字回覆的第一次 Bedrock 呼叫。
- **Call #2**：每輪對話用於產生記憶操作 JSON 的第二次獨立 Bedrock 呼叫。
- **記憶操作**：Call #2 產生的 `add` 或 `update` 指令，由 Python 驗證並寫入資料庫。
- **記憶卡**：Facts 中代表長輩目前生活或健康狀態的一筆結構化事實。
- **追蹤標記**：記憶卡的 `track` 布林值；`true` 表示後續對話可主動關心。
- **健康知識庫**：HealthKnowledgeBase 中的衛教條目集合。
- **知識檢索模組**：以 DynamoDB 全表 scan、關鍵字子字串及 regex 比對健康知識庫的模組。
- **追蹤關係**：Follows 中照護者 `follower_id` 與長輩 `followee_id` 的綁定紀錄。
- **核准追蹤者**：追蹤關係狀態為 `approved` 的照護者。
- **健康總覽**：已授權使用者可取得的互動次數、摘要與分類記憶卡集合。
- **跨日洞察**：由近七天資料中同類別出現至少三個不同日期的候選模式產生的觀察文字。
- **每日摘要**：依臺灣日期彙整當日更新記憶卡後，由 Bedrock 產生的摘要。
- **每週摘要**：由既有每日摘要歸納產生且 `summary_type` 為 `weekly` 的摘要。
- **摘要排程器**：Flask 進程內每 60 秒檢查 Follows 排程設定的 daemon thread。
- **站內通知**：React 前端輪詢摘要與追蹤請求後顯示於通知鈴鐺的通知。
- **SES 郵件模組**：以 Amazon SES 寄送每日摘要郵件，並以 Account ID 從 Cognito 查詢收件信箱的模組。
- **DynamoDB 資料層**：以 `boto3.resource` 直接存取八張 PAY_PER_REQUEST 資料表的資料層。
- **Accounts**：以 Account ID 為主鍵的帳號、角色、個人資料與同意紀錄表。
- **Facts**：以 `fact_id` 為主鍵的目前狀態記憶卡表。
- **FactHistory**：以 `history_id` 為主鍵的記憶卡舊內容歷史表。
- **Sessions**：以 `session_id` 為主鍵的對話 session 中繼資料表。
- **Messages**：以 `message_id` 為主鍵的逐輪對話訊息表。
- **Follows**：以 `follow_id` 為主鍵的照護者與長輩追蹤關係表。
- **DailySummaries**：以 `account_id#date` 為主鍵的每日與每週摘要表。
- **HealthKnowledgeBase**：以 `topic_id` 為主鍵的衛教知識條目表。
- **臺灣時間**：UTC+8 時區。
- **架構鎖定規格**：`.kiro/steering/架構鎖定規格.md` 所定義的固定工具、資料流、API、儲存格式與 Git 規則。
- **JSON 字串欄位**：Accounts 的 `chronic_conditions`、`current_medications`、`allergies`，以 JSON 序列化文字而非 DynamoDB List 儲存。
- **Graceful Degradation**：AWS 語音服務失敗時改用瀏覽器語音能力維持主要互動的降級行為。

## Requirements

### Requirement 1：核心價值與服務邊界

**User Story:** 作為提案利害關係人，我希望系統目標與服務邊界可被驗收，以便確認系統確實處理長輩陪伴及照護資訊落差。

#### Acceptance Criteria

1. THE 智慧長照陪伴系統 SHALL 提供長輩語音輸入及文字輸入兩種陪伴互動方式。
2. THE 智慧長照陪伴系統 SHALL 將長輩對話中的明確生活資訊整理為記憶卡。
3. THE 智慧長照陪伴系統 SHALL 向核准追蹤者提供長輩健康總覽及摘要。
4. WHEN 小安回應健康相關問題, THE 智慧長照陪伴系統 SHALL 將回應限制為生活陪伴及健康資訊參考。
5. IF 現有個人資料、記憶卡及健康知識庫均缺少對應醫療資訊, THEN THE 小安 SHALL 說明目前缺少對應紀錄並引導長輩諮詢專業人員。
6. THE 智慧長照陪伴系統 SHALL 將醫療診斷、治療決策、用藥決策及緊急救援排除於現況功能基線。

### Requirement 2：角色、個人資料與使用同意

**User Story:** 作為長輩或照護者，我希望系統依角色提供對應功能，並在資料蒐集前記錄同意，以便控制個人資料使用。

#### Acceptance Criteria

1. WHEN Cognito 認證模組完成首次登入建帳, THE Flask 主後端 SHALL 將 Accounts 角色設為 `elderly`。
2. WHEN 使用者提交角色更新, THE Flask 主後端 SHALL 僅接受 `elderly` 或 `caregiver`。
3. WHILE 長輩的 `consent_given` 為 `false`, THE React 前端 SHALL 顯示使用同意畫面取代長輩功能頁面。
4. WHEN 長輩確認同意, THE Flask 主後端 SHALL 將 `consent_given` 設為 `true` 並記錄後端產生的同意時間。
5. IF 使用同意寫入失敗, THEN THE 智慧長照陪伴系統 SHALL 顯示失敗狀態並維持未同意狀態。
6. WHEN 使用者更新個人資料, THE Flask 主後端 SHALL 僅更新 `display_name`、`account_handle`、`avatar_url`、`age`、`gender`、`chronic_conditions`、`current_medications`、`allergies`、`binding_code`、`birth`、`height` 及 `weight` 白名單欄位。
7. WHEN 使用者以 array 或 object 更新 JSON 字串欄位, THE Flask 主後端 SHALL 以保留繁體中文字元的 JSON 字串寫入 Accounts。
8. WHEN 使用者更新 `personal_notes`, THE Flask 主後端 SHALL 將自由文字寫入目前 Account ID 的 Accounts 紀錄。

### Requirement 3：Cognito 認證與受保護 API

**User Story:** 作為系統使用者，我希望透過 Cognito 安全登入，以便後端依可驗證身分隔離資料。

#### Acceptance Criteria

1. WHEN React 前端請求 `/api/auth/login`, THE Cognito 認證模組 SHALL 回傳包含 `openid`、`email`、`profile` scope 的 Hosted UI 登入網址。
2. WHEN Cognito 以 authorization code 呼叫 `/api/auth/callback`, THE Cognito 認證模組 SHALL 以 `application/x-www-form-urlencoded` 向 Cognito token endpoint 交換 token。
3. WHERE Cognito App Client 設有 Client Secret, THE Cognito 認證模組 SHALL 在 token 交換請求加入 Basic Authorization header。
4. WHEN Cognito 認證模組收到 ID Token, THE Cognito 認證模組 SHALL 驗證 RS256 簽章、audience、issuer 及過期時間。
5. WHEN 日常 API 請求只提供 ID Token, THE Cognito 認證模組 SHALL 關閉 `at_hash` 驗證。
6. IF 日常 API 請求的 RS256 簽章、audience、issuer 或過期時間任一驗證失敗, THEN THE Cognito 認證模組 SHALL 拒絕請求並回傳 HTTP 401 及 `error` 欄位。
7. WHEN Cognito 使用者首次登入, THE Cognito 認證模組 SHALL 以 ID Token 的 `sub` 建立 Accounts 紀錄。
8. WHEN Cognito callback 完成, THE Cognito 認證模組 SHALL 將瀏覽器重新導向 `{FRONTEND_URL}/auth/callback` 並附帶可用 token。
9. WHEN React 前端呼叫受保護 API, THE React 前端 SHALL 加入 `Authorization: Bearer <id_token>` header。
10. WHEN Flask 主後端驗證受保護 API 的 ID Token, THE Flask 主後端 SHALL 從 `sub` 設定 `g.user_id`。
11. IF Authorization header 缺漏、格式錯誤或 ID Token 驗證失敗, THEN THE Flask 主後端 SHALL 回傳 HTTP 401 及 `error` 欄位。

### Requirement 4：AI 語音輸入流程

**User Story:** 作為長輩，我希望以繁體中文語音與小安互動，以便降低鍵盤輸入門檻。

#### Acceptance Criteria

1. WHEN 長輩開始錄音, THE React 前端 SHALL 以 16000 Hz、單聲道取得麥克風音訊。
2. WHEN React 前端處理麥克風音訊, THE React 前端 SHALL 以 4096 frame buffer 將 Float32 音訊轉為 Int16 PCM。
3. WHEN STT WebSocket 連線開啟, THE React 前端 SHALL 以 binary frame 傳送 Int16 PCM 音訊至 `/ws/transcribe`。
4. WHEN STT 服務啟動 Transcribe 串流, THE STT 服務 SHALL 使用 `zh-TW`、16000 Hz 及 `pcm` 參數。
5. WHEN Transcribe 產生未完成辨識結果, THE STT 服務 SHALL 回傳 `{"type":"partial","transcript":"文字"}`。
6. WHEN Transcribe 產生完成辨識結果, THE STT 服務 SHALL 回傳 `{"type":"final","transcript":"文字"}`。
7. IF Transcribe SDK 缺漏或 Transcribe 串流失敗, THEN THE STT 服務 SHALL 回傳 `fallback` 訊息型別。
8. WHEN React 前端收到 `fallback` 或 STT WebSocket 發生錯誤, THE React 前端 SHALL 改用 `zh-TW` Web Speech API。
9. WHEN 長輩停止錄音且辨識文字非空白, THE React 前端 SHALL 將完成文字送至 Flask 主後端的聊天 API。

### Requirement 5：AI 陪伴回覆與語音輸出流程

**User Story:** 作為長輩，我希望小安根據個人資料、記憶卡及衛教內容回覆並朗讀，以便獲得連貫且可理解的陪伴體驗。

#### Acceptance Criteria

1. WHEN React 前端送出聊天內容, THE React 前端 SHALL 呼叫 `POST /api/chat/send` 並送出 `message` 與 `session_id`。
2. WHEN `session_id` 為 null, THE Flask 主後端 SHALL 建立 Sessions 紀錄並以訊息前 20 個字元產生 title。
3. WHEN Flask 主後端接受一輪聊天, THE Flask 主後端 SHALL 以 DynamoDB 原子 `ADD` 將 `interaction_count` 增加 1。
4. WHEN Flask 主後端準備 Call #1, THE Flask 主後端 SHALL 讀取目前 Account ID 的全部記憶卡、Accounts 個人資料及知識檢索結果。
5. WHEN Flask 主後端執行 Call #1, THE Bedrock 服務 SHALL 產生繁體中文純文字回覆。
6. WHEN Flask 主後端執行 Call #2, THE Bedrock 服務 SHALL 產生符合記憶操作結構的 JSON。
7. WHEN Call #2 產生有效記憶操作, THE Flask 主後端 SHALL 由 Python 程式執行記憶資料寫入。
8. WHEN 一輪聊天完成記憶處理, THE Flask 主後端 SHALL 將 user 與 assistant 訊息各寫入一筆 Messages 紀錄。
9. WHEN Call #1 產生文字回覆, THE Flask 主後端 SHALL 以 Polly `Zhiyu`、`cmn-CN`、`neural` 及 mp3 參數合成語音。
10. WHEN Flask 主後端回傳聊天結果, THE Flask 主後端 SHALL 回傳 `session_id`、`response`、`audio` 及 `memory_updates` 四個 key。
11. WHEN Polly 合成成功, THE Flask 主後端 SHALL 將 mp3 以 base64 字串放入 `audio`。
12. IF `audio` 為空字串或瀏覽器播放 base64 mp3 失敗, THEN THE React 前端 SHALL 以 `zh-TW` 且 rate 0.9 的 `speechSynthesis` 朗讀 `response`。
13. WHEN 小安產生一般回覆, THE 小安 SHALL 使用長輩可理解的繁體中文口語並將回覆控制在 3 至 5 句。

### Requirement 6：記憶卡與主動追蹤

**User Story:** 作為長輩或照護者，我希望對話中的明確生活資訊可被安全整理與更新，以便後續陪伴及摘要使用。

#### Acceptance Criteria

1. WHEN Flask 主後端讀取長輩記憶卡, THE Flask 主後端 SHALL 以目前 Account ID 過濾 Facts。
2. WHEN Call #2 建立 `add` 操作, THE Bedrock 服務 SHALL 僅使用 `飲食`、`活動`、`睡眠`、`用藥`、`身體`、`情緒` 或 `其他` category。
3. IF Call #2 回傳無效 JSON 或缺少 `operations`, THEN THE Flask 主後端 SHALL 回傳空記憶操作集合並維持 Facts 不變。
4. IF 記憶操作的 `track` 缺漏或型別無效, THEN THE Flask 主後端 SHALL 將 `track` 設為 `false`。
5. WHEN Python 程式執行有效 `add` 操作, THE Flask 主後端 SHALL 建立包含 `fact_id`、Account ID、category、content、track 及臺灣時間 `updated_at` 的 Facts 紀錄。
6. WHEN Python 程式準備 `update` 操作, THE Flask 主後端 SHALL 驗證 `id` 存在於 Call #2 已知的目前使用者 `fact_id` 集合。
7. IF `update` 的 `id` 不存在於已知 `fact_id` 集合, THEN THE Flask 主後端 SHALL 拒絕該筆操作並記錄 warning。
8. WHEN Python 程式執行有效 `update` 操作, THE DynamoDB 資料層 SHALL 以同一筆 transaction 寫入 FactHistory 舊內容並更新 Facts。
9. WHEN 新資訊描述既有記憶卡的相同事件且包含更新細節, THE Bedrock 服務 SHALL 產生 `update` 操作取代重複 `add` 操作。
10. WHEN `track` 為 `true` 的記憶卡進入新一輪對話上下文, THE 小安 SHALL 最多主動關心一個待追蹤事項。
11. WHEN 長輩明確表示待追蹤狀況已解決或穩定, THE Bedrock 服務 SHALL 產生將對應記憶卡 `track` 更新為 `false` 的操作。

### Requirement 7：健康知識庫與健康回覆安全

**User Story:** 作為長輩，我希望健康相關回覆可參考具來源的衛教資料，以便降低無依據內容造成的風險。

#### Acceptance Criteria

1. THE 健康知識庫 SHALL 以 HealthKnowledgeBase 儲存 `topic_id`、title、category、content、keywords、source 及 source_url。
2. WHEN 長輩送出訊息, THE 知識檢索模組 SHALL scan HealthKnowledgeBase 並比對 keywords 子字串。
3. WHEN keyword 可作為有效 regex, THE 知識檢索模組 SHALL 以不區分大小寫的 regex 比對長輩訊息。
4. WHEN 知識檢索模組命中條目, THE 知識檢索模組 SHALL 將 title、category、content、source 及 source_url 格式化為 Call #1 上下文。
5. IF HealthKnowledgeBase scan 失敗, THEN THE 知識檢索模組 SHALL 回傳空集合並記錄錯誤。
6. WHEN Call #1 回答命中知識主題, THE 小安 SHALL 優先參考命中條目的 content。
7. THE 小安 SHALL 以現有個人資料、記憶卡與命中知識條目作為具體藥名、病名、劑量及療程的唯一資料來源。
8. WHEN 小安提供健康資訊, THE 小安 SHALL 避免將衛教資訊表述為個人醫療診斷或治療建議。

### Requirement 8：追蹤綁定與權限

**User Story:** 作為長輩，我希望照護者經綁定碼及本人核准後才能查看資料，以便控制健康資訊存取。

#### Acceptance Criteria

1. WHEN 長輩請求綁定碼且 Accounts 缺少綁定碼, THE Flask 主後端 SHALL 產生六位數字綁定碼。
2. WHEN 長輩自訂綁定碼, THE Flask 主後端 SHALL 僅接受六位數字字串。
3. WHEN 照護者提交追蹤請求, THE Flask 主後端 SHALL 要求 `followee_handle` 及 `binding_code`。
4. IF 提交的綁定碼與長輩 Accounts 綁定碼不完全相符, THEN THE Flask 主後端 SHALL 回傳 HTTP 403。
5. WHEN 綁定碼相符且不存在未拒絕的相同追蹤關係, THE Flask 主後端 SHALL 建立 `pending` Follows 紀錄。
6. WHEN 長輩核准屬於目前 Account ID 的 pending 請求, THE Flask 主後端 SHALL 將追蹤狀態更新為 `approved`。
7. WHEN 長輩拒絕屬於目前 Account ID 的 pending 請求, THE Flask 主後端 SHALL 將追蹤狀態更新為 `rejected` 並保留 Follows 紀錄。
8. IF 核准或拒絕請求的 `followee_id` 與目前 Account ID 不相符, THEN THE Flask 主後端 SHALL 回傳 HTTP 403。
9. WHEN 使用者搜尋 account_handle, THE Flask 主後端 SHALL 僅回傳 account_id、account_handle、display_name 及 avatar_url。
10. WHEN 帶有目標 Account ID 的健康總覽、洞察或摘要 API 被呼叫, THE Flask 主後端 SHALL 允許本人或核准追蹤者存取。
11. IF 帶有目標 Account ID 的健康總覽、洞察或摘要 API 呼叫者不是本人且不是核准追蹤者, THEN THE Flask 主後端 SHALL 回傳 HTTP 403。
12. WHEN 使用者讀取 session 訊息, THE Flask 主後端 SHALL 驗證 Sessions 的 Account ID 與目前 Account ID 相符。

### Requirement 9：健康總覽與跨日洞察

**User Story:** 作為核准追蹤者，我希望查看長輩近期記憶卡、互動次數與摘要，以便掌握生活近況。

#### Acceptance Criteria

1. WHEN 本人或核准追蹤者請求健康總覽, THE Flask 主後端 SHALL 回傳 account_id、display_name 及 interaction_count。
2. WHEN 本人或核准追蹤者請求健康總覽, THE Flask 主後端 SHALL 回傳最多 14 筆依日期新到舊排序的摘要。
3. WHEN 本人或核准追蹤者請求健康總覽, THE Flask 主後端 SHALL 回傳最多 20 筆依 `updated_at` 新到舊排序的用藥記憶卡。
4. WHEN 本人或核准追蹤者請求健康總覽, THE Flask 主後端 SHALL 回傳最多 20 筆依 `updated_at` 新到舊排序的身體、睡眠及活動記憶卡。
5. WHEN 現況健康總覽包含飲食、情緒及其他分類, THE React 前端 SHALL 在記憶足跡總覽呈現對應記憶卡。
6. WHEN 本人或核准追蹤者請求跨日洞察, THE Flask 主後端 SHALL 僅分析臺灣時間近 7 天的 Facts。
7. WHEN 同一 category 出現在至少 3 個不同日期, THE Flask 主後端 SHALL 將該 category 納入跨日洞察候選模式。
8. IF 近 7 天沒有 Facts 或沒有符合門檻的候選模式, THEN THE Flask 主後端 SHALL 回傳 `insights: null` 及說明訊息。
9. WHEN Bedrock 服務產生跨日洞察, THE Flask 主後端 SHALL 回傳 insights 及 patterns_found。

### Requirement 10：每日摘要與每週摘要

**User Story:** 作為長輩或核准追蹤者，我希望取得依生活記憶整理的每日及每週摘要，以便以時間軸理解近期狀況。

#### Acceptance Criteria

1. WHEN 本人或核准追蹤者請求每日摘要, THE Flask 主後端 SHALL 選取目標 Account ID 在臺灣日期當天更新的 Facts。
2. WHEN 每日摘要服務取得當日 Facts, THE 每日摘要服務 SHALL 依 category 分組後呼叫 Bedrock 服務。
3. WHEN Bedrock 服務產生每日摘要, THE 每日摘要服務 SHALL 以 `{account_id}#{YYYY-MM-DD}` 主鍵寫入 DailySummaries。
4. IF 目標日期沒有 Facts, THEN THE 每日摘要服務 SHALL 回傳 `summary: null` 及零筆事實狀態。
5. WHEN 本人或核准追蹤者請求每週摘要, THE Flask 主後端 SHALL 只使用 `summary_type` 為 `daily` 的 DailySummaries 作為來源。
6. WHEN 可用每日摘要涵蓋最近 7 天, THE Flask 主後端 SHALL 以最近 7 天的每日摘要產生每週摘要。
7. WHEN 可用每日摘要不足 7 天, THE Flask 主後端 SHALL 以全部可用每日摘要產生每週摘要。
8. WHEN Bedrock 服務產生每週摘要, THE Flask 主後端 SHALL 以 `{account_id}#week-{YYYY-MM-DD}` 主鍵及 `summary_type: weekly` 寫入 DailySummaries。
9. WHEN 本人或核准追蹤者請求摘要列表, THE Flask 主後端 SHALL 依 date 新到舊回傳 daily 與 weekly 摘要。
10. WHEN React 前端顯示摘要列表, THE React 前端 SHALL 分區呈現每日摘要與每週摘要。

### Requirement 11：摘要排程、站內通知與 SES 郵件

**User Story:** 作為核准追蹤者，我希望設定每日摘要時間並收到通知，以便不必每天手動觸發摘要。

#### Acceptance Criteria

1. WHEN 核准追蹤者設定每日摘要時間, THE Flask 主後端 SHALL 僅接受 `HH:MM` 24 小時制臺灣時間。
2. WHEN 核准追蹤者傳送 null 或空字串時間, THE Flask 主後端 SHALL 關閉對應追蹤關係的摘要排程。
3. IF 摘要排程設定呼叫者不是目標長輩的核准追蹤者, THEN THE Flask 主後端 SHALL 回傳 HTTP 403。
4. WHILE Flask 主後端運行, THE 摘要排程器 SHALL 每 60 秒檢查已核准且具有排程時間的 Follows。
5. WHEN 同一長輩具有多位已設定排程的核准追蹤者, THE 摘要排程器 SHALL 使用最早的設定時間作為每日觸發時間。
6. WHEN 臺灣時間已到達設定時間且當日摘要不存在, THE 摘要排程器 SHALL 產生當日摘要。
7. WHEN 摘要排程器在設定時間後重新啟動且當日摘要不存在, THE 摘要排程器 SHALL 補產生當日摘要。
8. WHEN 摘要排程器新產生每日摘要, THE SES 郵件模組 SHALL 向所有已設定排程的核准追蹤者查詢 Cognito email。
9. WHERE `SES_ENABLED` 為 true 且 `SES_SENDER_EMAIL` 非空, THE SES 郵件模組 SHALL 寄送 UTF-8 純文字及 HTML 每日摘要郵件。
10. IF SES 郵件寄送失敗, THEN THE SES 郵件模組 SHALL 保留已寫入的每日摘要並記錄寄送錯誤。
11. WHEN React 前端偵測追蹤長輩的當日每日摘要且摘要尚未標記已讀, THE 站內通知 SHALL 顯示摘要通知。
12. WHEN 照護者開啟摘要通知, THE React 前端 SHALL 導向對應長輩的 AI 摘要分頁及摘要日期。
13. WHEN React 前端判定摘要已讀, THE React 前端 SHALL 以 Account ID、摘要日期及內容 fingerprint 將已讀狀態記錄於 localStorage。
14. WHEN 長輩收到 pending 追蹤請求, THE 站內通知 SHALL 提供核准及拒絕操作。

### Requirement 12：DynamoDB 資料模型

**User Story:** 作為開發團隊，我希望資料表與欄位格式固定，以便維持現有 API、AI 流程及權限檢查的相容性。

#### Acceptance Criteria

1. THE DynamoDB 資料層 SHALL 使用 Accounts、Facts、FactHistory、Sessions、Messages、Follows、DailySummaries 及 HealthKnowledgeBase 八張資料表。
2. THE DynamoDB 資料層 SHALL 將八張資料表設為 PAY_PER_REQUEST billing mode。
3. THE Accounts SHALL 以 Account ID 作為 partition key，並儲存帳號資料、角色、綁定碼、同意紀錄、個人筆記及互動次數。
4. THE Accounts SHALL 將 chronic_conditions、current_medications 及 allergies 儲存為 JSON 字串欄位。
5. THE Facts SHALL 以 fact_id 作為 partition key，並以 account_id-index 支援 Account ID 關聯。
6. THE FactHistory SHALL 以 history_id 作為 partition key，並儲存 fact_id、old_content 及 replaced_at。
7. THE Sessions SHALL 以 session_id 作為 partition key，並儲存 Account ID、title 及 created_at。
8. THE Messages SHALL 以 message_id 作為 partition key，並儲存 session_id、role、content、extracted 及 created_at。
9. THE Follows SHALL 以 follow_id 作為 partition key，並提供 follower_id-index 及 followee_id-index。
10. THE DailySummaries SHALL 以 `account_id#date` 作為 partition key，並儲存 Account ID、date、summary_type 及 summary_text。
11. THE HealthKnowledgeBase SHALL 以 topic_id 作為 partition key，並儲存衛教內容、關鍵字及來源。
12. WHEN Flask 主後端產生業務時間戳, THE Flask 主後端 SHALL 使用臺灣時間 ISO 8601 格式。
13. WHEN Flask 主後端查詢使用者 Facts, THE Flask 主後端 SHALL 將 Account ID 納入過濾條件。

### Requirement 13：非功能需求與故障降級

**User Story:** 作為開發與展示團隊，我希望系統具備可驗證的安全、相容、可操作及故障降級行為，以便在競賽環境穩定展示。

#### Acceptance Criteria

1. THE 智慧長照陪伴系統 SHALL 維持 Vite、React 19、TypeScript、Flask、FastAPI STT 服務、Cognito、Bedrock、Transcribe、Polly、SES 及 DynamoDB 技術組成。
2. THE React 前端 SHALL 使用原生 fetch 與 Flask 主後端交換 `application/json`。
3. THE Flask 主後端 SHALL 以 `{"error":"訊息"}` 及對應 HTTP status code 回傳 API 錯誤。
4. THE Cognito 認證模組 SHALL 將 JWKS 快取於 Flask 主後端記憶體。
5. WHEN Cognito token endpoint 或 JWKS 發生可重試的連線錯誤, THE Cognito 認證模組 SHALL 最多重試 5 次並使用 0.5、1、2、4 秒指數退避序列。
6. WHEN React 前端執行 Graceful Degradation, THE React 前端 SHALL 保留文字聊天作為語音服務以外的輸入方式。
7. WHEN Polly 或 Transcribe 不可用, THE 智慧長照陪伴系統 SHALL 使用既有瀏覽器語音 fallback 而不改變聊天 API 格式。
8. WHEN 摘要排程器處理單一 Account ID 失敗, THE 摘要排程器 SHALL 記錄失敗並繼續處理其他 Account ID。
9. WHEN 摘要排程器 scan Follows, THE 摘要排程器 SHALL 處理 LastEvaluatedKey 分頁直到掃描完成。
10. THE 智慧長照陪伴系統 SHALL 以 `start.bat` 分別啟動 Flask 主後端、STT 服務及 React 前端三個進程。
11. THE 智慧長照陪伴系統 SHALL 將 AWS 憑證、Cognito 設定、模型 ID、SES 設定及服務 URL 由環境變數提供。
12. WHEN 使用者存取他人資料, THE Flask 主後端 SHALL 先完成追蹤關係授權判斷再回傳健康資料。

### Requirement 14：限制、驗收基線與架構治理

**User Story:** 作為專案負責人，我希望已知限制、架構鎖定及驗收邊界明確，以便提案內容不超過現有實作證據。

#### Acceptance Criteria

1. WHILE Amazon SES 帳號處於 sandbox mode, THE SES 郵件模組 SHALL 僅向已在 SES 驗證的收件地址完成寄送。
2. WHILE 摘要排程器採 Flask daemon thread, THE 摘要排程器 SHALL 依賴 Flask 主後端進程持續運行。
3. WHILE DynamoDB 查詢採 scan 與 FilterExpression, THE 智慧長照陪伴系統 SHALL 將單次 scan 1 MB 與分頁處理列為資料量限制。
4. WHILE 健康知識庫採關鍵字與 regex 檢索, THE 知識檢索模組 SHALL 將語意相近但字面不同的未命中情況列為檢索限制。
5. WHILE 開發環境採臨時 AWS 憑證, THE 智慧長照陪伴系統 SHALL 將憑證到期列為 Bedrock、DynamoDB、Polly、Transcribe、SES 及 Cognito 管理 API 的共同運行限制。
6. THE 智慧長照陪伴系統 SHALL 維持 Transcribe → React 前端 → Flask 主後端 → Bedrock 服務 → Flask 主後端 → Polly 的語音陪伴流程。
7. THE Bedrock 服務 SHALL 維持 Call #1 產生回覆及 Call #2 產生記憶操作的兩次獨立呼叫架構。
8. THE DynamoDB 資料層 SHALL 維持 Python 寫入記憶資料及 LLM 僅輸出 JSON 指令的責任分工。
9. THE 智慧長照陪伴系統 SHALL 維持聊天回應內嵌 base64 mp3 的 JSON 傳輸格式。
10. THE 智慧長照陪伴系統 SHALL 維持八張 DynamoDB 資料表、現有 API key 名稱及現有音訊參數。
11. WHEN 規劃需要改變固定工具、資料流、API、欄位、音訊格式、Bedrock 呼叫結構、記憶守門規則或權限邏輯, THE 開發團隊 SHALL 先依架構鎖定規格提出討論。
12. WHEN Git 變更準備整合, THE 開發團隊 SHALL 透過 branch 與 PR 整合並以 revert 執行還原。
13. THE 智慧長照陪伴系統 SHALL 將實際 AWS 整合測試、前後端 build 與權限負向測試結果作為功能完成證據。
14. IF 功能只有文件敘述且缺少程式路徑或自動化驗證證據, THEN THE 專案規格 SHALL 將功能標示為未驗證而非已完成。

## 現況與架構鎖定規格差異

下列差異均來自現有程式碼或文件交叉比對。本需求文件不直接修改差異，也不將差異視為已通過驗收：

1. **聊天 Call #2 時序**：架構鎖定規格要求固定處理順序並回傳實際 `memory_updates`；`backend/routes/chat.py` 目前以 daemon thread 平行執行 Call #2 與訊息寫入，HTTP response 固定回傳空 `memory_updates`。此差異屬呼叫架構變更，後續設計不得自行採用現況，需先依架構鎖定規格討論。
2. **同意失敗行為**：`ConsentModal.tsx` 在同意 API 失敗時仍呼叫 `onConsented()`，與「未同意前阻擋功能」不一致。
3. **同意時間格式**：`routes/profile.py` 以 UTC `Z` 產生 consent timestamp，與架構鎖定規格要求後端臺灣時間 ISO 8601 不一致。
4. **Follows 欄位差異**：排程程式使用 `daily_summary_time`，但架構鎖定規格第 3.6 節列出的 Follows 儲存格式未包含該欄位；現有功能文件已描述該欄位。後續設計需將此衝突列為待確認事項，不可默默改表規格。
5. **Facts 欄位差異**：照護者關懷事項程式使用 `source`、`source_account_id`、`require_confirmation`，但架構鎖定規格第 3.2 節未列出上述欄位。關懷事項 API 屬現有程式路徑，但不納入鎖定資料模型的已核准基線。
6. **健康總覽 response 差異**：架構鎖定規格列出 medication_facts 與 body_facts；現有後端及前端另使用 diet_facts、mood_facts、other_facts。新增 response key 涉及固定 API 格式，需先確認基線。
7. **跨日洞察入口**：後端 API 已實作，照護者頁面觸發按鈕目前註解停用；提案可說明後端能力，不可宣稱照護者目前能從 UI 觸發。
8. **每週摘要範圍**：文件敘述為資料達 7 天時取最近 7 天、不足時取全部；現有程式依最近 7 個日曆日過濾，只在該範圍完全無資料時改取全部。此行為需以 Requirement 10 驗收。
9. **摘要重複產生**：文件與架構說明以當日摘要存在作為去重；現有程式在每次儲存排程後加入一次強制重產生標記。此展示便利行為需與正式去重基線分開驗收。
10. **文件未落地項目**：Messages 30 天清除、完整資料刪除、正式環境 HTTPS/WSS 未找到對應程式或部署設定，不列為目前已完成。
11. **前端 Mock fallback**：`MockDataContext.tsx` 仍保留模擬長輩、記憶卡及部分 fallback 方法；正式驗收應以 Cognito 身分與後端 API 資料為準。

## 驗收策略總覽

- 單元驗收：記憶操作 JSON 驗證、category 白名單、track 預設、時間判斷、摘要分組、通知 fingerprint、資料轉換。
- API 驗收：Cognito 保護路由、聊天 response schema、追蹤狀態、本人與核准追蹤者權限、健康總覽、摘要及排程格式。
- 整合驗收：Transcribe 串流與 fallback、Bedrock 雙呼叫、Polly 與 fallback、DynamoDB transaction、SES sandbox 寄送。
- UI 驗收：角色分流、同意阻擋、語音文字顯示、摘要時間軸、通知鈴鐺、綁定核准流程。
- 負向驗收：無效 JWT、錯誤綁定碼、未核准追蹤者、無效記憶 JSON、幻覺 fact ID、無效 HH:MM、AWS 憑證到期。
- 完成判定：每項 Acceptance Criteria 必須具備程式路徑及測試或可重現驗證紀錄；只存在於 docs 的敘述不構成功能完成證據。

## Git 與變更治理

- 本規格建立不修改任何產品程式碼。
- 後續實作不得直接 push main 或 master。
- 後續整合一律使用 branch 與 PR。
- 後續還原一律使用 revert，不使用 force push。
- 現有工作樹中的 `docs/系統架構圖.drawio` 與 `docs/系統架構圖.md` 修改不屬於本規格建立工作，必須保留。
