/**
 * Agent Harness Engine
 * Production-grade, lightweight native agent harness for Brown AI / Ultron.
 * Powered by Vercel AI SDK Core v7 (ai + zod) & Model Context Protocol (MCP) SDK.
 * 100% Offline-capable, zero telemetry, fully sandboxed in Electron Main Process.
 *
 * Design follows open-source coding-agent harnesses (Claude Code / Codex):
 *  - Multi-step tool loop driven by stopWhen conditions (not the removed maxSteps option)
 *  - Skills injected into the system prompt based on trigger matching
 *  - Explicit tool-decision policy so the model answers directly when it can
 *  - Repeated-identical-tool-call loop guard
 */
const { resolveAgentLanguageModel } = require('./agent-harness-provider');
const { buildVercelMcpTools } = require('./agent-harness-mcp-adapter');
const agentSkills = require('../agent/agent-skills');

/**
 * Format conversation messages into AI SDK CoreMessage structure
 */
function formatCoreMessages(prompt, history = []) {
  const formatted = [];

  for (const msg of history) {
    if (!msg || !msg.content) continue;
    const role = msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user';
    formatted.push({
      role,
      content: String(msg.content)
    });
  }

  if (prompt) {
    formatted.push({
      role: 'user',
      content: String(prompt)
    });
  }

  return formatted;
}

const AGENTIC_POLICY = `
AGENTIC DECISION POLICY (follow on every turn):
1. CLASSIFY the request first: (a) answerable from your own knowledge, (b) needs live/external/local data via tools, (c) multi-step task needing a plan.
2. ANSWER DIRECTLY for (a). Never call tools just to decorate an answer you already know. Do not web-search timeless knowledge, math, code writing, or explanations.
3. For (b): pick the single most appropriate tool, call it, read the result, then synthesize a clear final answer that cites what the tool returned. Use system__web_search ONLY for time-sensitive facts (news, prices, weather, current versions, "latest"/"today" questions) or when you are genuinely unsure of a fact.
4. For (c): briefly plan the steps, execute tools one step at a time, and VERIFY each result before moving on. If a tool fails, change approach once (different args or different tool) instead of repeating the same call; if it fails again, stop and explain the blocker.
5. NEVER repeat an identical tool call more than twice.
6. When you have enough information, STOP calling tools and deliver the final answer. Do not trail off after a tool result — always end with a user-facing response.`;

/**
 * Builds the final system prompt: caller prompt (or default) + agentic policy + skills.
 * Skills are only injected when the caller hasn't embedded its own skills section.
 */
function buildFinalSystemPrompt(systemPrompt, prompt) {
  const defaultSystem = `You are Brown AI, a helpful, precise, and privacy-focused local Windows desktop assistant.
You operate with offline-first autonomy and have native access to connected Model Context Protocol (MCP) tools and local workspace tools.
When asked to perform tasks on files, web data, or system actions, utilize the provided tools directly.

MANDATORY FORMATTING & PRESENTATION GUIDELINES:
- Deliver well-structured, production-ready Markdown answers, formatted as richly as ChatGPT.
- Use clean ### headings to organize distinct sections; prefix section headings with a relevant emoji icon (e.g. "### 📊 Comparison", "### ⚙️ How It Works", "### 📌 Summary").
- **Bold** every key term, product name, option label, and the lead-in phrase of each bullet (e.g. "- **Error handling:** use try/except...").
- Use ==double equals== to highlight critical values, numbers, prices, or verdicts (rendered as a yellow highlight).
- Bullets and numbered lists: keep each item on its own line; use nested lists for sub-details; use arrows (→) for flows and cause-effect ("click Send → the file uploads").
- When generating tables (comparisons, matrices, summaries):
  - Every row MUST be on its own single line with pipes (|) enclosing every cell.
  - Follow the header row immediately with a standard delimiter row (| :--- | :--- | :--- |).
  - NEVER break table cells or rows across multiple lines.
- Use GitHub alert callouts for emphasis: "> [!NOTE]", "> [!TIP]", "> [!IMPORTANT]", "> [!WARNING]" (one per block, each on its own ">" line(s)).
- For processes, architectures or flows include a mermaid diagram block (\`\`\`mermaid — flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt, journey, timeline, mindmap, quadrantChart, xychart-beta, all with max 8 nodes and no classDef/style). For numeric data include a chart block (\`\`\`chart with a JSON spec) when visualization adds value — supported types: bar, line, area, pie, donut, stacked-bar, scatter (points [[x,y]] + "trend": true), histogram and boxplot (raw "values"/"series"), radar (labels + series).
- For code: always provide complete, syntax-highlighted code blocks with language identifiers (\`\`\`typescript, \`\`\`python, \`\`\`javascript, etc.) starting on their own line. Use inline \`backticks\` for function names, commands, paths, and short identifiers — inline code stays inside the sentence, never on its own line.
- You are fully capable of Markdown tables and LaTeX math — never refuse a formatting request or claim you cannot create tables. For formulas use inline $...$ and display $$...$$ LaTeX (the UI renders it with KaTeX).
- Provide clean, concise, and structured answers without echoing meta-prompts or system guidelines.`;

  let finalSystem = (systemPrompt || defaultSystem) + AGENTIC_POLICY;

  try {
    const alreadyHasSkills = /ACTIVATED COGNITIVE & PROCEDURAL SKILLS|ACTIVE AGENT SKILLS/i.test(finalSystem);
    if (!alreadyHasSkills && agentSkills && typeof agentSkills.findSkillsForPrompt === 'function') {
      const skills = agentSkills.findSkillsForPrompt(prompt, 3);
      const section = agentSkills.buildSkillsPromptSection(skills);
      if (section) finalSystem += `\n${section}`;
    }
  } catch (_) { /* skills are best-effort */ }

  return finalSystem;
}

