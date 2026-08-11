/**
 * Task completion validation + targeted repair (Sir Thaddeus CompletionChecker / RepairLoop).
 */
(function () {
  function extractExecutedToolTypes(activitySteps = []) {
    return (activitySteps || []).map(s => String(s.type || '').toUpperCase()).filter(Boolean);
  }

  function userExpectsFileWrite(prompt) {
    return /\b(create|make|write|save)\b/i.test(prompt) && /\b(file|document|txt|note)\b/i.test(prompt);
  }

  function userExpectsFolder(prompt) {
    return /\b(create|make|mkdir|new)\b/i.test(prompt) && /\b(folder|directory)\b/i.test(prompt);
  }

  function userExpectsAppOpen(prompt) {
    return /\b(open|launch|start)\b/i.test(prompt) && /\b(app|application|notepad|chrome|vscode|explorer|word|excel)\b/i.test(prompt);
  }

  function checkTaskCompletion(userPrompt, { activitySteps = [], executedAppActions = [], finalResponse = '' } = {}) {
    const missing = [];
    const types = extractExecutedToolTypes(activitySteps);
    const wroteFile = types.includes('WRITE_FILE') || types.some(t => t.includes('WRITE'));
    const ranExecute = types.includes('EXECUTE');
    const openedApp = (executedAppActions || []).length > 0 || types.includes('APP_ACTION');

    if (userExpectsFileWrite(userPrompt) && !wroteFile && !ranExecute) {
      missing.push({ kind: 'file_write', hint: 'Create or write the requested file, then verify it exists.' });
    }
    if (userExpectsFolder(userPrompt) && !ranExecute) {
      missing.push({ kind: 'folder', hint: 'Create the folder with mkdir or equivalent, then confirm the path.' });
    }
    if (userExpectsAppOpen(userPrompt) && !openedApp) {
      missing.push({ kind: 'app_open', hint: 'Open the requested application using OPEN_APP.' });
    }

    if (missing.length) {
      return { complete: false, missing, suggestedRepair: missing.map(m => m.hint).join(' ') };
    }

    if (typeof claimsDesktopTaskCompleted === 'function' && typeof hasDesktopActionCues === 'function') {
      if (hasDesktopActionCues(userPrompt) && claimsDesktopTaskCompleted(finalResponse) && !openedApp && !wroteFile && !ranExecute) {
        return {
          complete: false,
          missing: [{ kind: 'hallucinated_completion', hint: 'You claimed success but no tool ran. Execute the action now.' }],
          suggestedRepair: 'Do not claim completion until a tool succeeds. Run the required tool call now.'
        };
      }
    }

    return { complete: true, missing: [], suggestedRepair: '' };
  }

  function buildRepairPrompt(userPrompt, checkResult) {
    if (!checkResult || checkResult.complete) return '';
    return `[REPAIR REQUIRED] The task is not complete.\nUser request: ${userPrompt}\nMissing: ${checkResult.suggestedRepair}\nRun the correct tool now. Do not repeat the same failed approach.`;
  }

  window.UltronAgentCompletion = {
    checkTaskCompletion,
    buildRepairPrompt
  };
})();
