let isLoginMode = true;
let pendingEmail = '';
let usernameCheckTimer = null;
let turnstileToken = null;
const token = localStorage.getItem('xlip_token');
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const escapeAttr = escapeHtml;

window.onload = () => {
  if (token) {
    document.getElementById('top-nav').innerHTML = '';
    document.getElementById('alias-container').classList.add('visible');
    document.getElementById('dashboard-section').classList.add('visible');
    loadDashboard();
    loadBioCard();
    loadSubdomainCard();
    loadAdminDashboard();
    loadUsageCard();
  }

  // Render invisible Turnstile on page load
  if (typeof turnstile !== 'undefined') {
    turnstile.render('#turnstile-container', {
      sitekey: '0x4AAAAAADDU52-5oY9pwrR1',
      size: 'invisible',
      callback: (token) => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = null; },
      'error-callback': () => { turnstileToken = null; }
    });
  }
};

// ── AUTH MODAL ──

function openAuth(loginMode) {
  isLoginMode = loginMode;
  document.getElementById('auth-title').innerText = loginMode ? 'login' : 'register';
  document.getElementById('auth-toggle-text').innerText = loginMode ? "don't have an account?" : "already a member?";
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('verify-screen').style.display = 'none';
  document.getElementById('username-screen').style.display = 'none';
  document.getElementById('auth-modal').classList.add('open');
}

function closeAuth() {
  document.getElementById('auth-modal').classList.remove('open');
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('auth-title').innerText = isLoginMode ? 'login' : 'register';
  document.getElementById('auth-toggle-text').innerText = isLoginMode ? "don't have an account?" : "already a member?";
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';

  if (!isLoginMode) {
    // Execute invisible Turnstile challenge
    if (typeof turnstile !== 'undefined') {
      turnstile.execute('#turnstile-container');
      // Wait up to 5 seconds for token
      let waited = 0;
      while (!turnstileToken && waited < 5000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }
      if (!turnstileToken) {
        alert('Security check failed. Please try again.');
        return;
      }
    }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email, 
      password, 
      turnstileToken: isLoginMode ? null : turnstileToken 
    })
  });

  const data = await res.json();

  // Reset Turnstile after use
  if (!isLoginMode && typeof turnstile !== 'undefined') {
    turnstile.reset('#turnstile-container');
    turnstileToken = null;
  }

  if (res.ok) {
    if (isLoginMode) {
      localStorage.setItem('xlip_token', data.token);
      location.reload();
    } else {
      pendingEmail = email;
      document.getElementById('verify-email-label').innerText = email;
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('verify-screen').style.display = 'block';
    }
  } else if (res.status === 403 && data.unverified) {
    pendingEmail = data.email;
    document.getElementById('verify-email-label').innerText = data.email;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('verify-screen').style.display = 'block';
  } else {
    alert(data.error);
  }
}

// ── VERIFY CODE ──

async function verifyCode() {
  const code = document.getElementById('verify-code').value.trim();
  if (!code) return;

  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail, code })
  });

  const data = await res.json();

  if (res.ok) {
    // Verified — show username claim screen
    document.getElementById('verify-screen').style.display = 'none';
    document.getElementById('username-screen').style.display = 'block';
  } else {
    alert(data.error);
  }
}

async function resendCode() {
  const res = await fetch('/api/auth/resend-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail })
  });
  const data = await res.json();
  alert(res.ok ? 'New code sent! Check your email.' : data.error);
}

// ── USERNAME CLAIM ──

function checkClaimUsername(val) {
  clearTimeout(usernameCheckTimer);
  const statusEl = document.getElementById('claim-status');

  if (!val) { statusEl.textContent = ''; return; }

  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(val)) {
    statusEl.textContent = 'Letters, numbers, _ or - only (3–30 chars)';
    statusEl.className = 'username-claim-status err';
    return;
  }

  statusEl.textContent = 'Checking...';
  statusEl.className = 'username-claim-status';

  usernameCheckTimer = setTimeout(async () => {
    const res = await fetch(`/api/bio/check-username/${val}`);
    const data = await res.json();
    if (data.available) {
      statusEl.textContent = '✓ Available';
      statusEl.className = 'username-claim-status ok';
    } else {
      statusEl.textContent = '✗ Already taken';
      statusEl.className = 'username-claim-status err';
    }
  }, 500);
}

