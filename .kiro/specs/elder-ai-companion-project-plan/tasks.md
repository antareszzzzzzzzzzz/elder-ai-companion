# 實作任務：智慧長照陪伴系統

## 文件資訊

- 規格名稱：`elder-ai-companion-project-plan`
- 依據：`requirements.md`、`design.md`
- 性質：依現有專案反向模擬的 Kiro 開發工作分解
- 狀態說明：本文件用來呈現規劃順序，不代表本次建立 Spec 時已重新執行所有任務

## 任務清單

- [ ] 1. 建立專案骨架與環境設定
  - [ ] 1.1 建立 Vite + React 19 + TypeScript 前端與路由骨架
  - [ ] 1.2 建立 Flask 主後端、Blueprint 與 CORS 設定
  - [ ] 1.3 建立 FastAPI STT Service 與 WebSocket 端點
  - [ ] 1.4 建立 `.env.example`、AWS 區域與各服務環境變數
  - [ ] 1.5 建立 `start.bat`，以三個進程啟動前端、Flask 與 STT
  - _需求：R13.1、R13.2、R13.10、R13.11_

- [ ] 2. 建立 DynamoDB 資料層
  - [ ] 2.1 建立 Accounts、Facts、FactHistory、Sessions 與 Messages
  - [ ] 2.2 建立 Follows、DailySummaries 與 HealthKnowledgeBase
  - [ ] 2.3 建立 follower、followee 與 account 關聯索引
  - [ ] 2.4 實作 PAY_PER_REQUEST 建表腳本與資料存取服務
  - [ ] 2.5 實作 UTC+8 ISO 8601 時間產生規則
  - [ ] 2.6 驗證 Accounts JSON 字串欄位及 Facts 使用者隔離
  - _需求：R12.1–R12.13_

- [ ] 3. 實作 Cognito 認證與角色流程
  - [ ] 3.1 產生 Hosted UI authorization code flow 登入網址
  - [ ] 3.2 實作 callback、token 交換與首次 Accounts 建立
  - [ ] 3.3 實作 JWKS 快取及 RS256、audience、issuer、expiry 驗證
  - [ ] 3.4 建立 Bearer Token middleware 並設定 `g.user_id`
  - [ ] 3.5 實作 React token 儲存、callback 與角色頁面分流
  - [ ] 3.6 驗證無效、缺漏及過期 token 均回傳 401
  - _需求：R2.1–R2.2、R3.1–R3.11_

- [ ] 4. 實作個人資料與使用同意
  - [ ] 4.1 建立個人資料讀取與白名單更新 API
  - [ ] 4.2 實作慢性病、用藥與過敏資料的 JSON 字串轉換
  - [ ] 4.3 建立角色更新、綁定碼、個人筆記與搜尋 API
  - [ ] 4.4 建立長輩使用同意畫面及 consent timestamp 寫入
  - [ ] 4.5 驗證同意失敗時仍維持未同意狀態
  - _需求：R2.3–R2.8、R8.1–R8.2、R8.9_

- [ ] 5. 實作 STT 語音輸入
  - [ ] 5.1 在 React 取得 16 kHz、mono 麥克風音訊
  - [ ] 5.2 將 Float32 轉為 PCM Int16 binary 並經 WebSocket 傳送
  - [ ] 5.3 串接 Amazon Transcribe Streaming `zh-TW`
  - [ ] 5.4 回傳 partial、final 與 fallback 事件
  - [ ] 5.5 在 React 實作 Web Speech API 降級
  - [ ] 5.6 驗證 final 文字由 React 送往 Flask，而非 STT 直接呼叫 Bedrock
  - _需求：R4.1–R4.9、R13.6–R13.7、R14.6_

- [ ] 6. 實作 Bedrock AI 對話主流程
  - [ ] 6.1 建立支援 Anthropic／Nova 格式的單一 `invoke_bedrock` 入口
  - [ ] 6.2 建立 session 與 interaction count 原子更新
  - [ ] 6.3 讀取 profile、目前使用者 Facts 與知識庫命中內容
  - [ ] 6.4 實作 Call #1 產生繁體中文陪伴回覆
  - [ ] 6.5 實作 Call #2 產生記憶操作 JSON
  - [ ] 6.6 儲存 user／assistant Messages
  - [ ] 6.7 回傳固定的 session_id、response、audio、memory_updates
  - [ ] 6.8 驗證兩次 Bedrock 呼叫的順序與責任分工
  - _需求：R5.1–R5.8、R5.10、R14.7–R14.9_

- [ ] 7. 實作記憶卡安全寫入
  - [ ] 7.1 實作七種 category 白名單與 track 安全預設
  - [ ] 7.2 實作無效 JSON 的空操作 safety net
  - [ ] 7.3 實作 add 記憶卡與 Account ID 隔離
  - [ ] 7.4 驗證 update ID 屬於目前使用者已知 Facts
  - [ ] 7.5 以 transaction 同步寫入 FactHistory 並更新 Facts
  - [ ] 7.6 實作前端記憶卡分類與追蹤狀態顯示
  - _需求：R6.1–R6.11、R12.5–R12.6_

