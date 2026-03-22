const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'meta',
  'link',
  'base',
]);

const defaults = {
  allowedTags: false,
  allowedAttributes: {
    '*': ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'width', 'height'],
  },
};

const isSafeUrl = (value = '') => {
  const normalized = String(value).trim().toLowerCase();
  return !(
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  );
};

const sanitizeNode = (node, options) => {
  const tagName = node.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    node.remove();
    return;
  }

  if (Array.isArray(options.allowedTags) && !options.allowedTags.includes(tagName)) {
    node.replaceWith(...Array.from(node.childNodes));
    return;
  }

  const globalAllowed = options.allowedAttributes?.['*'];
  const tagAllowed = options.allowedAttributes?.[tagName];
  const allowedAttributes =
    globalAllowed === false || tagAllowed === false
      ? false
      : new Set([...(globalAllowed || []), ...(tagAllowed || [])]);

  for (const attr of Array.from(node.attributes)) {
    const attrName = attr.name.toLowerCase();

    if (attrName.startsWith('on') || attrName === 'srcdoc') {
      node.removeAttribute(attr.name);
      continue;
    }

    if (allowedAttributes !== false && !allowedAttributes.has(attrName)) {
      node.removeAttribute(attr.name);
      continue;
    }

    if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attr.value)) {
      node.removeAttribute(attr.name);
    }
  }

  for (const child of Array.from(node.children)) {
    sanitizeNode(child, options);
  }
};

function sanitizeHtml(input, options = {}) {
  if (!input) return '';

  const mergedOptions = {
    ...defaults,
    ...options,
    allowedAttributes: {
      ...(defaults.allowedAttributes || {}),
      ...(options.allowedAttributes || {}),
    },
  };

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return String(input)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${input}</body>`, 'text/html');
  const body = doc.body;

  for (const child of Array.from(body.children)) {
    sanitizeNode(child, mergedOptions);
  }

  return body.innerHTML;
}

sanitizeHtml.defaults = defaults;

export { defaults };
export default sanitizeHtml;