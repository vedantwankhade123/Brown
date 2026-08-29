# Safe System CRUD & Failure Guardrails

Because the agent performs create, read, update, and delete (CRUD) tasks inside the local filesystem, strict code filters must be structurally hardcoded to guarantee zero system damage.

## 1. System Folder Path Blacklist
The file system execution engine must immediately catch and terminate any string match attempting write operations inside the following root Windows structural pathways:
*   `C:\Windows\`
*   `C:\Program Files\` and `C:\Program Files (x86)\`
*   `C:\Users\*\AppData\Local\Microsoft\Windows\`
*   System environment path manipulations or direct Master Boot Record/Registry key mutation calls without Human-in-the-Loop authorization tags.

## 2. Token-Crash & Latency Handling
*   **Context Overflows:** If local Ollama context size is close to the threshold limit, force automatic recursive summarization loops of early session entries inside the local database state.
*   **Execution Timeouts:** Long-running terminal automation loops must feature an explicit `abort-controller` timeout breaker capped at 300 seconds to avoid hung loops consuming 100% processing hardware.