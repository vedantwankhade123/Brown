/**
 * Agent Entity Tracker & Reference Resolver
 * Tracks concrete entities (restaurants, products, files, code, topics, artifacts)
 * and resolves conversational anaphora ("the second one", "that laptop", "what you said earlier", "compare them").
 */
(function () {
  const ENTITY_STORE_KEY = 'ultron-agent-entities';
  const memoryFallback = {};

  function getStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
    } catch (e) {}
    return {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(memoryFallback, k) ? memoryFallback[k] : null),
      setItem: (k, v) => { memoryFallback[k] = String(v); },
      removeItem: (k) => { delete memoryFallback[k]; }
    };
  }

  function defaultSessionId() {
    try {
      if (typeof window !== 'undefined' && window.currentSessionId) return String(window.currentSessionId);
    } catch (e) {}
    return 'default';
  }

  function loadAllEntities() {
    try {
      const raw = getStorage().getItem(ENTITY_STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }

  function saveAllEntities(map) {
    try {
      getStorage().setItem(ENTITY_STORE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function getSessionState(sessionId) {
    const sid = sessionId || defaultSessionId();
    const all = loadAllEntities();
    if (!all[sid]) {
      all[sid] = {
        entities: [],
        candidates: [], // ordered candidate list from most recent search / listing
        lastFocusedEntityId: null,
        updatedAt: Date.now()
      };
    }
    return all[sid];
  }

  function saveSessionState(sessionId, state) {
    const sid = sessionId || defaultSessionId();
    const all = loadAllEntities();
    state.updatedAt = Date.now();
    all[sid] = state;
    saveAllEntities(all);
    return state;
  }

  /**
   * Register or update an entity in the session
   */
  function registerEntity(sessionId, entity) {
    if (!entity || !entity.name) return null;
    const state = getSessionState(sessionId);
    const cleanName = String(entity.name).trim();
    const id = entity.id || `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const record = {
      id,
      name: cleanName,
      type: entity.type || 'generic', // restaurant, product, laptop, file, code, topic, service
      ordinal: typeof entity.ordinal === 'number' ? entity.ordinal : null,
      details: entity.details || {}, // rating, price, address, specs, language, path, etc.
      summary: String(entity.summary || entity.name).substring(0, 300),
      rawSource: entity.rawSource || '',
      updatedAt: Date.now()
    };

    const existingIdx = state.entities.findIndex(
      e => e.id === id || (e.name.toLowerCase() === cleanName.toLowerCase() && e.type === record.type)
    );

    if (existingIdx >= 0) {
      record.id = state.entities[existingIdx].id;
      state.entities[existingIdx] = { ...state.entities[existingIdx], ...record };
    } else {
      state.entities.push(record);
      // Keep up to 80 entities per session
      if (state.entities.length > 80) {
        state.entities.splice(0, state.entities.length - 80);
      }
    }

    state.lastFocusedEntityId = record.id;
    saveSessionState(sessionId, state);
    return record;
  }

  /**
   * Set the candidate list from a multi-item search / recommendation result
   * (e.g. 5 restaurants, 3 laptops, 4 files)
   */
  function setCandidates(sessionId, items, type = 'generic') {
    if (!Array.isArray(items)) return [];
    const state = getSessionState(sessionId);
    const registered = items.map((item, idx) => {
      const ordinal = idx + 1;
      const cleanItem = typeof item === 'string' ? { name: item } : (item || {});
      return registerEntity(sessionId, {
        ...cleanItem,
        ordinal,
        type: cleanItem.type || type
      });
    }).filter(Boolean);

    state.candidates = registered;
    saveSessionState(sessionId, state);
    return registered;
  }

  /**
   * Extract entities from structured text (e.g. numbered lists, markdown bullets)
   */
  function extractEntitiesFromText(sessionId, text, contextType = 'generic') {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/);
    const discovered = [];

    // Regex patterns for numbered lists: "1. **Place Name** - details" or "1. Place Name: details"
    const numberedRegex = /^\s*(\d+)\.\s+(?:\*\*([^*]+)\*\*|([^\-:\n]+))\s*(?:[-:–—]\s*(.+))?$/;
    // Regex for markdown bulleted list items with bold header: "- **Item Name**: description"
    const bulletRegex = /^\s*[-*•]\s+\*\*([^*]+)\*\*\s*(?:[-:–—]\s*(.+))?$/;

    for (const line of lines) {
      const numMatch = line.match(numberedRegex);
      if (numMatch) {
        const ordinal = parseInt(numMatch[1], 10);
        const name = (numMatch[2] || numMatch[3] || '').trim();
        const detailsText = (numMatch[4] || '').trim();
        if (name && name.length > 1 && name.length < 100) {
          discovered.push({
            name,
            ordinal,
            type: contextType,
            summary: detailsText || name,
            details: parseDetails(detailsText)
          });
        }
        continue;
      }

      const bulletMatch = line.match(bulletRegex);
      if (bulletMatch) {
        const name = (bulletMatch[1] || '').trim();
        const detailsText = (bulletMatch[2] || '').trim();
        if (name && name.length > 1 && name.length < 100) {
          discovered.push({
            name,
            ordinal: discovered.length + 1,
            type: contextType,
            summary: detailsText || name,
            details: parseDetails(detailsText)
          });
        }
      }
    }

    if (discovered.length > 0) {
      return setCandidates(sessionId, discovered, contextType);
    }
    return [];
  }

  function parseDetails(text) {
    const details = { raw: text };
    if (!text) return details;

    // Price extraction: $$, $1,200, Rs. 500, ₹1500
    const priceMatch = text.match(/(?:[$€£₹]|Rs\.?\s?)(\d+(?:,\d+)*(?:\.\d+)?)/i) || text.match(/\b(\${1,4})\b/);
    if (priceMatch) details.price = priceMatch[0];

    // Rating extraction: 4.5/5, 4.8 stars, rated 4.2
    const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|\s*stars?|\s*\★)/i);
    if (ratingMatch) details.rating = ratingMatch[1];

    // Location / address snippet
    const locMatch = text.match(/(?:located at|in|near)\s+([^,;.\n]+(?:,\s*[^,;.\n]+)?)/i);
    if (locMatch) details.location = locMatch[1].trim();

    return details;
  }

  /**
   * Resolves references in a user prompt against:
   * 1. Ordinals ("the first one", "second", "#2", "last one")
   * 2. Comparative requests ("compare 1 and 3", "which is better between first and second")
   * 3. Anaphoric pronouns ("it", "that one", "that restaurant", "that laptop", "that file")
   * 4. Retrospective references ("what you said earlier", "the previous result", "the code we wrote")
   */
  function resolveReferences(sessionId, prompt) {
    const text = String(prompt || '').trim();
    if (!text) return { resolved: false, originalPrompt: text, augmentedPrompt: text, entities: [] };

    const state = getSessionState(sessionId);
    const candidates = Array.isArray(state.candidates) ? state.candidates : [];
    const allEntities = Array.isArray(state.entities) ? state.entities : [];
    const matchedEntities = [];
    const explanations = [];

    const lower = text.toLowerCase();

    // Map ordinal words to numbers
    const ordinalWordMap = {
      first: 1, '1st': 1, '#1': 1, one: 1,
      second: 2, '2nd': 2, '#2': 2, two: 2,
      third: 3, '3rd': 3, '#3': 3, three: 3,
      fourth: 4, '4th': 4, '#4': 4, four: 4,
      fifth: 5, '5th': 5, '#5': 5, five: 5,
      sixth: 6, '6th': 6, '#6': 6, six: 6,
      seventh: 7, '7th': 7, '#7': 7,
      eighth: 8, '8th': 8, '#8': 8,
      ninth: 9, '9th': 9, '#9': 9,
      tenth: 10, '10th': 10, '#10': 10
    };

    // 1. Check for specific ordinal mentions: "the second one", "option 3", "#2", "number 1"
    const ordinalMatches = [
      ...lower.matchAll(/\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th)\s+(?:one|option|choice|item|candidate|place|restaurant|laptop|product)?\b/gi),
      ...lower.matchAll(/\b(?:option|choice|item|number|#)\s*([1-9]|10)\b/gi),
      ...lower.matchAll(/#([1-9]|10)\b/gi)
    ];

    for (const match of ordinalMatches) {
      const key = match[1].toLowerCase();
      const ordNum = ordinalWordMap[key] || parseInt(key, 10);
      if (ordNum && candidates.length >= ordNum) {
        const found = candidates[ordNum - 1];
        if (found && !matchedEntities.some(e => e.id === found.id)) {
          matchedEntities.push(found);
          explanations.push(`"${match[0]}" refers to #${ordNum}: ${found.name} (${found.summary || found.type})`);
        }
      }
    }

    // 2. Check for "last one" / "the last"
    if (/\b(?:the\s+)?last(?:\s+one|\s+item|\s+option)?\b/i.test(lower) && candidates.length > 0) {
      const found = candidates[candidates.length - 1];
      if (found && !matchedEntities.some(e => e.id === found.id)) {
        matchedEntities.push(found);
        explanations.push(`"the last one" refers to #${candidates.length}: ${found.name}`);
      }
    }

    // 3. Comparative reference check ("compare them", "compare 1 and 2", "which is better")
    if (/\b(?:compare|difference between|versus|vs\.?|which is better|recommend between)\b/i.test(lower)) {
      if (matchedEntities.length === 0 && candidates.length >= 2) {
        // Default to comparing the top 2 candidates if none specified
        matchedEntities.push(candidates[0], candidates[1]);
        explanations.push(`Comparing top candidates: #${candidates[0].ordinal || 1} (${candidates[0].name}) and #${candidates[1].ordinal || 2} (${candidates[1].name})`);
      }
    }

    // 4. Anaphora targeting the last focused entity: "it", "that one", "tell me more about it", "its address"
    if (matchedEntities.length === 0) {
      const isAnaphora = /\b(it|that one|this one|tell me more|details on that|how much is it|where is it|its price|its address)\b/i.test(lower);
      if (isAnaphora) {
        let focused = null;
        if (state.lastFocusedEntityId) {
          focused = allEntities.find(e => e.id === state.lastFocusedEntityId);
        }
        if (!focused && candidates.length > 0) {
          focused = candidates[0];
        }
        if (focused) {
          matchedEntities.push(focused);
          explanations.push(`Pronoun/reference refers to: ${focused.name} (${focused.summary || focused.type})`);
        }
      }
    }

    // 5. Named entity match in prompt (e.g. user mentions partial name of previously found restaurant)
    for (const ent of allEntities) {
      if (ent.name && ent.name.length >= 4) {
        const entLower = ent.name.toLowerCase();
        if (lower.includes(entLower) && !matchedEntities.some(e => e.id === ent.id)) {
          matchedEntities.push(ent);
          explanations.push(`Explicitly mentions previously tracked entity: ${ent.name}`);
          break;
        }
      }
    }

    // 6. Retrospective queries: "what did you say earlier", "the previous result", "what we discussed"
    const isRetrospective = /\b(what (?:did you|did we|was) (?:say|said|discuss|mention)|earlier|previous (?:result|message|output|search)|last time)\b/i.test(lower);
    if (isRetrospective) {
      explanations.push('User is requesting recall of previous conversation / earlier turn results.');
    }

    const resolved = matchedEntities.length > 0 || isRetrospective;
    let augmentedPrompt = text;

    if (matchedEntities.length > 0) {
      const entityContextBlock = [
        '[Resolved Entity References]:',
        ...matchedEntities.map(e => `- Entity: "${e.name}" (Type: ${e.type}${e.ordinal ? `, Index: #${e.ordinal}` : ''})\n  Details: ${JSON.stringify(e.details || {})}\n  Summary: ${e.summary}`)
      ].join('\n');

      augmentedPrompt = `${text}\n\n${entityContextBlock}`;
    }

    return {
      resolved,
      originalPrompt: text,
      augmentedPrompt,
      entities: matchedEntities,
      explanations,
      isRetrospective
    };
  }

  function getEntities(sessionId) {
    return getSessionState(sessionId).entities;
  }

  function getCandidates(sessionId) {
    return getSessionState(sessionId).candidates;
  }

  function clearSession(sessionId) {
    const sid = sessionId || defaultSessionId();
    const all = loadAllEntities();
    delete all[sid];
    saveAllEntities(all);
  }

  const api = {
    registerEntity,
    setCandidates,
    extractEntitiesFromText,
    resolveReferences,
    getEntities,
    getCandidates,
    clearSession
  };

  if (typeof window !== 'undefined') {
    window.UltronEntityTracker = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
