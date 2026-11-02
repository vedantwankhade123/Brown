# Offline visual planner

Geometry explanations use a separate `geometry` specification and an SVG renderer for circles, triangles with perpendicular heights, and rectangles. Symbolic constructions label dimensions and identify the drawing as not to scale. Circle radius explanations include the diameter, circumference and area relationships without inventing measurements. Explicit process diagrams remain flowcharts. Unsupported geometric constructions are reported rather than substituted with process diagrams. Tests: `geometry-diagrams.test.js` and the geometry integration checks in `math-rendering-electron.test.js`.

Explicit text-only visual requests now use `src/renderer/visual-planner.js` before the normal conversation generator. Generation uses an installed Ollama model over localhost; schema validation and rendering need no cloud service. Requests with attached images retain the existing vision path.

## Initial supported families

- Flowchart: process steps, decisions, horizontal/vertical pipelines, trees and grouped responsibility lanes.
- Sequence: named participants and chronological requests/replies.
- Architecture: named components, system boundaries and labeled relationships.
- Numeric chart: bar, line, area, pie, donut, scatter and stacked bar.

Scatter coordinate pairs and explicitly supplied quarterly stacked-bar series can be compiled directly without a model extraction call. Every point, category and series value is retained and validated. Other scatter/stacked formats use their own structured schemas and evidence validation. Sequence requests that also ask for a table receive a compiler-generated message/sender/receiver table derived from the same validated specification. Combined requests beginning with “Explain … First show a sequence diagram …” use the visual route, rather than informal sequence code blocks.

Short follow-ups such as “take random on your own” retain the last user visual request in the same chat. Existing supplied numbers take priority over permission to choose sample data. When that request has no numbers and the user explicitly permits samples, a sample dataset is added and both its title and explanation identify it as illustrative, not real measurements. This resolves the failed follow-up without replacing real observations. Unrelated automatic RAG is skipped for standalone visual requests, including those using “show”; global indexed files do not silently become visual sources.

The planner explicitly declines other visual types instead of silently translating them into flowcharts. Existing Mermaid source can still render in its own supported syntax, but invalid Mermaid no longer falls back to a fabricated flowchart.

## Generation and validation

The chat entry point resolves the requested output before search/topic heuristics. Visual requests retain their original text, bypass browser mode and the general agent harness, and use local Ollama readiness rather than cloud API-key checks. Participant names such as Browser and API are content, not tool instructions. New content requests cannot inherit an earlier search topic. Pure informational questions and explicit research commands keep their normal routes.

An explicitly supplied linear pipeline list can be compiled directly, with the same validation and rendering checks, without asking a model to reconstruct the stages. Conditional or branching descriptions still use structured model planning. Empty renderer results fail visibly rather than appearing as a completed blank visual. Unsolicited greeting-only responses to substantive tasks are rejected with a bounded retry.

1. Choose a family from the request and select its instructions and example.
2. Ask the local model for a JSON specification, constrained by a family-specific JSON schema passed directly to Ollama's structured-output format.
3. Validate identifiers, references, relationships, required groups, labeled decisions, tree/pipeline topology, and selected explicitly named user entities. Reject unrequested duplicate messages. Use compiler-owned Mermaid identifier prefixes so ordinary IDs such as `end` remain safe.
4. Compile the specification into escaped Mermaid source or strict chart JSON. Long node labels are wrapped by the compiler.
5. Check real Mermaid rendering in the isolated local renderer. Substantial node overlap or a render failure becomes repair feedback. Verified SVG is cached for display.
6. Allow two repairs after the initial attempt. Local output streams internally, with reasoning disabled for the compact specification task. Each call allows up to three minutes for model loading/first output, one minute of token inactivity after output starts, and six minutes total. Active output renews the inactivity budget; cancellation stops the request. On exhaustion, return the failure reason rather than presenting an invalid visual.

Transport failures have one recovery allowance per visual request, shared across specification repairs. Timeouts, resource errors, dropped connections, and empty completions can retry on a lighter installed local text model. If no suitable alternative exists, retry the same model once. Output truncation instead retries the same model with a larger output budget. Recovery preserves the visual family, validation rules, and selected chat model, reports a retry status, and never contacts a cloud provider. Cancellation and rejected requests are not retried.

Chart rows contain `label`, finite numeric `value`, and an internal `evidence` excerpt copied from the supplied conversation source. That excerpt must contain the label followed by its matching value. Missing data prompts for labels, values and units. No web lookup or synthetic measurements are substituted. Prior conversation source is reused only when the request refers back to it. These source figures are preserved, not independently verified. The initial evidence matcher does not support arbitrary inferred calculations or all natural-language numeric formats; those require a clearer data list.

Chart specifications include units and horizontal/vertical axis labels. Evidence excerpts are not included in the displayed chart source.

These checks do not prove domain correctness. A model can still choose an incorrect conceptual relationship, especially when the user has not supplied explicit entities. Smaller local models may exhaust repairs; use a stronger installed model or a more explicit request.

## Verification

- `node tests/visual-planner.test.js`: selection, compilation, supplied numeric evidence, topology, repair limits and cancellation.
- `node tests/prompt-routing.test.js`: actual visual intent recognition, full-task precedence, search/browser/harness exclusion, explicit pipeline preservation and unrelated greeting detection.
- `node tests/visual-loading-order.test.js`: stable loader, ordering and failure cleanup.
- Run `tests/visual-render-process-electron.test.js` with Electron: real family-specific SVG, chart axis descriptions, geometric overlap rejection, rendering isolation and cleanup.
