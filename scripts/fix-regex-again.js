// Session maintenance: keep the single-line Action Input regex intact in renderer.js
const fs = require('fs');
const file = 'd:\\Ultron\\src\\renderer\\renderer.js';
let txt = fs.readFileSync(file, 'utf8');

const broken = 'const inputMatch = text.match(/Action Input:\\s*([\\s\\S]*?)(?=\r\n\r\n|\r\nThought:|\r\nAction:|\r\nFinal Answer:|$)/i);';
const fixed = 'const inputMatch = text.match(/Action Input:\\s*([\\s\\S]*?)(?=\\n\\n|\\nThought:|\\nAction:|\\nFinal Answer:|$)/i);';

if (txt.includes(broken)) {
  fs.writeFileSync(file, txt.replace(broken, fixed));
  console.log('FIXED');
} else if (txt.includes(fixed)) {
  console.log('ALREADY_OK');
} else {
  console.log('PATTERN_MISSING');
}
