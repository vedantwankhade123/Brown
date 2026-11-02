# Background chat jobs

Ordinary chat, visual generation, knowledge answers and web answers run as independent jobs. Each job captures its chat history, model, project instructions, knowledge scope and attachments when submitted. Switching chats does not cancel it. Results are saved to the original chat; streaming updates only paint that chat when it is visible.

The selected chat's Stop button cancels only its own queued or running request. Sidebar chat rows show a spinner while running or **In queue** while waiting. The collapsed navigation rail retains New chat, Search, Assets and Projects, followed by a combined work indicator. Click that indicator to return to a working chat.

Code opens beside chat with equal widths on desktop layouts and automatically collapses the left navigation. Closing Code restores the previous navigation state unless the user changed it. On narrow windows Code uses an overlay instead of squeezing both panes.

## Capacity and limits

- At most two jobs run concurrently. Unknown memory telemetry permits one at a time.
- Below 0.8 GB free RAM, jobs wait. A second job requires at least 3 GB free RAM and CPU load at or below 90%; switching models requires additional headroom based on model size.
- Memory allocation failures allow one queued retry with a smaller context. Queued requests are reconsidered every three seconds, and completed or stopped jobs release their slot immediately.
- These are conservative admission estimates, not a guarantee of GPU memory availability or faster inference. Ollama may serialize generation internally.
- Each running job has a six-minute deadline; waiting time does not consume it. Up to twenty unfinished jobs may be submitted.
- Closing the app interrupts jobs. Old unfinished messages are marked interrupted when reopened; they are not silently resubmitted.
- Explicit screen capture and computer-control execution retain the foreground execution path. This scheduler does not run desktop actions unattended.

## Verification

`node tests/chat-jobs.test.js` checks independent cancellation, two-slot admission, low-memory queues, bounded memory recovery, deadlines and late-output rejection. `electron tests/chat-jobs-electron.test.js` checks isolated history/project instructions, background completion, foreground painting and queue resumption. `electron tests/artifact-runtime-electron.test.js` checks equal pane widths, compact navigation and actual code scrolling.
