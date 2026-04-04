# ReadRot

ReadRot is a client-side reading app for PDF, EPUB, and text-like formats.

It runs fully in the browser with no backend.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YoovanP/Reader)

## What it does

- Upload and read: PDF, EPUB, TXT, MD, HTML, XML, JSON, CSV, RTF, and more
- Reading modes: Classic, Speed (RSVP), ROT
- Reader controls: typography, colors, width, spacing, traversal, chapter mode
- Progress tracking: chapter and reading position persistence
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
- EPUB parsing uses robust fallback logic for compatibility across different EPUB files.
