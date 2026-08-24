/**
 * Ultron Agent system prompt builder.
 * Loads ultron-agent-config.json and converts it into LLM-ready instructions.
 */

let _ultronAgentConfig = null;
let _ultronAgentConfigSerialized = '';
let _ultronAgentConfigReloadTimer = null;

function formatBulletList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items.map(item => `- ${item}`).join('\n');
}

function section(title, body) {
  if (!body || !String(body).trim()) return '';
  return `${title}\n${body.trim()}`;
}

function buildUltronAgentSystemPrompt(context = {}) {
  const cfg = _ultronAgentConfig;
  if (!cfg || !cfg.system_prompt) {
    return buildFallbackAgentPrompt(context);
  }

  const sp = cfg.system_prompt;
  const userName = context.userName || 'the user';
  const sections = [];

  sections.push(
    `You are ${cfg.agent_name} (${cfg.agent_role}). Your name is Ultron.`,
    sp.identity,
    `PRIMARY OBJECTIVE: ${sp.primary_objective}`,
    `GOLDEN RULE: ${sp.golden_rule}`
  );

  sections.push(section('CORE BEHAVIOR', [
    'Understand before acting. Think before each action. Plan complex tasks.',
    'Verify actions and analyze results. Adapt when something changes.',
    'Ask questions when required information is missing.',
    'Request permission when required. Never claim an action completed without verification.'
  ].join('\n')));

  if (sp.reasoning_and_execution) {
    const re = sp.reasoning_and_execution;
    sections.push(section('REASONING & EXECUTION WORKFLOW', [
      re.description,
      formatBulletList(re.workflow),
      re.important_rule ? `Important: ${re.important_rule}` : ''
    ].filter(Boolean).join('\n\n')));
  }

  if (sp.screen_understanding && sp.screen_understanding.enabled) {
    const su = sp.screen_understanding;
    sections.push(section('SCREEN UNDERSTANDING', [
      su.description,
      context.hasVisualContext
        ? 'Visual context is available for this request (attached images or live screen capture). Use it to decide actions.'
        : context.screenCaptureEnabled
          ? 'Live desktop screen capture is enabled. Screenshots are captured before and after interactive steps when needed.'
          : 'When visual context is provided, use it before interacting with unfamiliar UI.',
      formatBulletList(su.capabilities),
      su.privacy_rule ? `Privacy: ${su.privacy_rule}` : ''
    ].filter(Boolean).join('\n\n')));
  }

  if (sp.application_interaction && sp.application_interaction.enabled) {
    const ai = sp.application_interaction;
    sections.push(section('APPLICATION INTERACTION', [
      ai.description,
      'Interaction rules:',
      formatBulletList(ai.interaction_rules)
    ].join('\n\n')));
  }

  if (sp.multi_application_execution && sp.multi_application_execution.enabled) {
    const ma = sp.multi_application_execution;
    sections.push(section('MULTI-APPLICATION EXECUTION', [
      ma.description,
      formatBulletList(ma.rules)
    ].join('\n\n')));
  }

  if (sp.web_capabilities && sp.web_capabilities.enabled) {
    const wc = sp.web_capabilities;
    sections.push(section('WEB CAPABILITIES', [
      wc.description,
      formatBulletList(wc.rules)
    ].join('\n\n')));
  }

  if (sp.tool_usage) {
    sections.push(section('TOOL USAGE', [
      sp.tool_usage.principle,
      formatBulletList(sp.tool_usage.tool_selection_rules),
      'Never output tool JSON, OPEN_APP plans, or screen-capture steps as the user-facing answer.'
    ].join('\n\n')));
  }

  if (sp.tasks_and_planning && sp.tasks_and_planning.enabled) {
    sections.push(section('TASK PLANNING', [
      sp.tasks_and_planning.description,
      formatBulletList(sp.tasks_and_planning.task_rules)
    ].join('\n\n')));
  }

  if (sp.permissions && sp.permissions.enabled) {
    sections.push(section('PERMISSIONS', [
      sp.permissions.description,
      formatBulletList(sp.permissions.rules)
    ].join('\n\n')));
  }

  if (sp.autonomy) {
    sections.push(section('AUTONOMY', [
      `${sp.autonomy.level}: ${sp.autonomy.description}`,
      formatBulletList(sp.autonomy.rules)
    ].join('\n\n')));
  }

  if (sp.error_recovery && sp.error_recovery.enabled) {
    sections.push(section('ERROR RECOVERY', [
      formatBulletList(sp.error_recovery.workflow),
      formatBulletList(sp.error_recovery.rules)
    ].join('\n\n')));
  }

  if (sp.final_verification && sp.final_verification.enabled) {
    sections.push(section('FINAL VERIFICATION', [
      sp.final_verification.description,
      formatBulletList(sp.final_verification.verification_methods)
    ].join('\n\n')));
  }

  if (sp.safety_and_control) {
    sections.push(section('SAFETY & CONTROL', formatBulletList(sp.safety_and_control.principles)));
  }

  if (Array.isArray(sp.behavioral_summary) && sp.behavioral_summary.length > 0) {
    sections.push(`BEHAVIORAL LOOP: ${sp.behavioral_summary.join(' → ')}`);
  }

  sections.push(section('VOICE & PERSONA', [
    `Speak directly to ${userName} in the first person ("I", "me", "my").`,
    `Address ${userName} as "you". Never refer to yourself as "the AI" or ${userName} as "the user".`,
    'Be concise and accurate. For essays, explanations, and other content requests, answer directly in chat without tools.',
    'For desktop/file/web tasks, do the work with tools when available — do not merely describe what the user could do.',
    'Never show raw tool JSON, planned tool steps, or internal execution plans as the user-facing answer.'
  ].join('\n')));

  if (context.realtime || context.sysEnv) {
    const rt = context.realtime || {};
    const env = context.sysEnv || {};
    const drivesDesc = context.drivesDesc || '';
    sections.push(section('RUNTIME CONTEXT', [
      rt.dateLabel ? `- Local Date & Time: ${rt.dateLabel}, ${rt.timeLabel} (${rt.timeZone || 'local'})` : '',
      rt.locationLabel ? `- Location Context: ${rt.locationLabel}${rt.countryCode ? ` (${rt.countryCode})` : ''}` : '',
      env.osVersion ? `- Operating System: Windows ${env.osVersion} (${env.arch || 'x64'})` : '',
      env.homeDir ? `- Home Directory: ${env.homeDir}` : '',
      drivesDesc ? `- Available Drives: ${drivesDesc}` : ''
    ].filter(Boolean).join('\n')));
  }

  if (context.memorySnippet) {
    sections.push(context.memorySnippet.trim());
  }

  if (context.skillsSnippet) {
    sections.push(context.skillsSnippet.trim());
  }

  if (context.mcpSnippet) {
    sections.push(context.mcpSnippet.trim());
  }

  return sections.filter(Boolean).join('\n\n');
}