/**
 * Stop condition: halt the tool loop when the same tool call (name + args)
 * has been issued maxIdentical times — mirrors agent-loop-guard.js.
 */
function createRepeatedCallStop(maxIdentical = 3) {
  let tripped = false;
  const condition = ({ steps }) => {
    const counts = new Map();
    for (const step of steps || []) {
      for (const call of step.toolCalls || []) {
        let sig;
        try {
          sig = `${call.toolName}::${JSON.stringify(call.input ?? {})}`;
        } catch (_) {
          sig = `${call.toolName}::unserializable`;
        }
        const n = (counts.get(sig) || 0) + 1;
        counts.set(sig, n);
        if (n >= maxIdentical) {
          tripped = true;
          return true;
        }
      }
    }
    return false;
  };
  return { condition, wasTripped: () => tripped };
}

/**
 * Executes a streaming agent run with autonomous multi-step tool calling
 * @param {Object} params
 * @param {string} params.prompt
 * @param {Array} [params.history]
 * @param {string} [params.systemPrompt]
 * @param {Object} [params.providerConfig]
 * @param {number} [params.maxSteps=10]
 * @param {AbortSignal} [params.abortSignal]
 * @param {Function} [params.onEvent] - Callback for streaming events
 * @returns {Promise<Object>} Final execution summary
 */
