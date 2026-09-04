/**
 * Location context — resolves user city for local search, weather, and answers.
 */
(function () {
  const STORAGE_KEY = 'ultron-user-location';

  function getSavedLocation() {
    try {
      return (window.localStorage.getItem(STORAGE_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function setSavedLocation(label) {
    const value = String(label || '').trim();
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, value);
  }

  function isImplicitLocationPhrase(text) {
    return /\b(near me|around me|my area|my city|my location|where i am|where i live|local|nearby|here)\b/i.test(String(text || ''));
  }

  function isLocationSensitiveQuery(prompt) {
    const p = String(prompt || '').toLowerCase();
    if (isImplicitLocationPhrase(p)) return true;
    if (/\bweather\b/.test(p)) return true;
    if (/\b(restaurants?|cafes?|hotels?|stores?|shops?|news|events?|movies?|theaters?|delivery|hospital|pharmacy|gas station|petrol pump|traffic|pollution|aqi)\b/.test(p)) {
      return !/\b(in|at|for|near)\s+[a-z]{3,}/.test(p);
    }
    return false;
  }

  function extractExplicitLocationFromPrompt(prompt) {
    const p = String(prompt || '');
    const patterns = [
      /\bweather\s+(?:in|for|at)\s+([^?.,!]+)/i,
      /\b(?:check|get|what'?s?\s+the)\s+weather\s+(?:in|for|at)\s+([^?.,!]+)/i,
      /\b(?:in|at|for|near)\s+([A-Za-z][A-Za-z\s.,'-]{2,45}?)(?:\s*[?.!,]|$)/i,
      /\b(?:i am in|i live in|i'm in|my location is|my city is|my address is)\s+([^?.,!]+)/i
    ];
    for (const re of patterns) {
      const m = p.match(re);
      if (!m || !m[1]) continue;
      const candidate = m[1].trim().replace(/\s+/g, ' ');
      if (!candidate || isImplicitLocationPhrase(candidate)) continue;
      if (/^(the|a|an|my|this|that)\s/i.test(candidate) && candidate.split(' ').length < 2) continue;
      return candidate;
    }
    return '';
  }

  function buildLabelFromGeo(geo, region) {
    const parts = [geo.city, geo.region, geo.country || region.country].filter(Boolean);
    return parts.join(', ');
  }

  async function resolveEffectiveLocation(userPrompt = '', options = {}) {
    const explicit = extractExplicitLocationFromPrompt(userPrompt);
    if (explicit) {
      return { label: explicit, source: 'prompt', confidence: 'high' };
    }

    const saved = getSavedLocation();
    if (saved && (isImplicitLocationPhrase(userPrompt) || options.preferSaved)) {
      return { label: saved, source: 'saved', confidence: 'high' };
    }

    const getSystemContext = options.getSystemContext;
    if (typeof getSystemContext !== 'function') {
      return saved
        ? { label: saved, source: 'saved', confidence: 'medium' }
        : { label: '', source: 'none', confidence: 'none' };
    }

    const sysEnv = await getSystemContext(options.forceRefreshGeo);
    const geo = sysEnv.geoLocation || {};
    const region = sysEnv.region || {};
    const geoLabel = buildLabelFromGeo(geo, region);

    if (isImplicitLocationPhrase(userPrompt) || isLocationSensitiveQuery(userPrompt)) {
      if (saved) return { label: saved, source: 'saved', confidence: 'high' };
      if (geoLabel) {
        const isNative = geo.source === 'windows-gps';
        return {
          label: geoLabel,
          source: isNative ? 'windows-gps' : (geo.latitude != null ? 'ip-geo' : 'timezone'),
          confidence: isNative ? 'high' : (geo.city ? 'medium' : 'low')
        };
      }
    }

    if (saved) return { label: saved, source: 'saved', confidence: 'medium' };
    if (geoLabel) {
      const isNative = geo.source === 'windows-gps';
      return {
        label: geoLabel,
        source: isNative ? 'windows-gps' : (geo.latitude != null ? 'ip-geo' : 'timezone'),
        confidence: isNative ? 'high' : (geo.city ? 'medium' : 'low')
      };
    }

    return { label: '', source: 'none', confidence: 'none' };
  }

  function isLocalOrPlacesQuery(prompt) {
    const p = String(prompt || '').toLowerCase();
    const placeTerms = /\b(restaurants?|cafes?|coffee\s+shops?|food|dining|eater(?:y|ies)|places?\s+to\s+eat|hotels?|baker(?:y|ies)|bars?|pubs?|lounges?|stores?|shops?|supermarkets?|malls?|hospitals?|clinics?|pharmac(?:y|ies)|gyms?|salons?|parks?|tourist\s+spots?|attractions?|places?\s+to\s+visit)\b/i;
    return placeTerms.test(p);
  }

  function hasValidLocation(loc) {
    if (!loc) return false;
    const label = typeof loc === 'string' ? loc : (loc.label || '');
    const trimmed = label.trim();
    if (!trimmed) return false;
    if (/^(unknown(\s+location)?|none|undefined|null|n\/a)$/i.test(trimmed)) return false;
    return true;
  }

  function augmentQueryWithLocation(query, locationLabel) {
    if (!query || !locationLabel) return query;
    const city = locationLabel.split(',')[0].trim();
    if (!city) return query;
    const cityLower = city.toLowerCase();

    // Strip implicit location phrases like "near me", "around me", "nearby"
    let q = String(query)
      .replace(/\b(near me|around me|my area|my city|my location|where i am|where i live|nearby|here)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!q) return `best places in ${city}`;
    if (q.toLowerCase().includes(cityLower)) return q;
    return `${q} in ${city}`.trim();
  }

  const exportObj = {
    STORAGE_KEY,
    getSavedLocation,
    setSavedLocation,
    isImplicitLocationPhrase,
    isLocationSensitiveQuery,
    isLocalOrPlacesQuery,
    hasValidLocation,
    extractExplicitLocationFromPrompt,
    resolveEffectiveLocation,
    augmentQueryWithLocation
  };

  if (typeof window !== 'undefined') {
    window.UltronLocationContext = exportObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();