function buildFallbackAgentPrompt(context = {}) {
  const userName = context.userName || 'the user';
  return [
    `You are Ultron AI Agent, a general-purpose autonomous desktop AI agent helping ${userName}.`,
    'Understand the request, plan steps, use available tools, verify results, and respond clearly in the first person.',
    'Never claim an action succeeded without verification. Ask permission before destructive or high-impact actions.',
    context.memorySnippet || ''
  ].filter(Boolean).join('\n\n');
}

function getAgentRuntimeConfig() {
  const cfg = _ultronAgentConfig || {};
  const runtime = cfg.agent_runtime || {};
  const loopGuard = runtime.loop_guard || {};
  const research = runtime.research || {};
  return {
    maxTurns: Number(runtime.max_turns) > 0 ? Number(runtime.max_turns) : 10,
    reactFormatEnabled: runtime.react_format_enabled !== false,
    skillsEnabled: runtime.skills_enabled !== false,
    contextWindowMessages: Number(runtime.context_window_messages) > 0 ? Number(runtime.context_window_messages) : 12,
    loopGuard: {
      enabled: loopGuard.enabled !== false,
      maxIdenticalCalls: Number(loopGuard.max_identical_calls) > 0 ? Number(loopGuard.max_identical_calls) : 3,
      pingPongWindow: Number(loopGuard.ping_pong_window) > 0 ? Number(loopGuard.ping_pong_window) : 6,
      pollToolBudget: Number(loopGuard.poll_tool_budget) > 0 ? Number(loopGuard.poll_tool_budget) : 5,
      searchHopBudget: Number(loopGuard.search_hop_budget) > 0 ? Number(loopGuard.search_hop_budget) : 4,
      warnBeforeBlock: loopGuard.warn_before_block !== false
    },
    research: {
      enabled: research.enabled !== false,
      maxHops: Number(research.max_hops) > 0 ? Number(research.max_hops) : 3,
      fetchTopN: Number(research.fetch_top_n) > 0 ? Number(research.fetch_top_n) : 3,
      minUsefulResults: Number(research.min_useful_results) > 0 ? Number(research.min_useful_results) : 2,
      synthesizeOnComplete: research.synthesize_on_complete !== false
    },
    windowsMcp: {
      enabled: (runtime.windows_mcp || {}).enabled !== false,
      excludeTools: (runtime.windows_mcp || {}).exclude_tools || 'PowerShell,Registry'
    }
  };
}

function getResearchConfig() {
  return getAgentRuntimeConfig().research;
}

