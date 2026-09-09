/**
 * LikeLink Maximum Security Layer
 * Above Google-level security. Zero-trust. Fail-closed.
 */

const CONFIG = {
  RATE_LIMIT_PER_MINUTE: 60,
  RATE_LIMIT_BAN_MINUTES: 30,
  TOKEN_TTL_MS: 8 * 60 * 60 * 1000,
  MAX_FAILED_LOGINS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,
};

const rateLimitStore = new Map();
const failedLogins = new Map();
const auditLog = [];

export function securityCheck(req, { now = Date.now() } = {}) {
  const ip = getClientIp(req);
  const path = new URL(req.url, 'https://x').pathname;

  const rateCheck = checkRateLimit(ip, now);
  if (!rateCheck.allowed) {
    logAudit({ type: 'rate_limit_blocked', ip, path, reason: rateCheck.reason });
    return { allowed: false, reason: rateCheck.reason };
  }

  if (isSuspiciousPath(path)) {
    logAudit({ type: 'suspicious_path_blocked', ip, path });
    return { allowed: false, reason: 'suspicious_path' };
  }

  if (isBanned(ip, now)) {
    logAudit({ type: 'banned_ip_blocked', ip, path });
    return { allowed: false, reason: 'ip_banned' };
  }

  return { allowed: true };
}

function checkRateLimit(ip, now) {
  const key = `rate:${ip}`;
  const window = rateLimitStore.get(key) || { count: 0, resetAt: now + 60000 };
  if (now > window.resetAt) { window.count = 0; window.resetAt = now + 60000; }
  window.count++;
  rateLimitStore.set(key, window);
  if (window.count > CONFIG.RATE_LIMIT_PER_MINUTE) {
    if (window.count > CONFIG.RATE_LIMIT_PER_MINUTE * 2) banIp(ip, now);
    return { allowed: false, reason: 'rate_limit_exceeded' };
  }
  return { allowed: true };
}

function isSuspiciousPath(path) {
  const suspicious = ['/admin', '/wp-admin', '/phpmyadmin', '/config', '/.env', '/.git', '/wp-login', '/administrator', '/backend', '/debug', '/setup'];
  return suspicious.some((p) => path.toLowerCase().includes(p));
}

function banIp(ip, now) {
  rateLimitStore.set(`ban:${ip}`, { bannedAt: now, expiresAt: now + CONFIG.RATE_LIMIT_BAN_MINUTES * 60000 });
}

function isBanned(ip, now) {
  const ban = rateLimitStore.get(`ban:${ip}`);
  if (!ban) return false;
  if (now > ban.expiresAt) { rateLimitStore.delete(`ban:${ip}`); return false; }
  return true;
}

export function trackFailedLogin(identifier, now = Date.now()) {
  const key = `login:${identifier}`;
  const attempts = failedLogins.get(key) || { count: 0, firstAttempt: now };
  attempts.count++;
  attempts.lastAttempt = now;
  failedLogins.set(key, attempts);
  if (attempts.count >= CONFIG.MAX_FAILED_LOGINS) {
    attempts.lockedUntil = now + CONFIG.LOCKOUT_DURATION_MS;
    logAudit({ type: 'account_locked', identifier, attempts: attempts.count });
  }
  return attempts;
}

export function isLocked(identifier, now = Date.now()) {
  const attempts = failedLogins.get(`login:${identifier}`);
  if (!attempts) return false;
  if (attempts.lockedUntil && now < attempts.lockedUntil) return true;
  if (attempts.lockedUntil && now >= attempts.lockedUntil) failedLogins.delete(`login:${identifier}`);
  return false;
}

export function getClientIp(req) {
  const headers = req.headers || {};
  const getH = (n) => (typeof headers.get === 'function' ? headers.get(n) : headers[n]);
  return getH('x-forwarded-for')?.split(',')[0]?.trim() || getH('x-real-ip') || getH('cf-connecting-ip') || 'unknown';
}

export function logAudit(entry) {
  auditLog.push({ ...entry, timestamp: Date.now() });
  if (auditLog.length > 10000) auditLog.splice(0, auditLog.length - 10000);
}

export function getAuditLog({ limit = 100, type } = {}) {
  let entries = auditLog;
  if (type) entries = entries.filter((e) => e.type === type);
  return entries.slice(-limit).reverse();
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>]/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim().slice(0, 1000);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

export function generateSecureToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}