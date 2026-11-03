(function (root) {
  'use strict';
  const roleOf = message => message.role==='assistant'||message.role==='user' ? message.role : (message.isAi ?? message.sender==='Ultron') ? 'assistant' : 'user';
  function isCorrection(prompt) {
    return /\b(?:you (?:are|re|keep|are still)|you're)\b[^.!?]{0,50}\b(?:same|wrong|repeat|repeating)|\b(?:not what i (?:asked|wanted)|still (?:wrong|incorrect|incomplete)|try again|fix (?:this|that|it|your (?:answer|response))|response (?:is )?(?:cut off|incomplete))\b/i.test(String(prompt||''));
  }
  function correctionContext(messages, prompt) {
    if(!isCorrection(prompt))return null;
    const entries=(messages||[]).filter(message=>String(message.text??message.content??'').trim());
    if(roleOf(entries.at(-1)||{})==='user'&&String(entries.at(-1)?.text??entries.at(-1)?.content??'').trim()===String(prompt).trim())entries.pop();
    const request=entries.slice().reverse().find(message=>roleOf(message)==='user'&&!isCorrection(message.text??message.content));
    const answer=entries.slice().reverse().find(message=>roleOf(message)==='assistant');
    return request&&answer?{request:String(request.text??request.content),answer:String(answer.text??answer.content),preserveTable:/\btable\b/i.test(String(request.text??request.content))&&!/\b(?:without|no|omit|remove) (?:the |a |any )?table|\b(?:don.t|do not) use (?:a |the )?table|\b(?:prose|paragraphs?|bullet points?) instead\b/i.test(String(prompt))}:null;
  }
  function isLanguageFollowUp(prompt) {
    return /^(?:(?:please\s+)?(?:in|into)\s+[\p{L}][\p{L}\p{M} -]{1,45}|(?:please\s+)?translate\s+(?:it|this|that|the above|your (?:answer|response))\s+(?:in|into|to)\s+[\p{L}][\p{L}\p{M} -]{1,45})[.!?]*$/iu.test(String(prompt||'').trim());
  }
  function isFollowUp(prompt) {
    const p = String(prompt || '').toLowerCase();
    return isLanguageFollowUp(prompt) || isCorrection(prompt) || /\b(?:i|we)\s+(?:gave|told|said|mentioned|specified)\b|\b(?:start|beginning)\s+of\s+(?:this|the|our)\s+(?:chat|conversation)\b/.test(p) || /\b(?:in|from|of|about)\s+(?:the|this|that|your|above|previous|earlier|same)\s+(?:poem|story|answer|response|reply|essay|code|script|diagram|chart|table|plan|paragraph|line|sentence|example|explanation)\b/.test(p)
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
  function history(messages, prompt, { maxChars = 18000, maxMessages = 48, usable = () => true, extract = value => value, trace = null } = {}) {
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
    const recallUser = /\b(?:i|we)\s+(?:gave|told|said|mentioned|specified)\b/i.test(current);
    const relevant = isFollowUp(prompt) || referencesTerm(prompt, messages) || ordinal ? entries.filter(entry => entry.role === (recallUser ? 'user' : 'assistant')).map(entry => ({ entry, score: tokens.reduce((sum, token) => sum + (entry.content.toLowerCase().includes(token) ? 1 : 0), 0) + (ordinal && /(?:^|\n)\s*\d+[.)]\s/.test(entry.content) ? 5 : 0) + (artifact === 'code' && /```/.test(entry.content) ? 3 : 0) })).sort((a, b) => b.score - a.score || b.entry.index - a.entry.index).find(item => item.score > 0)?.entry : null;
    const preceding = relevant ? entries.filter(entry => entry.index < relevant.index && entry.role === 'user').at(-1) : null;
    // Keep the request that produced the referenced answer: its constraints
    // matter when revising a poem, code sample, or numbered recommendation.
    const correction=correctionContext(messages,prompt);
    const original=correction?entries.filter(entry=>entry.role==='user'&&entry.content===correction.request).at(-1):null;
    // Priority buckets, highest first; a message keeps the reason of its top bucket.
    const buckets=[
      ...(original?[[original,'correction-original-request']]:[]),
      ...recent.slice(-2).reverse().map(entry=>[entry,'latest-turn']),
      ...(relevant?[[relevant,'referenced-artifact']]:[]),
      ...(preceding?[[preceding,'preceding-request-for-referenced-answer']]:[]),
      ...recent.slice().reverse().map(entry=>[entry,'recent-context'])
    ];
    const seen=new Set(),priority=[],reasonByIndex=new Map();
    for(const [entry,reason] of buckets){if(!entry||seen.has(entry.index))continue;seen.add(entry.index);priority.push(entry);reasonByIndex.set(entry.index,reason);}
    let remaining = maxChars; const selected = [],includedIdx=new Set();
    for (const message of priority) {
      if (remaining < 200) break;
      let content = message.content;
      const budget = Math.min(remaining, message===original ? Math.floor(maxChars*.35) : message===entries.at(-1)&&priority.length>1 ? Math.floor(maxChars*.5) : message === relevant ? 10000 : 8000);
      if (content.length > budget) {
        const lines = content.split('\n');
        const keep = new Set();
        lines.forEach((line, index) => { if (tokens.some(token => line.toLowerCase().includes(token))) for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) keep.add(i); });
        const excerpt = [...keep].sort((a, b) => a - b).map(index => lines[index]).join('\n');
        content = '[Excerpt from earlier message]\n' + (excerpt || content).slice(0, budget - 70) + '\n[Earlier message abbreviated]';
      }
      selected.push({ ...message, content }); remaining -= content.length; includedIdx.add(message.index);
      if (trace) trace.push({ index: message.index, role: message.role, included: true, excerpted: content !== message.content, chars: content.length, reason: reasonByIndex.get(message.index) || 'selected' });
    }
    if (trace) for (const entry of entries) if (!includedIdx.has(entry.index)) trace.push({ index: entry.index, role: entry.role, included: false, chars: entry.content.length, reason: reasonByIndex.has(entry.index) ? 'omitted: context budget exhausted before this message' : 'omitted: outside the selected relevance/recency window' });
    if (trace) trace.sort((a, b) => a.index - b.index);
    return selected.sort((a, b) => a.index - b.index).map(({ role, content }) => ({ role, content }));
  }
  const api = { isLanguageFollowUp, isCorrection, correctionContext, isFollowUp, referencesTerm, history, roleOf };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownConversationContext = api;
})(typeof window === 'undefined' ? globalThis : window);