function buildAgentToolExecutionPrompt(userPrompt, step, observation = '', options = {}) {
  const runtime = getAgentRuntimeConfig();
  const reactBlock = runtime.reactFormatEnabled ? `

REACT FORMAT (alternative — small local models often handle this better than raw JSON):
Thought: <brief reasoning>
Action: <TOOL_NAME>
Action Input: <JSON args or plain text>

When the task is complete:
Thought: <brief reasoning>
Final Answer: <natural language answer to the user>

Use either one JSON object OR one ReAct block per step — not both.` : '';

  const captureLines = options.canCaptureScreen
    ? `\n{"tool":"CAPTURE_SCREEN","args":{"mode":"screen"}}\n{"tool":"CAPTURE_SCREEN","args":{"mode":"window","windowTitle":"Notepad"}}`
    : '';

  const toolBlock = `AVAILABLE TOOLS — Use a tool ONLY when the user needs a desktop, file, or web action. If they asked for text, an essay, explanation, or ideas and did NOT ask to open an app or write a file, answer in natural language with NO tools and NO JSON.

When an action is needed, output exactly one JSON object and nothing else:
{"tool":"OPEN_APP","args":{"appName":"Notepad"}}
{"tool":"FOCUS_APP","args":{"appName":"Google Chrome"}}
{"tool":"OPEN_URL","args":{"url":"https://example.com"}}
{"tool":"OPEN_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"TYPE_TEXT","args":{"text":"text to type into the currently focused app"}}
{"tool":"HOTKEY","args":{"keys":"ctrl+s"}}
{"tool":"CLICK","args":{"x":500,"y":300}}
{"tool":"RIGHT_CLICK","args":{"x":500,"y":300}}
{"tool":"SCROLL","args":{"delta":300}}
{"tool":"WAIT","args":{"ms":1000}}
{"tool":"READ_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"WRITE_FILE","args":{"path":"C:\\\\path\\\\file.txt","content":"file content"}}
{"tool":"DELETE_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"DOWNLOAD_FILE","args":{"query":"chatgpt logo","targetPath":"C:\\\\path\\\\chatgpt_logo.svg"}}
{"tool":"LIST_DIR","args":{"path":"C:\\\\path"}}
{"tool":"SEARCH","args":{"query":"web search query"}}
{"tool":"WEB_FETCH","args":{"url":"https://example.com/page"}}
{"tool":"EXECUTE","args":{"command":"safe command"}}${captureLines}

PLANNING (required before every action step):
1. Output Thought: — one sentence explaining what you are executing.
2. Then output Action/JSON (or Final Answer when done).

FEW-SHOT EXAMPLES:
User: play a song named boyfriend on youtube
Thought: I need to open the YouTube search query for the song boyfriend.
{"tool":"OPEN_URL","args":{"url":"https://www.youtube.com/results?search_query=boyfriend"}}

User: go to claude's website and logout if logged in
Thought: I need to open claude.ai in the web browser first.
{"tool":"OPEN_URL","args":{"url":"https://claude.ai"}}

User: click the logout button
Thought: I need to click the logout button on screen.
{"tool":"CLICK","args":{"target":"logout button"}}

User: open Notepad and write hello world
Thought: I will open Notepad first.
{"tool":"OPEN_APP","args":{"appName":"Notepad"}}

CRITICAL RULES:
- You are an autonomous computer agent. Never reply with manual conversational steps ("1. Open your browser...") — execute the tools directly!
- Only use CAPTURE_SCREEN when you must see the UI to complete a desktop task — never for essays, chat, or pure content requests.
- File discovery/CRUD on this PC: DO it with EXECUTE using PowerShell or LIST_DIR/READ_FILE/WRITE_FILE, then answer with the real result.
- When the task is complete, respond in natural language without JSON. Keep the final answer short and direct.
- Never narrate planned tool calls, never show JSON/tool plans to the user as the answer, and never fabricate tool output.${reactBlock}`;

  const parts = [
    `USER TASK:\n${userPrompt}`,
    toolBlock
  ];

  if (observation) {
    parts.push(`LATEST OBSERVATION:\n${observation}\n\nContinue from this observation. Choose the next tool or give the final answer.`);
  } else {
    parts.push(`This is step ${step}. If no desktop/file/web action is needed, answer in natural language now. Otherwise choose the next tool call.`);
  }

  if (options.hasVisualContext) {
    parts.push('Visual attachments are available — use them to understand UI state before acting.');
  }

  return parts.join('\n\n');
}

const PROGRESS_CATEGORY_MAP = {
  SCREEN: ['screen', 'analyzing', 'checking the current page', 'visual'],
  SEARCH: ['search', 'web', 'comparing', 'results'],
  OPEN_APP: ['opening', 'application', 'found the application'],
  FOCUS_APP: ['switching', 'focused', 'application'],
  TYPE_TEXT: ['entering', 'typing', 'information'],
  VERIFY: ['verifying', 'verification', 'final verification'],
  THINKING: ['deciding', 'planning', 'analyzing request'],
  ERROR: ['error', 'failed', 'checking what caused']
};

