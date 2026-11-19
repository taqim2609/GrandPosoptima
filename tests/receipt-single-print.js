const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../project/frontend/src/lib/receipt.js'), 'utf8');
const browserPrint = src.match(/function browserPrint\(order, cfg, logoB64\) \{([\s\S]*?)\n\}/)?.[1];
assert(browserPrint, 'browserPrint implementation exists');
assert.match(browserPrint, /doc\.write\(html\)/, 'iframe receives receipt HTML');
assert.doesNotMatch(browserPrint, /contentWindow\?\.print\(\)/, 'parent does not issue a second print');
assert.match(src, /window\.onload = function\(\)\s*\{\s*window\.print\(\);/, 'receipt document prints once on load');
console.log('PASS receipt browser path has one print trigger and no parent duplicate');
