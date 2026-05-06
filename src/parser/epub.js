function sanitizeHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      // specifically allow src for img, but we will rewrite it
      if (name === 'src' && el.tagName !== 'IMG') {
         el.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

/**
 * Resolves relative paths in HTML to Blob URLs from the EPUB archive.
 */
async function resolveEpubResources(html, bookOrZip, baseDir, resources) {
  const container = document.createElement('div');
  container.innerHTML = html;

  const images = container.querySelectorAll('img');
  for (const img of images) {
    const src = img.getAttribute('src');
    if (!src || src.includes('://') || src.startsWith('data:')) {
      continue;
    }

    const fullPath = joinPath(baseDir, src);
    try {
      let blob;
      // Handle epub.js Archive
      if (bookOrZip.archive && typeof bookOrZip.archive.getBlob === 'function') {
        blob = await bookOrZip.archive.getBlob(fullPath);
      } 
      // Handle JSZip
      else if (typeof bookOrZip.file === 'function') {
        const file = bookOrZip.file(fullPath) || bookOrZip.file(decodeURIComponent(fullPath));
        if (file) {
          blob = await file.async('blob');
        }
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        img.src = url;
        resources.push(url);
      }
    } catch (e) {
      console.warn('Failed to resolve image', fullPath, e);
    }
  }

  return container.innerHTML;
}

function normalizeToHtmlFragment(loaded) {
  if (!loaded) {
    return '';
  }

  if (typeof loaded === 'string') {
    return loaded;
  }

  if (loaded.documentElement?.innerHTML) {
    return loaded.documentElement.innerHTML;
  }

  if (loaded.content && typeof loaded.content === 'string') {
    return loaded.content;
  }

  return '';
}

function flattenToc(entries, acc = []) {
  for (const entry of entries || []) {
    acc.push(entry);
    if (Array.isArray(entry.subitems) && entry.subitems.length) {
      flattenToc(entry.subitems, acc);
    }
  }
  return acc;
}

function findTocTitle(href, toc) {
  if (!href) {
    return null;
  }

  const normalized = href.split('#')[0];
  const hit = toc.find((entry) => {
    const tocHref = (entry.href || '').split('#')[0];
    return tocHref && (normalized.includes(tocHref) || tocHref.includes(normalized));
  });
  return hit?.label || null;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromPath(path, fallback) {
  const leaf = decodeURIComponent(String(path || '').split('/').pop() || '')
    .replace(/\.(xhtml|html|htm|xml)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return cleanTitle(leaf) || fallback;
}

function getEpubJsBookTitle(book) {
  return cleanTitle(
    book?.packaging?.metadata?.title ||
    book?.package?.metadata?.title ||
    book?.metadata?.title ||
    '',
  );
}

function getPackageTitle(opfDoc) {
  const titleNode = [...opfDoc.getElementsByTagName('*')]
    .find((node) => (node.localName || '').toLowerCase() === 'title');
  return cleanTitle(titleNode?.textContent || '');
}

function isBookTitleRepeat(candidate, bookTitle) {
  if (!candidate || !bookTitle) {
    return false;
  }
  return candidate.toLocaleLowerCase() === bookTitle.toLocaleLowerCase();
}

function getSpineItems(book) {
  if (Array.isArray(book?.spine?.items)) {
    return book.spine.items;
  }
  if (Array.isArray(book?.spine?.spineItems)) {
    return book.spine.spineItems;
  }
  return [];
}

async function loadSpineItem(book, item) {
  if (item && typeof item.load === 'function') {
    const loaded = await item.load(book.load.bind(book));
    return {
      html: normalizeToHtmlFragment(loaded),
      unload: () => {
        if (typeof item.unload === 'function') {
          item.unload();
        }
      },
      href: item.href || '',
      idref: item.idref || '',
    };
  }

  let section = null;
  if (book?.spine && typeof book.spine.get === 'function') {
    section = book.spine.get(item?.href || item?.idref || item?.index);
    if (!section && Number.isInteger(item?.index)) {
      section = book.spine.get(item.index);
    }
  }

  if (section && typeof section.load === 'function') {
    const loaded = await section.load(book.load.bind(book));
    return {
      html: normalizeToHtmlFragment(loaded),
      unload: () => {
        if (typeof section.unload === 'function') {
          section.unload();
        }
      },
      href: section.href || item?.href || '',
      idref: section.idref || item?.idref || '',
    };
  }

  if (item?.href && typeof book?.load === 'function') {
    const loaded = await book.load(item.href);
    return {
      html: normalizeToHtmlFragment(loaded),
      unload: () => {},
      href: item.href,
      idref: item?.idref || '',
    };
  }

  return {
    html: '',
    unload: () => {},
    href: item?.href || '',
    idref: item?.idref || '',
  };
}

async function parseWithEpubJs(arrayBuffer, onProgress, resources = []) {
  const book = ePub(arrayBuffer);
  await book.ready;

  const toc = flattenToc(book.navigation?.toc || []);
  const bookTitle = getEpubJsBookTitle(book);
  const chapters = [];
  const spineItems = getSpineItems(book);

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    const loaded = await loadSpineItem(book, item);
    const html = loaded.html;
    if (html) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const bodyContent = tempDiv.querySelector('body')?.innerHTML || html;
      const baseDir = loaded.href.includes('/') ? loaded.href.slice(0, loaded.href.lastIndexOf('/')) : '';
      const resolved = await resolveEpubResources(bodyContent, book, baseDir, resources);
      const safe = sanitizeHTML(resolved);

      if (safe.trim()) {
        const tocTitle = cleanTitle(findTocTitle(loaded.href, toc));
        const headingTitle = chapterTitleFromHtml(html, '', bookTitle);
        const fallbackTitle = titleFromPath(loaded.href || loaded.idref, `Chapter ${chapters.length + 1}`);
        chapters.push({
          title: isBookTitleRepeat(tocTitle, bookTitle)
            ? (headingTitle || fallbackTitle)
            : (tocTitle || headingTitle || fallbackTitle),
          content: safe,
          originalContent: safe,
          href: loaded.href,
        });
      }
    }

    if (typeof onProgress === 'function') {
      onProgress(i + 1, Math.max(1, spineItems.length));
    }

    loaded.unload();
  }

  return {
    chapters,
    toc: chapters.map((chapter, idx) => ({
      label: chapter.title,
      chapterIndex: idx,
    })),
  };
}

function parseXml(xmlText) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlText, 'application/xml');
}

