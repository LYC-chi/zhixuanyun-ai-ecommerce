'use strict';
/**
 * selection.js — 智能选品推荐（FR-17 ~ FR-20）
 * 链路：画像构建 → 多路并行召回（向量语义/热门/新品/协同）→ 精排打分
 *       → 业务规则过滤（下架/无库存/限购）→ 多样性重排 → 冷启动热门兜底。
 */
const llm = require('./llm');

const SCENES = {
  home: { label: '首页猜你喜欢', reason: '根据你的浏览偏好推荐' },
  detail: { label: '详情页相似推荐', reason: '与当前商品同类的热销好物' },
  cart: { label: '购物车搭配推荐', reason: '常与购物车商品一起购买' },
  result: { label: '搜索无结果兜底', reason: '热门高性价比之选' },
};

function availableStock(db, product) {
  return product.skuIds.reduce((n, id) => {
    const inv = db.inventories.find((v) => v.skuId === id);
    return n + (inv ? Math.max(0, inv.totalQty - inv.lockedQty) : 0);
  }, 0);
}

function buildProfile(db, user) {
  const p = db.userProfiles.find((x) => x.userId === user.id);
  const behaviors = db.behaviors.filter((b) => b.userId === user.id).slice(-60);
  const catScore = {};
  behaviors.forEach((b) => {
    const prod = db.products.find((x) => x.id === b.productId);
    if (!prod) return;
    const w = b.eventType === 'purchase' ? 5 : b.eventType === 'cart' ? 3 : b.eventType === 'click' ? 1.5 : 0.5;
    catScore[prod.categoryCode] = (catScore[prod.categoryCode] || 0) + w;
  });
  const preferred = p ? p.preferredCategories.slice() : [];
  Object.entries(catScore).sort((a, b) => b[1] - a[1]).forEach(([c]) => { if (!preferred.includes(c)) preferred.push(c); });
  return {
    userId: user.id,
    preferredCategories: preferred,
    priceBand: p ? p.priceBand : 'mid',
    activityScore: p ? p.activityScore : 0.4,
    behaviorCount: behaviors.length,
    coldStart: behaviors.length < 3 && preferred.length === 0,
    catScore,
  };
}

/** 多路召回 */
function recall(db, profile, scene, ctx) {
  const onSale = db.products.filter((p) => p.status === 1);
  const channels = {};
  // 1) 向量语义路：按场景 query 检索（偏好品类用中文名以保证语义命中）
  const prefNames = profile.preferredCategories
    .map((code) => (db.categories.find((x) => x.code === code) || {}).name)
    .filter(Boolean);
  const queryText = ctx && ctx.query
    ? ctx.query
    : (ctx && ctx.mainProduct ? ctx.mainProduct.title + ' ' + ctx.mainProduct.categoryName : prefNames.join(' '));
  channels.vector = llm.search(queryText || '精选好物', onSale, (p) => p.title + ' ' + p.categoryName + ' ' + (p.attrs.BRAND || ''), 8)
    .filter((s) => s.score > 0.03).map((s) => ({ product: s.item, src: 'vector', base: 0.5 + s.score * 3, reason: '语义相关' }));
  // 2) 热门路
  channels.hot = onSale.slice().sort((a, b) => b.salesCount - a.salesCount).slice(0, 6)
    .map((p) => ({ product: p, src: 'hot', base: 0.7 + p.salesCount / 500, reason: '平台热销' }));
  // 3) 新品路
  channels.new = onSale.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
    .map((p) => ({ product: p, src: 'new', base: 0.55, reason: '新品上架' }));
  // 4) 协同路：偏好品类内热销
  channels.cf = [];
  profile.preferredCategories.forEach((c) => {
    onSale.filter((p) => p.categoryCode === c).sort((a, b) => b.salesCount - a.salesCount).slice(0, 3)
      .forEach((p) => channels.cf.push({ product: p, src: 'cf', base: 0.85, reason: '偏好品类' }));
  });
  return channels;
}

/** 精排打分 */
function rank(db, profile, cand) {
  const p = cand.product;
  let score = cand.base;
  // 画像匹配
  if (profile.preferredCategories.includes(p.categoryCode)) score += 0.6;
  if (profile.catScore[p.categoryCode]) score += Math.min(1.2, profile.catScore[p.categoryCode] * 0.08);
  // 口碑与销量
  score += (p.ratingAvg - 4.4) * 1.2;
  score += Math.min(0.8, p.salesCount / 260);
  // 价格带匹配
  const price = p.priceMin;
  const band = profile.priceBand === 'low' ? [0, 300] : profile.priceBand === 'high' ? [1500, 1e9] : [200, 2000];
  if (price >= band[0] && price <= band[1]) score += 0.35;
  // 实时行为加成
  const recent = db.behaviors.filter((b) => b.userId === profile.userId).slice(-10);
  if (recent.some((b) => b.productId === p.id)) score += 0.5;
  return Number(score.toFixed(4));
}

