# Brown offline chat release — QA

Tested on 5 October 2026. Mobile was not changed or tested in this task. Nothing was published.

## Changes

- The release routes computer-action requests into chat content generation. Approval controls, automation settings, browser automation and connector storage controls are hidden. The agent executor, native harness, command execution, application actions and automation installation are disabled for this release.
- Document attachments, knowledge, models, voice, connection, code previews and other existing non-automation features remain available.
- Answer instructions emphasize complete code, relevant follow-up context, factual uncertainty, units, honest testing claims, and supported visual formats.
- Explicit conversation history now reaches the local chat endpoint even before a chat has been saved.
- Chart validation rejects mismatched labels/values, nonfinite data and unsupported types. Numerical-chart requests cannot pass validation with an unrelated flowchart. Valid model-generated JSON in wrongly labelled fences is normalized into a chart without inventing data. Invalid visuals receive one local-model repair attempt.
- Code and diagram skills include clearer file dependencies, notation choices and limitations.

## Checklist

| Check | Result and scope |
| --- | --- |
| Offline local reply | Passed in isolated QA with external HTTP requests blocked in the Electron session. The computer's internet connection was not disabled at OS level. |
| Streaming | Passed with multiple incremental updates from an installed local model. |
| Follow-up context | Passed: the model recalled the project name Cedar from explicitly supplied conversation history. |
| Stop and retry | Passed: the in-flight request aborted, followed by a successful new reply. Stop-handler regression tests also pass. |
| Tables, math, diagrams, charts, code | Rendering fixtures exercised bundled libraries. The final real-model run produced a valid bar chart with values 10 and 20, and JavaScript in a code block. Generated code was not claimed to have been executed or functionally tested. |
| Chat persistence | Passed save/load and delete round trips through disk-backed app APIs, followed by a new process reopening the saved QA conversation, finding it through chat search, and deleting a disposable chat through the confirmation UI. |
| Setup and engine recovery | Packaged onboarding opens. Automated setup retry, installer integrity, interrupted update cleanup, cancellation and update retry tests pass. Fresh engine installation and live model-download interruption remain unverified. |
| Hardware guidance | Live profiling succeeded: 15.73 GB RAM, five installed models, existing recommendation returned phi4. |
| Honest computer-action scope | Approval controls hidden; test action refused with RELEASE_DISABLED. Main-process execution routes also refuse automation. |
| Windows package | Unpacked release build succeeds and opens onboarding with bundled visual and math libraries. No fresh-machine installer, signing, upgrade or rollback certification is claimed. |
| Privacy and licenses | About text distinguishes local processing from optional online services. Inventory records 19 direct runtime dependency licenses. Transitive dependencies, model weights, voice assets and complete redistribution notices still require review. |

## Automated verification

`npm test` passes, including the new chat-release visual checks. The stale Kore voice assertion was corrected to test the actual existing default local voice, George; no cloud voice was added just to satisfy the test.

## Visible evidence

The separate QA chat window contains local replies, follow-up tests, rendering examples and generated code/chart output. The packaged smoke window shows onboarding. Machine-readable results and screenshots are stored under `.codex/qa-workflows/` in the workspace.

Small local models can still produce incorrect or irrelevant content. Formatting validation and repair improve presentation but do not prove factual or semantic correctness. Evaluate intended release models with a broader prompt set before public launch.