function getFirstByLocalName(doc, name) {
  const all = doc.getElementsByTagName('*');
  for (const node of all) {
    if ((node.localName || node.nodeName || '').toLowerCase() === name.toLowerCase()) {
      return node;
    }
  }
  return null;
}

function normalizePath(path) {
  const parts = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

function joinPath(baseDir, relative) {
  if (!baseDir) {
    return normalizePath(relative);
  }
  return normalizePath(`${baseDir}/${relative}`);
}

function extractBodyHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.querySelector('body');
  return body ? body.innerHTML : html;
}

function chapterTitleFromHtml(html, fallback, bookTitle = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const headings = [...doc.querySelectorAll('h1, h2, h3')];
  for (const heading of headings) {
    const text = cleanTitle(heading.textContent);
    if (text && !isBookTitleRepeat(text, bookTitle)) {
      return text;
    }
  }

  const title = cleanTitle(doc.querySelector('title')?.textContent);
  if (title && !isBookTitleRepeat(title, bookTitle)) {
    return title;
  }

  return fallback;
}

async function parseWithJsZip(arrayBuffer, onProgress, resources = []) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip is not available for EPUB zip fallback parsing.');
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: META-INF/container.xml not found.');
  }

  const containerXml = await containerFile.async('text');
  const containerDoc = parseXml(containerXml);
  const rootfile = getFirstByLocalName(containerDoc, 'rootfile');
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) {
    throw new Error('Invalid EPUB: root package path not found.');
  }

  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: package file not found at ${opfPath}.`);
  }

  const opfXml = await opfFile.async('text');
  const opfDoc = parseXml(opfXml);
  const bookTitle = getPackageTitle(opfDoc);

  const manifest = {};
  const manifestNodes = [...opfDoc.getElementsByTagName('*')].filter((node) => (node.localName || '').toLowerCase() === 'item');
  for (const node of manifestNodes) {
    const id = node.getAttribute('id');
    if (!id) {
      continue;
    }
    manifest[id] = {
      href: node.getAttribute('href') || '',
      mediaType: node.getAttribute('media-type') || '',
      properties: node.getAttribute('properties') || '',
    };
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const spineNodes = [...opfDoc.getElementsByTagName('*')].filter((node) => (node.localName || '').toLowerCase() === 'itemref');

  const chapters = [];
  for (let i = 0; i < spineNodes.length; i++) {
    const idref = spineNodes[i].getAttribute('idref');
    const item = manifest[idref || ''];
    if (!item) {
      if (typeof onProgress === 'function') {
        onProgress(i + 1, Math.max(1, spineNodes.length));
      }
      continue;
    }

    const mediaType = (item.mediaType || '').toLowerCase();
    const likelyDocument = mediaType.includes('xhtml') || mediaType.includes('html') || mediaType.includes('xml') || mediaType === '';
    if (!likelyDocument) {
      if (typeof onProgress === 'function') {
        onProgress(i + 1, Math.max(1, spineNodes.length));
      }
      continue;
    }

    const fullPath = joinPath(opfDir, item.href);
    const file = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
    if (!file) {
      if (typeof onProgress === 'function') {
        onProgress(i + 1, Math.max(1, spineNodes.length));
      }
      continue;
    }

    const html = await file.async('text');
    const body = extractBodyHtml(html);
    const resolved = await resolveEpubResources(body, zip, opfDir, resources);
    const safe = sanitizeHTML(resolved);

    if (safe.trim()) {
      const fallbackTitle = titleFromPath(item.href, `Chapter ${chapters.length + 1}`);
      chapters.push({
        title: chapterTitleFromHtml(html, fallbackTitle, bookTitle),
        content: safe,
        originalContent: safe,
        href: item.href,
      });
    }

    if (typeof onProgress === 'function') {
      onProgress(i + 1, Math.max(1, spineNodes.length));
    }
  }

  return {
    chapters,
    toc: chapters.map((chapter, idx) => ({
      label: chapter.title,
      chapterIndex: idx,
    })),
  };
}

export async function parseEPUB(arrayBuffer, onProgress, resources = []) {
  let epubJsError = null;

  try {
    const parsed = await parseWithEpubJs(arrayBuffer, onProgress, resources);
    if ((parsed.chapters || []).length > 0) {
      return parsed;
    }
  } catch (error) {
    epubJsError = error;
  }

  const zipParsed = await parseWithJsZip(arrayBuffer, onProgress, resources);
  if ((zipParsed.chapters || []).length > 0) {
    return zipParsed;
  }

  throw epubJsError || new Error('Unable to extract readable EPUB chapters.');
}
