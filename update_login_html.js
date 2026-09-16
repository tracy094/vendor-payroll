const fs = require('fs');
const htmlPath = '/Users/kuotinghsuan/.gemini/antigravity/scratch/vendor-payroll-system/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// The new login modal HTML
const newLoginHtml = `
  <!-- Login Modal Overlay (Dark blue background as in design) -->
  <div id="login-modal" class="fixed inset-0 z-[100] bg-[#1a1b3b] flex items-center justify-center p-4 transition-opacity duration-300">
    <div class="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl transform transition-all relative overflow-hidden">
      
      <!-- Top Logo and Title -->
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-2xl bg-[#5942f4] text-white font-black text-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          VP
        </div>
        <h3 class="text-xl font-black text-slate-900 tracking-tight mb-1">廠商工資核對請款系統</h3>
        <p class="text-[13px] text-slate-500 font-medium">內部會計與人資協作平台</p>
      </div>

      <!-- Google Login Section -->
      <div class="mb-6 bg-slate-50/50 rounded-2xl border border-slate-200 p-4">
        <label class="block text-[13px] font-bold text-slate-700 mb-3 text-center">Boxful 企業 Google 帳號登入</label>
        
        <!-- Google 官方按鈕容器 -->
        <div id="google-login-wrapper" class="flex flex-col items-center justify-center">
          <div id="g_id_signin_container" class="flex justify-center w-full min-h-[44px] hidden"></div>
          
          <!-- 備用自訂 Google 登入按鈕 -->
          <button type="button" id="btn-custom-google-login" class="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl border border-slate-300 shadow-sm transition flex items-center justify-center gap-2.5">
            <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span id="btn-custom-google-text">使用 Boxful Google 帳號驗證登入</span>
          </button>
        </div>

        <div id="google-login-status" class="mt-2.5 text-[11px] text-center text-slate-400">
          僅限 @boxful.com.tw 網域・系統將自動比對信箱白名單給予角色權限
        </div>
      </div>

      <!-- 分隔線 -->
      <div class="relative flex py-2 items-center mb-4">
        <div class="flex-grow border-t border-slate-100"></div>
        <div class="flex-shrink mx-3 text-[12px] text-slate-500 font-bold flex items-center gap-1.5">
          <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
          測試與角色快速切換登入：
        </div>
        <div class="flex-grow border-t border-slate-100"></div>
      </div>

      <div class="space-y-3" id="login-user-options">
        <!-- Rendered dynamically from users list in JS -->
      </div>
    </div>
  </div>
`;

// Replace the old login modal
html = html.replace(/<div id="login-modal"[\s\S]*?(?=<\/body>)/, newLoginHtml + '\n\n');
fs.writeFileSync(htmlPath, html);
