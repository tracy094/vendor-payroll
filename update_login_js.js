const fs = require('fs');
const appJsPath = '/Users/kuotinghsuan/.gemini/antigravity/scratch/vendor-payroll-system/app.js';
let appJs = fs.readFileSync(appJsPath, 'utf8');

// The new renderLoginOptions function
const newRenderFunc = `
function renderLoginOptions() {
  const container = document.getElementById('login-user-options');
  if (!container) return;

  const styleConfig = [
    { bg: 'bg-indigo-50/50', border: 'border-indigo-200', dot: 'bg-indigo-500', textTitle: 'text-slate-800', hover: 'hover:bg-indigo-50' },
    { bg: 'bg-emerald-50/30', border: 'border-emerald-200', dot: 'bg-emerald-500', textTitle: 'text-slate-800', hover: 'hover:bg-emerald-50' },
    { bg: 'bg-amber-50/30', border: 'border-amber-200', dot: 'bg-amber-500', textTitle: 'text-slate-800', hover: 'hover:bg-amber-50' }
  ];

  container.innerHTML = '';
  state.users.forEach((u, idx) => {
    const config = styleConfig[idx % styleConfig.length];
    
    // Determine permissions string based on role
    let permissions = '';
    if (u.role === '人資主管') permissions = '權限：維護人事資料、處理廠商考勤異常';
    else if (u.role === '會計核算') permissions = '權限：下載請款報表、維護 Google 雲端文件連結';
    else if (u.role === '系統管理員') permissions = '權限：全系統完整管理、信箱白名單權限設定';
    else permissions = '權限：一般系統操作';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = \`w-full text-left p-3 rounded-xl border \${config.border} \${config.bg} \${config.hover} transition flex items-center justify-between group\`;
    
    btn.innerHTML = \`
      <div class="flex items-start gap-3">
        <div class="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 \${config.dot}"></div>
        <div>
          <p class="text-[14px] font-bold \${config.textTitle} mb-0.5">\${u.name} (\${u.role})</p>
          <p class="text-[11px] text-slate-500">\${permissions}</p>
        </div>
      </div>
      <div class="text-slate-400 group-hover:\${config.textTitle.replace('slate-800', config.dot.replace('bg-', 'text-'))} transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
      </div>
    \`;
    
    // Quick login action
    btn.addEventListener('click', () => {
      const pwd = prompt(\`請輸入 \${u.name} 的登入密碼 (預設: 123456)：\`);
      if (pwd === null) return; // cancelled
      
      if (pwd === u.password) {
        state.currentUser = u;
        sessionStorage.setItem('payroll_current_user_v3', JSON.stringify(u));
        document.getElementById('login-modal').classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
          document.getElementById('login-modal').classList.add('hidden');
          updateUI();
          showToast(\`歡迎回來，\${u.name}！\`, 'success');
        }, 300);
      } else {
        alert('密碼錯誤，請重試！');
      }
    });

    container.appendChild(btn);
  });
}
`;

appJs = appJs.replace(/function renderLoginOptions\(\) {[\s\S]*?^}/m, newRenderFunc.trim());

// We also need to remove the old form submission event listener for login since we don't have a form anymore
appJs = appJs.replace(/document\.getElementById\('login-form'\)\?\.addEventListener\('submit', \(e\) => {[\s\S]*?}\);/g, '');

fs.writeFileSync(appJsPath, appJs);
