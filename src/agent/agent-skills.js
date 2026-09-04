/**
 * Cognitive & Procedural Skills Catalog for Brown AI.
 * Skills provide procedural playbooks, reasoning methodologies, and specialized engines.
 */
(function () {
  const BUILTIN_SKILLS = [
    {
      id: 'math-computation',
      name: 'Mathematical Analysis & Exact Computation',
      triggers: ['calculate', 'compute', 'how much is', 'what is the value of', 'math', 'arithmetic', 'formula', 'percentage', 'convert', 'solve', 'sqrt', 'power', 'algebra', 'equation'],
      instructions: [
        'Evaluate arithmetic and mathematical expressions deterministically following standard order of operations (PEMDAS/BODMAS).',
        'Show intermediate calculation steps when helpful.',
        'Never approximate without stating so; provide exact values and clean formatted numbers.',
        'Highlight final answers clearly with bold and inline code badges.'
      ].join('\n')
    },
    {
      id: 'deep-thinking-reasoning',
      name: 'Deep Thinking & Chain-of-Thought Reasoning',
      triggers: ['think', 'reason', 'why', 'analyze', 'evaluate', 'logic', 'paradox', 'puzzle', 'riddle', 'proof', 'deduce', 'explain how', 'compare concepts'],
      instructions: [
        'Deconstruct the core problem into foundational premises and sub-questions.',
        'Apply deductive and inductive reasoning step-by-step.',
        'Actively search for counter-examples, edge cases, and logical fallacies.',
        'Synthesize findings into a coherent, well-structured explanation.'
      ].join('\n')
    },
    {
      id: 'decision-making-planner',
      name: 'Strategic Decision-Making & Multi-Path Planning',
      triggers: ['decide', 'choose', 'plan', 'strategy', 'options', 'tradeoffs', 'prioritize', 'roadmap', 'which is better', 'recommend'],
      instructions: [
        'Identify user goals, constraints, resource limits, and success metrics.',
        'Generate and compare distinct alternative options.',
        'Weigh trade-offs across speed, simplicity, reliability, and security.',
        'Recommend the optimal path with actionable, prioritized steps.'
      ].join('\n')
    },
    {
      id: 'tool-availability-verifier',
      name: 'Tool Availability & Capability Pre-Flight Verification',
      triggers: ['tool', 'check tool', 'available', 'capability', 'can you run', 'can you open', 'preflight', 'verify connector', 'execute tool'],
      instructions: [
        'Verify required tool availability (UIA, MCP, System, Filesystem) before execution.',
        'Validate parameter types, paths, and window handles in advance.',
        'If a required tool or capability is unavailable, select the safest fallback method.'
      ].join('\n')
    },
    {
      id: 'backtracking-error-recovery',
      name: 'Autonomous Backtracking & Error Self-Correction',
      triggers: ['error', 'failed', 'retry', 'fix', 'recover', 'troubleshoot', 'cannot open', 'not found', 'backtrack', 'undo'],
      instructions: [
        'Analyze error feedback and observation logs to pinpoint root causes.',
        'Backtrack from the failed step to the last known good environment state.',
        'Mutate tool parameters or switch to alternative execution strategies (e.g. CLI fallback if UI automation fails).',
        'Verify completion before finalizing.'
      ].join('\n')
    },
    {
      id: 'code-architect-engineer',
      name: 'Code Architecture & Software Engineering',
      triggers: ['code', 'program', 'script', 'function', 'class', 'refactor', 'debug', 'typescript', 'python', 'javascript', 'html', 'react', 'api', 'algorithm'],
      instructions: [
        'Write production-grade, secure, and idiomatic code.',
        'Include robust error handling, boundary checks, and concise inline comments.',
        'Format in clean Markdown code blocks with appropriate language tags.'
      ].join('\n')
    },
    {
      id: 'system-telemetry-ops',
      name: 'System Telemetry & Hardware Diagnostics',
      triggers: ['system info', 'specs', 'cpu', 'ram', 'memory', 'disk', 'drives', 'performance', 'hardware', 'os version', 'pc specs'],
      instructions: [
        'Query host environment telemetry for CPU, RAM, OS build, and storage stats.',
        'Format specifications in clean Markdown summary tables.',
        'Highlight key system resource utilization.'
      ].join('\n')
    },
    {
      id: 'open-app-and-type',
      name: 'Open Desktop App and Type Content',
      triggers: ['open notepad and type', 'open word and type', 'write in notepad', 'type in notepad', 'open app and type', 'create in notepad'],
      instructions: [
        'OPEN_APP the requested application.',
        'WAIT ~1000ms for the window to focus.',
        'TYPE_TEXT the requested content into the focused app.',
        'Use CAPTURE_SCREEN only if needed to verify visually.',
        'Respond with a brief confirmation when done.'
      ].join('\n')
    },
    {
      id: 'save-document',
      name: 'Save Current Document',
      triggers: ['save the file', 'save document', 'save it', 'ctrl+s', 'save notepad', 'save word'],
      instructions: [
        'FOCUS_APP the target application if needed.',
        'HOTKEY ctrl+s to save.',
        'If a Save dialog appears, TYPE_TEXT the filename and confirm with Enter or HOTKEY alt+s.',
        'Verify success with CAPTURE_SCREEN if uncertain.'
      ].join('\n')
    },
    {
      id: 'web-intelligence-synthesis',
      name: 'Web Intelligence & Multi-Source Synthesis',
      triggers: ['search the web', 'look up online', 'latest news', 'current price', 'live weather', 'download cursor ai', 'official documentation', 'recent update'],
      instructions: [
        'Perform focused live web search for external, time-sensitive, or specific product/software data.',
        'Deduplicate results across domains and extract verified factual answers.',
        'Synthesize findings with bullet points, clean markdown tables, and source citations [1], [2].'
      ].join('\n')
    },
    {
      id: 'active-window-vision-controller',
      name: 'Active Window UI & Vision Controller',
      triggers: ['inspect window', 'ui elements', 'click button', 'fill form', 'window elements', 'uia', 'find button', 'navigate app', 'photoshop', 'excel ui', 'vs code ui', 'settings ui', 'click ui', 'type in app'],
      instructions: [
        'Inspect native Windows UI controls (buttons, input fields, menus) of the active application using UI Automation (UIA).',
        'Verify the target window is focused with FOCUS_APP or wait for focus before dispatching click or key inputs.',
        'Use CAPTURE_SCREEN and OCR fallback if standard control handles are unavailable or custom-drawn.'
      ].join('\n')
    },
    {
      id: 'system-media-and-audio-control',
      name: 'System Media, Volume & Audio Controller',
      triggers: ['volume', 'mute', 'unmute', 'sound', 'play', 'pause', 'next track', 'prev track', 'media', 'spotify', 'youtube music', 'brightness', 'audio', 'set volume', 'volume up', 'volume down'],
      instructions: [
        'Control system master volume, mute/unmute, and media playback (Play/Pause, Next Track, Previous Track) using SYSTEM_CONTROL.',
        'Support percentage-based volume adjustments (e.g., set volume to 40%, volume up 10%).',
        'Provide instant feedback on the updated system audio or media state.'
      ].join('\n')
    },
    {
      id: 'clipboard-and-snippet-manager',
      name: 'Clipboard & Snippet Manager',
      triggers: ['clipboard', 'paste', 'copy to clipboard', 'snippet', 'clipboard history', 'format clipboard', 'insert snippet', 'transform clipboard'],
      instructions: [
        'Read, format, and transform clipboard data using CLIPBOARD_ACTION (e.g. JSON format, text case conversions, markdown tables).',
        'Insert snippets or formatted text directly into the focused window using TYPE_TEXT.',
        'Confirm successful clipboard update or text insertion.'
      ].join('\n')
    },
    {
      id: 'spreadsheet-and-csv-analyzer',
      name: 'Spreadsheet & CSV Data Intelligence',
      triggers: ['csv', 'excel', 'xlsx', 'spreadsheet', 'analyze table', 'pivot table', 'sum column', 'filter rows', 'data sheet', 'expenses', 'sales data', 'calculate columns'],
      instructions: [
        'Read and parse tabular CSV or Excel data using READ_FILE.',
        'Calculate aggregates (Sum, Average, Min, Max, Median, Count) and filter rows based on criteria.',
        'Present insights in a clean Markdown table with bold summary metrics and optional SVG chart visualization.'
      ].join('\n')
    },
    {
      id: 'pdf-document-intelligence',
      name: 'PDF Document Intelligence & Summarizer',
      triggers: ['pdf', 'read pdf', 'summarize pdf', 'extract from pdf', 'contract pdf', 'resume pdf', 'invoice pdf', 'multi-page pdf', 'parse pdf'],
      instructions: [
        'Extract and analyze text, tables, and sections from multi-page PDF documents.',
        'Structure findings into: Executive Summary, Key Entities & Terms, Core Tables/Numbers, and Action Items.',
        'Highlight critical clauses, dates, and amounts clearly with bold and code tags.'
      ].join('\n')
    },
    {
      id: 'bulk-file-organizer-and-renamer',
      name: 'Bulk File Organizer & Batch Renamer',
      triggers: ['organize files', 'clean downloads', 'organize folder', 'batch rename', 'sort files', 'tidy desktop', 'move images', 'organize documents', 'sort downloads'],
      instructions: [
        'Scan the target directory with LIST_DIR to inspect file extensions and timestamps.',
        'Categorize files systematically (Images: .png, .jpg; Documents: .pdf, .docx, .txt; Code: .js, .py; Installers: .exe, .msi; Archives: .zip).',
        'Create target category folders and move or batch-rename files cleanly, reporting the total sorted files count.'
      ].join('\n')
    },
    {
      id: 'headless-browser-automation',
      name: 'Interactive Browser & Web Task Automation',
      triggers: ['browse', 'automate browser', 'fill web form', 'login to website', 'scrape web', 'click web', 'browser automation', 'download from web', 'web task'],
      instructions: [
        'Navigate to the requested URL using OPEN_URL or headless browser fetch.',
        'Interact with web elements (fill inputs, click buttons, submit search queries).',
        'Extract dynamic content and verify successful completion.'
      ].join('\n')
    },
    {
      id: 'web-page-summarizer-and-extractor',
      name: 'Web Page Distiller & Clean Content Extractor',
      triggers: ['summarize webpage', 'extract article', 'read article', 'clean webpage', 'summarize url', 'webpage content', 'extract from url'],
      instructions: [
        'Fetch webpage content using WEB_FETCH.',
        'Strip advertising boilerplate, navigation links, and clutter.',
        'Generate a structured, bulleted summary highlighting the core insights with source URL attribution.'
      ].join('\n')
    },
    {
      id: 'long-term-memory-and-preference-vault',
      name: 'Long-Term Memory & User Preference Vault',
      triggers: ['remember', 'save preference', 'my preference', 'favorite', 'my tech stack', 'always use', 'recall memory', 'user profile', 'remember that i'],
      instructions: [
        'Store and retrieve persistent user preferences (preferred languages, coding style, timezone, work paths, tone).',
        'Apply saved context seamlessly to future queries without requiring user re-prompting.'
      ].join('\n')
    },
    {
      id: 'session-workspace-context',
      name: 'Session Workspace Context & Repo Awareness',
      triggers: ['workspace', 'project context', 'active repo', 'git status', 'project files', 'current directory', 'workspace overview', 'scaffold project'],
      instructions: [
        'Inspect the active project workspace (package.json, git branch, project directory tree).',
        'Maintain awareness of project dependencies, frameworks, and architecture when answering code questions.'
      ].join('\n')
    },
    {
      id: 'destructive-command-interceptor-and-sandbox',
      name: 'Destructive Command Interceptor & Safety Sandbox',
      triggers: ['delete', 'remove', 'format', 'destroy', 'clean', 'rmdir', 'del', 'erase', 'risk check', 'sandbox', 'destructive', 'kill process', 'force delete'],
      instructions: [
        'Perform pre-flight safety analysis on shell and filesystem commands before execution.',
        'Classify operations into Risk Levels: LOW, MEDIUM, HIGH, CRITICAL.',
        'Intercept destructive commands (e.g. broad file deletion, disk formatting, registry edits) and prompt for explicit user confirmation.'
      ].join('\n')
    },
    {
      id: 'visual-diagram-chart-creator',
      name: 'Interactive Visuals, Diagrams & Charts Creator',
      triggers: ['diagram', 'chart', 'graph', 'flowchart', 'architecture', 'mindmap', 'visualize', 'draw', 'plot', 'timeline', 'gantt', 'pie chart', 'bar chart', 'visual', 'create visual', 'show visual', 'show diagram', 'generate flowchart', 'generate diagram'],
      instructions: [
        'ONLY activate when the user explicitly asks for a diagram, chart, flowchart, architecture drawing, mindmap, or visualization.',
        'NEVER use this skill for reminders, timers, alarms, or "remind me in X seconds/minutes" requests — those are real scheduling asks, not diagrams.',
        'When asked to create any system architecture, workflow, flowchart, or diagram, always output a COMPLETE, fully connected Mermaid code block (```mermaid ... ```).',
        'Rules for diagrams:',
        '1. Explicit node IDs and complete descriptive labels with brackets, e.g. Lexical[Lexical Analysis] --> Syntax[Syntax Analysis].',
        '2. For linear phases/pipelines/workflows: use a simple flowchart TD with every step connected in order. Do NOT invent placeholder labels like "Step 1" or "Process Steps".',
        '3. Every node must be connected with arrows (-->). Never output bare disconnected lines inside the mermaid block.',
        '4. Decision/edge labels MUST stay on the arrow as -->|Yes| or -->|No| between nodes — NEVER glue them into node text (wrong: C[|Yes| Set Reminder] or "|Yes| CSet Reminder"; right: A{Ask?} -->|Yes| C[Set Reminder]).',
        '5. Put all explanatory narrative outside the ```mermaid code block.',
        '6. Do NOT use classDef, style, click, or CSS attributes like color="#...". Avoid subgraphs unless the user asked for layered architecture.',
        '',
        'Example — Compiler Phases:',
        '```mermaid',
        'flowchart TD',
        '  Lexical[Lexical Analysis] --> Syntax[Syntax Analysis]',
        '  Syntax --> Semantic[Semantic Analysis]',
        '  Semantic --> IR[Intermediate Code Generation]',
        '  IR --> Opt[Code Optimization]',
        '  Opt --> CodeGen[Code Generation]',
        '```',
        '',
        'Example with edge labels:',
        '```mermaid',
        'flowchart TD',
        '  Ask{Ready?} -->|Yes| Go[Start Process]',
        '  Ask -->|No| Wait[Wait and Retry]',
        '```',
        '',
        'Example System Architecture (only when asked for architecture):',
        '```mermaid',
        'flowchart TD',
        '  Web[Web / React App] --> LB[Load Balancer]',
        '  Mobile[Mobile Clients] --> LB',
        '  LB --> API[REST / GraphQL API]',
        '  API --> DB[(Primary Database)]',
        '```',
        'To generate a concept mindmap or taxonomy breakdown:',
        '```mermaid',
        'mindmap',
        '  root((System Architecture))',
        '    Ingestion Layer',
        '      WebSocket Cluster',
        '      REST API Gateway',
        '    Processing Layer',
        '      Message Queue',
        '      Stream Workers',
        '    Storage Layer',
        '      PostgreSQL DB',
        '      Redis Cache',
        '```',
        'To generate an interactive bar, line, or pie/donut data chart, output a clean chart block:',
        '```chart',
        'type: bar (or line, pie, donut)',
        'title: Comparison / Metrics Title',
        'unit: ms (or %, USD, users)',
        'Option A: 120',
        'Option B: 85',
        'Option C: 210',
        '```',
        'End with a brief ### Summary (2–4 bullets) explaining the flow.'
      ].join('\n')
    },
    {
      id: 'generative-ui-builder',
      name: 'Inline Generative UI & Interactive Widgets',
      triggers: ['interactive widget', 'calculator', 'converter', 'simulator', 'generative ui', 'interactive ui', 'create widget', 'build widget', 'live dashboard widget', 'custom tool'],
      instructions: [
        'To create an interactive live tool, calculator, converter, or mini-dashboard rendered directly in the chat bubble, output a ```gen-ui code block containing HTML, embedded CSS (<style>), and working JavaScript (<script>):',
        '```gen-ui',
        '<!-- title: Interactive Calculator -->',
        '<div class="widget-box">',
        '  <div class="grid gap-2">',
        '    <label>Input Value: <input type="number" id="val1" value="100"></label>',
        '    <button onclick="compute()">Run Calculation</button>',
        '  </div>',
        '  <div id="result" class="result-badge" style="margin-top:12px;">Output: 100</div>',
        '</div>',
        '<script>',
        'function compute() {',
        '  const v = parseFloat(document.getElementById("val1").value) || 0;',
        '  document.getElementById("result").textContent = "Output: " + (v * 2);',
        '}',
        '<\/script>',
        '```',
        'Provide a brief 1–2 sentence summary explaining the interactive tool.'
      ].join('\n')
    },
    {
      id: 'file-read-summarize',
      name: 'Read and Summarize Local File',
      triggers: ['read file', 'summarize file', 'what is in', 'contents of file', 'parse document'],
      instructions: [
        'READ_FILE the requested path.',
        'Summarize key insights in clear language.',
        'Do not dump raw binary or excessively long files unless explicitly asked.'
      ].join('\n')
    }
  ];

  function isReminderOrTimerPrompt(prompt) {
    const p = String(prompt || '').toLowerCase();
    if (!p.trim()) return false;
    if (/\b(diagram|flowchart|flow\s*chart|mermaid|mindmap|visualize|infographic)\b/i.test(p)) return false;
    return /\b(remind\s+me|set\s+(a\s+)?(reminder|timer|alarm)|timer\s+for|alarm\s+(for|in)|wake\s+me(\s+up)?)\b/i.test(p)
      || (/\b(remind|timer|alarm|notify\s+me|ping\s+me)\b/i.test(p) && /\b(in|after|for)\s+\d+/i.test(p));
  }

  function findSkillsForPrompt(prompt, limit = 3) {
    const p = String(prompt || '').toLowerCase();
    if (!p.trim()) return [];
    const blockVisuals = isReminderOrTimerPrompt(p);
    const scored = BUILTIN_SKILLS.map(skill => {
      if (blockVisuals && (skill.id === 'visual-diagram-chart-creator' || skill.id === 'generative-ui-builder')) {
        return { skill, score: 0 };
      }
      let score = 0;
      for (const trigger of skill.triggers) {
        if (p.includes(trigger)) score += trigger.length;
      }
      return { skill, score };
    }).filter(entry => entry.score > 0);

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => entry.skill);
  }

  function buildSkillsPromptSection(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return '';
    const blocks = skills.map(skill => (
      `### Skill: ${skill.name}\n${skill.instructions}\n(Apply these skill instructions directly using your capabilities — do not call a "skill" tool.)`
    ));
    return `\n\nACTIVATED COGNITIVE & PROCEDURAL SKILLS:\n${blocks.join('\n\n')}`;
  }

  function listBuiltinSkills() {
    return BUILTIN_SKILLS.map(skill => ({
      id: skill.id,
      name: skill.name,
      triggers: skill.triggers.slice()
    }));
  }

  const api = {
    findSkillsForPrompt,
    buildSkillsPromptSection,
    listBuiltinSkills
  };

  if (typeof window !== 'undefined') {
    window.UltronAgentSkills = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
