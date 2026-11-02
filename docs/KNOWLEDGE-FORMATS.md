# Local document and image retrieval

The same `knowledge-parsers.js` registry serves folder imports, individual file imports, automatic updates and current-source evidence reads. The picker lists its supported extensions. Unsupported formats and extraction failures are reported instead of being decoded as binary text. The Knowledge Base retains an import report and labels image entries that have filename metadata only.

Supported families:

- UTF-8 and BOM-marked UTF-16 text, Markdown, CSV/TSV, JSON/JSONL, common code/config formats, and HTML text.
- PDF text layers, with page numbers. Up to 200 text pages per file. Blank/scanned pages use local Windows PDF rendering and OCR, up to 12 scanned pages per pass. Mixed text/scanned PDFs retain their text pages when OCR is unavailable.
- DOCX paragraph/table-cell text, headers, footers, footnotes and endnotes.
- PPTX slide text with slide numbers.
- XLSX shared/inline strings, cell addresses and saved numeric/formula values with sheet names. Formulas are not executed; missing saved results are identified. Cell formatting, embedded charts and images are not interpreted.
- ODT/ODS/ODP embedded paragraph text, and RTF text/control-word decoding. Original page layout is not reproduced.
- PNG/JPEG/WebP/BMP/TIFF/GIF images through offline Windows OCR. Decoder and language support depend on the Windows installation. Animated/multipage images currently use the decoded default frame.

There is no universal parser for every file type. Legacy binary DOC/XLS/PPT, encrypted documents, archives, audio/video and unsupported proprietary formats need conversion or a dedicated extractor. No cloud OCR, model download, external XML entity resolution, Office automation, macro execution or spreadsheet formula execution is introduced.

Limits: 2 MB per text file, 32 MB per document/image, 1,500 files and 128 MB raw source bytes per folder scan; traversal depth remains bounded at six levels. Office archives have entry-count and expanded-byte bounds, each file's extracted text is capped at two million characters, and each source's indexed text is bounded. Limits and incomplete extraction are reported. Keep large collections in smaller source folders.

Search indexes extracted text using Unicode-aware keyword/BM25 and TF-cosine ranking. This is text retrieval, not a new visual embedding index: images cannot be searched semantically by an unseen object's appearance. OCR text such as invoice numbers becomes searchable; a photograph without text is indexed by its filename, explicitly marked as not visually interpreted.

When a local vision model is selected, pinned indexed images and retrieved image results can supply up to two bounded PNG previews to the current request. Original previews are generated only after confirming the path belongs to an indexed file. Text-only models receive OCR text/metadata, with instructions not to infer unseen visual details. This image-preview path stays local; it is not sent automatically to cloud providers. If OCR yields no text, mention the image with `@` to select it explicitly for visual questions. Image-derived visual generation retains the vision model instead of switching to a text-only renderer model.

After upgrading, use **Knowledge Base → Re-index all** for existing folders. Automatic updates also detect the parser-version change and refresh old file stamps. After installing a missing Windows OCR language, re-index the affected sources. Reading text does not prove a generated answer is correct; OCR can misread small or blurred text.

Verification: `node tests/knowledge-formats.test.js` creates Office, OpenDocument, RTF and Unicode fixtures, checks scoped retrieval and metadata, and on Windows runs actual image and scanned-PDF OCR. Existing knowledge import/update and Electron dashboard/job tests cover integration and local vision routing.
