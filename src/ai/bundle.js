'use strict';
/**
 * bundle.js — 智能组货搭配（FR-21 ~ FR-23）
 * 以主商品为中心召回配套 SKU；对每个候选组合校验「库存、履约、价格、毛利」四维，
 * 四维同时成立才输出方案，否则降级为同品类单品推荐。
 * 大模型仅负责生成搭配理由，价格与可行性全部由业务规则计算。
 */
const llm = require('./llm');
const { availableStock } = require('./selection');

// 关联规则：主品类 → 配套品类权重（可配置化）
const COMPLEMENT_RULES = {
  HOME_APPLIANCE_KITCHEN_RICE_COOKER: { HOME_APPLIANCE_KITCHEN_BLENDER: 0.9, FOOD_SNACK: 0.5, FOOD_DRINK: 0.6, HOME_APPLIANCE_CLEANING_VACUUM: 0.4 },
  HOME_APPLIANCE_KITCHEN_BLENDER: { HOME_APPLIANCE_KITCHEN_RICE_COOKER: 0.8, FOOD_DRINK: 0.7, FOOD_SNACK: 0.5 },
  HOME_APPLIANCE_CLEANING_VACUUM: { HOME_APPLIANCE_KITCHEN_RICE_COOKER: 0.4, FOOD_SNACK: 0.3 },
  DIGITAL_PHONE: { DIGITAL_LAPTOP: 0.7, FOOD_DRINK: 0.4, FASHION_SHOES: 0.3 },
  DIGITAL_LAPTOP: { DIGITAL_PHONE: 0.6, FOOD_DRINK: 0.5, FOOD_SNACK: 0.4 },
  FASHION_MEN: { FASHION_SHOES: 0.9, FOOD_DRINK: 0.3 },
  FASHION_SHOES: { FASHION_MEN: 0.9, FOOD_DRINK: 0.3 },
  FOOD_SNACK: { FOOD_DRINK: 0.9, HOME_APPLIANCE_KITCHEN_RICE_COOKER: 0.3 },
  FOOD_DRINK: { FOOD_SNACK: 0.9, HOME_APPLIANCE_KITCHEN_BLENDER: 0.5 },
};

const SCENE_TAGS = [
  { tag: 'kitchen', label: '厨房焕新', kws: ['厨房', '做饭', '烹饪', '焕新'] },
  { tag: 'office', label: '办公数码', kws: ['办公', '工作', '学习', '数码', '生产力'] },
  { tag: 'weekend', label: '周末宅家', kws: ['周末', '宅家', '追剧', '休闲'] },
  { tag: 'gift', label: '送礼优选', kws: ['送礼', '礼物', '送人'] },
  { tag: 'fitness', label: '运动健身', kws: ['运动', '健身', '跑步'] },
  { tag: 'relax', label: '休闲搭配', kws: [] },
];

function detectScene(text, mainProduct) {
  const t = String(text || '');
  for (const s of SCENE_TAGS) {
    if (s.kws.some((k) => k && t.includes(k))) return s;
  }
  const map = {
    HOME_APPLIANCE_KITCHEN_RICE_COOKER: 'kitchen', HOME_APPLIANCE_KITCHEN_BLENDER: 'kitchen',
    DIGITAL_PHONE: 'office', DIGITAL_LAPTOP: 'office', FASHION_SHOES: 'fitness', FASHION_MEN: 'relax',
  };
  const tag = map[mainProduct.categoryCode] || 'relax';
  return SCENE_TAGS.find((x) => x.tag === tag) || SCENE_TAGS[SCENE_TAGS.length - 1];
}

function priceOf(db, skuId) {
  const sku = db.skus.find((s) => s.id === skuId);
  return sku ? sku.salePrice : 0;
}
function marketOf(db, skuId) {
  const sku = db.skus.find((s) => s.id === skuId);
  return sku ? sku.marketPrice : 0;
}

