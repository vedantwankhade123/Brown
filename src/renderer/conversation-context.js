(function (root) {
  'use strict';
  const roleOf = message => message.role==='assistant'||message.role==='user' ? message.role : (message.isAi ?? message.sender==='Ultron') ? 'assistant' : 'user';
  function isFollowUp(prompt) {
    const p = String(prompt || '').toLowerCase();
    return /\b(?:in|from|of|about)\s+(?:the|this|that|your|above|previous|earlier|same)\s+(?:poem|story|answer|response|reply|essay|code|script|diagram|chart|table|plan|paragraph|line|sentence|example|explanation)\b/.test(p)
      || /\b(?:you|u)\s+(?:(?:have|had|just|already)\s+)*(?:gave|given|wrote|written|generated|created|said|mentioned|suggested|provided|explained)\b/.test(p)
      || /\b(?:explain|rewrite|expand|shorten|continue|summarize|summarise|translate|improve|change|modify|fix|elaborate on)\s+(?:it|this|that|the above|your answer|your response)\b/.test(p)
      || /\b(?:previous|earlier|above|last)\s+(?:answer|response|message|poem|code|example|diagram|table)\b/.test(p)
      || /\b(?:make|keep)\s+(?:it|this|that)\s+(?:shorter|longer|simpler|clearer|formal|casual|concise|detailed)\b/.test(p)
      || /\b(?:same\s+(?:style|tone|format)|(?:first|second|third|last)\s+(?:one|version|option)|another\b[^.!?]{0,60}\blike\s+that)\b/.test(p)
      || /\b(?:implement|explain|expand|do|use|change)\b[^.!?]{0,60}\b(?:first|second|third|fourth|fifth|last|\d+(?:st|nd|rd|th))\s+(?:one|option|point|item|step|suggestion)\b/.test(p)
      || /^\s*(?:continue|go on|try again|more details?|tell me more)\b/.test(p);
  }
  function referencesTerm(prompt, messages) {
    const p = String(prompt || '');
    const term = p.match(/\b(?:word|term)\s+["'“]?([\p{L}][\p{L}'-]*)/iu)?.[1]
      || p.match(/\bwhat\s+does\s+["'“]?([\p{L}][\p{L}'-]*)["'”]?\s+mean\b/iu)?.[1]
      || p.match(/\bmeaning\s+of\s+["'“]?([\p{L}][\p{L}'-]*)/iu)?.[1];
    if (!term || /^(?:it|this|that|the|a|an)$/i.test(term)) return false;
    return (messages || []).slice(-12).some(message => (message.isAi || message.role === 'assistant') && String(message.text ?? message.content ?? '').toLowerCase().split(/[^\p{L}'-]+/u).includes(term.toLowerCase()));
  }
  function history(messages, prompt, { maxChars = 18000, maxMessages = 12, usable = () => true, extract = value => value } = {}) {
    const current = String(prompt || '').trim();
    const entries = (messages || []).map((message, index) => ({
      index, role: roleOf(message),
      content: String(message.text ?? message.content ?? '')
    })).filter(message => message.content.trim() && usable(message.content));
    if (entries.at(-1)?.role === 'user' && entries.at(-1).content.trim() === current) entries.pop();
    for (const message of entries) message.content = extract(message.content);
    const tokens = [...new Set(current.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(token => !/^(?:the|this|that|what|does|mean|word|you|have|given|from|about|with|your|please|explain|previous|answer)$/.test(token));
    const recent = entries.slice(-maxMessages);
    // Pin an older referenced artifact before spending the budget on recency.
    const ordinal = String(prompt).match(/\b(?:first|second|third|fourth|fifth|last|\d+(?:st|nd|rd|th))\s+(?:one|option|point|item|step|suggestion)\b/i);
    const artifact = String(prompt).match(/\b(?:poem|code|script|diagram|chart|table|plan|story|essay)\b/i)?.[0]?.toLowerCase();
    const relevant = isFollowUp(prompt) || referencesTerm(prompt, messages) || ordinal ? entries.filter(entry => entry.role === 'assistant').map(entry => ({ entry, score: tokens.reduce((sum, token) => sum + (entry.content.toLowerCase().includes(token) ? 1 : 0), 0) + (ordinal && /(?:^|\n)\s*\d+[.)]\s/.test(entry.content) ? 5 : 0) + (artifact === 'code' && /```/.test(entry.content) ? 3 : 0) })).sort((a, b) => b.score - a.score || b.entry.index - a.entry.index).find(item => item.score > 0)?.entry : null;
    const preceding = relevant ? entries.filter(entry => entry.index < relevant.index && entry.role === 'user').at(-1) : null;
    // Keep the request that produced the referenced answer: its constraints
    // matter when revising a poem, code sample, or numbered recommendation.
    const priority = [...new Set([...recent.slice(-2).reverse(), ...(relevant ? [relevant] : []), ...(preceding ? [preceding] : []), ...recent.slice().reverse()])];
    let remaining = maxChars; const selected = [];
    for (const message of priority) {
      if (remaining < 200) break;
      let content = message.content;
      const budget = Math.min(remaining, message===entries.at(-1)&&priority.length>1 ? Math.floor(maxChars*.5) : message === relevant ? 10000 : 8000);
      if (content.length > budget) {
        const lines = content.split('\n');
        const keep = new Set();
        lines.forEach((line, index) => { if (tokens.some(token => line.toLowerCase().includes(token))) for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) keep.add(i); });
        const excerpt = [...keep].sort((a, b) => a - b).map(index => lines[index]).join('\n');
        content = '[Excerpt from earlier message]\n' + (excerpt || content).slice(0, budget - 70) + '\n[Earlier message abbreviated]';
      }
      selected.push({ ...message, content }); remaining -= content.length;
    }
    return selected.sort((a, b) => a.index - b.index).map(({ role, content }) => ({ role, content }));
  }
  const api = { isFollowUp, referencesTerm, history, roleOf };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownConversationContext = api;
})(typeof window === 'undefined' ? globalThis : window);
