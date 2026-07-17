# Security & Permission Boundary Specifications

The agent enforces a rigid multi-mode permission abstraction layer to control system CRUD operations safely. The active state variable controls what standard API integrations are unblocked.

## The 4 Operating Security Modes

### 1. Review Mode (Human-in-the-Loop Verification)
*   **Mechanism:** The planning engine acts recursively, breaking down system requests into primitive operations (e.g., `fs.mkdir`, `fs.writeFile`).
*   **Execution Rule:** Before running any generated system terminal call or script module, the execution loop shifts to a hard pause state. It renders a structural UI permission overlay containing an interactive list of exact commands to run, requesting user validation.
*   **User Overrides:** Includes a custom input node enabling the user to feed text-based execution modifications or constraints directly back into the local prompt loop context.

### 2. Isolated Containment Mode (Full Sandbox)
*   **Mechanism:** High-risk code compilation or unknown operations are forced into an isolated layer.
*   **Execution Rule:** The Orchestrator leverages the native Windows Sandbox API (Windows Defender Application Guard / Hyper-V Isolation containers). Disk manipulations are mirrored into temporary virtual containers, ensuring your true operating configuration remains protected from unintended structural mutations.

### 3. Adaptive Auto Mode (Context-Aware Boundary Engine)
*   **Mechanism:** Dynamic risk evaluation engine.
*   **Execution Rule:** Routine workflows (e.g., text parsing, application invocation, reading metadata files) process seamlessly in the background. High-risk operations (e.g., executing binary installations, calling system registry parameters, file deletions) dynamically generate an internal alert condition, raising the UI window to Human-in-the-Loop Review Mode immediately.

### 4. Full Trusted Automation Mode
*   **Mechanism:** Maximum speed execution pattern for recursive batch workflows.
*   **Execution Rule:** Continuous loops run through to task completion without stopping for manual permissions, using deterministic parsing filters to block out explicit blacklisted file paths automatically.