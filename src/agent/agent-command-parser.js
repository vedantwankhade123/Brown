/**
 * Vayu-style deterministic command parser — no LLM for simple open/type/send commands.
 */
(function () {
  const OPEN_PREFIX = /^open\s+/i;

  const APP_ALIASES = {
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    discord: 'Discord',
    notepad: 'Notepad',
    chrome: 'Google Chrome',
    'google chrome': 'Google Chrome',
    edge: 'Microsoft Edge',
    'microsoft edge': 'Microsoft Edge',
    vscode: 'Visual Studio Code',
    'vs code': 'Visual Studio Code',
    'visual studio code': 'Visual Studio Code',
    slack: 'Slack',
    teams: 'Microsoft Teams',
    outlook: 'Outlook',
    spotify: 'Spotify'
  };

  function normalizeSpaces(text) {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeCommandTypos(text) {
    return String(text || '')
      .replace(/\bmessafe\b/gi, 'message')
      .replace(/\bmesage\b/gi, 'message')
      .replace(/\bmessge\b/gi, 'message');
  }

  function resolveAppName(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (APP_ALIASES[lower]) return APP_ALIASES[lower];
    for (const [alias, name] of Object.entries(APP_ALIASES)) {
      if (lower === alias || lower.endsWith(alias) || lower.startsWith(alias)) {
        return name;
      }
    }
    return trimmed.replace(/\b\w/g, c => c.toUpperCase()).replace(/\bWhatsapp\b/i, 'WhatsApp');
  }

  function parseWriteInApp(text) {
    const original = normalizeSpaces(normalizeCommandTypos(text));
    const match = original.match(/\b(write|type)\s+(.+?)\s+in\s+(.+?)(?:\s*$|\s+for\b)/i);
    if (!match) return null;
    const typeText = match[2].trim();
    const appName = resolveAppName(match[3].trim());
    if (!typeText || !appName) return null;
    return { appName, typeText };
  }

  function parseOpenAndSendMessage(text) {
    const original = normalizeSpaces(normalizeCommandTypos(text));
    const openSend = original.match(/^open\s+(.+?)\s+and\s+(?:send|message)\s+(.+)$/i);
    if (!openSend) return null;

    const appName = resolveAppName(openSend[1].trim());
    let sendPart = openSend[2].trim();

    sendPart = sendPart.replace(/^(?:a\s+)?(?:message\s+)?(?:(?:named|called|saying)\s+)?/i, '');

    const quoted = sendPart.match(/^"([^"]+)"\s+to\s+(.+)$/i)
      || sendPart.match(/^'([^']+)'\s+to\s+(.+)$/i);
    if (quoted) {
      return { appName, messageText: quoted[1].trim(), recipient: quoted[2].trim() };
    }

    const plain = sendPart.match(/^(\S+)\s+to\s+(.+)$/i);
    if (plain) {
      return { appName, messageText: plain[1].trim(), recipient: plain[2].trim() };
    }

    return null;
  }

  function buildMessagingSequence(appName, recipient, messageText) {
    const isChatApp = /\b(whatsapp|telegram|discord|slack|teams|messenger)\b/i.test(appName);
    const actions = [
      { action: 'OPEN_APP', appName, target: appName },
      { action: 'WAIT', ms: isChatApp ? 2800 : 1200, target: isChatApp ? '2800ms' : '1200ms' }
    ];

    if (isChatApp) {
      actions.push(
        { action: 'HOTKEY', keys: 'Ctrl+F', appName, target: 'Ctrl+F' },
        { action: 'WAIT', ms: 500, target: '500ms' },
        { action: 'TYPE_TEXT', text: recipient, appName, target: appName },
        { action: 'WAIT', ms: 700, target: '700ms' },
        { action: 'HOTKEY', keys: 'Enter', appName, target: 'Enter' },
        { action: 'WAIT', ms: 900, target: '900ms' }
      );
    }

    actions.push(
      { action: 'TYPE_TEXT', text: messageText, appName, target: appName },
      { action: 'WAIT', ms: 400, target: '400ms' },
      { action: 'HOTKEY', keys: 'Enter', appName, target: 'Enter' }
    );

    return {
      type: 'APP_SEQUENCE',
      target: `${appName} → message "${messageText}" to ${recipient}`,
      actions,
      _parsedBy: 'rule'
    };
  }

  function parseOpenApp(text) {
    const normalized = normalizeSpaces(normalizeCommandTypos(text)).toLowerCase();
    if (!OPEN_PREFIX.test(normalized)) return null;

    const original = normalizeSpaces(normalizeCommandTypos(text));
    const afterOpen = original.replace(/^open\s+/i, '');
    const lowerAfter = afterOpen.toLowerCase();

    let appPart = afterOpen;
    let typeText = null;

    const andActionMatch = lowerAfter.match(/\s+\band\s+(send|message|write|type|compose|text)\b/i);
    if (andActionMatch) {
      appPart = afterOpen.slice(0, andActionMatch.index).trim();
      if (/^(send|message)$/i.test(andActionMatch[1])) {
        return null;
      }
    }

    const connectorMatch = lowerAfter.match(/\b(and|then)\s+(write|type)\s+/i);
    if (connectorMatch) {
      const idx = lowerAfter.indexOf(connectorMatch[0]);
      appPart = afterOpen.slice(0, idx).trim();
      typeText = afterOpen.slice(idx + connectorMatch[0].length).trim();
    }

    if (!appPart) return null;

    return {
      appName: resolveAppName(appPart.replace(/\s+/g, ' ')),
      typeText: typeText || null
    };
  }

  function tryParseToToolCall(prompt) {
    const p = normalizeSpaces(normalizeCommandTypos(prompt));
    if (!p) return null;

    if (/^show\s+logs?$/i.test(p)) {
      return { type: 'EXECUTE', target: 'Get-Content -Tail 40 "$env:USERPROFILE\\Ultron-local\\logs\\ultron.log" -ErrorAction SilentlyContinue', _parsedBy: 'rule' };
    }

    const sendMsg = parseOpenAndSendMessage(p);
    if (sendMsg && sendMsg.appName && sendMsg.messageText && sendMsg.recipient) {
      return buildMessagingSequence(sendMsg.appName, sendMsg.recipient, sendMsg.messageText);
    }

    const writeIn = parseWriteInApp(p);
    if (writeIn) {
      return {
        type: 'APP_SEQUENCE',
        actions: [
          { action: 'OPEN_APP', appName: writeIn.appName, target: writeIn.appName },
          { action: 'WAIT', ms: 1000, target: '1000ms' },
          { action: 'TYPE_TEXT', appName: writeIn.appName, target: writeIn.appName, text: writeIn.typeText }
        ],
        _parsedBy: 'rule'
      };
    }

    const open = parseOpenApp(p);
    if (!open) return null;

    if (open.typeText) {
      return {
        type: 'APP_SEQUENCE',
        actions: [
          { action: 'OPEN_APP', appName: open.appName, target: open.appName },
          { action: 'WAIT', ms: 1000, target: '1000ms' },
          { action: 'TYPE_TEXT', appName: open.appName, target: open.appName, text: open.typeText }
        ],
        _parsedBy: 'rule'
      };
    }

    return {
      type: 'APP_ACTION',
      action: 'OPEN_APP',
      appName: open.appName,
      target: open.appName,
      _parsedBy: 'rule'
    };
  }

  function canUseRuleParser(prompt) {
    const p = normalizeSpaces(normalizeCommandTypos(prompt)).toLowerCase();
    if (OPEN_PREFIX.test(p)) return true;
    if (/^show\s+logs?$/i.test(p)) return true;
    if (/\b(write|type)\s+.+\s+in\s+/i.test(p)) return true;
    return false;
  }

  window.UltronCommandParser = {
    tryParseToToolCall,
    canUseRuleParser,
    parseOpenApp,
    parseOpenAndSendMessage,
    normalizeCommandTypos,
    resolveAppName
  };
})();
