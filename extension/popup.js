// popup.js — converts PDF to Markdown in-browser, pushes .md to GitHub

let currentItem = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await detectContent();
  setupListeners();
});

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.sync.get(['ghToken','ghRepo','ghBranch']);
  if (s.ghToken)  document.getElementById('cfgToken').value  = s.ghToken;
  if (s.ghRepo)   document.getElementById('cfgRepo').value   = s.ghRepo;
  document.getElementById('cfgBranch').value = s.ghBranch || 'main';
}

function setupListeners() {
  document.getElementById('settingsToggle').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('open');
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const token  = document.getElementById('cfgToken').value.trim();
    const repo   = document.getElementById('cfgRepo').value.trim();
    const branch = document.getElementById('cfgBranch').value.trim() || 'main';
    await chrome.storage.sync.set({ ghToken: token, ghRepo: repo, ghBranch: branch });
    const el = document.getElementById('saveStatus');
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 2000);
  });

  document.getElementById('sendBtn').addEventListener('click', convertAndSend);
}

// ── Content detection ─────────────────────────────────────────────────────────
async function detectContent() {
  const detectedArea = document.getElementById('detectedArea');
  const formArea     = document.getElementById('formArea');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab.url || '';

    // Case 1: tab itself is a PDF
    if (isPdfUrl(url)) {
      currentItem = { type: 'pdf', url, filename: extractFilename(url) };
      showDetected('📄', 'PDF Document', currentItem.filename, url);
      formArea.style.display = 'block';
      document.getElementById('customName').placeholder = mdFilename(currentItem.filename);
      return;
    }

    // Case 2: run detectOnPage — checks for article text, PDF links, images
    const pageResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectOnPage,
    });

    const found = pageResults?.[0]?.result;

    if (found?.type === 'webpage') {
      currentItem = found;
      showDetected('🌐', 'Webpage Article', found.filename, url);
      formArea.style.display = 'block';
      document.getElementById('customName').placeholder = found.filename;
      return;
    }

    if (found?.type === 'pdf') {
      currentItem = found;
      showDetected('📄', 'PDF Link on Page', found.filename, found.url);
      formArea.style.display = 'block';
      document.getElementById('customName').placeholder = mdFilename(found.filename);
      return;
    }

    if (found?.type === 'image') {
      currentItem = found;
      showDetected('🖼️', 'Image on Page', found.filename, found.url);
      formArea.style.display = 'block';
      document.getElementById('customName').placeholder = found.filename;
      return;
    }

    detectedArea.innerHTML = `
      <div class="no-content">
        <div class="big-icon">🔍</div>
        <p>No article, PDF, or image detected.<br>
        Navigate to an article or PDF page and try again.</p>
      </div>`;

  } catch (err) {
    detectedArea.innerHTML = `
      <div class="no-content">
        <div class="big-icon">⚠️</div>
        <p>Could not inspect this page.<br><small>${escHtml(err.message)}</small></p>
      </div>`;
  }
}

function showDetected(icon, typeLabel, filename, url) {
  document.getElementById('detectedArea').innerHTML = `
    <div class="detected">
      <div class="detected-icon">${icon}</div>
      <div>
        <div class="detected-type">${typeLabel}</div>
        <div class="detected-url">${escHtml(filename || url)}</div>
      </div>
    </div>`;
}

// Runs inside page context — detects article text, PDF links, or images
function detectOnPage() {
  // ── 1. Try to extract article/main text from the page ──
  const ARTICLE_SELECTORS = [
    'article',
    '[role="main"]',
    'main',
    '.article-body',
    '.article-content',
    '.fulltext',
    '.content-body',
    '#content',
    '.body-text',
  ];

  let articleEl = null;
  for (const sel of ARTICLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 500) {
      articleEl = el;
      break;
    }
  }

  if (articleEl) {
    // Get title
    const title =
      document.querySelector('h1')?.innerText?.trim() ||
      document.querySelector('meta[name="citation_title"]')?.content ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title ||
      'article';

    // Get authors/journal metadata if available
    const authors = document.querySelector('meta[name="citation_authors"]')?.content ||
                    document.querySelector('.authors')?.innerText?.trim() || '';
    const journal = document.querySelector('meta[name="citation_journal_title"]')?.content || '';
    const doi     = document.querySelector('meta[name="citation_doi"]')?.content || '';

    // Filename from title
    const filename = title.replace(/[^a-zA-Z0-9\s]/g, '').trim()
                          .replace(/\s+/g, '_').slice(0, 80) + '.md';

    return {
      type: 'webpage',
      filename,
      title,
      authors,
      journal,
      doi,
      url: window.location.href,
      // Pass the HTML so background can convert it cleanly
      html: articleEl.innerHTML,
    };
  }

  // ── 2. Selected or first PDF link ──
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const link = (node.nodeType === 1 ? node : node.parentElement)?.closest('a[href]');
    if (link && (link.href.toLowerCase().includes('.pdf') || link.href.toLowerCase().includes('/pdf/'))) {
      return { type: 'pdf', url: link.href,
               filename: link.href.split('/').pop().split('?')[0] || 'document.pdf' };
    }
  }
  const pdfLink = Array.from(document.querySelectorAll('a[href]'))
    .find(a => a.href.toLowerCase().includes('.pdf') || a.href.toLowerCase().includes('/pdf/'));
  if (pdfLink) {
    return { type: 'pdf', url: pdfLink.href,
             filename: pdfLink.href.split('/').pop().split('?')[0] || 'document.pdf' };
  }

  // ── 3. Focused image ──
  const img = document.activeElement;
  if (img?.tagName === 'IMG' && img.src) {
    return { type: 'image', url: img.src,
             filename: img.src.split('/').pop().split('?')[0] || 'image.png' };
  }

  return null;
}

