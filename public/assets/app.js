/* =============================================================================
   智选云 AI 电商在线售货系统 —— 前端应用（原生 JS，无外部依赖）
   ========================================================================== */
'use strict';

// ------------------------------------------------------------------ 基础
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const app = $('#app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '¥' + Number(n || 0).toFixed(2);
const dt = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '');
const tint = (color, a) => (color || '#3b6ca8') + (a || '26');

const State = {
  token: localStorage.getItem('aiecp_token') || '',
  user: null,
  cartCount: 0,
  aiOpen: false,
  aiSession: localStorage.getItem('aiecp_ai_session') || '',
};

// ------------------------------------------------------------------ API
async function api(method, path, body, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (State.token) headers['Authorization'] = 'Bearer ' + State.token;
  try {
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({ code: -1, message: '响应解析失败' }));
    if (json.code === 40100) { logout(false); }
    if (json.code !== 0 && !opts.silent) toast(json.message || '操作失败', 'err');
    return json;
  } catch (e) {
    if (!opts.silent) toast('网络异常：' + e.message, 'err');
    return { code: -1, message: e.message, data: null };
  }
}
const GET = (p, o) => api('GET', p, null, o);
const POST = (p, b, o) => api('POST', p, b, o);
const PATCH = (p, b, o) => api('PATCH', p, b, o);
const DEL = (p, o) => api('DELETE', p, null, o);

// ------------------------------------------------------------------ UI 工具
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2200);
}
function modal(title, bodyHtml, footHtml, wide) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-mask"></div><div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
  </div>`;
  root.classList.add('open');
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
  $('.modal-mask', root).addEventListener('click', closeModal);
  return root;
}
function closeModal() { $('#modalRoot').classList.remove('open'); $('#modalRoot').innerHTML = ''; }

// ------------------------------------------------------------------ 导航
const MENU = {
  mall: { label: '商城', hash: '#/home' },
  cart: { label: '购物车', hash: '#/cart' },
  orders: { label: '我的订单', hash: '#/orders' },
  ai_assistant: { label: '智能助手', hash: '#/ai' },
  profile: { label: '我的', hash: '#/me' },
  merchant_category: { label: '品类管理', hash: '#/merchant/category' },
  merchant_product: { label: '商品管理', hash: '#/merchant/products' },
  merchant_inventory: { label: '库存管理', hash: '#/merchant/inventory' },
  merchant_order: { label: '订单处理', hash: '#/merchant/orders' },
  console_dashboard: { label: '数据看板', hash: '#/console/dashboard' },
  console_users: { label: '用户权限', hash: '#/console/users' },
  console_promotion: { label: '营销活动', hash: '#/console/promotions' },
  console_ai: { label: 'AI 配置', hash: '#/console/ai' },
  console_knowledge: { label: '知识库', hash: '#/console/knowledge' },
  console_audit: { label: '审计日志', hash: '#/console/audit' },
};

function renderTopbar() {
  const nav = $('#mainnav');
  const actions = $('#topbarActions');
  const cur = location.hash || '#/home';
  if (State.user) {
    nav.innerHTML = (State.user.menus || []).filter((m) => MENU[m])
      .map((m) => `<a href="${MENU[m].hash}" class="${cur.startsWith(MENU[m].hash) ? 'active' : ''}">${MENU[m].label}</a>`).join('');
    actions.innerHTML = `<a class="btn sm ghost" href="#/cart">🛒<span id="cartBadge" class="tag ${State.cartCount ? '' : 'hide'}">${State.cartCount}</span></a>
      <span class="chip blue" title="${esc(State.user.roleLabel)}">${esc(State.user.nickname)}</span>
      <button class="btn sm ghost" id="logoutBtn">退出</button>`;
    $('#logoutBtn').addEventListener('click', () => logout(true));
  } else {
    nav.innerHTML = `<a href="#/home">商城</a>`;
    actions.innerHTML = `<a class="btn sm primary" href="#/login">登录 / 注册</a>`;
  }
  const badge = $('#cartBadge');
  if (badge) { badge.textContent = State.cartCount; badge.classList.toggle('hide', !State.cartCount); }
}

async function refreshCart() {
  if (!State.user) { State.cartCount = 0; renderTopbar(); return; }
  const r = await GET('/api/v1/mall/cart', { silent: true });
  if (r.code === 0) { State.cartCount = r.data.summary.count; renderTopbar(); }
}

// ------------------------------------------------------------------ 组件
function productCard(p, opts) {
  opts = opts || {};
  const save = p.marketPrice && p.marketPrice > p.priceMin;
  return `<div class="pcard" data-pid="${p.id}">
    ${p.rank ? `<span class="badge-rank">No.${p.rank}</span>` : ''}
    ${opts.ai ? `<span class="badge-ai">AI 推荐</span>` : ''}
    <div class="pthumb" style="background:linear-gradient(135deg,${tint(p.color, '22')},${tint(p.color, '55')})"><span class="pt-emoji">${p.emoji || '📦'}</span></div>
    <div class="pcard-body">
      <div class="pcard-title">${esc(p.title)}</div>
      ${p.subtitle ? `<div class="pcard-sub">${esc(p.subtitle)}</div>` : ''}
      ${opts.reason ? `<div class="small muted" style="color:#4a90d9">🎯 ${esc(opts.reason)}</div>` : ''}
      <div class="pcard-foot">
        <span class="price"><span class="cur">¥</span><span class="big">${Number(p.priceMin).toFixed(2)}</span>${save ? `<span class="mkt">${money(p.marketPrice)}</span>` : ''}</span>
        <span class="small muted">${p.salesCount ? '已售 ' + p.salesCount : ''}</span>
      </div>
    </div>
  </div>`;
}
function bindProductCards(root) {
  $$('.pcard', root || app).forEach((el) => el.addEventListener('click', () => { location.hash = '#/product/' + el.dataset.pid; }));
}
function orderStatusChip(o) {
  const map = { 0: 'orange', 1: 'blue', 2: 'blue', 3: 'green', 4: 'gray', 5: 'orange', 6: 'gray' };
  return `<span class="chip ${map[o.status] || 'gray'}">${esc(o.statusText)}</span>`;
}
function stepsHtml(status) {
  const labels = ['提交订单', '付款成功', '商家发货', '确认收货'];
  const idx = status === 0 ? 0 : status === 1 ? 1 : status === 2 ? 2 : status >= 3 ? 3 : 0;
  return `<div class="steps">${labels.map((l, i) => `<div class="step ${i <= idx ? 'on' : ''}"><span class="dot"></span><div>${l}</div></div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ 路由
const routes = [
  [/^#\/login$/, viewLogin],
  [/^#\/home$/, viewHome],
  [/^#\/category\/(\d+)$/, viewCategory],
  [/^#\/search$/, viewSearch],
  [/^#\/product\/(\d+)$/, viewProduct],
  [/^#\/cart$/, viewCart],
  [/^#\/checkout$/, viewCheckout],
  [/^#\/orders$/, viewOrders],
  [/^#\/order\/(\d+)$/, viewOrderDetail],
  [/^#\/ai$/, viewAiPage],
  [/^#\/me$/, viewMe],
  [/^#\/merchant\/category$/, viewMerchantCategory],
  [/^#\/merchant\/products$/, viewMerchantProducts],
  [/^#\/merchant\/inventory$/, viewMerchantInventory],
  [/^#\/merchant\/orders$/, viewMerchantOrders],
  [/^#\/console\/dashboard$/, viewConsoleDashboard],
  [/^#\/console\/users$/, viewConsoleUsers],
  [/^#\/console\/promotions$/, viewConsolePromotions],
  [/^#\/console\/ai$/, viewConsoleAi],
  [/^#\/console\/knowledge$/, viewConsoleKnowledge],
  [/^#\/console\/audit$/, viewConsoleAudit],
];

function loading() { app.innerHTML = '<div class="loading"><span class="spin"></span><p>加载中…</p></div>'; }

async function router() {
  window.scrollTo(0, 0);
  const hash = location.hash || '#/home';
  const query = parseQuery(hash);
  for (const [re, fn] of routes) {
    const m = hash.split('?')[0].match(re);
    if (m) {
      if (!State.user && !['#/login', '#/home'].includes(hash.split('?')[0])) { location.hash = '#/login'; return; }
      renderTopbar();
      try { await fn.apply(null, m.slice(1).concat([query])); } catch (e) { app.innerHTML = `<div class="empty"><span class="ico">⚠️</span>页面渲染出错：${esc(e.message)}</div>`; console.error(e); }
      renderTopbar();
      return;
    }
  }
  app.innerHTML = `<div class="empty"><span class="ico">🔍</span>页面不存在<br><a class="btn mt-16" href="#/home">返回商城首页</a></div>`;
}
function parseQuery(hash) {
  const i = hash.indexOf('?');
  const q = {};
  if (i >= 0) new URLSearchParams(hash.slice(i + 1)).forEach((v, k) => { q[k] = v; });
  return q;
}
window.addEventListener('hashchange', router);

// ================================================================== 登录
let authMode = 'login';
async function viewLogin() {
  authMode = 'login';
  const demo = await GET('/api/v1/demo/accounts', { silent: true });
  const accounts = (demo.data && demo.data.accounts) || [];
  app.innerHTML = `<div class="auth-wrap" style="margin:0 -20px">
    <div class="auth-hero">
      <p class="kicker" style="color:#bcd8f5;letter-spacing:2px;font-size:12px;margin:0 0 6px">AI-ECP · AI E-COMMERCE PLATFORM</p>
      <h1>智选云 AI 电商在线售货系统</h1>
      <p>支持智能客服、智能选品、智能组货三项 AI 能力的电商在线售货系统；商品品类由商家以 JSON 文本自定义，系统解析后自动生成属性 Schema、动态表单与检索索引。</p>
      <div class="auth-feats">
        <div class="auth-feat"><b>品类自定义</b>：JSON 一次声明，多端生效，新增品类无需发版</div>
        <div class="auth-feat"><b>智能客服</b>：意图分流 + 知识检索增强 + 受控工具调用 + 转人工</div>
        <div class="auth-feat"><b>智能选品</b>：多路召回 + 精排 + 规则过滤 + 冷启动兜底</div>
        <div class="auth-feat"><b>智能组货</b>：库存 / 履约 / 价格 / 毛利四维校验的组合搭配</div>
      </div>
    </div>
    <div class="auth-panel"><div class="auth-box">
      <div class="auth-tabs">
        <button id="tabLogin" class="active">登录</button>
        <button id="tabReg">注册</button>
      </div>
      <div id="authForm"></div>
      <div class="demo-accounts">
        <h4>🔑 演示账号（一键填充）</h4>
        ${accounts.map((a) => `<div class="demo-row">
          <span class="chip gray">${esc(a.role)}</span>
          <span class="mono">${esc(a.username)}</span>
          <span class="muted">/</span>
          <span class="mono">${esc(a.password)}</span>
          <button class="btn sm ghost" data-fill="${esc(a.username)}" data-pw="${esc(a.password)}" style="margin-left:auto">填充</button>
        </div>`).join('')}
      </div>
    </div></div>
  </div>`;
  renderAuthForm();
  $('#tabLogin').addEventListener('click', () => { authMode = 'login'; $('#tabLogin').classList.add('active'); $('#tabReg').classList.remove('active'); renderAuthForm(); });
  $('#tabReg').addEventListener('click', () => { authMode = 'register'; $('#tabReg').classList.add('active'); $('#tabLogin').classList.remove('active'); renderAuthForm(); });
  $$('[data-fill]').forEach((b) => b.addEventListener('click', () => {
    $('#au').value = b.dataset.fill; $('#ap').value = b.dataset.pw;
  }));
}

function renderAuthForm() {
  const box = $('#authForm');
  box.innerHTML = `
    <div class="field"><label>用户名 / 手机号</label><input class="input" id="au" placeholder="请输入用户名" autocomplete="username"></div>
    <div class="field"><label>密码</label><input class="input" id="ap" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
    ${authMode === 'register' ? `
      <div class="field"><label>昵称</label><input class="input" id="an" placeholder="展示用昵称"></div>
      <div class="field"><label>注册身份</label><select class="select" id="ar"><option value="consumer">消费者</option><option value="merchant">商家</option></select></div>` : ''}
    <button class="btn primary block" id="authSubmit">${authMode === 'login' ? '登 录' : '注 册'}</button>
    <p class="small muted center mt-8">${authMode === 'login' ? '还没有账号？点击上方「注册」' : '已有账号？点击上方「登录」'}</p>`;
  $('#authSubmit').addEventListener('click', doAuth);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
}
async function doAuth() {
  const username = $('#au').value.trim(), password = $('#ap').value;
  if (!username || !password) return toast('请输入用户名与密码', 'err');
  let r;
  if (authMode === 'login') r = await POST('/api/v1/auth/login', { username, password });
  else r = await POST('/api/v1/auth/register', { username, password, nickname: $('#an').value.trim(), role: $('#ar').value });
  if (r.code !== 0) return;
  State.token = r.data.token; State.user = r.data.user;
  localStorage.setItem('aiecp_token', State.token);
  toast('欢迎，' + State.user.nickname, 'ok');
  await refreshCart();
  location.hash = '#/home';
}
async function logout(nav) {
  if (State.token) await POST('/api/v1/auth/logout', {}, { silent: true });
  State.token = ''; State.user = null; State.cartCount = 0;
  localStorage.removeItem('aiecp_token');
  renderTopbar();
  if (nav) { location.hash = '#/login'; } else location.hash = '#/login';
}

// ================================================================== 首页
async function viewHome() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const [treeR, recR, prodR, couponR] = await Promise.all([
    GET('/api/v1/mall/categories/tree', { silent: true }),
    POST('/api/v1/ai/recommend/selection', { scene: 'home', limit: 8 }, { silent: true }),
    GET('/api/v1/mall/products?size=8&sort=sales', { silent: true }),
    GET('/api/v1/mall/coupons', { silent: true }),
  ]);
  const roots = (treeR.data && treeR.data.tree) || [];
  const rec = (recR.data && recR.data.items) || [];
  const hot = (prodR.data && prodR.data.list) || [];
  const coupons = (couponR.data && couponR.data.list) || [];

  app.innerHTML = `
    <section class="banner">
      <div>
        <p class="kicker">AI-ECP · 智能客服 · 智能选品 · 智能组货</p>
        <h1>${State.user ? esc(State.user.nickname) + '，欢迎回来 👋' : '智选云 AI 电商在线售货系统'}</h1>
        <p class="lede">以 JSON 自定义商品品类，让三条 AI 能力贯穿「逛 → 选 → 搭 → 买」全链路。</p>
        <form class="row gap-8" id="searchForm">
          <input class="input" id="searchKw" placeholder="搜索商品、品牌或品类…" style="max-width:420px">
          <button class="btn primary" type="submit">搜索</button>
        </form>
        <div class="banner-feats mt-16">
          <span class="feat-pill">🤖 <b>智能客服</b>（含转人工与降级）</span>
          <span class="feat-pill">🎯 <b>智能选品</b>（多路召回精排）</span>
          <span class="feat-pill">🧩 <b>智能组货</b>（四维校验）</span>
        </div>
      </div>
      <div>
        <div class="stats-strip" style="grid-template-columns:1fr 1fr">
          <div class="stat-box"><b>${(prodR.data && prodR.data.total) || 0}</b><span>在售商品</span></div>
          <div class="stat-box"><b>${roots.length}</b><span>根品类</span></div>
          <div class="stat-box"><b>3</b><span>AI 能力</span></div>
          <div class="stat-box"><b>${coupons.length}</b><span>可领优惠</span></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>品类导航</h2><span class="desc">由商家 JSON 自定义生成</span></div>
      <div class="grid auto">
        ${roots.map((c) => `<div class="card card-pad" data-cat="${c.id}" style="cursor:pointer">
          <div class="row between"><b style="font-size:16px">${esc(c.name)}</b><span class="tag">${esc(c.code)}</span></div>
          <div class="small muted mt-8">${c.children.map((x) => esc(x.name)).join(' · ') || '—'}</div>
        </div>`).join('')}
      </div>
    </section>

    ${coupons.length ? `<section class="section">
      <div class="section-head"><h2>优惠活动</h2></div>
      <div class="grid auto">
        ${coupons.map((c) => `<div class="card card-pad row between">
          <div><b>${esc(c.name)}</b><div class="small muted">${c.type === 'full_reduce' ? `满 ${c.threshold} 减 ${c.value}` : `${(c.value * 10).toFixed(1)} 折`} · 剩余 ${c.total - c.claimed}</div></div>
          <button class="btn sm ${c.claimedByMe ? '' : 'primary'}" data-claim="${esc(c.code)}" ${c.claimedByMe ? 'disabled' : ''}>${c.claimedByMe ? '已领取' : '领取'}</button>
        </div>`).join('')}
      </div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>为你推荐</h2><span class="desc">智能选品 · 多路召回 + 个性化精排${recR.data && recR.data.profile && recR.data.profile.coldStart ? '（冷启动兜底）' : ''}</span></div>
      <div class="grid auto">${rec.map((p) => productCard(p, { ai: true, reason: p.reason, rank: p.rank })).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>热销榜</h2><a class="desc" href="#/search?sort=sales">查看全部 →</a></div>
      <div class="grid auto">${hot.map((p) => productCard(p)).join('')}</div>
    </section>`;

  bindProductCards();
  $$('[data-cat]').forEach((el) => el.addEventListener('click', () => { location.hash = '#/category/' + el.dataset.cat; }));
  $$('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
    if (!State.user) { location.hash = '#/login'; return; }
    const r = await POST('/api/v1/mall/coupons/claim', { code: b.dataset.claim });
    if (r.code === 0) { toast('领取成功', 'ok'); viewHome(); }
  }));
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/search?kw=' + encodeURIComponent($('#searchKw').value.trim()); });
}

