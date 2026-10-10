#!/usr/bin/env node
'use strict';
/**
 * test-browser.js —— 用 jsdom 真实加载 docs/index.html，验证静态站在浏览器环境可运行。
 * 需要先在本机启动 docs 静态服务器（默认 4100 端口）。
 * 运行：NODE_PATH=<workspace>/node_modules node tools/test-browser.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = process.env.STATIC_BASE || 'http://127.0.0.1:4100/';
const INDEX = path.join(__dirname, '..', 'docs', 'index.html');

let ok = 0, fail = 0;
function P(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const errors = [];

  const dom = new JSDOM(html, {
    url: BASE,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom 不提供 fetch / Response / WebCrypto，注入 Node 的实现
      window.Response = Response;
      window.Headers = Headers;
      window.Request = Request;
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.AbortController = AbortController;
      Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true });
      // 为「非 /api 请求走原生 fetch」这条用例提供可用的原生实现（绝对化相对地址）
      window.fetch = (input, init) => {
        const url = (typeof input === 'string') ? new URL(input, BASE).href : input;
        return globalThis.fetch(url, init);
      };
      window.addEventListener('error', (e) => errors.push(String(e.message)));
    },
  });

  const { window } = dom;
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + (e.reason && e.reason.message)));

  // 等待脚本加载与启动
  await new Promise((res) => {
    if (window.document.readyState === 'complete') return res();
    window.addEventListener('load', res);
    setTimeout(res, 8000);
  });

  // 等 SPA 完成首屏渲染
  for (let i = 0; i < 40; i++) {
    if (window.AIECP_READY && window.document.querySelector('#app').innerHTML.length > 200) break;
    await sleep(120);
  }

  P('vendor.js 已在浏览器内完成服务启动', window.AIECP_READY === true,
    window.__AIECP_BOOT_ERROR__ ? String(window.__AIECP_BOOT_ERROR__.message) : 'ready');
  P('无脚本运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  const appHtml = window.document.querySelector('#app').innerHTML;
  P('SPA 首屏已渲染', appHtml.length > 200, appHtml.length + ' 字符');
  P('页面标题正确', /智选云/.test(window.document.title), window.document.title);

  // 通过页面的 fetch（已被 boot.js 劫持）验证真实请求链路
  async function api(method, url, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let timer;
    const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('请求超时 ' + method + ' ' + url)), 15000); });
    try {
      const r = await Promise.race([
        window.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }),
        guard,
      ]);
      const json = await r.json().catch(() => null);
      return { status: r.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  async function step(name, fn) {
    try { return await fn(); } catch (e) {
      fail++; console.log('  FAIL ' + name + '  → 异常: ' + (e && e.message));
      return null;
    }
  }

  let r = await step('演示账号', () => api('GET', '/api/v1/demo/accounts'));
  if (r) P('fetch 劫持 → 演示账号', r.status === 200 && r.json.code === 0, (r.json.data.accounts || []).length + ' 个账号');

  r = await step('消费者登录', () => api('POST', '/api/v1/auth/login', { username: 'consumer01', password: 'consumer123' }));
  const token = r && r.json && r.json.data && r.json.data.token;
  if (r) P('fetch 劫持 → 消费者登录', r.json.code === 0 && !!token, r.json.data && r.json.data.user.roleLabel);

  r = await step('品类树', () => api('GET', '/api/v1/mall/categories/tree'));
  if (r) P('fetch 劫持 → 品类树', r.json.code === 0 && r.json.data.tree.length === 4, r.json.data.tree.map((x) => x.name).join('/'));

  r = await step('购物车', () => api('GET', '/api/v1/mall/cart', null, token));
  if (r) P('fetch 劫持 → 带鉴权的购物车', r.json.code === 0, JSON.stringify(r.json.data.summary));

  r = await step('智能选品', () => api('POST', '/api/v1/ai/recommend/selection', { scene: 'home', limit: 4 }));
  if (r) P('fetch 劫持 → 智能选品', r.json.code === 0 && (r.json.data.items || []).length > 0,
    (r.json.data.items || []).map((x) => x.title).join('、'));

  // 非 /api 请求应走原生 fetch
  r = await step('静态资源探针', () => window.fetch('assets/nonexistent-probe.txt').then((x) => ({ status: x.status })));
  if (r) P('非 /api 请求未被劫持（原生 fetch 生效）', r.status === 404, 'HTTP ' + r.status);

  // 导航到登录页并确认 UI 可交互
  window.location.hash = '#/login';
  await sleep(700);
  const loginHtml = window.document.querySelector('#app').innerHTML;
  const au = window.document.querySelector('#au');
  const ap = window.document.querySelector('#ap');
  P('路由跳转到登录页并渲染表单', /登录/.test(loginHtml) && !!au && !!ap, '输入框: #au/#ap');

  // 走一遍真实 UI 登录：填账号密码 → 点击提交
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  setVal(au, 'consumer01');
  setVal(ap, 'consumer123');
  const btn = window.document.querySelector('#authSubmit');
  if (btn) { btn.click(); await sleep(1500); }

  P('UI 登录后跳转首页', window.location.hash === '#/home' && !window.document.querySelector('#au'),
    'hash=' + window.location.hash);
  const tok = window.localStorage.getItem('aiecp_token');
  P('登录态写入 localStorage', !!tok, tok ? tok.slice(0, 14) + '…' : 'null');
  P('业务数据已写入 localStorage（静态站持久化）',
    Object.keys(window.localStorage).some((k) => k.indexOf('aiecp-fs:') === 0),
    window.localStorage.length + ' 个键');

  // 登录后首页应出现商品卡片（数据来自浏览器内置服务）
  const homeHtml = window.document.querySelector('#app').innerHTML;
  P('首页渲染出商品数据', /¥/.test(homeHtml) && homeHtml.length > 800, homeHtml.length + ' 字符');

  console.log('\n通过 ' + ok + ' 项，失败 ' + fail + ' 项');
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常：', e); process.exit(1); });
