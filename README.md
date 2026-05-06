# ReadRot

ReadRot is a client-side reading app for PDF, EPUB, pasted text, and text-like formats.

It runs fully in the browser with no backend.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YoovanP/Reader)

## What it does

- Upload and read: PDF, EPUB, TXT, MD, HTML, XML, JSON, CSV, RTF, and more
- Add content from one Upload menu: open a file, paste text, or search book sources
- Reading modes: Classic, Bionic, Speed (RSVP), ROT
- Reader controls: typography, colors, width, spacing, traversal, chapter mode
- Local History: reopen uploaded files and pasted text from IndexedDB with last read position restored
- Mobile-friendly UI with collapsible contents, floating chapter navigation, custom themed scrollbars, and optional screen wake lock
- PWA support for installing ReadRot on mobile/desktop
- Keyboard shortcuts for playback and navigation

## Run locally

Use any static server from the project root.

### Option 1: http-server

```bash
npx http-server -p 8080
```

Then open `http://localhost:8080`.

### Option 2: VS Code Live Server

Open `index.html` with Live Server.

## Deploy to Cloudflare Pages

### One-click

Use the Deploy to Cloudflare button above.

### Manual

1. Go to Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git.
2. Select this repository.
3. Configure build:
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: `.`
4. Deploy.

## Project structure

```text
index.html
manifest.webmanifest
service-worker.js
icons/
src/
  main.js
  parser/
  modes/
  ai/
  ui/
  utils/
```

## Notes

- API keys (Gemini/OpenAI/OpenRouter) are stored in browser storage only.
- History is local-only and stored in IndexedDB. It can be disabled in Settings.
- EPUB parsing uses robust fallback logic for compatibility across different EPUB files.
