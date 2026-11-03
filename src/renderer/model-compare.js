(function (root) {
  'use strict';
  // Brown Compare-Models measurement engine (Phase 5).
  //
  // Runs the SAME prompt against 2-4 installed models one at a time (sequential, so it
  // respects the scheduler's memory admission and never OOMs the machine) and reports
  // honest measurements: latency, time-to-first-token, approximate token count, generation
  // speed, whether the output limit was hit, and a structural-validation outcome.
  //
  // Privacy: this module NEVER reads chat history or private context. With no explicit
  // prompt it uses a fixed synthetic benchmark. It presents measurements; it does not turn
  // a single response into a quality ranking.

  const MAX_MODELS = 4;
  const SYNTHETIC_PROMPT = 'List three differences between a list and a tuple in Python, then write one short function that returns the nth Fibonacci number.';

  const approxTokens = text => Math.max(1, Math.round(String(text || '').length / 4));

  // Light, deterministic structural check so the comparison reports something honest about
  // each response without needing a judge model. Callers may inject a stricter validator.
  function defaultValidate(text) {
    const value = String(text || '').trim();
    if (!value) return 'fail';
    if (/(\b\w+\b)(\s+\1){5,}/i.test(value)) return 'fail'; // repetition loop
    return value.length < 12 ? 'fail' : 'pass';
  }

  // Default adapter: reuse the same local streaming generator the chat executor uses.
  async function defaultGenerate({ model, prompt, signal, onToken }) {
    const stream = root.BrownVisualModelStream;
    if (!stream || typeof stream.generate !== 'function') throw new Error('No local generation adapter is available.');
    let metrics = null;
    const text = await stream.generate({
      model, system: 'You are Brown, a concise local assistant.', user: prompt,
      messages: [{ role: 'system', content: 'You are Brown, a concise local assistant.' }, { role: 'user', content: prompt }],
      signal, maxTokens: 1024, numCtx: 4096, temperature: 0.4,
      onToken, onMetrics: m => { metrics = m; }
    });
    return { text, metrics };
  }

  async function compare({ models, prompt, generate, validate, signal, onProgress } = {}) {
    const list = (Array.isArray(models) ? models : []).map(m => String(m && m.name ? m.name : m)).filter(Boolean).slice(0, MAX_MODELS);
    if (list.length < 2) throw new Error('Compare needs at least two installed models.');
    const runGenerate = typeof generate === 'function' ? generate : defaultGenerate;
    const runValidate = typeof validate === 'function' ? validate : defaultValidate;
    const text = String(prompt || '').trim();
    const synthetic = !text;
    const usePrompt = synthetic ? SYNTHETIC_PROMPT : text;

    const startedAt = Date.now();
    const results = [];
    for (const model of list) {
      if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError');
      onProgress?.({ model, phase: 'running', index: results.length, total: list.length });
      const modelStart = Date.now();
      let firstTokenAt = null;
      try {
        const out = await runGenerate({
          model, prompt: usePrompt, signal,
          onToken: token => { if (firstTokenAt == null && token) firstTokenAt = Date.now(); }
        });
        const answer = typeof out === 'string' ? out : (out && out.text) || '';
        const metrics = (out && out.metrics) || null;
        const latencyMs = Date.now() - modelStart;
        const tokenCount = Number(metrics?.eval_count) || approxTokens(answer);
        const evalMs = Number(metrics?.eval_duration_ms) || (firstTokenAt ? Date.now() - firstTokenAt : latencyMs);
        results.push({
          model, ok: true, response: answer,
          latencyMs,
          timeToFirstTokenMs: firstTokenAt ? firstTokenAt - modelStart : null,
          tokenCount,
          tokensPerSec: evalMs > 0 ? Math.round((tokenCount / (evalMs / 1000)) * 10) / 10 : null,
          outputLimitHit: false,
          validationOutcome: runValidate(answer, model),
          error: null
        });
      } catch (error) {
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || signal?.aborted) throw error;
        results.push({
          model, ok: false, response: '',
          latencyMs: Date.now() - modelStart, timeToFirstTokenMs: firstTokenAt ? firstTokenAt - modelStart : null,
          tokenCount: 0, tokensPerSec: null,
          outputLimitHit: ['OUTPUT_LIMIT', 'INCOMPLETE_OUTPUT'].includes(error?.code),
          validationOutcome: 'failed',
          error: { code: error?.code || 'ERROR', message: String(error?.message || error).slice(0, 240) }
        });
      }
      onProgress?.({ model, phase: 'done', index: results.length, total: list.length });
    }

    return {
      prompt: usePrompt, synthetic, usesPrivateContext: false, models: list, results,
      elapsedMs: Date.now() - startedAt,
      note: 'Measurements from a single sample each. They compare speed and structural validity on this device, not overall model quality.'
    };
  }

  const api = { compare, MAX_MODELS, SYNTHETIC_PROMPT, defaultValidate, approxTokens };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownModelCompare = api;
})(typeof window === 'undefined' ? globalThis : window);
