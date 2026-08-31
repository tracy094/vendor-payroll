/**
 * 廠商工資試算與 Excel 核對系統 - 核心邏輯
 * 支援 8 間預設廠商、階梯時薪計算、Excel 解析與異常核對、差異對帳、Excel 報表匯出
 */

// 1. 常數與計費階梯設定
const RATE_BASE = 275;  // 前 8 小時標準時薪
const RATE_OT1 = 280;   // 第 9~10 小時加班時薪 (後 2 小時)
const RATE_OT2 = 345;   // 超過 10 小時加班時薪 (第 11 小時起)
const TAX_RATE = 0.05;  // 5% 營業稅

const DEFAULT_VENDORS = [
  '銘暘', '源信', '杜豪', '彤勝', '安迅', '協泰', '建德', '優質人資'
];

// 2. 狀態管理 (State)
const state = {
  activeTab: 'tab-manual',
  manualVendors: [],
  excelSummary: {},
  excelRawRows: [],
  anomalies: [],
  fileName: ''
};

// 3. 核心階梯工資計算函數
function calcStandardWage(hours, extra = 0) {
  const h = Number(hours) || 0;
  const ex = Number(extra) || 0;
  
  if (h <= 0) {
    return { h1: 0, h2: 0, h3: 0, baseWage: 0, ot1Wage: 0, ot2Wage: 0, netWage: ex, extra: ex };
  }

  const h1 = Math.min(h, 8);
  const h2 = Math.max(0, Math.min(h - 8, 2));
  const h3 = Math.max(0, h - 10);

  const baseWage = Math.round(h1 * RATE_BASE);
  const ot1Wage = Math.round(h2 * RATE_OT1);
  const ot2Wage = Math.round(h3 * RATE_OT2);
  const netWage = baseWage + ot1Wage + ot2Wage + ex;

  return { h1, h2, h3, baseWage, ot1Wage, ot2Wage, netWage, extra: ex };
}

// 格式化千分位金額
function formatCurrency(amount) {
  return '$' + Math.round(amount || 0).toLocaleString('en-US');
}

// 初始化預設廠商名單
function initManualVendors() {
  state.manualVendors = DEFAULT_VENDORS.map((name, idx) => ({
    id: 'v_' + (idx + 1),
    name: name,
    headcount: 1,
    h1: 0, // 前 8hr 總工時
    h2: 0, // 9-10hr 總工時
    h3: 0, // >10hr 總工時
    extra: 0, // 額外費用
    isCustom: false
  }));
}