/** 召回配套候选商品 */
function recallComplements(db, mainProduct) {
  const rules = COMPLEMENT_RULES[mainProduct.categoryCode] || {};
  const candidates = [];
  db.products.filter((p) => p.status === 1 && p.id !== mainProduct.id).forEach((p) => {
    let w = rules[p.categoryCode];
    if (w == null) {
      // 语义补全：标题相似度兜底
      const sim = llm.search(mainProduct.title + ' ' + mainProduct.categoryName, [p], (x) => x.title + ' ' + x.categoryName, 1)[0];
      w = sim ? sim.score * 0.6 : 0;
    }
    if (w > 0) {
      const sc = (SCENE_TAGS.find((s) => s.tag === 'relax'));
      candidates.push({ product: p, weight: w });
    }
  });
  candidates.sort((a, b) => b.weight - a.weight);
  return candidates.slice(0, 5);
}

/** 四维可行性校验 + 组合定价 */
function evaluate(db, mainProduct, mainSkuId, items, budgetRange) {
  // items: [{product, sku, qty}]
  const perItem = items.map((it) => {
    const inv = db.inventories.find((v) => v.skuId === it.sku.id);
    const stock = inv ? Math.max(0, inv.totalQty - inv.lockedQty) : 0;
    const unit = it.sku.salePrice;
    const market = it.sku.marketPrice;
    return { ...it, stock, unit, market, subtotal: unit * it.qty, marketSubtotal: market * it.qty };
  });

  const stockOk = perItem.every((x) => x.stock >= x.qty);
  const fulfillmentOk = perItem.every((x) => x.stock - x.qty >= 0); // 简化履约可达：库存覆盖且非同仓冲突
  const totalMarket = perItem.reduce((n, x) => n + x.marketSubtotal, 0);
  const totalSale = perItem.reduce((n, x) => n + x.subtotal, 0);

  // 组合优惠：组合价 = 售价合计 × (1 - 组合折扣)，折扣随配套件数递增，封顶 12%
  const bundleDiscount = Math.min(0.12, 0.04 * (perItem.length - 1));
  const bundlePrice = Number((totalSale * (1 - bundleDiscount)).toFixed(2));
  const saved = Number((totalMarket - bundlePrice).toFixed(2));

  // 成本估算（用于毛利）：按售价 62% 近似成本
  const cost = totalSale * 0.62;
  const grossRate = bundlePrice > 0 ? Number(((bundlePrice - cost) / bundlePrice).toFixed(4)) : 0;
  const grossOk = grossRate >= 0.1; // 毛利率下限 10%

  let budgetOk = true;
  if (budgetRange && budgetRange.length === 2) {
    budgetOk = bundlePrice >= budgetRange[0] && bundlePrice <= budgetRange[1];
  }

  const feasible = stockOk && fulfillmentOk && grossOk && budgetOk;
  return {
    perItem, bundlePrice, saved, totalMarket, grossRate,
    dims: {
      stock: { ok: stockOk, label: '库存充足' },
      fulfillment: { ok: fulfillmentOk, label: '履约可达' },
      price: { ok: budgetOk, label: budgetRange ? '预算匹配' : '定价合理' },
      gross: { ok: grossOk, label: '毛利达标' },
    },
    feasible,
  };
}

