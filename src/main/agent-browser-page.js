'use strict';

const OPERATIONS = new Set(['observe', 'prepare', 'select', 'extract', 'marker', 'clearMarker']);

function createPageScript(operation, args = {}) {
  if (!OPERATIONS.has(operation)) throw new Error(`Unsupported browser operation: ${operation}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new TypeError('Browser operation arguments must be an object.');
  }
  const serialized = JSON.stringify(args);
  if (serialized === undefined) throw new TypeError('Browser arguments must be JSON serializable.');
  const literal = JSON.stringify(serialized).replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(${pageOperation.toString()})(${JSON.stringify(operation)}, JSON.parse(${literal}))`;
}

function pageOperation(operation, args) {
  'use strict';

  if (!['observe', 'prepare', 'select', 'extract', 'marker', 'clearMarker'].includes(operation)) {
    throw new Error('Unsupported browser operation.');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid browser arguments.');
  if (window !== window.top) throw new Error('Only the main document is supported; frames are unsupported.');

  // This property and its node references live only in the caller's isolated world (1001).
  const key = Symbol.for('brown.agent-browser-page.v1');
  if (!globalThis[key]) {
    Object.defineProperty(globalThis, key, {
      value: { refs: new Map(), observationId: null, url: null, marker: null }
    });
  }
  const state = globalThis[key];
  const roles = new Set([
    'link', 'button', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox',
    'radio', 'switch', 'slider', 'spinbutton', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'tab', 'option', 'treeitem'
  ]);
  const valueRoles = new Set(['textbox', 'searchbox', 'combobox', 'listbox', 'spinbutton', 'slider']);
  const omittedTags = new Set([
    'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'object', 'embed',
    'input', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'output', 'meter', 'progress'
  ]);
  const clean = (value, limit = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const tagOf = node => node.localName.toLowerCase();
  const attr = (node, name) => node.getAttribute(name) || '';
  const explicitRole = node => attr(node, 'role').toLowerCase().split(/\s+/).find(role => roles.has(role)) || '';
  const box = rect => ({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  const positive = rect => rect.width > 0 && rect.height > 0 &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite);

  function editable(node) {
    return node.isContentEditable || ['', 'true', 'plaintext-only'].includes(
      node.hasAttribute('contenteditable') ? attr(node, 'contenteditable').toLowerCase() : 'false'
    );
  }

  function valueContainer(node) {
    for (let current = node; current; current = current.parentElement) {
      if (omittedTags.has(tagOf(current)) || editable(current) || valueRoles.has(explicitRole(current))) return true;
    }
    return false;
  }

  function hidden(node) {
    for (let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement; current; current = current.parentElement) {
      if (current === state.marker?.host || current.hidden || current.hasAttribute('inert') ||
          attr(current, 'aria-hidden').trim().toLowerCase() === 'true') return true;
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          (style.opacity !== '' && Number(style.opacity) === 0) || style.contentVisibility === 'hidden') return true;
      if (tagOf(current) === 'details' && !current.open && current !== node) {
        const summary = Array.from(current.children).find(child => tagOf(child) === 'summary');
        if (!summary || !summary.contains(node)) return true;
      }
    }
    return false;
  }

  function unclipped(rect, node, readable = false) {
    let left = rect.left, top = rect.top, right = rect.right, bottom = rect.bottom;
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      const bounds = current.getBoundingClientRect();
      // Scrollable offscreen targets remain discoverable, but clipped text is not read.
      const clips = readable ? /^(hidden|clip|auto|scroll)$/ : /^(hidden|clip)$/;
      if ((readable || current !== node) && current !== document.body && current !== document.documentElement) {
        if (clips.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (clips.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
      if (style.clip && style.clip !== 'auto') {
        const values = style.clip.match(/-?\d+(?:\.\d+)?px|auto/g);
        if (values?.length === 4) {
          const [t, r, b, l] = values.map(value => value === 'auto' ? null : parseFloat(value));
          if (l !== null) left = Math.max(left, bounds.left + l);
          if (r !== null) right = Math.min(right, bounds.left + r);
          if (t !== null) top = Math.max(top, bounds.top + t);
          if (b !== null) bottom = Math.min(bottom, bounds.top + b);
        }
      }
      if (right <= left || bottom <= top) return false;
    }
    return !readable || (left <= rect.left + 0.5 && top <= rect.top + 0.5 &&
      right >= rect.right - 0.5 && bottom >= rect.bottom - 0.5);
  }

  function visible(node) {
    return !(tagOf(node) === 'input' && node.type === 'hidden') && !hidden(node) &&
      Array.from(node.getClientRects()).some(rect => positive(rect) && unclipped(rect, node));
  }

  function disabled(node) {
    if (node.matches(':disabled')) return true;
    for (let current = node; current; current = current.parentElement) {
      if (current.hasAttribute('inert') || attr(current, 'aria-disabled').trim().toLowerCase() === 'true') return true;
    }
    return false;
  }

  function readText(root, limit = 12000, label = false) {
    if (!root || valueContainer(root) || hidden(root)) return '';
    const excludes = node => omittedTags.has(tagOf(node)) || editable(node) ||
      valueRoles.has(explicitRole(node)) || (!label && (tagOf(node) === 'button' || roles.has(explicitRole(node)) && explicitRole(node) !== 'link'));
    if (excludes(root)) return '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return excludes(node) || hidden(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return hidden(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let result = '';
    for (let node = walker.nextNode(); node && result.length < limit; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      const transparent = color => color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
      if (transparent(style.color) || transparent(style.webkitTextFillColor)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter(positive);
      if (!label && !rects.some(rect => rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)) continue;
      if (!rects.length || !rects.every(rect => unclipped(rect, parent, !label))) continue;
      result += (result ? ' ' : '') + clean(node.textContent, limit - result.length);
    }
    return result.slice(0, limit).trim();
  }

  function labelNodes(node) {
    const ids = attr(node, 'aria-labelledby').trim().split(/\s+/).filter(Boolean);
    return [...ids.map(id => document.getElementById(id)).filter(Boolean), ...Array.from(node.labels || [])];
  }

  function labelFor(node) {
    const referenced = attr(node, 'aria-labelledby').trim().split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)).filter(Boolean);
    const fromNodes = nodes => clean(nodes.map(label => readText(label, 240, true)).join(' '));
    return fromNodes(referenced) || clean(attr(node, 'aria-label')) || fromNodes(Array.from(node.labels || [])) ||
      readText(node, 240, true) || clean(attr(node, 'alt')) || clean(attr(node, 'placeholder')) ||
      clean(attr(node, 'title')) || clean(attr(node, 'name'));
  }

  function roleFor(node) {
    const role = explicitRole(node);
    if (role) return role;
    const tag = tagOf(node);
    if ((tag === 'a' || tag === 'area') && node.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return node.multiple || node.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'textarea' || editable(node)) return 'textbox';
    if (tag !== 'input' || node.type === 'hidden') return '';
    return ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton',
      search: 'searchbox', button: 'button', submit: 'button', reset: 'button', image: 'button',
      file: 'button', color: 'button' })[node.type] || 'textbox';
  }

  function sensitive(node, label) {
    const tag = tagOf(node);
    if (!['input', 'textarea', 'select'].includes(tag) && !editable(node) && !valueRoles.has(explicitRole(node))) return false;
    if (tag === 'input' && ['password', 'file', 'hidden', 'email'].includes(node.type)) return true;
    const form = node.closest('form');
    const context = [label, attr(node, 'name'), attr(node, 'id'), attr(node, 'autocomplete'),
      attr(node, 'aria-label'), attr(node, 'placeholder'), attr(node, 'title'),
      ...labelNodes(node).map(labelNode => labelNode.textContent),
      form ? attr(form, 'id') + ' ' + attr(form, 'name') : ''].join(' ')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ').toLowerCase();
    return /password|passwd|passphrase|secret|credential|token|(?:api|private|access|encryption)\s*key|access\s*code|recovery|backup\s*code|auth|log\s*in|sign\s*in|user\s*name|\buser\b|e\s*mail|one\s*time|\b(?:pass|pwd|otp\d*|totp\d*|[2m]fa\d*|pin\d*|cvv2?|cvc2?|csc|ssn)\b|verification|security\s*(?:code|answer|question)|\bcc\b|credit|debit|card|payment|billing|iban|routing|account|expiry|expiration|social\s*security/.test(context);
  }

  function describe(node) {
    const tag = tagOf(node);
    const label = labelFor(node);
    const rawHref = attr(node, 'href');
    let href = '';
    if (rawHref || node.hasAttribute('href')) {
      try { href = new URL(rawHref, document.baseURI).href; } catch { href = rawHref; }
    }
    return { role: roleFor(node), label, type: typeof node.type === 'string' ? node.type : '',
      tag, href, sensitive: sensitive(node, label) };
  }

  function optionHidden(option) {
    return hidden(option);
  }

  function optionDisabled(option) {
    return option.disabled || (tagOf(option.parentElement) === 'optgroup' && option.parentElement.disabled);
  }

  function fingerprint(node, description) {
    const names = new Set(['id', 'name', 'type', 'href', 'role', 'autocomplete', 'placeholder',
      'title', 'alt', 'contenteditable', 'readonly', 'multiple', 'size', 'form', 'min', 'max', 'step']);
    return JSON.stringify([
      description, node.textContent,
      Array.from(node.attributes).filter(attribute => names.has(attribute.name) || attribute.name.startsWith('aria-'))
        .map(attribute => [attribute.name, attribute.value]).sort((a, b) => a[0].localeCompare(b[0])),
      labelNodes(node).map(label => label.textContent),
      tagOf(node) === 'select' ? Array.from(node.options, option => [option.value, option.label, optionDisabled(option), optionHidden(option)]) : null
    ]);
  }

  function checkObservation() {
    if (state.observationId === null || args.observationId !== state.observationId) {
      throw new Error('Stale or missing observation; observe the page again.');
    }
    if (state.url !== location.href) throw new Error('Stale observation: the page URL changed; observe again.');
  }

  function validate() {
    checkObservation();
    const reference = state.refs.get(args.id);
    if (!reference) throw new Error('Unknown or stale element id; observe the page again.');
    const node = reference.node;
    const check = () => {
      checkObservation();
      if (!node.isConnected || node.ownerDocument !== document || node.getRootNode() !== document) {
        throw new Error('Stale element: the target is disconnected or outside the main document.');
      }
      if (disabled(node)) throw new Error('The target is disabled or inert.');
      if (!visible(node)) throw new Error('The target is not visible.');
      const description = describe(node);
      if (fingerprint(node, description) !== reference.fingerprint) {
        throw new Error('Stale element: its fingerprint changed; observe the page again.');
      }
      return description;
    };
    let description = check();
    const hitTarget = rect => {
      if (!positive(rect)) return false;
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return hit === node || (hit !== null && node.contains(hit));
    };
    let rect = node.getBoundingClientRect();
    if (!hitTarget(rect)) {
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      description = check();
      rect = node.getBoundingClientRect();
    }
    if (!hitTarget(rect)) throw new Error('The target is covered, clipped, or outside the viewport after scrolling (possibly a fixed header).');
    return { node, description, rect: box(rect) };
  }

  if (operation === 'observe') {
    if (!(typeof args.observationId === 'string' && args.observationId.trim()) &&
        !(typeof args.observationId === 'number' && Number.isFinite(args.observationId))) {
      throw new Error('observe requires a nonempty observationId.');
    }
    state.refs.clear();
    state.observationId = args.observationId;
    state.url = location.href;
    const elements = [];
    for (const node of document.querySelectorAll('a[href],area[href],button,input,textarea,select,[contenteditable],[role]')) {
      if (elements.length === 80) break;
      if (['iframe', 'frame', 'object', 'embed'].includes(tagOf(node)) || !roleFor(node) || disabled(node) || !visible(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue;
      const description = describe(node);
      const id = `e${elements.length + 1}`;
      state.refs.set(id, { node, fingerprint: fingerprint(node, description) });
      const element = { id, ...description };
      if (tagOf(node) === 'select' && !description.sensitive) {
        element.options = Array.from(node.options).filter(option => !optionHidden(option)).map(option => ({
          value: option.value, label: clean(option.label), disabled: !!optionDisabled(option)
        }));
      }
      elements.push(element);
    }
    const result = { observationId: state.observationId, url: state.url, title: document.title,
      text: readText(document.body || document.documentElement), elements };
    if (document.querySelector('iframe,frame')) result.note = 'Frames, including cross-origin frames, are unsupported. Only the main document was observed.';
    return result;
  }

  if (operation === 'prepare') {
    const { node, description, rect } = validate();
    const textInput = tagOf(node) === 'textarea' || (tagOf(node) === 'input' &&
      ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(node.type));
    return { id: args.id, ...description, rect,
      editable: !node.readOnly && attr(node, 'aria-readonly').toLowerCase() !== 'true' && (textInput || editable(node)),
      focused: document.activeElement === node,
      select: node instanceof HTMLSelectElement };
  }

  if (operation === 'select') {
    const { node, description } = validate();
    if (description.sensitive) throw new Error('Sensitive fields cannot be selected by page script.');
    if (!(node instanceof HTMLSelectElement)) throw new Error('select requires a visible, enabled native select.');
    if (typeof args.value !== 'string') throw new Error('select requires a string option value.');
    const option = Array.from(node.options).find(candidate => candidate.value === args.value);
    if (!option || optionDisabled(option) || optionHidden(option)) throw new Error('The requested option is missing, hidden, or disabled.');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(node, args.value);
    node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    if (node.value !== args.value) throw new Error('The page changed the selection during input/change.');
    return { selected: args.value };
  }

  if (operation === 'extract') {
    checkObservation();
    const node = args.id === undefined ? document.body || document.documentElement : validate().node;
    return { url: location.href, title: document.title, text: readText(node) };
  }

  if (operation === 'clearMarker') {
    state.marker?.host.remove();
    state.marker = null;
    return { cleared: true };
  }

  if (!['move', 'click', 'read'].includes(args.kind)) throw new Error('Invalid marker kind.');
  const region = args.kind === 'read' ? args.rect : null;
  if (region && (!['x', 'y', 'width', 'height'].every(name => Number.isFinite(region[name])) || region.width <= 0 || region.height <= 0)) {
    throw new Error('The read marker requires a finite, positive viewport rectangle.');
  }
  if (!region && (!Number.isFinite(args.x) || !Number.isFinite(args.y))) throw new Error('The marker requires finite viewport coordinates.');
  if (!state.marker) {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;overflow:visible!important;pointer-events:none!important;z-index:2147483647!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const pointer = document.createElement('div');
    shadow.appendChild(pointer);
    state.marker = { host, pointer };
  }
  const { host, pointer } = state.marker;
  if (!host.isConnected) document.documentElement.appendChild(host);
  const size = args.kind === 'click' ? 28 : args.kind === 'read' ? 32 : 14;
  const color = args.kind === 'read' ? '#d99516' : args.kind === 'click' ? '#8bb8ff' : '#2798ec';
  pointer.style.cssText = `all:initial;box-sizing:border-box;position:fixed;pointer-events:none!important;left:${region ? region.x : args.x}px;top:${region ? region.y : args.y}px;width:${region ? region.width : size}px;height:${region ? region.height : size}px;transform:${region ? 'none' : 'translate(-50%,-50%)'};border:2px solid ${color};border-radius:${region ? '4px' : '50%'};background:transparent;box-shadow:0 0 0 2px #ffffffb3;`;
  return { kind: args.kind };
}

module.exports = { createPageScript };
