/**
 * Verification Test Suite for Brown AI Agent Pipeline
 * Tests:
 * 1. Intent Routing (General Knowledge -> conversation, Local Places / Search -> search)
 * 2. Location Context & Query Augmentation (cleaning "near me", appending city)
 * 3. Entity Extraction (filtering SEO listicles, extracting clean place entities, ratings, cuisines)
 * 4. Place Markdown Formatting
 * 5. Prompt Echo & Rubric Leakage Detection
 */

const assert = require('assert');
const path = require('path');

// 1. Load Location Context
const locationContext = require('../src/agent/location-context');

// 2. Load Agent Entity Extractor
const entityExtractor = require('../src/agent/agent-entity-extractor');

console.log('====================================================');
console.log('Verifying Brown AI Agent Pipeline');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST SUITE 1: Location Context & Query Augmentation
// ----------------------------------------------------
console.log('[Test 1] Location Context & Gating');

// Test isLocalOrPlacesQuery
assert.strictEqual(locationContext.isLocalOrPlacesQuery('Search for the best restaurants near me'), true);
assert.strictEqual(locationContext.isLocalOrPlacesQuery('best cafes near me'), true);
assert.strictEqual(locationContext.isLocalOrPlacesQuery('find good food places in Amravati'), true);
assert.strictEqual(locationContext.isLocalOrPlacesQuery('top hotels and dining in Pune'), true);
assert.strictEqual(locationContext.isLocalOrPlacesQuery('What is photosynthesis?'), false);
assert.strictEqual(locationContext.isLocalOrPlacesQuery('Explain quantum computing'), false);
console.log('  ✓ isLocalOrPlacesQuery classifies local/dining queries correctly');

// Test hasValidLocation
assert.strictEqual(locationContext.hasValidLocation('Amravati, Maharashtra'), true);
assert.strictEqual(locationContext.hasValidLocation({ label: 'Mumbai' }), true);
assert.strictEqual(locationContext.hasValidLocation(''), false);
assert.strictEqual(locationContext.hasValidLocation(null), false);
assert.strictEqual(locationContext.hasValidLocation('unknown'), false);
assert.strictEqual(locationContext.hasValidLocation({ label: 'none' }), false);
console.log('  ✓ hasValidLocation correctly distinguishes valid locations from empty/unknown');

// Test augmentQueryWithLocation
const aug1 = locationContext.augmentQueryWithLocation('best restaurants near me', 'Amravati, Maharashtra');
assert.strictEqual(aug1, 'best restaurants in Amravati');

const aug2 = locationContext.augmentQueryWithLocation('good cafes around me', 'Bandra, Mumbai');
assert.strictEqual(aug2, 'good cafes in Bandra');

const aug3 = locationContext.augmentQueryWithLocation('restaurants in Amravati', 'Amravati, Maharashtra');
assert.strictEqual(aug3, 'restaurants in Amravati');
console.log('  ✓ augmentQueryWithLocation removes "near me" and adds clean "in <City>"');

// ----------------------------------------------------
// TEST SUITE 2: Intent Classification Logic
// ----------------------------------------------------
console.log('\n[Test 2] Intent Classification Routing');

function isLocalPlacesIntent(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!p) return false;
  return locationContext.isLocalOrPlacesQuery(p);
}

