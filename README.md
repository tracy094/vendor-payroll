# 廠商工資試算與 Excel 核對系統 (Vendor Payroll & Reconciliation Web App)

專為工程、人力派遣與工務請款設計的純前端 Web 應用系統，支援 8 間預設廠商階梯時薪試算、Excel 請款明細讀取核對、異常時薪/工時警示、雙向差異對帳以及 Excel 多頁籤報表匯出。

---

## 🌟 核心特色

1. **8 間預設廠商支援**：
   - 銘暘、源信、杜豪、彤勝、安迅、協泰、建德、優質人資（支援動態新增自訂廠商）。
2. **三段式階梯時薪計費規章**：
   - **標準工時（前 8 小時）**：每小時 **$275**
   - **加班工時 1（第 9~10 小時，後 2 小時）**：每小時 **$280**
   - **加班工時 2（超過 10 小時起，第 11 小時以上）**：每小時 **$345**
   - **營業稅**：請款總額加計 **5% 營業稅**（明確列出未稅額、5%稅金與含稅總額）。
3. **Excel 檔案智慧解析**：
   - 支援拖曳或點選上傳 `.xlsx` / `.xls` 檔案。
   - 瀏覽器本地透過 `FileReader` 與 `SheetJS` 極速解析，無後端伺服器，資料絕不外流。
   - 自動依 8 間廠商彙整出工筆數、各階梯工時、額外津貼與請款金額。
4. **異常時薪與工時警示檢測**：
   - 自動抓出申報時薪非 $275/$280/$345 之紀錄。
   - 自動抓出單日申報工時 > 12 小時或算式不符階梯標籤之工單。
   - 獨立異常清單與風險等級標籤，方便核對人員一鍵覆核。
5. **雙向交叉比對（Diff Analysis）**：
   - 即時比對「手動試算」vs「Excel 上傳」之金額與工時差異。
   - 自動標記「完全吻合（綠）」、「金額不符（紅）」、「單邊有資料（黃/藍）」。
6. **一鍵下載與匯出**：
   - 提供「標準 Excel 範本下載」。
   - 一鍵匯出包含「手動試算總表」、「核對差異表」、「異常警示清單」、「解析明細」之多頁籤 `.xlsx` 請款報表。

---

## 🚀 如何部署至 GitHub Pages（免費線上使用）

本系統為**純靜態網頁（Zero-Backend）**，只要將專案上傳至 GitHub 並開啟 GitHub Pages，即可擁有專屬的線上網址：

### 步驟 1：在 GitHub 建立新儲存庫 (Repository)
1. 登入 [GitHub](https://github.com/)。
2. 點擊右上角 `+` -> **New repository**。
3. Repository name 輸入例如 `vendor-payroll`。
4. 設定為 **Public**（公開），點擊 **Create repository**。

### 步驟 2：將程式碼推送到 GitHub
在終端機（Terminal）進入專案目錄，執行以下指令：

```bash
cd vendor-payroll-system

# 初始化 git
git init
git add .
git commit -m "Initial commit: 廠商工資試算與 Excel 核對系統"

# 切換為主分支並關聯遠端庫 (請替換 <YOUR-USERNAME> 與 <YOUR-REPO>)
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/vendor-payroll.git
git push -u origin main
```

### 步驟 3：啟用 GitHub Pages
1. 進入您剛建立的 GitHub 專案頁面。
2. 點擊上方 **Settings**（設定）分頁。
3. 在左側選單點擊 **Pages**。
4. 在 **Build and deployment** 下方的 **Branch**：
   - 選擇 `main` 分支
   - 資料夾選擇 `/(root)`
   - 點擊 **Save**。
5. 等待 1~2 分鐘，重新整理頁面，頂部即會出現專屬網址：
   `https://<YOUR-USERNAME>.github.io/vendor-payroll/`

現在任何人都可以透過該網址在瀏覽器上直接使用！

---

## 💻 本機直接預覽方式

無需安裝 Node.js 或任何環境，直接雙擊 `index.html` 即可在 Chrome / Edge / Safari 等瀏覽器中開啟使用！

或使用 Python 快速開啟本地伺服器：
```bash
python3 -m http.server 8000
```
然後開啟瀏覽器前往 `http://localhost:8000` 即可。

---

## 📁 檔案結構

```
vendor-payroll-system/
├── index.html        # 核心網頁介面 (TailwindCSS + 響應式儀表板)
├── app.js            # 核心運算引擎 (階梯公式、SheetJS 解析、差異比對、匯出)
├── styles.css        # 自訂樣式與列印最佳化
└── README.md         # 專案說明與 GitHub Pages 部署指引
```
