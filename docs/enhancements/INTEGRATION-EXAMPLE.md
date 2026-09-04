# Integration Example: Enhanced Agent with Existing Renderer

This example shows how to integrate the enhanced AI capabilities with the existing `renderer.js` file.

## Step 1: Load the New Scripts

Add these script tags to `index.html` before the closing `</body>` tag:

```html
<!-- Enhanced AI Agent Scripts -->
<script src="../agent/agent-thinking.js"></script>
<script src="../agent/agent-autonomy-engine.js"></script>
<script src="../agent/agent-response-formatter.js"></script>
<script src="../agent/agent-integration.js"></script>
```

## Step 2: Modify runAgenticLoop Function

In `renderer.js`, find the `runAgenticLoop` function and enhance it:

### Original Code (simplified):

```javascript
async function runAgenticLoop(userMessage, options = {}) {
  // ... existing code ...
  const response = await queryProvider(model, prompt, options);
  // ... existing code ...
  return response;
}
```

### Enhanced Version:

```javascript
async function runAgenticLoop(userMessage, options = {}) {
  // Check if enhanced mode is enabled
  const useEnhancedMode = window.UltronAgentIntegration && 
                          window.UltronAgentIntegration.isEnabled() &&
                          window.localStorage.getItem('ultron-enhanced-mode') !== 'false';

  if (useEnhancedMode) {
    // Use enhanced pipeline
    try {
      const pipeline = await window.UltronAgentIntegration.processWithEnhancedPipeline(
        userMessage,
        {
          ...options,
          conversationHistory,
          currentModel: activeModel,
          canCaptureScreen: true
        }
      );

      // Return the formatted response
      return pipeline.formattedResponse || pipeline.response;
    } catch (error) {
      console.error('[Enhanced Agent] Error, falling back to standard:', error);
      // Fall through to standard execution
    }
  }

  // Standard execution (existing code)
  // ... existing code ...
  const response = await queryProvider(model, prompt, options);
  // ... existing code ...
  return response;
}
```

## Step 3: Add UI Toggle for Enhanced Mode

Add a toggle in the settings panel:

```html
<!-- In settings panel -->
<div class="settings-section">
  <h3>AI Enhancement</h3>
  <div class="setting-item">
    <label>
      <input type="checkbox" id="toggle-enhanced-mode" checked>
      Enable Enhanced AI (Thinking, Autonomy)
    </label>
    <p class="setting-description">
      Enables ChatGPT/Claude-like thinking process and autonomous execution
    </p>
  </div>
  
  <div class="setting-item">
    <label>
      <input type="checkbox" id="toggle-show-thinking" checked>
      Show Thinking Process
    </label>
    <p class="setting-description">
      Display the AI's reasoning before responses
    </p>
  </div>
</div>
```

Add the JavaScript handler:

```javascript
// In renderer.js setup
const toggleEnhancedMode = document.getElementById('toggle-enhanced-mode');
const toggleShowThinking = document.getElementById('toggle-show-thinking');

if (toggleEnhancedMode) {
  toggleEnhancedMode.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    window.localStorage.setItem('ultron-enhanced-mode', enabled);
    
    if (window.UltronAgentIntegration) {
      window.UltronAgentIntegration.toggleEnhancedMode(enabled);
    }
    
    console.log(`Enhanced mode ${enabled ? 'enabled' : 'disabled'}`);
  });
  
  // Set initial state
  toggleEnhancedMode.checked = window.localStorage.getItem('ultron-enhanced-mode') !== 'false';
}

if (toggleShowThinking) {
  toggleShowThinking.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    
    if (window.UltronResponseFormatter) {
      window.UltronResponseFormatter.showThinking(enabled);
    }
  });
  
  // Set initial state
  toggleShowThinking.checked = true;
}
```

## Step 4: Update Response Rendering

Modify how responses are displayed in the chat:

