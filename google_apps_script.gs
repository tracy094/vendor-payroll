/**
 * =========================================================================
 * 廠商工資試算系統 - Google Apps Script (GAS) 後端接收腳本
 * =========================================================================
 * 
 * 【使用教學 - 只要 3 步驟即可完成】：
 * 1. 打開您的 Google 試算表，點擊上方選單的「擴充功能 (Extensions)」➔「Apps Script」。
 * 2. 刪除編輯器中的所有原始文字，將這份檔案的全部內容【複製並貼上】進去，按 Ctrl+S (或 ⌘+S) 儲存。
 * 3. 點擊右上角藍色的「部署 (Deploy)」➔「新增部署 (New deployment)」：
 *    - 種類選擇：網頁應用程式 (Web app)
 *    - 說明：輸入「工資回傳接收器」
 *    - 誰可以存取 (Who has access)：務必選擇「所有人 (Anyone)」
 *    - 點擊「部署」，授權 Google 帳號後，複製產生的「網頁應用程式網址 (Web App URL)」！
 * 4. 將該網址貼回網頁系統的「Google 試算表 Web App 網址」欄位，就能一鍵將工資請款資料回傳寫入！
 * =========================================================================
 */

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var data = JSON.parse(contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

    // 建立新工作表名稱（例如：2026-09-12_請款試算）
    var sheetName = dateStr + "_請款試算";
    var sheet = ss.getSheetByName(sheetName);
    var count = 1;
    while (sheet) {
      count++;
      sheetName = dateStr + "_請款試算(" + count + ")";
      sheet = ss.getSheetByName(sheetName);
    }
    sheet = ss.insertSheet(sheetName);

    // 設定表頭與資訊
    var operatorInfo = data.operator ? (data.operator.name + " (" + data.operator.role + ")") : "未指定操作員";

    var headerData = [
      ["廠商工資試算與請款彙整表", "", "", "", "", "", "", "", "", ""],
      ["紀錄時間：", timeStr, "", "操作經手人員：", operatorInfo, "", "稅率標準：", "5% 營業稅 (外加)", "", ""],
      ["計費標準：", "前8小時 $275/h | 後2小時(9-10h) $280/h | 超過10小時 $345/h", "", "", "", "", "", "", "", ""],
      []
    ];

    var tableHeader = [
      "序號", "廠商名稱", "出工人數", "標準工時 (≤8h)", "加班工時 1 (9-10h)", "加班工時 2 (>10h)", "總工時 (h)", "額外費用 ($)", "未稅請款小計 ($)", "5% 營業稅 ($)", "含稅給付總額 ($)"
    ];

    sheet.getRange(1, 1, headerData.length, 10).setValues(headerData);
    sheet.getRange(5, 1, 1, tableHeader.length).setValues([tableHeader]);

    // 填寫廠商資料行
    var rows = [];
    if (data.vendors && data.vendors.length > 0) {
      for (var i = 0; i < data.vendors.length; i++) {
        var v = data.vendors[i];
        var totalH = (Number(v.h1) || 0) + (Number(v.h2) || 0) + (Number(v.h3) || 0);
        rows.push([
          i + 1,
          v.name,
          Number(v.headcount) || 0,
          Number(v.h1) || 0,
          Number(v.h2) || 0,
          Number(v.h3) || 0,
          totalH,
          Number(v.extra) || 0,
          Number(v.subtotal) || 0,
          Number(v.tax) || 0,
          Number(v.gross) || 0
        ]);
      }
    }

    if (rows.length > 0) {
      sheet.getRange(6, 1, rows.length, tableHeader.length).setValues(rows);
    }

    // 總計行
    var totalRowIndex = 6 + rows.length;
    var totals = data.totals || {};
    var totalRow = [
      "總計",
      "",
      totals.headcount || 0,
      totals.h1 || 0,
      totals.h2 || 0,
      totals.h3 || 0,
      totals.totalHours || 0,
      totals.extra || 0,
      totals.net || 0,
      totals.tax || 0,
      totals.gross || 0
    ];
    sheet.getRange(totalRowIndex, 1, 1, tableHeader.length).setValues([totalRow]);

    // 美化試算表格式
    formatSheet(sheet, totalRowIndex, tableHeader.length);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "資料已成功回傳並建立工作表「" + sheetName + "」！",
      sheetName: sheetName,
      timestamp: timeStr
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "寫入失敗: " + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 支援 GET 測試連線
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Apps Script 請款回傳服務正常運作中！"
  })).setMimeType(ContentService.MimeType.JSON);
}

// 試算表樣式美化
function formatSheet(sheet, totalRowIndex, colCount) {
  // 大標題
  sheet.getRange("A1").setFontSize(14).setFontWeight("bold");
  sheet.getRange("A2:J3").setFontSize(9).setFontColor("#475569");

  // 表頭列
  var headerRange = sheet.getRange(5, 1, 1, colCount);
  headerRange.setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");

  // 資料區置中與數字格式
  var dataRange = sheet.getRange(6, 1, totalRowIndex - 5, colCount);
  dataRange.setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  
  // 總計列
  var totalRange = sheet.getRange(totalRowIndex, 1, 1, colCount);
  totalRange.setBackground("#f1f5f9").setFontWeight("bold").setFontColor("#0f172a");

  // 金額格式化
  sheet.getRange(6, 8, totalRowIndex - 5, 4).setNumberFormat("$#,##0");

  // 自動調整欄寬
  for (var c = 1; c <= colCount; c++) {
    sheet.autoResizeColumn(c);
  }
}