- [ ] 8. 導入健康知識庫
  - [ ] 8.1 建立 HealthKnowledgeBase 匯入腳本
  - [ ] 8.2 實作 scan、關鍵字子字串與 regex 比對
  - [ ] 8.3 將命中內容、來源及網址加入 Call #1 上下文
  - [ ] 8.4 實作查詢失敗時的空內容降級
  - [ ] 8.5 驗證 AI 不會將衛教內容表述成診斷或治療建議
  - _需求：R7.1–R7.8、R14.4_

- [ ] 9. 實作 Polly 語音輸出
  - [ ] 9.1 由 Flask 將 Bedrock 回覆交給 Polly
  - [ ] 9.2 使用 Zhiyu、cmn-CN、neural 與 mp3 參數
  - [ ] 9.3 將 mp3 轉成 base64 放入聊天 JSON
  - [ ] 9.4 在 React 播放音訊並提供 speechSynthesis 降級
  - [ ] 9.5 驗證完整 Transcribe → React → Flask → Bedrock → Flask → Polly 流程
  - _需求：R5.9–R5.13、R13.7、R14.6、R14.9_

- [ ] 10. 實作追蹤綁定與授權
  - [ ] 10.1 建立六位數綁定碼驗證與追蹤請求 API
  - [ ] 10.2 實作 pending、approved、rejected 狀態流程
  - [ ] 10.3 建立長輩核准／拒絕介面與通知
  - [ ] 10.4 建立本人或 approved 追蹤者共用權限檢查
  - [ ] 10.5 保護健康總覽、洞察、摘要與 session 訊息
  - [ ] 10.6 驗證錯誤綁定碼、pending 與未授權使用者均無法讀取資料
  - _需求：R8.1–R8.12_

- [ ] 11. 實作健康總覽與跨日洞察
  - [ ] 11.1 彙整互動次數、近期摘要與各分類 Facts
  - [ ] 11.2 建立照護者長輩詳情頁及記憶足跡
  - [ ] 11.3 依近七天且同類別至少三日建立洞察候選模式
  - [ ] 11.4 呼叫 Bedrock 產生跨日洞察
  - [ ] 11.5 驗證空資料、模式不足與未授權情境
  - _需求：R9.1–R9.9_

- [ ] 12. 實作每日與每週摘要
  - [ ] 12.1 依臺灣日期讀取並分類當日 Facts
  - [ ] 12.2 呼叫 Bedrock 產生每日摘要並寫入 DailySummaries
  - [ ] 12.3 由 daily summaries 產生每週摘要
  - [ ] 12.4 建立摘要列表 API 與前端時間軸
  - [ ] 12.5 驗證無 Facts、資料不足、排序與主鍵格式
  - _需求：R10.1–R10.10_

- [ ] 13. 實作摘要排程與通知
  - [ ] 13.1 在 Follows 建立 `HH:MM` 排程設定與停用流程
  - [ ] 13.2 建立每 60 秒執行的應用內排程器
  - [ ] 13.3 實作到點執行、當日去重與停機後補跑
  - [ ] 13.4 由 Cognito Account ID 查詢照護者 email
  - [ ] 13.5 透過 SES 寄送 UTF-8 純文字與 HTML 摘要
  - [ ] 13.6 建立站內摘要通知、已讀 fingerprint 與日期跳轉
  - [ ] 13.7 驗證 SES sandbox、寄送失敗及多追蹤者情境
  - _需求：R11.1–R11.14、R13.8–R13.9、R14.1–R14.2_

- [ ] 14. 完成整合、安全與展示驗證
  - [ ] 14.1 執行前端 build、Python compile/import 與三服務 smoke test
  - [ ] 14.2 驗證 Cognito、Bedrock、DynamoDB、Transcribe、Polly 與 SES 實際整合
  - [ ] 14.3 執行本人／approved／pending／陌生使用者權限矩陣測試
  - [ ] 14.4 驗證 AWS 憑證失效、服務不可用與 fallback
  - [ ] 14.5 比對 API schema、八張資料表與架構鎖定規格
  - [ ] 14.6 記錄現況差異，設計變更先討論，不直接改動鎖定架構
  - [ ] 14.7 以 branch + PR 整合，回復時只使用 revert
  - _需求：R13.1–R13.12、R14.3–R14.14_

## 里程碑

1. **M1 基礎平台**：任務 1–4，完成環境、資料、認證與角色。
2. **M2 AI 陪伴核心**：任務 5–9，完成語音、Bedrock、記憶、知識庫與 Polly。
3. **M3 照護協作**：任務 10–11，完成追蹤授權與健康總覽。
4. **M4 摘要通知**：任務 12–13，完成摘要、排程及 SES。
5. **M5 驗收交付**：任務 14，完成整合、安全與展示驗證。

## 完成定義

- 每一項需求均可追蹤至設計章節與實作任務。
- 驗收條件具有可重現的測試或操作紀錄。
- 語音、文字、認證、記憶、權限、摘要及通知主流程可完整展示。
- 未實作或未驗證能力不得宣稱完成。
- 不直接 push main/master；整合使用 PR，還原使用 revert。