```javascript
function addMessageToChat(role, content, options = {}) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role}`;
  
  // Check if this is an enhanced response with thinking
  if (role === 'assistant' && options.thinking && window.UltronResponseFormatter) {
    // Format with thinking section
    const formattedContent = window.UltronResponseFormatter.formatAgentResponse(
      content,
      {
        thinking: options.thinking,
        executionSteps: options.executionSteps || [],
        verification: options.verification,
        isComplete: true
      }
    );
    
    messageDiv.innerHTML = `
      <div class="message-content enhanced-response">
        ${formattedContent}
      </div>
    `;
  } else {
    // Standard message rendering
    messageDiv.innerHTML = `
      <div class="message-content">
        ${escapeHtml(content)}
      </div>
    `;
  }
  
  chatMessagesContainer.appendChild(messageDiv);
  scrollToBottom();
}
```

## Step 5: Show Progress Updates

Add real-time progress updates during execution:

```javascript
// Create progress display element
function createProgressIndicator() {
  const progressDiv = document.createElement('div');
  progressDiv.className = 'agent-progress-indicator';
  progressDiv.innerHTML = `
    <div class="progress-spinner"></div>
    <div class="progress-message">Analyzing your request...</div>
  `;
  return progressDiv;
}

// Update progress message
function updateProgressMessage(message) {
  const progressDiv = document.querySelector('.agent-progress-indicator .progress-message');
  if (progressDiv) {
    progressDiv.textContent = message;
  }
}

// Listen for thinking updates
window.addEventListener('ultron-thinking-update', (event) => {
  updateProgressMessage(event.detail.message);
});

// Example progress messages
const progressMessages = {
  'understanding': '💭 Understanding your request...',
  'analyzing': '🔍 Analyzing requirements...',
  'checking': '🛠️ Checking capabilities...',
  'planning': '📊 Creating execution plan...',
  'executing': '⚡ Executing task...',
  'verifying': '✓ Verifying results...'
};
```

## Step 6: Complete Example - Enhanced sendMessage

Here's a complete example of an enhanced `sendMessage` function:

```javascript
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || isAwaitingResponse) return;

  // Add user message
  addMessageToChat('user', message);
  chatInput.value = '';
  
  isAwaitingResponse = true;
  updateUIForResponse(true);

  // Create progress indicator
  const progressIndicator = createProgressIndicator();
  chatMessagesContainer.appendChild(progressIndicator);

  try {
    // Run agent loop (enhanced or standard)
    const response = await runAgenticLoop(message, {
      conversationHistory: getConversationHistory(),
      model: activeModel,
      onProgress: (msg) => updateProgressMessage(msg)
    });

    // Remove progress indicator
    progressIndicator.remove();

    // Add AI response
    addMessageToChat('assistant', response);

    // Save to conversation history
    saveConversation();

  } catch (error) {
    progressIndicator.remove();
    addMessageToChat('assistant', `Error: ${error.message}`);
    console.error('Send message error:', error);
  } finally {
    isAwaitingResponse = false;
    updateUIForResponse(false);
  }
}
```

## Step 7: Add CSS for Enhanced UI

Add to your CSS file:

```css
/* Enhanced Response Styles */
.enhanced-response {
  line-height: 1.6;
}

.thinking-section {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #2a2a4e;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.thinking-header {
  cursor: pointer;
  color: #a0a0ff;
  font-weight: 500;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(100, 100, 150, 0.1);
  border-radius: 4px;
  margin: 8px 0;
}

.progress-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(150, 150, 255, 0.3);
  border-top-color: #a0a0ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Progress Steps */
.progress-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.step-completed {
  opacity: 0.7;
}

.step-active {
  font-weight: 500;
  color: #7dd3fc;
}
```

## Verification

To verify the integration is working:

1. Open browser console
2. Run: `UltronAgentIntegration.getStatus()`
3. Should see:
```javascript
{
  initialized: true,
  thinkingEnabled: true,
  autonomyEnabled: true,
  formattingEnabled: true,
  enhancedMode: true,
  thinkingAvailable: true,
  autonomyAvailable: true,
  formattingAvailable: true
}
```

4. Run a test: `demoEnhancedAgent("Open Notepad")`
5. Should see thinking process and formatted response

## Benefits

- **Backward Compatible**: Existing functionality preserved
- **Opt-in**: Can be toggled on/off
- **Progressive Enhancement**: Falls back gracefully
- **User Control**: Toggleable features
- **Transparent**: Shows reasoning to users

## Notes

- The enhanced agent initializes automatically
- All existing code continues to work
- New features are additive, not replacement
- Users can disable via settings if needed
- Performance impact is minimal for simple queries
