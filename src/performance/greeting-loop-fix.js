/**
 * Greeting Loop Prevention System
 * Specifically addresses infinite greeting message loops
 */
(function () {
  'use strict';

  let messageHistory = [];
  let lastMessageTime = 0;
  let greetingCount = 0;
  let isProcessingMessage = false;
  
  const GREETING_PATTERNS = [
    /greetings?[\!\?]?\s+how can i help/i,
    /hello[\!\?]?\s+i['m\s]+ultron/i,
    /howdy[\!\?]?\s+i['m\s]+ultron/i,
    /hi[\!\?]?\s+i['m\s]+ultron/i,
    /g'day[\!\?]?\s+i['m\s]+ultron/i,
    /good\s+(day|morning|afternoon|evening)[\!\?]?\s+i['m\s]+(ready|here)/i,
    /i['m\s]+ultron[\,\.\!\?]?\s+(your|at\s+your|ready|here)/i,
    /how\s+(can|may)\s+i\s+(help|assist|serve)/i
  ];

  const MAX_GREETING_COUNT = 2;
  const MESSAGE_TIMEOUT = 30000; // 30 seconds
  const HISTORY_SIZE = 10;

  /**
   * Check if a message appears to be a greeting
   */
  function isGreetingMessage(text) {
    if (!text || typeof text !== 'string') return false;
    
    const cleanText = text.trim().toLowerCase();
    if (cleanText.length < 10) return false;
    
    return GREETING_PATTERNS.some(pattern => pattern.test(cleanText));
  }

  /**
   * Check if we're in a greeting loop
   */
  function detectGreetingLoop(newMessage) {
    const now = Date.now();
    
    // Clean old messages from history
    messageHistory = messageHistory.filter(msg => now - msg.timestamp < MESSAGE_TIMEOUT);
    
    // Check if this is a greeting
    if (!isGreetingMessage(newMessage)) {
      greetingCount = 0; // Reset if non-greeting message
      return false;
    }
    
    // Add to history
    messageHistory.push({
      text: newMessage,
      timestamp: now,
      isGreeting: true
    });
    
    // Keep history size manageable
    if (messageHistory.length > HISTORY_SIZE) {
      messageHistory.shift();
    }
    
    // Count recent greetings
    const recentGreetings = messageHistory.filter(msg => 
      msg.isGreeting && (now - msg.timestamp) < 10000 // Last 10 seconds
    );
    
    greetingCount = recentGreetings.length;
    
    console.log(`[Greeting Loop] Detected ${greetingCount} greetings in recent history`);
    
    return greetingCount > MAX_GREETING_COUNT;
  }

  /**
   * Prevent message processing if in loop
   */
  function interceptMessageProcessing() {
    // Find and wrap message sending functions
    const originalSendFunctions = [];
    
    // Intercept runAgenticLoop if it exists
    if (typeof window.runAgenticLoop === 'function' && !window.runAgenticLoop._greetingLoopWrapped) {
      const originalRunAgenticLoop = window.runAgenticLoop;
      
      window.runAgenticLoop = async function(userPrompt, aiBubble, intent, imagePayloads) {
        // Check for processing flag
        if (isProcessingMessage) {
          console.warn('[Greeting Loop] Message processing already in progress, ignoring');
          return {
            content: 'Please wait, I\'m still processing your previous message.',
            type: 'busy'
          };
        }
        
        // Check for greeting loop
        if (detectGreetingLoop(userPrompt)) {
          console.error('[Greeting Loop] Infinite greeting loop detected! Blocking execution.');
          
          // Show user-friendly message
          if (aiBubble && typeof renderMessageContent === 'function') {
            renderMessageContent(aiBubble, `
              <div class="error-message">
                <h4>🔄 Loop Detection</h4>
                <p>I detected that I'm repeating greeting messages. This is likely a system error.</p>
                <p><strong>Please try:</strong></p>
                <ul>
                  <li>Refresh the page (Ctrl+R)</li>
                  <li>Restart the Ultron application</li>
                  <li>Clear your message and try typing a specific question</li>
                </ul>
                <p>I apologize for this technical issue.</p>
              </div>
            `);
          }
          
          // Reset counters after a delay
          setTimeout(() => {
            greetingCount = 0;
            messageHistory = [];
            isProcessingMessage = false;
            console.log('[Greeting Loop] System reset completed');
          }, 5000);
          
          return {
            content: 'Loop detected - system reset in progress',
            type: 'loop_error'
          };
        }
        
        // Mark as processing
        isProcessingMessage = true;
        lastMessageTime = Date.now();
        
        try {
          const result = await originalRunAgenticLoop.call(this, userPrompt, aiBubble, intent, imagePayloads);
          return result;
        } finally {
          isProcessingMessage = false;
        }
      };
      
      window.runAgenticLoop._greetingLoopWrapped = true;
      console.log('[Greeting Loop] ✓ Wrapped runAgenticLoop with greeting loop detection');
    }
    
    // Intercept button clicks
    const sendButton = document.getElementById('btn-send');
    if (sendButton && !sendButton._greetingLoopWrapped) {
      const originalClick = sendButton.onclick;
      
      sendButton.addEventListener('click', function(e) {
        if (greetingCount > MAX_GREETING_COUNT) {
          e.preventDefault();
          e.stopPropagation();
          
          console.warn('[Greeting Loop] Send button blocked due to greeting loop');
          
          // Show alert to user
          if (typeof showNotification === 'function') {
            showNotification('Please refresh the page - detected infinite message loop', 'error');
          } else {
            alert('Please refresh the page (Ctrl+R) - system detected a message loop.');
          }
          
          return false;
        }
      }, true); // Use capture phase
      
      sendButton._greetingLoopWrapped = true;
      console.log('[Greeting Loop] ✓ Wrapped send button with loop protection');
    }
  }

  /**
   * Monitor system for continuous activity
   */
  function startMonitoring() {
    setInterval(() => {
      const now = Date.now();
      
      // Check for stuck processing
      if (isProcessingMessage && (now - lastMessageTime) > MESSAGE_TIMEOUT) {
        console.warn('[Greeting Loop] Processing timeout detected, resetting...');
        isProcessingMessage = false;
        greetingCount = 0;
      }
      
      // Log status if there's unusual activity
      if (greetingCount > 0 || messageHistory.length > 3) {
        console.log(`[Greeting Loop] Status: ${greetingCount} greetings, ${messageHistory.length} messages in history, processing: ${isProcessingMessage}`);
      }
    }, 5000);
  }

  /**
   * Emergency reset function
   */
  function emergencyReset() {
    console.log('[Greeting Loop] Emergency reset triggered');
    
    messageHistory = [];
    greetingCount = 0;
    isProcessingMessage = false;
    lastMessageTime = 0;
    
    // Remove any stuck "thinking" indicators
    const thinkingElements = document.querySelectorAll('.thinking-container, .thinking-dot-wrapper');
    thinkingElements.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // Re-enable send button
    const sendButton = document.getElementById('btn-send');
    if (sendButton) {
      sendButton.disabled = false;
    }
    
    // Show user message
    if (typeof showNotification === 'function') {
      showNotification('System reset - ready for new messages', 'success');
    }
    
    console.log('[Greeting Loop] Emergency reset completed');
  }

  /**
   * Initialize the greeting loop prevention system
   */
  function initialize() {
    console.log('[Greeting Loop] Initializing greeting loop prevention...');
    
    interceptMessageProcessing();
    startMonitoring();
    
    // Add emergency reset hotkey (Ctrl+Shift+R)
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        emergencyReset();
      }
    });
    
    // Add emergency reset to window for debugging
    window.ultronEmergencyReset = emergencyReset;
    
    console.log('[Greeting Loop] ✓ Greeting loop prevention initialized');
    console.log('[Greeting Loop] Emergency reset: Ctrl+Shift+R or call window.ultronEmergencyReset()');
  }

  /**
   * Public API
   */
  window.UltronGreetingLoopFix = {
    initialize,
    emergencyReset,
    detectGreetingLoop,
    getStatus: () => ({
      greetingCount,
      messageHistory: messageHistory.length,
      isProcessingMessage,
      lastMessageTime: lastMessageTime ? new Date(lastMessageTime).toISOString() : null
    }),
    
    // Manual controls
    reset: () => {
      messageHistory = [];
      greetingCount = 0;
      isProcessingMessage = false;
    },
    
    // Configuration
    setMaxGreetings: (count) => {
      if (typeof count === 'number' && count > 0) {
        MAX_GREETING_COUNT = count;
        console.log(`[Greeting Loop] Max greetings set to ${count}`);
      }
    }
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100);
  }

})();