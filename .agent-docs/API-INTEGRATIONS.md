# Local Windows API & Tool Integrations

To keep this agent entirely local and functional, the codebase must target the following native interfaces, tools, and programmatic boundaries.

## 1. Local Ollama Integration Loop
*   **Base URL:** All inference calls run strictly on `http://127.0.0.1:11434`.
*   **Hardware Profiling Suggestion:** 
    *   Query system info via node module `systeminformation` or native PowerShell `Get-CimInstance Win32_ComputerSystem`.
    *   Compare system RAM against model scale requirements: If System RAM < 16GB, recommend 3B parameters (e.g., `phi4`). If System RAM >= 16GB, allow `llama3`.

## 2. Programmatic Windows Sandbox (Hyper-V/WDAG)
*   **Sandbox Invocation:** For "Isolated Containment Mode", use the native Windows Sandbox execution tool (`wsb.exe`).
*   **Configuration Generation:** Generate temporary `.wsb` XML files configuration maps on-the-fly to set shared target folders:
    ```xml
    <Configuration>
      <MappedFolders>
        <MappedFolder>
          <HostFolder>C:\local_agent_sandbox</HostFolder>
          <SandboxFolder>C:\SandboxTest</SandboxFolder>
          <ReadOnly>false</ReadOnly>
        </MappedFolder>
      </MappedFolders>
    </Configuration>
    ```
*   **Execution Hook:** Spin up the isolation instance command: `wsb.exe C:\path\to\generated.wsb`.

## 3. Web Scraping & Active App Invocation
*   **Scraping Boundary:** Playwright runs in `headless: true` configuration inside a Python script structure. It passes string read-outs locally into the chat context layer.
*   **Application Invocations:** Use Node `child_process.exec` loops mapped explicitly against user-approved target executable strings only.