// ── Convert + Send ────────────────────────────────────────────────────────────
async function convertAndSend() {
  const btn = document.getElementById('sendBtn');
  if (!currentItem) return;

  const s = await chrome.storage.sync.get(['ghToken','ghRepo','ghBranch']);
  if (!s.ghToken || !s.ghRepo) {
    showStatus('error', '⚠️ Configure GitHub token and repo in Settings first.');
    return;
  }

  const subspecialty = document.getElementById('subspecialty').value;
  const customRaw    = document.getElementById('customName').value.trim();
  const branch       = s.ghBranch || 'main';
  btn.disabled = true;

  try {
    let content, repoPath;

    if (currentItem.type === 'webpage') {
      // ── Webpage → convert HTML to Markdown in background ──
      showStatus('loading', 'Converting page to Markdown…');
      const markdown = await htmlToMarkdown(currentItem);
      const mdName   = sanitize(customRaw || currentItem.filename);
      repoPath       = `data/${subspecialty}/${mdName}`;
      content        = markdown;

      showStatus('loading', 'Pushing Markdown to GitHub…');
      const b64 = btoa(unescape(encodeURIComponent(content)));
      await pushToGitHub(s.ghToken, s.ghRepo, branch, repoPath, b64,
        `Add ${mdName} to ${subspecialty} (from webpage)`);
      showStatus('success',
        `✓ <strong>${mdName}</strong> saved to <em>${subspecialty}</em> on GitHub.<br>` +
        `Run <code>git pull</code> locally to update your search index.`);
      btn.disabled = false;
      return;
    }

    if (currentItem.type === 'pdf') {
      // ── PDF → extract text → Markdown ──
      showStatus('loading', 'Fetching PDF…');
      const pdfBytes = await fetchBytes(currentItem.url);

      showStatus('loading', 'Extracting text with PDF.js…');
      const markdown = await pdfToMarkdown(pdfBytes, currentItem.filename);

      const mdName  = sanitize(customRaw || mdFilename(currentItem.filename));
      repoPath      = `data/${subspecialty}/${mdName}`;
      content       = markdown;

    } else {
      // ── Image → push as-is (base64 → binary on GitHub) ──
      showStatus('loading', 'Fetching image…');
      const imgBytes = await fetchBytes(currentItem.url);
      const imgName  = sanitize(customRaw || currentItem.filename);
      repoPath       = `data/${subspecialty}/${imgName}`;
      content        = arrayBufferToBase64(imgBytes);

      await pushToGitHub(s.ghToken, s.ghRepo, branch, repoPath, content,
        `Add image ${imgName} to ${subspecialty}`, true);
      showStatus('success',
        `✓ <strong>${imgName}</strong> saved to <em>${subspecialty}</em> on GitHub.`);
      btn.disabled = false;
      return;
    }

    // Push Markdown as UTF-8 text (base64-encoded for GitHub API)
    showStatus('loading', 'Pushing Markdown to GitHub…');
    const b64 = btoa(unescape(encodeURIComponent(content)));
    await pushToGitHub(s.ghToken, s.ghRepo, branch, repoPath, b64,
      `Add ${repoPath} (converted from PDF)`);

    showStatus('success',
      `✓ <strong>${repoPath.split('/').pop()}</strong> saved to ` +
      `<em>${subspecialty}</em> on GitHub.<br>` +
      `Run <code>git pull</code> locally to update your search index.`);

  } catch (err) {
    showStatus('error', `✗ ${escHtml(err.message)}`);
  } finally {
    btn.disabled = false;
  }
}

// ── Webpage HTML → Markdown (via background) ────────────────────────────────
async function htmlToMarkdown(item) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'convertHtml', html: item.html, title: item.title,
        authors: item.authors, journal: item.journal, doi: item.doi, url: item.url },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (response.error)      reject(new Error(response.error));
        else                          resolve(response.markdown);
      }
    );
  });
}

// ── PDF.js text extraction → Markdown ────────────────────────────────────────
async function pdfToMarkdown(arrayBuffer, filename) {
  // Load pdf.js from CDN via background service worker (avoids CSP issues)
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'convertPdf', buffer: Array.from(new Uint8Array(arrayBuffer)), filename },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (response.error)      reject(new Error(response.error));
        else                          resolve(response.markdown);
      }
    );
  });
}

// ── GitHub API ────────────────────────────────────────────────────────────────
async function pushToGitHub(token, repo, branch, path, base64Content, message, isBinary = false) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIPath(path)}`;

  // Check for existing file (need SHA to update)
  const check = await fetch(apiUrl, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' }
  });
  const body = { message, content: base64Content, branch };
  if (check.ok) body.sha = (await check.json()).sha;

  const resp = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub error ${resp.status}`);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
async function fetchBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url} (${resp.status})`);
  return resp.arrayBuffer();
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function isPdfUrl(url) {
  return /\.pdf($|\?)/i.test(url) || url.includes('/pdf/');
}

function extractFilename(url) {
  try {
    return new URL(url).pathname.split('/').pop().split('?')[0] || 'document.pdf';
  } catch { return 'document.pdf'; }
}

function mdFilename(pdfName) {
  return pdfName.replace(/\.pdf$/i, '.md').replace(/[^a-zA-Z0-9._\-()\s]/g, '_');
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._\-()\s]/g, '_').trim() || 'document.md';
}

function encodeURIPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function showStatus(type, html) {
  const el = document.getElementById('statusMsg');
  el.className = `status ${type}`;
  el.style.display = type === 'loading' ? 'flex' : 'block';
  el.innerHTML = type === 'loading'
    ? `<div class="spinner"></div><span>${html}</span>`
    : html;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
