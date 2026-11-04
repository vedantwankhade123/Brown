document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('btn-export-local-diagnostics');
  const checkbox = document.getElementById('diagnostics-include-content');
  const status = document.getElementById('local-diagnostics-status');
  if (!button || !checkbox || !status) return;

  checkbox.checked = false;
  button.addEventListener('click', async () => {
    const includeContent = checkbox.checked === true;
    button.disabled = true;
    button.setAttribute?.('aria-busy', 'true');
    status.textContent = 'Preparing local export…';

    try {
      if (typeof window.ultronAPI?.exportLocalDiagnostics !== 'function') {
        throw new Error('Local diagnostic export is unavailable. Restart Brown after updating.');
      }
      const result = await window.ultronAPI.exportLocalDiagnostics({
        includeContent,
        ...(includeContent ? { messages: window.BrownDiagnosticConversation?.() || [] } : {})
      });
      status.textContent = result?.cancelled
        ? 'Export cancelled.'
        : result?.success
          ? 'Diagnostic report saved locally. Nothing was uploaded.'
          : result?.error || 'Export failed. Try again.';
    } catch (error) {
      status.textContent = error?.message || 'Export failed. Try again.';
    } finally {
      checkbox.checked = false;
      button.disabled = false;
      button.removeAttribute?.('aria-busy');
    }
  });
});