async function streamAgentHarness({
  prompt,
  history = [],
  systemPrompt,
  providerConfig = {},
  maxSteps = 10,
  abortSignal,
  browser,
  onEvent = () => {}
}) {
  const startTime = Date.now();
  const { streamText, stepCountIs } = await import('ai');
  const { model, provider, modelId, isOffline } = await resolveAgentLanguageModel(providerConfig);
  const { tools, toolMetadata } = browser ? browser.toolset() : await buildVercelMcpTools();

  const messages = formatCoreMessages(prompt, history);
  const finalSystem = browser ? systemPrompt : buildFinalSystemPrompt(systemPrompt, prompt);
  const stepLimit = Math.min(Math.max(1, maxSteps), 20);
  const loopGuard = createRepeatedCallStop(3);

  onEvent({
    type: 'init',
    provider,
    modelId,
    isOffline,
    availableTools: Object.keys(tools),
    timestamp: startTime
  });

  const toolCalls = [];
  const toolResults = [];
  let accumulatedText = '';
  let accumulatedReasoning = '';
  let finalUsage = null;
  let finishReason = null;
  let toolsDisabled = false;

  // Local models that lack tool support (e.g. phi3 on Ollama) reject the whole
  // request when tools are attached — degrade to a plain chat call instead.
  const TOOL_REJECT_RE = /does not support tools|do(es)? not support function calling|tool_choice|tools? (are )?not supported|invalid.*tools?/i;

  async function runAttempt(useTools) {
    let streamError = null;
    try {
      const result = streamText({
        model,
        system: finalSystem,
        messages,
        ...(useTools
          ? { tools, toolChoice: 'auto', stopWhen: browser ? stepCountIs(stepLimit) : [stepCountIs(stepLimit), loopGuard.condition] }
          : { stopWhen: stepCountIs(1) }),
        abortSignal,
        onError: () => {} // errors are surfaced from fullStream 'error' parts instead
      });

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          accumulatedText += part.text;
          onEvent({
            type: 'text-delta',
            textDelta: part.text,
            fullText: accumulatedText
          });
        } else if (part.type === 'reasoning-delta') {
          accumulatedReasoning += part.text;
          onEvent({
            type: 'reasoning',
            textDelta: part.text,
            fullReasoning: accumulatedReasoning
          });
        } else if (part.type === 'tool-call') {
          const meta = toolMetadata.get(part.toolName);
          const record = {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            serverId: meta?.serverId || 'system',
            originalName: meta?.originalName || part.toolName,
            args: part.input
          };
          toolCalls.push(record);
          onEvent({
            type: 'tool-call',
            ...record
          });
        } else if (part.type === 'tool-result') {
          const record = {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output
          };
          toolResults.push(record);
          onEvent({
            type: 'tool-result',
            ...record
          });
        } else if (part.type === 'tool-error') {
          onEvent({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: { success: false, error: part.errorText || 'Tool execution failed.' }
          });
        } else if (part.type === 'finish-step') {
          onEvent({
            type: 'step-finish',
            finishReason: part.finishReason,
            usage: part.usage
          });
        } else if (part.type === 'finish') {
          finalUsage = part.totalUsage;
          finishReason = part.finishReason;
          onEvent({
            type: 'finish',
            finishReason: part.finishReason,
            usage: part.totalUsage
          });
        } else if (part.type === 'error') {
          streamError = part.error?.message || String(part.error);
          onEvent({
            type: 'error',
            error: streamError
          });
        }
      }
    } catch (err) {
      streamError = err?.message || String(err) || 'Agent harness execution failed.';
      onEvent({
        type: 'error',
        error: streamError
      });
    }
    return streamError;
  }

  try {
    let streamError = await runAttempt(true);

    if (browser && streamError && TOOL_REJECT_RE.test(streamError)) {
      return { success: false, text: '', error: 'The selected model does not support browser tool calling. Choose a tool-capable local or cloud model; Brown has not switched models.', toolCalls, toolResults, durationMs: Date.now() - startTime };
    }

    if (!browser && streamError && !accumulatedText && TOOL_REJECT_RE.test(streamError)) {
      toolsDisabled = true;
      onEvent({
        type: 'tools-disabled',
        reason: 'Selected model does not support tool calling — answered as plain chat.'
      });
      streamError = await runAttempt(false);
    }

    const loopTripped = loopGuard.wasTripped();
    if (loopTripped) {
      onEvent({
        type: 'loop-guard',
        message: 'Stopped repeated identical tool calls.'
      });
    }

    const durationMs = Date.now() - startTime;

    if (browser && (abortSignal?.aborted || !toolCalls.length || streamError)) {
      return { success: false, text: '', error: abortSignal?.aborted ? 'Browser task stopped. Already submitted website actions cannot be undone.' : (streamError || 'The selected model did not call browser tools. No browser action was performed; choose a tool-capable model or make the browsing request more explicit.'), toolCalls, toolResults, durationMs };
    }

    if (streamError && !accumulatedText) {
      return {
        success: false,
        error: streamError,
        text: '',
        toolCalls,
        toolResults,
        durationMs,
        provider,
        modelId,
        isOffline
      };
    }

    return {
      success: true,
      text: accumulatedText,
      ...(browser ? { sources: [...(browser.sources?.values() || [])].slice(-8) } : {}),
      toolCalls,
      toolResults,
      usage: finalUsage,
      finishReason,
      loopTripped,
      toolsDisabled,
      durationMs,
      provider,
      modelId,
      isOffline
    };
  } catch (err) {
    const errorMsg = err.message || 'Agent harness execution failed.';
    onEvent({
      type: 'error',
      error: errorMsg
    });
    return {
      success: false,
      error: errorMsg,
      text: accumulatedText,
      toolCalls,
      toolResults,
      durationMs: Date.now() - startTime,
      provider,
      modelId,
      isOffline
    };
  }
}

module.exports = {
  streamAgentHarness,
  formatCoreMessages,
  buildFinalSystemPrompt
};