// ================================================================== 品类浏览
async function viewCategory(catId, query) {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const filters = Object.assign({}, query);
  const treeR = await GET('/api/v1/mall/categories/tree', { silent: true });
  const qs = new URLSearchParams(Object.assign({ categoryId: catId, size: 24 }, filters)).toString();
  const r = await GET('/api/v1/mall/products?' + qs, { silent: true });
  const tree = (treeR.data && treeR.data.tree) || [];
  const data = r.data || { list: [], total: 0, facets: [] };
  const curCat = findCat(tree, Number(catId));

  app.innerHTML = `<div class="grid side section">
    <aside class="card card-pad">
      <h3 style="font-size:15px">全部品类</h3>
      <ul class="cat-list">${tree.map((n) => catTreeHtml(n, Number(catId))).join('')}</ul>
    </aside>
    <div>
      <div class="row between mb-0">
        <div class="section-head" style="margin-bottom:8px"><h2>${esc(curCat ? curCat.name : '商品列表')}</h2><span class="desc">共 ${data.total} 件</span></div>
        <select class="select" id="sortSel" style="width:150px">
          ${[['default', '综合'], ['sales', '销量'], ['priceAsc', '价格升序'], ['priceDesc', '价格降序'], ['rating', '评分'], ['newest', '最新']]
            .map(([v, l]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      ${data.facets && data.facets.length ? `<div class="card card-pad mt-8">
        ${data.facets.map((f) => `<div class="filter-group">
          <h4>${esc(f.name)}${f.unit ? `（${esc(f.unit)}）` : ''}</h4>
          ${f.options ? `<div class="filter-opts">${f.options.map((o) => `<span class="filter-opt ${filters['att.' + f.code] === o ? 'on' : ''}" data-f="${f.code}" data-v="${esc(o)}">${esc(o)}</span>`).join('')}</div>`
            : `<div class="filter-opts small muted">可筛选维度（范围型，示例值）${f.range ? '：' + f.range[0] + ' ~ ' + f.range[1] : ''}</div>`}
        </div>`).join('')}
      </div>` : ''}
      <div class="mt-16"></div>
      <div class="grid auto" id="pList">${data.list.length ? data.list.map((p) => productCard(p)).join('') : '<div class="empty"><span class="ico">📦</span>该品类下暂无商品</div>'}</div>
    </div>
  </div>`;

  bindProductCards();
  $$('.cat-node').forEach((el) => el.addEventListener('click', () => { location.hash = '#/category/' + el.dataset.cid; }));
  $$('.filter-opt').forEach((el) => el.addEventListener('click', () => {
    const f = 'att.' + el.dataset.f;
    const q = Object.assign({}, filters);
    if (q[f] === el.dataset.v) delete q[f]; else q[f] = el.dataset.v;
    location.hash = '#/category/' + catId + '?' + new URLSearchParams(q).toString();
  }));
  $('#sortSel').addEventListener('change', () => {
    const q = Object.assign({}, filters, { sort: $('#sortSel').value });
    location.hash = '#/category/' + catId + '?' + new URLSearchParams(q).toString();
  });
}
function findCat(nodes, id) {
  for (const n of nodes) { if (n.id === id) return n; const f = findCat(n.children || [], id); if (f) return f; }
  return null;
}
function catTreeHtml(node, activeId, level) {
  level = level || 0;
  const hasChildren = node.children && node.children.length;
  return `<li>
    <div class="cat-node ${node.id === activeId ? 'active' : ''}" data-cid="${node.id}">
      <span class="cat-toggle">${hasChildren ? '▾' : '·'}</span><span>${esc(node.name)}</span>
    </div>
    ${hasChildren ? `<ul class="cat-children">${node.children.map((c) => catTreeHtml(c, activeId, level + 1)).join('')}</ul>` : ''}
  </li>`;
}

// ================================================================== 搜索
async function viewSearch(query) {
  query = query || {};
  const kw = query.kw || '';
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const qs = new URLSearchParams({ keyword: kw, size: 24, sort: query.sort || 'default' }).toString();
  const r = await GET('/api/v1/mall/products?' + qs, { silent: true });
  const data = r.data || { list: [], total: 0 };
  app.innerHTML = `<div class="section">
    <div class="section-head"><h2>搜索「${esc(kw)}」</h2><span class="desc">共 ${data.total} 件结果</span></div>
    <div class="grid auto">${data.list.length ? data.list.map((p) => productCard(p)).join('') : `<div class="empty" style="grid-column:1/-1"><span class="ico">🔍</span>没有找到相关商品<br><span class="small">试试「电饭煲」「手机」「跑鞋」等关键词</span></div>`}</div>
  </div>`;
  bindProductCards();
}

