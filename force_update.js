const fs = require('fs');
const appJsPath = '/Users/kuotinghsuan/.gemini/antigravity/scratch/vendor-payroll-system/app.js';
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Replace the parsing line to temporarily ignore localStorage if the emails aren't updated, or simply force replace it.
// Actually, I can just change the key so it loads the new DEFAULT_USERS fresh!
appJs = appJs.replace(/payroll_users_v3/g, 'payroll_users_v4');

fs.writeFileSync(appJsPath, appJs);
