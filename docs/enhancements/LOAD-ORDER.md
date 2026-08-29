# Script Load Order - Correct Initialization

## Critical: Load Scripts in This Exact Order

To ensure everything works correctly, add these scripts to your `index.html` in this order:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Ultron AI</title>
  <!-- ... other head content ... -->
</head>
<body>
  
  <!-- Your app HTML here -->
  
  <!-- ULTRON CORE SCRIPTS - Load First -->
  <script src="../agent/tool-schema.js"></script>
  <script src="../agent/agent-policy.js"></script>
  <script src="../agent/agent-loop-guard.js"></script>
  <script src="../agent/agent-skills.js"></script>
  <script src="../agent/agent-mcp-tools.js"></script>
  
  <!-- GPU CONFIGURATION - Load Before Provider Hub -->
  <script src="../config/gpu-config.js"></script>
  
  <!-- MODEL PROVIDER HUB - Load After GPU Config -->
  <script src="../agent/multi-provider-hub.js"></script>
  
  <!-- ENHANCED AI FEATURES (OPTIONAL - for thinking/autonomy) -->
  <script src="../agent/agent-thinking.js"></script>
  <script src="../agent/agent-autonomy-engine.js"></script>
  <script src="../agent/agent-response-formatter.js"></script>
  <script src="../agent/agent-integration.js"></script>
  
  <!-- AGENT CORE - Load After Everything Else -->
  <script src="../agent/agent-prompt.js"></script>
  <script src="../agent/agent-planner.js"></script>
  <script src="../agent/agent-executor.js"></script>
  
  <!-- YOUR RENDERER/MAIN APP - Load Last -->
  <script src="renderer.js"></script>
  
</body>
</html>
```

## Why This Order Matters

### 1. **Core Tools First** (`tool-schema.js`, `agent-policy.js`, etc.)
- Provides basic infrastructure
- Other modules depend on these

### 2. **GPU Config Second** (`gpu-config.js`)
- Detects GPU before model loading
- Configures acceleration parameters
- Must load before `multi-provider-hub.js`

### 3. **Provider Hub Third** (`multi-provider-hub.js`)
- Uses GPU config from previous step
- Provides model inference for other modules

### 4. **Enhanced Features Optional** (thinking, autonomy, etc.)
- Can be omitted if you don't want enhanced features
- Loads in parallel, order within group doesn't matter
- **Note**: These are disabled by default for performance

### 5. **Agent Core Next** (`agent-prompt.js`, `agent-planner.js`, `agent-executor.js`)
- Uses all previous modules
- Orchestrates execution

### 6. **Your App Last** (`renderer.js`)
- Uses everything above
- Can override defaults if needed

## Minimal Setup (Fast & Simple)

If you want the fastest setup without enhanced features:

```html
<!-- Minimal - Just Core Functionality -->
<script src="../config/gpu-config.js"></script>
<script src="../agent/multi-provider-hub.js"></script>
<script src="../agent/agent-executor.js"></script>
<script src="renderer.js"></script>
```

## Full Setup (All Features)

For complete functionality with thinking, autonomy, and formatting:

```html
<!-- Full - All Features -->
<script src="../agent/tool-schema.js"></script>
<script src="../agent/agent-policy.js"></script>
<script src="../agent/agent-loop-guard.js"></script>
<script src="../agent/agent-skills.js"></script>
<script src="../agent/agent-mcp-tools.js"></script>
<script src="../config/gpu-config.js"></script>
<script src="../agent/multi-provider-hub.js"></script>
<script src="../agent/agent-thinking.js"></script>
<script src="../agent/agent-autonomy-engine.js"></script>
<script src="../agent/agent-response-formatter.js"></script>
<script src="../agent/agent-integration.js"></script>
<script src="../agent/agent-prompt.js"></script>
<script src="../agent/agent-planner.js"></script>
<script src="../agent/agent-executor.js"></script>
<script src="renderer.js"></script>
```

## Verification

After loading, check in console:

```javascript
// Check GPU config loaded
console.log(window.UltronGPUConfig ? '✓ GPU Config' : '✗ GPU Config');

// Check provider hub loaded
console.log(window.UltronMultiProviderHub ? '✓ Provider Hub' : '✗ Provider Hub');

// Check enhanced features (optional)
console.log(window.UltronThinkingEngine ? '✓ Thinking' : '- Thinking (optional)');
console.log(window.UltronAutonomyEngine ? '✓ Autonomy' : '- Autonomy (optional)');
console.log(window.UltronResponseFormatter ? '✓ Formatter' : '- Formatter (optional)');
console.log(window.UltronAgentIntegration ? '✓ Integration' : '- Integration (optional)');

// Check agent core loaded
console.log(window.UltronAgentExecutor ? '✓ Agent Executor' : '✗ Agent Executor');
```

## Common Issues

### "UltronGPUConfig is not defined"
**Solution**: Load `gpu-config.js` before `multi-provider-hub.js`

### "UltronMultiProviderHub is not defined"
**Solution**: Load `multi-provider-hub.js` before other agent files

### "Thinking stuck / not responding"
**Solution**: Make sure `agent-integration.js` is loaded (it has the fixes)

### "GPU not being used"
**Solution**: 
1. Verify `gpu-config.js` loaded first
2. Check console for GPU detection: `await UltronGPUConfig.detectGPU()`

## Performance Tips

### For Best Performance:
1. ✅ Load `gpu-config.js` first
2. ✅ Skip enhanced features if you don't need them
3. ✅ Use minimal setup for production
4. ✅ Use full setup for development/testing

### For Best Features:
1. ✅ Load all scripts
2. ✅ Enable thinking when needed: `UltronAgentIntegration.toggleEnhancedMode(true)`
3. ✅ Use full setup

## Quick Test

After loading all scripts, run in console:

```javascript
// Test immediate response (no thinking)
async function testQuick() {
  const pipeline = await UltronAgentIntegration.processWithEnhancedPipeline(
    "What is 2+2?",
    { model: 'llama3.2' }
  );
  console.log('Response:', pipeline.formattedResponse);
}

testQuick();
// Should respond immediately with "4"
```

---

**Remember**: GPU config MUST load before provider hub for acceleration to work!
