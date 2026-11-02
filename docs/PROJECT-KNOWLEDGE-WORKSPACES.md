# Projects, local knowledge, and model health

The Knowledge Base file table shows ten files per page. Page controls reflect the current source, file-type, search and sort filters; changing a filter returns to page one. The rounded search field shows indexed file names and paths directly below it in a Mention-style dropdown. Click a match to reveal its table page and highlight the file. Arrow keys navigate matches; Escape dismisses the dropdown. No file is opened or changed by selecting a search result.

Open **Projects** in the top bar, or use the **+** beside Projects in the sidebar. In **Create project**, enter its name, use **Add** under Project folder to select one folder, then choose **Create project**. Add disappears after selection; remove the folder to choose a replacement. Create another project for another folder. Creation saves the workspace and opens its chats without indexing. Empty folders work. Project chats appear under their project, while general chats remain in Recents. The selected-folder area fits its content. Existing projects with multiple folders retain their saved sources, but cannot add more.

For optional RAG, open the project's settings using its sidebar menu (or click its name in the composer bar). Choose **Index folder**, then **Save changes** with **Use project files for answers** enabled. Indexing has a separate status and can fail without deleting or blocking the workspace. Disable that checkbox and save to stop using its indexed files in answers. Existing projects retain their previous knowledge behavior.

Use a project's sidebar **⋯** to open its settings. **General** contains its name and folders; **Instructions** and **Model** are separate views for project preferences. Choose **Save changes** to apply them. Chats are assigned to the active project. Older chats remain under **Personal**. Personal can search all indexed knowledge; other projects search only their selected sources. A project without selected sources has no automatic knowledge evidence. Switching projects during a response asks you to stop it first.

The left sidebar's **Projects** section shows workspaces as collapsible folders with their chats nested underneath. Click a project name to open it, use its **+** for a new chat, or **⋯** for its settings. The **+** beside the Projects heading opens project creation. **Show more** reveals additional workspaces. Personal chats remain in **Recents**. Folder and section collapse choices persist across launches.

The top **New chat** follows the conversation currently open: a project conversation starts or reuses a blank in that project; otherwise it goes to Recents, even if a workspace was selected earlier. The Recents **+** always opens a general chat and a project **+** explicitly opens one in that project. Existing empty chats in the destination are reused instead of creating duplicate blanks. Chats containing messages or recorded task/tool activity are preserved. Only the current chat has an active background; project titles do not.

Use **Knowledge → Knowledge Base** to import sources. **Automatic knowledge updates** is separate from auto-learning: it monitors already indexed files, while auto-learning controls adding sources from app activity. File events are debounced for 1.5 seconds, with a 30-second polling fallback. Changed and new files are re-extracted; deleted files within available folders are removed. Unchanged chunks and saved notes are retained. Source roots that are temporarily unavailable are retained and reported in update details. Existing size, depth, extension, hidden-file, and dependency-directory limits still apply. Scanned PDFs still require a text layer.

Update status shows the last successful check, changed/deleted file counts, errors, and skipped files. Initial imports seed a change manifest, avoiding a second full parse on the first automatic check. Imports, removals, manual indexing, and automatic changes share a serialized mutation queue. Pause automatic updates with its checkbox. Manual re-indexing remains available.

Ask a specific document question or mention a file with **@**. Brown includes up to five relevant local excerpts in the model request, with source names and excerpt identifiers. **Retrieved sources** on an answer opens the captured excerpts and their file locations. These are retrieved evidence, not an independent guarantee that every generated claim is supported. Explicit document questions return a clear no-match/unavailable answer when retrieval has no evidence. Knowledge context and project instructions remain usable when long-term memory is disabled. Pinned files are read afresh instead of using a stale text cache; indexed PDFs use local text extraction.

General chats do not automatically search the entire knowledge base. A folder selected in the composer belongs to that chat; new general chats do not inherit it. An explicit knowledge request or Project knowledge chip permits a deliberate global search in Personal. Project retrieval respects its saved source scope and knowledge toggle. Standalone creation requests using supplied content, such as a budget pie chart, skip automatic RAG unless knowledge is explicitly requested. Search requires meaningful whole-word matches; character fragments or generic words alone do not produce retrieved-source chips.

**Model health** checks the local Ollama version, installed and loaded models, and available RAM. Memory fit is an estimate using model size plus overhead; context size and GPU allocation also matter. Use **Load / test** to check whether a local model can load, or **Use model** to select it. Missing-model recovery retries one installed local alternative rather than recursively switching without a limit. Memory recovery prioritizes suitable models and bounds its candidate list. No model download is performed by the health panel.

Conversation history retains referenced older artifacts, numbered recommendations, and the original request that produced them. Requests capture their source chat and project scope before asynchronous retrieval. This improves follow-ups but cannot make a small local model perfectly reliable or provide unlimited context: history and source excerpts remain bounded.

All project preferences, indexing, retrieval, monitoring, and health checks run locally. Chat generation follows the selected model/provider; use an installed Ollama model for fully offline answers.

## Verification

- `node tests/project-knowledge-updates.test.js`
- `node tests/knowledge-context.test.js`
- `node tests/conversation-context.test.js`
- `npm test`
- Run `tests/project-ui-electron.test.js` with Electron for actual project creation, source/instruction/model saving, health display, and selection.