// ================================================================== 商品详情
let detailSku = null, detailQty = 1;
async function viewProduct(pid) {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/mall/products/' + pid, { silent: true });
  if (r.code !== 0) { app.innerHTML = '<div class="empty"><span class="ico">😢</span>商品不存在或已下架</div>'; return; }
  const p = r.data.product;
  detailSku = p.skus.find((s) => s.stock > 0) || p.skus[0];
  detailQty = 1;
  if (State.user) POST('/api/v1/ai/events', { eventType: 'click', productId: p.id, scene: 'detail' }, { silent: true });

  app.innerHTML = `<div class="section">
    <div class="small muted mb-0"><a href="#/home">首页</a> / <a href="#/category/${p.categoryId}">${esc(p.categoryName)}</a> / ${esc(p.title)}</div>
    <div class="detail-grid mt-16">
      <div>
        <div class="detail-hero" style="background:linear-gradient(135deg,${tint(p.color, '22')},${tint(p.color, '55')})">${p.emoji || '📦'}</div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">商品属性（由品类 Schema 动态渲染）</h4>
          <table class="table attr-table">${Object.entries(p.attrs).map(([k, v]) => {
            const a = p.attributeSchema.find((x) => x.code === k);
            return `<tr><td>${esc(a ? a.name : k)}</td><td>${esc(Array.isArray(v) ? v.join('、') : v)}${a && a.unit ? ' ' + esc(a.unit) : ''}</td></tr>`;
          }).join('')}</table>
        </div>
      </div>
      <div>
        <h1 style="font-size:22px">${esc(p.title)}</h1>
        <p class="muted" style="margin-top:-4px">${esc(p.subtitle || '')}</p>
        <div class="row gap-8 mt-8">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="chip green">⭐ ${p.ratingAvg} 分</span><span class="chip gray">已售 ${p.salesCount}</span></div>
        <div class="card card-pad mt-16" style="background:linear-gradient(120deg,#fdf5f5,#fff)">
          <span class="price"><span class="cur">¥</span><span class="big" style="font-size:30px" id="dPrice">${Number(detailSku.salePrice).toFixed(2)}</span>
          <span class="mkt">${money(detailSku.marketPrice)}</span></span>
          <span class="small muted" style="margin-left:10px">库存 <b id="dStock">${detailSku.stock}</b> 件</span>
        </div>
        <div class="mt-16">
          <label class="small muted">选择规格</label>
          <div class="sku-opts mt-8" id="skuOpts">
            ${p.skus.map((s) => `<span class="sku-opt ${s.id === detailSku.id ? 'on' : ''} ${s.stock <= 0 ? 'off' : ''}" data-sku="${s.id}" data-price="${s.salePrice}" data-market="${s.marketPrice}" data-stock="${s.stock}">${esc(s.specText)}<br><small>¥${Number(s.salePrice).toFixed(2)}</small></span>`).join('')}
          </div>
        </div>
        <div class="buy-bar">
          <div class="qty"><button id="qMinus">−</button><input id="qInput" value="1" readonly><button id="qPlus">+</button></div>
          <button class="btn primary" id="addCart">加入购物车</button>
          <button class="btn gold" id="buyNow">立即购买</button>
          <button class="btn" id="askAi">🤖 咨询客服</button>
        </div>

        <div class="card card-pad mt-24">
          <div class="row between"><h4 style="margin:0">🧩 智能组货 · 以本品为中心的搭配方案</h4><button class="btn sm" id="genBundle">生成搭配</button></div>
          <div id="bundleBox" class="mt-16"><div class="small muted">点击「生成搭配」，系统将校验库存、履约、价格与毛利四个维度后输出可售组合。</div></div>
        </div>

        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">商品评价（${p.reviews.length}）</h4>
          ${p.reviews.length ? p.reviews.map((rv) => `<div style="border-bottom:1px dashed var(--line);padding:8px 0">
            <div class="row gap-8"><b class="small">${esc(rv.user)}</b><span class="small" style="color:#f0a020">${'★'.repeat(rv.rating)}</span><span class="small muted">${dt(rv.createdAt)}</span></div>
            <div class="small">${esc(rv.content)}</div></div>`).join('') : '<div class="small muted">暂无评价</div>'}
        </div>

        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">🔥 猜你喜欢（智能选品）</h4>
          <div class="grid auto mt-8" id="recBox"><div class="small muted">加载中…</div></div>
        </div>
      </div>
    </div>
  </div>`;

  $$('.sku-opt').forEach((el) => el.addEventListener('click', () => {
    if (el.classList.contains('off')) return;
    detailSku = { id: Number(el.dataset.sku), salePrice: Number(el.dataset.price), marketPrice: Number(el.dataset.market), stock: Number(el.dataset.stock) };
    $$('.sku-opt').forEach((x) => x.classList.remove('on')); el.classList.add('on');
    $('#dPrice').textContent = detailSku.salePrice.toFixed(2);
    $('#dStock').textContent = detailSku.stock;
  }));
  $('#qMinus').addEventListener('click', () => { detailQty = Math.max(1, detailQty - 1); $('#qInput').value = detailQty; });
  $('#qPlus').addEventListener('click', () => { detailQty = Math.min(99, detailQty + 1); $('#qInput').value = detailQty; });
  $('#addCart').addEventListener('click', () => addToCart(detailSku.id, detailQty, false));
  $('#buyNow').addEventListener('click', () => { if (!State.user) return (location.hash = '#/login'); location.hash = '#/checkout?skus=' + detailSku.id + 'x' + detailQty; });
  $('#askAi').addEventListener('click', () => openAi('这款商品的库存和发货情况？'));
  $('#genBundle').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = '生成中…';
    const br = await POST('/api/v1/ai/bundle/compose', { mainSkuId: detailSku.id, sceneTag: $('#bundleScene') ? $('#bundleScene').value : '' }, { silent: true });
    renderBundle(br.data);
    e.target.disabled = false; e.target.textContent = '生成搭配';
  });

  GET('/api/v1/mall/products?categoryId=' + p.categoryId + '&size=5', { silent: true }).then((rr) => {
    const list = ((rr.data && rr.data.list) || []).filter((x) => x.id !== p.id).slice(0, 4);
    $('#recBox').innerHTML = list.length ? list.map((x) => productCard(x)).join('') : '<div class="small muted">暂无同类推荐</div>';
    bindProductCards($('#recBox'));
  });
}

function renderBundle(data) {
  const box = $('#bundleBox');
  if (!data) { box.innerHTML = '<div class="small muted">生成失败</div>'; return; }
  if (!data.bundles || !data.bundles.length) {
    box.innerHTML = `<div class="chip orange">已降级为单品推荐（${esc(data.degradeReason || '')}）</div>
      <div class="grid auto mt-8">${(data.fallbackItems || []).map((x) => `<div class="pcard" data-pid="${x.productId}"><div class="pthumb" style="background:${tint('#888', '22')}"><span class="pt-emoji">${x.emoji || '📦'}</span></div><div class="pcard-body"><div class="pcard-title">${esc(x.title)}</div><div class="small muted">${esc(x.reason)}</div><div class="price"><span class="cur">¥</span><span class="big">${Number(x.price).toFixed(2)}</span></div></div></div>`).join('')}</div>`;
    bindProductCards(box);
    return;
  }
  box.innerHTML = `<div class="small muted">场景：<b>${esc(data.sceneLabel)}</b> · 共 ${data.bundles.length} 套方案（均通过四维校验）</div>
    ${data.bundles.map((b, i) => `<div class="card card-pad mt-8" style="background:var(--soft-2)">
      <div class="row between"><b>方案 ${i + 1} · ${esc(b.sceneLabel)}</b><span class="chip green">毛利等级：${esc(b.grossLevel)}</span></div>
      <div class="mt-8">${b.items.map((it) => `<div class="row gap-8" style="padding:4px 0"><span style="font-size:20px">${it.emoji}</span><span class="small">${esc(it.title)}</span><span class="tag">${esc(it.role)}</span><span class="spacer"></span><b class="small">${money(it.unitPrice)}</b></div>`).join('')}</div>
      <div class="hr"></div>
      <div class="small">💡 ${esc(b.reason)}</div>
      <div class="row between mt-8"><div><span class="price"><span class="cur">¥</span><span class="big">${b.bundlePrice.toFixed(2)}</span></span><span class="small muted" style="margin-left:8px">原价 ${money(b.totalMarket)} · 省 ${money(b.saved)}</span></div>
      <button class="btn sm primary" data-addbundle="${i}">一键加购整套</button></div>
      <div class="row gap-8 mt-8">${Object.entries(b.dims).map(([k, v]) => `<span class="chip ${v.ok ? 'green' : 'red'}">${v.ok ? '✓' : '✕'} ${esc(v.label)}</span>`).join('')}</div>
    </div>`).join('')}`;
  $$('[data-addbundle]', box).forEach((btn) => btn.addEventListener('click', async () => {
    const b = data.bundles[Number(btn.dataset.addbundle)];
    if (!State.user) return (location.hash = '#/login');
    for (const it of b.items) await POST('/api/v1/mall/cart/items', { skuId: it.skuId, quantity: it.qty, source: 'bundle', bundleId: b.bundleId }, { silent: true });
    toast('整套方案已加入购物车', 'ok'); refreshCart();
  }));
}

async function addToCart(skuId, qty, silent) {
  if (!State.user) { location.hash = '#/login'; return; }
  const r = await POST('/api/v1/mall/cart/items', { skuId, quantity: qty });
  if (r.code === 0) { if (!silent) toast('已加入购物车', 'ok'); refreshCart(); }
}

