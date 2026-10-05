const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../src/agent/agent-skills');
const ids = new Set(['math-computation', 'mathematical-notation-formulas', 'tabular-data-presentation', 'definitions-and-terminology', 'deep-thinking-reasoning', 'code-architect-engineer', 'spreadsheet-and-csv-analyzer', 'visual-diagram-chart-creator', 'statistical-analysis-charts', 'mermaid-diagram-playbook', 'generative-ui-builder']);
const skills = catalog.listBuiltinSkills().filter(skill => ids.has(skill.id)).map(skill => {
  const source = catalog.findSkillsForPrompt(skill.triggers.join(' '), 100).find(item => item.id === skill.id);
  return { ...skill, instructions: source.instructions };
});
const target = path.join(__dirname, '../mobile/src/services/inference/DesktopAnswerSkills.ts');
fs.writeFileSync(target, '// Generated from the desktop cognitive skill catalog. Run scripts/sync-mobile-answer-skills.cjs to update.\nexport const DESKTOP_ANSWER_SKILLS = ' + JSON.stringify(skills, null, 2) + ' as const;\n');
console.log(`Synced ${skills.length} answer skills to mobile.`);
