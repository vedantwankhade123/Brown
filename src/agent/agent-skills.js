/**
 * Lightweight skills catalog — inspired by OpenJarvis / agentskills.io.
 * Skills are procedural playbooks the agent can follow for common task patterns.
 */
(function () {
  const BUILTIN_SKILLS = [
    {
      id: 'open-app-and-type',
      name: 'Open app and type text',
      triggers: ['open notepad and type', 'open word and type', 'write in notepad', 'type in notepad', 'open app and type'],
      instructions: [
        'OPEN_APP the requested application.',
        'WAIT ~1000ms for the window to focus.',
        'TYPE_TEXT the requested content into the focused app.',
        'Use CAPTURE_SCREEN only if you need to verify the text appeared.',
        'Respond with a brief confirmation when done.'
      ].join('\n')
    },
    {
      id: 'save-document',
      name: 'Save current document',
      triggers: ['save the file', 'save document', 'save it', 'ctrl+s', 'save notepad', 'save word'],
      instructions: [
        'FOCUS_APP the target application if needed.',
        'HOTKEY ctrl+s to save.',
        'If a Save dialog appears, TYPE_TEXT the filename and confirm with Enter or HOTKEY alt+s.',
        'Verify success with CAPTURE_SCREEN or OCR if uncertain.'
      ].join('\n')
    },
    {
      id: 'web-research',
      name: 'Web research summary',
      triggers: ['search the web', 'look up online', 'find information about', 'research ', 'deep research', 'compare '],
      instructions: [
        'For simple lookups: SEARCH once, synthesize, done.',
        'For research/compare/in-depth requests: run up to 3 search hops with different keyword angles.',
        'After each SEARCH observation, WEB_FETCH the top 1–2 result URLs if snippets are thin.',
        'Merge facts across hops — cite specific names, numbers, and dates.',
        'Synthesize a direct answer with bullet points; no meta narration.',
        'If results stay thin after 2 hops, ask one focused follow-up question.'
      ].join('\n')
    },
    {
      id: 'dev-setup',
      name: 'Developer workspace setup',
      triggers: ['dev setup', 'coding setup', 'open vscode', 'start coding', 'developer environment'],
      instructions: [
        'OPEN_APP Visual Studio Code.',
        'OPEN_APP Windows Terminal (or PowerShell).',
        'OPTIONAL: LIST_DIR the project folder if the user named one.',
        'Confirm both apps are open before finishing.'
      ].join('\n')
    },
    {
      id: 'morning-routine',
      name: 'Morning routine',
      triggers: ['morning routine', 'start my day', 'morning digest', 'daily briefing'],
      instructions: [
        'OPEN_APP Outlook or Mail if email was requested.',
        'OPEN_APP Google Chrome.',
        'OPEN_URL https://calendar.google.com if calendar was mentioned.',
        'Summarize what you opened and offer to search news or weather next.'
      ].join('\n')
    },
    {
      id: 'file-read-summarize',
      name: 'Read and summarize a file',
      triggers: ['read file', 'summarize file', 'what is in', 'contents of file'],
      instructions: [
        'READ_FILE the requested path.',
        'Summarize the key points in plain language.',
        'Do not re-dump the entire file unless the user asked for it.'
      ].join('\n')
    }
  ];

  function findSkillsForPrompt(prompt, limit = 2) {
    const p = String(prompt || '').toLowerCase();
    if (!p.trim()) return [];
    const scored = BUILTIN_SKILLS.map(skill => {
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
      `### Skill: ${skill.name}\n${skill.instructions}\n(Follow these steps using your tools — do not call a "skill" tool.)`
    ));
    return `\n\nMATCHED SKILLS (procedural playbooks — follow with your tools when relevant):\n${blocks.join('\n\n')}`;
  }

  function listBuiltinSkills() {
    return BUILTIN_SKILLS.map(skill => ({
      id: skill.id,
      name: skill.name,
      triggers: skill.triggers.slice()
    }));
  }

  window.UltronAgentSkills = {
    findSkillsForPrompt,
    buildSkillsPromptSection,
    listBuiltinSkills
  };
})();