// ================================================================== 购物车
async function viewCart() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/mall/cart', { silent: true });
  const items = (r.data && r.data.items) || [];
  const sum = (r.data && r.data.summary) || { selectedTotal: 0 };
  if (!items.length) { app.innerHTML = '<div class="empty"><span class="ico">🛒</span>购物车还是空的<br><a class="btn primary mt-16" href="#/home">去逛逛</a></div>'; return; }
  app.innerHTML = `<div class="section">
    <div class="section-head"><h2>购物车</h2><span class="desc">共 ${items.length} 件（含组合加购商品）</span></div>
    <div class="grid side">
      <div class="card card-pad" style="grid-column:span 1">
        <div class="summary-box">
          <div class="summary-row"><span>已选商品</span><b>${sum.selectedCount || 0} 件</b></div>
          <div class="summary-row total"><span>合计</span><span>${money(sum.selectedTotal || 0)}</span></div>
          <a class="btn primary block mt-16" href="#/checkout">去结算</a>
        </div>
      </div>
      <div class="card card-pad">
        ${items.map((it) => `<div class="cart-item">
          <input type="checkbox" ${it.selected ? 'checked' : ''} data-sel="${it.id}" ${it.status ? '' : 'disabled'}>
          <div class="cart-thumb" style="background:${tint(it.color, '22')}">${it.emoji}</div>
          <div><div><b>${esc(it.title)}</b> ${it.source === 'bundle' ? '<span class="tag">组合</span>' : ''}</div><div class="small muted">${esc(it.specText)}${it.status ? '' : ' · <span style="color:#c0392b">已失效</span>'}</div></div>
          <div class="c-price price">${money(it.salePrice)}</div>
          <div class="c-qty qty"><button data-dec="${it.id}">−</button><input value="${it.quantity}" readonly><button data-inc="${it.id}">+</button></div>
          <div class="c-del"><button class="btn sm danger" data-del="${it.id}">删除</button></div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
  $$('[data-inc]').forEach((b) => b.addEventListener('click', async () => { const it = items.find((x) => x.id == b.dataset.inc); await PATCH('/api/v1/mall/cart/items/' + it.id, { quantity: it.quantity + 1 }); viewCart(); }));
  $$('[data-dec]').forEach((b) => b.addEventListener('click', async () => { const it = items.find((x) => x.id == b.dataset.dec); await PATCH('/api/v1/mall/cart/items/' + it.id, { quantity: Math.max(1, it.quantity - 1) }); viewCart(); }));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => { await DEL('/api/v1/mall/cart/items/' + b.dataset.del); toast('已删除'); viewCart(); refreshCart(); }));
  $$('[data-sel]').forEach((b) => b.addEventListener('change', async () => { await PATCH('/api/v1/mall/cart/items/' + b.dataset.sel, { selected: b.checked }); viewCart(); }));
}

// ================================================================== 结算
async function viewCheckout(query) {
  query = query || {};
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  let items = [];
  if (query.skus) {
    const pairs = query.skus.split(',').map((s) => s.split('x'));
    items = await buildDirectItems(pairs);
  } else {
    const r = await GET('/api/v1/mall/cart', { silent: true });
    items = ((r.data && r.data.items) || []).filter((x) => x.selected && x.status === 1);
  }
  if (!items.length) { app.innerHTML = '<div class="empty"><span class="ico">🧾</span>没有可结算的商品<br><a class="btn mt-16" href="#/cart">返回购物车</a></div>'; return; }

  const addrR = await GET('/api/v1/mall/addresses', { silent: true });
  const addresses = (addrR.data && addrR.data.list) || [];
  const couponsR = await GET('/api/v1/mall/my-coupons', { silent: true });
  const myCoupons = ((couponsR.data && couponsR.data.list) || []).filter((c) => c.status === 'unused');
  const total = items.reduce((n, i) => n + i.salePrice * i.quantity, 0);
  const freight = total >= 99 ? 0 : 8;

  app.innerHTML = `<div class="section">
    <div class="section-head"><h2>确认订单</h2></div>
    <div class="grid side">
      <div class="card card-pad"><div class="summary-box">
        <div class="summary-row"><span>商品金额</span><span>${money(total)}</span></div>
        <div class="summary-row"><span>运费</span><span>${freight === 0 ? '包邮' : money(freight)}</span></div>
        <div class="summary-row"><span>优惠券</span><span id="cpDiscount">-¥0.00</span></div>
        <div class="summary-row total"><span>应付</span><span id="payTotal">${money(total + freight)}</span></div>
        <button class="btn primary block mt-16" id="submitOrder">提交订单</button>
      </div></div>
      <div>
        <div class="card card-pad">
          <h4 style="font-size:14px">收货地址</h4>
          <div id="addrBox">${addresses.length ? addresses.map((a) => `<label class="row gap-8" style="padding:6px 0;cursor:pointer"><input type="radio" name="addr" value="${a.id}" ${a.isDefault ? 'checked' : ''}><span class="small">${esc(a.receiver)} ${esc(a.phone)} · ${esc(a.province + a.city + a.district + a.detail)}</span></label>`).join('') : '<div class="small muted">暂无地址，请在下方填写</div>'}</div>
          <div class="grid g2 mt-8">
            <input class="input" id="aRecv" placeholder="收货人" value="${esc(State.user.nickname)}">
            <input class="input" id="aPhone" placeholder="手机号" value="${esc((State.user.mobile || '').replace('****', '0000'))}">
            <input class="input" id="aCity" placeholder="省市区" value="广东省 深圳市 南山区">
            <input class="input" id="aDetail" placeholder="详细地址" value="科技园南路 88 号智选大厦">
          </div>
        </div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">优惠券</h4>
          <select class="select" id="couponSel"><option value="">不使用优惠券</option>${myCoupons.map((c) => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('')}</select>
          ${!myCoupons.length ? '<div class="small muted mt-8">暂无可用优惠券，<a href="#/home">去领取</a></div>' : ''}
        </div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">商品清单</h4>
          ${items.map((it) => `<div class="order-line"><div class="order-thumb" style="background:${tint(it.color, '22')}">${it.emoji}</div>
            <div style="flex:1"><div>${esc(it.title)}</div><div class="small muted">${esc(it.specText)} × ${it.quantity}</div></div>
            <b>${money(it.salePrice * it.quantity)}</b></div>`).join('')}
        </div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">备注</h4>
          <textarea class="textarea" id="remark" placeholder="选填：发票抬头、送货要求等"></textarea>
        </div>
      </div>
    </div>
  </div>`;

  let couponDiscount = 0;
  $('#couponSel').addEventListener('change', () => {
    const code = $('#couponSel').value;
    const c = myCoupons.find((x) => x.code === code);
    couponDiscount = 0;
    if (c) {
      // 前端按名预估（后端为准）：满减 / 折扣
      const full = db0Coupons.find((x) => x.code === code);
      if (full && full.type === 'full_reduce' && total >= full.threshold) couponDiscount = full.value;
      else if (full && full.type === 'discount') couponDiscount = Number((total * (1 - full.value)).toFixed(2));
    }
    $('#cpDiscount').textContent = '-' + money(couponDiscount);
    $('#payTotal').textContent = money(Math.max(0.01, total + freight - couponDiscount));
  });

  $('#submitOrder').addEventListener('click', async () => {
    const addr = { receiver: $('#aRecv').value, phone: $('#aPhone').value, city: $('#aCity').value, detail: $('#aDetail').value };
    const body = {
      items: items.map((i) => ({ skuId: i.skuId, quantity: i.quantity, source: i.source || 'single', bundleId: i.bundleId })),
      couponCode: $('#couponSel').value || undefined, address: addr, remark: $('#remark').value,
    };
    const r = await POST('/api/v1/mall/orders', body);
    if (r.code !== 0) return;
    const o = r.data.order;
    // 清理已结算购物车项（直接购买不清理）
    if (!query.skus) { for (const it of items) await DEL('/api/v1/mall/cart/items/' + it.id, { silent: true }); }
    refreshCart();
    openPayModal(o);
  });
}
let db0Coupons = [];
async function buildDirectItems(pairs) {
  const ids = pairs.map(([skuId]) => skuId).join(',');
  const r = await GET('/api/v1/mall/skus?ids=' + ids, { silent: true });
  const map = {};
  (((r.data && r.data.list) || [])).forEach((s) => { map[s.skuId] = s; });
  return pairs.map(([skuId, qty]) => {
    const s = map[Number(skuId)] || {};
    return {
      skuId: Number(skuId), quantity: Number(qty), salePrice: s.salePrice || 0,
      title: s.title || '', emoji: s.emoji || '📦', color: s.color || '#888', specText: s.specText || '',
      source: 'single', status: 1,
    };
  });
}

function openPayModal(order) {
  modal('订单创建成功', `<div class="center">
    <div style="font-size:44px">💳</div>
    <h3 style="margin:8px 0">${esc(order.orderNo)}</h3>
    <p class="muted">应付金额 <b class="price" style="font-size:22px">${money(order.payAmount)}</b></p>
    <div class="row gap-8" style="justify-content:center;margin:16px 0">
      <span class="chip blue">微信支付</span><span class="chip blue">支付宝</span><span class="chip blue">银行卡</span>
    </div>
  </div>`, `<button class="btn" id="payLater">稍后支付</button><button class="btn primary" id="payNow">立即支付（模拟）</button>`);
  $('#payNow').addEventListener('click', async () => {
    const r = await POST(`/api/v1/mall/payments/${order.id}/pay`, { channel: 'wechat' });
    if (r.code === 0) { closeModal(); toast('支付成功，商家已发货', 'ok'); location.hash = '#/order/' + order.id; viewCart(); }
  });
  $('#payLater').addEventListener('click', () => { closeModal(); location.hash = '#/order/' + order.id; });
}

// ================================================================== 订单
async function viewOrders() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/mall/orders', { silent: true });
  const list = (r.data && r.data.list) || [];
  if (!list.length) { app.innerHTML = '<div class="empty"><span class="ico">📋</span>还没有订单<br><a class="btn primary mt-16" href="#/home">去下单</a></div>'; return; }
  app.innerHTML = `<div class="section"><div class="section-head"><h2>我的订单</h2><span class="desc">共 ${list.length} 单</span></div>
    ${list.map((o) => orderCardHtml(o)).join('')}</div>`;
  bindOrderActions();
}
function orderCardHtml(o) {
  return `<div class="order-card">
    <div class="order-head">
      <span class="mono small">${esc(o.orderNo)}</span>
      <span class="small muted">${dt(o.createdAt)}</span>
      <span class="spacer"></span>${orderStatusChip(o)}
    </div>
    <div class="order-body">
      ${o.items.map((it) => `<div class="order-line"><div class="order-thumb" style="background:${tint(it.color, '22')}">${it.emoji}</div>
        <div style="flex:1"><div>${esc(it.title)}</div><div class="small muted">${esc(it.specText)} × ${it.quantity}${it.source === 'bundle' ? ' · 组合加购' : ''}</div></div>
        <b>${money(it.subtotal)}</b></div>`).join('')}
    </div>
    <div class="order-foot">
      <span class="small muted">共 ${o.items.reduce((n, i) => n + i.quantity, 0)} 件，实付 <b class="price">${money(o.payAmount)}</b>${o.couponDiscount ? `（优惠 ${money(o.couponDiscount)}）` : ''}</span>
      <a class="btn sm" href="#/order/${o.id}">订单详情</a>
      ${o.status === 0 ? `<button class="btn sm primary" data-pay="${o.id}">去支付</button><button class="btn sm danger" data-cancel="${o.id}">取消</button>` : ''}
      ${o.status === 2 ? `<button class="btn sm primary" data-confirm="${o.id}">确认收货</button>` : ''}
      ${o.status === 3 && !o.reviewed ? `<button class="btn sm gold" data-review="${o.id}">去评价</button>` : ''}
    </div>
  </div>`;
}
function bindOrderActions() {
  $$('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
    const r = await POST(`/api/v1/mall/payments/${b.dataset.pay}/pay`, { channel: 'wechat' });
    if (r.code === 0) { toast('支付成功', 'ok'); viewOrders(); }
  }));
  $$('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { const r = await POST(`/api/v1/mall/orders/${b.dataset.cancel}/cancel`); if (r.code === 0) { toast('订单已取消'); viewOrders(); } }));
  $$('[data-confirm]').forEach((b) => b.addEventListener('click', async () => { const r = await POST(`/api/v1/mall/orders/${b.dataset.confirm}/confirm`); if (r.code === 0) { toast('已确认收货', 'ok'); viewOrders(); } }));
  $$('[data-review]').forEach((b) => b.addEventListener('click', () => openReview(b.dataset.review)));
}
async function openReview(orderId) {
  const r = await GET('/api/v1/mall/orders/' + orderId, { silent: true });
  const o = r.data && r.data.order;
  modal('商品评价', `<div id="revBox">${o.items.map((it) => `<div class="field" data-pid="${it.productId}">
      <label>${esc(it.title)}</label>
      <div class="row gap-8"><select class="select stars" style="width:120px">${[5, 4, 3, 2, 1].map((s) => `<option value="${s}">${'★'.repeat(s)}</option>`).join('')}</select></div>
      <textarea class="textarea mt-8" placeholder="分享你的使用体验…"></textarea>
    </div>`).join('')}</div>`, `<button class="btn" data-close>取消</button><button class="btn primary" id="revSubmit">提交评价</button>`);
  $('#revSubmit').addEventListener('click', async () => {
    const fields = $$('#revBox .field');
    for (const f of fields) {
      await POST('/api/v1/mall/reviews', { orderId: Number(orderId), productId: Number(f.dataset.pid), rating: Number($('.stars', f).value), content: $('textarea', f).value || '好评！' }, { silent: true });
    }
    toast('评价已提交', 'ok'); closeModal(); viewOrders();
  });
}

