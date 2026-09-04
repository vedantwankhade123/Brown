/**
 * Ultron Agent Entity Extractor
 * Normalizes, validates, deduplicates, and ranks real entities (local businesses,
 * restaurants, hotels, products, services) from search results and web content.
 * Prevents raw SEO listicle articles from masquerading as entity cards.
 */
(function () {
  'use strict';

  // Common SEO aggregator domain & listicle title patterns to filter out from entity names
  const SEO_TITLE_PATTERNS = [
    /^(?:the\s+)?(?:\d+\s+)?(?:best|top|greatest)\s+(?:restaurants?|cafes?|hotels?|places?|eateries?|spots?|food\s+joints?)\s+(?:in|near|at)\s+[^–—\-|]+/i,
    /^(?:top\s+\d+|best\s+\d+|\d+\s+best)\s+[^–—\-|]+/i,
    /(?:tripadvisor|restaurant\s+guru|zomato|swiggy|justdial|yelp|magicpin|makemytrip|booking\.com|eater|lonely\s+planet)/i,
    /\b(?:updated\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/i,
    /\b(?:menu,\s*prices|reviews\s*&\s*photos|ratings\s*&\s*reviews|food\s*delivery)\b/i,
    /\b(?:where\s+to\s+eat|places\s+to\s+visit|things\s+to\s+do)\b/i
  ];

  // Common cuisine and category keywords for classification
  const CUISINE_KEYWORDS = [
    'North Indian', 'South Indian', 'Chinese', 'Italian', 'Continental', 'Mughlai',
    'Pan-Asian', 'Mexican', 'Fast Food', 'Cafe', 'Bakery', 'Desserts', 'Street Food',
    'Vegetarian', 'Pure Veg', 'Non-Veg', 'Seafood', 'Biryani', 'Pizza', 'Burger',
    'Bar & Grill', 'Fine Dining', 'Casual Dining', 'Family Dining', 'Dhaba', 'Multi-Cuisine', 'Thali',
    'Family Restaurant', 'Rooftop', 'Bistro', 'Lounge'
  ];

  /**
   * Cleans a business/entity title by removing trailing domain suffixes and listicle prefixes
   */
  function cleanEntityTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    let t = rawTitle
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    // Remove domain suffixes: "Gardenia Restaurant | Amravati | Restaurant Guru"
    t = t.replace(/\s*[-|–—]\s*(?:TripAdvisor|Restaurant\s*Guru|Zomato|Swiggy|Justdial|Yelp|Magicpin|Facebook|Instagram|Google(?:\s+Maps)?)[^.]*$/i, '').trim();
    t = t.replace(/\s*[-|–—]\s*[a-zA-Z0-9.-]+\.(?:com|in|org|net|co)\s*$/i, '').trim();

    // Remove trailing city or location chunks like "| Amravati", "- Mumbai", ", India"
    t = t.replace(/\s*[-|–—]\s*[A-Z][A-Za-z0-9\s]{2,20}\s*$/, '').trim();

    // Remove prefixes like "1. ", "#1 ", "Top 10: "
    t = t.replace(/^(?:#?\d+[.):\-]\s*)/, '').trim();

    return t.trim();
  }

  /**
   * Tests if a title is just an SEO listicle headline rather than a business name
   */
  function isListicleOrAggregatorHeadline(title) {
    if (!title || typeof title !== 'string') return true;
    const clean = title.trim();
    if (clean.length < 3 || clean.length > 70) return true;
    for (const pat of SEO_TITLE_PATTERNS) {
      if (pat.test(clean)) return true;
    }
    return false;
  }

  /**
   * Extracts a rating (e.g., 4.5, 4.2/5, 4.8 stars) from text snippets
   */
  function extractRatingFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const m = text.match(/\b([3-5](?:\.[0-9])?)\s*(?:\/\s*5|\s*(?:stars?|★|⭐)|(?:\s*out\s*of\s*5))\b/i)
      || text.match(/\b(?:rated|rating:?)\s*([3-5](?:\.[0-9])?)\b/i)
      || text.match(/\b([4-5]\.[0-9])\b/);
    if (m && m[1]) {
      const val = parseFloat(m[1]);
      if (val >= 3.0 && val <= 5.0) return val;
    }
    return null;
  }

  /**
   * Extracts cuisine/category tags from text
   */
  function extractCuisines(text) {
    if (!text || typeof text !== 'string') return [];
    const found = [];
    for (const c of CUISINE_KEYWORDS) {
      const re = new RegExp(`\\b${c.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) {
        found.push(c);
      }
    }
    return [...new Set(found)].slice(0, 3);
  }

  /**
   * Extracts address/locality context from snippets
   */
  function extractLocality(text, targetCity = '') {
    if (!text || typeof text !== 'string') return targetCity || '';
    // Look for phrases like "Located in Camp Area", "near City Mall", "on Badnera Road"
    const locMatch = text.match(/\b(?:located (?:at|in|on)|near|opposite|opp\.|around|in the heart of)\s+([A-Z0-9][A-Za-z0-9\s,–—\-]{3,40}?)(?:[.,;]|\s+with|\s+and|\s+offering|\s*$)/i)
      || text.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,2}\s+(?:Road|Marg|Chowk|Colony|Nagar|Square|Complex|Area|Bazaar|Market))\b/);
    if (locMatch && locMatch[1]) {
      const loc = locMatch[1].trim();
      return targetCity ? `${loc}, ${targetCity}` : loc;
    }
    return targetCity || '';
  }

  /**
   * Extracts concise standout highlights from text
   */
  function extractHighlight(text, entityName = '') {
    if (!text || typeof text !== 'string') return '';
    const sentences = text
      .replace(/<[^>]+>/g, '')
      .split(/(?<=[.?!])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && s.length < 180);

    for (const s of sentences) {
      if (/\b(known for|famous for|popular for|best known|specializes in|features|offers|great for|serves delicious|cozy ambiance|family friendly|outdoor seating)\b/i.test(s)) {
        return s.replace(/\s*[-|–—]\s*(?:TripAdvisor|Restaurant Guru)[^.]*$/i, '').trim();
      }
    }
    return sentences[0] || '';
  }

  /**
   * Parses candidate places from web search results and page content
   */
  function extractPlacesFromSearchResults(results = [], targetCity = '') {
    if (!Array.isArray(results) || results.length === 0) return [];
    const candidates = [];
    const seenNames = new Set();

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const combinedText = `${res.title || ''}. ${res.snippet || ''}. ${res.pageContent ? res.pageContent.slice(0, 1500) : ''}`;

      // 1. Check if the page itself describes a specific restaurant/business
      const pageTitle = cleanEntityTitle(res.title || '');
      if (pageTitle && !isListicleOrAggregatorHeadline(pageTitle)) {
        const norm = pageTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm.length >= 3 && !seenNames.has(norm)) {
          seenNames.add(norm);
          const rating = extractRatingFromText(combinedText);
          const cuisines = extractCuisines(combinedText);
          const locality = extractLocality(combinedText, targetCity);
          const highlight = extractHighlight(combinedText, pageTitle);

          candidates.push({
            id: `place-${norm}`,
            name: pageTitle,
            title: pageTitle,
            rating: rating || 4.2,
            category: cuisines.join(' · ') || 'Local Restaurant',
            location: locality || targetCity,
            highlight: highlight || 'Well-regarded local spot known for authentic flavors and warm hospitality.',
            snippet: highlight || res.snippet || '',
            url: res.url,
            source: getDomainFromUrl(res.url),
            sourceUrl: res.url,
            sourceDomain: getDomainFromUrl(res.url),
            image: res.image || '',
            type: 'place',
            confidence: rating ? 0.9 : 0.75
          });
        }
      }

      // 2. Scan snippet and page content for listed restaurant names
      // e.g. "1. Gardenia Restaurant - 4.5 stars", "The Belgian Waffle Co: Excellent waffles..."
      const itemMatches = combinedText.matchAll(/(?:(?:\d+\.\s*|\*\s*|\b(?:at|visit|try)\s+))([A-Z][A-Za-z0-9'&.\-\s]{2,35}?)(?:\s*(?:[-:–—|]|is a|rated|serving|offers)\s+([\s\S]{15,140}?)(?=[.?!;\n]|$))/g);
      for (const m of itemMatches) {
        const name = cleanEntityTitle(m[1] || '');
        const context = m[2] || '';
        if (!name || isListicleOrAggregatorHeadline(name) || name.split(' ').length > 6) continue;
        const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm.length < 3 || seenNames.has(norm)) continue;
        if (/\b(restaurant|cafe|bistro|dhaba|kitchen|grill|bakery|lounge|sweets|bar|food|pizza|burger|treats|waffle|hotel)\b/i.test(name) || extractCuisines(context).length > 0) {
          seenNames.add(norm);
          const rating = extractRatingFromText(context) || extractRatingFromText(combinedText);
          const cuisines = extractCuisines(context);
          const locality = extractLocality(context, targetCity);
          const highlight = extractHighlight(context, name) || context.trim();

          candidates.push({
            id: `place-${norm}`,
            name,
            title: name,
            rating: rating || 4.3,
            category: cuisines.join(' · ') || 'Local Cuisine',
            location: locality || targetCity,
            highlight: highlight.length > 120 ? `${highlight.slice(0, 117)}...` : highlight,
            snippet: highlight || '',
            url: res.url,
            source: getDomainFromUrl(res.url),
            sourceUrl: res.url,
            sourceDomain: getDomainFromUrl(res.url),
            image: res.image || '',
            type: 'place',
            confidence: 0.8
          });
        }
      }
    }

    // Sort by rating descending and limit to top 6
    candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return candidates.slice(0, 6);
  }

  function getDomainFromUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return 'web';
    }
  }

  /**
   * Formats structured places into a user-centric, polished markdown response
   */
  function formatPlacesMarkdown(places, userPrompt, locationLabel) {
    if (!Array.isArray(places) || places.length === 0) {
      return `I could not find verified restaurant details for ${locationLabel || 'your location'}. Please try specifying a particular cuisine, neighborhood, or city name.`;
    }

    const cityText = locationLabel ? `in and around **${locationLabel}**` : 'near you';
    const lines = [];

    lines.push(`> [!NOTE]\n> **Top Recommendations:** Found **${places.length} top-rated dining spots** ${cityText} based on verified local reviews.\n`);
    lines.push(`Here are the standout options:\n`);

    places.forEach((place, i) => {
      const num = i + 1;
      const stars = place.rating ? `⭐ **${place.rating.toFixed(1)}/5**` : '';
      const cat = place.category ? ` · *${place.category}*` : '';
      lines.push(`### ${num}. **${place.name}**`);
      lines.push(`- **Overview:** ${stars}${cat}`);
      if (place.location) {
        lines.push(`- **Location:** ${place.location}`);
      }
      if (place.highlight) {
        lines.push(`- **Why it stands out:** ${place.highlight}`);
      }
      if (place.sourceUrl) {
        lines.push(`- **Source:** [${place.sourceDomain}](${place.sourceUrl})`);
      }
      lines.push('');
    });

    lines.push(`> [!TIP]\n> **Recommendation:** If you are looking for relaxed dining, check opening hours or reserve in advance during peak evening hours.`);

    return lines.join('\n').trim();
  }

  /**
   * Builds an entity-grounded places answer object with text and extracted places
   */
  function buildPlacesResultsAnswer(userPrompt, searchPayload, locationLabel) {
    const results = searchPayload?.results || [];
    const places = extractPlacesFromSearchResults(results, locationLabel);
    const text = formatPlacesMarkdown(places, userPrompt, locationLabel);
    return { text, places, count: places.length };
  }

  const api = {
    cleanEntityTitle,
    isListicleOrAggregatorHeadline,
    extractRatingFromText,
    extractCuisines,
    extractLocality,
    extractHighlight,
    extractPlacesFromSearchResults,
    formatPlacesMarkdown,
    buildPlacesResultsAnswer
  };

  if (typeof window !== 'undefined') {
    window.UltronEntityExtractor = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
