# 廠商工資試算與 Excel / Google Sheet 雙向核對系統

專為工務工程、人力派遣與工資核算打造的現代化 Web 應用系統，依據 **Vibe Coding 理念** 開發，具備「純前端極速運算、3 位授權人員登入、Google Sheet 雙向連動、指定 8 間廠商階梯時薪試算」等核心功能，可無縫部署至 **GitHub Pages** 免費運作！

---

## 🌟 核心功能特色

### 1. 指定 8 間廠商名單
- **銘暘(凱宥)**、**源信**、**杜豪**、**彤勝**、**安迅**、**協泰**、**建德**、**優質人資**。
- 支援智慧名稱辨識（Excel 寫「銘暘」或「凱宥」皆能精準匹配）。
- 亦可於介面中彈性新增自訂廠商。

### 2. 嚴謹的三段式階梯時薪計費
- **前 8 小時（標準工時）**：每小時 **$275**
- **第 9~10 小時（後 2 小時加班）**：每小時 **$280**
- **超過 10 小時（第 11 小時起加班）**：每小時 **$345**
- **額外費用**：手動填報津貼/餐費/交通加項。
- **營業稅**：請款總額加計 **5% 營業稅**（明確列出未稅額、5% 稅金與含稅給付總額）。

### 3. 限定 3 位人員權限控管與第三方 Google 快速登入
- **限定 3 位授權人員名單**：
  - **人員 1**：Lika（職稱：管理審核 / 預設帳號：`lika` / 預設密碼：`123456`）
  - **人員 2**：Tracy（職稱：會計核算 / 預設帳號：`tracy` / 預設密碼：`123456`）
  - **人員 3**：Aaliyah（職稱：出納管理 / 預設帳號：`aaliyah` / 預設密碼：`123456`）
- **第三方 Google 官方一鍵登入 (Sign in with Google)**：
  - 整合 Google 最新 **Google Identity Services (GIS)** 認證標準。
  - 支援為 Lika、Tracy、Aaliyah 3 位人員分別綁定專屬的 Google/Gmail 信箱。
  - 登入時會自動核驗 Google 身分：**只有這 3 位人員已綁定的 Google 帳號才能通過驗證進入系統**，若使用其他 Google 帳號會被安全阻擋！
  - 登入後右上角操作人員標籤會即時顯示 **Google 大頭照** 與 Google 驗證綠勾標章。
  - 同時保留原有密碼登入作為備援雙軌防護。
- 登入後於右上角點選「人員設定」可隨時修改顯示姓名、自選密碼、綁定 Google 信箱或更換 Google OAuth Client ID。
- 每次回傳 Google Sheet 或匯出報表，皆會自動記錄經手操作人員姓名與 Google 信箱，確保稽核紀錄完整。

### 4. Google 試算表雙向連動（讀取核對 + 回傳寫入）
- **線上即時讀取核對**：
  - 貼上 Google 試算表連結（權限設為「知道連結的使用者都能檢視」），一秒抓取資料自動分類加總與異常比對。
- **回傳寫入 Google 試算表 (Google Apps Script)**：
  - 透過隨附的 `google_apps_script.gs` 輕量雲端腳本，點擊「**🚀 回傳 Google Sheet**」，即可將請款總表直接寫回 Google 試算表，自動建立以當天日期命名的新工作表（例如：`2026-09-12_請款試算`）。

### 5. 異常檢測與 Excel 報表匯出
- 自動抓出時薪非標準階梯、工時過長（>12h）與算額不符之工單列。
- 一鍵下載標準 Excel 請款範本。
- 一鍵匯出包含「手動請款總表」、「核對差異表」、「異常警示清單」等多頁籤的 `.xlsx` 報表。

---

## ⚡ Google Apps Script (GAS) 設定教學（只要 3 步驟）

若要使用「回傳資料寫入 Google 試算表」功能，請依照以下步驟設定您的 Google 試算表：

1. **開啟 Apps Script**：
   - 打開您的 Google 試算表，點擊上方選單的 **「擴充功能」➔「Apps Script」**。
2. **貼上腳本程式碼**：
   - 清空編輯器裡的內容，打開專案裡的 **`google_apps_script.gs`**，將內容**全部複製並貼上**，按儲存 (⌘+S / Ctrl+S)。
3. **發布為網頁應用程式**：
   - 點擊右上角藍色的 **「部署」➔「新增部署」**。
   - 種類選擇 **「網頁應用程式 (Web app)」**。
   - 「誰可以存取 (Who has access)」務必選擇 **「所有人 (Anyone)」**。
   - 點擊「部署」，授權 Google 帳號後，複製產生的 **網頁應用程式網址 (Web App URL)**。
4. **貼回網頁**：
   - 回到網頁系統，切換至「功能 2 ➔ 線上讀取 Google 試算表」下方的「回傳資料設定」，貼上該網址並點擊「儲存網址」。
   - 以後只要點擊頂部綠色的 **「回傳 Google Sheet」**，資料就會即時自動寫入您的 Google 試算表中！

---

## 🔑 Google 第三方登入（OAuth Client ID）設定教學（只要 2 分鐘）

若要啟用「使用 Google 帳號快速登入」功能，請依照以下步驟免費取得一組 Google OAuth Client ID：

1. 前往 **[Google Cloud 控制台 憑證中心](https://console.cloud.google.com/apis/credentials)**，若尚未建立專案，請建立一個免費新專案（例如：`工資核算系統`）。
2. 若首次使用，請先點擊左側 **「OAuth 同意畫面」** ➔ 選擇 **「外部 (External)」** ➔ 填寫應用程式名稱（如「廠商工資系統」）與您的電子郵件即可儲存。
3. 點擊頂部 **「建立憑證」➔ 選擇「OAuth 用戶端 ID」**：
   - 應用程式類型：選擇 **「網頁應用程式 (Web application)」**
   - 名稱：可填「GitHub Pages 工資系統」
   - **已授權的 JavaScript 來源**（務必加入以下網址）：
     - 線上網址：`https://tracy094.github.io`
     - 本機測試：`http://localhost`
4. 點擊 **「建立」**，畫面會彈出您的 **用戶端編號 (Client ID)**（格式類似：`xxxxxx-xxxxxx.apps.googleusercontent.com`）。
5. 回到工資系統網頁：
   - 點擊右上角 **「人員設定」**。
   - 在「Google 第三方登入 Client ID 設定」欄位中貼上剛剛複製的 Client ID，點擊 **「儲存 ID」**。
   - 同時為 **Lika / Tracy / Aaliyah** 填入各自要綁定的 Gmail 信箱並點擊「儲存變更」。
   - 完成！之後就可以直接點擊「使用 Google 帳號快速登入」一鍵登入！

---

## 🚀 如何部署至 GitHub Pages（免費線上使用）

本系統為**純靜態網頁（Zero-Backend）**，只要將專案檔案上傳至 GitHub 並開啟 GitHub Pages，即可免費獲得永久網址：

1. 登入 [GitHub](https://github.com/) 進入您的 Repository（例如：`tracy094/vendor-payroll`）。
2. 點擊 **Add file ➔ Upload files**。
3. 把本專案的最新檔案拖曳進去：
   - `index.html`
   - `app.js`
   - `styles.css`
   - `README.md`
   - `google_apps_script.gs`
4. 點擊下方綠色按鈕 **Commit changes**。
5. 等待 30 秒至 1 分鐘，您的線上專屬網址：
   👉 **`https://tracy094.github.io/vendor-payroll/`**
   就會自動更新上線！
