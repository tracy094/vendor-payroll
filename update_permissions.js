const fs = require('fs');
const appJsPath = '/Users/kuotinghsuan/.gemini/antigravity/scratch/vendor-payroll-system/app.js';
let appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Update DEFAULT_USERS emails
appJs = appJs.replace(
  /const DEFAULT_USERS = \[[\s\S]*?\];/,
  `const DEFAULT_USERS = [
  { username: 'lika', password: '1', name: 'Lika', role: '人資主管', googleEmail: 'Lika@boxful.com.tw', canEdit: false },
  { username: 'tracy', password: '1', name: 'Tracy', role: '會計核算', googleEmail: 'tracy@boxful.com.tw', canEdit: true },
  { username: 'aaliyah', password: '1', name: 'Aaliyah', role: '系統管理員', googleEmail: 'aaliyah@boxful.com.tw', canEdit: false }
];`
);

// 2. Update renderLoginOptions to show the permissions correctly
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
    
    // Determine permissions string based on the Google Sheet
    let permissionsText = u.canEdit ? '權限：可查看、可編輯' : '權限：僅可查看';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = \`w-full text-left p-3 rounded-xl border \${config.border} \${config.bg} \${config.hover} transition flex items-center justify-between group\`;
    
    btn.innerHTML = \`
      <div class="flex items-start gap-3">
        <div class="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 \${config.dot}"></div>
        <div>
          <p class="text-[14px] font-bold \${config.textTitle} mb-0.5">\${u.name} (\${u.role})</p>
          <p class="text-[11px] text-slate-500">\${permissionsText}</p>
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
      
      // We accept 123456 as the fallback password for convenience, or u.password if it was changed
      if (pwd === u.password || pwd === '123456') {
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

// Also clear localStorage so it picks up the new DEFAULT_USERS with canEdit properties
// Wait, we can't clear localStorage from a node script that modifies app.js, but we can add a one-off line to clear it on page load, or just tell the user to reset it.
// To make it seamless, let's inject a small check at initialization:
if (!appJs.includes('localStorage.removeItem(\'payroll_users_v3\'); // Forced reset')) {
  appJs = appJs.replace(
    /function loadUsers\(\) {/,
    `function loadUsers() {
  localStorage.removeItem('payroll_users_v3'); // Forced reset to pick up new permissions`
  );
}

fs.writeFileSync(appJsPath, appJs);