async function viewOrderDetail(oid) {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/mall/orders/' + oid, { silent: true });
  if (r.code !== 0) { app.innerHTML = '<div class="empty">订单不存在</div>'; return; }
  const o = r.data.order;
  const tr = await GET(`/api/v1/mall/orders/${oid}/logistics`, { silent: true });
  const shipment = tr.data && tr.data.shipment;
  const traces = (tr.data && tr.data.traces) || [];
  app.innerHTML = `<div class="section">
    <div class="small muted"><a href="#/orders">我的订单</a> / ${esc(o.orderNo)}</div>
    <div class="card card-pad mt-8">
      <div class="row between"><h2 style="font-size:18px;margin:0">${esc(o.orderNo)}</h2>${orderStatusChip(o)}</div>
      ${[0, 1, 2, 3].includes(o.status) ? stepsHtml(o.status) : ''}
      <div class="small muted">下单时间：${dt(o.createdAt)}${o.paidAt ? ' · 支付时间：' + dt(o.paidAt) : ''}</div>
    </div>
    <div class="grid side mt-16">
      <div>
        <div class="card card-pad">
          <h4 style="font-size:14px">收货信息</h4>
          <div class="small">${o.address ? `${esc(o.address.receiver)}　${esc(o.address.phone)}<br>${esc((o.address.province || '') + (o.address.city || '') + (o.address.district || '') + (o.address.detail || ''))}` : '—'}</div>
          ${o.remark ? `<div class="small muted mt-8">备注：${esc(o.remark)}</div>` : ''}
        </div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">物流跟踪</h4>
          ${shipment ? `<div class="small muted">${esc(shipment.carrier)} · ${esc(shipment.trackingNo)}</div>
            <ul class="timeline mt-8">${traces.map((t, i) => `<li class="${i === 0 ? 'on' : ''}"><div class="t-desc">${esc(t.desc)}</div><div class="t-time">${esc(t.time)}</div></li>`).join('')}</ul>`
            : '<div class="small muted">订单尚未发货</div>'}
        </div>
      </div>
      <div>
        <div class="card card-pad">
          <h4 style="font-size:14px">商品清单</h4>
          ${o.items.map((it) => `<div class="order-line"><div class="order-thumb" style="background:${tint(it.color, '22')}">${it.emoji}</div>
            <div style="flex:1"><div>${esc(it.title)}</div><div class="small muted">${esc(it.specText)} × ${it.quantity}</div></div><b>${money(it.subtotal)}</b></div>`).join('')}
          <div class="hr"></div>
          <div class="summary-row"><span>商品金额</span><span>${money(o.totalAmount)}</span></div>
          <div class="summary-row"><span>运费</span><span>${o.freight === 0 ? '包邮' : money(o.freight)}</span></div>
          ${o.couponDiscount ? `<div class="summary-row"><span>优惠</span><span>-${money(o.couponDiscount)}</span></div>` : ''}
          <div class="summary-row total"><span>实付</span><span>${money(o.payAmount)}</span></div>
        </div>
        <div class="card card-pad mt-16">
          <h4 style="font-size:14px">操作</h4>
          <div class="row gap-8 wrap-g">
            ${o.status === 0 ? `<button class="btn primary" id="dPay">去支付</button><button class="btn danger" id="dCancel">取消订单</button>` : ''}
            ${o.status === 2 ? `<button class="btn primary" id="dConfirm">确认收货</button>` : ''}
            ${o.status === 3 ? `<button class="btn gold" id="dReview">评价商品</button>` : ''}
            ${[1, 2, 3].includes(o.status) ? `<button class="btn" id="dAfter">申请售后</button>` : ''}
            <button class="btn ghost" id="dAi">🤖 咨询该订单</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  if ($('#dPay')) $('#dPay').addEventListener('click', async () => { const rr = await POST(`/api/v1/mall/payments/${o.id}/pay`, { channel: 'wechat' }); if (rr.code === 0) { toast('支付成功', 'ok'); viewOrderDetail(oid); } });
  if ($('#dCancel')) $('#dCancel').addEventListener('click', async () => { const rr = await POST(`/api/v1/mall/orders/${o.id}/cancel`); if (rr.code === 0) { toast('已取消'); viewOrderDetail(oid); } });
  if ($('#dConfirm')) $('#dConfirm').addEventListener('click', async () => { const rr = await POST(`/api/v1/mall/orders/${o.id}/confirm`); if (rr.code === 0) { toast('已确认收货', 'ok'); viewOrderDetail(oid); } });
  if ($('#dReview')) $('#dReview').addEventListener('click', () => openReview(o.id));
  if ($('#dAfter')) $('#dAfter').addEventListener('click', () => openAfterSale(o));
  $('#dAi').addEventListener('click', () => openAi('订单 ' + o.orderNo + ' 的物流到哪了？'));
}
function openAfterSale(o) {
  modal('申请售后', `<div class="field"><label>售后类型</label><select class="select" id="asType"><option value="refund">仅退款</option><option value="refund_return">退货退款</option><option value="exchange">换货</option></select></div>
    <div class="field"><label>申请原因</label><textarea class="textarea" id="asReason" placeholder="请描述问题"></textarea></div>
    <div class="field"><label>上传凭证</label><input class="input" id="asEvidence" placeholder="凭证图片 URL（选填）"></div>`,
    `<button class="btn" data-close>取消</button><button class="btn primary" id="asSubmit">提交申请</button>`);
  $('#asSubmit').addEventListener('click', async () => {
    const r = await POST('/api/v1/mall/after-sales', { orderId: o.id, type: $('#asType').value, reason: $('#asReason').value, evidence: $('#asEvidence').value ? [$('#asEvidence').value] : [] });
    if (r.code === 0) { toast('售后申请已提交', 'ok'); closeModal(); viewOrderDetail(o.id); }
  });
}

// ================================================================== 智能助手页
async function viewAiPage() {
  app.innerHTML = `<div class="section"><div class="section-head"><h2>智能客服助手</h2><span class="desc">意图分流 · 知识检索增强 · 受控工具调用 · 转人工 · 可降级</span></div>
    <div class="grid side">
      <div class="card card-pad">
        <h4 style="font-size:14px">能力说明</h4>
        <ul class="small muted" style="padding-left:18px">
          <li>知识咨询：走 RAG 检索增强生成，附知识引用</li>
          <li>业务事实：走受控工具调用（订单/物流/库存/优惠）</li>
          <li>置信度不足：建议转接人工客服</li>
          <li>大模型异常：降级为关键词匹配 + 常见问题</li>
        </ul>
        <h4 style="font-size:14px;margin-top:16px">历史会话</h4>
        <div id="sessList" class="small muted">加载中…</div>
      </div>
      <div class="card card-pad">
        <div class="ai-body" id="aiBody2" style="height:420px;background:var(--soft-2);border-radius:10px;padding:14px;overflow-y:auto"></div>
        <div class="ai-quick mt-8">${['退货流程是什么？', '我的订单什么时候发货？', '有什么优惠券？', '推荐几款电饭煲'].map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="row gap-8 mt-8" id="aiForm2"><input class="input" id="aiInput2" placeholder="请输入您的问题…"><button class="btn primary" type="submit">发送</button></form>
      </div>
    </div></div>`;
  const sr = await GET('/api/v1/ai/customer-service/sessions', { silent: true });
  const sessions = (sr.data && sr.data.list) || [];
  $('#sessList').innerHTML = sessions.length ? sessions.map((s) => `<div class="row between" style="padding:4px 0"><span class="mono" style="font-size:11px">${esc(s.sessionId.slice(0, 14))}…</span><span>${s.messageCount} 条</span></div>`).join('') : '暂无会话';
  const body = $('#aiBody2');
  body.innerHTML = '<div class="msg ai"><div class="bubble">您好，我是智选云 AI 客服助手。可以帮您查询订单、物流、库存，或解答售后与品类相关问题。</div></div>';
  $('#aiForm2').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#aiInput2').value.trim(); if (!v) return; $('#aiInput2').value = ''; aiSend(v, body); });
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => aiSend(b.dataset.q, body)));
}

// ---- 悬浮 AI 助手 ----
function openAi(prefill) {
  State.aiOpen = true;
  $('#aiPanel').classList.add('open');
  $('#aiPanel').setAttribute('aria-hidden', 'false');
  const body = $('#aiBody');
  if (!body.dataset.init) {
    body.dataset.init = '1';
    body.innerHTML = '<div class="msg ai"><div class="bubble">您好，我是智能客服助手 🤖 可帮您查订单、物流、库存，或解答售后与品类问题。</div></div>';
  }
  $('#aiQuick').innerHTML = ['退货流程', '什么时候发货', '有什么优惠', '推荐电饭煲'].map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('');
  $$('#aiQuick [data-q]').forEach((b) => b.addEventListener('click', () => aiSend(b.dataset.q, body)));
  if (prefill) aiSend(prefill, body);
  else $('#aiInput').focus();
}
async function aiSend(question, body) {
  body = body || $('#aiBody');
  if (!State.user) { toast('请先登录后使用智能客服', 'err'); location.hash = '#/login'; return; }
  body.insertAdjacentHTML('beforeend', `<div class="msg user"><div class="bubble">${esc(question)}</div></div>`);
  body.scrollTop = body.scrollHeight;
  const loadingId = 'ld' + Date.now();
  body.insertAdjacentHTML('beforeend', `<div class="msg ai" id="${loadingId}"><div class="bubble"><span class="spin" style="width:12px;height:12px;border-width:2px"></span></div></div>`);
  body.scrollTop = body.scrollHeight;
  const r = await POST('/api/v1/ai/customer-service/chat', { question, sessionId: State.aiSession || undefined, pageContext: 'web' }, { silent: true });
  const el = $('#' + loadingId); if (el) el.remove();
  if (r.code !== 0) { body.insertAdjacentHTML('beforeend', `<div class="msg ai"><div class="bubble">抱歉，服务暂时不可用。</div></div>`); return; }
  const d = r.data;
  State.aiSession = d.sessionId;
  localStorage.setItem('aiecp_ai_session', d.sessionId);
  const badge = `${d.intentLabel} · 置信度 ${(d.confidence * 100).toFixed(0)}%${d.degraded ? ' · <span style="color:#b5641b">已降级(' + esc(d.degradeReason || '') + ')</span>' : ''}`;
  const cites = (d.citations || []).length ? `<div class="cites muted">📚 引用：${d.citations.map((c) => esc(c.title)).join('、')}</div>` : '';
  const tools = (d.toolCalls || []).length ? `<div class="cites muted">🛠 工具调用：${d.toolCalls.map((t) => esc(t.name)).join('、')}</div>` : '';
  const transfer = d.transferToAgent ? `<div class="mt-8"><button class="btn sm danger" onclick="alert('已为您转接人工客服，坐席将尽快响应')">转接人工客服</button></div>` : '';
  body.insertAdjacentHTML('beforeend', `<div class="msg ai"><div class="bubble">${esc(d.answer).replace(/\n/g, '<br>')}${cites}${tools}${transfer}</div><div class="meta">${badge}</div></div>`);
  body.scrollTop = body.scrollHeight;
  $('#aiIntentHint').textContent = d.intentLabel + ' · 置信度 ' + (d.confidence * 100).toFixed(0) + '%';
}

// ================================================================== 我的
async function viewMe() {
  const u = State.user;
  const [or, ac] = await Promise.all([GET('/api/v1/mall/orders', { silent: true }), GET('/api/v1/mall/my-coupons', { silent: true })]);
  const orders = (or.data && or.data.list) || [];
  const coupons = (ac.data && ac.data.list) || [];
  app.innerHTML = `<div class="section">
    <div class="card card-pad">
      <div class="row gap-16">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#4a90d9,#1f4e79);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px">${esc(u.nickname.slice(0, 1))}</div>
        <div><h2 style="margin:0;font-size:20px">${esc(u.nickname)}</h2>
        <div class="small muted">${esc(u.username)} · ${esc(u.mobile)} · <span class="chip blue">${esc(u.roleLabel)}</span> · 会员 V${u.memberLevel}</div></div>
      </div>
    </div>
    <div class="kpi-grid mt-16">
      <div class="kpi"><div class="k-label">订单总数</div><div class="k-value">${orders.length}</div></div>
      <div class="kpi"><div class="k-label">待付款</div><div class="k-value">${orders.filter((o) => o.status === 0).length}</div></div>
      <div class="kpi"><div class="k-label">待收货</div><div class="k-value">${orders.filter((o) => o.status === 2).length}</div></div>
      <div class="kpi"><div class="k-label">优惠券</div><div class="k-value">${coupons.filter((c) => c.status === 'unused').length}</div></div>
    </div>
    <div class="card card-pad mt-16">
      <h4 style="font-size:14px">我的权限菜单（角色 · 菜单 · 数据范围三级权限）</h4>
      <div class="row gap-8 wrap-g">${(u.menus || []).map((m) => `<span class="chip blue">${esc((MENU[m] || {}).label || m)}</span>`).join('')}<span class="chip gray">数据范围：${esc(u.dataScope)}</span></div>
    </div>
    <div class="card card-pad mt-16">
      <h4 style="font-size:14px">我的优惠券</h4>
      ${coupons.length ? coupons.map((c) => `<div class="row between" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${esc(c.name)}</span><span class="chip ${c.status === 'unused' ? 'green' : 'gray'}">${c.status === 'unused' ? '未使用' : '已使用'}</span></div>`).join('') : '<div class="small muted">暂无优惠券</div>'}
    </div>
  </div>`;
}

// ================================================================== 商家：品类管理
async function viewMerchantCategory() {
  app.innerHTML = `<div class="section"><div class="section-head"><h2>品类管理</h2><span class="desc">JSON 自定义品类：全量校验一次反馈 · 动态表单 · 索引映射</span></div>
    <div class="grid side">
      <div class="card card-pad">
        <h4 style="font-size:14px">现有品类</h4>
        <div id="catMgr" class="small muted">加载中…</div>
        <div class="hr"></div>
        <h4 style="font-size:14px">导入版本记录</h4>
        <div id="verList" class="small muted"></div>
      </div>
      <div>
        <div class="card card-pad">
          <div class="row between"><h4 style="font-size:14px;margin:0">品类定义 JSON</h4>
            <div class="row gap-8"><button class="btn sm" id="tplBtn">载入示例模板</button><button class="btn sm" id="validateBtn">校验（dry-run）</button><button class="btn sm primary" id="importBtn">正式导入</button></div></div>
          <textarea class="textarea mono mt-8" id="catJson" style="min-height:300px" placeholder="粘贴品类定义 JSON…"></textarea>
          <div id="valResult" class="mt-8"></div>
        </div>
        <div class="card card-pad mt-16"><h4 style="font-size:14px">索引映射（filterable / searchable 自动生成）</h4><div id="idxBox" class="small muted">校验或导入后显示</div></div>
      </div>
    </div></div>`;
  const r = await GET('/api/v1/merchant/categories', { silent: true });
  if (r.code === 0) {
    const c = r.data;
    $('#catMgr').innerHTML = (c.list || []).map((x) => `<div class="row between" style="padding:5px 0;border-bottom:1px dashed var(--line)">
      <div><b>${esc(x.name)}</b> <span class="mono small muted">${esc(x.code)}</span></div>
      <div class="small"><span class="chip blue">v${x.version}</span> <span class="chip gray">${x.nodeCount} 节点</span></div></div>`).join('');
    $('#verList').innerHTML = (c.versions || []).slice(0, 8).map((v) => `<div class="row between" style="padding:4px 0"><span class="mono small">${esc(v.code)} v${v.version}</span><span class="small muted">${dt(v.createdAt)}</span></div>`).join('');
  }
  const tpl = `{
  "schemaVersion": "1.0",
  "category": {
    "code": "SPORTS_OUTDOOR",
    "name": "运动户外",
    "sort": 50,
    "attributes": [
      { "code": "BRAND", "name": "品牌", "dataType": "string", "required": true, "filterable": true, "searchable": true }
    ],
    "children": [
      {
        "code": "SPORTS_OUTDOOR_CAMPING",
        "name": "露营装备",
        "attributes": [
          { "code": "CAPACITY_PERSON", "name": "适用人数", "dataType": "integer", "unit": "人", "range": [1, 12], "required": false, "filterable": true },
          { "code": "WATERPROOF", "name": "防水等级", "dataType": "enum", "options": ["IPX3", "IPX4", "IPX6"], "required": false, "filterable": true }
        ]
      }
    ]
  }
}`;
  $('#tplBtn').addEventListener('click', () => { $('#catJson').value = tpl; });
  $('#validateBtn').addEventListener('click', () => runCategoryImport('dryRun'));
  $('#importBtn').addEventListener('click', () => runCategoryImport('commit'));
  $('#catJson').value = tpl;
}
async function runCategoryImport(mode) {
  const jsonText = $('#catJson').value;
  if (!jsonText.trim()) return toast('请先粘贴品类 JSON', 'err');
  const r = await POST(mode === 'dryRun' ? '/api/v1/merchant/categories/validate' : '/api/v1/merchant/categories/import', mode === 'dryRun' ? { jsonText } : { jsonText, mode: 'commit', sourceName: '商家导入 ' + dt(new Date().toISOString()) }, { silent: true });
  const box = $('#valResult');
  if (mode === 'dryRun') {
    const d = r.data || {};
    if (d.valid) {
      box.innerHTML = `<div class="chip green">✓ 校验通过</div>
        <div class="small muted mt-8">节点 ${d.stats.nodeCount} · 属性 ${d.stats.attrCount} · 最大深度 ${d.stats.maxDepth} · 索引字段 ${d.indexMappingPreview.fieldCount}</div>
        ${d.warnings && d.warnings.length ? `<div class="small" style="color:#b5641b;margin-top:6px">⚠ ${d.warnings.map((w) => esc(w.rule + ' ' + w.detail)).join('；')}</div>` : ''}
        <div class="mt-8"><b class="small">动态表单预览：</b>${d.formSchemaPreview.fields.map((f) => `<span class="chip ${f.required ? 'red' : 'gray'}" style="margin:2px">${esc(f.label)}${f.required ? '*' : ''}<span class="muted">(${f.type})</span></span>`).join('')}</div>`;
      renderIndex(d.indexMappingPreview);
    } else {
      box.innerHTML = `<div class="chip red">✕ 校验未通过（${(d.errors || []).length} 项）</div>
        <table class="table mt-8"><thead><tr><th>规则</th><th>路径</th><th>说明</th></tr></thead><tbody>${(d.errors || []).map((e) => `<tr><td>${esc(e.rule)}</td><td class="mono small">${esc(e.path)}</td><td>${esc(e.detail)}</td></tr>`).join('')}</tbody></table>
        <div class="small muted mt-8">解析器已执行「全量校验、一次反馈」，请一次性修正上述全部问题。</div>`;
    }
  } else {
    if (r.code !== 0) { box.innerHTML = `<div class="chip red">✕ 导入失败：${esc(r.message)}</div>`; return; }
    const d = r.data;
    box.innerHTML = `<div class="chip green">✓ 导入成功</div>
      <div class="small mt-8">品类 <b>${esc(d.categoryCode)}</b> v${d.version} · 节点 ${d.generated.nodeCount} · 属性 ${d.generated.attrCount} · 索引字段 ${d.generated.indexFields} · 表单 <span class="mono">${esc(d.generated.formSchemaId)}</span></div>
      <div class="small muted">新增品类无需代码变更与系统发版，已可发布商品。</div>`;
  }
}
function renderIndex(idx) {
  if (!idx) return;
  $('#idxBox').innerHTML = `<div class="mono small">索引名：${esc(idx.indexName)} · 分析器：${esc(idx.analyzer)} · 状态：<span class="chip green">${esc(idx.syncStatus)}</span></div>
    <table class="table mt-8"><thead><tr><th>字段</th><th>类型</th><th>用途</th><th>来源</th></tr></thead><tbody>${idx.fields.map((f) => `<tr><td class="mono">${esc(f.field)}</td><td>${esc(f.type)}</td><td>${esc(f.purpose)}</td><td>${esc(f.mappedFrom)}</td></tr>`).join('')}</tbody></table>`;
}

// ================================================================== 商家：商品
async function viewMerchantProducts() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const [pr, cr] = await Promise.all([GET('/api/v1/merchant/products', { silent: true }), GET('/api/v1/mall/categories/flat', { silent: true })]);
  const list = (pr.data && pr.data.list) || [];
  const leaves = (cr.data && cr.data.leaves) || [];
  app.innerHTML = `<div class="section"><div class="section-head"><h2>商品管理</h2><button class="btn primary" id="newProd">＋ 发布商品</button></div>
    <div class="card card-pad"><table class="table"><thead><tr><th>商品</th><th>品类</th><th>SKU</th><th class="num">价格</th><th class="num">库存</th><th class="num">销量</th><th>状态</th><th>操作</th></tr></thead><tbody>
      ${list.map((p) => `<tr>
        <td><div class="row gap-8"><span style="font-size:20px">${p.emoji}</span><span>${esc(p.title)}</span></div></td>
        <td class="small muted">${esc(p.categoryName)}</td>
        <td class="small">${p.skus.length}</td>
        <td class="num">${money(p.priceMin)}~${money(p.priceMax)}</td>
        <td class="num">${p.totalStock}</td>
        <td class="num">${p.salesCount}</td>
        <td>${p.status === 1 ? '<span class="chip green">在售</span>' : '<span class="chip gray">下架</span>'}</td>
        <td><button class="btn sm" data-toggle="${p.id}" data-st="${p.status}">${p.status === 1 ? '下架' : '上架'}</button></td>
      </tr>`).join('')}
    </tbody></table></div></div>`;
  $('#newProd').addEventListener('click', () => openNewProduct(leaves));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    await PATCH('/api/v1/merchant/products/' + b.dataset.toggle, { status: b.dataset.st === '1' ? 0 : 1 });
    toast('已更新'); viewMerchantProducts();
  }));
}
async function openNewProduct(leaves) {
  modal('发布商品', `<div class="field"><label>所属品类（叶子品类）<span class="req">*</span></label>
      <select class="select" id="npCat">${leaves.map((l) => `<option value="${l.id}">${esc(l.name)}（${esc(l.code)}）</option>`).join('')}</select></div>
    <div id="npFields"></div>
    <div class="field"><label>SKU 规格与价格</label>
      <div id="npSkus"><div class="row gap-8 np-sku"><input class="input" placeholder="规格名 如 4L 白色" style="flex:2"><input class="input" placeholder="售价" style="flex:1"><input class="input" placeholder="划线价" style="flex:1"><input class="input" placeholder="库存" style="flex:1"></div></div>
      <button class="btn sm mt-8" id="addSku">＋ 增加规格</button>
    </div>`, `<button class="btn" data-close>取消</button><button class="btn primary" id="npSubmit">发布</button>`, true);

  async function loadSchema() {
    const cid = $('#npCat').value;
    const r = await GET(`/api/v1/merchant/categories/${cid}/form-schema`, { silent: true });
    const fields = (r.data && r.data.formSchema.fields) || [];
    $('#npFields').innerHTML = `<div class="small muted">商品标题与品类属性（由品类 Schema 动态生成）</div>
      <div class="field"><label>商品标题<span class="req">*</span></label><input class="input" id="npTitle" placeholder="商品标题"></div>
      <div class="grid g2">${fields.map((f) => `<div class="field"><label>${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</label>
        ${f.type === 'enum' ? `<select class="select np-attr" data-code="${f.code}"><option value="">请选择</option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
          : `<input class="input np-attr" data-code="${f.code}" placeholder="${esc(f.unit || f.type)}${f.required ? '（必填）' : ''}">`}</div>`).join('')}</div>`;
  }
  await loadSchema();
  $('#npCat').addEventListener('change', loadSchema);
  $('#addSku').addEventListener('click', () => $('#npSkus').insertAdjacentHTML('beforeend', '<div class="row gap-8 np-sku mt-8"><input class="input" placeholder="规格名" style="flex:2"><input class="input" placeholder="售价" style="flex:1"><input class="input" placeholder="划线价" style="flex:1"><input class="input" placeholder="库存" style="flex:1"></div>'));
  $('#npSubmit').addEventListener('click', async () => {
    const attrs = {};
    $$('.np-attr').forEach((el) => { if (el.value) attrs[el.dataset.code] = el.value; });
    const skus = $$('.np-sku').map((row) => { const i = $$('input', row); return { specText: i[0].value, salePrice: Number(i[1].value), marketPrice: Number(i[2].value || i[1].value * 1.2), stock: Number(i[3].value || 0) }; }).filter((s) => s.specText && s.salePrice);
    const body = { categoryId: Number($('#npCat').value), title: $('#npTitle').value, attrs, skus };
    if (!body.title) return toast('请填写商品标题', 'err');
    if (!skus.length) return toast('请至少填写一个有效 SKU', 'err');
    const r = await POST('/api/v1/merchant/products', body);
    if (r.code === 0) { toast('商品发布成功', 'ok'); closeModal(); viewMerchantProducts(); }
  });
}

// ================================================================== 商家：库存
async function viewMerchantInventory() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/merchant/inventory', { silent: true });
  const d = r.data || { list: [], logs: [] };
  app.innerHTML = `<div class="section"><div class="section-head"><h2>库存管理</h2><span class="desc">多仓库存 · 锁定与扣减 · 预警 · 流水</span></div>
    <div class="tabs"><button class="active" data-tab="inv">库存台账</button><button data-tab="log">库存流水</button></div>
    <div class="card card-pad" id="invTab"><table class="table"><thead><tr><th>商品</th><th>规格</th><th>仓库</th><th class="num">总库存</th><th class="num">锁定</th><th class="num">可用</th><th>预警</th><th>调整</th></tr></thead><tbody>
      ${d.list.map((x) => `<tr><td>${esc(x.title)}</td><td class="small">${esc(x.specText)}</td><td class="small">WH-${x.warehouseId}</td>
        <td class="num">${x.totalQty}</td><td class="num">${x.lockedQty}</td><td class="num"><b>${x.available}</b></td>
        <td>${x.warning ? '<span class="chip red">低库存</span>' : '<span class="chip green">正常</span>'}</td>
        <td><button class="btn sm" data-adj="${x.skuId}">±</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="card card-pad hide" id="logTab"><table class="table"><thead><tr><th>时间</th><th>SKU</th><th>类型</th><th class="num">数量</th><th>单号</th></tr></thead><tbody>
      ${d.logs.map((l) => `<tr><td class="small">${dt(l.at)}</td><td class="small">#${l.skuId}</td><td><span class="chip ${l.type === 'deduct' ? 'blue' : l.type === 'lock' ? 'orange' : 'gray'}">${esc(l.type)}</span></td><td class="num">${l.qty}</td><td class="small mono">${esc(l.orderNo || '-')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    $('#invTab').classList.toggle('hide', b.dataset.tab !== 'inv');
    $('#logTab').classList.toggle('hide', b.dataset.tab !== 'log');
  }));
  $$('[data-adj]').forEach((b) => b.addEventListener('click', async () => {
    const delta = prompt('输入库存调整数量（正数入库 / 负数出库）：', '10');
    if (delta == null) return;
    const r = await POST('/api/v1/merchant/inventory/adjust', { skuId: Number(b.dataset.adj), delta: Number(delta) });
    if (r.code === 0) { toast('已调整', 'ok'); viewMerchantInventory(); }
  }));
}

// ================================================================== 商家：订单
async function viewMerchantOrders() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/merchant/orders', { silent: true });
  const list = (r.data && r.data.list) || [];
  app.innerHTML = `<div class="section"><div class="section-head"><h2>订单处理</h2><span class="desc">共 ${list.length} 单</span></div>
    <div class="card card-pad"><table class="table"><thead><tr><th>订单号</th><th>商品</th><th class="num">金额</th><th>状态</th><th>下单时间</th></tr></thead><tbody>
      ${list.map((o) => `<tr><td class="mono small">${esc(o.orderNo)}</td><td class="small">${o.items.map((i) => esc(i.title)).join('、')}</td>
        <td class="num">${money(o.payAmount)}</td><td>${orderStatusChip(o)}</td><td class="small muted">${dt(o.createdAt)}</td></tr>`).join('')}
    </tbody></table>${list.length ? '' : '<div class="empty">暂无订单</div>'}</div></div>`;
}

// ================================================================== 运营端
async function viewConsoleDashboard() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/dashboard', { silent: true });
  const d = r.data || {};
  const k = d.kpi || {};
  const maxCat = Math.max(1, ...((d.catSales || []).map((c) => c.value)));
  const maxBh = Math.max(1, ...Object.values(d.behavior || {}));
  app.innerHTML = `<div class="section"><div class="section-head"><h2>运营数据看板</h2><span class="desc">交易 · 流量 · 推荐与组货效果</span></div>
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">成交总额 GMV</div><div class="k-value"><small>¥</small>${Number(k.gmv || 0).toFixed(2)}</div></div>
      <div class="kpi"><div class="k-label">今日 GMV</div><div class="k-value"><small>¥</small>${Number(k.todayGmv || 0).toFixed(2)}</div></div>
      <div class="kpi"><div class="k-label">订单数</div><div class="k-value">${k.orderCount || 0}</div></div>
      <div class="kpi"><div class="k-label">客单价</div><div class="k-value"><small>¥</small>${Number(k.avgOrderValue || 0).toFixed(2)}</div></div>
      <div class="kpi"><div class="k-label">用户数</div><div class="k-value">${k.userCount || 0}</div></div>
      <div class="kpi"><div class="k-label">在售商品</div><div class="k-value">${k.productCount || 0}</div></div>
      <div class="kpi"><div class="k-label">根品类</div><div class="k-value">${k.categoryCount || 0}</div></div>
    </div>
    <div class="grid g2 mt-16">
      <div class="card card-pad"><h4 style="font-size:14px">品类销售分布</h4>
        ${(d.catSales || []).length ? d.catSales.map((c) => `<div class="bar-row"><span class="bar-label">${esc(c.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(c.value / maxCat * 100).toFixed(0)}%"></div></div><span class="bar-val">${money(c.value)}</span></div>`).join('') : '<div class="small muted">暂无数据</div>'}
      </div>
      <div class="card card-pad"><h4 style="font-size:14px">用户行为分布（埋点回流）</h4>
        ${Object.keys(d.behavior || {}).length ? Object.entries(d.behavior).map(([k2, v]) => `<div class="bar-row"><span class="bar-label">${esc(k2)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxBh * 100).toFixed(0)}%"></div></div><span class="bar-val">${v}</span></div>`).join('') : '<div class="small muted">暂无数据</div>'}
      </div>
    </div>
    <div class="grid g3 mt-16">
      <div class="card card-pad"><h4 style="font-size:14px">AI 能力调用</h4>
        <div class="summary-row"><span>智能客服会话</span><b>${d.aiCapability ? d.aiCapability.customerService.sessions : 0}</b></div>
        <div class="summary-row"><span>客服消息数</span><b>${d.aiCapability ? d.aiCapability.customerService.messages : 0}</b></div>
        <div class="summary-row"><span>推荐调用</span><b>${d.recommendCount || 0}</b></div>
        <div class="summary-row"><span>组货方案</span><b>${d.bundleCount || 0}</b></div>
      </div>
      <div class="card card-pad" style="grid-column:span 2"><h4 style="font-size:14px">最近订单</h4>
        <table class="table"><thead><tr><th>订单号</th><th class="num">金额</th><th>状态</th></tr></thead><tbody>${(d.recentOrders || []).map((o) => `<tr><td class="mono small">${esc(o.orderNo)}</td><td class="num">${money(o.payAmount)}</td><td>${orderStatusChip(o)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
  </div>`;
}

async function viewConsoleUsers() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/users', { silent: true });
  const list = (r.data && r.data.list) || [];
  app.innerHTML = `<div class="section"><div class="section-head"><h2>用户与权限管理</h2><span class="desc">角色 / 菜单 / 数据范围三级权限</span></div>
    <div class="card card-pad"><table class="table"><thead><tr><th>ID</th><th>账号</th><th>昵称</th><th>手机</th><th>角色</th><th>数据范围</th><th>状态</th><th>操作</th></tr></thead><tbody>
      ${list.map((u) => `<tr><td>${u.id}</td><td class="mono">${esc(u.username)}</td><td>${esc(u.nickname)}</td><td class="small">${esc(u.mobile)}</td>
        <td><span class="chip blue">${esc(u.roleLabel)}</span></td><td class="small">${esc(u.dataScope)}</td>
        <td>${u.status === 1 || u.status == null ? '<span class="chip green">正常</span>' : '<span class="chip gray">禁用</span>'}</td>
        <td><button class="btn sm" data-ust="${u.id}" data-st="${u.status}">${u.status === 1 || u.status == null ? '禁用' : '启用'}</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-ust]').forEach((b) => b.addEventListener('click', async () => {
    await POST(`/api/v1/console/users/${b.dataset.ust}/status`, { status: b.dataset.st === '1' ? 0 : 1 });
    toast('已更新'); viewConsoleUsers();
  }));
}