// 4. 手動輸入模組渲染與事件
function renderManualTable() {
  const tbody = document.getElementById('manual-vendor-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let totHeadcount = 0;
  let totH1 = 0;
  let totH2 = 0;
  let totH3 = 0;
  let totExtra = 0;
  let totNet = 0;
  let totTax = 0;
  let totGross = 0;

  state.manualVendors.forEach((v, index) => {
    const subtotal = Math.round((v.h1 * RATE_BASE) + (v.h2 * RATE_OT1) + (v.h3 * RATE_OT2) + (v.extra || 0));
    const tax = Math.round(subtotal * TAX_RATE);
    const gross = subtotal + tax;

    totHeadcount += Number(v.headcount) || 0;
    totH1 += Number(v.h1) || 0;
    totH2 += Number(v.h2) || 0;
    totH3 += Number(v.h3) || 0;
    totExtra += Number(v.extra) || 0;
    totNet += subtotal;
    totTax += tax;
    totGross += gross;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition group';
    tr.innerHTML = `
      <td class="p-2.5 text-center text-slate-400 font-mono">${index + 1}</td>
      <td class="p-2.5 font-semibold text-slate-800">
        ${v.isCustom 
          ? `<input type="text" value="${v.name}" data-field="name" data-id="${v.id}" class="w-full text-xs font-semibold px-2 py-1 border border-slate-300 rounded bg-white focus:bg-sky-50 text-slate-800">`
          : `<span class="px-2 py-1 rounded bg-slate-100 border border-slate-200">${v.name}</span>`
        }
      </td>
      <td class="p-2.5 text-right">
        <input type="number" min="0" value="${v.headcount || 0}" data-field="headcount" data-id="${v.id}" class="w-16 text-xs text-right px-2 py-1 border border-slate-200 rounded font-mono focus:border-sky-500">
      </td>
      <td class="p-2.5 text-right bg-emerald-50/30">
        <input type="number" min="0" step="0.5" value="${v.h1 || 0}" data-field="h1" data-id="${v.id}" class="w-20 text-xs text-right px-2 py-1 border border-emerald-200 rounded font-mono text-emerald-800 font-bold focus:border-emerald-500">
      </td>
      <td class="p-2.5 text-right bg-amber-50/30">
        <input type="number" min="0" step="0.5" value="${v.h2 || 0}" data-field="h2" data-id="${v.id}" class="w-20 text-xs text-right px-2 py-1 border border-amber-200 rounded font-mono text-amber-800 font-bold focus:border-amber-500">
      </td>
      <td class="p-2.5 text-right bg-rose-50/30">
        <input type="number" min="0" step="0.5" value="${v.h3 || 0}" data-field="h3" data-id="${v.id}" class="w-20 text-xs text-right px-2 py-1 border border-rose-200 rounded font-mono text-rose-800 font-bold focus:border-rose-500">
      </td>
      <td class="p-2.5 text-right">
        <input type="number" min="0" step="10" value="${v.extra || 0}" data-field="extra" data-id="${v.id}" class="w-20 text-xs text-right px-2 py-1 border border-slate-200 rounded font-mono focus:border-sky-500">
      </td>
      <td class="p-2.5 text-right font-mono font-bold text-slate-800 bg-slate-50/50">${formatCurrency(subtotal)}</td>
      <td class="p-2.5 text-right font-mono text-slate-500">${formatCurrency(tax)}</td>
      <td class="p-2.5 text-right font-mono font-black text-sky-700 bg-sky-50/50 text-sm">${formatCurrency(gross)}</td>
      <td class="p-2.5 text-center">
        ${v.isCustom 
          ? `<button data-action="delete" data-id="${v.id}" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition" title="刪除廠商">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>`
          : `<button data-action="clear" data-id="${v.id}" class="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition" title="清空工時">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 更新 Footer
  document.getElementById('foot-manual-headcount').textContent = totHeadcount;
  document.getElementById('foot-manual-h1').textContent = totH1.toFixed(1);
  document.getElementById('foot-manual-h2').textContent = totH2.toFixed(1);
  document.getElementById('foot-manual-h3').textContent = totH3.toFixed(1);
  document.getElementById('foot-manual-extra').textContent = formatCurrency(totExtra);
  document.getElementById('foot-manual-net').textContent = formatCurrency(totNet);
  document.getElementById('foot-manual-tax').textContent = formatCurrency(totTax);
  document.getElementById('foot-manual-gross').textContent = formatCurrency(totGross);

  // 更新頂部 KPI
  const totHours = totH1 + totH2 + totH3;
  document.getElementById('kpi-manual-total').textContent = formatCurrency(totGross);
  document.getElementById('kpi-manual-net').textContent = formatCurrency(totNet);
  document.getElementById('kpi-manual-tax').textContent = formatCurrency(totTax);
  document.getElementById('kpi-manual-hours').textContent = totHours.toFixed(1);

  // 觸發比對重算
  updateReconciliation();
}

// 5. Excel 上傳解析與異常檢測
function handleFileUpload(file) {
  if (!file) return;

  showToast('正在解析 Excel 檔案...', 'info');
  state.fileName = file.name;
  document.getElementById('loaded-file-name').textContent = file.name;
  document.getElementById('file-info-badge').classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // 讀取第一個工作表
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      parseExcelData(jsonData);
      showToast(`成功解析「${file.name}」！`, 'success');
    } catch (err) {
      console.error('Excel 解析失敗:', err);
      showToast('Excel 解析失敗，請確認檔案格式是否正確！', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// 解析 Excel 矩陣資料
function parseExcelData(rows) {
  if (!rows || rows.length < 2) {
    showToast('檔案內容為空或無有效表頭！', 'error');
    return;
  }

  // 找出欄位索引
  const header = rows[0].map(col => String(col || '').trim());
  
  const colVendor = header.findIndex(h => /廠商|公司|單位|協力/i.test(h));
  const colDate = header.findIndex(h => /日期|工單|單號|時間/i.test(h));
  const colPerson = header.findIndex(h => /姓名|人員|工號|員工/i.test(h));
  const colHours = header.findIndex(h => /工時|時數|工作小時|時長/i.test(h));
  const colRate = header.findIndex(h => /時薪|單價|費率/i.test(h));
  const colExtra = header.findIndex(h => /額外|其他|加項|補貼|餐費/i.test(h));
  const colAmount = header.findIndex(h => /金額|小計|請款|薪資|總價/i.test(h));
  const colNote = header.findIndex(h => /備註|說明/i.test(h));

  state.excelRawRows = [];
  state.excelSummary = {};
  state.anomalies = [];

  // 初始化 8 間廠商匯總結構
  DEFAULT_VENDORS.forEach(vName => {
    state.excelSummary[vName] = {
      name: vName,
      records: 0,
      totalHours: 0,
      h1: 0,
      h2: 0,
      h3: 0,
      extra: 0,
      netAmount: 0,
      taxAmount: 0,
      grossAmount: 0,
      anomaliesCount: 0
    };
  });

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0 || r.every(cell => cell === undefined || cell === '')) continue;

    const vendor = (colVendor !== -1 && r[colVendor]) ? String(r[colVendor]).trim() : '未標示廠商';
    const date = (colDate !== -1 && r[colDate]) ? String(r[colDate]).trim() : '-';
    const person = (colPerson !== -1 && r[colPerson]) ? String(r[colPerson]).trim() : `員工 ${i}`;
    const hours = Number(colHours !== -1 ? r[colHours] : 0) || 0;
    const rate = Number(colRate !== -1 ? r[colRate] : 0) || 0;
    const extra = Number(colExtra !== -1 ? r[colExtra] : 0) || 0;
    const statedAmount = Number(colAmount !== -1 ? r[colAmount] : 0) || 0;
    const note = (colNote !== -1 && r[colNote]) ? String(r[colNote]).trim() : '';

    // 計算階梯應付工資
    const standardCalc = calcStandardWage(hours, extra);
    const expectedAmount = standardCalc.netWage;

    // 異常檢核邏輯
    const rowAnomalies = [];
    let riskLevel = 'normal'; // normal, warning, danger

    // 1. 時薪異常檢驗
    if (rate > 0 && rate !== RATE_BASE && rate !== RATE_OT1 && rate !== RATE_OT2) {
      rowAnomalies.push(`填報時薪 $${rate} 非標準階梯時薪($275/$280/$345)`);
      riskLevel = 'danger';
    }

    // 2. 金額計算不符檢驗
    if (statedAmount > 0 && Math.abs(statedAmount - expectedAmount) > 1) {
      rowAnomalies.push(`請款金額 $${statedAmount} 與階梯標準算額 $${expectedAmount} 相差 $${Math.abs(statedAmount - expectedAmount)}`);
      riskLevel = 'danger';
    }

    // 3. 工時異常檢驗
    if (hours > 12) {
      rowAnomalies.push(`單日工時 ${hours} 小時過長 (超過 12h)`);
      riskLevel = riskLevel === 'danger' ? 'danger' : 'warning';
    } else if (hours <= 0) {
      rowAnomalies.push(`申報工時為 0 或負數`);
      riskLevel = 'danger';
    }

    const rowObj = {
      rowIndex: i + 1,
      vendor,
      date,
      person,
      hours,
      rate,
      extra,
      statedAmount: statedAmount > 0 ? statedAmount : expectedAmount,
      expectedAmount,
      h1: standardCalc.h1,
      h2: standardCalc.h2,
      h3: standardCalc.h3,
      note,
      anomalies: rowAnomalies,
      riskLevel
    };

    state.excelRawRows.push(rowObj);

    // 匯總到廠商
    if (!state.excelSummary[vendor]) {
      state.excelSummary[vendor] = {
        name: vendor,
        records: 0,
        totalHours: 0,
        h1: 0,
        h2: 0,
        h3: 0,
        extra: 0,
        netAmount: 0,
        taxAmount: 0,
        grossAmount: 0,
        anomaliesCount: 0
      };
    }

    const vSum = state.excelSummary[vendor];
    vSum.records += 1;
    vSum.totalHours += hours;
    vSum.h1 += standardCalc.h1;
    vSum.h2 += standardCalc.h2;
    vSum.h3 += standardCalc.h3;
    vSum.extra += extra;
    vSum.netAmount += rowObj.statedAmount;
    if (rowAnomalies.length > 0) {
      vSum.anomaliesCount += 1;
      state.anomalies.push(rowObj);
    }
  }

  // 計算每間廠商稅額與含稅總額
  Object.values(state.excelSummary).forEach(v => {
    v.taxAmount = Math.round(v.netAmount * TAX_RATE);
    v.grossAmount = v.netAmount + v.taxAmount;
  });

  renderExcelSummary();
  renderRawRows();
  renderAnomalies();
  updateReconciliation();

  document.getElementById('excel-summary-container').classList.remove('hidden');
}

// 渲染 Excel 廠商加總表
function renderExcelSummary() {
  const tbody = document.getElementById('excel-vendor-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let totRecords = 0;
  let totHours = 0;
  let totH1 = 0;
  let totH2 = 0;
  let totH3 = 0;
  let totExtra = 0;
  let totNet = 0;
  let totTax = 0;
  let totGross = 0;

  const vendorList = Object.values(state.excelSummary);

  vendorList.forEach(v => {
    totRecords += v.records;
    totHours += v.totalHours;
    totH1 += v.h1;
    totH2 += v.h2;
    totH3 += v.h3;
    totExtra += v.extra;
    totNet += v.netAmount;
    totTax += v.taxAmount;
    totGross += v.grossAmount;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="p-2.5 font-bold text-slate-800">
        <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">${v.name}</span>
      </td>
      <td class="p-2.5 text-right font-mono">${v.records}</td>
      <td class="p-2.5 text-right font-mono font-bold text-sky-700">${v.totalHours.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono text-emerald-700">${v.h1.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono text-amber-700">${v.h2.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono text-rose-700">${v.h3.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono">${formatCurrency(v.extra)}</td>
      <td class="p-2.5 text-right font-mono font-bold text-slate-800 bg-slate-50">${formatCurrency(v.netAmount)}</td>
      <td class="p-2.5 text-right font-mono text-slate-500">${formatCurrency(v.taxAmount)}</td>
      <td class="p-2.5 text-right font-mono font-black text-indigo-900 bg-indigo-50/50 text-sm">${formatCurrency(v.grossAmount)}</td>
      <td class="p-2.5 text-center">
        ${v.anomaliesCount > 0 
          ? `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>${v.anomaliesCount} 件異常
            </span>`
          : `<span class="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">正常無異常</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 更新 Footer
  document.getElementById('foot-excel-rows').textContent = totRecords;
  document.getElementById('foot-excel-hours').textContent = totHours.toFixed(1);
  document.getElementById('foot-excel-h1').textContent = totH1.toFixed(1);
  document.getElementById('foot-excel-h2').textContent = totH2.toFixed(1);
  document.getElementById('foot-excel-h3').textContent = totH3.toFixed(1);
  document.getElementById('foot-excel-extra').textContent = formatCurrency(totExtra);
  document.getElementById('foot-excel-net').textContent = formatCurrency(totNet);
  document.getElementById('foot-excel-tax').textContent = formatCurrency(totTax);
  document.getElementById('foot-excel-gross').textContent = formatCurrency(totGross);

  document.getElementById('excel-total-records').textContent = totRecords;

  // 更新頂部 KPI
  document.getElementById('kpi-excel-total').textContent = formatCurrency(totGross);
  document.getElementById('kpi-excel-net').textContent = formatCurrency(totNet);
  document.getElementById('kpi-excel-vendors').textContent = vendorList.filter(v => v.records > 0).length;
  document.getElementById('kpi-excel-rows').textContent = totRecords;

  // 更新篩選下拉選單
  const filterSelect = document.getElementById('raw-filter-vendor');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="ALL">全部廠商</option>';
    vendorList.forEach(v => {
      filterSelect.innerHTML += `<option value="${v.name}">${v.name} (${v.records}筆)</option>`;
    });
    filterSelect.value = currentVal;
  }
}

// 渲染原始工單明細表
function renderRawRows() {
  const tbody = document.getElementById('raw-rows-tbody');
  if (!tbody) return;

  const filterVendor = document.getElementById('raw-filter-vendor')?.value || 'ALL';
  const searchTerm = (document.getElementById('raw-search')?.value || '').trim().toLowerCase();

  tbody.innerHTML = '';

  const filtered = state.excelRawRows.filter(r => {
    if (filterVendor !== 'ALL' && r.vendor !== filterVendor) return false;
    if (searchTerm) {
      return r.vendor.toLowerCase().includes(searchTerm) || 
             r.person.toLowerCase().includes(searchTerm) || 
             r.note.toLowerCase().includes(searchTerm);
    }
    return true;
  });

  filtered.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50 transition ${r.anomalies.length > 0 ? 'bg-rose-50/30' : ''}`;
    tr.innerHTML = `
      <td class="p-2 text-center text-slate-400 font-mono">${r.rowIndex}</td>
      <td class="p-2 font-medium text-slate-800">${r.vendor}</td>
      <td class="p-2 text-slate-600 font-mono">${r.date}</td>
      <td class="p-2 text-slate-800 font-medium">${r.person}</td>
      <td class="p-2 text-right font-mono font-bold ${r.hours > 10 ? 'text-rose-600' : 'text-slate-700'}">${r.hours} hr</td>
      <td class="p-2 text-right font-mono ${r.rate > 0 && r.rate !== 275 && r.rate !== 280 && r.rate !== 345 ? 'text-rose-600 font-bold' : 'text-slate-600'}">${r.rate > 0 ? '$' + r.rate : '-'}</td>
      <td class="p-2 text-right font-mono text-slate-600">${r.extra > 0 ? formatCurrency(r.extra) : '-'}</td>
      <td class="p-2 text-right font-mono font-bold text-slate-900">${formatCurrency(r.statedAmount)}</td>
      <td class="p-2 text-right font-mono text-slate-500 bg-slate-50">${formatCurrency(r.expectedAmount)}</td>
      <td class="p-2 text-center">
        ${r.anomalies.length > 0 
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700" title="${r.anomalies.join('; ')}">異常 (${r.anomalies.length})</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">符合</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 6. 渲染異常清單
function renderAnomalies() {
  const count = state.anomalies.length;
  document.getElementById('kpi-anomaly-count').textContent = count;
  document.getElementById('anomaly-view-count').textContent = count;

  // 分類異常數
  let rateCount = 0;
  let hourCount = 0;
  state.anomalies.forEach(a => {
    if (a.anomalies.some(msg => msg.includes('時薪') || msg.includes('算額') || msg.includes('金額'))) rateCount++;
    if (a.anomalies.some(msg => msg.includes('工時'))) hourCount++;
  });
  document.getElementById('kpi-rate-anomalies').textContent = rateCount;
  document.getElementById('kpi-hour-anomalies').textContent = hourCount;

  const badge = document.getElementById('tab-anomaly-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    document.getElementById('anomaly-empty-state').classList.add('hidden');
    document.getElementById('anomaly-table-container').classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    document.getElementById('anomaly-empty-state').classList.remove('hidden');
    document.getElementById('anomaly-table-container').classList.add('hidden');
  }

  const tbody = document.getElementById('anomaly-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  state.anomalies.forEach(a => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-rose-50/50 transition';
    tr.innerHTML = `
      <td class="p-2.5 text-center font-mono text-slate-400">第 ${a.rowIndex} 列</td>
      <td class="p-2.5 font-bold text-slate-800">${a.vendor}</td>
      <td class="p-2.5 text-slate-600">${a.person} (${a.date})</td>
      <td class="p-2.5 text-right font-mono font-bold ${a.hours > 12 ? 'text-rose-600' : 'text-slate-800'}">${a.hours} hr</td>
      <td class="p-2.5 text-right font-mono text-rose-600 font-bold">${a.rate > 0 ? '$' + a.rate : '未標示'}</td>
      <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatCurrency(a.statedAmount)}</td>
      <td class="p-2.5 text-right font-mono text-emerald-700 bg-emerald-50/40 font-bold">${formatCurrency(a.expectedAmount)}</td>
      <td class="p-2.5 text-rose-700 font-medium">
        <ul class="list-disc list-inside space-y-0.5">
          ${a.anomalies.map(msg => `<li>${msg}</li>`).join('')}
        </ul>
      </td>
      <td class="p-2.5 text-center">
        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${a.riskLevel === 'danger' ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'}">
          ${a.riskLevel === 'danger' ? '嚴重不符' : '注意警示'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 7. 交叉比對 (Reconciliation) 邏輯
function updateReconciliation() {
  const tbody = document.getElementById('diff-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  // 取得手動試算字典
  const manualMap = {};
  state.manualVendors.forEach(v => {
    const hTot = (Number(v.h1) || 0) + (Number(v.h2) || 0) + (Number(v.h3) || 0);
    const net = Math.round((v.h1 * RATE_BASE) + (v.h2 * RATE_OT1) + (v.h3 * RATE_OT2) + (v.extra || 0));
    const tax = Math.round(net * TAX_RATE);
    const gross = net + tax;
    manualMap[v.name] = { totalHours: hTot, netAmount: net, taxAmount: tax, grossAmount: gross };
  });

  // 彙整所有廠商清單（手動 + Excel 出現的所有廠商）
  const allVendorNames = Array.from(new Set([
    ...Object.keys(manualMap),
    ...Object.keys(state.excelSummary)
  ]));

  let totManHours = 0;
  let totXlsHours = 0;
  let totManNet = 0;
  let totXlsNet = 0;
  let totManGross = 0;
  let totXlsGross = 0;
  let hasDiffCount = 0;

  allVendorNames.forEach(vName => {
    const man = manualMap[vName] || { totalHours: 0, netAmount: 0, taxAmount: 0, grossAmount: 0 };
    const xls = state.excelSummary[vName] || { totalHours: 0, netAmount: 0, taxAmount: 0, grossAmount: 0 };

    const hoursDiff = xls.totalHours - man.totalHours;
    const netDiff = xls.netAmount - man.netAmount;
    const grossDiff = xls.grossAmount - man.grossAmount;

    totManHours += man.totalHours;
    totXlsHours += xls.totalHours;
    totManNet += man.netAmount;
    totXlsNet += xls.netAmount;
    totManGross += man.grossAmount;
    totXlsGross += xls.grossAmount;

    const isMatch = (man.totalHours === xls.totalHours) && (man.netAmount === xls.netAmount);
    if (!isMatch && (man.netAmount > 0 || xls.netAmount > 0)) {
      hasDiffCount++;
    }

    let statusBadge = '';
    if (man.netAmount === 0 && xls.netAmount === 0) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500 font-medium">尚未填報</span>`;
    } else if (isMatch) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center gap-1">
        <svg class="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        完全吻合
      </span>`;
    } else if (man.netAmount > 0 && xls.netAmount === 0) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 font-semibold">僅手動試算</span>`;
    } else if (man.netAmount === 0 && xls.netAmount > 0) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-indigo-100 text-indigo-800 font-semibold">僅 Excel 有資料</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-rose-100 text-rose-800 font-black flex items-center justify-center gap-1">
        <svg class="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        存在差異
      </span>`;
    }

    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50 transition ${!isMatch && (man.netAmount > 0 || xls.netAmount > 0) ? 'bg-amber-50/20' : ''}`;
    tr.innerHTML = `
      <td class="p-2.5 font-bold text-slate-800">${vName}</td>
      <td class="p-2.5 text-right font-mono bg-sky-50/30 text-sky-800">${man.totalHours.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono bg-indigo-50/30 text-indigo-800">${xls.totalHours.toFixed(1)}</td>
      <td class="p-2.5 text-right font-mono font-bold ${Math.abs(hoursDiff) > 0.01 ? 'text-rose-600' : 'text-slate-400'}">
        ${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(1)}
      </td>
      <td class="p-2.5 text-right font-mono bg-sky-50/30 text-slate-700">${formatCurrency(man.netAmount)}</td>
      <td class="p-2.5 text-right font-mono bg-indigo-50/30 text-slate-700">${formatCurrency(xls.netAmount)}</td>
      <td class="p-2.5 text-right font-mono font-bold ${Math.abs(netDiff) > 0 ? (netDiff > 0 ? 'text-indigo-600' : 'text-rose-600') : 'text-emerald-600'}">
        ${netDiff > 0 ? '+' : ''}${formatCurrency(netDiff)}
      </td>
      <td class="p-2.5 text-right font-mono bg-sky-50/30 font-bold text-sky-900">${formatCurrency(man.grossAmount)}</td>
      <td class="p-2.5 text-right font-mono bg-indigo-50/30 font-bold text-indigo-900">${formatCurrency(xls.grossAmount)}</td>
      <td class="p-2.5 text-right font-mono font-black ${Math.abs(grossDiff) > 0 ? (grossDiff > 0 ? 'text-indigo-700' : 'text-rose-700') : 'text-emerald-700'}">
        ${grossDiff > 0 ? '+' : ''}${formatCurrency(grossDiff)}
      </td>
      <td class="p-2.5 text-center">${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });

  // 更新 Footer
  const totHoursDiff = totXlsHours - totManHours;
  const totNetDiff = totXlsNet - totManNet;
  const totGrossDiff = totXlsGross - totManGross;

  document.getElementById('foot-diff-man-hours').textContent = totManHours.toFixed(1);
  document.getElementById('foot-diff-xls-hours').textContent = totXlsHours.toFixed(1);
  document.getElementById('foot-diff-hrs-diff').textContent = (totHoursDiff > 0 ? '+' : '') + totHoursDiff.toFixed(1);
  document.getElementById('foot-diff-man-net').textContent = formatCurrency(totManNet);
  document.getElementById('foot-diff-xls-net').textContent = formatCurrency(totXlsNet);
  document.getElementById('foot-diff-net-diff').textContent = (totNetDiff > 0 ? '+' : '') + formatCurrency(totNetDiff);
  document.getElementById('foot-diff-man-gross').textContent = formatCurrency(totManGross);
  document.getElementById('foot-diff-xls-gross').textContent = formatCurrency(totXlsGross);
  document.getElementById('foot-diff-gross-diff').textContent = (totGrossDiff > 0 ? '+' : '') + formatCurrency(totGrossDiff);

  // 頂部 KPI 更新
  document.getElementById('kpi-diff-amount').textContent = formatCurrency(Math.abs(totGrossDiff));
  document.getElementById('kpi-diff-hours').textContent = Math.abs(totHoursDiff).toFixed(1);
  document.getElementById('kpi-diff-vendor-count').textContent = hasDiffCount;

  const diffStatusEl = document.getElementById('kpi-diff-status');
  if (totGrossDiff === 0 && (totManGross > 0 || totXlsGross > 0)) {
    diffStatusEl.textContent = '總額吻合';
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700';
  } else if (totGrossDiff !== 0) {
    diffStatusEl.textContent = (totGrossDiff > 0 ? 'Excel 較大手動 $' : '手動較大 Excel $') + Math.abs(totGrossDiff).toLocaleString();
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-700';
  } else {
    diffStatusEl.textContent = '待輸入比對';
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600';
  }
}

// 8. 匯出 Excel 請款與核對多頁籤報表
function exportPayrollReport() {
  showToast('正在生成 Excel 報表...', 'info');

  const wb = XLSX.utils.book_new();

  // Sheet 1: 手動請款總表
  const manualRows = [
    ['廠商工資請款總表 (含階梯薪資與 5% 營業稅)'],
    ['匯出時間: ' + new Date().toLocaleString(), '', '', '', '', '', '', '計費規章: ≤8h @$275, 9-10h @$280, >10h @$345, 稅率 5%'],
    [],
    ['序號', '廠商名稱', '出工人數', '標準工時 (≤8h)', '加班工時 1 (9-10h)', '加班工時 2 (>10h)', '額外費用 ($)', '未稅請款小計 ($)', '5% 營業稅 ($)', '含稅請款總額 ($)']
  ];

  let totHeadcount = 0, totH1 = 0, totH2 = 0, totH3 = 0, totExtra = 0, totNet = 0, totTax = 0, totGross = 0;

  state.manualVendors.forEach((v, idx) => {
    const subtotal = Math.round((v.h1 * RATE_BASE) + (v.h2 * RATE_OT1) + (v.h3 * RATE_OT2) + (v.extra || 0));
    const tax = Math.round(subtotal * TAX_RATE);
    const gross = subtotal + tax;

    totHeadcount += Number(v.headcount) || 0;
    totH1 += Number(v.h1) || 0;
    totH2 += Number(v.h2) || 0;
    totH3 += Number(v.h3) || 0;
    totExtra += Number(v.extra) || 0;
    totNet += subtotal;
    totTax += tax;
    totGross += gross;

    manualRows.push([
      idx + 1,
      v.name,
      v.headcount,
      v.h1,
      v.h2,
      v.h3,
      v.extra,
      subtotal,
      tax,
      gross
    ]);
  });

  manualRows.push([
    '總計', '', totHeadcount, totH1, totH2, totH3, totExtra, totNet, totTax, totGross
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(manualRows);
  XLSX.utils.book_append_sheet(wb, ws1, '手動試算請款總表');

  // Sheet 2: 比對差異表
  const diffRows = [
    ['廠商工資雙向核對差異分析表 (手動試算 vs Excel 檔案)'],
    ['匯出時間: ' + new Date().toLocaleString()],
    [],
    ['廠商名稱', '手動工時 (hr)', 'Excel工時 (hr)', '工時差異 (hr)', '手動未稅 ($)', 'Excel未稅 ($)', '未稅差異 (Diff)', '手動含稅總額 ($)', 'Excel含稅總額 ($)', '含稅差異 (Diff)', '核對狀態']
  ];

  const manualMap = {};
  state.manualVendors.forEach(v => {
    const hTot = (Number(v.h1) || 0) + (Number(v.h2) || 0) + (Number(v.h3) || 0);
    const net = Math.round((v.h1 * RATE_BASE) + (v.h2 * RATE_OT1) + (v.h3 * RATE_OT2) + (v.extra || 0));
    const tax = Math.round(net * TAX_RATE);
    const gross = net + tax;
    manualMap[v.name] = { totalHours: hTot, netAmount: net, taxAmount: tax, grossAmount: gross };
  });

  const allVendors = Array.from(new Set([...Object.keys(manualMap), ...Object.keys(state.excelSummary)]));
  allVendors.forEach(vName => {
    const man = manualMap[vName] || { totalHours: 0, netAmount: 0, taxAmount: 0, grossAmount: 0 };
    const xls = state.excelSummary[vName] || { totalHours: 0, netAmount: 0, taxAmount: 0, grossAmount: 0 };
    const hoursDiff = xls.totalHours - man.totalHours;
    const netDiff = xls.netAmount - man.netAmount;
    const grossDiff = xls.grossAmount - man.grossAmount;
    const status = (man.totalHours === xls.totalHours && man.netAmount === xls.netAmount) ? '完全吻合' : (netDiff !== 0 ? '金額不符' : '工時差異');

    diffRows.push([
      vName,
      man.totalHours,
      xls.totalHours,
      hoursDiff,
      man.netAmount,
      xls.netAmount,
      netDiff,
      man.grossAmount,
      xls.grossAmount,
      grossDiff,
      status
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(wb, ws2, '核對比對差異表');

  // Sheet 3: 異常警示清單
  if (state.anomalies.length > 0) {
    const anomalyRows = [
      ['異常時薪與工時警示清單'],
      ['匯出時間: ' + new Date().toLocaleString()],
      [],
      ['行號', '廠商名稱', '人員姓名', '申報日期', '申報工時', '申報時薪', '申報金額', '階梯標準算額', '異常判定原因']
    ];

    state.anomalies.forEach(a => {
      anomalyRows.push([
        a.rowIndex,
        a.vendor,
        a.person,
        a.date,
        a.hours,
        a.rate,
        a.statedAmount,
        a.expectedAmount,
        a.anomalies.join('; ')
      ]);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(anomalyRows);
    XLSX.utils.book_append_sheet(wb, ws3, '異常警示清單');
  }

  // Sheet 4: Excel 原始解析記錄
  if (state.excelRawRows.length > 0) {
    const rawDataRows = [
      ['序號', '廠商名稱', '日期', '姓名/工號', '申報工時', '申報時薪', '額外費用', '申報金額', '階梯標準算額', '異常標記']
    ];
    state.excelRawRows.forEach(r => {
      rawDataRows.push([
        r.rowIndex,
        r.vendor,
        r.date,
        r.person,
        r.hours,
        r.rate,
        r.extra,
        r.statedAmount,
        r.expectedAmount,
        r.anomalies.join('; ') || '正常'
      ]);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(rawDataRows);
    XLSX.utils.book_append_sheet(wb, ws4, 'Excel解析明細表');
  }

  const exportFileName = `廠商工資核對請款總表_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, exportFileName);
  showToast(`已成功下載「${exportFileName}」！`, 'success');
}

// 9. 下載標準 Excel 範本
function downloadStandardTemplate() {
  const wb = XLSX.utils.book_new();

  const templateRows = [
    ['廠商工資請款與出工明細標準範本'],
    ['【填寫說明】：前8小時標準時薪$275、後2小時(9-10h)加班時薪$280、超過10小時(>10h)加班時薪$345。'],
    [],
    ['廠商名稱', '工作日期', '姓名/工號', '總工時', '約定時薪', '額外費用', '申報金額', '備註']
  ];

  // 預先填入 8 間廠商的示範工單
  const sampleRecords = [
    ['銘暘', '2026-08-01', '王大明', 8, 275, 0, 2200, '正常出工 8hr'],
    ['銘暘', '2026-08-01', '陳小華', 10, 280, 0, 2760, '加班2小時 (8*275+2*280)'],
    ['源信', '2026-08-01', '李志強', 11, 345, 100, 3205, '加班3小時+餐費100 (8*275+2*280+1*345+100)'],
    ['杜豪', '2026-08-01', '張雅晴', 8, 275, 0, 2200, '標準工時'],
    ['彤勝', '2026-08-01', '林俊傑', 8, 275, 0, 2200, '標準工時'],
    ['安迅', '2026-08-01', '趙建國', 9, 280, 0, 2480, '加班1小時 (8*275+1*280)'],
    ['協泰', '2026-08-01', '黃美玲', 8, 275, 0, 2200, '標準工時'],
    ['建德', '2026-08-01', '周杰明', 12, 345, 0, 3450, '加班4小時 (8*275+2*280+2*345)'],
    ['優質人資', '2026-08-01', '吳家豪', 8, 275, 0, 2200, '標準工時']
  ];

  sampleRecords.forEach(r => templateRows.push(r));

  const ws = XLSX.utils.aoa_to_sheet(templateRows);
  // 設定欄寬
  ws['!cols'] = [
    { wch: 15 }, // 廠商名稱
    { wch: 14 }, // 日期
    { wch: 14 }, // 姓名
    { wch: 10 }, // 總工時
    { wch: 12 }, // 約定時薪
    { wch: 12 }, // 額外費用
    { wch: 14 }, // 申報金額
    { wch: 30 }  // 備註
  ];

  XLSX.utils.book_append_sheet(wb, ws, '出工請款明細範本');
  XLSX.writeFile(wb, '廠商工資請款標準範本.xlsx');
  showToast('已下載「廠商工資請款標準範本.xlsx」！', 'success');
}

// 10. 載入示範數據 (Demo)
function loadDemoData() {
  // 1. 填入手動試算數據
  const demoManual = [
    { name: '銘暘', headcount: 5, h1: 40, h2: 10, h3: 5, extra: 500 },
    { name: '源信', headcount: 4, h1: 32, h2: 8, h3: 4, extra: 300 },
    { name: '杜豪', headcount: 3, h1: 24, h2: 4, h3: 0, extra: 0 },
    { name: '彤勝', headcount: 6, h1: 48, h2: 6, h3: 0, extra: 200 },
    { name: '安迅', headcount: 4, h1: 32, h2: 4, h3: 2, extra: 150 },
    { name: '協泰', headcount: 5, h1: 40, h2: 8, h3: 0, extra: 0 },
    { name: '建德', headcount: 3, h1: 24, h2: 6, h3: 6, extra: 400 },
    { name: '優質人資', headcount: 5, h1: 40, h2: 0, h3: 0, extra: 0 }
  ];

  state.manualVendors.forEach(v => {
    const d = demoManual.find(item => item.name === v.name);
    if (d) {
      v.headcount = d.headcount;
      v.h1 = d.h1;
      v.h2 = d.h2;
      v.h3 = d.h3;
      v.extra = d.extra;
    }
  });

  renderManualTable();

  // 2. 模擬生成 Excel 解析資料 (包含故意設置的 2 筆微小差異與 2 筆時薪/工時異常，供示範核對功能)
  const mockExcelRows = [
    ['廠商名稱', '工作日期', '姓名', '總工時', '時薪', '額外費用', '請款金額', '備註'],
    ['銘暘', '2026-08-01', '王大明', 8, 275, 0, 2200, '正常工時'],
    ['銘暘', '2026-08-01', '張小華', 10, 280, 0, 2760, '加班 2hr'],
    ['銘暘', '2026-08-01', '李大同', 11, 345, 500, 3605, '加班 3hr + 津貼500'],
    ['源信', '2026-08-01', '陳志豪', 8, 275, 0, 2200, '正常工時'],
    ['源信', '2026-08-01', '趙雅婷', 10, 280, 300, 3060, '加班 2hr + 補助300'],
    ['源信', '2026-08-01', '孫大為', 11, 300, 0, 3300, '【示範異常時薪$300】'], // 異常時薪
    ['杜豪', '2026-08-01', '劉建國', 8, 275, 0, 2200, '正常工時'],
    ['彤勝', '2026-08-01', '何美麗', 8, 275, 200, 2400, '正常工時+車資200'],
    ['安迅', '2026-08-01', '錢志明', 9, 280, 150, 2630, '加班 1hr'],
    ['協泰', '2026-08-01', '馮志強', 8, 275, 0, 2200, '正常工時'],
    ['建德', '2026-08-01', '韓小龍', 14, 345, 400, 4540, '【示範單日工時14h過長】'], // 異常工時
    ['優質人資', '2026-08-01', '魏大偉', 8, 275, 0, 2200, '標準工時']
  ];

  state.fileName = '示範請款工時表.xlsx';
  document.getElementById('loaded-file-name').textContent = state.fileName;
  document.getElementById('file-info-badge').classList.remove('hidden');

  parseExcelData(mockExcelRows);
  showToast('已載入示範數據！您可切換至各頁籤查看試算、Excel加總、比對差異與異常警示。', 'success');
}

// 11. Toast 通知系統
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastContent = document.getElementById('toast-content');
  if (!toast) return;

  toastMsg.textContent = message;

  if (type === 'success') {
    toastContent.className = 'px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 bg-emerald-600 text-white';
  } else if (type === 'error') {
    toastContent.className = 'px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 bg-rose-600 text-white';
  } else {
    toastContent.className = 'px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 bg-slate-900 text-white';
  }

  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

// 12. 事件綁定與初始化
document.addEventListener('DOMContentLoaded', () => {
  initManualVendors();
  renderManualTable();

  // Tab 切換事件
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // 更新按鈕樣式
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = 'tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition whitespace-nowrap';
      });
      btn.className = 'tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 border-sky-600 text-sky-600 transition whitespace-nowrap';

      // 切換內容容器
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const activeContent = document.getElementById(targetTab);
      if (activeContent) activeContent.classList.remove('hidden');
    });
  });

  // 手動輸入表格監聽 (事件委派)
  const manualTbody = document.getElementById('manual-vendor-tbody');
  if (manualTbody) {
    manualTbody.addEventListener('input', (e) => {
      const target = e.target;
      const field = target.getAttribute('data-field');
      const id = target.getAttribute('data-id');
      if (!field || !id) return;

      const vendor = state.manualVendors.find(v => v.id === id);
      if (vendor) {
        if (field === 'name') {
          vendor.name = target.value;
        } else {
          vendor[field] = Number(target.value) || 0;
        }
        renderManualTable();
      }
    });

    manualTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if (!action || !id) return;

      if (action === 'delete') {
        state.manualVendors = state.manualVendors.filter(v => v.id !== id);
        renderManualTable();
        showToast('已刪除自訂廠商', 'info');
      } else if (action === 'clear') {
        const v = state.manualVendors.find(item => item.id === id);
        if (v) {
          v.h1 = 0;
          v.h2 = 0;
          v.h3 = 0;
          v.extra = 0;
          renderManualTable();
          showToast(`已清空「${v.name}」工時數據`, 'info');
        }
      }
    });
  }

  // 新增自訂廠商按鈕
  document.getElementById('btn-add-vendor')?.addEventListener('click', () => {
    const newId = 'v_custom_' + Date.now();
    state.manualVendors.push({
      id: newId,
      name: `自訂廠商 ${state.manualVendors.length + 1}`,
      headcount: 1,
      h1: 0,
      h2: 0,
      h3: 0,
      extra: 0,
      isCustom: true
    });
    renderManualTable();
    showToast('已新增自訂廠商列，可直接點擊名稱進行修改', 'success');
  });

  // 重設手動輸入
  document.getElementById('btn-reset-manual')?.addEventListener('click', () => {
    if (confirm('確定要清空所有手動輸入的工時數據嗎？')) {
      initManualVendors();
      renderManualTable();
      showToast('已重設為 8 間預設廠商並清空數據', 'info');
    }
  });

  // 檔案拖曳與上傳處理
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('excel-file-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileUpload(file);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-active');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-active');
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    });
  }

  // 原始明細過濾器
  document.getElementById('raw-filter-vendor')?.addEventListener('change', renderRawRows);
  document.getElementById('raw-search')?.addEventListener('input', renderRawRows);

  // 頂部功能按鈕
  document.getElementById('btn-load-demo')?.addEventListener('click', loadDemoData);
  document.getElementById('btn-download-template')?.addEventListener('click', downloadStandardTemplate);
  document.getElementById('btn-download-template-2')?.addEventListener('click', downloadStandardTemplate);
  document.getElementById('btn-export-report')?.addEventListener('click', exportPayrollReport);
  document.getElementById('btn-sync-to-export')?.addEventListener('click', exportPayrollReport);
});
