/**
 * visitor-tracker.js
 * Paste this file into each site's root, then add the script tag to your HTML.
 * OR just paste the inline snippet directly into your HTML <head>.
 */
(function () {
  const DASHBOARD = 'http://localhost:3100'; // change if dashboard is on another IP
  const SITE = location.hostname;            // auto-detects site name

  // Generate or retrieve session ID
  function getSession() {
    let sid = '';
    try { sid = sessionStorage.getItem('_vt'); } catch(e){}
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('_vt', sid); } catch(e){}
    }
    return sid;
  }

  // Parse User-Agent
  function parseUA() {
    const ua = navigator.userAgent;
    let browser = 'Other';
    if (ua.includes('Edg/'))       browser = 'Edge';
    else if (ua.includes('OPR/'))  browser = 'Opera';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/')) browser = 'Safari';

    let os = 'Other';
    if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';

    let device = 'Desktop';
    if (/Mobi|Android|iPhone/.test(ua)) device = 'Mobile';
    else if (/iPad|Tablet/.test(ua)) device = 'Tablet';

    return { browser, os, device };
  }

  function track() {
    const ua = parseUA();
    const payload = {
      sessionId: getSession(),
      site: SITE,
      path: location.pathname,
      title: document.title,
      referrer: document.referrer,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
    };
    fetch(DASHBOARD + '/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {}); // silently fail, never break the site
  }

  // Heartbeat every 60s to keep session alive
  function heartbeat() {
    fetch(DASHBOARD + '/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSession() }),
      keepalive: true
    }).catch(() => {});
  }

  // Track on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }

  // Track SPA navigation (if applicable)
  const _push = history.pushState;
  history.pushState = function () {
    _push.apply(history, arguments);
    setTimeout(track, 100);
  };
  window.addEventListener('popstate', () => setTimeout(track, 100));

  // Heartbeat
  setInterval(heartbeat, 60000);
})();
