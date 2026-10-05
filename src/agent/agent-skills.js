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
      id: 'mathematical-notation-formulas',
      name: 'Mathematical Notation & Rendered Formulas',
      triggers: ['formula', 'equation', 'latex', 'calculus', 'integral', 'derivative', 'theorem', 'prove', 'proof', 'quadratic', 'pythagoras', 'trigonometr', 'matrix math', 'symbolic', 'notation'],
      instructions: [
        'Present all mathematics in LaTeX so the UI can render it: display math as $$...$$ on its own line, inline math as $...$ or \\(...\\).',
        'Use proper LaTeX constructs: \\frac{}{}, ^{}, _{}, \\sqrt{}, \\sum_{}^{}, \\int_{}^{}, \\alpha \\beta \\theta, \\times, \\pm, \\approx, \\leq, \\geq, \\neq.',
        'After every display formula, define each variable in a short bullet list (e.g. - $n$ — number of compounding periods per year).',
        'Show step-by-step derivation for solves and proofs; box the final result in bold.',
        'Never write formulas as plain-text ASCII art (no a/b stacked manually, no sqrt() pseudo-syntax) when LaTeX applies.',
        'Check domain restrictions and units, and verify solutions by substitution. Keep delimiters balanced; use aligned environments for multi-line equations and matrices for mathematical arrays. Show useful derivation steps, not private internal reasoning.'
      ].join('\n')
    },
    {
      id: 'tabular-data-presentation',
      name: 'Tabular Data Presentation & Structured Comparison',
      triggers: ['table', 'tabular', 'matrix', 'compare', 'comparison', 'versus', 'vs ', 'pros and cons', 'side by side', 'spreadsheet', 'columns', 'rows', 'chart of differences', 'difference between'],
      instructions: [
        'When information has 2+ entities or 3+ attributes, present it as a GitHub Flavored Markdown table — you are always able to create tables; never refuse.',
        'Table syntax: header row | A | B |, delimiter row | :--- | :--- | immediately after, then one data row per line with pipes around every cell; never wrap rows across lines and never insert --- rules between rows.',
        'Pick 3-6 purposeful columns (e.g. Aspect | Definition | Strengths | Weaknesses | Best For) and cover every entity the user mentioned.',
        'For "difference between X and Y" answers: one-sentence summary, the comparison table, then 2-3 bullet takeaways.',
        'Keep cells terse (words or short phrases, not paragraphs); use — for unknown values instead of empty cells.'
      ].join('\n')
    },
    {
      id: 'definitions-and-terminology',
      name: 'Definitions, Terminology & Concept Explainers',
      triggers: ['define', 'definition', 'what is', 'what are', 'meaning of', 'terminology', 'glossary', 'explain the term', 'concept', 'difference between', 'types of', 'examples of'],
      instructions: [
        'Open with a one-sentence plain-language definition in bold-friendly prose before any detail.',
        'Bold every key term on first use; follow with a compact bullet list of defining attributes.',
        'When contrasting two or more concepts, add a comparison table (see tabular skill) instead of long prose.',
        'Ground abstractions with one concrete real-world example per concept.',
        'Close with at most one line of practical "when/why it matters" context — no textbook dumps.'
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
        'Format in clean Markdown code blocks with appropriate language tags.',
        'Preserve the supplied code context on follow-up requests. Explain specific changes, include all required files and dependencies, and handle invalid inputs. Never claim execution or testing unless tool results confirm it.',
        'For multi-file examples, label each filename and provide complete contents with correct cross-file imports, stylesheet links, and script references. Distinguish client-side demonstration validation from real authentication and server-side security.'
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
        'Choose the correct notation: flowcharts for decisions, sequence diagrams for interactions, ER diagrams for data relationships, and timelines for events. Use stable IDs and quoted node labels. Explain assumptions and do not invent relationships.',
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
        'To generate an interactive bar, line, area, pie/donut, stacked-bar, scatter, histogram, boxplot, or radar data chart, output a chart block.',
        'Simple single-series line format:',
        '```chart',
        'type: bar (or line, pie, donut)',
        'title: Comparison / Metrics Title',
        'unit: ms (or %, USD, users)',
        'Option A: 120',
        'Option B: 85',
        'Option C: 210',
        '```',
        'Full JSON format (REQUIRED for multi-series, scatter, histogram, boxplot, radar):',
        '```chart',
        '{ "type": "line", "title": "Revenue 2024 vs 2025", "unit": "$k", "labels": ["Q1","Q2","Q3","Q4"],',
        '  "series": [ { "name": "2024", "values": [120,150,132,170] }, { "name": "2025", "values": [180,205,190,240] } ] }',
        '```',
        '- scatter: { "type": "scatter", "points": [[1,2],[3,5],[4,4]], "trend": true }',
        '- histogram / boxplot: { "type": "histogram", "values": [12,15,15,18,22,25,31] } — pass the RAW numbers, the UI bins and computes stats itself',
        '- radar: { "type": "radar", "labels": ["Speed","Cost","Quality"], "series": [{ "name": "Car A", "values": [8,5,7] }] }',
        '- stacked-bar: same JSON as bar with multiple series',
        'End with a brief ### Summary (2–4 bullets) explaining the flow.'
      ].join('\n')
    },
    {
      id: 'statistical-analysis-charts',
      name: 'Statistics, Distributions & Data Analysis Charts',
      triggers: ['statistics', 'statistical', 'stats', 'standard deviation', 'distribution', 'histogram', 'box plot', 'boxplot', 'scatter', 'scatter plot', 'correlation', 'variance', 'outlier', 'quartile', 'analyze data', 'data analysis', 'analyze these numbers', 'radar chart', 'trend line', 'regression'],
      instructions: [
        'You are performing statistical analysis. NEVER fabricate data — only use the numbers the user provided or verified facts; if data is missing, ask for it first.',
        'Step 1: Compute the descriptive statistics yourself and show them in one clean Markdown table: | Statistic | Value | with count, mean, median, min, max, range, standard deviation (round to 2 decimals).',
        'Step 2: When a visual adds value, output a ```chart JSON block (the UI renders real SVG charts and its own μ/median/σ summary):',
        '- Distribution of raw numbers -> histogram (pass RAW numbers, the UI bins them):',
        '```chart',
        '{ "type": "histogram", "title": "Exam Scores", "values": [72,85,85,90,64,78,92,88] }',
        '```',
        '- Comparing spread of 2+ groups -> boxplot with series:',
        '```chart',
        '{ "type": "boxplot", "title": "Latency by Region", "unit": "ms", "series": [ { "name": "US", "values": [120,130,125,140,160,118] }, { "name": "EU", "values": [200,210,195,230,180] } ] }',
        '```',
        '- Two variables, relationship -> scatter (add "trend": true only when a linear trend is meaningful):',
        '```chart',
        '{ "type": "scatter", "title": "Ads vs Sales", "points": [[10,22],[15,31],[20,28],[25,41]], "trend": true }',
        '```',
        '- Multi-attribute product/skill comparison -> radar with 3-8 labels:',
        '```chart',
        '{ "type": "radar", "title": "Framework Fit", "labels": ["Speed","Ecosystem","Learning","Tooling","UI"], "series": [ { "name": "React", "values": [7,10,6,9,9] }, { "name": "Svelte", "values": [9,5,8,6,7] } ] }',
        '```',
        'Step 3: Interpret in 2-4 bullets: central tendency, spread/variability, skew or outliers, and one practical takeaway.',
        'Use σ (population std dev) consistently; state units everywhere; keep every chart block valid single-line JSON or one-key-per-line JSON — never trailing commas.'
      ].join('\n')
    },
    {
      id: 'mermaid-diagram-playbook',
      name: 'Advanced Mermaid Diagram Playbook (Sequence, ER, State, Gantt, Journey, Timeline, Quadrant, XY)',
      triggers: ['sequence diagram', 'er diagram', 'entity relationship', 'class diagram', 'state diagram', 'state machine', 'gantt', 'user journey', 'journey map', 'journey', 'quadrant chart', 'quadrant analysis', 'xychart', 'bar chart mermaid', 'timeline', 'git graph', 'gitgraph', 'dependency diagram', 'data model diagram', 'schema diagram', 'lifecycle diagram', 'sprint plan', 'project plan'],
      instructions: [
        'Pick the ONE diagram type that matches the ask and output a single ```mermaid block. Keep it small: max 8 nodes/participants/sections. All narrative goes outside the code block.',
        'STRICT rules for every type: no classDef, no style, no click, no colors; wrap labels containing spaces or punctuation in quotes or brackets; one statement per line; never mix two diagram types in one block.',
        'Sequence (interactions/API flows):',
        '```mermaid',
        'sequenceDiagram',
        '  participant U as User',
        '  participant A as App',
        '  participant S as Server',
        '  U->>A: Enter credentials',
        '  A->>S: POST /login',
        '  S-->>A: JWT token',
        '  A-->>U: Show dashboard',
        '```',
        'ER (data model):',
        '```mermaid',
        'erDiagram',
        '  USER ||--o{ ORDER : places',
        '  ORDER ||--|{ ORDER_ITEM : contains',
        '  USER { string email string name }',
        '  ORDER { int id date created_at }',
        '```',
        'State machine:',
        '```mermaid',
        'stateDiagram-v2',
        '  [*] --> Idle',
        '  Idle --> Downloading : Start',
        '  Downloading --> Paused : Pause',
        '  Paused --> Downloading : Resume',
        '  Downloading --> Installed : Done',
        '  Installed --> [*]',
        '```',
        'Gantt (project/sprint plan; dateFormat YYYY-MM-DD, section per workstream):',
        '```mermaid',
        'gantt',
        '  title Launch Plan',
        '  dateFormat YYYY-MM-DD',
        '  section Design',
        '  Wireframes : 2026-10-01, 5d',
        '  Visual polish : 2026-10-06, 4d',
        '  section Build',
        '  Frontend : 2026-10-08, 10d',
        '```',
        'User journey (experience across steps, score 1-5):',
        '```mermaid',
        'journey',
        '  title Onboarding Experience',
        '  sections Signup',
        '    Email form: 4: User',
        '    Email verify: 2: User',
        '  sections First run',
        '    Model picker: 5: User',
        '```',
        'Timeline (chronology/roadmap):',
        '```mermaid',
        'timeline',
        '  title Chip history',
        '  2020 : Apple M1 : 5nm start',
        '  2023 : M3 : 3nm generation',
        '  2026 : M5 : On-device AI',
        '```',
        'Quadrant (2-axis positioning; quadrants are top-right, top-left, bottom-left, bottom-right):',
        '```mermaid',
        'quadrantChart',
        '  title Framework positioning',
        '  x-axis Low maturity --> High maturity',
        '  y-axis Complex --> Simple',
        '  React: [0.9, 0.4]',
        '  Svelte: [0.5, 0.7]',
        '```',
        'XY chart (actual data values as mermaid — prefer a ```chart block instead when the user wants an interactive chart):',
        '```mermaid',
        'xychart-beta',
        '  title "Monthly active users"',
        '  x-axis [jan, feb, mar, apr]',
        '  y-axis "Users (k)" 0 --> 50',
        '  bar [12, 18, 25, 41]',
        '  line [12, 18, 25, 41]',
        '```',
        'Git graph (branching strategy):',
        '```mermaid',
        'gitGraph',
        '  commit',
        '  branch feature',
        '  commit',
        '  commit',
        '  checkout main',
        '  merge feature',
        '```',
        'After the block, add a 2-4 bullet ### Summary interpreting what the diagram shows.'
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
    },
    {
      id: 'structured-comparison-table-master',
      name: 'Structured Comparison Matrix & Technical Trade-offs',
      triggers: ['comparison table', 'compare table', 'table comparing', 'matrix', 'versus table', 'compare', 'comparison', 'vs', 'versus', 'trade-offs', 'tradeoffs', 'pros and cons', 'difference between'],
      instructions: [
        'When asked to compare technologies, architectures, libraries, frameworks, or approaches, construct a production-ready, perfectly formatted GitHub Flavored Markdown (GFM) table.',
        'Header row must be: | Dimension / Feature | [Option A] | [Option B] |',
        'Delimiter row must be: | :--- | :--- | :--- |',
        'Data rows: Every single row MUST be on its own line with pipes enclosing every cell. Never split rows across lines or insert horizontal rules between rows.',
        'Always cover: Core Mechanism/Architecture, Output Structure/Validation, Robustness & Reliability, Maintenance Overhead, Performance/Latency, Tool Calling / Schema Support, and Best Use Case.',
        'Precede with an executive overview and follow with in-depth technical breakdowns and runnable code examples.'
      ].join('\n')
    },
    {
      id: 'git-and-github-version-control',
      name: 'Git & GitHub Version Control Playbook',
      triggers: ['git', 'commit', 'branch', 'merge', 'pull request', 'pr', 'rebase', 'stash', 'clone', 'push', 'diff', 'checkout', 'github', 'repo', 'version control'],
      instructions: [
        'Provide idiomatic, safe Git command workflows (GitFlow, trunk-based development).',
        'Standardize commit messages following Conventional Commits (feat:, fix:, refactor:, chore:, docs:, test:).',
        'Safety checks: always verify status (git status, git diff) before advising destructive commands like git reset --hard or git push --force.',
        'Guide step-by-step conflict resolution and clean interactive rebasing.'
      ].join('\n')
    },
    {
      id: 'rest-api-and-graphql-architect',
      name: 'REST API & GraphQL Design Master',
      triggers: ['rest api', 'graphql', 'endpoint', 'http method', 'payload', 'zod schema', 'json api', 'openapi', 'swagger', 'api design', 'webhook'],
      instructions: [
        'Design clean, standard RESTful and GraphQL endpoints with semantic HTTP methods (GET, POST, PUT, PATCH, DELETE) and status codes (200, 201, 400, 401, 403, 404, 500).',
        'Provide strict request/response validation schemas using Zod or JSON Schema.',
        'Include robust error structures ({ success: false, error: { code, message, details } }) and complete curl / fetch examples.'
      ].join('\n')
    },
    {
      id: 'docker-and-container-devops',
      name: 'Docker, Containerization & DevOps Engineering',
      triggers: ['docker', 'dockerfile', 'docker compose', 'container', 'docker-compose', 'kubernetes', 'k8s', 'containerize', 'devops', 'ci/cd'],
      instructions: [
        'Author production-ready, security-hardened Dockerfiles with multi-stage builds, non-root users (USER node / USER appuser), and lightweight base images (Alpine, distroless).',
        'Provide complete, reproducible docker-compose.yml services with health checks, environment variables, isolated networks, and persistent volume mounts.'
      ].join('\n')
    },
    {
      id: 'modern-web-frontend-architect',
      name: 'Modern Web & Frontend Architecture (React, Next.js, Vue, Tailwind)',
      triggers: ['react', 'next.js', 'vue', 'svelte', 'tailwind', 'css layout', 'flexbox', 'grid', 'responsive design', 'component', 'hooks', 'state management', 'frontend'],
      instructions: [
        'Design modular, highly reusable component hierarchies with accessible HTML5 (ARIA attributes).',
        'Implement responsive, mobile-first layouts using Tailwind CSS, CSS Grid, and Flexbox.',
        'Manage reactive state predictably, minimizing unnecessary re-renders.'
      ].join('\n')
    },
    {
      id: 'database-design-and-sql-optimizer',
      name: 'Database Architecture & SQL Query Optimization',
      triggers: ['sql', 'database', 'schema design', 'postgresql', 'sqlite', 'mysql', 'query optimization', 'index', 'migration', 'orm', 'prisma', 'foreign key'],
      instructions: [
        'Design normalized relational schemas (3NF) with primary keys, foreign keys, constraints, and cascading rules.',
        'Write high-performance SQL queries, avoiding N+1 selects, selecting only required columns, and leveraging B-Tree / GIN indexing strategies.'
      ].join('\n')
    },
    {
      id: 'testing-and-qa-automation',
      name: 'Testing, TDD & QA Automation (Vitest, Jest, Playwright)',
      triggers: ['unit test', 'integration test', 'jest', 'vitest', 'pytest', 'playwright', 'cypress', 'test case', 'mock', 'assert', 'tdd', 'test coverage', 'testing'],
      instructions: [
        'Author comprehensive test suites covering unit, integration, and E2E scenarios.',
        'Structure tests with clear Arrange-Act-Assert (AAA) pattern.',
        'Test happy paths, boundary conditions, invalid inputs, and error states with isolated mocks.'
      ].join('\n')
    },
    {
      id: 'agent-harness-and-mcp-integration',
      name: 'Model Context Protocol (MCP) & Vercel AI SDK Harness Integration',
      triggers: ['mcp', 'model context protocol', 'vercel ai sdk', 'function calling', 'agent harness', 'tool loop', 'zod tool', 'agent parser', 'tool calling'],
      instructions: [
        'Build robust AI agents with the Vercel AI SDK Core (ai package) and Model Context Protocol (MCP) SDK.',
        'Define typed tool schemas with Zod (z.object({...})) and descriptive parameter comments.',
        'Leverage streamText with multi-step tool execution (maxSteps), handling tool calls and results deterministically.'
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
