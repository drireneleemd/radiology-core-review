// background.js — service worker
// Handles: PDF→Markdown conversion, HTML→Markdown, context menu for images

importScripts('pdf.min.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');

// ── Context menu setup ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       'saveImage',
    title:    '📷 Save image to Radiology Library…',
    contexts: ['image'],
  });
});

// When user right-clicks an image and picks the menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveImage' && info.srcUrl) {
    // Pass URL directly as query param — most reliable method
    const encodedUrl = encodeURIComponent(info.srcUrl);
    chrome.windows.create({
      url:    chrome.runtime.getURL(`image_saver.html?imgUrl=${encodedUrl}`),
      type:   'popup',
      width:  380,
      height: 520,
    });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'convertPdf') {
    convertPdfToMarkdown(new Uint8Array(msg.buffer), msg.filename)
      .then(markdown => sendResponse({ markdown }))
      .catch(err    => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'fetchImageBytes') {
    // Fetch image from background context (bypasses CORS/403 on page context)
    fetch(msg.url)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const mime   = r.headers.get('content-type') || 'image/jpeg';
        const buffer = await r.arrayBuffer();
        const bytes  = new Uint8Array(buffer);
        let binary   = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        sendResponse({ base64: btoa(binary), mimeType: mime });
      })
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'convertHtml') {
    try {
      const markdown = htmlToMarkdown(msg);
      sendResponse({ markdown });
    } catch(err) {
      sendResponse({ error: err.message });
    }
    return true;
  }
});

// ── HTML → Markdown ───────────────────────────────────────────────────────────
function htmlToMarkdown({ html, title, authors, journal, doi, url }) {
  const lines = [];
  lines.push(`# ${title || 'Article'}`);
  lines.push('');
  if (authors) lines.push(`**Authors:** ${authors}`);
  if (journal) lines.push(`**Journal:** ${journal}`);
  if (doi)     lines.push(`**DOI:** ${doi}`);
  if (url)     lines.push(`**Source:** ${url}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(convertHtmlToText(html));
  return lines.join('\n');
}

function convertHtmlToText(html) {
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '');

  html = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gis, '\n#### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*')
    .replace(/<li[^>]*>(.*?)<\/li>/gis, '\n- $1')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '')
    .replace(/<figcaption[^>]*>(.*?)<\/figcaption>/gis, '\n*Figure: $1*\n')
    .replace(/<th[^>]*>(.*?)<\/th>/gis, '| $1 ')
    .replace(/<td[^>]*>(.*?)<\/td>/gis, '| $1 ')
    .replace(/<tr[^>]*>/gi, '\n').replace(/<\/tr>/gi, '|')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
    .replace(/\n{3,}/g, '\n\n').trim();
  return html;
}

// ── PDF → Markdown ────────────────────────────────────────────────────────────
async function convertPdfToMarkdown(uint8Array, filename) {
  const pdf      = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  const numPages = pdf.numPages;
  const title    = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ')
                           .replace(/\b\w/g, c => c.toUpperCase());

  const lines = [`# ${title}`, '', `*Source: ${filename} — ${numPages} pages*`, ''];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const yGroups = {};
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!yGroups[y]) yGroups[y] = [];
      yGroups[y].push(item);
    }

    const sortedYs  = Object.keys(yGroups).map(Number).sort((a, b) => b - a);
    const pageLines = [];
    let prevY = null;

    for (const y of sortedYs) {
      const items    = yGroups[y].sort((a, b) => a.transform[4] - b.transform[4]);
      const lineText = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!lineText) continue;

      const isAllCaps   = lineText === lineText.toUpperCase() && lineText.length > 3 && lineText.length < 80;
      const isShortLine = lineText.length < 60;
      const fontSize    = items[0]?.height || 0;

      if (prevY !== null && Math.abs(prevY - y) > 20) pageLines.push('');

      if (fontSize > 14 && isShortLine)    pageLines.push(`## ${lineText}`);
      else if (isAllCaps && isShortLine)   pageLines.push(`### ${toTitleCase(lineText)}`);
      else                                 pageLines.push(lineText);

      prevY = y;
    }

    if (pageLines.length > 0) {
      lines.push('---', `## Page ${pageNum}`, '', ...pageLines, '');
    }
  }
  return lines.join('\n');
}

function toTitleCase(str) {
  const minors = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of']);
  return str.toLowerCase().split(' ').map((w, i) =>
    (i === 0 || !minors.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}