async function setUsername() {
  const username = document.getElementById('claim-username').value.trim();
  const statusEl = document.getElementById('claim-status');

  if (!username) { alert('Please enter a username'); return; }
  if (statusEl.classList.contains('err')) { alert('Username is not available'); return; }

  // First login to get token
  const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail, password: document.getElementById('auth-pass').value })
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok) { alert('Login failed. Please login manually.'); closeAuth(); return; }

  localStorage.setItem('xlip_token', loginData.token);

  // Now create the bio profile with username
  const bioRes = await fetch('/api/bio/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token}`
    },
    body: JSON.stringify({ username })
  });

  if (bioRes.ok) {
    location.reload();
  } else {
    const bioData = await bioRes.json();
    alert(bioData.error || 'Could not save username');
  }
}

async function skipUsername() {
  // Just login without setting a username
  const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail, password: document.getElementById('auth-pass').value })
  });

  const loginData = await loginRes.json();
  if (loginRes.ok) {
    localStorage.setItem('xlip_token', loginData.token);
    location.reload();
  } else {
    // Token login fallback — just close and ask to login manually
    closeAuth();
    openAuth(true);
    document.getElementById('auth-email').value = pendingEmail;
  }
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-modal').addEventListener('click', function(e) {
    if (e.target === this) closeAuth();
  });
});

// ── SHORTEN ──

async function shorten() {
  const urlInput = document.getElementById('longUrl');
  const aliasInput = document.getElementById('customAlias');
  const longUrl = urlInput.value;
  if (!longUrl) return;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers,
    body: JSON.stringify({ longUrl, customAlias: aliasInput ? aliasInput.value : '' })
  });

  if (res.status === 429) {
    alert("Limit reached! Guests get 5/hr. Please login!");
    return;
  }

  const data = await res.json();

  if (res.ok) {
    urlInput.value = '';
    if (aliasInput) aliasInput.value = '';

    const resDiv = document.getElementById('result');
    resDiv.innerHTML = `
      <div class="result-box" id="shorten-result-box">
        <span class="result-url">${escapeHtml(data.shortUrl)}</span>
        <span class="result-hint">click to copy your link</span>
      </div>
    `;
    document.getElementById('shorten-result-box').addEventListener('click', (event) => {
      navigator.clipboard.writeText(data.shortUrl);
      event.currentTarget.querySelector('.result-hint').innerText = 'copied!';
    });

    if (token) loadDashboard();
  } else {
    alert(data.error);
  }
}

// ── BIO CARD ──

