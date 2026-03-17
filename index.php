<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xlip — Simple URL Shortener</title>
  <meta name="description" content="Xlip is a fast, simple, no-nonsense URL shortener." />

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :root {
      --bg: #0f172a;
      --card-bg: rgba(255, 255, 255, 0.08);
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      background: linear-gradient(135deg, #0f172a, #1e293b);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
      color: var(--text);
    }

    .card {
      width: 100%;
      max-width: 520px;
      padding: 28px;
      border-radius: 20px;
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      background-color: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h1 {
      font-size: 2rem;
      letter-spacing: -0.02em;
    }

    p {
      color: var(--muted);
      line-height: 1.5;
    }

    form {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }

    input[type="url"] {
      flex: 1;
      padding: 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background-color: rgba(255, 255, 255, 0.05);
      color: var(--text);
      font-size: 0.95rem;
      backdrop-filter: blur(8px);
    }

    input::placeholder {
      color: #94a3b8;
    }

    button {
      padding: 14px 18px;
      border-radius: 12px;
      border: none;
      background: var(--accent);
      color: #020617;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }

    button:hover {
      opacity: 0.9;
    }

    .note {
      font-size: 0.85rem;
      color: var(--muted);
    }

    footer {
      margin-top: 24px;
      font-size: 0.8rem;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }

    footer a {
      color: #64748b;
      text-decoration: none;
    }

    footer a:hover {
      color: var(--accent);
    }

  </style>
</head>
<body>
  <div class="card">
    <h1>Xlip</h1>
    <p>Shorten long links into clean, reliable URLs.</p>

    <form onsubmit="event.preventDefault(); alert('Shortener backend coming soon 👀');">
      <input
        type="url"
        placeholder="Paste a long URL here…"
        required
      />
      <button type="submit">Shorten</button>
    </form>

    <div class="note">
      Free, fast, and minimal. No accounts. No tracking bloat.
    </div>

    <footer>
      <span>© <span id="year"></span> Xlip</span>
      <a href="https://unsyncsoftware.com" target="_blank" rel="noopener">
        by Unsync Software
      </a>
    </footer>
  </div>

  <script>
    document.getElementById("year").textContent = new Date().getFullYear();
  </script>
</body>
</html>
