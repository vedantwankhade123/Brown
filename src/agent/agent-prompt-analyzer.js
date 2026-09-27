/**
 * Ultron AI Prompt Understanding & Requirement Analysis Engine
 * Analyzes user prompts deeply before tool execution or search:
 * - Extracts explicit & implicit requirements, constraints, budget, category, attributes
 * - Formulates the precise user goal
 * - Determines the optimal result format (comparison, guide, direct answer, etc.)
 * - Selects the appropriate tool strategy and builds targeted queries
 * - Generates structured subgoals for live UI feedback
 */
(function () {
  'use strict';

  function normalizePrompt(prompt) {
    return String(prompt || '')
      .replace(/\bantigraviyt\b/gi, 'antigravity')
      .replace(/\bantigraivty\b/gi, 'antigravity')
      .replace(/\bcurent\b/gi, 'current')
      .replace(/\bprimeminister\b/gi, 'prime minister')
      .replace(/\bfinid\b/gi, 'find')
      .replace(/\bfidn\b/gi, 'find')
      .replace(/\bserach\b/gi, 'search')
      .replace(/\bserch\b/gi, 'search')
      .replace(/\bshwo\b/gi, 'show')
      .replace(/\bteh\b/gi, 'the')
      .trim();
  }

  function extractBudget(prompt, regional = {}) {
    const p = prompt.toLowerCase();
    const budgetMatch = p.match(/\b(?:under|below|less than|within|around|upto|up to|max(?:imum)?|budget(?:\s*of)?)\s*([₹$€£]?)\s*([\d,.]+)\s*(k|thousand|inr|usd|eur|gbp|rupees?|dollars?|rs\.?)?\b/i)
      || p.match(/([₹$€£])\s*([\d,.]+)\s*(k|thousand)?\b/i);

    if (!budgetMatch) return null;

    let symbol = budgetMatch[1] || '';
    let rawAmount = budgetMatch[2] ? budgetMatch[2].replace(/,/g, '') : '';
    let unitOrCurrency = (budgetMatch[3] || '').toLowerCase();

    let numericVal = parseFloat(rawAmount);
    if (isNaN(numericVal)) return null;

    if (unitOrCurrency === 'k' || unitOrCurrency === 'thousand') {
      numericVal = numericVal * 1000;
    }

    let currency = 'INR';
    if (symbol === '$' || unitOrCurrency === 'usd' || unitOrCurrency === 'dollars' || unitOrCurrency === 'dollar') {
      currency = 'USD';
    } else if (symbol === '€' || unitOrCurrency === 'eur' || unitOrCurrency === 'euros') {
      currency = 'EUR';
    } else if (symbol === '£' || unitOrCurrency === 'gbp' || unitOrCurrency === 'pounds') {
      currency = 'GBP';
    } else if (symbol === '₹' || unitOrCurrency === 'inr' || unitOrCurrency === 'rupees' || unitOrCurrency === 'rupee' || unitOrCurrency === 'rs') {
      currency = 'INR';
    } else if (regional && regional.currency) {
      currency = regional.currency;
    }

    const currencySymbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : currency)));

    return {
      amount: numericVal,
      formatted: `${currencySymbol}${numericVal.toLocaleString()}`,
      currency,
      currencySymbol,
      rawText: budgetMatch[0]
    };
  }

  function extractCategory(prompt) {
    const p = prompt.toLowerCase();
    const categories = [
      {
        name: 'Footwear & Shoes',
        type: 'shopping',
        tags: ['shoes', 'sneakers', 'footwear', 'running shoes', 'sports shoes', 'boots', 'sandals', 'loafers', 'formal shoes', 'casual shoes', 'slippers'],
        pattern: /\b(shoes?|sneakers?|footwear|running shoes?|sports shoes?|boots?|sandals?|loafers?|formal shoes?|casual shoes?|slippers?)\b/i
      },
      {
        name: 'Electronics & Gadgets',
        type: 'shopping',
        tags: ['laptop', 'phone', 'smartphone', 'headphones', 'earbuds', 'smartwatch', 'tablet', 'monitor', 'tv', 'keyboard', 'mouse', 'speaker', 'camera', 'gpu', 'cpu', 'power bank'],
        pattern: /\b(laptops?|smartphones?|phones?|headphones?|earphones?|earbuds?|smartwatch(?:es)?|tablets?|monitors?|tvs?|keyboards?|mouse|mice|speakers?|cameras?|gpus?|cpus?|power banks?)\b/i
      },
      {
        name: 'Clothing & Fashion',
        type: 'shopping',
        tags: ['clothes', 'clothing', 'shirt', 't-shirt', 'jacket', 'hoodie', 'jeans', 'trousers', 'dress', 'kurta', 'suit', 'bag', 'backpack'],
        pattern: /\b(clothes|clothing|shirts?|t-shirts?|tshirts?|jackets?|hoodies?|jeans|trousers?|dresses?|kurtas?|suits?|backpacks?|bags?)\b/i
      },
      {
        name: 'Books & Courses',
        type: 'learning',
        tags: ['book', 'course', 'tutorial', 'certification', 'guide', 'class', 'training'],
        pattern: /\b(books?|courses?|tutorials?|certifications?|classes?|bootcamps?|trainings?)\b/i
      },
      {
        name: 'Dining & Restaurants',
        type: 'places',
        tags: ['restaurant', 'cafe', 'food', 'dining', 'coffee', 'hotel', 'biryani', 'pizza', 'burger'],
        pattern: /\b(restaurants?|cafes?|coffee shops?|food|dining|eater(?:y|ies)|baker(?:y|ies)|places to eat)\b/i
      },
      {
        name: 'Entertainment & Media',
        type: 'media',
        tags: ['movie', 'film', 'series', 'show', 'anime', 'drama', 'ott', 'documentary'],
        pattern: /\b(movies?|films?|shows?|web\s*series|series|anime|k-drama|documentar(?:y|ies))\b/i
      },
      {
        name: 'Software & Code',
        type: 'code',
        tags: ['code', 'script', 'python', 'javascript', 'html', 'css', 'api', 'function', 'bug', 'program'],
        pattern: /\b(code|script|python|javascript|typescript|html|css|sql|function|api|debug|programming|algorithm)\b/i
      },
      {
        name: 'Desktop & System Task',
        type: 'desktop_action',
        tags: ['open app', 'launch', 'create file', 'write file', 'delete', 'terminal', 'folder'],
        pattern: /\b(open|launch|create file|write file|make folder|mkdir|run command|in notepad|in chrome)\b/i
      }
    ];

    for (const cat of categories) {
      if (cat.pattern.test(p)) {
        return cat;
      }
    }

    return {
      name: 'General Information & Research',
      type: 'general',
      tags: [],
      pattern: /.*/
    };
  }

  function extractSpecificPreferences(prompt) {
    const p = prompt.toLowerCase();
    const prefs = [];

    // Usage intent
    if (/\b(running|sports|gym|workout|athletic|training)\b/i.test(p)) prefs.push('Sports / Athletic / Running');
    if (/\b(casual|daily\s*wear|college|everyday|lifestyle)\b/i.test(p)) prefs.push('Casual / Everyday Wear');
    if (/\b(formal|office|party|wedding|work)\b/i.test(p)) prefs.push('Formal / Professional');
    if (/\b(gaming|gamer)\b/i.test(p)) prefs.push('Gaming Performance');
    if (/\b(coding|programming|developer)\b/i.test(p)) prefs.push('Programming & Development');
    if (/\b(travel|outdoors?|hiking|trekking)\b/i.test(p)) prefs.push('Travel & Outdoor Durability');

    // Quality preferences
    if (/\b(comfortable|cushion|cushioning|memory\s*foam)\b/i.test(p)) prefs.push('High Comfort & Cushioning');
    if (/\b(durable|long\s*lasting|sturdy|tough)\b/i.test(p)) prefs.push('Durability & Longevity');
    if (/\b(lightweight|light|breathable|mesh)\b/i.test(p)) prefs.push('Lightweight & Breathable');
    if (/\b(waterproof|water\s*resistant)\b/i.test(p)) prefs.push('Water Resistance');
    if (/\b(leather|synthetic|mesh|canvas)\b/i.test(p)) {
      const match = p.match(/\b(leather|synthetic|mesh|canvas)\b/i);
      if (match) prefs.push(`Material: ${match[1]}`);
    }

    // Brands mentioned
    const popularBrands = [
      'nike', 'adidas', 'puma', 'sparx', 'campus', 'asian', 'bata', 'red tape', 'woodland', 'reebok', 'skechers', 'asics',
      'apple', 'samsung', 'oneplus', 'xiaomi', 'realme', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'sony', 'boat', 'noise',
      'zara', 'h&m', 'levi', 'allen solly', 'peter england', 'van heusen'
    ];
    for (const b of popularBrands) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(p)) {
        prefs.push(`Brand preference: ${b.toUpperCase()}`);
      }
    }

    // Target audience
    if (/\b(men|male|boys?|gentlemen)\b/i.test(p)) prefs.push('For: Men');
    if (/\b(women|female|girls?|ladies)\b/i.test(p)) prefs.push('For: Women');
    if (/\b(kids|children|toddler)\b/i.test(p)) prefs.push('For: Kids');

    return prefs;
  }

  function formulateUserGoal(prompt, category, budget, preferences) {
    const p = prompt.toLowerCase();

    if (category.type === 'shopping') {
      const catName = category.name.toLowerCase();
      const budgetClause = budget ? `within a budget limit of ${budget.formatted}` : 'with optimal price-to-performance';
      const prefsClause = preferences.length ? ` focusing on ${preferences.slice(0, 2).join(' and ')}` : '';
      return `Discover, filter, and evaluate top-rated ${catName} ${budgetClause}${prefsClause}, verifying real-world durability, verified user feedback, and pricing.`;
    }

    if (category.type === 'places') {
      return `Identify top-rated places matching "${prompt.slice(0, 40)}" with verified ratings, signature offerings, location, and practical visit advice.`;
    }

    if (category.type === 'media') {
      return `Provide curated recommendations matching the user's entertainment preferences with genre highlights, streaming platforms, and fit justification.`;
    }

    if (category.type === 'code') {
      return `Design, write, and verify complete, production-ready code with clean explanations and execution instructions.`;
    }

    if (category.type === 'desktop_action') {
      return `Plan and execute the requested desktop system operations safely with step-by-step verification.`;
    }

    return `Deliver a precise, comprehensive, and well-researched answer addressing "${prompt.slice(0, 60)}" with facts, structured formatting, and practical takeaways.`;
  }

  function determineResultType(category, budget) {
    if (category.type === 'shopping') {
      return {
        type: 'Product Recommendation & Buying Guide',
        structure: [
          'Direct overview highlighting top recommendation',
          'Curated product comparison list (Brand, Model, Verified Price, Best For)',
          'Key features, pros & cons, and build quality evaluation',
          'Budget compliance check (strictly verifying price constraints)',
          'Clear verdict & Summary on best value for money'
        ]
      };
    }

    if (category.type === 'places') {
      return {
        type: 'Curated Local Directory & Place Recommendations',
        structure: [
          'Overview of top spots in the requested area',
          'Detailed spot cards (Name, Rating, Specialties, Location/Ambiance)',
          'Practical visit tips (best time, price range, reservations)',
          'Summary highlighting top pick'
        ]
      };
    }

    if (category.type === 'media') {
      return {
        type: 'Curated Entertainment Watchlist',
        structure: [
          'Direct concise overview',
          'Ranked recommendations list with platform availability & why it fits',
          'Key highlights without plot spoilers',
          'Summary recommendation'
        ]
      };
    }

    if (category.type === 'code') {
      return {
        type: 'Technical Code Solution',
        structure: [
          'Approach and architecture overview',
          'Complete, runnable code implementation with syntax highlighting',
          'Step-by-step explanation and edge cases',
          'Summary of usage'
        ]
      };
    }

    return {
      type: 'Structured Analysis & Comprehensive Answer',
      structure: [
        'Direct executive answer',
        'Detailed breakdown with subheadings and bullet points',
        'Comparison or practical considerations where applicable',
        'Clear Summary section with key takeaways'
      ]
    };
  }

  function determineToolStrategy(prompt, category, budget, options = {}) {
    const sysEnv = options.sysEnv || {};
    const regional = options.regional || {};
    const isSearchAllowed = options.isWebSearchEnabled !== false;

    if (category.type === 'desktop_action') {
      return {
        primaryTool: 'LOCAL_DESKTOP',
        requiresTools: true,
        toolNames: ['OPEN_APP', 'WRITE_FILE', 'EXECUTE', 'HOTKEY'],
        rationale: 'Local desktop operating system execution is required to perform the requested application and file tasks.',
        queries: []
      };
    }

    if (category.type === 'code') {
      return {
        primaryTool: 'CODE_ENGINE',
        requiresTools: false,
        toolNames: ['CODE_GENERATION'],
        rationale: 'Direct code synthesis and algorithmic problem solving.',
        queries: []
      };
    }

    if (category.type === 'shopping' || category.type === 'places' || category.type === 'general' || options.intent === 'search') {
      const queries = buildOptimizedSearchQueries(prompt, category, budget, regional);
      return {
        primaryTool: isSearchAllowed ? 'WEB_SEARCH' : 'LOCAL_KNOWLEDGE',
        requiresTools: isSearchAllowed,
        toolNames: isSearchAllowed ? ['WEB_SEARCH', 'ENTITY_EXTRACTOR'] : [],
        rationale: 'Live web lookup is needed to retrieve current pricing, active marketplace deals, authentic reviews, and specifications.',
        queries
      };
    }

    return {
      primaryTool: 'DIRECT_SYNTHESIS',
      requiresTools: false,
      toolNames: [],
      rationale: 'Direct conversational reasoning and knowledge synthesis.',
      queries: []
    };
  }

  function buildOptimizedSearchQueries(prompt, category, budget, regional = {}) {
    const cleanPrompt = normalizePrompt(prompt)
      .replace(/\b(find|show|give|get|search|tell me|suggest|recommend|list)\s+(me\s+)?(the\s+)?(some\s+)?/gi, '')
      .replace(/[?!.]+$/, '')
      .trim();

    const queries = [];
    const country = regional.country || (regional.countryCode === 'IN' ? 'India' : '');
    const currencyWord = regional.currencyWord || (regional.currency === 'INR' ? 'rupees' : '');

    let baseQuery = cleanPrompt;
    if (budget) {
      const budgetTag = `${budget.formatted} ${regional.currency || ''}`.trim();
      queries.push(`best ${category.tags[0] || 'products'} under ${budget.amount} ${country}`.trim());
      queries.push(`top rated ${cleanPrompt} ${country}`.trim());
      queries.push(`${cleanPrompt} reviews and price ${country}`.trim());
    } else {
      queries.push(`${cleanPrompt} ${country}`.trim());
      queries.push(`best ${cleanPrompt} reviews ${country}`.trim());
    }

    return Array.from(new Set(queries.map(q => q.replace(/\s+/g, ' ').trim()))).filter(Boolean).slice(0, 3);
  }

  function generateSubgoals(userPrompt, analysis) {
    return [];
  }

  /**
   * Main Prompt Analysis Entrypoint
   * @param {string} prompt - Raw user input
   * @param {object} options - sysEnv, regional, intent, etc.
   * @returns {object} Full Prompt Understanding specification
   */
  function analyzePrompt(prompt, options = {}) {
    const raw = String(prompt || '').trim();
    const clean = normalizePrompt(raw);
    const regional = options.regional || {};

    const budget = extractBudget(clean, regional);
    const category = extractCategory(clean);
    const preferences = extractSpecificPreferences(clean);
    const userGoal = formulateUserGoal(clean, category, budget, preferences);
    const resultType = determineResultType(category, budget);
    const toolStrategy = determineToolStrategy(clean, category, budget, { ...options, regional });

    // Build list of requirements
    const requirementsList = [];
    requirementsList.push(`Category: ${category.name}`);
    if (budget) {
      requirementsList.push(`Budget Constraint: Strictly ${budget.formatted} (Maximum limit: ${budget.amount} ${budget.currency})`);
    }
    if (preferences.length) {
      requirementsList.push(`User Criteria: ${preferences.join(', ')}`);
    }
    if (regional.country) {
      requirementsList.push(`Market / Region: ${regional.country} (${regional.currency || 'local currency'})`);
    }

    const analysis = {
      rawPrompt: raw,
      cleanPrompt: clean,
      budget,
      category,
      preferences,
      userGoal,
      resultType,
      toolStrategy,
      requirements: requirementsList
    };

    analysis.subgoals = generateSubgoals(clean, analysis);

    // Build prompt guidance block for LLM synthesis
    analysis.promptContextBlock = `
### MANDATORY PROMPT UNDERSTANDING & REQUIREMENT SPECIFICATION:
- **Identified User Goal**: ${userGoal}
- **Explicit Requirements & Constraints**:
${requirementsList.map(r => `  * ${r}`).join('\n')}
- **Expected Result Type**: ${resultType.type}
- **Required Output Structure**:
${resultType.structure.map(s => `  1. ${s}`).join('\n')}
- **Crucial Rule**: Every recommendation or data point MUST strictly respect the user's constraints (e.g., if price is under ${budget ? budget.formatted : 'specified budget'}, do not exceed it). Provide clear pros & cons and conclude with a decisive Summary section.`;

    return analysis;
  }

  const ACRONYMS = new Set([
    'HTML', 'CSS', 'JS', 'TS', 'UI', 'UX', 'AI', 'ML', 'API', 'REST', 'URL', 'HTTP', 'HTTPS',
    'SQL', 'JSON', 'XML', 'PDF', 'CSV', 'SVG', 'PNG', 'JPG', 'CLI', 'GUI', 'IDE', 'OS',
    'PC', 'CPU', 'GPU', 'RAM', 'SSD', 'ROM', 'IP', 'DNS', 'TCP', 'UDP', 'LAN', 'WAN', 'VPN',
    'UK', 'USA', 'US', 'EU', 'UN', 'NASA', 'ISRO', 'WHO', 'INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'
  ]);

  const LOWER_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'with', 'in', 'of'
  ]);

  function toSmartTitleCase(str) {
    if (!str) return '';
    const words = str.trim().split(/\s+/);
    return words.map((w, idx) => {
      const cleanW = w.replace(/[^a-zA-Z0-9]/g, '');
      const upper = cleanW.toUpperCase();
      if (ACRONYMS.has(upper)) {
        return w.replace(cleanW, upper);
      }
      const lower = cleanW.toLowerCase();
      if (idx > 0 && idx < words.length - 1 && LOWER_WORDS.has(lower)) {
        return lower;
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function isGenericTitle(title) {
    if (!title || typeof title !== 'string') return true;
    const t = title.trim();
    if (!t) return true;
    if (/^(new chat|untitled|chat|hi|hello|hey|hii|yo|test|greeting)[\s.?!]*$/i.test(t)) return true;
    // Check for truncated stopword/filler fragments
    if (/^(who is the current|find me the best|search for the best|write me an|write me a|tell me about the|give me a list|how do i create|what is the best)\b/i.test(t)) return true;
    // Check for dangling prepositions/stop words at the end
    if (/\b(of|the|for|in|to|and|with|on|at|by|is|are|an|a)\.{0,3}$/i.test(t)) return true;
    return false;
  }

  function generateMeaningfulChatTitle(userPrompt, options = {}) {
    if (!userPrompt || typeof userPrompt !== 'string') return 'New Chat';
    const raw = userPrompt.trim();
    if (!raw) return 'New Chat';

    // 1. Simple greetings -> placeholder 'New Chat'
    if (/^(hi|hey|hello|helo|hii|yo|sup|good (morning|afternoon|evening)|howdy|hola|namaste|thanks|thank you|ok|okay)[\s!.?]*$/i.test(raw)) {
      return 'New Chat';
    }

    const regional = options.regional || { currency: 'INR', currencySymbol: '₹' };
    const budget = extractBudget(raw, regional);
    const category = extractCategory(raw);

    // Normalize common typos and abbreviations for high-accuracy title generation
    const normalizedRaw = raw
      .replace(/\bcurent\b/gi, 'current')
      .replace(/\bprimeminister\b/gi, 'prime minister')
      .replace(/\bcompoun\s*dinterest\b/gi, 'compound interest')
      .replace(/\bintrest\b/gi, 'interest')
      .replace(/\bformual\b/gi, 'formula')
      .replace(/\bformla\b/gi, 'formula')
      .replace(/\bindia'?s\b/gi, 'india')
      .replace(/\b\s*and\s+etc\s+things?\b/gi, '')
      .replace(/\b\s*and\s+so\s+on\b/gi, '');

    // 2. Shopping under budget (e.g. "Find me the best shoes under 2000 and etc things")
    const budgetMatch = normalizedRaw.match(/\b(?:under|below|less than|within|budget(?:\s*of)?)\s*([₹$€£]?)\s*([\d,.]+)/i);
    const productMatch = normalizedRaw.match(/\b(shoes?|sneakers?|running shoes?|sports shoes?|laptops?|phones?|smartphones?|headphones?|earbuds?|smartwatch(?:es)?|tablets?|monitors?|tvs?|keyboards?|mouse|speakers?|cameras?|jackets?|clothes|shirts?|backpacks?|courses?|books?)\b/i);
    if (productMatch && (budgetMatch || budget)) {
      const sym = budgetMatch ? (budgetMatch[1] || regional.currencySymbol || '₹') : (budget ? budget.currencySymbol : '₹');
      const amt = budgetMatch ? budgetMatch[2] : (budget ? budget.amount : '');
      return toSmartTitleCase(`${productMatch[0]} Under ${sym}${amt}`);
    }

    // 2b. Mathematical / Scientific formulas (e.g. "what s the formula for compoun dinterest")
    const formulaMatch = normalizedRaw.match(/\b(?:what(?:'s|\s+is|\s+s)?\s+(?:the\s+)?(?:formula\s+for|equation\s+for))\s+([^?.!]+)/i)
      || normalizedRaw.match(/\b(?:formula\s+(?:for|of))\s+([^?.!]+)/i);
    if (formulaMatch) {
      let topic = formulaMatch[1].trim()
        .replace(/^(a|an|the)\s+/i, '')
        .replace(/\s+(in|for)\s+.*$/i, '')
        .trim();
      return toSmartTitleCase(`${topic} Formula`);
    }

    // 3. Role / Current leader queries (e.g. "who is the curent pm of india", "Who is the current prime minister of UK")
    const leaderQuery = normalizedRaw.replace(/\bpm\b/gi, 'Prime Minister').replace(/\bcm\b/gi, 'Chief Minister');
    const roleMatch = leaderQuery.match(/\b(?:who\s+(?:is|was)\s+(?:the\s+)?(?:current\s+)?)(ceo|president|prime minister|chief minister|founder|governor|director|minister|captain|leader|monarch|king|queen)\s+(?:of\s+)?([^?.!]+)/i);
    if (roleMatch) {
      const role = roleMatch[1].trim();
      const entity = roleMatch[2].trim().replace(/\s+(now|today|currently)\b/gi, '');
      return toSmartTitleCase(`${entity} ${role}`);
    }

    // 3b. Direct facts: capital of, currency of, population of
    const factMatch = normalizedRaw.match(/\b(?:what\s+(?:is|was)\s+(?:the\s+)?)(capital|currency|population|height|speed)\s+(?:of\s+)?([^?.!]+)/i);
    if (factMatch) {
      const prop = factMatch[1].trim();
      const entity = factMatch[2].trim().replace(/\s+(now|today|currently)\b/gi, '');
      return toSmartTitleCase(`${entity} ${prop}`);
    }

    // 4. "Who is [Named Person]" (e.g. "who is elon musk")
    const personMatch = normalizedRaw.match(/\b(?:who\s+(?:is|was)\s+)([a-zA-Z\s]{3,30})(?:\?|$)/i);
    if (personMatch && !/\b(the|a|an|current)\b/i.test(personMatch[1])) {
      return toSmartTitleCase(personMatch[1].trim());
    }

    // 5. Website / Landing page creation
    const webMatch = raw.match(/\b(?:write|create|build|make|generate)\s+(?:me\s+)?(?:an?\s+)?([a-zA-Z\s]{0,20}?)(website|landing page|web\s*page|portfolio|blog)\s*(?:for\s+([^?.!]+))?/i);
    if (webMatch) {
      const forWhat = (webMatch[3] || webMatch[1] || '').trim().replace(/^(a|an|the)\s+/i, '');
      const siteType = webMatch[2].trim();
      if (forWhat) {
        return toSmartTitleCase(`${forWhat.split(/\s+/).slice(0, 2).join(' ')} ${siteType}`);
      }
      return toSmartTitleCase(siteType);
    }

    // 6. Code / Script creation
    const codeMatch = raw.match(/\b(?:write|create|build|make|generate|implement)\s+(?:me\s+)?(?:an?\s+)?(python|javascript|typescript|html|css|react|vue|sql|c\+\+|java|rust|go)?\s*(?:code|script|program|function|algorithm)?\s*(?:for|to|of|about)\s+([^?.!]+)/i);
    if (codeMatch) {
      const lang = (codeMatch[1] || '').trim();
      const task = (codeMatch[2] || '').trim().replace(/^(calculate|compute|solve|print|implement|generate|find)\s+(?:the\s+)?/i, '').replace(/^(a|an|the)\s+/i, '');
      const taskBrief = task.split(/\s+/).slice(0, 3).join(' ');
      if (lang && taskBrief) {
        return toSmartTitleCase(`${taskBrief} in ${lang}`);
      }
      if (taskBrief) return toSmartTitleCase(taskBrief);
    }

    // 7. Scientific / Conceptual explanation queries (e.g. "how does photosynthesis work")
    const explainMatch = raw.match(/\b(?:how\s+(?:does|do)\s+([^?.!]+)\s+work|explain\s+(?:to me\s+)?(?:how\s+)?([^?.!]+))/i);
    if (explainMatch) {
      const topic = (explainMatch[1] || explainMatch[2] || '').trim().replace(/^(a|an|the)\s+/i, '');
      return toSmartTitleCase(`${topic.split(/\s+/).slice(0, 3).join(' ')}`);
    }

    // 8. Comparisons
    const vsMatch = raw.match(/\b(?:compare\s+)?([a-zA-Z0-9_\-\s]{2,20})\s+(?:vs\.?|versus)\s+([a-zA-Z0-9_\-\s]{2,20})/i);
    if (vsMatch) {
      return toSmartTitleCase(`${vsMatch[1].replace(/^compare\s+/i, '').trim()} vs ${vsMatch[2].trim()}`);
    }

    // 9. Places / Food
    const placesMatch = raw.match(/\b(cafes?|restaurants?|hotels?|places to visit|attractions?|spots?|food)\s+(?:in|at|near|around)\s+([a-zA-Z\s]{3,25})/i);
    if (placesMatch) {
      return toSmartTitleCase(`${placesMatch[1].trim()} in ${placesMatch[2].trim()}`);
    }

    // 10. General cleanup of conversational prefixes
    let clean = raw
      .replace(/^(?:who (?:is|was|are|were) (?:the )?(?:current )?|what (?:is|was|are|were) (?:the )?(?:current )?|where (?:is|are|can i find) (?:the )?|when (?:did|was|is) (?:the )?|which (?:is|are) (?:the )?|why (?:is|are|do|does) (?:the )?)\s*/i, '')
      .replace(/^(?:search (?:the web )?(?:for|about )?(?:the )?|google (?:for )?(?:the )?|look up (?:the )?|find (?:me )?(?:the )?(?:best )?|find out (?:about )?(?:the )?|browse (?:for )?|recommend (?:me )?(?:some |the best |a |an )?|suggest (?:me )?(?:some |the best |a |an )?)\s*/i, '')
      .replace(/^(?:write (?:me )?(?:a|an|the|some )?|create (?:me )?(?:a|an|the|some )?|build (?:me )?(?:a|an|the|some )?|make (?:me )?(?:a|an|the|some )?|generate (?:me )?(?:a|an|the|some )?)\s*/i, '')
      .replace(/^(?:can you (?:please )?|could you (?:please )?|please (?:help me )?|help me (?:with|to )?|i want (?:to|you to )?|i need (?:to|you to )?|give me (?:a|an|the|some )?|show me (?:a|an|the|some )?|tell me (?:about )?|explain (?:to me )?(?:how|what|why|the )?|how do i |how can i |how to )\s*/i, '')
      .replace(/^(?:a |an |the )\s*/i, '')
      .replace(/[?!.:,;"']+$/g, '')
      .trim();

    let words = clean.split(/\s+/).filter(Boolean).slice(0, 5);
    while (words.length > 1 && /^(of|the|for|in|to|and|with|on|at|by|is|are|an|a|from|about)$/i.test(words[words.length - 1])) {
      words.pop();
    }
    let title = toSmartTitleCase(words.join(' '));
    if (title.length > 32) {
      title = title.substring(0, 28).trim();
      const lastSpace = title.lastIndexOf(' ');
      if (lastSpace > 16) {
        title = title.substring(0, lastSpace);
      }
      title += '...';
    }
    return title || 'New Chat';
  }

  function isModernTechOrSoftwareQuery(prompt) {
    const p = normalizePrompt(prompt).toLowerCase();
    return /\b(antigravity(\s*ide)?|cursor(\s*ai)?|windsurf|trae|v0\.dev|bolt\.new|sora|midjourney|chatgpt|copilot|claude|gemini|ollama|deepseek|qwen|grok|llama|mistral|phi4?|bun(\s*js)?|deno|vite|next\.?js|nuxt|astro|tailwind|fastapi|pydantic|langchain|llamaindex|huggingface|pytorch|tensorflow|docker|kubernetes|supabase|firebase|appwrite|electron|flutter|react\s*native|qoder|perplexity|lovable|replit|vercel|netlify|cloudflare|warp|ghostty|zed(\s*editor)?|helix(\s*editor)?|neovim|nvim)\b/i.test(p)
      || /\b(ide|sdk|api|frameworks?|librar(?:y|ies)|models?|agents?|repos?|github|ai\s*tools?|ai\s*coding|extensions?|plugins?)\b/i.test(p);
  }

  function extractTargetEntity(prompt) {
    const p = normalizePrompt(prompt).trim();
    if (!p) return '';

    // 1. Coding & Tech creation: "write a login page in html and css" -> "Login Page"
    const codeCreateMatch = p.match(/\b(?:write|create|build|make|generate|implement|design|develop|draft)\s+(?:me\s+)?(?:an?\s+)?(?:the\s+)?([a-zA-Z0-9_\-\s]{2,35}?)(?:\s+(?:in|using|with|via)\s+([a-zA-Z0-9_\-+#\s]{2,30}))?$/i);
    if (codeCreateMatch && codeCreateMatch[1]) {
      let ent = codeCreateMatch[1].trim()
        .replace(/^(code|script|program|function|algorithm|website|app)\s+(?:for|to)\s+/i, '')
        .trim();
      const tech = (codeCreateMatch[2] || '').trim();
      if (ent && !/^(code|script|program|it|this|that|something)$/i.test(ent)) {
        return tech ? `${ent} (${tech})` : ent;
      }
    }

    // 2. Specific code tasks: "code for login form", "html and css for landing page"
    const codeForMatch = p.match(/\b(?:code|script|markup|styling)\s+(?:for|to)\s+([a-zA-Z0-9_\-\s]{2,40})/i);
    if (codeForMatch) {
      return codeForMatch[1].trim();
    }

    // 3. Question patterns: "what is X", "who is X", "tell me about X", "explain X"
    const whatMatch = p.match(/\b(?:what\s+(?:is|was|are|were)\s+(?:the\s+)?(?:definition\s+of\s+)?|who\s+(?:is|was|are|were)\s+(?:the\s+)?|tell\s+me\s+about\s+(?:the\s+)?|explain\s+(?:to me\s+)?(?:how\s+|what\s+|the\s+)?)([^?.!]+)/i);
    if (whatMatch) {
      let ent = whatMatch[1].trim()
        .replace(/^(a|an|the)\s+/i, '')
        .replace(/\s+(works?|does|means?|in|for|at|on)$/i, '')
        .trim();
      if (/\b(?:code|solution|function|markup|script)(?:\s+(?:you\s+)?(?:generated|wrote|created|made))?\b/i.test(ent)) {
        return 'generated code';
      }
      if (ent.length > 1 && ent.length < 50) return ent;
    }

    // 4. Search / Look up patterns: "search for X", "look up X", "find X"
    const searchMatch = p.match(/\b(?:search\s+(?:for\s+)?|look\s+up\s+|find\s+(?:out\s+about\s+)?)([^?.!]+)/i);
    if (searchMatch) {
      let ent = searchMatch[1].trim().replace(/^(a|an|the)\s+/i, '').trim();
      if (ent.length > 1 && ent.length < 50) return ent;
    }

    // 5. Creative writing: "poem about the ocean", "essay on climate change"
    const creativeMatch = p.match(/\b(?:poem|essay|story|article|speech|summary)\s+(?:about|on|of|for)\s+([^?.!]+)/i);
    if (creativeMatch) {
      let ent = creativeMatch[1].trim().replace(/^(a|an|the)\s+/i, '').trim();
      if (ent.length > 1 && ent.length < 50) return ent;
    }

    return '';
  }

  function generateDynamicThinkingSequence(prompt, analysis = null) {
    return [{ main: 'Thinking', type: 'think' }];
  }

  const targetScope = (typeof globalThis !== 'undefined' && globalThis.window)
    ? globalThis.window
    : (typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
  targetScope.UltronPromptAnalyzer = {
    analyzePrompt,
    extractBudget,
    extractCategory,
    extractSpecificPreferences,
    determineResultType,
    determineToolStrategy,
    generateMeaningfulChatTitle,
    isGenericTitle,
    isModernTechOrSoftwareQuery,
    extractTargetEntity,
    generateDynamicThinkingSequence
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = targetScope.UltronPromptAnalyzer;
  }
})();
