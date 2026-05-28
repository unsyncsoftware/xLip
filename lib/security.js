import crypto from 'crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

const DEFAULT_RESERVED_SLUGS = new Set([
  'api', 'admin', 'auth', 'bio', 'connect', 'dashboard', 'login', 'logout',
  'register', 'support', 'about', 'legal', 'privacy', 'donate', 'pricing',
  'images', 'uploads', 'assets', 'static', 'favicon.ico', 'robots.txt',
  'sitemap.xml', 'webhooks', 'health', 'status', 'settings', 'user', 'users'
]);

const DEFAULT_ALLOWED_HOSTS = new Set([
  'xlip.uk',
  'www.xlip.uk',
  'localhost',
  '127.0.0.1',
  '100.77.215.54'
]);

export function requireSecret(name) {
  const value = process.env[name];
  if (!value || value === 'CHANGE_ME' || value.length < 32) {
    throw new Error(`${name} must be set to a strong secret of at least 32 characters`);
  }
  return value;
}

export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeHost(hostHeader = '') {
  const host = String(hostHeader).trim().toLowerCase().replace(/:\d+$/, '');
  return host;
}

export function isAllowedHost(hostHeader = '') {
  const host = normalizeHost(hostHeader);
  if (!host) return false;

  const configured = (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map(h => normalizeHost(h))
    .filter(Boolean);

  const allowedHosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]);
  return allowedHosts.has(host) || host.endsWith('.xlip.uk');
}

export function validateAlias(alias) {
  if (!alias) return { ok: true, value: null };
  const value = String(alias).trim();
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(value)) {
    return { ok: false, error: 'Alias must be 3-50 characters using only letters, numbers, hyphen, and underscore.' };
  }
  if (DEFAULT_RESERVED_SLUGS.has(value.toLowerCase())) {
    return { ok: false, error: 'That alias is reserved.' };
  }
  return { ok: true, value };
}

export function validatePublicHttpUrl(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'Only http and https URLs are allowed.' };
  }
  if (!parsed.hostname) {
    return { ok: false, error: 'Invalid URL host.' };
  }

  return { ok: true, url: parsed.toString(), parsed };
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized === '::' ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

export async function validateFetchablePublicUrl(input) {
  const validation = validatePublicHttpUrl(input);
  if (!validation.ok) return validation;

  const hostname = validation.parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'Local URLs are not allowed.' };
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    return { ok: false, error: 'Private network URLs are not allowed.' };
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.some(record => isPrivateIp(record.address))) {
      return { ok: false, error: 'Private network URLs are not allowed.' };
    }
  } catch {
    return { ok: false, error: 'URL host could not be resolved.' };
  }

  return validation;
}
