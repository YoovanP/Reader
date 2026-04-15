function getFocusLength(wordLength) {
  if (wordLength <= 3) return 1;
  if (wordLength <= 6) return 2;
  if (wordLength <= 10) return 3;
  return Math.max(4, Math.floor(wordLength * 0.4));
}

export function applyBionicFormatting(html) {
  if (!html || typeof html !== 'string') {
    return html || '';
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  const excludedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (excludedTags.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.classList.contains('bionic-focus')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  const wordRegex = /[A-Za-z][A-Za-z'’-]*/g;

  textNodes.forEach((textNode) => {
    const source = textNode.nodeValue || '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match = wordRegex.exec(source);

    while (match) {
      const start = match.index;
      const word = match[0];

      if (start > cursor) {
        fragment.appendChild(document.createTextNode(source.slice(cursor, start)));
      }

      const focusLen = Math.min(getFocusLength(word.length), word.length);
      const focus = document.createElement('strong');
      focus.className = 'bionic-focus';
      focus.textContent = word.slice(0, focusLen);
      fragment.appendChild(focus);

      const tail = word.slice(focusLen);
      if (tail) {
        fragment.appendChild(document.createTextNode(tail));
      }

      cursor = start + word.length;
      match = wordRegex.exec(source);
    }

    if (cursor < source.length) {
      fragment.appendChild(document.createTextNode(source.slice(cursor)));
    }

    if (cursor > 0) {
      textNode.replaceWith(fragment);
    }

    wordRegex.lastIndex = 0;
  });

  return container.innerHTML;
}