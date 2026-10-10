'use strict';
/**
 * customerService.js — 智能客服（FR-13 ~ FR-16）
 * 意图分流：知识咨询 → RAG 检索增强；业务事实 → 受控工具调用。
 * 答复经安全护栏过滤后返回；置信度不足时携带会话摘要建议转人工。
 * 大模型/知识库不可用时降级为关键词精确匹配 + 常见问题列表（NFR）。
 */
const llm = require('./llm');

const INTENTS = [
  { code: 'logistics_query', label: '物流查询', kws: ['物流', '快递', '发货', '到哪', '什么时候到', '运单', '配送', '签收'] },
  { code: 'order_query', label: '订单查询', kws: ['订单', '我的订单', '买了', '下单', '订单号', 'ord'] },
  { code: 'inventory_query', label: '库存查询', kws: ['库存', '有货', '现货', '还有吗', '缺货', '补货'] },
  { code: 'coupon_query', label: '优惠咨询', kws: ['优惠', '优惠券', '券', '满减', '折扣', '便宜', '活动'] },
  { code: 'after_sale', label: '售后咨询', kws: ['退', '换', '售后', '退款', '退货', '坏了', '保修', '质量'] },
  { code: 'payment', label: '支付咨询', kws: ['支付', '付款', '发票', '开票', '没付成功'] },
];

const FAQ = [
  '如何申请退货？—— 订单详情 → 申请售后 → 退货退款，7 天无理由。',
  '多久能发货？—— 付款后 48 小时内出库，全国 1-3 天送达。',
  '支持哪些支付方式？—— 微信支付、支付宝、银行卡与余额支付。',
  '怎么使用优惠券？—— 结算页选择可用优惠券，可叠加满减与折扣。',
  '如何自定义商品品类？—— 商家中心 → 品类导入，粘贴品类 JSON 即可。',
];

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  let best = { code: 'knowledge', score: 0, label: '知识咨询' };
  INTENTS.forEach((it) => {
    // 命中关键词，剔除被更长命中词包含的短词，避免重复计分（如「我的订单」与「订单」）
    const hit = it.kws.filter((k) => t.includes(k));
    const top = hit.filter((k) => !hit.some((o) => o !== k && o.includes(k)));
    let s = 0;
    top.forEach((k) => { s += k.length >= 2 ? 2 : 1; });
    if (s > best.score) best = { code: it.code, score: s, label: it.label };
  });
  const slots = {};
  const mOrder = t.match(/(ord[0-9a-z]+)/i);
  if (mOrder) slots.orderNo = mOrder[1].toUpperCase();
  const mNum = t.match(/30\d{6,}/);
  if (mNum) slots.mobile = mNum[0];
  return { intent: best.code, label: best.label, score: best.score, slots };
}

/** 受控业务工具（出入参 Schema 由工具注册表声明） */
const TOOL_REGISTRY = {
  order_query: {
    desc: '查询当前用户订单', params: { orderNo: 'string?' },
    run(db, user, slots) {
      let list = db.orders.filter((o) => o.userId === user.id);
      if (slots.orderNo) list = list.filter((o) => o.orderNo === slots.orderNo);
      list = list.slice(-3).reverse();
      if (!list.length) return { empty: true, facts: ['未查询到相关订单。'] };
      const facts = list.map((o) => `订单 ${o.orderNo}：${o.statusText}，实付 ¥${o.payAmount.toFixed(2)}，${o.items.map((i) => i.title).join('、')}`);
      return { empty: false, facts, relatedOrder: list[0].orderNo };
    },
  },
  logistics_query: {
    desc: '查询订单物流轨迹', params: { orderNo: 'string?' },
    run(db, user, slots) {
      let order = null;
      if (slots.orderNo) order = db.orders.find((o) => o.orderNo === slots.orderNo && o.userId === user.id);
      if (!order) order = db.orders.filter((o) => o.userId === user.id && o.shipmentId).slice(-1)[0];
      if (!order) return { empty: true, facts: ['暂无可查询物流的订单（订单需已发货）。'] };
      const tr = db.logisticsTraces.filter((t) => t.orderId === order.id);
      const facts = tr.map((t) => `${t.time}　${t.desc}`);
      return { empty: false, facts, relatedOrder: order.orderNo };
    },
  },
  inventory_query: {
    desc: '查询商品库存', params: { keyword: 'string' },
    run(db, user, slots, question) {
      const kw = slots.keyword || question;
      const scored = llm.search(kw, db.products.filter((p) => p.status === 1), (p) => p.title + ' ' + p.categoryName + ' ' + (p.attrs.BRAND || ''), 2);
      const hits = scored.filter((s) => s.score > 0.05);
      if (!hits.length) return { empty: true, facts: ['未找到相关商品，请提供更准确的商品名称。'] };
      const facts = hits.map(({ item: p }) => {
        const stock = p.skuIds.reduce((n, id) => {
          const inv = db.inventories.find((v) => v.skuId === id);
          return n + (inv ? inv.totalQty - inv.lockedQty : 0);
        }, 0);
        return `${p.title}：可售库存 ${stock} 件，¥${p.priceMin} 起。`;
      });
      return { empty: false, facts };
    },
  },
  coupon_query: {
    desc: '查询可用优惠券', params: {},
    run(db, user) {
      const now = Date.now();
      const cs = db.coupons.filter((c) => c.status === 1 && new Date(c.endAt).getTime() > now);
      const facts = cs.map((c) => c.type === 'full_reduce'
        ? `${c.name}（满 ${c.threshold} 减 ${c.value}）`
        : `${c.name}（${(c.value * 10).toFixed(1)} 折）`);
      return { empty: facts.length === 0, facts };
    },
  },
};

