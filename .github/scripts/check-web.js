// Safety check run before every APK build: makes sure the app's JavaScript has no syntax errors,
// so a broken change can never be published as a release.
// Checks www/*.js and every inline <script> block in www/index.html. Usage: node .github/scripts/check-web.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', '..', 'www');
let failed = 0, checked = 0;

function check(code, file, lineOffset) {
  checked++;
  try {
    new vm.Script(code, { filename: file, lineOffset });
  } catch (e) {
    failed++;
    // e.stack starts with "file:line" for syntax errors, which points straight at the problem
    const where = path.relative(path.join(WWW, '..'), String(e.stack || '').split('\n')[0]);
    console.log(`::error file=www/${path.basename(file)}::Syntax error at ${where}: ${e.message}`);
  }
}

for (const f of fs.readdirSync(WWW).filter(f => f.endsWith('.js'))) {
  check(fs.readFileSync(path.join(WWW, f), 'utf8'), path.join(WWW, f), 0);
}

const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1], code = m[2];
  if (/\bsrc\s*=/i.test(attrs) || !code.trim()) continue;                           // external file
  const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
  if (type && !/^(text|application)\/javascript$/i.test(type)) continue;            // JSON, templates, modules
  const line = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
  check(code, path.join(WWW, 'index.html'), line);
}

if (failed) {
  console.log(`${failed} of ${checked} scripts have syntax errors. Not building.`);
  process.exit(1);
}
console.log(`All ${checked} scripts are OK.`);