function compose(ctx) {
  const { db, user, mainSkuId, sceneTag, budgetRange, limit } = ctx;
  const started = Date.now();
  const lim = Math.min(limit || 3, 5);
  const mainSku = db.skus.find((s) => s.id === Number(mainSkuId));
  if (!mainSku) return { error: 'mainSkuNotFound' };
  const mainProduct = db.products.find((p) => p.id === mainSku.productId);
  const scene = detectScene(sceneTag || '', mainProduct);

  const candidates = recallComplements(db, mainProduct);
  const bundles = [];
  const rejected = [];

  // 为每个候选组合「主商品 + 1~2 件配套」生成方案
  const buildOne = (picked) => {
    const items = [
      { product: mainProduct, sku: mainSku, qty: 1, role: '主商品' },
      ...picked.map((c) => ({ product: c.product, sku: db.skus.find((s) => s.id === c.product.skuIds[0]), qty: 1, role: '配套商品' })),
    ];
    const ev = evaluate(db, mainProduct, mainSku.id, items, budgetRange);
    return { items, ev };
  };

  // 组合 1：主商品 + 最优 1 件配套
  if (candidates[0]) {
    const { items, ev } = buildOne([candidates[0]]);
    if (ev.feasible) bundles.push(makeBundle(mainProduct, scene, items, ev)); else rejected.push({ reason: dimReason(ev), items: items.map((i) => i.product.title) });
  }
  // 组合 2：主商品 + 最优 2 件配套
  if (candidates[0] && candidates[1]) {
    const { items, ev } = buildOne([candidates[0], candidates[1]]);
    if (ev.feasible) bundles.push(makeBundle(mainProduct, scene, items, ev)); else rejected.push({ reason: dimReason(ev), items: items.map((i) => i.product.title) });
  }
  // 组合 3：主商品 + 第 2、3 件配套（多样性）
  if (candidates[1]) {
    const picks = [candidates[1], candidates[2]].filter(Boolean);
    const { items, ev } = buildOne(picks);
    if (ev.feasible) bundles.push(makeBundle(mainProduct, scene, items, ev)); else rejected.push({ reason: dimReason(ev), items: items.map((i) => i.product.title) });
  }

  let degraded = false, degradeReason = null;
  if (bundles.length === 0) {
    degraded = true; degradeReason = 'no_feasible_bundle';
  }

  const result = {
    mainProduct: { id: mainProduct.id, title: mainProduct.title, emoji: mainProduct.emoji, price: mainSku.salePrice },
    sceneTag: scene.tag, sceneLabel: scene.label,
    bundles: bundles.slice(0, lim),
    rejected: rejected.length ? rejected : undefined,
    degraded, degradeReason,
    latencyMs: Date.now() - started,
  };

  // 降级：同品类单品推荐
  if (degraded) {
    result.fallbackItems = db.products
      .filter((p) => p.status === 1 && p.categoryCode === mainProduct.categoryCode && p.id !== mainProduct.id)
      .sort((a, b) => b.salesCount - a.salesCount).slice(0, 4)
      .map((p) => ({ productId: p.id, title: p.title, emoji: p.emoji, price: p.priceMin, reason: '同品类热销单品' }));
    // 若同类无商品，则退化为全站热销
    if (!result.fallbackItems.length) {
      result.fallbackItems = db.products.filter((p) => p.status === 1 && p.id !== mainProduct.id)
        .sort((a, b) => b.salesCount - a.salesCount).slice(0, 4)
        .map((p) => ({ productId: p.id, title: p.title, emoji: p.emoji, price: p.priceMin, reason: '全站热销兜底' }));
    }
  }

  // 落库组货方案
  result.bundles.forEach((b) => {
    const bid = db.bundles.length + 1;
    db.bundles.push({ id: bid, mainProductId: mainProduct.id, sceneTag: scene.tag, bundlePrice: b.bundlePrice, grossRate: b.grossRate, strategyCode: 'bundle_v1' });
    b.items.forEach((it) => db.bundleItems.push({ id: db.bundleItems.length + 1, bundleId: bid, skuId: it.skuId, role: it.role, quantity: it.quantity }));
  });
  db.bundles = db.bundles.slice(-100);

  return result;
}

function makeBundle(mainProduct, scene, items, ev) {
  const reason = `「${mainProduct.title}」搭配 ${items.slice(1).map((i) => i.product.title).join('、')}，`
    + `组成${scene.label}场景方案，组合价立省 ¥${ev.saved.toFixed(2)}（约 ${Math.round((ev.saved / ev.totalMarket) * 100)}% off）。`;
  return {
    bundleId: 'B' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    mainTitle: mainProduct.title,
    sceneLabel: scene.label,
    bundlePrice: ev.bundlePrice,
    saved: ev.saved,
    totalMarket: ev.totalMarket,
    grossRate: ev.grossRate,
    grossLevel: ev.grossRate >= 0.3 ? '高' : ev.grossRate >= 0.18 ? '中' : '偏低',
    dims: ev.dims,
    reason,
    items: items.map((it) => ({
      productId: it.product.id, title: it.product.title, emoji: it.product.emoji, color: it.product.color,
      skuId: it.sku.id, specText: it.sku.specText, role: it.role, qty: it.qty,
      unitPrice: it.sku.salePrice, subtotal: Number((it.sku.salePrice * it.qty).toFixed(2)),
    })),
  };
}

function dimReason(ev) {
  const failed = Object.entries(ev.dims).filter(([, v]) => !v.ok).map(([k, v]) => v.label);
  return '未通过：' + failed.join('、');
}

module.exports = { compose, detectScene, COMPLEMENT_RULES };
