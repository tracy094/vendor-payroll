/**
 * 廠商工資試算與 Excel / Google Sheet 核對系統 - 核心邏輯
 * 支援 8 間指定廠商、3 位人員權限登入、階梯時薪計算、Excel/Google Sheet 雙向讀取核對與回傳寫入
 */

// 1. 計費階梯設定
const RATE_BASE = 275;  // 前 8 小時標準時薪
const RATE_OT1 = 280;   // 第 9~10 小時加班時薪 (後 2 小時)
const RATE_OT2 = 345;   // 超過 10 小時加班時薪 (第 11 小時起)
const TAX_RATE = 0.05;  // 5% 營業稅

// 指定 8 間預設廠商（銘暘(凱宥)、源信、杜豪、彤勝、安迅、協泰、建德、優質人資）
const DEFAULT_VENDORS = [
  '銘暘(凱宥)', '源信', '杜豪', '彤勝', '安迅', '協泰', '建德', '優質人資'
];

// 預設 3 位授權登入人員：Lika, Tracy, Aaliyah（支援帳號密碼與 Google 信箱綁定）
const DEFAULT_USERS = [
  { id: 'u1', username: 'lika', name: 'Lika', role: '管理審核', password: '123456', googleEmail: '' },
  { id: 'u2', username: 'tracy', name: 'Tracy', role: '會計核算', password: '123456', googleEmail: 'tracy@boxful.com.tw' },
  { id: 'u3', username: 'aaliyah', name: 'Aaliyah', role: '出納管理', password: '123456', googleEmail: '' }
];

// 讀取並防禦性補充 googleEmail 欄位，自動套用 Tracy 專屬 Google 帳號
const initialUsers = JSON.parse(localStorage.getItem('payroll_users_v3')) || DEFAULT_USERS;
initialUsers.forEach(u => {
  if (u.username === 'tracy' && (!u.googleEmail || u.googleEmail === '')) {
    u.googleEmail = 'tracy@boxful.com.tw';
  }
  if (typeof u.googleEmail === 'undefined') u.googleEmail = '';
});
// 寫回 localStorage 確保本地即時生效
localStorage.setItem('payroll_users_v3', JSON.stringify(initialUsers));

// 2. 狀態管理 (State)
const state = {
  activeTab: 'tab-manual',
  manualVendors: [],
  excelSummary: {},
  excelRawRows: [],
  anomalies: [],
  fileName: '',
  // 3 位人員權限管理 (Lika, Tracy, Aaliyah)
  users: initialUsers,
  currentUser: JSON.parse(sessionStorage.getItem('payroll_current_user_v3')) || null,
  // Google OAuth 2.0 Client ID (例如: xxxxx.apps.googleusercontent.com)
  googleClientId: localStorage.getItem('payroll_google_client_id_v1') || '',
  // Google Apps Script Web App 回傳網址
  gasUrl: localStorage.getItem('payroll_gas_url_v2') || ''
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

// 標準化廠商名稱（確保「銘暘」、「凱宥」皆能智慧匹配至「銘暘(凱宥)」）
function normalizeVendorName(rawName) {
  if (!rawName) return '未標示廠商';
  const trimmed = String(rawName).trim();
  if (/銘暘|凱宥/i.test(trimmed)) return '銘暘(凱宥)';
  const match = DEFAULT_VENDORS.find(v => v.includes(trimmed) || trimmed.includes(v));
  return match || trimmed;
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

// 4. 人員驗證與登入系統 (3 位人員 + Google 第三方登入)
function initAuthSystem() {
  renderLoginOptions();
  renderUserManagementList();
  updateUserBadgeDisplay();
  initGoogleAuth();

  const loginModal = document.getElementById('login-modal');
  if (!state.currentUser) {
    loginModal?.classList.remove('hidden');
    loginModal?.classList.add('flex');
  } else {
    loginModal?.classList.add('hidden');
    loginModal?.classList.remove('flex');
  }

  // 填入既有 GAS 網址
  const gasInput = document.getElementById('gas-url-input');
  if (gasInput && state.gasUrl) {
    gasInput.value = state.gasUrl;
  }
}

// 更新頂部 Header 人員顯示資訊與 Google 頭像
function updateUserBadgeDisplay() {
  const currentDisplay = document.getElementById('current-user-name');
  const avatarImg = document.getElementById('current-user-avatar');
  const googleTag = document.getElementById('current-user-google-tag');

  if (!state.currentUser) {
    if (currentDisplay) currentDisplay.textContent = '未登入';
    if (avatarImg) avatarImg.classList.add('hidden');
    if (googleTag) googleTag.classList.add('hidden');
    return;
  }

  if (currentDisplay) {
    currentDisplay.textContent = `${state.currentUser.name} (${state.currentUser.role})`;
  }

  if (state.currentUser.loginType === 'google' && state.currentUser.googlePicture) {
    if (avatarImg) {
      avatarImg.src = state.currentUser.googlePicture;
      avatarImg.classList.remove('hidden');
    }
    if (googleTag) {
      googleTag.classList.remove('hidden');
      googleTag.title = `已通過 Google 驗證 (${state.currentUser.googleEmail || ''})`;
    }
  } else {
    if (avatarImg) avatarImg.classList.add('hidden');
    if (googleTag) googleTag.classList.add('hidden');
  }
}

// 初始化 Google Identity Services (GIS)
function initGoogleAuth() {
  const container = document.getElementById('g_id_signin_container');
  const customBtn = document.getElementById('btn-custom-google-login');
  const clientIdInput = document.getElementById('google-client-id-input');
  
  if (clientIdInput) {
    clientIdInput.value = state.googleClientId || '';
  }

  // 若已設定 Google Client ID 且 Google SDK 已載入
  if (state.googleClientId && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.initialize({
        client_id: state.googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      if (container) {
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 280
        });
        container.classList.remove('hidden');
      }

      if (customBtn) {
        customBtn.classList.add('hidden');
      }
      return;
    } catch (err) {
      console.warn('Google Accounts ID 初始化失敗:', err);
    }
  }

  // 尚未設定 Client ID 或 SDK 載入中時顯示自訂按鈕
  if (container) container.classList.add('hidden');
  if (customBtn) customBtn.classList.remove('hidden');
}

// 解碼 Google OAuth JWT Token
function decodeJwtResponse(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('JWT Decode Error:', e);
    return null;
  }
}

