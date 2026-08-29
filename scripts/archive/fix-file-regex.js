// Repairs the Action Input regex in any file when SearchReplace expands \n escapes to raw newlines.
// Usage: node scripts/fix-file-regex.js <file>
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.log('NO_FILE'); process.exit(1); }
let txt = fs.readFileSync(file, 'utf8');

const start = txt.indexOf('const inputMatch = text.match(/Action Input:');
if (start < 0) { console.log('PATTERN_MISSING'); process.exit(0); }
const end = txt.indexOf('$)/i);', start);
if (end < 0) { console.log('END_MISSING'); process.exit(1); }
const span = txt.slice(start, end + '$)/i);'.length);
const fixed = "const inputMatch = text.match(/Action Input:\\s*([\\s\\S]*?)(?=\\n\\n|\\nThought:|\\nAction:|\\nFinal Answer:|$)/i);";
if (span === fixed) { console.log('ALREADY_OK'); process.exit(0); }
txt = txt.slice(0, start) + fixed + txt.slice(end + '$)/i);'.length);
fs.writeFileSync(file, txt);
console.log('FIXED');
