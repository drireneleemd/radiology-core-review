let imageUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  imageUrl = params.get('imgUrl') || '';

  if (!imageUrl) {
    showStatus('error', 'No image URL found. Please right-click an image and try again.');
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('srcUrl').textContent = 'No URL found';
    return;
  }

  document.getElementById('srcUrl').textContent = imageUrl;

  const rawName = decodeURIComponent(imageUrl.split('/').pop().split('?')[0]) || 'image.png';
  document.getElementById('filename').value = sanitize(rawName);
  updateHint();

  // Load preview via background to bypass CORS/403
  loadPreview(imageUrl);

  document.getElementById('saveBtn').disabled = false;
});

// ── Preview — fetch via background service worker ─────────────────────────────
async function loadPreview(url) {
  const preview = document.getElementById('preview');
  const wrap    = document.querySelector('.preview-wrap');

  try {
    // Ask background.js to fetch the image bytes
    const response = await chrome.runtime.sendMessage({
      action: 'fetchImageBytes', url
    });

    if (response.error) throw new Error(response.error);

    // Convert base64 back to blob URL for display
    const byteChars = atob(response.base64);
    const byteArr   = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: response.mimeType || 'image/jpeg' });
    preview.src = URL.createObjectURL(blob);

  } catch (err) {
    preview.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'preview-unavailable';
    msg.textContent = 'Preview unavailable — image will still save correctly';
    wrap.appendChild(msg);
  }
}

// ── Hint ──────────────────────────────────────────────────────────────────────
function updateHint() {
  const sub  = document.getElementById('subspecialty').value;
  const file = document.getElementById('filename').value || '{filename}';
  document.getElementById('pathHint').textContent = `Saved to: static/images/${sub}/${file}`;
}

document.getElementById('subspecialty').addEventListener('change', updateHint);
document.getElementById('filename').addEventListener('input', updateHint);
document.getElementById('cancelBtn').addEventListener('click', () => window.close());

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', async () => {
  const btn          = document.getElementById('saveBtn');
  const subspecialty = document.getElementById('subspecialty').value;
  const filename     = document.getElementById('filename').value.trim();

  if (!imageUrl) {
    showStatus('error', 'No image URL. Please close and right-click an image again.');
    return;
  }
  if (!filename) {
    showStatus('error', 'Please enter a filename.');
    return;
  }

  const s = await chrome.storage.sync.get(['ghToken', 'ghRepo', 'ghBranch']);
  if (!s.ghToken || !s.ghRepo) {
    showStatus('error', 'GitHub token and repo not configured. Open the main popup → Settings.');
    return;
  }

  btn.disabled = true;
  const repoPath = `static/images/${subspecialty}/${sanitize(filename)}`;
  const branch   = s.ghBranch || 'main';

  try {
    showStatus('loading', 'Fetching image…');

    // Fetch via background to bypass 403
    const fetchResp = await chrome.runtime.sendMessage({
      action: 'fetchImageBytes', url: imageUrl
    });
    if (fetchResp.error) throw new Error(`Could not fetch image: ${fetchResp.error}`);
    const base64 = fetchResp.base64;

    showStatus('loading', 'Uploading to GitHub…');
    const apiUrl  = `https://api.github.com/repos/${s.ghRepo}/contents/${encodeURIPath(repoPath)}`;
    const check   = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${s.ghToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    const body = {
      message: `Add image ${filename} to ${subspecialty}`,
      content: base64,
      branch,
    };
    if (check.ok) body.sha = (await check.json()).sha;

    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${s.ghToken}`,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!put.ok) {
      const err = await put.json().catch(() => ({}));
      throw new Error(err.message || `GitHub error ${put.status}`);
    }

    showStatus('success', `✓ ${filename} saved to static/images/${subspecialty}/`);
    setTimeout(() => window.close(), 2500);

  } catch (err) {
    showStatus('error', `✗ ${escHtml(err.message)}`);
    btn.disabled = false;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._\-()\s]/g, '_').trim() || 'image.png';
}

function encodeURIPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function showStatus(type, html) {
  const el = document.getElementById('status');
  el.className = `status ${type}`;
  el.style.display = type === 'loading' ? 'flex' : 'block';
  el.innerHTML = type === 'loading'
    ? `<div class="spinner"></div><span>${html}</span>`
    : html;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