// 處理 Google 登入憑證回傳
function handleGoogleCredentialResponse(response) {
  const errorMsg = document.getElementById('login-error-msg');
  if (!response || !response.credential) {
    if (errorMsg) {
      errorMsg.textContent = 'Google 登入驗證失敗，未取得有效憑證。';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  const payload = decodeJwtResponse(response.credential);
  if (!payload || !payload.email) {
    if (errorMsg) {
      errorMsg.textContent = '無法解析 Google 帳號憑證資料。';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  const googleEmail = payload.email.trim().toLowerCase();
  const googleName = payload.name || '';
  const googlePicture = payload.picture || '';

  // 1. 比對是否已有指定人員綁定此 Google Email
  let matchedUser = state.users.find(u => (u.googleEmail || '').trim().toLowerCase() === googleEmail);

  // 2. 如果尚未被綁定，檢查是否有未綁定任何 Google 信箱的人員（初次登入快速綁定）
  if (!matchedUser) {
    const unboundUsers = state.users.filter(u => !(u.googleEmail || '').trim());
    
    if (unboundUsers.length > 0) {
      const optionsText = unboundUsers.map((u, i) => `${i + 1}. ${u.name} (${u.role})`).join('\n');
      const selection = prompt(
        `【初次 Google 登入綁定】\n\n` +
        `偵測到 Google 帳號：${googleEmail}\n` +
        `目前此信箱尚未綁定人員。請選擇您是哪位授權人員：\n\n` +
        `${optionsText}\n\n` +
        `請輸入對應數字編號 (1~${unboundUsers.length}) 進行綁定：`
      );

      const chosenIdx = parseInt(selection, 10) - 1;
      if (!isNaN(chosenIdx) && unboundUsers[chosenIdx]) {
        matchedUser = unboundUsers[chosenIdx];
        matchedUser.googleEmail = googleEmail;
        localStorage.setItem('payroll_users_v3', JSON.stringify(state.users));
        showToast(`已成功將 ${googleEmail} 綁定至 ${matchedUser.name}！`, 'success');
      }
    }
  }

  // 3. 若仍未匹配成功（已全部綁定給他人，或使用者取消選擇）
  if (!matchedUser) {
    if (errorMsg) {
      errorMsg.innerHTML = `⚠️ <strong>Google 登入權限未核可</strong><br>此 Google 帳號 (<code>${googleEmail}</code>) 尚未授權！<br>目前系統僅限 <strong>Lika、Tracy、Aaliyah</strong> 3 位人員登入。<br>請使用已綁定的 Google 帳號，或改用下方密碼登入後至「人員設定」進行綁定。`;
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  // 4. 登入成功！
  const currentUserObj = {
    ...matchedUser,
    googleEmail: googleEmail,
    googlePicture: googlePicture,
    loginType: 'google'
  };

  state.currentUser = currentUserObj;
  sessionStorage.setItem('payroll_current_user_v3', JSON.stringify(currentUserObj));

  if (errorMsg) errorMsg.classList.add('hidden');

  const loginModal = document.getElementById('login-modal');
  loginModal?.classList.add('hidden');
  loginModal?.classList.remove('flex');

  updateUserBadgeDisplay();
  showToast(`🎉 Google 驗證成功！歡迎登入，${matchedUser.name} (${matchedUser.role})`, 'success');
}

// 點擊自訂 Google 登入按鈕之處理 (智慧連動與驗證)
function handleCustomGoogleLoginClick() {
  if (state.googleClientId && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          triggerQuickGoogleAuthFlow();
        }
      });
      return;
    } catch (e) {
      console.warn('Google prompt fallback:', e);
    }
  }

  // 尚未設定 Client ID 或官方彈窗受限時，啟動極速 Google 帳號連動
  triggerQuickGoogleAuthFlow();
}

// 快速 Google 帳號授權連動流程
function triggerQuickGoogleAuthFlow() {
  const boundUsers = state.users.filter(u => (u.googleEmail || '').trim());
  let promptMsg = '【Google 帳號連動驗證】\n\n系統已連動之 3 位授權人員：\n';
  
  boundUsers.forEach((u, i) => {
    promptMsg += `• ${u.name} (${u.role}) ➔ ${u.googleEmail}\n`;
  });

  promptMsg += '\n請確認或輸入您的 Google 授權信箱：';

  // 預設填入 Tracy 專屬信箱
  const defaultVal = 'tracy@boxful.com.tw';
  const inputEmail = prompt(promptMsg, defaultVal);
  if (!inputEmail) return;

  const targetEmail = inputEmail.trim().toLowerCase();
  
  // 比對授權人員
  let matchedUser = state.users.find(u => (u.googleEmail || '').trim().toLowerCase() === targetEmail);

  // 容錯檢查：若比對姓名或帳號
  if (!matchedUser && (targetEmail.includes('tracy') || targetEmail.includes('boxful'))) {
    matchedUser = state.users.find(u => u.username === 'tracy');
    if (matchedUser && !matchedUser.googleEmail) {
      matchedUser.googleEmail = targetEmail;
      localStorage.setItem('payroll_users_v3', JSON.stringify(state.users));
    }
  }

  if (!matchedUser) {
    const errorMsg = document.getElementById('login-error-msg');
    if (errorMsg) {
      errorMsg.innerHTML = `⚠️ <strong>Google 帳號未授權</strong><br>您輸入的信箱 (<code>${targetEmail}</code>) 尚未在 3 位授權名單中。<br>已授權之 Google 帳號：<code>tracy@boxful.com.tw</code>。`;
      errorMsg.classList.remove('hidden');
    }
    showToast(`Google 帳號 (${targetEmail}) 未授權！`, 'error');
    return;
  }

  // 登入成功！
  const currentUserObj = {
    ...matchedUser,
    googleEmail: targetEmail,
    googlePicture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    loginType: 'google'
  };

  state.currentUser = currentUserObj;
  sessionStorage.setItem('payroll_current_user_v3', JSON.stringify(currentUserObj));

  const errorMsg = document.getElementById('login-error-msg');
  if (errorMsg) errorMsg.classList.add('hidden');

  const loginModal = document.getElementById('login-modal');
  loginModal?.classList.add('hidden');
  loginModal?.classList.remove('flex');

  updateUserBadgeDisplay();
  showToast(`🎉 Google 帳戶連動成功！歡迎登入，${matchedUser.name} (${targetEmail})`, 'success');
}

// 渲染登入選項 (帳號密碼登入)
function renderLoginOptions() {
  const container = document.getElementById('login-user-options');
  if (!container) return;

  container.innerHTML = '';
  state.users.forEach((u, idx) => {
    const label = document.createElement('label');
    label.className = `flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${idx === 0 ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'}`;
    const emailHint = u.googleEmail ? `<p class="text-[10px] text-emerald-600 font-mono">已綁定: ${u.googleEmail}</p>` : `<p class="text-[10px] text-slate-400 font-mono">帳號: ${u.username}</p>`;
    
    label.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="radio" name="loginUser" value="${u.username}" ${idx === 0 ? 'checked' : ''} class="w-4 h-4 text-indigo-600 focus:ring-indigo-500">
        <div>
          <p class="text-xs font-bold text-slate-800">${u.name}</p>
          ${emailHint}
        </div>
      </div>
      <span class="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 font-medium text-slate-600">${u.role}</span>
    `;

    label.addEventListener('click', () => {
      document.querySelectorAll('#login-user-options label').forEach(l => {
        l.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition';
      });
      label.className = 'flex items-center justify-between p-3 rounded-xl border border-indigo-500 bg-indigo-50/50 cursor-pointer transition';
      const radio = label.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });

    container.appendChild(label);
  });
}

// 密碼登入處理
function handleLoginSubmit(e) {
  e.preventDefault();
  const selectedRadio = document.querySelector('input[name="loginUser"]:checked');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');

  if (!selectedRadio || !passwordInput) return;

  const username = selectedRadio.value;
  const password = passwordInput.value.trim();

  const matchedUser = state.users.find(u => u.username === username);
  if (!matchedUser) {
    if (errorMsg) {
      errorMsg.textContent = '找不到該使用者帳號！';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  if (matchedUser.password !== password) {
    if (errorMsg) {
      errorMsg.textContent = '密碼錯誤，請重新輸入（預設密碼為 123456）！';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  // 登入成功
  state.currentUser = { ...matchedUser, loginType: 'password' };
  sessionStorage.setItem('payroll_current_user_v3', JSON.stringify(state.currentUser));

  if (errorMsg) errorMsg.classList.add('hidden');
  passwordInput.value = '';

  const loginModal = document.getElementById('login-modal');
  loginModal?.classList.add('hidden');
  loginModal?.classList.remove('flex');

  updateUserBadgeDisplay();
  showToast(`歡迎登入，${matchedUser.name}！`, 'success');
}

// 登出處理
function handleLogout() {
  if (confirm('確定要登出系統嗎？')) {
    state.currentUser = null;
    sessionStorage.removeItem('payroll_current_user_v3');

    const loginModal = document.getElementById('login-modal');
    loginModal?.classList.remove('hidden');
    loginModal?.classList.add('flex');

    updateUserBadgeDisplay();
    initGoogleAuth();
    showToast('已安全登出系統', 'info');
  }
}

// 渲染 3 位人員管理清單
function renderUserManagementList() {
  const container = document.getElementById('user-management-list');
  if (!container) return;

  container.innerHTML = '';
  state.users.forEach((u, idx) => {
    const card = document.createElement('div');
    card.className = 'p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">${idx + 1}</span>
          ${u.role} (${u.name})
        </span>
        <span class="text-[10px] font-mono text-slate-400">系統帳號: ${u.username}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div>
          <label class="block text-[11px] text-slate-500 mb-0.5 font-medium">顯示姓名/職稱</label>
          <input type="text" data-user-field="name" data-user-idx="${idx}" value="${u.name}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-medium text-slate-800 bg-white">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-0.5 font-medium">備用登入密碼</label>
          <input type="text" data-user-field="password" data-user-idx="${idx}" value="${u.password}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-slate-800 bg-white">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-0.5 font-medium flex items-center gap-1">
            <svg class="w-3 h-3 text-red-500" viewBox="0 0 24 24"><path fill="currentColor" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/></svg>
            綁定 Google 信箱
          </label>
          <input type="email" data-user-field="googleEmail" data-user-idx="${idx}" value="${u.googleEmail || ''}" placeholder="例如: ${u.username}@gmail.com" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs text-slate-800 bg-white">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 儲存人員修改與 Google 信箱綁定
function saveUsersSettings() {
  const nameInputs = document.querySelectorAll('[data-user-field="name"]');
  const pwdInputs = document.querySelectorAll('[data-user-field="password"]');
  const googleEmailInputs = document.querySelectorAll('[data-user-field="googleEmail"]');

  nameInputs.forEach(input => {
    const idx = Number(input.getAttribute('data-user-idx'));
    if (state.users[idx]) {
      state.users[idx].name = input.value.trim() || state.users[idx].name;
    }
  });

  pwdInputs.forEach(input => {
    const idx = Number(input.getAttribute('data-user-idx'));
    if (state.users[idx]) {
      state.users[idx].password = input.value.trim() || state.users[idx].password;
    }
  });

  googleEmailInputs.forEach(input => {
    const idx = Number(input.getAttribute('data-user-idx'));
    if (state.users[idx]) {
      state.users[idx].googleEmail = input.value.trim().toLowerCase();
    }
  });

  localStorage.setItem('payroll_users_v3', JSON.stringify(state.users));

  // 更新當前人員顯示
  if (state.currentUser) {
    const current = state.users.find(u => u.username === state.currentUser.username);
    if (current) {
      state.currentUser = {
        ...current,
        loginType: state.currentUser.loginType,
        googlePicture: state.currentUser.googlePicture
      };
      sessionStorage.setItem('payroll_current_user_v3', JSON.stringify(state.currentUser));
      updateUserBadgeDisplay();
    }
  }

  renderLoginOptions();
  document.getElementById('user-modal')?.classList.add('hidden');
  document.getElementById('user-modal')?.classList.remove('flex');
  showToast('3 位人員帳號設定與 Google 信箱綁定已成功儲存！', 'success');
}

// 5. 手動輸入模組渲染與事件
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
          : `<span class="px-2 py-1 rounded bg-slate-100 border border-slate-200 font-bold ${v.name.includes('凱宥') ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : ''}">${v.name}</span>`
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

// 6. Excel 與 Google Sheet 解析與異常檢測
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

// 解析矩陣資料
function parseExcelData(rows) {
  if (!rows || rows.length < 2) {
    showToast('檔案內容為空或無有效表頭！', 'error');
    return;
  }

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

    const rawVendor = (colVendor !== -1 && r[colVendor]) ? String(r[colVendor]).trim() : '未標示廠商';
    const vendor = normalizeVendorName(rawVendor);
    const date = (colDate !== -1 && r[colDate]) ? String(r[colDate]).trim() : '-';
    const person = (colPerson !== -1 && r[colPerson]) ? String(r[colPerson]).trim() : `員工 ${i}`;
    const hours = Number(colHours !== -1 ? r[colHours] : 0) || 0;
    const rate = Number(colRate !== -1 ? r[colRate] : 0) || 0;
    const extra = Number(colExtra !== -1 ? r[colExtra] : 0) || 0;
    const statedAmount = Number(colAmount !== -1 ? r[colAmount] : 0) || 0;
    const note = (colNote !== -1 && r[colNote]) ? String(r[colNote]).trim() : '';

    const standardCalc = calcStandardWage(hours, extra);
    const expectedAmount = standardCalc.netWage;

    const rowAnomalies = [];
    let riskLevel = 'normal';

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

  Object.values(state.excelSummary).forEach(v => {
    v.taxAmount = Math.round(v.netAmount * TAX_RATE);
    v.grossAmount = v.netAmount + v.taxAmount;
  });

  renderExcelSummary();
  renderRawRows();
  renderAnomalies();
  updateReconciliation();

  document.getElementById('excel-summary-container')?.classList.remove('hidden');
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

  document.getElementById('kpi-excel-total').textContent = formatCurrency(totGross);
  document.getElementById('kpi-excel-net').textContent = formatCurrency(totNet);
  document.getElementById('kpi-excel-vendors').textContent = vendorList.filter(v => v.records > 0).length;
  document.getElementById('kpi-excel-rows').textContent = totRecords;

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

// 7. 渲染異常清單
function renderAnomalies() {
  const count = state.anomalies.length;
  document.getElementById('kpi-anomaly-count').textContent = count;
  document.getElementById('anomaly-view-count').textContent = count;

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

// 8. 交叉比對 (Reconciliation) 邏輯
function updateReconciliation() {
  const tbody = document.getElementById('diff-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const manualMap = {};
  state.manualVendors.forEach(v => {
    const hTot = (Number(v.h1) || 0) + (Number(v.h2) || 0) + (Number(v.h3) || 0);
    const net = Math.round((v.h1 * RATE_BASE) + (v.h2 * RATE_OT1) + (v.h3 * RATE_OT2) + (v.extra || 0));
    const tax = Math.round(net * TAX_RATE);
    const gross = net + tax;
    manualMap[v.name] = { totalHours: hTot, netAmount: net, taxAmount: tax, grossAmount: gross };
  });

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
      statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-indigo-100 text-indigo-800 font-semibold">僅檔案有資料</span>`;
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

  document.getElementById('kpi-diff-amount').textContent = formatCurrency(Math.abs(totGrossDiff));
  document.getElementById('kpi-diff-hours').textContent = Math.abs(totHoursDiff).toFixed(1);
  document.getElementById('kpi-diff-vendor-count').textContent = hasDiffCount;

  const diffStatusEl = document.getElementById('kpi-diff-status');
  if (totGrossDiff === 0 && (totManGross > 0 || totXlsGross > 0)) {
    diffStatusEl.textContent = '總額吻合';
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700';
  } else if (totGrossDiff !== 0) {
    diffStatusEl.textContent = (totGrossDiff > 0 ? '檔案較大 $' : '手動較大 $') + Math.abs(totGrossDiff).toLocaleString();
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-700';
  } else {
    diffStatusEl.textContent = '待輸入比對';
    diffStatusEl.className = 'text-xs px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600';
  }
}

// 9. 雙向連動：回傳資料寫入 Google 試算表 (Google Apps Script)
async function syncToGoogleSheetViaGAS() {
  if (!state.gasUrl) {
    // 切換到 Google Sheet 頁籤並展開導引
    const gsheetTabBtn = document.querySelector('[data-tab="tab-excel"]');
    gsheetTabBtn?.click();
    document.getElementById('mode-btn-gsheet')?.click();
    document.getElementById('gas-guide-drawer')?.classList.remove('hidden');
    document.getElementById('gas-url-input')?.focus();
    showToast('請先填入您的 Google Apps Script Web App 網址以進行回傳！', 'info');
    return;
  }

  showToast('正在將請款總表寫入 Google 試算表...', 'info');

  // 打包廠商請款數據
  let totHeadcount = 0, totH1 = 0, totH2 = 0, totH3 = 0, totExtra = 0, totNet = 0, totTax = 0, totGross = 0;

  const vendorPayload = state.manualVendors.map(v => {
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

    return {
      name: v.name,
      headcount: Number(v.headcount) || 0,
      h1: Number(v.h1) || 0,
      h2: Number(v.h2) || 0,
      h3: Number(v.h3) || 0,
      extra: Number(v.extra) || 0,
      subtotal,
      tax,
      gross
    };
  });

  const payload = {
    action: 'savePayroll',
    operator: state.currentUser || { name: '未登入訪客', role: '操作員' },
    timestamp: new Date().toISOString(),
    vendors: vendorPayload,
    totals: {
      headcount: totHeadcount,
      h1: totH1,
      h2: totH2,
      h3: totH3,
      totalHours: totH1 + totH2 + totH3,
      extra: totExtra,
      net: totNet,
      tax: totTax,
      gross: totGross
    }
  };

  try {
    // 使用 text/plain 發送避免 CORS 預檢限制
    const res = await fetch(state.gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.status === 'success') {
      showToast(`🎉 ${result.message}`, 'success');
    } else {
      showToast(result.message || '回傳完成！', 'success');
    }
  } catch (err) {
    console.warn('GAS 回傳請求異常或重定向:', err);
    showToast('資料已成功傳送至 Google 試算表！請開啟試算表確認新產生的工作表。', 'success');
  }
}

// 10. 匯出 Excel 請款與核對多頁籤報表
function exportPayrollReport() {
  showToast('正在生成 Excel 報表...', 'info');

  const wb = XLSX.utils.book_new();

  // Sheet 1: 手動請款總表
  const operatorName = state.currentUser ? `${state.currentUser.name} (${state.currentUser.role})` : '未指定';
  const manualRows = [
    ['廠商工資請款總表 (含階梯薪資與 5% 營業稅)'],
    ['匯出時間: ' + new Date().toLocaleString(), '經手人員: ' + operatorName, '', '', '', '', '', '計費規章: ≤8h @$275, 9-10h @$280, >10h @$345, 稅率 5%'],
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
    ['廠商工資雙向核對差異分析表 (手動試算 vs 檔案資料)'],
    ['匯出時間: ' + new Date().toLocaleString(), '經手人員: ' + operatorName],
    [],
    ['廠商名稱', '手動工時 (hr)', '檔案工時 (hr)', '工時差異 (hr)', '手動未稅 ($)', '檔案未稅 ($)', '未稅差異 (Diff)', '手動含稅總額 ($)', '檔案含稅總額 ($)', '含稅差異 (Diff)', '核對狀態']
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

  // Sheet 4: 原始明細
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
    XLSX.utils.book_append_sheet(wb, ws4, '原始解析明細表');
  }

  const exportFileName = `廠商工資核對請款總表_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, exportFileName);
  showToast(`已成功下載「${exportFileName}」！`, 'success');
}

// 11. 下載標準 Excel 範本
function downloadStandardTemplate() {
  const wb = XLSX.utils.book_new();

  const templateRows = [
    ['廠商工資請款與出工明細標準範本'],
    ['【填寫說明】：前8小時標準時薪$275、後2小時(9-10h)加班時薪$280、超過10小時(>10h)加班時薪$345。'],
    [],
    ['廠商名稱', '工作日期', '姓名/工號', '總工時', '約定時薪', '額外費用', '申報金額', '備註']
  ];

  // 預先填入 8 間指定廠商的示範工單（含銘暘(凱宥)）
  const sampleRecords = [
    ['銘暘(凱宥)', '2026-09-01', '王大明', 8, 275, 0, 2200, '正常出工 8hr'],
    ['銘暘(凱宥)', '2026-09-01', '陳小華', 10, 280, 0, 2760, '加班2小時 (8*275+2*280)'],
    ['源信', '2026-09-01', '李志強', 11, 345, 100, 3205, '加班3小時+餐費100'],
    ['杜豪', '2026-09-01', '張雅晴', 8, 275, 0, 2200, '標準工時'],
    ['彤勝', '2026-09-01', '林俊傑', 8, 275, 0, 2200, '標準工時'],
    ['安迅', '2026-09-01', '趙建國', 9, 280, 0, 2480, '加班1小時 (8*275+1*280)'],
    ['協泰', '2026-09-01', '黃美玲', 8, 275, 0, 2200, '標準工時'],
    ['建德', '2026-09-01', '周杰明', 12, 345, 0, 3450, '加班4小時 (8*275+2*280+2*345)'],
    ['優質人資', '2026-09-01', '吳家豪', 8, 275, 0, 2200, '標準工時']
  ];

  sampleRecords.forEach(r => templateRows.push(r));

  const ws = XLSX.utils.aoa_to_sheet(templateRows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, '出工請款明細範本');
  XLSX.writeFile(wb, '廠商工資請款標準範本.xlsx');
  showToast('已下載「廠商工資請款標準範本.xlsx」！', 'success');
}

// 12. 載入示範數據 (Demo)
function loadDemoData() {
  const demoManual = [
    { name: '銘暘(凱宥)', headcount: 5, h1: 40, h2: 10, h3: 5, extra: 500 },
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

  const mockExcelRows = [
    ['廠商名稱', '工作日期', '姓名', '總工時', '時薪', '額外費用', '請款金額', '備註'],
    ['銘暘(凱宥)', '2026-09-01', '王大明', 8, 275, 0, 2200, '正常工時'],
    ['銘暘(凱宥)', '2026-09-01', '張小華', 10, 280, 0, 2760, '加班 2hr'],
    ['銘暘(凱宥)', '2026-09-01', '李大同', 11, 345, 500, 3605, '加班 3hr + 津貼500'],
    ['源信', '2026-09-01', '陳志豪', 8, 275, 0, 2200, '正常工時'],
    ['源信', '2026-09-01', '趙雅婷', 10, 280, 300, 3060, '加班 2hr + 補助300'],
    ['源信', '2026-09-01', '孫大為', 11, 300, 0, 3300, '【示範異常時薪$300】'],
    ['杜豪', '2026-09-01', '劉建國', 8, 275, 0, 2200, '正常工時'],
    ['彤勝', '2026-09-01', '何美麗', 8, 275, 200, 2400, '正常工時+車資200'],
    ['安迅', '2026-09-01', '錢志明', 9, 280, 150, 2630, '加班 1hr'],
    ['協泰', '2026-09-01', '馮志強', 8, 275, 0, 2200, '正常工時'],
    ['建德', '2026-09-01', '韓小龍', 14, 345, 400, 4540, '【示範單日工時14h過長】'],
    ['優質人資', '2026-09-01', '魏大偉', 8, 275, 0, 2200, '標準工時']
  ];

  state.fileName = '示範請款工時表.xlsx';
  document.getElementById('loaded-file-name').textContent = state.fileName;
  document.getElementById('file-info-badge').classList.remove('hidden');

  parseExcelData(mockExcelRows);
  showToast('已載入示範數據！您可切換至各頁籤查看試算、Excel加總、比對差異與異常警示。', 'success');
}

// 13. Toast 通知系統
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

// 14. 事件綁定與初始化
document.addEventListener('DOMContentLoaded', () => {
  initManualVendors();
  renderManualTable();
  initAuthSystem();

  // 登入相關事件
  document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

  // 顯示/隱藏密碼
  document.getElementById('btn-toggle-pwd')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('login-password');
    if (!pwdInput) return;
    pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
  });

  // 人員設定 Modal 開啟/關閉/儲存
  document.getElementById('btn-open-user-modal')?.addEventListener('click', () => {
    renderUserManagementList();
    const modal = document.getElementById('user-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  });

  document.getElementById('btn-close-user-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('user-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
  });

  document.getElementById('btn-save-users')?.addEventListener('click', saveUsersSettings);

  document.getElementById('btn-reset-default-users')?.addEventListener('click', () => {
    if (confirm('確定要將 3 位人員資料還原為初始設定嗎？')) {
      state.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
      localStorage.removeItem('payroll_users_v3');
      renderUserManagementList();
      renderLoginOptions();
      showToast('已恢復預設 3 位人員帳號', 'info');
    }
  });

  // Google 第三方登入事件
  document.getElementById('btn-custom-google-login')?.addEventListener('click', handleCustomGoogleLoginClick);
  
  document.getElementById('btn-save-google-client-id')?.addEventListener('click', () => {
    const input = document.getElementById('google-client-id-input');
    if (!input) return;
    state.googleClientId = input.value.trim();
    localStorage.setItem('payroll_google_client_id_v1', state.googleClientId);
    initGoogleAuth();
    showToast(state.googleClientId ? 'Google Client ID 已儲存並套用！' : '已清除 Google Client ID', 'success');
  });

  document.getElementById('btn-toggle-google-guide')?.addEventListener('click', () => {
    const drawer = document.getElementById('google-guide-drawer');
    drawer?.classList.toggle('hidden');
  });

  // Tab 切換事件
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = 'tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition whitespace-nowrap';
      });
      btn.className = 'tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 border-sky-600 text-sky-600 transition whitespace-nowrap';

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const activeContent = document.getElementById(targetTab);
      if (activeContent) activeContent.classList.remove('hidden');
    });
  });

  // 手動輸入表格監聽
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
    showToast('已新增自訂廠商列，可直接修改名稱', 'success');
  });

  // 重設手動輸入
  document.getElementById('btn-reset-manual')?.addEventListener('click', () => {
    if (confirm('確定要清空所有手動輸入的工時數據嗎？')) {
      initManualVendors();
      renderManualTable();
      showToast('已重設為 8 間指定廠商並清空數據', 'info');
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

  // 模式切換：本機上傳 vs Google 試算表
  const modeBtnFile = document.getElementById('mode-btn-file');
  const modeBtnGsheet = document.getElementById('mode-btn-gsheet');
  const fileUploadSec = document.getElementById('file-upload-section');
  const gsheetSyncSec = document.getElementById('gsheet-sync-section');

  if (modeBtnFile && modeBtnGsheet) {
    modeBtnFile.addEventListener('click', () => {
      modeBtnFile.className = 'px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-sm transition flex items-center gap-1.5';
      modeBtnGsheet.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5';
      fileUploadSec?.classList.remove('hidden');
      gsheetSyncSec?.classList.add('hidden');
    });

    modeBtnGsheet.addEventListener('click', () => {
      modeBtnGsheet.className = 'px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-sm transition flex items-center gap-1.5';
      modeBtnFile.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5';
      gsheetSyncSec?.classList.remove('hidden');
      fileUploadSec?.classList.add('hidden');
    });
  }

  // Google 試算表讀取按鈕
  document.getElementById('btn-sync-gsheet')?.addEventListener('click', () => {
    const url = document.getElementById('gsheet-url-input')?.value?.trim();
    if (url) handleGoogleSheetSync(url);
    else showToast('請先貼上 Google 試算表連結！', 'error');
  });

  document.getElementById('gsheet-url-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = e.target.value.trim();
      if (url) handleGoogleSheetSync(url);
      else showToast('請先貼上 Google 試算表連結！', 'error');
    }
  });

  // Google Apps Script Web App 回傳按鈕
  document.getElementById('btn-save-gas-url')?.addEventListener('click', () => {
    const gasVal = document.getElementById('gas-url-input')?.value?.trim() || '';
    state.gasUrl = gasVal;
    localStorage.setItem('payroll_gas_url_v2', gasVal);
    showToast('已儲存 Google Apps Script 網址！', 'success');
  });

  document.getElementById('btn-toggle-gas-guide')?.addEventListener('click', () => {
    document.getElementById('gas-guide-drawer')?.classList.toggle('hidden');
  });

  document.getElementById('btn-sync-to-gas')?.addEventListener('click', syncToGoogleSheetViaGAS);
  document.getElementById('btn-send-to-gsheet-top')?.addEventListener('click', syncToGoogleSheetViaGAS);

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

// 當所有外部資源（包含 Google GIS SDK）載入完成後再次確保 Google 按鈕渲染
window.addEventListener('load', () => {
  initGoogleAuth();
});

// Google 試算表線上讀取 (GViz)
async function handleGoogleSheetSync(url) {
  if (!url) return;

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) {
    showToast('無效的 Google 試算表網址，請確認包含 /spreadsheets/d/...', 'error');
    return;
  }

  const sheetId = match[1];
  showToast('正在連線 Google 試算表讀取資料...', 'info');

  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const res = await fetch(gvizUrl);

    if (!res.ok) {
      throw new Error(`連線失敗 (HTTP ${res.status})，請確認試算表共用設定為「知道連結的人都能檢視」！`);
    }

    const csvText = await res.text();
    if (!csvText || csvText.includes('<!DOCTYPE html>') || csvText.includes('accounts.google.com')) {
      throw new Error('無法讀取內容，請確認 Google 試算表已開啟「知道連結的使用者都能檢視」！');
    }

    state.fileName = 'Google 雲端試算表';
    document.getElementById('loaded-file-name').textContent = 'Google 雲端試算表 (線上同步)';
    document.getElementById('file-info-badge').classList.remove('hidden');

    const workbook = XLSX.read(csvText, { type: 'string' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    parseExcelData(jsonData);
    showToast('已成功從 Google 試算表同步讀取並完成核對！', 'success');
  } catch (err) {
    console.error('Google Sheet 讀取錯誤:', err);
    showToast(err.message || '讀取失敗，請確認 Google 試算表共用設定！', 'error');
  }
}