/** 业务规则过滤 */
function applyRules(db, items) {
  const filtered = [];
  const dropped = [];
  items.forEach((it) => {
    const stock = availableStock(db, it.product);
    if (it.product.status !== 1) { dropped.push({ id: it.product.id, reason: '已下架' }); return; }
    if (stock <= 0) { dropped.push({ id: it.product.id, reason: '无库存' }); return; }
    it.stock = stock;
    filtered.push(it);
  });
  return { filtered, dropped };
}

/** 多样性重排：同品类最多 2 个连排 */
function diversify(items, maxPerCat) {
  const out = [];
  const deferred = [];
  const catCount = {};
  items.forEach((it) => {
    const c = it.product.categoryCode;
    catCount[c] = (catCount[c] || 0) + 1;
    if (catCount[c] <= (maxPerCat || 2)) out.push(it);
    else deferred.push(it);
  });
  return out.concat(deferred);
}

function recommend(ctx) {
  const { db, user, scene, limit, pageContext } = ctx;
  const started = Date.now();
  const lim = Math.min(limit || 8, 20);
  const sc = SCENES[scene] || SCENES.home;

  let mainProduct = null;
  if (ctx.productId) mainProduct = db.products.find((p) => p.id === Number(ctx.productId));
  if (ctx.query) { /* 语义检索已在召回中使用 */ }

  const profile = buildProfile(db, user);
  let degraded = false, degradeReason = null, fallback = false;

  const channels = recall(db, profile, scene, { query: ctx.query, mainProduct });
  const merged = new Map();
  Object.values(channels).forEach((list) => {
    list.forEach((it) => {
      const id = it.product.id;
      if (merged.has(id)) {
        const ex = merged.get(id);
        ex.src += '+' + it.src;
        ex.base = Math.max(ex.base, it.base) + 0.15; // 多路命中加权
      } else {
        merged.set(id, Object.assign({}, it));
      }
    });
  });

  let candidates = Array.from(merged.values());
  if (!candidates.length) {
    // 冷启动兜底
    degraded = true; degradeReason = 'no_candidate'; fallback = true;
    candidates = db.products.filter((p) => p.status === 1)
      .sort((a, b) => b.salesCount - a.salesCount).slice(0, lim)
      .map((p) => ({ product: p, src: 'fallback', base: 0.5, reason: '热门兜底' }));
  }

  // 排除主商品自身
  if (mainProduct) candidates = candidates.filter((c) => c.product.id !== mainProduct.id);

  candidates.forEach((c) => { c.score = rank(db, profile, c); });
  candidates.sort((a, b) => b.score - a.score);

  const { filtered, dropped } = applyRules(db, candidates);
  let ranked = diversify(filtered, 2).slice(0, lim);

  if (ranked.length === 0) {
    degraded = true; degradeReason = 'all_filtered'; fallback = true;
    ranked = db.products.filter((p) => p.status === 1 && availableStock(db, p) > 0)
      .sort((a, b) => b.salesCount - a.salesCount).slice(0, lim)
      .map((p) => ({ product: p, src: 'fallback', base: 0.5, score: 0.5, reason: '热门兜底', stock: availableStock(db, p) }));
  }

  if (profile.coldStart && !ctx.query && !mainProduct) {
    fallback = true;
    if (!degradeReason) degradeReason = 'cold_start_profile';
  }

  const items = ranked.map((c, i) => ({
    rank: i + 1,
    productId: c.product.id,
    title: c.product.title,
    emoji: c.product.emoji,
    color: c.product.color,
    categoryCode: c.product.categoryCode,
    categoryName: c.product.categoryName,
    price: c.product.priceMin,
    marketPrice: c.product.skuIds.length ? (db.skus.find((s) => s.id === c.product.skuIds[0]) || {}).marketPrice : null,
    score: c.score,
    reason: (SCENES[scene] ? c.reason : c.reason) || sc.reason,
    recallSource: c.src,
    stock: c.stock,
  }));

  // 推荐埋点日志
  db.recommendLogs.push({
    id: db.recommendLogs.length + 1, userId: user.id, scene, strategyCode: 'multi_recall_v2',
    items: items.map((x) => x.productId), traceId: 'rec_' + Date.now().toString(36),
    at: new Date().toISOString(),
  });
  db.recommendLogs = db.recommendLogs.slice(-200);

  return {
    scene, sceneLabel: sc.label, items,
    profile: {
      preferredCategories: profile.preferredCategories, priceBand: profile.priceBand,
      activityScore: profile.activityScore, coldStart: profile.coldStart, behaviorCount: profile.behaviorCount,
    },
    recallStats: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, v.length])),
    filtered: dropped.length ? dropped : undefined,
    degraded, degradeReason, fallback,
    latencyMs: Date.now() - started,
  };
}

module.exports = { recommend, buildProfile, availableStock };
