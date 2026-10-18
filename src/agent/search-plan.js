/* Shared, deterministic request resolution. Only user messages supply follow-up intent. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrownSearchPlan = api;
})(typeof window === 'object' ? window : globalThis, function () {
  function isSearchFollowUp(text) {
    return /^(?:(?:please|yes|ok|okay|actually|can you|could you)\s*[,!]?\s*)*(?:search|look|check|browse|look it up)(?:\s+(?:for it|it|that|this|them|those|on|in|the|web|internet|online|please|instead|now|really|properly|using|tools?))*[.!?]*$/i.test(String(text || '').trim());
  }
  function resolveRequest(text, messages = []) {
    const current = String(text || '').trim();
    if (!isSearchFollowUp(current)) return { request: current, followUp: false, missingTopic: false };
    for (const message of messages.slice(-20).reverse()) {
      if (message.isAi || message.role === 'assistant' || message.role === 'system') continue;
      const prior = String(message.content || message.text || '').trim();
      if (!prior || prior === current || isSearchFollowUp(prior) || /^(?:thanks|thank you|okay|ok|yes|no|hi|hello)[.!\s]*$/i.test(prior)) continue;
      // Attachment bodies and assistant text must never become instructions or keywords.
      const topic = prior.split(/📄\s*\*\*Attached Document|\[Attached (?:Document|File)/i)[0].trim();
      if (topic) return { request: topic, followUp: true, missingTopic: false };
    }
    return { request: '', followUp: true, missingTopic: true };
  }
  function isShopping(text) {
    const p = String(text || '');
    const noun = /\b(shoes?|sneakers?|footwear|sandals?|boots?|laptops?|phones?|smartphones?|monitors?|headphones?|earbuds?|keyboards?|mouse|mice|tablets?|cameras?|watches?|backpacks?|bags?|mattress|sofas?|bikes?|bicycles?|refrigerators?|televisions?|speakers?|gpus?|ssds?|shirts?|dresses?|jackets?)\b/i.test(p);
    return noun && /\b(best|top|recommend|suggest|find|buy|shop|purchase|price|cost|under|below|budget|affordable|deals?|compare|options?)\b/i.test(p);
  }
  function freshness(text, now = new Date()) {
    const p = String(text || '').trim();
    const explicitYear = p.match(/\b(?:19|20)\d{2}\b/);
    const relativeYear = /\b(this|next|last)\s+year\b/i.exec(p);
    const calendar = /\b(diwali|deepavali|dipavali|holi|eid|ramadan|easter|navratri|dussehra|thanksgiving|festivals?|holidays?)\b/i.test(p)
      && /\b(when|date|coming|falls?|starts?|begins?|ends?|this year|next year)\b/i.test(p);
    const creative = /^(?:please\s+)?(?:write|draft|rewrite|translate|summarize|imagine|compose)\b/i.test(p);
    const localClock = /^(?:(?:please|tell me)\s+)*(?:(?:what(?:'s| is)\s+)?(?:today'?s? date|current (?:date|time|year)|the time)|what (?:date|time|year|day) is it)[?!.\s]*$/i.test(p);
    const changing = /\b(latest|currently|right now|as of now|real[ -]?time|breaking news|today|tonight|tomorrow|this (?:week|month|year)|next (?:week|month|year)|upcoming|current (?:price|president|prime minister|ceo|version|weather)|weather|forecast|stock price|exchange rate|live score)\b/i.test(p)
      || /\bwho\s+is\s+(?:the\s+)?(?:president|prime minister|ceo|chief minister|governor)\b/i.test(p);
    const required = !creative && !localClock && (calendar || changing);
    const year = explicitYear ? Number(explicitYear[0]) : now.getFullYear() + (relativeYear?.[1].toLowerCase() === 'next' ? 1 : relativeYear?.[1].toLowerCase() === 'last' ? -1 : 0);
    return { required, calendar, year, explicitYear: Boolean(explicitYear), date: now.toLocaleDateString('en-CA'), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }
  function groundSearchQuery(request, query, now = new Date()) {
    const context = freshness(request, now);
    if (!context.required) return query;
    let out = String(query || request);
    if (context.calendar || /\b(?:this|next|last) year\b/i.test(request)) {
      out = out.replace(/\b(?:this|next|last) year\b/gi, String(context.year));
      if (!context.explicitYear) out = out.replace(/\b(?:19|20)\d{2}\b/g, String(context.year));
      if (!out.includes(String(context.year))) out += ` ${context.year}`;
    }
    return out;
  }
  function budget(text) {
    const p = String(text || '');
    const m = p.match(/\b(under|below|less than|within|up to|at most)\s*(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)?\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/i);
    if (!m) return null;
    const amount = Number(m[3].replace(/,/g, '')) * (m[4] ? 1000 : 1);
    const currency = /₹|\brupees?\b|\binr\b|\brs\b/i.test(p) ? 'INR' : /\$|\busd\b|\bdollars?\b/i.test(p) ? 'USD' : /€|\beur\b|\beuros?\b/i.test(p) ? 'EUR' : /£|\bgbp\b|\bpounds?\b/i.test(p) ? 'GBP' : null;
    return amount > 0 ? { amount, currency, inclusive: /within|up to|at most/i.test(m[1]) } : null;
  }
  function eligibleProduct(product, request) {
    const constraint = budget(request);
    const families = [
      [/\b(shoes?|sneakers?|trainers?)\b/i, /\b(shoes?|sneakers?|trainers?|boots?)\b/i],
      [/\blaptops?\b/i, /\b(laptops?|notebooks?|macbooks?|chromebooks?)\b/i],
      [/\b(phones?|smartphones?)\b/i, /\b(phones?|smartphones?|iphone|galaxy|pixel)\b/i],
      [/\b(headphones?|earbuds?)\b/i, /\b(headphones?|earbuds?|earphones?|headsets?|airpods?)\b/i]
    ];
    const family = families.find(([pattern]) => pattern.test(request));
    if (family && !family[1].test(product?.title || '')) return false;
    return Boolean(product && product.verifiedAt && Number.isFinite(product.amount) && product.amount > 0
      && /^https?:\/\//i.test(product.url || '') && /^[A-Z]{3}$/.test(product.currency || '')
      && !/OutOfStock|Discontinued|SoldOut/i.test(product.availability || '')
      && (!constraint || ((!constraint.currency || constraint.currency === product.currency)
        && (constraint.inclusive ? product.amount <= constraint.amount : product.amount < constraint.amount))));
  }
  function plan(request) {
    const shopping = isShopping(request);
    const temporal = freshness(request);
    const topic = String(request).match(/\b(diwali|deepavali|dipavali|holi|eid|ramadan|easter|navratri|dussehra|thanksgiving)\b/i)?.[0];
    const calendarSteps = temporal.calendar ? [
      `Understand the requested date and resolve the year (${temporal.year})`,
      `Look up ${topic || 'the event'} in ${temporal.year}`,
      'Check the date and any regional differences',
      'Give the verified date with supporting sources'
    ] : null;
    const brief = temporal.calendar
      ? `You want the date of ${topic || 'the event'} in ${temporal.year}. I’ll look up that year, check the sources and any regional differences, then give you the verified date.`
      : shopping ? 'I’ll identify the product and budget, check current retailer offers, then compare the verified options.'
      : temporal.required ? 'I’ll identify the current information you need, check live sources, then answer with supporting links.'
      : 'I’ll identify what you need, find relevant sources, then check the details before answering.';
    return { request, shopping, budget: budget(request), brief, steps: calendarSteps || (shopping
      ? ['Understand product and budget', 'Find retailer product pages', 'Read offers and check the budget', 'Compare verified products and show links']
      : ['Understand the question', 'Find relevant sources', 'Read and cross-check source details', 'Answer with citations and useful visuals']) };
  }
  function preservesConstraints(request, query) {
    const required = budget(request), proposed = budget(query);
    if (required && (!proposed || proposed.amount !== required.amount || (required.currency && proposed.currency !== required.currency))) return false;
    const nouns = String(request).match(/\b(shoes?|sneakers?|laptops?|phones?|monitors?|headphones?|earbuds?|keyboards?|tablets?|cameras?|watches?|bags?|bikes?)\b/gi) || [];
    return nouns.every(noun => String(query).toLowerCase().includes(noun.toLowerCase().replace(/s$/, '')));
  }
  return { isSearchFollowUp, resolveRequest, freshness, groundSearchQuery, isShopping, budget, eligibleProduct, plan, preservesConstraints };
});
