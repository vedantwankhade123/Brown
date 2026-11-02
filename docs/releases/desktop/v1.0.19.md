# Brown AI Desktop v1.0.19

This release improves offline chat reliability, project organization, knowledge retrieval and visual answers.

## Chat and workspaces
- Project workspaces keep chats, instructions, model preferences and selected knowledge sources together.
- Background chat jobs have memory-aware queues, scoped cancellation and bounded retries.
- Editing or regenerating an older turn preserves later messages and results. Saved versions deduplicate identical outputs; empty and failed versions cannot be restored.
- Inline message editing, working copy feedback and illustration references in the main composer improve everyday chat use.
- Conversation handling preserves legacy roles, prioritizes the latest request and rechecks corrected answers.

## Knowledge and attachments
- Format-aware indexing supports DOCX, PPTX, XLSX, OpenDocument, RTF, PDFs, common images and more text/code formats.
- Windows OCR extracts image and scanned-PDF text offline, subject to installed language support and extraction limits.
- Local vision models can inspect bounded previews of selected indexed images. Filename-only entries and unsupported files are clearly identified.
- Unicode-aware retrieval, scoped source excerpts, automatic knowledge updates, file search and pagination improve source navigation.
- An Assets gallery organizes chat attachments and links them to their conversations.

## Visual answers and interface
- Improved diagrams, numeric charts, geometry and sandboxed SVG/HTML illustrations, with bounded validation and repair.
- Illustrations carry a BETA badge and experimental-status information. Generated visuals may still contain mistakes.
- A scrollable syntax-highlighted source panel, refined sidebar controls, generation timers and animated loading surfaces improve presentation.
- Read-aloud streaming and synchronized highlighting receive reliability and interface improvements.

## Updating
Download Brown-AI-Setup.exe from this release, or use Settings → Software Updates → Check for updates in an existing supported installation. The Setup updater preserves the existing application identity and settings. Do not uninstall first. Portable users can download Brown-AI-Portable.exe.

## Notes
Re-index existing knowledge folders to apply the new parsers. Windows OCR needs suitable installed OCR language support. Legacy DOC/XLS/PPT, encrypted documents and unsupported formats require conversion. Local-model quality and speed depend on the model and available memory. This GitHub installer is unsigned; Windows may display SmartScreen. Android remains on its separately published release.