async function viewConsolePromotions() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/promotions', { silent: true });
  const d = r.data || { coupons: [], userCoupons: [] };
  app.innerHTML = `<div class="section"><div class="section-head"><h2>营销活动与优惠券</h2><button class="btn primary" id="newCoupon">＋ 新建优惠券</button></div>
    <div class="card card-pad"><table class="table"><thead><tr><th>编码</th><th>名称</th><th>类型</th><th>规则</th><th class="num">已领/总量</th><th>有效期至</th></tr></thead><tbody>
      ${d.coupons.map((c) => `<tr><td class="mono small">${esc(c.code)}</td><td>${esc(c.name)}</td><td>${c.type === 'full_reduce' ? '满减' : '折扣'}</td>
        <td class="small">${c.type === 'full_reduce' ? `满 ${c.threshold} 减 ${c.value}` : `${(c.value * 10).toFixed(1)} 折`}</td>
        <td class="num">${c.claimed}/${c.total}</td><td class="small muted">${dt(c.endAt)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#newCoupon').addEventListener('click', () => {
    modal('新建优惠券', `<div class="field"><label>名称</label><input class="input" id="ncName" placeholder="如 双十一满 1000 减 100"></div>
      <div class="field"><label>类型</label><select class="select" id="ncType"><option value="full_reduce">满减</option><option value="discount">折扣</option></select></div>
      <div class="grid g2"><div class="field"><label>门槛金额（满减用）</label><input class="input" id="ncThreshold" value="200"></div>
      <div class="field"><label>优惠值（折扣填 0.9）</label><input class="input" id="ncValue" value="20"></div></div>
      <div class="field"><label>发放总量</label><input class="input" id="ncTotal" value="100"></div>`,
      `<button class="btn" data-close>取消</button><button class="btn primary" id="ncSubmit">创建</button>`);
    $('#ncSubmit').addEventListener('click', async () => {
      const r2 = await POST('/api/v1/console/promotions/coupons', { name: $('#ncName').value, type: $('#ncType').value, threshold: Number($('#ncThreshold').value), value: Number($('#ncValue').value), total: Number($('#ncTotal').value) });
      if (r2.code === 0) { toast('已创建', 'ok'); closeModal(); viewConsolePromotions(); }
    });
  });
}