/** 主入口：处理一轮对话 */
function chat(ctx) {
  const { db, user, question, sessionId, pageContext } = ctx;
  const started = Date.now();

  // 输入护栏
  const g = llm.guardInput(question);
  if (!g.safe) {
    return {
      answer: g.text, intent: 'blocked', confidence: 1, citations: [], toolCalls: [],
      transferToAgent: false, degraded: false, degradeReason: null,
      latencyMs: Date.now() - started, blocked: true,
    };
  }

  const det = detectIntent(question);
  const toolCalls = [];
  let facts = [];
  let citations = [];
  let confidence = 0.6;
  let degraded = false;
  let degradeReason = null;
  const cfg = db.config.llm || {};
  const llmAvailable = cfg.enabled !== false;

  if (det.intent !== 'knowledge' && TOOL_REGISTRY[det.intent]) {
    // 业务事实 → 受控工具调用
    if ((cfg.guardrail || {}).toolWhitelist && !cfg.guardrail.toolWhitelist.includes(det.intent)) {
      degraded = true; degradeReason = 'tool_not_whitelisted';
    } else {
      const tool = TOOL_REGISTRY[det.intent];
      const res = tool.run(db, user, det.slots, question);
      toolCalls.push({ name: det.intent, desc: tool.desc, params: tool.params, status: res.empty ? 'empty' : 'ok' });
      facts = res.facts;
      confidence = res.empty ? 0.45 : 0.92;
    }
  } else {
    // 知识咨询 → RAG 检索
    const kb = db.knowledge.filter((k) => k.status === 1);
    if (!llmAvailable && kb.length === 0) {
      degraded = true; degradeReason = 'knowledge_base_unavailable';
      facts = FAQ.slice(0, 3);
      confidence = 0.35;
    } else {
      const scored = llm.search(question, kb, (k) => k.title + ' ' + k.content, 3);
      const hits = scored.filter((s) => s.score > 0.08);
      if (hits.length) {
        facts = hits.map((h) => h.item.content);
        citations = hits.map((h) => ({ id: h.item.id, title: h.item.title, chunkId: 'chunk_' + h.item.id, score: Number(h.score.toFixed(3)) }));
        confidence = Math.min(0.95, 0.55 + hits[0].score);
      } else {
        facts = FAQ.slice(0, 3);
        confidence = 0.4;
        degraded = true; degradeReason = 'no_relevant_knowledge';
      }
    }
  }

  const intro = det.intent === 'knowledge'
    ? '根据系统知识库，为您整理如下信息：'
    : `已为您执行「${det.label}」：`;
  const closing = confidence < 0.55
    ? '若以上信息未能解答您的问题，可点击「转人工」由客服跟进。'
    : (pageContext === 'product' ? '需要我帮您对比同类商品吗？' : '还有其他问题吗？');
  let answer = llm.synthesize(intro, facts, closing);
  answer = llm.guardOutput(answer);

  const transferToAgent = confidence < 0.5 || /转人工|人工客服|找人工/.test(question);

  return {
    answer, intent: det.intent, intentLabel: det.label, confidence: Number(confidence.toFixed(2)),
    citations, toolCalls, transferToAgent, degraded, degradeReason,
    latencyMs: Date.now() - started, slots: det.slots,
  };
}

module.exports = { chat, detectIntent, TOOL_REGISTRY, FAQ };
