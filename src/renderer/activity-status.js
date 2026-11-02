(function (root) {
  'use strict';
  // Labels describe the current operation. Waiting never pretends that a tool,
  // source check, validation or file write has happened.
  const profiles = [
    ['greeting', /^(?:hi|hey|hello|thanks|thank you|good morning|good evening)[!.,\s]*$/i, ['Thinking', 'Preparing a reply']],
    ['debug', /\b(?:debug|fix|error|exception|crash|bug|not working|fails?)\b/i, ['Investigating the issue', 'Working through the symptoms', 'Examining possible causes', 'Preparing a fix']],
    ['code', /\b(?:code|function|script|program|implement|refactor|typescript|javascript|python|sql|css|html)\b/i, ['Planning the implementation', 'Working through the logic', 'Writing your code', 'Developing the solution']],
    ['review', /\b(?:review|critique|audit|feedback|identify gaps|find gaps)\b/i, ['Reviewing the details', 'Examining the structure', 'Looking for gaps', 'Preparing feedback']],
    ['summary', /\b(?:summarize|summarise|summary|tldr|tl;dr)\b/i, ['Finding the main points', 'Condensing the details', 'Writing your summary', 'Organizing the key takeaways']],
    ['translation', /\b(?:translate|translation)\b/i, ['Understanding the original text', 'Translating your text', 'Working through the phrasing']],
    ['rewrite', /\b(?:rewrite|rephrase|proofread|polish|grammar|shorten)\b/i, ['Reviewing your wording', 'Refining the phrasing', 'Rewriting your text', 'Improving clarity']],
    ['resume', /\b(?:resume|cv|curriculum vitae)\b/i, ['Reviewing your experience', 'Structuring your resume', 'Writing your resume', 'Refining the descriptions']],
    ['email', /\b(?:email|e-mail)\b/i, ['Planning your email', 'Drafting your email', 'Working on the wording', 'Writing your email']],
    ['letter', /\b(?:cover letter|letter)\b/i, ['Planning your letter', 'Drafting your letter', 'Working on the wording', 'Writing your letter']],
    ['essay', /\b(?:essay|article|blog|report|thesis)\b/i, ['Organizing the ideas', 'Developing the structure', 'Writing your draft', 'Elaborating on the key points']],
    ['story', /\b(?:story|poem|haiku|lyrics|fiction|screenplay)\b/i, ['Exploring ideas', 'Shaping your draft', 'Writing your piece', 'Developing the details']],
    ['presentation', /\b(?:presentation|slides|slide deck|pitch deck)\b/i, ['Structuring your presentation', 'Organizing the main points', 'Drafting slide content', 'Developing the narrative']],
    ['table', /\b(?:table|spreadsheet|csv)\b/i, ['Organizing the information', 'Preparing your table', 'Arranging the rows and columns']],
    ['outline', /\b(?:outline|study notes|notes)\b/i, ['Finding the main themes', 'Structuring your notes', 'Writing your outline', 'Organizing the details']],
    ['tutorial', /\b(?:tutorial|step.by.step guide|lesson)\b/i, ['Planning the walkthrough', 'Breaking down the steps', 'Writing your guide', 'Explaining each step']],
    ['comparison', /\b(?:compare|comparison|versus|pros and cons|tradeoffs|trade-offs)\b/i, ['Identifying comparison points', 'Weighing the differences', 'Organizing the tradeoffs', 'Preparing your comparison']],
    ['plan', /\b(?:plan|roadmap|schedule|itinerary|checklist|strategy)\b/i, ['Understanding your goals', 'Breaking down the work', 'Planning the steps', 'Organizing your plan']],
    ['math', /\b(?:calculate|solve|equation|integral|derivative|arithmetic)\b/i, ['Understanding the problem', 'Working through the calculation', 'Developing the solution']],
    ['analysis', /\b(?:analyze|analyse|analysis|evaluate|assess|investigate)\b/i, ['Examining the details', 'Analyzing the information', 'Looking for connections', 'Developing the explanation']],
    ['explanation', /\b(?:explain|how does|how do|why|walk me through|elaborate|teach)\b/i, ['Understanding your question', 'Working through the concepts', 'Building the explanation', 'Elaborating on the details']],
    ['brainstorm', /\b(?:brainstorm|ideas|suggest names|name ideas)\b/i, ['Exploring possibilities', 'Developing ideas', 'Considering different approaches', 'Preparing suggestions']],
    ['recommendation', /\b(?:recommend|suggest|choose|which should)\b/i, ['Understanding your priorities', 'Considering the options', 'Weighing the tradeoffs', 'Preparing suggestions']],
    ['conversation', /[\s\S]*/, ['Understanding your request', 'Working on your response', 'Thinking through the details', 'Preparing your answer']]
  ];
  const phases = {
    prepare: ['Preparing your request'],
    model: ['Preparing the model'],
    context: ['Preparing the conversation context'],
    search: ['Searching the web'],
    sources: ['Reading retrieved sources'],
    searchAnswer: ['Writing an answer from the sources'],
    visual: ['Planning your visual'],
    visualGenerate: ['Building your visual'],
    visualRecover: ['Retrying visual generation locally'],
    visualRepair: ['Refining the visual specification'],
    visualValidate: ['Validating the visual'],
    visualRender: ['Rendering your visual'],
    artifactPlan: ['Planning the illustration layout'],
    artifactModel: ['Starting local illustration generation'],
    artifactGenerate: ['Writing illustration shapes, labels and styling'],
    artifactValidate: ['Checking illustration structure'],
    artifactRepair: ['Correcting illustration source'],
    artifactRender: ['Preparing the responsive illustration preview'],
    artifactLayout: ['Checking rendered labels and layout'],
    answerValidate: ['Checking your response'],
    complete: ['Finishing up']
  };
  function profile(prompt, options = {}) {
    if(options.plan?.output==='artifact')return {kind:'visual',labels:['Planning the illustration layout','Preparing illustration generation']};
    if (options.plan?.output === 'creative') return { kind: 'story', labels: ['Understanding your request', 'Shaping your draft', 'Writing your piece', 'Refining the wording'] };
    if (options.plan?.output === 'code') return { kind: 'code', labels: ['Understanding your request', 'Planning the implementation', 'Writing your code'] };
    if (options.plan?.output === 'table') return { kind: 'table', labels: ['Understanding your request', 'Organizing the information', 'Preparing your table'] };
    if (options.visual) return { kind: 'visual', labels: ['Planning your visual', 'Building the visual specification', 'Organizing the visual details'] };
    if (options.intent === 'search') return { kind: 'search', labels: ['Understanding your search request', 'Preparing the search'] };
    if (options.intent === 'action') return { kind: 'action', labels: ['Understanding the task', 'Planning the next action'] };
    const text = String(prompt || '');
    // The requested artifact outranks its subject: an essay about Python is
    // writing work; a poem about bugs is not a debugging task.
    const artifact = text.match(/\b(?:write|draft|compose|create|generate|make|prepare)\s+(?:(?:me|a|an|the|my|your|short|long|detailed|simple|brief|professional|formal|friendly)\s+){0,6}(cover letter|step.by.step guide|study notes|email|e-mail|letter|essay|article|blog|report|story|poem|haiku|lyrics|presentation|slides|table|spreadsheet|csv|resume|cv|outline|notes|tutorial|script|code|function|program)\b/i)?.[1];
    const entry = profiles.find(([, pattern]) => pattern.test(artifact || text));
    const content = artifact?.toLowerCase();
    const messages = content ? entry[2].map(label => /Writing your (?:draft|piece)$/.test(label) ? 'Writing your ' + content : label) : entry[2];
    return { kind: entry[0], labels: messages };
  }
  function labels(prompt, options = {}, phase = 'understand') {
    const selected = profile(prompt, options);
    if (selected.kind === 'greeting' && ['understand', 'context', 'model'].includes(phase)) return ['Thinking'];
    if (phases[phase]) return phases[phase];
    if (phase === 'understand') return selected.kind === 'greeting' ? ['Thinking'] : [selected.labels[0]];
    // Cycling describes ongoing generation, not a fabricated sequence of steps.
    return selected.labels.slice(selected.labels.length > 2 ? 1 : 0);
  }
  function reasoning(text) {
    const value = String(text || '').slice(-1200);
    if (/\b(?:gap|missing|incomplete)\b/i.test(value)) return 'Considering missing details';
    if (/\b(?:compare|tradeoff|alternative|option)\b/i.test(value)) return 'Considering different approaches';
    if (/\b(?:elaborate|explain|clarify)\b/i.test(value)) return 'Developing the explanation';
    if (/\b(?:calculate|equation|formula)\b/i.test(value)) return 'Working through the calculation';
    if (/\b(?:structure|outline|organize)\b/i.test(value)) return 'Organizing the response';
    return 'Thinking through the details';
  }
  function tool(name, args = {}) {
    const norm = String(name || '').toLowerCase();
    const file = String(args.path || args.filename || args.file || args.targetPath || '').split(/[\\/]/).pop().slice(0, 36);
    if (/search/.test(norm)) return /file|local/.test(norm) ? 'Searching local files' : 'Searching the web';
    if (/write|edit|patch|create_file/.test(norm)) return file ? 'Updating ' + file : 'Updating the file';
    if (/read|fetch|extract/.test(norm)) return file ? 'Reading ' + file : /web|url|fetch/.test(norm) ? 'Reading the page' : 'Reading the file';
    if (/list.*(?:dir|file)|directory/.test(norm)) return 'Listing folder contents';
    if (/test/.test(norm)) return 'Running checks';
    if (/command|terminal|bash|exec/.test(norm)) return 'Running a command';
    if (/screenshot|capture|observe/.test(norm)) return 'Inspecting the screen';
    if (/navigate|open_url|browser/.test(norm)) return 'Opening the page';
    if (/click/.test(norm)) return 'Using the selected control';
    if (/type|fill/.test(norm)) return 'Entering text';
    if (/memory|recall/.test(norm)) return 'Recalling conversation context';
    if (/diagram|chart|render/.test(norm)) return 'Rendering the visual';
    if (/skill/.test(norm)) return 'Applying the selected skill';
    return 'Using a tool';
  }
  function skillLabel(skill, prompt = '') {
    const name = String(skill?.name || skill?.id || 'Selected skill').replace(/[\r\n]+/g, ' ').slice(0, 100);
    const purposes = {
      'math-computation': 'calculations', 'mathematical-notation-formulas': 'formatting equations',
      'code-architect-engineer': 'code design and implementation',
      'visual-diagram-chart-creator': 'creating your visual', 'mermaid-diagram-playbook': 'diagram structure',
      'generative-ui-builder': 'building the interface', 'statistical-analysis-charts': 'statistical analysis',
      'spreadsheet-and-csv-analyzer': 'analyzing tabular data', 'tabular-data-presentation': 'organizing your table',
      'definitions-and-terminology': 'explaining terminology', 'deep-thinking-reasoning': 'working through your request',
      'grounded-web-research': 'researching your question'
    };
    return 'Using “' + name + '” for ' + (purposes[skill?.id] || 'this response');
  }
  const api = { profile, labels, reasoning, tool, skillLabel };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownActivityStatus = api;
})(typeof window === 'undefined' ? globalThis : window);