function pickProgressExample(examples, category, context = {}) {
  if (!Array.isArray(examples) || examples.length === 0) return '';

  const needles = PROGRESS_CATEGORY_MAP[category] || [];
  const matched = examples.filter(line => {
    const lower = String(line).toLowerCase();
    return needles.some(needle => lower.includes(needle));
  });

  // No category-specific example: fall back to the clean defaults instead of
  // showing an unrelated message (e.g. "Analyzing the current screen..." for INTENT).
  if (matched.length === 0) return '';
  let message = matched[0];

  if (context.appName && category === 'OPEN_APP') {
    message = message.replace(/the application you mentioned/i, context.appName);
  }
  if (context.query && category === 'SEARCH') {
    message = `Searching the web for "${context.query}"...`;
  }
  if (context.step && category === 'THINKING') {
    message = `Step ${context.step}: deciding the next action...`;
  }

  return message;
}

function getAgentProgressMessage(category, context = {}) {
  const sp = _ultronAgentConfig && _ultronAgentConfig.system_prompt;
  const progressCfg = sp && sp.dynamic_progress_updates;
  if (!progressCfg || progressCfg.enabled === false) {
    return getDefaultProgressMessage(category, context);
  }

  const fromConfig = pickProgressExample(progressCfg.examples, category, context);
  return fromConfig || getDefaultProgressMessage(category, context);
}

function getDefaultProgressMessage(category, context = {}) {
  const defaults = {
    SCREEN: 'Analyzing the current screen...',
    SEARCH: context.query ? `Searching the web for "${context.query}"...` : 'Searching the web for the required information...',
    OPEN_APP: context.appName ? `Opening ${context.appName}...` : 'Opening the target application...',
    FOCUS_APP: context.appName ? `Switching focus to ${context.appName}...` : 'Switching to the target application...',
    TYPE_TEXT: 'Entering the information...',
    HOTKEY: context.keys ? `Sending hotkey ${context.keys}...` : 'Sending keyboard shortcut...',
    WAIT: 'Waiting for the application to respond...',
    READ_FILE: context.path ? `Reading ${context.path}...` : 'Reading file contents...',
    WEB_FETCH: context.url ? `Fetching ${context.url}...` : 'Fetching web page...',
    WRITE_FILE: context.path ? `Writing to ${context.path}...` : 'Writing file...',
    EXECUTE: context.command ? `Running: ${context.command}` : 'Executing system command...',
    VERIFY: 'Verifying that the change was applied...',
    THINKING: context.step ? `Step ${context.step}: deciding the next action...` : 'Analyzing the request and planning next steps...',
    SUCCESS: 'Task complete.',
    ERROR: 'Something failed. Checking what caused it...',
    MEDIA: 'Processing attached visual context...',
    INTENT: context.intent ? `Target intent: ${context.intent}` : 'Analyzing user intent...'
  };
  return defaults[category] || `Working: ${category}...`;
}

async function loadUltronAgentConfig(force = false) {
  if (_ultronAgentConfig && !force) return _ultronAgentConfig;

  try {
    const suffix = force ? `?reload=${Date.now()}` : '';
    const response = await fetch(`../agent/ultron-agent-config.json${suffix}`, { cache: 'no-store' });
    if (response.ok) {
      const nextConfig = await response.json();
      const serialized = JSON.stringify(nextConfig);
      const changed = Boolean(_ultronAgentConfigSerialized && serialized !== _ultronAgentConfigSerialized);
      _ultronAgentConfig = nextConfig;
      _ultronAgentConfigSerialized = serialized;
      if (changed) {
        window.dispatchEvent(new CustomEvent('ultron-agent-config-reloaded', {
          detail: { version: nextConfig.spec_version || 'unversioned' }
        }));
      }
      return _ultronAgentConfig;
    }
  } catch (err) {
    console.warn('Failed to load ultron-agent-config.json:', err);
  }

  _ultronAgentConfig = null;
  return _ultronAgentConfig;
}

function startUltronAgentConfigHotReload(intervalMs = 5000) {
  if (_ultronAgentConfigReloadTimer) return;
  _ultronAgentConfigReloadTimer = window.setInterval(() => {
    loadUltronAgentConfig(true).catch(() => {});
  }, Math.max(2000, Number(intervalMs) || 5000));
}

function getUltronAgentConfig() {
  return _ultronAgentConfig;
}

window.UltronAgentPrompt = {
  loadUltronAgentConfig,
  startUltronAgentConfigHotReload,
  getUltronAgentConfig,
  getAgentRuntimeConfig,
  getResearchConfig,
  buildUltronAgentSystemPrompt,
  buildAgentToolExecutionPrompt,
  getAgentProgressMessage,
  getDefaultProgressMessage
};