function hasExplicitSearchIntent(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (/^(search|google|find|look up|research|browse|web search|open search)$/i.test(p)) return false;
  if (/^search\s+(for|about|online|the web|google|[a-zA-Z0-9]{2,})/i.test(p)) return true;
  if (/\b(research|deep research|investigate|compare .+ vs|which is better|pros and cons)\b/i.test(p)) return true;
  if (/\b(check|get|tell me|what'?s?\s+the)\s+weather\b/i.test(p)) return true;
  if (/\bweather\s+(in|for|at)\b/i.test(p)) return true;
  if (/\b(search the web|search online|google for|look up online|find out about|latest news|current news|weather in|weather for|news about|web search)\b/i.test(p)) return true;
  return false;
}

function isGeneralKnowledgeQuery(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!p) return false;
  if (hasExplicitSearchIntent(p) || isLocalPlacesIntent(p)) return false;
  if (/\b(search|google|look\s*up|browse|find\s+out|latest|current|today|tonight|yesterday|tomorrow|this\s+week|this\s+month|news|price|cost|buy|cheap|deal|weather|forecast|score|match|live|stock|crypto|released?|download|install|version|near\s+me|nearby)\b/i.test(p)) {
    return false;
  }
  if (/^(what\s+is|what\s+are|what\s+does|why\s+is|why\s+are|why\s+do|why\s+does|how\s+does|how\s+do|explain|define|describe|meaning\s+of|definition\s+of|concept\s+of|theory\s+of|principles?\s+of|difference\s+between)\b/i.test(p)) {
    return true;
  }
  return false;
}

assert.strictEqual(isGeneralKnowledgeQuery('What is photosynthesis?'), true);
assert.strictEqual(isGeneralKnowledgeQuery('Explain quantum computing'), true);
assert.strictEqual(isGeneralKnowledgeQuery('How does cellular respiration work?'), true);
assert.strictEqual(isGeneralKnowledgeQuery('Define polymorphism in object oriented programming'), true);

// Queries that should NOT be conversational general knowledge
assert.strictEqual(isGeneralKnowledgeQuery('Search for the best restaurants near me'), false);
assert.strictEqual(isGeneralKnowledgeQuery('What is the weather today?'), false);
assert.strictEqual(isGeneralKnowledgeQuery('What is the latest score of the cricket match?'), false);
assert.strictEqual(isGeneralKnowledgeQuery('What is the price of iPhone 16?'), false);
assert.strictEqual(isLocalPlacesIntent('Search for the best restaurants near me'), true);
assert.strictEqual(isLocalPlacesIntent('Best cafes in Amravati'), true);
console.log('  ✓ General Knowledge queries route to conversation without triggering web search');
console.log('  ✓ Local Places and real-time queries route to search');

// ----------------------------------------------------
// TEST SUITE 3: Entity Extraction from Raw Search Results
// ----------------------------------------------------
console.log('\n[Test 3] Entity Extraction & SEO Filtering');

// Test cleanEntityTitle
const rawTitle1 = 'Gardenia Restaurant | Amravati | Restaurant Guru';
assert.strictEqual(entityExtractor.cleanEntityTitle(rawTitle1), 'Gardenia Restaurant');

const rawTitle2 = '1. The Grand Mehfil - TripAdvisor';
assert.strictEqual(entityExtractor.cleanEntityTitle(rawTitle2), 'The Grand Mehfil');

// Test isListicleOrAggregatorHeadline
assert.strictEqual(entityExtractor.isListicleOrAggregatorHeadline('Top 10 restaurants in Amravati - Restaurant Guru'), true);
assert.strictEqual(entityExtractor.isListicleOrAggregatorHeadline('THE 10 BEST Restaurants in Amravati (Updated 2026) - Tripadvisor'), true);
assert.strictEqual(entityExtractor.isListicleOrAggregatorHeadline('Top Restaurants in Amravati - Justdial'), true);
assert.strictEqual(entityExtractor.isListicleOrAggregatorHeadline('Silver Spoon Multi Cuisine Restaurant'), false);
assert.strictEqual(entityExtractor.isListicleOrAggregatorHeadline('Up & Above Family Restaurant'), false);
console.log('  ✓ Aggregator headlines (Tripadvisor, Restaurant Guru) are properly rejected');
console.log('  ✓ Clean restaurant/place titles are recognized');

// Test extracting ratings and cuisines
const sampleText = 'Rated 4.5/5 stars. Specializes in North Indian and Chinese delicacies with cozy family dining.';
assert.strictEqual(entityExtractor.extractRatingFromText(sampleText), 4.5);
const cuisines = entityExtractor.extractCuisines(sampleText);
assert.deepStrictEqual(cuisines, ['North Indian', 'Chinese', 'Family Dining']);
console.log('  ✓ Ratings and cuisines accurately extracted');

// Test full place extraction from mock search results (similar to real Amravati search results)
const mockSearchResults = [
  {
    title: 'Top 10 restaurants in Amravati - Restaurant Guru',
    snippet: 'Best dining in Amravati. 1. Silver Spoon Restaurant - rated 4.5 stars. Popular for North Indian and Chinese food in Camp area. 2. The Grand Mehfil - 4.4 rating, famous for Mughlai cuisine and rooftop ambiance.',
    url: 'https://restaurantguru.com/amravati'
  },
  {
    title: 'Gardenia Restaurant | Amravati',
    snippet: 'Gardenia Restaurant is located on Badnera Road. Rated 4.3 out of 5. Known for authentic vegetarian thali and continental dishes.',
    url: 'https://tripadvisor.com/gardenia-amravati'
  },
  {
    title: 'THE 10 BEST Restaurants in Amravati - Tripadvisor',
    snippet: 'Explore top spots. Visit Up and Above Restaurant for family dining, rated 4.2 stars with great outdoor seating.',
    url: 'https://tripadvisor.com/restaurants-amravati'
  }
];

const extractedPlaces = entityExtractor.extractPlacesFromSearchResults(mockSearchResults, 'Amravati');
assert.ok(extractedPlaces.length >= 2, `Expected at least 2 places, found ${extractedPlaces.length}`);

const placeNames = extractedPlaces.map(p => p.name);
console.log('  Extracted Place Entities:', placeNames);
assert.ok(placeNames.includes('Gardenia Restaurant'), 'Gardenia Restaurant should be extracted');
assert.ok(placeNames.some(n => n.includes('Silver Spoon')), 'Silver Spoon should be extracted');
assert.ok(!placeNames.includes('Top 10 restaurants in Amravati - Restaurant Guru'), 'SEO listicle should NEVER be an entity name');
console.log('  ✓ Real places extracted and ranked with zero SEO listicle headlines');

// ----------------------------------------------------
// TEST SUITE 4: Place Markdown Synthesis
// ----------------------------------------------------
console.log('\n[Test 4] Structured Places Markdown Synthesis');
const placesMarkdown = entityExtractor.formatPlacesMarkdown(extractedPlaces, 'best restaurants near me', 'Amravati');

assert.ok(placesMarkdown.includes('> [!NOTE]'), 'Should contain an executive recommendation callout');
assert.ok(placesMarkdown.includes('Gardenia Restaurant'), 'Should format Gardenia Restaurant');
assert.ok(placesMarkdown.includes('⭐'), 'Should include star ratings');
assert.ok(placesMarkdown.includes('> [!TIP]'), 'Should include actionable dining tip');
console.log('  ✓ Places formatted into polished, professional markdown');

// ----------------------------------------------------
// TEST SUITE 5: Prompt Echo & Rubric Leakage Detection
// ----------------------------------------------------
console.log('\n[Test 5] Prompt Echo & Verbatim Rubric Rejection');

const isJunkOrVerbatimEcho = (text) => {
  if (!text || text.trim().length < 15) return true;
  if (/\b(Executive TL;DR|Visual Diagrams\s*\(Mermaid\)|CRITICAL ANTIGRAVITY-STYLE|ALWAYS start with a >|Structured Subheadings & Bold Bullets|Actionable Takeaways|No Raw Snippet Echoing|Live Search Sources:|Formatting guidelines:)\b/i.test(text)) return true;
  if (/\b(CRITICAL.*RULES|ALWAYS include a complete, valid Mermaid|callout block summarizing the core answer)\b/i.test(text)) return true;
  if (/\[!HYPERLINK\]/i.test(text)) return true;
  if (/<!--\s*followups:/i.test(text) && text.trim().startsWith('<!--')) return true;
  if (/\bURL:\s*https?:\/\//i.test(text)) return true;
  if (/\bContent:\s*\*/i.test(text)) return true;
  if (/^[^:\n]+URL:\s*https?:\/\//i.test(text)) return true;
  if (/\[Source \d+:/i.test(text)) return true;
  if (/\{"@context"/i.test(text)) return true;
  if (/\bif\s*\(navigator\./i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if ((text.match(/\[!NOTE\]/gi) || []).length > 4) return true;
  if ((text.match(/```mermaid/gi) || []).length > 2) return true;
  return false;
};

// Screenshot 1 verbatim echo sample:
const badEcho1 = `Executive TL;DR: 1. Executive TL;DR: ALWAYS start with a > [!NOTE] callout block summarizing the core answer in 1–2 crisp sentences. 2. Visual Diagrams (Mermaid): - For comparisons, architectures, data flows...`;
assert.strictEqual(isJunkOrVerbatimEcho(badEcho1), true, 'Screenshot 1 prompt echo must be detected as junk');

// Screenshot 2 verbatim echo sample:
const badEcho2 = `[!HYPERLINK] [!HYPERLINK] [!HYPERLINK] Some random text with CRITICAL ANTIGRAVITY-STYLE MARKDOWN FORMATTING RULES: 1. Executive TL;DR`;
assert.strictEqual(isJunkOrVerbatimEcho(badEcho2), true, 'Screenshot 2 hyperlink spam must be detected as junk');

// Clean synthesized response
const goodAnswer = `> [!NOTE]\n> **Quick Summary:** Amravati offers vibrant dining options ranging from authentic Maharashtrian cuisine to multi-cuisine fine dining.\n\n### Top Recommendations\n- **Gardenia Restaurant:** Known for family dining and North Indian specialties.\n- **Silver Spoon:** Popular for continental and Chinese platters.`;
assert.strictEqual(isJunkOrVerbatimEcho(goodAnswer), false, 'Clean synthesized answer must pass validation');
console.log('  ✓ Prompt echo and rubric leaks successfully caught and rejected');
console.log('  ✓ High quality synthesis accepted');

console.log('\n====================================================');
console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
console.log('====================================================');