async function loadBioCard() {
  const bioCard = document.getElementById('bio-card');
  if (!bioCard) return;

  const res = await fetch('/api/bio/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();

  if (data && data.username) {
    // Has a bio profile
    bioCard.innerHTML = `
      <div class="bio-card-left">
        <span class="bio-card-label">your bio link</span>
        <a href="/${encodeURIComponent(data.username)}" target="_blank" class="bio-card-url">xlip.uk/${escapeHtml(data.username)}</a>
      </div>
      <a href="/bio-edit.html" class="edit-bio-btn">edit bio</a>
    `;
  } else {
    // No bio profile yet
    bioCard.innerHTML = `
      <div class="bio-card-left">
        <span class="bio-card-label">link in bio</span>
        <span style="font-size:13px; color:var(--text-dim); font-weight:300;">create a bio page to share all your links in one place</span>
      </div>
      <a href="/bio-edit.html" class="create-bio-btn">create bio page</a>
    `;
  }
}

// ── SUBDOMAIN CARD ──

let subdomainCheckTimer = null;

async function loadSubdomainCard() {
  const card = document.getElementById('subdomain-card');
  if (!card) return;

  const res = await fetch('/api/subdomain/mine', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();

  if (data && data.subdomain) {
    // Has a subdomain
    card.innerHTML = `
      <div class="bio-card-left">
        <span class="bio-card-label">your short link domain</span>
        <a href="https://${encodeURIComponent(data.subdomain)}.xlip.uk" target="_blank" class="bio-card-url">${escapeHtml(data.subdomain)}.xlip.uk</a>
      </div>
      <button class="create-bio-btn" onclick="releaseSubdomain()" style="border-color:#e05a5a; color:#e05a5a;">release</button>
    `;
  } else {
    // No subdomain yet
    card.innerHTML = `
      <div class="bio-card-left" style="flex:1">
        <span class="bio-card-label">custom short domain</span>
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap;">
          <div class="subdomain-claim-row">
            <div class="subdomain-prefix">https://</div>
            <input class="subdomain-input" id="subdomain-input" type="text"
              placeholder="yourname" maxlength="63"
              oninput="checkSubdomain(this.value)">
            <div class="subdomain-suffix">.xlip.uk</div>
          </div>
          <span class="subdomain-status" id="subdomain-status"></span>
        </div>
      </div>
      <button class="edit-bio-btn" onclick="claimSubdomain()" style="margin-top:0">claim</button>
    `;
  }
}

function checkSubdomain(val) {
  clearTimeout(subdomainCheckTimer);
  const statusEl = document.getElementById('subdomain-status');
  if (!statusEl) return;

  if (!val) { statusEl.textContent = ''; return; }

  if (!/^[a-zA-Z0-9-]{3,63}$/.test(val)) {
    statusEl.textContent = '✗ invalid';
    statusEl.className = 'subdomain-status err';
    return;
  }

  statusEl.textContent = '...';
  statusEl.className = 'subdomain-status';

  subdomainCheckTimer = setTimeout(async () => {
    const res = await fetch(`/api/subdomain/check/${val}`);
    const data = await res.json();
    if (data.available) {
      statusEl.textContent = '✓ available';
      statusEl.className = 'subdomain-status ok';
    } else {
      statusEl.textContent = '✗ taken';
      statusEl.className = 'subdomain-status err';
    }
  }, 500);
}

async function claimSubdomain() {
  const input = document.getElementById('subdomain-input');
  const statusEl = document.getElementById('subdomain-status');
  if (!input) return;

  const subdomain = input.value.trim();
  if (!subdomain) { alert('Enter a subdomain first'); return; }
  if (statusEl && statusEl.classList.contains('err')) { alert('Subdomain not available'); return; }

  const res = await fetch('/api/subdomain/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ subdomain })
  });

  const data = await res.json();
  if (res.ok) {
    loadSubdomainCard();
  } else {
    alert(data.error || 'Could not claim subdomain');
  }
}

async function releaseSubdomain() {
  if (!confirm('Release your subdomain? This cannot be undone.')) return;

  const res = await fetch('/api/subdomain/mine', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (res.ok) {
    loadSubdomainCard();
  } else {
    alert('Could not release subdomain');
  }
}

async function loadDashboard() {
  const res = await fetch('/api/user/links', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const links = await res.json();
  const table = document.getElementById('links-table-body');

  table.innerHTML = links.map(link => `
    <tr>
      <td>
        <div class="td-short">xlip.uk/${escapeHtml(link.custom_alias || link.short_code)}</div>
        <div class="td-long"><input type="text" id="edit-url-${Number(link.id)}" value="${escapeAttr(link.long_url)}"></div>
      </td>
      <td class="td-pw">
        <input type="password" id="edit-pw-${Number(link.id)}" placeholder="set password">
      </td>
      <td style="text-align:center">
        <span class="clicks-badge">${Number(link.clicks) || 0}</span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-save" onclick="updateLink(${Number(link.id)})">save</button>
          <button class="btn-qr" onclick="showQR(${Number(link.id)})">qr</button>
          <button class="btn-del" onclick="deleteLink(${Number(link.id)})">delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadAdminDashboard() {
  const res = await fetch('/api/admin/all-links', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return;

  const links = await res.json();
  document.getElementById('admin-section').classList.add('visible');
  document.getElementById('total-links').innerHTML = `${links.length}<span>total links</span>`;

  const table = document.getElementById('admin-table-body');
  table.innerHTML = links.map(link => `
    <tr>
      <td>${escapeHtml(link.owner_email)}</td>
      <td class="td-short">xlip.uk/${escapeHtml(link.short_code)}</td>
      <td style="text-align:center">${Number(link.clicks) || 0}</td>
      <td>
        <div class="action-btns">
          <button class="btn-del" onclick="deleteLink(${Number(link.id)})">delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteLink(id) {
  if (!confirm("Are you sure you want to delete this link?")) return;
  const res = await fetch(`/api/user/links/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) loadDashboard();
}

async function updateLink(id) {
  const newUrl = document.getElementById(`edit-url-${id}`).value;
  const newPass = document.getElementById(`edit-pw-${id}`).value;

  const res = await fetch(`/api/user/links/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ longUrl: newUrl, password: newPass })
  });

  if (res.ok) {
    alert("Link updated!");
    loadDashboard();
  } else {
    alert("Error updating link.");
  }
}

async function showQR(id) {
  const res = await fetch(`/api/user/links/${id}/qr`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();

  const qrWindow = window.open("", "QR Code", "width=300,height=320");
  qrWindow.document.write(`
    <body style="background:#0e1628; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#cdd8f0; font-family:sans-serif; height:100vh; margin:0;">
      <img src="${data.qr}" style="width:200px; border:2px solid #1e2d47;" />
      <p style="margin-top:12px; font-size:12px; color:#5a6a85;">scan to open xlip link</p>
      <button onclick="window.close()" style="margin-top:10px; background:#152035; color:#5a6a85; border:1px solid #1e2d47; padding:6px 14px; cursor:pointer; font-size:11px;">close</button>
    </body>
  `);
}

async function loadUsageCard() {
  const card = document.getElementById('usage-card');
  if (!card) return;

  const res = await fetch('/api/user/usage', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();
  if (!res.ok) return;

  const pct = Math.round((data.used / data.limit) * 100);
  const barColor = pct >= 90 ? '#e05a5a' : pct >= 70 ? '#f0a500' : 'var(--lime)';
  const resetDate = new Date(data.resets_at);
  const resetMonth = resetDate.toLocaleString('default', { month: 'long' });

  card.innerHTML = `
    <div style="flex:1">
      <span class="bio-card-label">monthly usage � ${data.plan} plan</span>
      <div style="display:flex; align-items:baseline; gap:6px; margin:6px 0 8px;">
        <span style="font-family:'Space Mono',monospace; font-size:22px; color:${barColor};">${data.used}</span>
        <span style="font-size:12px; color:var(--text-muted);">/ ${data.limit} links</span>
        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">resets ${resetMonth}</span>
      </div>
      <div style="width:100%; height:3px; background:var(--navy-border); border-radius:2px;">
        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:2px; transition:width 0.4s;"></div>
      </div>
    </div>
    ${data.plan === 'free' ? `
      <a href="#pricing" class="create-bio-btn" style="white-space:nowrap; align-self:center;">upgrade to pro</a>
    ` : `
      <span style="font-family:'Space Mono',monospace; font-size:10px; color:var(--lime); letter-spacing:0.1em; align-self:center;">PRO ?</span>
    `}
  `;
}

function toggleApiKeyCard() {
  const card = document.getElementById('api-key-card');
  if (!card) return;
  if (card.style.display === 'none' || card.style.display === '') {
    card.style.display = 'flex';
  } else {
    card.style.display = 'none';
  }
}

async function generateApiKey() {
  if (!confirm('Generate a new API key? This will invalidate your current key if you have one.')) return;

  const res = await fetch('/api/v1/auth/generate-key', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();

  if (res.ok && data.api_key) {
    const input = document.getElementById('api-key-value');
    const copyBtn = document.getElementById('copy-key-btn');
    input.value = data.api_key;
    copyBtn.style.display = 'inline-block';
  } else {
    alert(data.error || 'Could not generate API key');
  }
}

function copyApiKey() {
  const input = document.getElementById('api-key-value');
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById('copy-key-btn');
    btn.innerText = 'copied!';
    setTimeout(() => { btn.innerText = 'copy'; }, 2000);
  });
}

function logout() {
  localStorage.removeItem('xlip_token');
  location.reload();
}

// ── LINK CHECKER ──
async function checkLink() {
  const url = document.getElementById('checkUrl').value.trim();
  const resultDiv = document.getElementById('checker-result');

  if (!url) return;

  resultDiv.innerHTML = '<p style="color:var(--text-dim); font-size:13px;">checking...</p>';

  try {
    const res = await fetch('/api/v1/unshorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 429) {
        resultDiv.innerHTML = `
          <p class="checker-unsafe">⚠️ You've used your 20 free checks today.</p>
          <p style="font-size:12px; color:var(--text-dim); margin-top:8px;">
            Upgrade to <a href="/pricing.html" style="color:var(--lime);">Pro</a> for unlimited link checks.
          </p>
        `;
      } else {
        resultDiv.innerHTML = `<p class="checker-unsafe">⚠️ ${escapeHtml(data.error)}</p>`;
      }
      return;
    }

    const safetyBadge = data.isSafe
      ? `<p class="checker-safe">✅ Safe — no threats detected</p>`
      : `<p class="checker-unsafe">🚨 Dangerous — ${escapeHtml(data.threat.replace(/_/g, ' ').toLowerCase())}</p>`;

    document.getElementById('checkUrl').value = '';

    resultDiv.innerHTML = `
      ${safetyBadge}
      <p class="checker-url">→ ${escapeHtml(data.finalUrl)}</p>
      <button class="checker-copy" id="checker-copy-btn">copy final url</button>
    `;
    document.getElementById('checker-copy-btn').addEventListener('click', (event) => {
      navigator.clipboard.writeText(data.finalUrl).then(() => {
        event.currentTarget.textContent = 'copied!';
      }).catch(() => {});
    });
  } catch {
    resultDiv.innerHTML = '<p class="checker-unsafe">⚠️ Network error. Please try again.</p>';
  }
}
