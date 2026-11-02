(function (root) {
  'use strict';
  const states = new WeakMap();
  const copyIcon = '<svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const tickIcon = '<svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
  function contentText(source, content, isAi = true) {
    const text = String(source ?? '');
    if (!isAi) return text;
    // Preserve Markdown, whitespace and literal HTML code. The conversation
    // plain-text helper removes HTML/code and can truncate nested result markup.
    if (!/<(?:div|section)\b[^>]*class=["'][^"']*(?:agent-final-response|search-answer|search-experience|agent-live)/i.test(text)) return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (!content) return text;
    const clone = content.cloneNode(true);
    clone.querySelectorAll('.message-actions, .dynamic-thinking-widget, .visual-loading-state, .code-header-bar, .diagram-toolbar, .gen-ui-toolbar, script, style, button').forEach(node => node.remove());
    return (clone.innerText || clone.textContent || '').trim();
  }
  async function write(text) {
    if (root.ultronAPI?.copyText) {
      const result = await root.ultronAPI.copyText(text);
      if (result?.success) return;
      throw new Error(result?.error || 'Unable to copy the message.');
    }
    if (!root.navigator?.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Restart Brown and try again.');
    await root.navigator.clipboard.writeText(text);
  }
  function reset(button) {
    button.classList.remove('is-copied');
    button.innerHTML = copyIcon;
    button.title = 'Copy message';
    button.setAttribute('aria-label', 'Copy message');
  }
  function bind(button, getText, { onError } = {}) {
    let state = states.get(button);
    if (state) { state.getText = getText; state.onError = onError; return; }
    state = { getText, onError, timer: null, busy: false };
    states.set(button, state);
    button.type = 'button';
    reset(button);
    button.onclick = async event => {
      event.stopPropagation();
      if (state.busy) return;
      state.busy = true;
      clearTimeout(state.timer);
      try {
        await write(String(state.getText() ?? ''));
        button.classList.add('is-copied');
        button.innerHTML = tickIcon;
        button.title = 'Copied';
        button.setAttribute('aria-label', 'Copied');
        state.timer = setTimeout(() => { reset(button); state.timer = null; }, 2000);
      } catch (error) {
        reset(button);
        button.title = 'Copy failed — click to retry';
        button.setAttribute('aria-label', 'Copy failed — click to retry');
        state.onError?.(error);
      } finally { state.busy = false; }
    };
  }
  const api = { bind, contentText, write };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownMessageCopy = api;
})(typeof window === 'undefined' ? globalThis : window);
