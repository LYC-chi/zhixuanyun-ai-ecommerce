'use strict';
/**
 * server.js — 智选云 AI 电商在线售货系统（AI-ECP）单端口 HTTP 服务
 * 同时托管前端静态资源与 /api/v1 REST 接口；零外部依赖，仅使用 Node 内置模块。
 * 对应设计报告：表现层（前端）+ 应用层（本文件路由）+ 领域/智能能力层（src/*）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const store = require('./src/store');
const { seedFactory } = require('./src/seed');
const cat = require('./src/category');
const auth = require('./src/auth');
const cs = require('./src/ai/customerService');
const selection = require('./src/ai/selection');
const bundle = require('./src/ai/bundle');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// 初始化数据（首次运行写入种子数据）
const db = store.init(seedFactory);
console.log('[AI-ECP] 数据源:', store.DB_FILE);

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
const ORDER_STATUS = {
  0: '待付款', 1: '待发货', 2: '已发货', 3: '已完成', 4: '已取消', 5: '退款中', 6: '已退款',
};

function traceId() { return 'tr_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  res.end(body);
}
function ok(res, data, message) {
  sendJson(res, 200, { code: 0, message: message || 'success', data: data === undefined ? null : data, traceId: traceId() });
}
function fail(res, code, message, data, status) {
  sendJson(res, status || 200, { code, message, data: data || null, traceId: traceId() });
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 4 * 1024 * 1024) { req.destroy(); } chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({ __raw: raw }); }
    });
    req.on('error', () => resolve({}));
  });
}

function getUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-token'] || '');
  const payload = auth.verifyToken(token);
  if (!payload) return null;
  return db.users.find((u) => u.id === payload.uid) || null;
}

function requireAuth(req, res) {
  const u = getUser(req);
  if (!u) { fail(res, 40100, '请先登录', null, 401); return null; }
  return u;
}
function requireRole(req, res, roles) {
  const u = requireAuth(req, res);
  if (!u) return null;
  if (roles && !roles.includes(u.role)) { fail(res, 40300, '无权限执行该操作', null, 403); return null; }
  return u;
}

function publicUser(u) {
  if (!u) return null;
  const perms = auth.permissionsOf(u.role);
  return {
    id: u.id, username: u.username, nickname: u.nickname, mobile: maskMobile(u.mobile), role: u.role,
    roleLabel: perms.label, shopName: u.shopName || null, memberLevel: u.memberLevel || 0,
    menus: perms.menus, dataScope: perms.dataScope,
  };
}
function maskMobile(m) { return m ? String(m).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''; }

function audit(user, action, detail) {
  db.auditLogs.push({ id: db.auditLogs.length + 1, userId: user ? user.id : null, username: user ? user.username : 'anonymous', action, detail: detail || '', at: new Date().toISOString() });
  db.auditLogs = db.auditLogs.slice(-500);
}

function stockOf(skuId) {
  const inv = db.inventories.find((v) => v.skuId === skuId);
  return inv ? { total: inv.totalQty, locked: inv.lockedQty, available: Math.max(0, inv.totalQty - inv.lockedQty), inv } : { total: 0, locked: 0, available: 0, inv: null };
}

function productView(p, withSku) {
  const skus = p.skuIds.map((id) => {
    const s = db.skus.find((x) => x.id === id);
    const st = stockOf(id);
    return { id: s.id, specText: s.specText, salePrice: s.salePrice, marketPrice: s.marketPrice, status: s.status, stock: st.available };
  });
  const view = {
    id: p.id, title: p.title, subtitle: p.subtitle, emoji: p.emoji, color: p.color, mainImage: p.mainImage,
    categoryId: p.categoryId, categoryCode: p.categoryCode, categoryName: p.categoryName,
    merchantId: p.merchantId, merchantName: p.merchantName,
    attrs: p.attrs, priceMin: p.priceMin, priceMax: p.priceMax, status: p.status, tags: p.tags,
    salesCount: p.salesCount, ratingAvg: Number(p.ratingAvg.toFixed(1)), reviewCount: p.reviewCount,
    totalStock: skus.reduce((n, s) => n + s.stock, 0),
  };
  if (withSku) view.skus = skus;
  return view;
}

function categoryTreeForClient() {
  const roots = db.categories.filter((c) => c.parentId === null).sort((a, b) => a.sort - b.sort);
  const build = (n) => ({
    id: n.id, code: n.code, name: n.name, level: n.level, isLeaf: n.isLeaf,
    attributes: n.attributes.map((a) => ({ code: a.code, name: a.name, dataType: a.dataType, required: !!a.required, filterable: !!a.filterable, searchable: !!a.searchable, options: a.options || null, unit: a.unit || null, range: a.range || null })),
    children: db.categories.filter((c) => c.parentId === n.id).sort((a, b) => a.sort - b.sort).map(build),
  });
  return roots.map(build);
}

// ---------------------------------------------------------------------------
// 订单与库存领域逻辑
// ---------------------------------------------------------------------------
function nextOrderNo() {
  db.meta.orderSeq = (db.meta.orderSeq || 0) + 1;
  const d = new Date();
  const ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'ORD' + ymd + String(db.meta.orderSeq).padStart(5, '0');
}

function computeCoupon(coupon, amount) {
  if (!coupon) return 0;
  if (coupon.type === 'full_reduce') return amount >= coupon.threshold ? coupon.value : 0;
  if (coupon.type === 'discount') return Number((amount * (1 - coupon.value)).toFixed(2));
  return 0;
}

function createOrder(user, payload) {
  const items = payload.items || []; // [{skuId, quantity, source, bundleId}]
  if (!items.length) return { error: '购物车为空，无法下单' };
  const orderItems = [];
  let totalAmount = 0;
  for (const it of items) {
    const sku = db.skus.find((s) => s.id === Number(it.skuId));
    if (!sku || sku.status !== 1) return { error: '商品规格不存在或已下架' };
    const product = db.products.find((p) => p.id === sku.productId);
    if (!product || product.status !== 1) return { error: '商品已下架：' + (product ? product.title : '') };
    const st = stockOf(sku.id);
    if (st.available < it.quantity) return { error: `库存不足：${product.title} ${sku.specText}（剩余 ${st.available}）` };
    const subtotal = Number((sku.salePrice * it.quantity).toFixed(2));
    totalAmount += subtotal;
    orderItems.push({
      skuId: sku.id, productId: product.id, title: product.title, emoji: product.emoji, color: product.color,
      specText: sku.specText, quantity: it.quantity, unitPrice: sku.salePrice, subtotal, source: it.source || 'single', bundleId: it.bundleId || null,
    });
  }
  totalAmount = Number(totalAmount.toFixed(2));

  let couponDiscount = 0;
  let usedCoupon = null;
  if (payload.couponCode) {
    const uc = db.userCoupons.find((x) => x.userId === user.id && x.code === payload.couponCode && x.status === 'unused');
    const c = db.coupons.find((x) => x.code === payload.couponCode);
    if (uc && c) { couponDiscount = computeCoupon(c, totalAmount); usedCoupon = { code: c.code, name: c.name, discount: couponDiscount }; }
  }
  const freight = totalAmount >= 99 ? 0 : 8;
  const payAmount = Number(Math.max(0.01, totalAmount - couponDiscount + freight).toFixed(2));

  const id = db.orders.length + 1;
  const order = {
    id, orderNo: nextOrderNo(), userId: user.id,
    items: orderItems, totalAmount, couponDiscount, freight, payAmount, coupon: usedCoupon,
    status: 0, statusText: ORDER_STATUS[0],
    address: payload.address || (db.addresses.find((a) => a.userId === user.id) || null),
    remark: payload.remark || '', createdAt: new Date().toISOString(), paidAt: null, shipmentId: null,
  };
  db.orders.push(order);
  orderItems.forEach((oi) => db.orderItems.push(Object.assign({ id: db.orderItems.length + 1, orderId: id }, oi)));

  // 锁定库存
  orderItems.forEach((oi) => {
    const inv = db.inventories.find((v) => v.skuId === oi.skuId);
    if (inv) { inv.lockedQty += oi.quantity; inv.version += 1; }
    db.inventoryLogs.push({ id: db.inventoryLogs.length + 1, skuId: oi.skuId, type: 'lock', qty: oi.quantity, orderNo: order.orderNo, at: new Date().toISOString() });
  });

  // 标记优惠券已使用
  if (usedCoupon) {
    const uc = db.userCoupons.find((x) => x.userId === user.id && x.code === usedCoupon.code && x.status === 'unused');
    if (uc) uc.status = 'used';
  }

  // 创建支付单
  db.payments.push({ id: db.payments.length + 1, orderId: id, orderNo: order.orderNo, channel: payload.channel || 'wechat', payStatus: 0, tradeNo: null, amount: payAmount, paidAt: null, createdAt: new Date().toISOString() });

  store.save();
  return { order };
}

function payOrder(order, channel) {
  if (order.status !== 0) return { error: '订单当前状态不可支付' };
  const pay = db.payments.find((p) => p.orderId === order.id);
  const tradeNo = 'PAY' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
  pay.payStatus = 1; pay.tradeNo = tradeNo; pay.paidAt = new Date().toISOString(); pay.channel = channel || pay.channel;
  order.status = 1; order.statusText = ORDER_STATUS[1]; order.paidAt = pay.paidAt;
  // 扣减库存（锁定 → 扣减）
  order.items.forEach((oi) => {
    const inv = db.inventories.find((v) => v.skuId === oi.skuId);
    if (inv) { inv.lockedQty = Math.max(0, inv.lockedQty - oi.quantity); inv.totalQty = Math.max(0, inv.totalQty - oi.quantity); inv.version += 1; }
    db.inventoryLogs.push({ id: db.inventoryLogs.length + 1, skuId: oi.skuId, type: 'deduct', qty: oi.quantity, orderNo: order.orderNo, at: new Date().toISOString() });
    // 销量与行为
    const prod = db.products.find((p) => p.id === oi.productId);
    if (prod) prod.salesCount += oi.quantity;
    db.behaviors.push({ id: db.behaviors.length + 1, userId: order.userId, eventType: 'purchase', productId: oi.productId, skuId: oi.skuId, scene: 'order', at: new Date().toISOString() });
  });
  // 自动发货（模拟）
  shipOrder(order);
  store.save();
  return { tradeNo };
}

function shipOrder(order) {
  const carriers = ['顺丰速运', '京东物流', '中通快递'];
  const carrier = carriers[order.id % carriers.length];
  const trackingNo = 'SF' + Date.now().toString().slice(-10) + (order.id % 100);
  const sid = db.shipments.length + 1;
  db.shipments.push({ id: sid, orderId: order.id, orderNo: order.orderNo, carrier, trackingNo, createdAt: new Date().toISOString() });
  order.shipmentId = sid;
  order.status = 2; order.statusText = ORDER_STATUS[2];
  const now = Date.now();
  const traces = [
    { desc: '订单已支付，仓库拣货中', offset: 0 },
    { desc: `${carrier} 已揽收`, offset: 2 * 3600 * 1000 },
    { desc: '快件已到达区域分拨中心', offset: 8 * 3600 * 1000 },
    { desc: '快件运输中，预计 1-2 日送达', offset: 20 * 3600 * 1000 },
  ];
  traces.forEach((t) => db.logisticsTraces.push({ id: db.logisticsTraces.length + 1, orderId: order.id, shipmentId: sid, time: new Date(now + t.offset).toISOString().replace('T', ' ').slice(0, 16), desc: t.desc }));
  return { carrier, trackingNo };
}

function cancelOrder(order) {
  if (order.status !== 0 && order.status !== 1) return { error: '当前状态不可取消' };
  // 释放库存
  order.items.forEach((oi) => {
    const inv = db.inventories.find((v) => v.skuId === oi.skuId);
    if (inv) {
      if (order.status === 0) { inv.lockedQty = Math.max(0, inv.lockedQty - oi.quantity); }
      else { inv.totalQty += oi.quantity; }
      inv.version += 1;
    }
    db.inventoryLogs.push({ id: db.inventoryLogs.length + 1, skuId: oi.skuId, type: 'release', qty: oi.quantity, orderNo: order.orderNo, at: new Date().toISOString() });
  });
  order.status = 4; order.statusText = ORDER_STATUS[4];
  const pay = db.payments.find((p) => p.orderId === order.id && p.payStatus === 1);
  if (pay) pay.payStatus = 2;
  store.save();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 路由表
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, handler, opts) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: (opts && opts.auth) || null });
}

// ---- 认证 ----
route('POST', '/api/v1/auth/register', async (req, res, p, body) => {
  const { username, password, nickname, mobile, role } = body;
  if (!username || !password) return fail(res, 40001, '用户名与密码不能为空');
  if (String(username).length < 3) return fail(res, 40002, '用户名至少 3 个字符');
  if (String(password).length < 6) return fail(res, 40002, '密码至少 6 位');
  if (db.users.some((u) => u.username === username)) return fail(res, 40003, '用户名已存在');
  const r = role === 'merchant' ? 'merchant' : 'consumer';
  const u = {
    id: db.users.length + 1, username, nickname: nickname || username, mobile: mobile || '',
    role: r, password: auth.hashPassword(password), memberLevel: 1,
    shopName: r === 'merchant' ? (nickname || username) + '的店铺' : undefined,
    status: 1, createdAt: new Date().toISOString(),
  };
  db.users.push(u); store.save();
  const token = auth.signToken({ uid: u.id, role: u.role });
  audit(u, 'register', '注册账号 role=' + r);
  return ok(res, { token, user: publicUser(u) }, '注册成功');
});

route('POST', '/api/v1/auth/login', async (req, res, p, body) => {
  const { username, password } = body;
  const u = db.users.find((x) => x.username === username || x.mobile === username);
  if (!u) return fail(res, 40101, '账号不存在');
  if (!auth.verifyPassword(password, u.password)) { audit(u, 'login_failed', '密码错误'); return fail(res, 40102, '密码错误'); }
  if (u.status !== 1) return fail(res, 40103, '账号已被禁用');
  const token = auth.signToken({ uid: u.id, role: u.role });
  audit(u, 'login', '登录成功');
  store.save();
  return ok(res, { token, user: publicUser(u) }, '登录成功');
});

route('GET', '/api/v1/auth/me', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  return ok(res, { user: publicUser(u) });
});

route('POST', '/api/v1/auth/logout', async (req, res) => {
  const u = getUser(req); if (u) audit(u, 'logout', '退出登录');
  return ok(res, null, '已退出');
});

route('GET', '/api/v1/demo/accounts', async (req, res) => {
  return ok(res, {
    accounts: [
      { role: '消费者', username: 'consumer01', password: 'consumer123' },
      { role: '商家', username: 'merchant01', password: 'merchant123' },
      { role: '平台管理员', username: 'admin', password: 'admin123' },
    ],
  });
});

// ---- 品类（消费者端） ----
route('GET', '/api/v1/mall/categories/tree', async (req, res) => {
  return ok(res, { tree: categoryTreeForClient() });
});

route('GET', '/api/v1/mall/categories/flat', async (req, res) => {
  const leaves = db.categories.filter((c) => c.isLeaf && c.status === 1).map((c) => ({ id: c.id, code: c.code, name: c.name, path: c.path }));
  return ok(res, { leaves });
});

// ---- 商品（消费者端） ----
route('GET', '/api/v1/mall/products', async (req, res, p, body, query) => {
  let list = db.products.filter((x) => x.status === 1);
  const kw = (query.keyword || '').trim();
  if (kw) {
    const scored = require('./src/ai/llm').search(kw, list, (x) => x.title + ' ' + x.subtitle + ' ' + x.categoryName + ' ' + (x.attrs.BRAND || ''), list.length)
      .filter((s) => s.score > 0.02);
    list = scored.length ? scored.map((s) => s.item) : list.filter((x) => x.title.includes(kw));
  }
  if (query.categoryId) {
    const cid = Number(query.categoryId);
    const rootCat = db.categories.find((x) => x.id === cid);
    if (rootCat) {
      const prefix = rootCat.path;
      const ids = new Set(db.categories.filter((c) => c.path === prefix || c.path.startsWith(prefix + '/')).map((c) => c.id));
      list = list.filter((x) => ids.has(x.categoryId));
    }
  }
  if (query.brand) list = list.filter((x) => x.attrs.BRAND === query.brand);
  if (query.minPrice) list = list.filter((x) => x.priceMin >= Number(query.minPrice));
  if (query.maxPrice) list = list.filter((x) => x.priceMax <= Number(query.maxPrice) || x.priceMin <= Number(query.maxPrice));
  // 动态属性筛选：att.BRAND=xxx
  Object.keys(query).forEach((k) => {
    if (k.startsWith('att.')) {
      const code = k.slice(4);
      const val = query[k];
      list = list.filter((x) => {
        const v = x.attrs[code];
        if (Array.isArray(v)) return v.includes(val);
        return String(v) === String(val);
      });
    }
  });
  const sort = query.sort || 'default';
  const sorts = {
    default: (a, b) => b.salesCount - a.salesCount,
    sales: (a, b) => b.salesCount - a.salesCount,
    priceAsc: (a, b) => a.priceMin - b.priceMin,
    priceDesc: (a, b) => b.priceMin - a.priceMin,
    rating: (a, b) => b.ratingAvg - a.ratingAvg,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  };
  list = list.slice().sort(sorts[sort] || sorts.default);
  const total = list.length;
  const page = Number(query.page || 1), size = Number(query.size || 12);
  const paged = list.slice((page - 1) * size, page * size);

  // 可用筛选维度（由品类 filterable 决定）
  let facets = [];
  if (query.categoryId) {
    const c = db.categories.find((x) => x.id === Number(query.categoryId));
    if (c) facets = c.attributes.filter((a) => a.filterable).map((a) => ({
      code: a.code, name: a.name, dataType: a.dataType, options: a.options || null, unit: a.unit || null, range: a.range || null,
    }));
  }
  return ok(res, { total, page, size, list: paged.map((x) => productView(x)), facets });
});

route('GET', '/api/v1/mall/products/:id', async (req, res, p) => {
  const prod = db.products.find((x) => x.id === Number(p.id));
  if (!prod) return fail(res, 40401, '商品不存在');
  const view = productView(prod, true);
  const category = db.categories.find((c) => c.id === prod.categoryId);
  view.attributeSchema = (category ? category.attributes : []).map((a) => ({ code: a.code, name: a.name, dataType: a.dataType, required: !!a.required, filterable: !!a.filterable, options: a.options || null, unit: a.unit || null, range: a.range || null }));
  view.reviews = db.reviews.filter((r) => r.productId === prod.id).slice(-10).reverse();
  return ok(res, { product: view });
});

route('GET', '/api/v1/mall/products/:id/reviews', async (req, res, p) => {
  const list = db.reviews.filter((r) => r.productId === Number(p.id)).reverse();
  return ok(res, { total: list.length, list });
});

// 按 skuId 批量查询规格（用于立即购买 / 组合加购）
route('GET', '/api/v1/mall/skus', async (req, res, p, body, query) => {
  const ids = String(query.ids || '').split(',').map((x) => Number(x)).filter(Boolean);
  const list = ids.map((id) => {
    const s = db.skus.find((x) => x.id === id);
    if (!s) return null;
    const prod = db.products.find((x) => x.id === s.productId);
    const st = stockOf(id);
    return {
      skuId: s.id, productId: s.productId, specText: s.specText, salePrice: s.salePrice, marketPrice: s.marketPrice,
      stock: st.available,
      title: prod ? prod.title : '', emoji: prod ? prod.emoji : '📦', color: prod ? prod.color : '#888',
      categoryId: prod ? prod.categoryId : null,
    };
  }).filter(Boolean);
  return ok(res, { list });
});

// ---- 购物车 ----
route('GET', '/api/v1/mall/cart', async (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  const items = db.carts.filter((c) => c.userId === u.id).map((c) => {
    const sku = db.skus.find((s) => s.id === c.skuId);
    const prod = db.products.find((x) => x.id === c.productId);
    const st = stockOf(c.skuId);
    return {
      id: c.id, skuId: c.skuId, productId: c.productId, quantity: c.quantity, selected: c.selected !== false,
      source: c.source, bundleId: c.bundleId || null,
      title: prod ? prod.title : '已失效商品', emoji: prod ? prod.emoji : '❔', color: prod ? prod.color : '#999',
      specText: sku ? sku.specText : '', salePrice: sku ? sku.salePrice : 0, marketPrice: sku ? sku.marketPrice : 0,
      status: prod && prod.status === 1 && sku && sku.status === 1 ? 1 : 0, stock: st.available,
      lineTotal: sku && prod ? Number((sku.salePrice * c.quantity).toFixed(2)) : 0,
    };
  });
  const valid = items.filter((i) => i.status === 1);
  const selectedTotal = valid.filter((i) => i.selected).reduce((n, i) => n + i.lineTotal, 0);
  return ok(res, { items, summary: { count: items.length, validCount: valid.length, selectedCount: valid.filter((i) => i.selected).length, selectedTotal: Number(selectedTotal.toFixed(2)) } });
});

route('POST', '/api/v1/mall/cart/items', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const items = body.items || [body];
  for (const it of items) {
    const sku = db.skus.find((s) => s.id === Number(it.skuId));
    if (!sku) return fail(res, 40402, '商品规格不存在');
    const qty = Math.max(1, Number(it.quantity || 1));
    const exist = db.carts.find((c) => c.userId === u.id && c.skuId === sku.id && (c.source || 'single') === (it.source || 'single'));
    if (exist) exist.quantity += qty;
    else db.carts.push({ id: db.carts.length + 1, userId: u.id, skuId: sku.id, productId: sku.productId, quantity: qty, selected: true, source: it.source || 'single', bundleId: it.bundleId || null, createdAt: new Date().toISOString() });
    db.behaviors.push({ id: db.behaviors.length + 1, userId: u.id, eventType: 'cart', productId: sku.productId, skuId: sku.id, scene: 'cart', at: new Date().toISOString() });
  }
  store.save();
  return ok(res, { added: items.length }, '已加入购物车');
});

route('PATCH', '/api/v1/mall/cart/items/:id', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const it = db.carts.find((c) => c.id === Number(p.id) && c.userId === u.id);
  if (!it) return fail(res, 40403, '购物车项不存在');
  if (body.quantity != null) it.quantity = Math.max(1, Number(body.quantity));
  if (body.selected != null) it.selected = !!body.selected;
  store.save();
  return ok(res, null, '已更新');
});

route('DELETE', '/api/v1/mall/cart/items/:id', async (req, res, p) => {
  const u = requireAuth(req, res); if (!u) return;
  db.carts = db.carts.filter((c) => !(c.id === Number(p.id) && c.userId === u.id));
  store.save();
  return ok(res, null, '已删除');
});

// ---- 地址 ----
route('GET', '/api/v1/mall/addresses', async (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  return ok(res, { list: db.addresses.filter((a) => a.userId === u.id) });
});
route('POST', '/api/v1/mall/addresses', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const a = { id: db.addresses.length + 1, userId: u.id, receiver: body.receiver || u.nickname, phone: body.phone || u.mobile, province: body.province || '', city: body.city || '', district: body.district || '', detail: body.detail || '', isDefault: body.isDefault ? 1 : 0 };
  db.addresses.push(a); store.save();
  return ok(res, { address: a }, '地址已保存');
});

// ---- 优惠券 ----
route('GET', '/api/v1/mall/coupons', async (req, res) => {
  const u = getUser(req);
  const mine = u ? db.userCoupons.filter((x) => x.userId === u.id) : [];
  const now = Date.now();
  const list = db.coupons.filter((c) => c.status === 1 && new Date(c.endAt).getTime() > now).map((c) => ({
    ...c, claimedByMe: mine.some((m) => m.code === c.code),
  }));
  return ok(res, { list });
});
route('POST', '/api/v1/mall/coupons/claim', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const c = db.coupons.find((x) => x.code === body.code);
  if (!c) return fail(res, 40404, '优惠券不存在');
  if (db.userCoupons.some((x) => x.userId === u.id && x.code === c.code)) return fail(res, 40004, '您已领取该优惠券');
  db.userCoupons.push({ id: db.userCoupons.length + 1, userId: u.id, code: c.code, name: c.name, status: 'unused', claimedAt: new Date().toISOString() });
  c.claimed += 1;
  store.save();
  return ok(res, null, '领取成功');
});
route('GET', '/api/v1/mall/my-coupons', async (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  return ok(res, { list: db.userCoupons.filter((x) => x.userId === u.id) });
});

// ---- 订单 ----
route('POST', '/api/v1/mall/orders', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const idem = req.headers['x-idempotency-key'];
  if (idem) {
    const cached = db.orders.find((o) => o.idemKey === idem);
    if (cached) return ok(res, { order: orderView(cached) }, '订单已创建（幂等）');
  }
  const r = createOrder(u, body);
  if (r.error) return fail(res, 40010, r.error);
  if (idem) r.order.idemKey = idem;
  audit(u, 'create_order', r.order.orderNo + ' 金额 ' + r.order.payAmount);
  store.save();
  return ok(res, { order: orderView(r.order) }, '下单成功，请完成支付');
});

route('GET', '/api/v1/mall/orders', async (req, res, p, body, query) => {
  const u = requireAuth(req, res); if (!u) return;
  let list = db.orders.filter((o) => o.userId === u.id);
  if (query.status != null && query.status !== '') list = list.filter((o) => o.status === Number(query.status));
  list = list.slice().reverse();
  return ok(res, { total: list.length, list: list.map(orderView) });
});

route('GET', '/api/v1/mall/orders/:id', async (req, res, p) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(p.id) && (x.userId === u.id || u.role === 'admin' || u.role === 'merchant'));
  if (!o) return fail(res, 40405, '订单不存在');
  const view = orderView(o);
  view.logistics = db.shipments.find((s) => s.orderId === o.id) || null;
  view.traces = db.logisticsTraces.filter((t) => t.orderId === o.id);
  return ok(res, { order: view });
});

route('POST', '/api/v1/mall/payments/:orderId/pay', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(p.orderId) && x.userId === u.id);
  if (!o) return fail(res, 40405, '订单不存在');
  const r = payOrder(o, body.channel);
  if (r.error) return fail(res, 40011, r.error);
  audit(u, 'pay_order', o.orderNo + ' ' + r.tradeNo);
  return ok(res, { tradeNo: r.tradeNo, order: orderView(o) }, '支付成功');
});

route('POST', '/api/v1/callback/payment/:channel', async (req, res, p, body) => {
  // 验签（简化）：sign = HMAC(orderNo + tradeNo)
  const expected = crypto.createHmac('sha256', 'aiecp-pay-channel-secret').update(String(body.orderNo) + String(body.tradeNo)).digest('hex');
  if (body.sign && body.sign !== expected) return fail(res, 40012, '支付回调验签失败');
  const o = db.orders.find((x) => x.orderNo === body.orderNo);
  if (!o) return fail(res, 40405, '订单不存在');
  if (o.status !== 0) return ok(res, { idempotent: true }, '重复回调已忽略（幂等）');
  const r = payOrder(o, p.channel);
  return ok(res, { tradeNo: r.tradeNo, idempotent: false }, '回调处理成功');
});

route('GET', '/api/v1/mall/orders/:id/logistics', async (req, res, p) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(p.id));
  if (!o) return fail(res, 40405, '订单不存在');
  const shipment = db.shipments.find((s) => s.orderId === o.id);
  const traces = db.logisticsTraces.filter((t) => t.orderId === o.id).reverse();
  return ok(res, { shipment, traces, degraded: false });
});

route('POST', '/api/v1/mall/orders/:id/confirm', async (req, res, p) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(p.id) && x.userId === u.id);
  if (!o) return fail(res, 40405, '订单不存在');
  if (o.status !== 2) return fail(res, 40013, '订单当前状态不可确认收货');
  o.status = 3; o.statusText = ORDER_STATUS[3]; o.finishedAt = new Date().toISOString();
  // 生成物流签收轨迹
  db.logisticsTraces.push({ id: db.logisticsTraces.length + 1, orderId: o.id, shipmentId: o.shipmentId, time: new Date().toISOString().replace('T', ' ').slice(0, 16), desc: '已签收，感谢使用智选云' });
  store.save();
  return ok(res, { order: orderView(o) }, '已确认收货');
});

route('POST', '/api/v1/mall/orders/:id/cancel', async (req, res, p) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(p.id) && x.userId === u.id);
  if (!o) return fail(res, 40405, '订单不存在');
  const r = cancelOrder(o);
  if (r.error) return fail(res, 40014, r.error);
  return ok(res, { order: orderView(o) }, '订单已取消');
});

// ---- 评价 / 售后 ----
route('POST', '/api/v1/mall/reviews', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(body.orderId) && x.userId === u.id);
  if (!o) return fail(res, 40405, '订单不存在');
  if (o.status !== 3) return fail(res, 40015, '订单完成后才能评价');
  const rv = {
    id: db.reviews.length + 1, productId: Number(body.productId), orderId: o.id, orderNo: o.orderNo,
    userId: u.id, user: u.nickname, rating: Math.min(5, Math.max(1, Number(body.rating || 5))),
    content: body.content || '', images: body.images || [], appendContent: '', createdAt: new Date().toISOString(),
  };
  db.reviews.push(rv);
  const prod = db.products.find((x) => x.id === rv.productId);
  if (prod) {
    const all = db.reviews.filter((r) => r.productId === prod.id);
    prod.reviewCount = all.length;
    prod.ratingAvg = all.reduce((n, r) => n + r.rating, 0) / all.length;
  }
  db.behaviors.push({ id: db.behaviors.length + 1, userId: u.id, eventType: 'review', productId: rv.productId, scene: 'review', at: new Date().toISOString() });
  store.save();
  return ok(res, { review: rv }, '评价成功');
});

route('POST', '/api/v1/mall/after-sales', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const o = db.orders.find((x) => x.id === Number(body.orderId) && x.userId === u.id);
  if (!o) return fail(res, 40405, '订单不存在');
  const as = {
    id: db.afterSales.length + 1, orderId: o.id, orderNo: o.orderNo, userId: u.id,
    type: body.type || 'refund', reason: body.reason || '', evidence: body.evidence || [],
    status: 'pending', amount: body.amount || o.payAmount, createdAt: new Date().toISOString(),
  };
  db.afterSales.push(as);
  if (as.type === 'refund_return' || as.type === 'refund') { o.status = 5; o.statusText = ORDER_STATUS[5]; }
  store.save();
  return ok(res, { afterSale: as }, '售后申请已提交，等待审核');
});

route('GET', '/api/v1/mall/after-sales', async (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  return ok(res, { list: db.afterSales.filter((a) => a.userId === u.id).reverse() });
});

// ---- AI 能力 ----
route('POST', '/api/v1/ai/customer-service/chat', async (req, res, p, body) => {
  const u = requireAuth(req, res); if (!u) return;
  const sessionId = body.sessionId || ('sess_' + Date.now().toString(36));
  let conv = db.conversations.find((c) => c.sessionId === sessionId && c.userId === u.id);
  if (!conv) { conv = { id: db.conversations.length + 1, sessionId, userId: u.id, channel: 'web', status: 1, startedAt: new Date().toISOString() }; db.conversations.push(conv); }
  db.messages.push({ id: db.messages.length + 1, sessionId, role: 'user', content: body.question, confidence: null, at: new Date().toISOString() });
  const r = cs.chat({ db, user: u, question: body.question || '', sessionId, pageContext: body.pageContext });
  db.messages.push({ id: db.messages.length + 1, sessionId, role: 'assistant', content: r.answer, confidence: r.confidence, intent: r.intent, at: new Date().toISOString() });
  store.save();
  return ok(res, { sessionId, ...r });
});

route('GET', '/api/v1/ai/customer-service/sessions', async (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  const list = db.conversations.filter((c) => c.userId === u.id).slice(-10).reverse().map((c) => ({
    sessionId: c.sessionId, startedAt: c.startedAt,
    lastMessage: (db.messages.filter((m) => m.sessionId === c.sessionId).slice(-1)[0] || {}).content || '',
    messageCount: db.messages.filter((m) => m.sessionId === c.sessionId).length,
  }));
  return ok(res, { list });
});

route('POST', '/api/v1/ai/recommend/selection', async (req, res, p, body) => {
  const u = getUser(req) || db.users[0]; // 未登录也可获取兜底推荐
  const r = selection.recommend({ db, user: u, scene: body.scene || 'home', limit: body.limit, query: body.query, productId: body.productId });
  store.save();
  return ok(res, r);
});

route('POST', '/api/v1/ai/bundle/compose', async (req, res, p, body) => {
  const u = getUser(req);
  const r = bundle.compose({ db, user: u, mainSkuId: body.mainSkuId || body.skuId, sceneTag: body.sceneTag, budgetRange: body.budgetRange, limit: body.limit });
  if (r.error) return fail(res, 40406, '未找到主商品规格');
  store.save();
  return ok(res, r);
});

route('POST', '/api/v1/ai/events', async (req, res, p, body) => {
  const u = getUser(req);
  const events = Array.isArray(body.events) ? body.events : [body];
  events.forEach((e) => db.behaviors.push({
    id: db.behaviors.length + 1, userId: u ? u.id : null, eventType: e.eventType || 'expose',
    productId: e.productId || null, skuId: e.skuId || null, scene: e.scene || 'unknown', at: new Date().toISOString(),
  }));
  db.behaviors = db.behaviors.slice(-2000);
  store.save();
  return ok(res, { recorded: events.length });
});

// ---- 商家端 ----
route('POST', '/api/v1/merchant/categories/validate', async (req, res, p, body) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const syn = cat.syntaxCheck(body.jsonText);
  if (!syn.ok) return fail(res, 40001, syn.error.detail, syn.error, 400);
  const v = cat.validate(syn.value);
  const tree = v.errors.length ? null : cat.buildTree(syn.value.category);
  const formSchema = tree ? cat.buildFormSchema(tree) : null;
  const indexMapping = tree ? cat.buildIndexMapping(tree) : null;
  return ok(res, {
    valid: v.errors.length === 0,
    errors: v.errors, warnings: v.warnings, stats: v.stats,
    formSchemaPreview: formSchema,
    indexMappingPreview: indexMapping,
    mode: 'dryRun（无副作用）',
  }, v.errors.length ? '校验未通过' : '校验通过');
});

route('POST', '/api/v1/merchant/categories/import', async (req, res, p, body) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const mode = body.mode === 'dryRun' ? 'dryRun' : 'commit';
  const syn = cat.syntaxCheck(body.jsonText);
  if (!syn.ok) return fail(res, 40001, 'JSON 语法错误', syn.error, 400);
  const v = cat.validate(syn.value);
  if (v.errors.length) return fail(res, 42201, '品类结构校验未通过', { errors: v.errors }, 422);

  const tree = cat.buildTree(syn.value.category);
  const formSchema = cat.buildFormSchema(tree);
  const indexMapping = cat.buildIndexMapping(tree);

  if (mode === 'dryRun') {
    return ok(res, {
      mode: 'dryRun', generated: { nodeCount: v.stats.nodeCount, attrCount: v.stats.attrCount, indexFields: indexMapping.fieldCount },
      formSchema, indexMapping, warnings: v.warnings,
    }, '预校验通过（未落库）');
  }

  // commit：先删除同 code 旧版本，再落库
  const rootCode = tree.code;
  const existed = db.categories.filter((c) => c.path.startsWith('/' + rootCode));
  let version = db.meta.categoryVersionSeq + 1;
  const oldVersion = existed.length ? Math.max(...existed.map((c) => c.version)) : 0;
  if (existed.length) {
    const oldIds = new Set(existed.map((c) => c.id));
    db.categories = db.categories.filter((c) => !oldIds.has(c.id));
    db.products.forEach((pr) => { if (oldIds.has(pr.categoryId)) pr.status = 0; });
  }
  // 重新分配 id（保持全局唯一）
  let maxId = db.categories.reduce((m, c) => Math.max(m, c.id), 0);
  (function reassign(n) { n.id = ++maxId; n.children.forEach(reassign); })(tree);
  const flat = cat.flatten(tree);
  flat.forEach((node) => {
    db.categories.push({
      id: node.id, code: node.code, name: node.name, parentId: node.parentId, level: node.level,
      path: node.path, isLeaf: node.isLeaf, sort: node.sort,
      attributes: node.attributes, version, status: 1, source: '商家导入 ' + (body.sourceName || ''), merchantId: u.id,
    });
  });
  const idxMapId = db.indexMappings.length + 1;
  db.indexMappings.push(Object.assign({ id: idxMapId, categoryId: tree.id }, indexMapping));
  db.meta.categoryVersionSeq = version;
  db.categoryVersions.push({
    id: db.categoryVersions.length + 1, code: rootCode, version, createdAt: new Date().toISOString(),
    attrCount: v.stats.attrCount, nodeCount: v.stats.nodeCount, source: body.sourceName || '商家导入', status: 'published', operator: u.username,
  });
  audit(u, 'category_import', rootCode + ' v' + version);
  store.save();
  return ok(res, {
    categoryId: tree.id, categoryCode: rootCode, version,
    generated: { nodeCount: v.stats.nodeCount, attrCount: v.stats.attrCount, indexFields: indexMapping.fieldCount, formSchemaId: 'form_' + rootCode.toLowerCase() + '_v' + version },
    replacedOldVersion: !!oldVersion, warnings: v.warnings,
  }, '品类导入成功');
});

route('GET', '/api/v1/merchant/categories', async (req, res) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const roots = db.categories.filter((c) => c.parentId === null).map((c) => ({
    id: c.id, code: c.code, name: c.name, version: c.version, status: c.status, source: c.source,
    nodeCount: db.categories.filter((x) => x.path.startsWith('/' + c.code)).length,
  }));
  return ok(res, { list: roots, versions: db.categoryVersions.slice().reverse() });
});

route('GET', '/api/v1/merchant/categories/:id/form-schema', async (req, res, p) => {
  const c = db.categories.find((x) => x.id === Number(p.id));
  if (!c) return fail(res, 40407, '品类不存在');
  const node = { id: c.id, code: c.code, name: c.name, attributes: c.attributes };
  return ok(res, { formSchema: cat.buildFormSchema(node) });
});

route('GET', '/api/v1/merchant/index-mappings', async (req, res) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  return ok(res, { list: db.indexMappings });
});

// ---- 商家商品/库存 ----
route('GET', '/api/v1/merchant/products', async (req, res, p, body, query) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  let list = db.products;
  if (u.role === 'merchant') list = list.filter((x) => x.merchantId === u.id);
  if (query.keyword) list = list.filter((x) => x.title.includes(query.keyword));
  return ok(res, { list: list.map((x) => Object.assign(productView(x, true), { source: 'merchant' })) });
});

route('POST', '/api/v1/merchant/products', async (req, res, p, body) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const category = db.categories.find((c) => c.id === Number(body.categoryId));
  if (!category) return fail(res, 40016, '品类不存在');
  // 依据 schema 校验必填属性
  const missing = category.attributes.filter((a) => a.required && (body.attrs || {})[a.code] == null).map((a) => a.name);
  if (missing.length) return fail(res, 40017, '缺少必填品类属性：' + missing.join('、'));
  const pid = db.products.length + 1;
  const skus = (body.skus || []).map((s, i) => {
    const id = db.skus.length + 1;
    db.skus.push({ id, productId: pid, specText: s.specText || '默认规格', salePrice: Number(s.salePrice), marketPrice: Number(s.marketPrice || s.salePrice * 1.2), status: 1, attrs: body.attrs || {} });
    db.inventories.push({ id: db.inventories.length + 1, skuId: id, warehouseId: 1, totalQty: Number(s.stock || 0), lockedQty: 0, safeQty: 5, version: 1 });
    return id;
  });
  const prices = skus.map((id) => (db.skus.find((s) => s.id === id) || {}).salePrice || 0);
  const prod = {
    id: pid, merchantId: u.id, merchantName: u.shopName || '商家', categoryId: category.id, categoryCode: category.code, categoryName: category.name,
    title: body.title, subtitle: body.subtitle || '', emoji: body.emoji || '📦', color: body.color || '#3b6ca8', mainImage: body.mainImage || '',
    attrs: body.attrs || {}, skuIds: skus, priceMin: Math.min(...prices), priceMax: Math.max(...prices),
    status: 1, tags: body.tags || [], salesCount: 0, ratingAvg: 5, reviewCount: 0, createdAt: new Date().toISOString(),
  };
  db.products.push(prod);
  audit(u, 'publish_product', prod.title);
  store.save();
  return ok(res, { product: productView(prod, true) }, '商品发布成功');
});

route('PATCH', '/api/v1/merchant/products/:id', async (req, res, p, body) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const prod = db.products.find((x) => x.id === Number(p.id));
  if (!prod) return fail(res, 40401, '商品不存在');
  if (body.status != null) prod.status = Number(body.status);
  if (body.title) prod.title = body.title;
  if (body.subtitle != null) prod.subtitle = body.subtitle;
  audit(u, 'update_product', prod.title + ' status=' + prod.status);
  store.save();
  return ok(res, { product: productView(prod, true) }, '已更新');
});

route('GET', '/api/v1/merchant/inventory', async (req, res, p, body, query) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const list = db.inventories.map((inv) => {
    const sku = db.skus.find((s) => s.id === inv.skuId);
    const prod = sku ? db.products.find((x) => x.id === sku.productId) : null;
    return {
      skuId: inv.skuId, warehouseId: inv.warehouseId, title: prod ? prod.title : '', specText: sku ? sku.specText : '',
      totalQty: inv.totalQty, lockedQty: inv.lockedQty, available: inv.totalQty - inv.lockedQty,
      safeQty: inv.safeQty, warning: inv.totalQty - inv.lockedQty <= inv.safeQty, version: inv.version,
    };
  });
  return ok(res, { list, logs: db.inventoryLogs.slice(-30).reverse() });
});

route('POST', '/api/v1/merchant/inventory/adjust', async (req, res, p, body) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const inv = db.inventories.find((v) => v.skuId === Number(body.skuId));
  if (!inv) return fail(res, 40408, '库存记录不存在');
  inv.totalQty = Math.max(0, inv.totalQty + Number(body.delta || 0));
  inv.version += 1;
  db.inventoryLogs.push({ id: db.inventoryLogs.length + 1, skuId: inv.skuId, type: 'adjust', qty: Number(body.delta || 0), orderNo: '-', by: u.username, at: new Date().toISOString() });
  store.save();
  return ok(res, { inventory: inv }, '库存已调整');
});

route('GET', '/api/v1/merchant/orders', async (req, res) => {
  const u = requireRole(req, res, ['merchant', 'admin']); if (!u) return;
  const list = db.orders.slice().reverse().map(orderView);
  return ok(res, { list });
});

// ---- 运营端 ----
route('GET', '/api/v1/console/dashboard', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  const paidOrders = db.orders.filter((o) => o.status >= 1 && o.status <= 3);
  const gmv = paidOrders.reduce((n, o) => n + o.payAmount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = paidOrders.filter((o) => (o.paidAt || '').slice(0, 10) === today);
  const catSales = {};
  paidOrders.forEach((o) => o.items.forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) catSales[p.categoryName] = (catSales[p.categoryName] || 0) + it.subtotal;
  }));
  const behavior = {};
  db.behaviors.forEach((b) => { behavior[b.eventType] = (behavior[b.eventType] || 0) + 1; });
  return ok(res, {
    kpi: {
      gmv: Number(gmv.toFixed(2)), orderCount: paidOrders.length, todayGmv: Number(todayOrders.reduce((n, o) => n + o.payAmount, 0).toFixed(2)),
      todayOrders: todayOrders.length, userCount: db.users.length, productCount: db.products.filter((p) => p.status === 1).length,
      categoryCount: db.categories.filter((c) => c.parentId === null).length,
      avgOrderValue: paidOrders.length ? Number((gmv / paidOrders.length).toFixed(2)) : 0,
    },
    catSales: Object.entries(catSales).map(([name, v]) => ({ name, value: Number(v.toFixed(2)) })),
    behavior,
    recommendCount: db.recommendLogs.length,
    bundleCount: db.bundles.length,
    recentOrders: db.orders.slice(-6).reverse().map(orderView),
    aiCapability: {
      customerService: { sessions: db.conversations.length, messages: db.messages.length },
      selection: { calls: db.recommendLogs.length },
      bundle: { generated: db.bundles.length },
    },
  });
});

route('GET', '/api/v1/console/users', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { list: db.users.map(publicUser) });
});

route('POST', '/api/v1/console/users/:id/status', async (req, res, p, body) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  const target = db.users.find((x) => x.id === Number(p.id));
  if (!target) return fail(res, 40409, '用户不存在');
  target.status = Number(body.status);
  audit(u, 'update_user_status', target.username + ' -> ' + target.status);
  store.save();
  return ok(res, { list: db.users.map(publicUser) }, '已更新');
});

route('GET', '/api/v1/console/ai/prompts', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { list: db.prompts, config: db.config });
});

route('POST', '/api/v1/console/ai/prompts', async (req, res, p, body) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  const exist = db.prompts.find((x) => x.scene === body.scene);
  if (exist) { exist.content = body.content; exist.version += 1; exist.updatedAt = new Date().toISOString(); exist.name = body.name || exist.name; }
  else db.prompts.push({ id: db.prompts.length + 1, name: body.name || '提示词', scene: body.scene, version: 1, content: body.content, status: 'published', updatedAt: new Date().toISOString() });
  audit(u, 'update_prompt', body.scene);
  store.save();
  return ok(res, { list: db.prompts }, '提示词已发布');
});

route('POST', '/api/v1/console/ai/config', async (req, res, p, body) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  db.config = Object.assign(db.config, body);
  audit(u, 'update_ai_config', JSON.stringify(body).slice(0, 200));
  store.save();
  return ok(res, { config: db.config }, 'AI 配置已更新');
});

route('GET', '/api/v1/console/knowledge/documents', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { list: db.knowledge });
});

route('POST', '/api/v1/console/knowledge/documents', async (req, res, p, body) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  const content = body.content || '';
  // 简单切片：按句号/换行切分为 ≤200 字片段
  const pieces = content.split(/[。\n]/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  pieces.forEach((s) => { if ((buf + s).length > 200) { if (buf) chunks.push(buf); buf = s + '。'; } else buf += s + '。'; });
  if (buf) chunks.push(buf);
  chunks.forEach((c) => db.knowledge.push({ id: db.knowledge.length + 1, categoryCode: body.categoryCode || 'CUSTOM', title: body.title || '自定义文档', content: c, embeddingId: 'vec_' + (db.knowledge.length + 1), status: 1 }));
  audit(u, 'import_knowledge', (body.title || '') + ' 切片 ' + chunks.length);
  store.save();
  return ok(res, { chunks: chunks.length, list: db.knowledge.slice(-chunks.length) }, '知识库已导入');
});

route('DELETE', '/api/v1/console/knowledge/documents/:id', async (req, res, p) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  db.knowledge = db.knowledge.filter((k) => k.id !== Number(p.id));
  store.save();
  return ok(res, null, '已删除');
});

route('GET', '/api/v1/console/promotions', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { coupons: db.coupons, userCoupons: db.userCoupons });
});

route('POST', '/api/v1/console/promotions/coupons', async (req, res, p, body) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  const c = {
    id: db.coupons.length + 1, code: body.code || ('C' + Date.now().toString(36).toUpperCase()),
    name: body.name, type: body.type === 'discount' ? 'discount' : 'full_reduce',
    threshold: Number(body.threshold || 0), value: Number(body.value || 0),
    startAt: new Date().toISOString(), endAt: body.endAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    total: Number(body.total || 100), claimed: 0, status: 1,
  };
  db.coupons.push(c);
  audit(u, 'create_coupon', c.name);
  store.save();
  return ok(res, { coupon: c }, '优惠券已创建');
});

route('GET', '/api/v1/console/audit-logs', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { list: db.auditLogs.slice().reverse() });
});

route('GET', '/api/v1/console/index-mappings', async (req, res) => {
  const u = requireRole(req, res, ['admin']); if (!u) return;
  return ok(res, { list: db.indexMappings });
});

// ---------------------------------------------------------------------------
// orderView
// ---------------------------------------------------------------------------
function orderView(o) {
  return {
    id: o.id, orderNo: o.orderNo, status: o.status, statusText: o.statusText,
    items: o.items, totalAmount: o.totalAmount, couponDiscount: o.couponDiscount, freight: o.freight,
    payAmount: o.payAmount, coupon: o.coupon, address: o.address, remark: o.remark,
    createdAt: o.createdAt, paidAt: o.paidAt,
    hasShipment: !!o.shipmentId, canReview: o.status === 3,
    reviewed: o.items.every((it) => db.reviews.some((r) => r.orderId === o.id && r.productId === it.productId)),
  };
}

// ---------------------------------------------------------------------------
// 静态资源
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 禁止目录穿越
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    return fs.createReadStream(filePath).pipe(res);
  }
  // SPA 回退
  const index = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(index).pipe(res);
  }
  res.writeHead(404); res.end('Not Found');
}

// ---------------------------------------------------------------------------
// 请求分发
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' });
    return res.end();
  }
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const query = parsed.query || {};

  if (pathname.startsWith('/api/')) {
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      try {
        return await r.handler(req, res, params, body, query);
      } catch (e) {
        console.error('[API ERROR]', pathname, e.stack || e.message);
        return fail(res, 50000, '服务器内部错误：' + e.message);
      }
    }
    return fail(res, 40400, '接口不存在: ' + pathname, null, 404);
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`[AI-ECP] 智选云 AI 电商在线售货系统已启动`);
  console.log(`[AI-ECP] 监听 http://${HOST}:${PORT}`);
  console.log(`[AI-ECP] 默认账号：consumer01/consumer123 · merchant01/merchant123 · admin/admin123`);
});

process.on('uncaughtException', (e) => console.error('[uncaught]', e.stack || e.message));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && (e.stack || e.message)));
