#!/usr/bin/env node
'use strict';
/**
 * test-static.js —— 在 Node 中以「无浏览器」方式验证静态 bundle 的业务逻辑。
 * 做法：注入 localStorage 桩 → 加载 docs/assets/vendor.js → 通过 AIECP_DISPATCH 调接口。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------- localStorage 桩
const storeMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => { storeMap.set(k, String(v)); },
  removeItem: (k) => { storeMap.delete(k); },
  clear: () => storeMap.clear(),
  key: (i) => Array.from(storeMap.keys())[i] || null,
  get length() { return storeMap.size; },
};

// ---------------------------------------------------------------- 加载 bundle
const vendorPath = path.join(__dirname, '..', 'docs', 'assets', 'vendor.js');
vm.runInThisContext(fs.readFileSync(vendorPath, 'utf8'), { filename: 'vendor.js' });

if (globalThis.__AIECP_BOOT_ERROR__) {
  console.error('❌ 启动失败：', globalThis.__AIECP_BOOT_ERROR__);
  process.exit(1);
}

const D = globalThis.AIECP_DISPATCH;

async function call(method, url, { token, body, headers } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
  if (token) h['Authorization'] = 'Bearer ' + token;
  const r = await D(method, url, h, body ? JSON.stringify(body) : '');
  let json = null;
  try { json = JSON.parse(r.body); } catch (e) { json = { __raw: String(r.body).slice(0, 200) }; }
  return { status: r.status, json };
}

let ok = 0, fail = 0;
function P(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  // 1) 演示账号
  let r = await call('GET', '/api/v1/demo/accounts');
  const accts = (r.json.data && r.json.data.accounts) || [];
  P('演示账号接口', r.json && r.json.code === 0 && accts.length >= 3, accts.map((a) => a.username + '/' + a.role));

  // 2) 三种角色登录
  const tokens = {};
  for (const [u, p, role] of [['consumer01', 'consumer123', 'consumer'], ['merchant01', 'merchant123', 'merchant'], ['admin', 'admin123', 'admin']]) {
    r = await call('POST', '/api/v1/auth/login', { body: { username: u, password: p } });
    const good = r.json && r.json.code === 0 && r.json.data.user.role === role;
    P('登录 ' + u, good, good ? r.json.data.user.roleLabel : r.json.message);
    if (good) tokens[role] = r.json.data.token;
  }
  // 密码错误必须被拒
  r = await call('POST', '/api/v1/auth/login', { body: { username: 'consumer01', password: 'wrong' } });
  P('错误口令被拒绝', r.json.code !== 0, r.json.code);

  // 3) 品类树 + JSON 品类引擎
  r = await call('GET', '/api/v1/mall/categories/tree');
  const roots = (r.json.data && r.json.data.tree) || [];
  P('品类树（4 个根品类）', roots.length === 4, roots.map((x) => x.name));

  // 4) 商品与筛选维度
  r = await call('GET', '/api/v1/mall/products?size=100');
  const totalProducts = r.json.data.total;
  P('在售商品数', totalProducts >= 15, totalProducts);
  const firstCatId = ((r.json.data.list[0] || {}).categoryId) || 1;
  r = await call('GET', '/api/v1/mall/products?categoryId=' + firstCatId + '&size=5');
  P('品类筛选 + 动态 facet', r.json.code === 0 && Array.isArray(r.json.data.facets) && r.json.data.facets.length > 0,
    (r.json.data.facets || []).map((f) => f.name));

  // 5) 商品详情（属性 Schema + SKU）
  const pid = (await call('GET', '/api/v1/mall/products?size=1')).json.data.list[0].id;
  r = await call('GET', '/api/v1/mall/products/' + pid);
  const pd = r.json.data.product;
  P('商品详情含属性 Schema 与 SKU', !!pd && pd.skus.length > 0 && pd.attributeSchema.length > 0,
    { skus: pd.skus.length, attrs: pd.attributeSchema.map((a) => a.name) });

  // 6) 三项 AI 能力
  r = await call('POST', '/api/v1/ai/recommend/selection', { body: { scene: 'home', limit: 6 } });
  const sel = r.json.data || {};
  P('智能选品（多路召回）', r.json.code === 0 && (sel.items || []).length > 0 && !!sel.recallStats,
    { items: (sel.items || []).length, channels: Object.keys(sel.recallStats || {}) });

  r = await call('POST', '/api/v1/ai/bundle/compose', { body: { mainSkuId: pd.skus[0].id, sceneTag: '' } });
  const bd = r.json.data || {};
  const b0 = (bd.bundles || [])[0] || {};
  P('智能组货（四维校验 + 组合定价）', r.json.code === 0 && (bd.bundles || []).length > 0, {
    scene: bd.sceneLabel, bundles: (bd.bundles || []).length,
    bundlePrice: b0.bundlePrice, grossLevel: b0.grossLevel, dims: b0.dims,
  });

  const custToken = tokens.consumer;
  r = await call('POST', '/api/v1/ai/customer-service/chat', { token: custToken, body: { sessionId: 's-static-1', question: '你们的退货政策是什么？' } });
  P('智能客服（意图 + 知识检索）', r.json.code === 0 && !!r.json.data.answer,
    { intent: r.json.data && r.json.data.intent, degraded: r.json.data && r.json.data.degraded, sources: (r.json.data && r.json.data.references || []).length });

  // 7) 交易主链路
  const skus = (await call('GET', '/api/v1/mall/skus?ids=' + pd.skus.slice(0, 2).map((s) => s.id).join(','))).json.data.list;
  P('SKU 批量查询', skus.length >= 1 && !!skus[0].skuId, skus.map((s) => s.skuId + ':' + s.title));

  r = await call('POST', '/api/v1/mall/cart/items', { token: custToken, body: { skuId: skus[0].skuId, quantity: 2 } });
  P('加入购物车', r.json.code === 0, r.json.message);

  r = await call('GET', '/api/v1/mall/cart', { token: custToken });
  P('购物车读取与汇总', r.json.code === 0 && r.json.data.items.length > 0, r.json.data.summary);

  r = await call('POST', '/api/v1/mall/orders', {
    token: custToken,
    body: { items: [{ skuId: skus[0].skuId, quantity: 1 }], couponCode: 'WELCOME20' },
  });
  const order = r.json.data && r.json.data.order;
  P('下单（券 + 运费 + 库存）', r.json.code === 0 && !!order, order && { no: order.orderNo, pay: order.payAmount, discount: order.couponDiscount, freight: order.freight });

  r = await call('POST', '/api/v1/mall/payments/' + order.id + '/pay', { token: custToken, body: { channel: 'wechat' } });
  P('支付（幂等键）', r.json.code === 0 && !!r.json.data.tradeNo, { tradeNo: r.json.data && r.json.data.tradeNo, status: r.json.data && r.json.data.order.statusText });

  r = await call('GET', '/api/v1/mall/orders/' + order.id + '/logistics', { token: custToken });
  P('物流轨迹', r.json.code === 0 && (r.json.data.traces || []).length > 0, {
    carrier: r.json.data.shipment && r.json.data.shipment.carrier, traces: (r.json.data.traces || []).length,
  });

  // 8) 商家端：品类 JSON 引擎（V-01~V-12）
  const merchantToken = tokens.merchant;

  // 8a) 语法错误分支
  r = await call('POST', '/api/v1/merchant/categories/validate', {
    token: merchantToken,
    body: { jsonText: '{"category": {"code":"TEST_X","name":"测试品类","attributes":[]' },
  });
  P('品类 JSON 语法错误被拦截', r.json.code !== 0 && !!(r.json.data && (r.json.data.rule || r.json.data.detail)),
    r.json.data && (r.json.data.rule || r.json.data.detail));

  // 8b) 全量语义校验（一次反馈多条错误）
  r = await call('POST', '/api/v1/merchant/categories/validate', {
    token: merchantToken,
    body: { jsonText: '{ "schemaVersion":"1.0", "category": { "code":"test", "name":"" } }' },
  });
  const errs = (r.json.data && r.json.data.errors) || [];
  P('品类全量校验（一次反馈多条错误）', r.json.data && r.json.data.valid === false && errs.length >= 2,
    errs.map((e) => e.rule));

  // 8c) dry-run 生成动态表单 Schema（无副作用）
  const goodJson = JSON.stringify({
    schemaVersion: '1.0',
    category: {
      code: 'PET_SUPPLY', name: '宠物用品',
      attributes: [{ code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true }],
      children: [{ code: 'PET_FOOD', name: '宠物主粮', attributes: [{ code: 'WEIGHT', name: '规格', dataType: 'enum', options: ['1kg', '2kg', '5kg'], required: true, filterable: true }] }],
    },
  });
  r = await call('POST', '/api/v1/merchant/categories/import', {
    token: merchantToken,
    body: { mode: 'dryRun', jsonText: goodJson },
  });
  P('品类 dry-run 生成动态表单 Schema', r.json.code === 0 && !!r.json.data.formSchema,
    r.json.data && { fieldCount: r.json.data.formSchema && r.json.data.formSchema.fieldCount, generated: r.json.data.generated });

  // 8d) 正式导入落库
  r = await call('POST', '/api/v1/merchant/categories/import', {
    token: merchantToken,
    body: { mode: 'commit', jsonText: goodJson, sourceName: '静态自测导入' },
  });
  P('品类正式导入落库', r.json.code === 0, r.json.data);

  r = await call('GET', '/api/v1/mall/categories/tree');
  const rootsAfter = (r.json.data && r.json.data.tree) || [];
  P('新品类无需改代码即生效（根品类 4→5）', rootsAfter.length === 5, rootsAfter.map((x) => x.name));

  // 9) 运营端：数据看板 + 权限控制
  r = await call('GET', '/api/v1/console/dashboard', { token: tokens.admin });
  P('运营数据看板', r.json.code === 0 && !!r.json.data.kpi, r.json.data && r.json.data.kpi);

  r = await call('GET', '/api/v1/console/dashboard', { token: custToken });
  P('越权访问被拒（消费者访问运营看板）', r.json.code !== 0, r.json.code);

  r = await call('GET', '/api/v1/console/dashboard');
  P('未登录被拒', r.json.code !== 0, r.json.code);

  // 10) 持久化：数据写入 localStorage
  P('数据落盘 localStorage（跨刷新保持）', storeMap.size > 0, storeMap.size + ' 个键');

  console.log('\n通过 ' + ok + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常：', e); process.exit(1); });
