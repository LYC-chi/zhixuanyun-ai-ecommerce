'use strict';
/**
 * auth.js — 鉴权与权限（FR-26）
 * scrypt 口令散列 + HMAC 签名访问令牌；角色/菜单/数据范围三级权限。
 */
const crypto = require('crypto');

const SECRET = process.env.AIECP_SECRET || 'aiecp-2026-signing-key-do-not-change';
const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32).toString('hex');
  return s + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function signToken(payload) {
  const body = Object.assign({ iat: Date.now(), exp: Date.now() + TOKEN_TTL }, payload);
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  return p + '.' + sig;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [p, sig] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  if (sig !== expect) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/** 角色 → 权限矩阵（菜单级 + 数据范围） */
const ROLE_PERMISSIONS = {
  consumer: {
    label: '消费者',
    dataScope: 'self',
    menus: ['mall', 'cart', 'orders', 'ai_assistant', 'profile'],
  },
  merchant: {
    label: '商家',
    dataScope: 'own_shop',
    menus: ['mall', 'cart', 'orders', 'merchant_category', 'merchant_product', 'merchant_inventory', 'merchant_order', 'ai_assistant', 'profile'],
  },
  admin: {
    label: '平台管理员',
    dataScope: 'all',
    menus: ['mall', 'cart', 'orders', 'merchant_category', 'merchant_product', 'merchant_inventory',
      'console_dashboard', 'console_users', 'console_promotion', 'console_ai', 'console_knowledge', 'console_audit', 'ai_assistant', 'profile'],
  },
};

function permissionsOf(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.consumer;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, ROLE_PERMISSIONS, permissionsOf };
