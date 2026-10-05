const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const features = require('../src/config/release-features');
assert.equal(features.computerActions, false);
const context = { window: {}, document: { readyState: 'loading', addEventListener() {} }, console, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/visual-engine.js'), 'utf8'), context);
const engine = context.window.UltronVisualEngine;
assert.equal(engine.parseChartData('{"labels":["A","B"],"values":[10,20]}').values.length, 2);
for (const data of [{ labels: ['A'], values: [1,2] }, {values:[null]}, {values:['bad']}, {type:'pie',values:[-1,2]}, {points:[[1,'bad']]}]) {
  assert.throws(() => engine.parseChartData(JSON.stringify(data)));
  assert.match(engine.renderChart(JSON.stringify(data)), /could not be rendered/);
}
assert.throws(() => engine.parseChartData('{bad json}'));
console.log('PASS: chat-only release gate and invalid chart data recovery');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const validation = renderer.slice(renderer.indexOf('async function validateGeneratedVisuals('), renderer.indexOf('\nasync function queryOfflineLLM('));
vm.runInNewContext(validation, context);
const validationContext = { window: { UltronVisualEngine: engine, mermaid: { parse: async () => true } } };
vm.createContext(validationContext); vm.runInContext(validation, validationContext);
const normalizeSource = renderer.slice(renderer.indexOf('function normalizeGeneratedChart('), renderer.indexOf('\nasync function validateGeneratedVisuals('));
const extractSource = renderer.slice(renderer.indexOf('function extractJsonLoose('), renderer.indexOf('\n}', renderer.indexOf('function extractJsonLoose(')) + 2);
vm.runInContext(extractSource + '\n' + normalizeSource, validationContext);
assert.match(validationContext.normalizeGeneratedChart('```\n{"type":"bar","labels":["A"],"values":[1]}\n```','bar chart'), /^```chart/);
(async () => {
  assert.notEqual(await validationContext.validateGeneratedVisuals('```mermaid\nflowchart TD\nA --> B\n```', 'bar chart'), '');
  assert.equal(await validationContext.validateGeneratedVisuals('```chart\n{"type":"bar","labels":["A"],"values":[1]}\n```', 'bar chart'), '');
  assert.notEqual(await validationContext.validateGeneratedVisuals('```chart\n{"labels":["A"],"values":[1,2]}\n```', 'bar chart'), '');
  console.log('PASS: numerical-chart requests reject unrelated flowcharts and mismatched data');
})().catch(error => { console.error(error); process.exitCode = 1; });
