function escapeHTML(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanBinaryLikeText(raw) {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBuffer(arrayBuffer) {
  const decoders = ['utf-8', 'utf-16le', 'windows-1252'];
  let best = '';
  let lowestReplacementCount = Number.POSITIVE_INFINITY;

  for (const encoding of decoders) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(arrayBuffer);
      const replacementCount = (text.match(/\uFFFD/g) || []).length;
      if (replacementCount < lowestReplacementCount) {
        lowestReplacementCount = replacementCount;
        best = text;
      }
      if (replacementCount === 0) {
        return text;
      }
    } catch (_) {
      // Ignore decoder errors and continue trying alternatives.
    }
  }

  return best;
}

function markdownToHtml(md) {
  const escaped = escapeHTML(md);
  return escaped
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function wrapParagraphs(htmlLike) {
  const content = htmlLike.trim();
  if (!content) {
    return '<p></p>';
  }
  return `<p>${content}</p>`;
}

function splitTextChapters(text, titlePrefix = 'Section') {
  const byHeading = text.split(/\n(?=#\s|CHAPTER\s+\d+|Chapter\s+\d+)/g).filter(Boolean);
  if (byHeading.length > 1) {
    return byHeading.map((chunk, idx) => ({
      title: `${titlePrefix} ${idx + 1}`,
      content: `<p>${markdownToHtml(chunk).replace('<p>', '').replace('</p>', '')}</p>`,
      originalContent: `<p>${markdownToHtml(chunk).replace('<p>', '').replace('</p>', '')}</p>`,
    }));
  }

  const approxChunkSize = 12000;
  const chunks = [];
  for (let start = 0; start < text.length; start += approxChunkSize) {
    chunks.push(text.slice(start, start + approxChunkSize));
  }

  return chunks.map((chunk, idx) => {
    const paragraphs = chunk
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHTML(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

    return {
      title: `${titlePrefix} ${idx + 1}`,
      content: paragraphs || `<p>${escapeHTML(chunk)}</p>`,
      originalContent: paragraphs || `<p>${escapeHTML(chunk)}</p>`,
    };
  });
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}

function rtfToText(text) {
  return text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseTextFormats(arrayBuffer, fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const raw = decodeBuffer(arrayBuffer);
  const cleaned = cleanBinaryLikeText(raw);

  if (['txt', 'log', 'csv', 'json', 'ini', 'yaml', 'yml'].includes(ext)) {
    return { chapters: splitTextChapters(cleaned, 'Part'), toc: [] };
  }

  if (['md', 'markdown'].includes(ext)) {
    const mdChunks = raw.split(/\n(?=#\s|##\s|###\s|CHAPTER\s+\d+|Chapter\s+\d+)/g).filter(Boolean);
    const chapters = (mdChunks.length ? mdChunks : [raw]).map((chunk, idx) => {
      const html = wrapParagraphs(markdownToHtml(chunk));
      return {
        title: `Section ${idx + 1}`,
        content: html,
        originalContent: html,
      };
    });
    return { chapters, toc: [] };
  }

  if (['html', 'htm', 'xml', 'xhtml'].includes(ext)) {
    const safe = sanitizeHtml(raw);
    const chapters = splitTextChapters(safe.replace(/<[^>]+>/g, ' '), 'Document').map((chapter) => ({
      ...chapter,
      content: safe,
      originalContent: safe,
    }));
    return { chapters: chapters.length ? [chapters[0]] : [], toc: [] };
  }

  if (ext === 'rtf') {
    const text = rtfToText(raw);
    return { chapters: splitTextChapters(text, 'RTF Chapter'), toc: [] };
  }

  if (['mobi', 'azw', 'azw3', 'fb2'].includes(ext)) {
    const text = cleaned;
    return {
      chapters: splitTextChapters(text || 'Unable to decode this file cleanly. Try exporting as EPUB or TXT for better quality.', 'MOBI Segment'),
      toc: [],
      warning: 'Experimental parser used for this format.',
    };
  }

  return { chapters: splitTextChapters(cleaned || raw || 'Unsupported file content.', 'Chapter'), toc: [] };
}
