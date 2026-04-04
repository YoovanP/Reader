pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function reconstructParagraphs(items) {
  const lines = [];
  for (const item of items) {
    const y = item.transform?.[5] ?? 0;
    lines.push({ text: item.str || '', y });
  }

  lines.sort((a, b) => b.y - a.y);

  const paragraphs = [];
  let current = '';
  let prevY = null;

  for (const line of lines) {
    if (!line.text.trim()) {
      continue;
    }

    if (prevY !== null && Math.abs(prevY - line.y) > 14) {
      if (current.trim()) {
        paragraphs.push(current.trim());
      }
      current = line.text;
    } else {
      current += (current ? ' ' : '') + line.text;
    }

    prevY = line.y;
  }

  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  return paragraphs
    .map((p) => p.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('');
}

export async function parsePDF(arrayBuffer, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chapters = [];
  let currentContent = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = reconstructParagraphs(content.items);
      currentContent += text || '<p></p>';
    } catch (_error) {
      currentContent += '<p></p>';
    }

    if (typeof onProgress === 'function') {
      onProgress(i, pdf.numPages);
    }

    if (i % 10 === 0 || i === pdf.numPages) {
      chapters.push({
        title: `Chapter ${chapters.length + 1}`,
        content: currentContent,
        originalContent: currentContent,
      });
      currentContent = '';
    }
  }

  return { chapters, toc: [] };
}