async function viewConsoleAi() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/ai/prompts', { silent: true });
  const d = r.data || { list: [], config: {} };
  app.innerHTML = `<div class="section"><div class="section-head"><h2>AI 模型与提示词配置</h2><span class="desc">模型路由 · 提示词模板版本 · 护栏与工具白名单</span></div>
    <div class="grid g2">
      <div class="card card-pad"><h4 style="font-size:14px">提示词模板</h4>
        ${d.list.map((p) => `<div class="card card-pad mt-8" style="background:var(--soft-2)">
          <div class="row between"><b class="small">${esc(p.name)}</b><span class="chip blue">v${p.version}</span></div>
          <textarea class="textarea mt-8" data-prompt="${esc(p.scene)}" style="min-height:80px">${esc(p.content)}</textarea>
          <button class="btn sm primary mt-8" data-saveprompt="${esc(p.scene)}" data-pname="${esc(p.name)}">发布新版本</button>
        </div>`).join('')}
      </div>
      <div class="card card-pad"><h4 style="font-size:14px">运行配置</h4>
        <div class="field"><label>大模型网关</label><input class="input" id="cfgModel" value="${esc((d.config.llm || {}).model || '')}"></div>
        <div class="field"><label>温度 temperature</label><input class="input" id="cfgTemp" value="${(d.config.llm || {}).temperature}"></div>
        <div class="field"><label>召回路数</label><input class="input" id="cfgRecall" value="${esc(((d.config.recommend || {}).recallChannels || []).join(','))}"></div>
        <div class="field"><label>工具白名单</label><input class="input" id="cfgTools" value="${esc(((d.config.guardrail || {}).toolWhitelist || []).join(','))}"></div>
        <button class="btn primary" id="saveCfg">保存配置</button>
        <div class="hr"></div>
        <div class="small muted">降级策略：关闭「大模型网关可用」后，客服将退化为知识库精确匹配 + 常见问题列表，交易主流程不受影响。</div>
      </div>
    </div></div>`;
  $$('[data-saveprompt]').forEach((b) => b.addEventListener('click', async () => {
    const scene = b.dataset.saveprompt;
    const content = $(`[data-prompt="${scene}"]`).value;
    const r2 = await POST('/api/v1/console/ai/prompts', { scene, name: b.dataset.pname, content });
    if (r2.code === 0) { toast('提示词已发布新版本', 'ok'); viewConsoleAi(); }
  }));
  $('#saveCfg').addEventListener('click', async () => {
    const cfg = {
      llm: { model: $('#cfgModel').value, temperature: Number($('#cfgTemp').value), enabled: true, fallbackEnabled: true, provider: 'local-gateway' },
      recommend: { recallChannels: $('#cfgRecall').value.split(',').map((s) => s.trim()).filter(Boolean), rerankTopN: 12, diversity: true },
      guardrail: { inputFilter: true, outputFilter: true, toolWhitelist: $('#cfgTools').value.split(',').map((s) => s.trim()).filter(Boolean) },
    };
    const r2 = await POST('/api/v1/console/ai/config', cfg);
    if (r2.code === 0) toast('配置已保存', 'ok');
  });
}

