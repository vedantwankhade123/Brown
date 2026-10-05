const { resolveFileTarget, createDirectory } = require('./file-targets');
/**
 * Agent Harness MCP Adapter
 * Bridges @modelcontextprotocol/sdk servers into Vercel AI SDK Core (ai + zod) tools.
 * 100% Offline-capable, sandboxed, and lightweight.
 */
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const mcpManager = require('./mcp-manager');

/**
 * Sanitizes a tool identifier into a valid function name matching /^[a-zA-Z0-9_]+$/
 */
function sanitizeToolName(serverId, toolName) {
  const cleanServer = String(serverId || 'mcp').replace(/[^a-zA-Z0-9_]/g, '_');
  const cleanTool = String(toolName || 'tool').replace(/[^a-zA-Z0-9_]/g, '_');
  return `mcp__${cleanServer}__${cleanTool}`;
}

/**
 * Converts MCP tools into Vercel AI SDK tools
 * @param {Object} options
 * @returns {Promise<{ tools: Record<string, any>, toolMetadata: Map<string, any> }>}
 */
async function buildVercelMcpTools(options = {}) {
  const { tool, jsonSchema } = await import('ai');
  const tools = {};
  const toolMetadata = new Map();

  // 1. Gather MCP servers and their available tools
  try {
    const status = mcpManager.getMcpStatus();
    const connectedServers = status?.connected || [];

    for (const serverId of connectedServers) {
      const registry = mcpManager.getMcpRegistry();
      const serverEntry = [...(registry.catalog || []), ...(registry.custom || [])].find(s => s.id === serverId);
      const serverTools = serverEntry?.tools || [];

      for (const t of serverTools) {
        const toolName = typeof t === 'string' ? t : t.name;
        if (!toolName) continue;

        const aiToolName = sanitizeToolName(serverId, toolName);
        const description = (typeof t === 'object' && t.description)
          ? `[${serverId}] ${t.description}`
          : `MCP tool "${toolName}" provided by server "${serverId}".`;

        // If the MCP server provides an input schema, map it directly with jsonSchema
        let parameters;
        if (typeof t === 'object' && t.inputSchema && typeof t.inputSchema === 'object') {
          parameters = jsonSchema(t.inputSchema);
        } else {
          parameters = z.record(z.any()).describe('Tool arguments');
        }

        tools[aiToolName] = tool({
          description,
          inputSchema: parameters,
          execute: async (args) => {
            try {
              const res = await mcpManager.callMcpTool(serverId, toolName, args || {});
              return {
                success: res?.success !== false,
                output: res?.text || JSON.stringify(res?.raw || 'Execution completed.')
              };
            } catch (err) {
              return {
                success: false,
                error: err.message || `Failed to execute MCP tool ${toolName}`
              };
            }
          }
        });

        toolMetadata.set(aiToolName, {
          serverId,
          originalName: toolName,
          description
        });
      }
    }
  } catch (err) {
    console.warn('[agent-harness-mcp] Failed to load MCP tools:', err.message);
  }

  // 2. Add native core desktop tools for safety & offline autonomy
  // A. Local File Reader (safe fallback)
  tools.system__read_file = tool({
    description: 'Read file contents from local disk inside the active workspace.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute or relative file path to read')
    }),
    execute: async ({ filePath }) => {
      try {
        const resolved = resolveFileTarget(filePath);
        if (!fs.existsSync(resolved)) {
          return { success: false, error: `File not found: ${filePath}` };
        }
        const stat = fs.statSync(resolved);
        if (stat.size > 2 * 1024 * 1024) {
          return { success: false, error: 'File exceeds 2 MB safety limit.' };
        }
        const content = fs.readFileSync(resolved, 'utf8');
        return { success: true, content, filePath: resolved };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  });

  // B. Local File Writer (safe fallback)
  tools.system__write_file = tool({
    description: 'Create or overwrite a file on local disk with specified content.',
    inputSchema: z.object({
      filePath: z.string().describe('Target file path'),
      content: z.string().describe('File content to write')
    }),
    execute: async ({ filePath, content }) => {
      try {
        const resolved = resolveFileTarget(filePath);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf8');
        if (fs.readFileSync(resolved, 'utf8') !== content) throw new Error('Write verification failed.');
        return { success: true, path: resolved, filePath: resolved, verified: true, message: `Wrote and verified ${resolved}` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  });

  // C. Local Directory Listing
  tools.system__list_dir = tool({
    description: 'List contents of a directory on local disk.',
    inputSchema: z.object({
      dirPath: z.string().default('.').describe('Directory path to inspect')
    }),
    execute: async ({ dirPath = '.' }) => {
      try {
        const resolved = resolveFileTarget(dirPath);
        if (!fs.existsSync(resolved)) {
          return { success: false, error: `Directory not found: ${dirPath}` };
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file'
        }));
        return { success: true, dirPath: resolved, items };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  });

  // D. Native Web Search Tool (Model-driven, only when AI requests it)
  tools.system__web_search = tool({
    description: 'Search the web for up-to-date facts, current events, documentation, or online information.',
    inputSchema: z.object({
      query: z.string().describe('The web search query string')
    }),
    execute: async ({ query }) => {
      try {
        const clean = String(query || '').trim();
        if (!clean) return { success: false, error: 'Empty query' };

        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(clean)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          const abstract = data.AbstractText || '';
          const related = (data.RelatedTopics || [])
            .map(t => t.Text)
            .filter(Boolean)
            .slice(0, 3)
            .join('\n');
          const summary = abstract || related || 'Search completed successfully.';
          return { success: true, query: clean, summary, sourceUrl: data.AbstractURL || '' };
        }
        return { success: true, query: clean, message: 'Web search completed.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  toolMetadata.set('system__web_search', {
    serverId: 'system',
    originalName: 'web_search',
    description: 'Search the web for up-to-date information or documentation.'
  });

  tools.system__create_folder = tool({
    description: 'Create a folder at an exact absolute path, then verify it exists.',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path: target }) => { try { return createDirectory(target); } catch (error) { return { success: false, error: error.message }; } }
  });
  // All external MCP calls and native file mutations require explicit approval.
  for (const [name, definition] of Object.entries(tools)) {
    if (['system__read_file', 'system__write_file', 'system__list_dir', 'system__create_folder'].includes(name)) {
      const original = definition.execute;
      definition.execute = async (args, context) => {
        try {
          const field = args.filePath != null ? 'filePath' : args.dirPath != null ? 'dirPath' : 'path';
          args = { ...args, [field]: resolveFileTarget(args[field]) };
          if (options.abortSignal?.aborted) return { success: false, error: 'Task stopped.' };
          if (options.requestApproval) {
            const type = name === 'system__write_file' ? 'WRITE_FILE' : name === 'system__create_folder' ? 'CREATE_FOLDER' : name === 'system__read_file' ? 'READ_FILE' : 'LIST_DIR';
            if (!await options.requestApproval({ type, target: args[field], path: args[field], content: args.content, onceOnly: true })) return { success: false, error: 'Permission declined.' };
          }
          if (options.abortSignal?.aborted) return { success: false, error: 'Task stopped.' };
          return original(args, context);
        } catch (error) { return { success: false, error: error.message }; }
      };
    } else if (name.startsWith('mcp__') && options.requestApproval) {
      const original = definition.execute;
      definition.execute = async (args, context) => {
        if (options.abortSignal?.aborted || !await options.requestApproval({ type: 'MCP_ACTION', action: name, target: JSON.stringify(args), onceOnly: true })) return { success: false, error: 'Permission declined or task stopped.' };
        if (options.abortSignal?.aborted) return { success: false, error: 'Task stopped.' };
        return original(args, context);
      };
    } else if (options.requestApproval && typeof definition.execute === 'function') {
      const original = definition.execute;
      definition.execute = async (args, context) => {
        const type = name === 'system__web_search' ? 'SEARCH' : 'SYSTEM_ACTION';
        if (options.abortSignal?.aborted || !await options.requestApproval({ type, action: name.replace(/^system__/, '').replaceAll('_', ' '), target: JSON.stringify(args), onceOnly: true })) return { success: false, error: 'Permission declined or task stopped.' };
        if (options.abortSignal?.aborted) return { success: false, error: 'Task stopped.' };
        return original(args, context);
      };
    }
  }
  return { tools, toolMetadata };
}

module.exports = {
  buildVercelMcpTools,
  sanitizeToolName
};
