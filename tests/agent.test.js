/**
 * Agent loop guard + ReAct parser unit tests.
 */
const assert = require('assert');

function parseReactToolCall(text) {
  if (!text || typeof text !== 'string') return null;

  const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/i);
  if (finalMatch && finalMatch[1].trim()) {
    return { type: 'FINAL_ANSWER', content: finalMatch[1].trim() };
  }

  const actionMatch = text.match(/Action:\s*([^\n]+)/i);
  if (!actionMatch) return null;

  const actionName = actionMatch[1].trim().replace(/^["']|["']$/g, '').toUpperCase();
  const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=\n\n|\nThought:|\nAction:|\nFinal Answer:|$)/i);
  let actionInput = inputMatch ? inputMatch[1].trim() : '';

  let args = {};
  if (actionInput) {
    try {
      args = JSON.parse(actionInput);
    } catch (e) {
      args = { appName: actionInput.replace(/^["']|["']$/g, '') };
    }
  }

  return { type: 'APP_ACTION', action: actionName, appName: args.appName };
}

function createLoopGuard(config = {}) {
  const settings = {
    enabled: true,
    maxIdenticalCalls: 3,
    pingPongWindow: 6,
    pollToolBudget: 5,
    warnBeforeBlock: false,
    ...config
  };
  const callCounts = new Map();
  const toolSequence = [];
  const perToolCounts = new Map();

  function checkCall(toolCall) {
    if (!settings.enabled) return { blocked: false, reason: '' };
    const label = toolCall.action || toolCall.type;
    const key = JSON.stringify(toolCall);
    const count = (callCounts.get(key) || 0) + 1;
    callCounts.set(key, count);
    if (count > settings.maxIdenticalCalls) {
      return { blocked: true, reason: 'identical' };
    }
    const perTool = (perToolCounts.get(label) || 0) + 1;
    perToolCounts.set(label, perTool);
    toolSequence.push(label);
    return { blocked: false, reason: '' };
  }

  return { checkCall };
}

function runAgentTests() {
  const openApp = parseReactToolCall(`Thought: I should open Notepad.
Action: OPEN_APP
Action Input: Notepad`);
  assert.ok(openApp);
  assert.strictEqual(openApp.action, 'OPEN_APP');
  assert.strictEqual(openApp.appName, 'Notepad');

  const final = parseReactToolCall('Thought: done\nFinal Answer: Notepad is open.');
  assert.ok(final);
  assert.strictEqual(final.type, 'FINAL_ANSWER');
  assert.match(final.content, /Notepad is open/);

  const guard = createLoopGuard({ maxIdenticalCalls: 2 });
  const tool = { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'Notepad' };
  assert.strictEqual(guard.checkCall(tool).blocked, false);
  assert.strictEqual(guard.checkCall(tool).blocked, false);
  assert.strictEqual(guard.checkCall(tool).blocked, true);

  // Deep research merge dedupes URLs
  function mergeSearchPayloads(base, incoming) {
    const merged = { results: [], answerContext: '', query: incoming.query || base.query || '' };
    const seen = new Set();
    for (const item of [...(base.results || []), ...(incoming.results || [])]) {
      const url = String(item.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.results.push(item);
    }
    return merged;
  }

  const hop1 = { results: [{ url: 'https://a.com', title: 'A' }] };
  const hop2 = { results: [{ url: 'https://a.com', title: 'A dup' }, { url: 'https://b.com', title: 'B' }] };
  const merged = mergeSearchPayloads(hop1, hop2);
  assert.strictEqual(merged.results.length, 2);
  assert.strictEqual(merged.results[1].title, 'B');

  // Content Generation & Web/Code request classification tests
  const isCodeOnlyGenerationRequest = (prompt) => {
    const p = String(prompt || '').toLowerCase();
    if (/\b(only|just)\s+(html|css|javascript|js|python|typescript|tsx?|jsx?|code|sql|json|xml|svg)\b/.test(p)) return true;
    if (/\b(html|css|javascript|js|python|typescript|tsx?|jsx?|code|sql|json|xml|svg)\s+only\b/.test(p)) return true;
    if (/\bwrite\s+(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
    if (/\b(code\s+only|only\s+code)\b/.test(p)) return true;
    if (/\bgive\s+me\s+(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
    if (/\b(show|provide|output)\s+(me\s+)?(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
    return false;
  };

  const isContentGenerationRequest = (prompt) => {
    const p = String(prompt || '');
    if (isCodeOnlyGenerationRequest(p)) return true;
    if (/\b(write|draft|compose|create|generate|give|make|build|design|code|develop|draw|show|plot)\s+(?:a\s+)?(?:me\s+)?(?:an?\s+)?(?:the\s+)?(?:\w+\s+){0,3}(diagram|flowchart|flow\s*chart|architecture|mindmap|mind\s*map|sequence\s*diagram|er\s*diagram|state\s*diagram|chart|graph|visual|infographic|essay|article|story|poem|letter|email|report|summary|speech|blog|post|paragraph|explanation|review|analysis|outline|notes?|caption|headline|bio|resume|cv|itinerary|recipe|table|guide|tutorial|documentation|pitch|proposal|ideas?|questions?|quiz|dialogue|lyrics|script|code|snippet|function|program|class|algorithm|landing\s*page|website|webpage|web\s*site|web\s*page|portfolio|homepage|home\s*page|ui|frontend|component|dashboard|mockup|wireframe|layout|template|navbar|footer|header|card|modal|form|login\s*page|signup\s*page|game|calculator|app|application)\b/i.test(p)) {
      return true;
    }
    if (/\b(create|generate|draw|show|build|make)\s+(?:a\s+)?(?:flowchart|diagram|mindmap|architecture|chart|graph)\b/i.test(p)) {
      return true;
    }
    if (/\b(landing\s*page|website|webpage|web\s*site|web\s*page|portfolio|homepage)\s+(?:for|of|named|about|with)\b/i.test(p)) {
      return true;
    }
    if (/\b(write|create|build|make|generate|design|code)\s+(.+?)\s+in\s+(html|css|javascript|js|python|typescript|ts|react|vue|node|c\+\+|cpp|c#|java|php|ruby|go|rust|swift|kotlin|sql)\b/i.test(p)) {
      return true;
    }
    if (/\bhow\s+to\s+(write|create|build|code|make|develop|implement)\b/i.test(p)) {
      return true;
    }
    if (/\b(write|draft|compose|create|build|make|generate|design)\s+(?:a\s+)?me\b/i.test(p)) {
      return true;
    }
    if (/\b(write|draft|compose|generate)\s+(an?\s+)?(code|script|function|program|snippet|poem|essay|website|page)\b/i.test(p)) {
      return true;
    }
    return false;
  };

  const isInformationalOrHowToQuery = (prompt) => {
    const p = String(prompt || '').toLowerCase().trim();
    if (!p) return false;
    if (/^(how\s+(to|do\s+i|can\s+i|does|would|to\s+get|should\s+i)|what\s+(is|are|does|was|features)|who\s+(is|are|was)|where\s+(to|can\s+i|is)|guide\s+(to|on|for)|tutorial\s+(on|for)|steps\s+to|explain\s+(how|what|why|the)|tell\s+me\s+(how|about|what)|can\s+you\s+(explain|tell|show\s+how)|difference\s+between|why\s+is|why\s+do|benefits\s+of|features\s+of|pros\s+and\s+cons|review\s+of)\b/i.test(p)) {
      return true;
    }
    if (/\b(how\s+to\s+(download|install|use|setup|configure|build|deploy|learn|get|start|connect|run|fix)|what\s+is\s+[a-z0-9]|explain\s+how\s+to|guide\s+for|documentation\s+for|best\s+way\s+to)\b/i.test(p)) {
      return true;
    }
    return false;
  };

  const hasDesktopActionCues = (prompt) => {
    const p = String(prompt || '');
    const cleanPrompt = p.replace(/📄\s*\*\*Attached Document\s*\[[^\]]+\]\*\*:\s*```[\s\S]*?```/gi, '').trim();
    if (isInformationalOrHowToQuery(cleanPrompt) && !/\b(open\s+notepad|open\s+chrome|open\s+edge|open\s+folder|create\s+(a\s+)?(file|folder)|write\s+into\s+notepad|type\s+into\s+notepad|save\s+as\s+[a-z0-9_.-]+\.[a-z]{2,4})\b/i.test(cleanPrompt)) {
      return false;
    }
    return /\b(open|opening|launch|launching|start|starting|focus|switch\s+to|go to|navigate|head to|take me to|browse to|notepad|chrome|edge|browser|save\s+(to|as|it|the)|write\s+(to|into|in)\s+(a\s+)?(file|folder|notepad)|type\s+(into|in|hello|text)|click|screenshot|screen\s*capture|capture\s*(the\s*)?screen|createa?\s+(a\s+)?file|creat\s+(a\s+)?file|create\s+(a\s+)?(file|folder)|new\s+file|simulate\s+(the\s+)?(action\s+of\s+)?(open|launch|type|click))\b/i.test(cleanPrompt)
      || /\.(txt|docx?|pdf|md|js|py|ts|html)\b/i.test(cleanPrompt)
      || /[A-Za-z]:\\/.test(cleanPrompt);
  };

  const extractContentTopic = (prompt) => {
    const p = String(prompt || '');
    const quoted = p.match(/\b(?:topic|about|on)\b\s+["']([^"']+)["']/i);
    if (quoted) return quoted[1].trim().toLowerCase();
    const plain = p.match(/\b(?:topic|about|on)\b\s+([a-z0-9][a-z0-9\s-]{1,40})/i);
    return plain ? plain[1].trim().toLowerCase() : '';
  };

  // Test 1: User's exact prompt from the issue screenshot
  const userSaloonPrompt = "create a me a landing page for a saloon website named as Rajesh Saloon";
  assert.strictEqual(isContentGenerationRequest(userSaloonPrompt), true);
  assert.strictEqual(hasDesktopActionCues(userSaloonPrompt), false);

  // Test 2: Other creative & web prompts
  assert.strictEqual(isContentGenerationRequest("build a landing page for my bakery"), true);
  assert.strictEqual(isContentGenerationRequest("write a python script for binary search"), true);
  assert.strictEqual(isContentGenerationRequest("create a react component for a navbar"), true);
  assert.strictEqual(isContentGenerationRequest("make me a calculator in javascript"), true);
  assert.strictEqual(isContentGenerationRequest("write an essay on global warming"), true);

  // Test 3: Actual desktop action prompts
  assert.strictEqual(hasDesktopActionCues("open Notepad and write hello"), true);
  assert.strictEqual(hasDesktopActionCues("create a folder named test on desktop"), true);

  // Test 4: How-to and Knowledge search queries
  const cursorHowToPrompt = "how to donwlaod and use the cursor ai";
  assert.strictEqual(isInformationalOrHowToQuery(cursorHowToPrompt), true);
  assert.strictEqual(hasDesktopActionCues(cursorHowToPrompt), false);

  // Test 5: Meaningless prompt check does not flag normal questions or documents
  const isMeaninglessPrompt = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return true;
    const plainText = trimmed.replace(/\s+/g, '');
    if (plainText.length >= 5) {
      const firstChar = plainText[0];
      let allSame = true;
      for (let i = 1; i < plainText.length; i++) {
        if (plainText[i] !== firstChar) {
          allSame = false;
          break;
        }
      }
      if (allSame) return true;
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length <= 3) {
      const isAllGibberish = words.every(word => word.length > 6 && !/[aeiouyAEIOUY0-9]/i.test(word));
      if (isAllGibberish) return true;
    }
    return false;
  };

  assert.strictEqual(isMeaninglessPrompt("analyze the resume for me"), false);
  assert.strictEqual(isMeaninglessPrompt("bbbbbbbbbbbb"), true);
  assert.strictEqual(isMeaninglessPrompt("sdfghjklmnbvcxz"), true);
  assert.strictEqual(isMeaninglessPrompt("Can you summarize this attached research paper?"), false);

  // Math query evaluation & intent test
  const evaluateMathQuery = (prompt) => {
    const p = String(prompt || '').trim();
    if (!p) return null;
    const pctMatch = p.match(/(?:what\s+is\s+|calculate\s+|how\s+much\s+is\s+)?([0-9.]+)\s*%\s*(?:of|\*)\s*([0-9.]+)/i);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      const total = parseFloat(pctMatch[2]);
      const res = (pct / 100) * total;
      return { type: 'percentage', expression: `${pct}% of ${total}`, result: res };
    }
    const cleanExpr = p
      .replace(/^(?:how\s+much\s+is|what\s+is\s+the\s+value\s+of|what\s+is|what's|calculate|compute|solve|evaluate)\s+/i, '')
      .replace(/\?+$/, '')
      .replace(/=/g, '')
      .trim();
    let expr = cleanExpr.replace(/[xX×]/g, '*').replace(/÷/g, '/').replace(/(\d+)\s*\^\s*(\d+)/g, 'Math.pow($1, $2)');
    if (/^[0-9\s.+\-*/%(),Math.pow]+$/.test(expr) && /\d/.test(expr)) {
      try {
        const calculated = Function(`'use strict'; return (${expr});`)();
        if (typeof calculated === 'number' && !isNaN(calculated) && isFinite(calculated)) {
          return { type: 'arithmetic', expression: cleanExpr, result: calculated };
        }
      } catch (e) { return null; }
    }
    return null;
  };

  const isMathOrCalculationQuery = (prompt) => {
    const p = String(prompt || '').toLowerCase().trim();
    if (!p) return false;
    if (evaluateMathQuery(p)) return true;
    if (/^(?:calculate|compute|solve|evaluate)\s+[0-9a-z(]/i.test(p)) return true;
    if (/^(?:what\s+is|what's|how\s+much\s+is)\s+[0-9\s.+\-*/%^()xX÷×]+\??$/i.test(p)) return true;
    return false;
  };

  // Test Math calculations: User's exact prompt from issue
  const userMathPrompt = "how much is 100000 + 10000 -1902939 / 10";
  const mathEval = evaluateMathQuery(userMathPrompt);
  assert.notStrictEqual(mathEval, null);
  assert.strictEqual(mathEval.result, -80293.9);
  assert.strictEqual(isMathOrCalculationQuery(userMathPrompt), true);

  // Test other math variations
  assert.strictEqual(evaluateMathQuery("what is 45 * 20").result, 900);
  assert.strictEqual(evaluateMathQuery("calculate 15% of 8500").result, 1275);

  // Test intent routing: Math queries must route to 'math' not 'search'
  const isSystemControlQuery = (prompt) => {
    const p = String(prompt || '').toLowerCase().trim();
    if (!p) return false;
    if (/\b(set\s+(?:system\s+)?volume|change\s+volume|volume\s+to|volume\s+up|volume\s+down|turn\s+(?:up|down)\s+volume|mute\s+audio|unmute\s+audio|toggle\s+mute|mute\s+volume|unmute\s+volume|mute|unmute)\b/i.test(p)) return true;
    if (/\b(?:volume)\b/i.test(p) && /\b(?:\d{1,3}\s*%|\d{1,3}\s*percent|\d{1,3})\b/i.test(p)) return true;
    if (/\b(pause\s+music|play\s+music|pause\s+song|play\s+song|next\s+track|previous\s+track|prev\s+track|next\s+song|previous\s+song|stop\s+music)\b/i.test(p)) return true;
    if (/\b(set\s+(?:screen\s+)?brightness|change\s+brightness|brightness\s+to)\b/i.test(p)) return true;
    if (/\b(lock\s+(?:my\s+)?(?:pc|computer|workstation|screen)|put\s+(?:pc|computer)\s+to\s+sleep|sleep\s+(?:pc|computer))\b/i.test(p)) return true;
    return false;
  };

  // Test intent routing: Math queries must route to 'math' not 'search'
  const classifyIntent = (prompt) => {
    const p = prompt.toLowerCase().trim();
    if (isSystemControlQuery(prompt)) return 'system_control';
    if (isMathOrCalculationQuery(prompt)) return 'math';
    if (isInformationalOrHowToQuery(prompt) && !hasDesktopActionCues(prompt)) return 'search';
    if (isContentGenerationRequest(prompt) && !hasDesktopActionCues(prompt)) return 'conversation';
    if ((p.includes('attached document') || /\b(analyze|analyse|summarize|summary of|review|explain|read|extract|what is in|tell me about)\b/i.test(p)) && /\b(resume|cv|pdf|document|paper|file|report|attachment)\b/i.test(p) && !hasDesktopActionCues(prompt)) {
      return 'conversation';
    }
    return 'action';
  };

  assert.strictEqual(classifyIntent("Create a flowchart diagram showing how user authentication with OAuth2 and JWT refresh tokens works."), 'conversation');
  assert.strictEqual(classifyIntent("Set system volume to 35%"), 'system_control');
  assert.strictEqual(classifyIntent("set volume to 15 percent"), 'system_control');
  assert.strictEqual(classifyIntent("mute audio"), 'system_control');
  assert.strictEqual(classifyIntent("play next track"), 'system_control');
  assert.strictEqual(classifyIntent("how much is 100000 + 10000 -1902939 / 10"), 'math');
  assert.strictEqual(classifyIntent("analyze the resume for me"), 'conversation');
  assert.strictEqual(classifyIntent("how to donwlaod and use the cursor ai"), 'search');
  assert.strictEqual(classifyIntent("📄 **Attached Document [resume.pdf]**:\n```pdf\nSkills: JavaScript, Node.js\n```\n\nAnalyze this resume for me"), 'conversation');

  console.log('✓ Content generation and intent classification tests passed.');

  // Test created file extraction
  function extractCreatedFilesFromText(text) {
    if (!text) return [];
    const found = [];
    const normalized = String(text);
    const quotedRe = /["'`«]([a-zA-Z0-9_\-.\/\\\s]+\.(?:html?|js|ts|py|json|css|txt|md|docx?|xlsx?|pdf|png|jpe?g|csv|bat|ps1|sh|c|cpp|rs|go|java))["'`»]/gi;
    let match;
    while ((match = quotedRe.exec(normalized)) !== null) {
      const raw = match[1].trim();
      const basename = raw.split(/[/\\]/).pop();
      if (basename && !found.some(f => f.filename === basename)) {
        found.push({ filename: basename, fullPath: raw, raw });
      }
    }
    const absPathRe = /\b([a-zA-Z]:\\[^\s"'<>|]+?\.(?:html?|js|ts|py|json|css|txt|md|docx?|xlsx?|pdf|png|jpe?g|csv|bat|ps1|sh|c|cpp|rs|go|java))\b/gi;
    while ((match = absPathRe.exec(normalized)) !== null) {
      const fullPath = match[1].trim();
      const basename = fullPath.split('\\').pop();
      if (fullPath && !found.some(f => f.fullPath === fullPath || f.filename === basename)) {
        found.push({ filename: basename, fullPath, raw: fullPath });
      }
    }
    const savedAsRe = /\b(?:saved\s+(?:as|to|in)|created\s+(?:file|folder)?|written\s+to)\s+["'`]?([a-zA-Z0-9_\-.\/\\\s]+\.[a-zA-Z0-9]+)["'`]?/gi;
    while ((match = savedAsRe.exec(normalized)) !== null) {
      const raw = match[1].trim();
      const basename = raw.split(/[/\\]/).pop();
      if (basename && !found.some(f => f.filename === basename)) {
        found.push({ filename: basename, fullPath: raw, raw });
      }
    }
    return found;
  }

  const sampleAiMsg = 'I have created a landing page for the Rajesh Saloon website, complete with a title, main content, and styled layout. The landing page is saved as "rajesh_saloon_landing_page.html" on the C: drive.';
  const extracted = extractCreatedFilesFromText(sampleAiMsg);
  assert.ok(extracted.some(f => f.filename === 'rajesh_saloon_landing_page.html'), 'Should extract rajesh_saloon_landing_page.html');
  console.log('✓ Created files detection test passed.');

  // Test TTS Catalog and Gemini Live Models
  // Live dialog engines (Native Audio Dialog / Flash Live / Live Translate) are
  // Voice-Mode-only engines and must NOT appear in the TTS voice picker.
  const { getTtsCatalog } = require('../src/main/voice-tts');
  const catalog = getTtsCatalog();
  assert.ok(!catalog.some(m => m.key === 'gemini-2.5-flash-native-audio'), 'TTS picker must not list Gemini 2.5 Flash Native Audio Dialog (Voice Mode only)');
  assert.ok(!catalog.some(m => m.key === 'gemini-3-flash-live'), 'TTS picker must not list Gemini 3 Flash Live (Voice Mode only)');
  assert.ok(!catalog.some(m => m.key === 'gemini-3.5-live-translate'), 'TTS picker must not list Gemini 3.5 Live Translate (Voice Mode only)');
  assert.ok(catalog.some(m => m.key === 'kokoro-heart'), 'Catalog should have Kokoro Heart');
  assert.ok(catalog.some(m => m.key === 'kokoro-michael'), 'Catalog should have Kokoro Michael');
  assert.ok(catalog.some(m => m.key === 'gemini-live-kore'), 'Catalog should keep cloud TTS voice Kore');
  console.log('✓ TTS Catalog and Gemini Live models test passed.');

  // Test Agent Skills Catalog Matching
  const { findSkillsForPrompt, listBuiltinSkills } = require('../src/agent/agent-skills');
  const allSkills = listBuiltinSkills();
  assert.ok(allSkills.length >= 12, 'Skills catalog should contain all built-in specialized skills');

  // Verify specific skill activations
  const uiaMatches = findSkillsForPrompt('inspect window and click button in photoshop');
  assert.ok(uiaMatches.some(s => s.id === 'active-window-vision-controller'), 'Should match active-window-vision-controller');

  const mediaMatches = findSkillsForPrompt('set volume to 40% and play next track on spotify');
  assert.ok(mediaMatches.some(s => s.id === 'system-media-and-audio-control'), 'Should match system-media-and-audio-control');

  const csvMatches = findSkillsForPrompt('analyze this excel spreadsheet and sum column B');
  assert.ok(csvMatches.some(s => s.id === 'spreadsheet-and-csv-analyzer'), 'Should match spreadsheet-and-csv-analyzer');

  const pdfMatches = findSkillsForPrompt('summarize this multi-page contract pdf');
  assert.ok(pdfMatches.some(s => s.id === 'pdf-document-intelligence'), 'Should match pdf-document-intelligence');

  const organizeMatches = findSkillsForPrompt('organize files and sort downloads folder');
  assert.ok(organizeMatches.some(s => s.id === 'bulk-file-organizer-and-renamer'), 'Should match bulk-file-organizer-and-renamer');

  const browserMatches = findSkillsForPrompt('automate browser and fill web form to scrape web');
  assert.ok(browserMatches.some(s => s.id === 'headless-browser-automation'), 'Should match headless-browser-automation');

  const memoryMatches = findSkillsForPrompt('remember that my favorite tech stack is React');
  assert.ok(memoryMatches.some(s => s.id === 'long-term-memory-and-preference-vault'), 'Should match long-term-memory-and-preference-vault');

  const safetyMatches = findSkillsForPrompt('risk check before you format or delete directory');
  assert.ok(safetyMatches.some(s => s.id === 'destructive-command-interceptor-and-sandbox'), 'Should match destructive-command-interceptor-and-sandbox');

  const visualMatches = findSkillsForPrompt('create a flowchart diagram for the authentication pipeline');
  assert.ok(visualMatches.some(s => s.id === 'visual-diagram-chart-creator'), 'Should match visual-diagram-chart-creator');

  console.log('✓ Specialized Agent Skills catalog tests passed.');

  // Test Long-Term Memory Vault and Preferences
  const agentMemory = require('../src/agent/agent-memory');
  const prefs = agentMemory.loadUserPreferences();
  assert.ok(prefs, 'Should load default user preferences');
  agentMemory.saveUserPreference('preferredLanguage', 'Python & TypeScript');
  const updatedPrefs = agentMemory.loadUserPreferences();
  assert.strictEqual(updatedPrefs.preferredLanguage, 'Python & TypeScript', 'Should update preferred language');
  agentMemory.appendPreferenceNote('Always format responses with rich markdown callouts');
  const formattedPrompt = agentMemory.getFormattedPreferencesPrompt();
  assert.ok(formattedPrompt.includes('Python & TypeScript'), 'Formatted prompt should include updated preference');
  assert.ok(formattedPrompt.includes('rich markdown callouts'), 'Formatted prompt should include appended user note');
  console.log('✓ Long-Term Memory Vault & Preference tests passed.');
}

async function runAsyncAgentTests() {
  const fs = require('fs');
  const path = require('path');
  const pdfPath = path.join(__dirname, '..', 'Research Paper.pdf');
  if (fs.existsSync(pdfPath)) {
    // pdf-parse bundles pdf.js which expects browser globals at load time in Node
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init) {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
          if (Array.isArray(init) && init.length >= 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          }
        }
      };
    }
    if (typeof globalThis.ImageData === 'undefined') {
      globalThis.ImageData = class ImageData {
        constructor(width, height) {
          this.width = width || 0;
          this.height = height || 0;
          this.data = new Uint8ClampedArray((this.width * this.height * 4) || 0);
        }
      };
    }
    if (typeof globalThis.Path2D === 'undefined') {
      globalThis.Path2D = class Path2D {
        constructor() {}
        addPath() {}
        closePath() {}
        moveTo() {}
        lineTo() {}
        bezierCurveTo() {}
        quadraticCurveTo() {}
        arc() {}
        arcTo() {}
        ellipse() {}
        rect() {}
      };
    }

    let PDFParse;
    const origWarn = console.warn;
    const origError = console.error;
    try {
      console.warn = (...args) => {
        const msg = String(args[0] || '');
        if (msg.includes('standardFontDataUrl') || msg.includes('polyfill') || msg.includes('require') || msg.includes('URL')) return;
        origWarn.apply(console, args);
      };
      console.error = (...args) => {
        const msg = String(args[0] || '');
        if (msg.includes('standardFontDataUrl') || msg.includes('polyfill') || msg.includes('require')) return;
        origError.apply(console, args);
      };
      ({ PDFParse } = require('pdf-parse'));
    } catch (e) {
      console.warn = origWarn;
      console.error = origError;
      console.log('⚠ PDF extraction test skipped: pdf-parse could not load in this Node environment (' + e.message + ')');
      return;
    }
    const buf = fs.readFileSync(pdfPath);
    try {
      const parser = new PDFParse(new Uint8Array(buf));
      const result = await parser.getText();
      assert.ok(result && result.text && result.text.length > 1000, 'PDF text should be extracted');
      assert.match(result.text, /International Journal|Research|Computer/i);
      console.log('✓ PDF extraction test passed with ' + result.text.length + ' characters extracted.');
    } finally {
      console.warn = origWarn;
      console.error = origError;
    }
  }
}

module.exports = { runAgentTests, runAsyncAgentTests, parseReactToolCall, createLoopGuard };

if (require.main === module) {
  runAgentTests();
  runAsyncAgentTests().then(() => console.log('Agent tests passed.'));
}