async function viewConsoleKnowledge() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/knowledge/documents', { silent: true });
  const list = (r.data && r.data.list) || [];
  app.innerHTML = `<div class="section"><div class="section-head"><h2>知识库管理</h2><span class="desc">文档导入 · 自动切片 · 向量检索（RAG）</span></div>
    <div class="grid side">
      <div class="card card-pad"><h4 style="font-size:14px">导入新文档</h4>
        <div class="field"><label>标题</label><input class="input" id="kbTitle" placeholder="如 售后政策"></div>
        <div class="field"><label>分类编码</label><input class="input" id="kbCat" placeholder="如 AFTERSALE"></div>
        <div class="field"><label>正文</label><textarea class="textarea" id="kbContent" style="min-height:160px" placeholder="粘贴知识正文，系统将按句切分为知识片段"></textarea></div>
        <button class="btn primary block" id="kbSubmit">导入并切片</button>
      </div>
      <div class="card card-pad"><h4 style="font-size:14px">知识片段（${list.length}）</h4>
        <table class="table"><thead><tr><th>ID</th><th>标题</th><th>分类</th><th>内容</th><th></th></tr></thead><tbody>
          ${list.map((k) => `<tr><td>${k.id}</td><td class="small">${esc(k.title)}</td><td class="small"><span class="chip gray">${esc(k.categoryCode)}</span></td>
            <td class="small muted" style="max-width:420px">${esc(k.content.slice(0, 60))}${k.content.length > 60 ? '…' : ''}</td>
            <td><button class="btn sm danger" data-kdel="${k.id}">删</button></td></tr>`).join('')}
        </tbody></table></div>
    </div></div>`;
  $('#kbSubmit').addEventListener('click', async () => {
    const r2 = await POST('/api/v1/console/knowledge/documents', { title: $('#kbTitle').value, categoryCode: $('#kbCat').value, content: $('#kbContent').value });
    if (r2.code === 0) { toast('已导入 ' + r2.data.chunks + ' 个片段', 'ok'); viewConsoleKnowledge(); }
  });
  $$('[data-kdel]').forEach((b) => b.addEventListener('click', async () => { await DEL('/api/v1/console/knowledge/documents/' + b.dataset.kdel); toast('已删除'); viewConsoleKnowledge(); }));
}

async function viewConsoleAudit() {
  app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const r = await GET('/api/v1/console/audit-logs', { silent: true });
  const list = (r.data && r.data.list) || [];
  app.innerHTML = `<div class="section"><div class="section-head"><h2>操作审计日志</h2><span class="desc">共 ${list.length} 条</span></div>
    <div class="card card-pad"><table class="table"><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>详情</th></tr></thead><tbody>
      ${list.map((l) => `<tr><td class="small muted">${dt(l.at)}</td><td>${esc(l.username)}</td><td><span class="chip gray">${esc(l.action)}</span></td><td class="small muted">${esc(l.detail)}</td></tr>`).join('')}
    </tbody></table>${list.length ? '' : '<div class="empty">暂无审计记录</div>'}</div></div>`;
}

// ------------------------------------------------------------------ 启动
window.addEventListener('error', (e) => { try { toast('页面脚本异常：' + (e.message || ''), 'err'); } catch (_) {} });
async function boot() {
  // 拉取演示账号里的券信息，供结算页预估（静默）
  GET('/api/v1/mall/coupons', { silent: true }).then((r) => { db0Coupons = (r.data && r.data.list) || []; });
  if (State.token) {
    const r = await GET('/api/v1/auth/me', { silent: true });
    if (r.code === 0) { State.user = r.data.user; await refreshCart(); }
    else { State.token = ''; localStorage.removeItem('aiecp_token'); }
  }
  renderTopbar();
  if (!location.hash) location.hash = State.user ? '#/home' : '#/login';
  await router();
}
$('#aiFab').addEventListener('click', () => { if (State.aiOpen) { $('#aiPanel').classList.remove('open'); State.aiOpen = false; } else openAi(); });
$('#aiClose').addEventListener('click', () => { $('#aiPanel').classList.remove('open'); State.aiOpen = false; });
$('#aiForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#aiInput').value.trim(); if (!v) return; $('#aiInput').value = ''; aiSend(v, $('#aiBody')); });
$('#navBtn').addEventListener('click', () => $('#mainnav').classList.toggle('open'));
document.addEventListener('click', (e) => { if (e.target.closest('.mainnav a')) $('#mainnav').classList.remove('open'); });

boot();
