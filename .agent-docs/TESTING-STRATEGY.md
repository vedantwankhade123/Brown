# Local Simulation & Verification Strategy

Before shifting the agent app into a production setup, tests must be executed locally within verified mockup structures.

## 1. Mock Environment Operations
*   The system orchestration files must accept a target system runtime flag: `PROCESS_ENV_MOCK=true`.
*   When this testing flag is true, all file updates, directory insertions, or execution shell commands are directed to a target local workspace folder (`C:\local_agent_sandbox\`).

## 2. Dynamic Status Message Testing
*   Ensure that every state transformation inside the Python or Node backend framework triggers an associated event listener text output block.
*   Test that the right sidebar checklist correctly intercepts these dynamic logs and triggers checkmark visual changes to reflect progress accuracy for research validation.