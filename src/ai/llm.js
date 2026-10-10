'use strict';
/**
 * llm.js — 大模型网关抽象（对应设计报告 ILlmGateway / 能力中台）
 * 提供：① 轻量向量检索（字符 n-gram TF-IDF + 余弦相似度）② 模板化生成 ③ 安全护栏
 * 作为「本地网关」实现，保证 AI 能力在无外部模型时仍可运行，并始终携带降级语义。
 */

// ---- 简易中文/英文分词：ASCII 词 + 中文字符二元组 ----
function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const tokens = [];
  const ascii = s.match(/[a-z0-9]+/g) || [];
  ascii.forEach((w) => tokens.push(w));
  const cn = s.replace(/[^\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(Boolean);
  cn.forEach((seg) => {
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]);
      if (i < seg.length - 1) tokens.push(seg[i] + seg[i + 1]);
    }
  });
  return tokens;
}

function termFreq(tokens) {
  const tf = new Map();
  tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
  return tf;
}

/** 计算一组文档的 IDF */
function buildIdf(docs) {
  const df = new Map();
  docs.forEach((d) => {
    new Set(tokenize(d)).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = docs.length || 1;
  const idf = new Map();
  df.forEach((v, k) => idf.set(k, Math.log(1 + N / (1 + v))));
  return idf;
}

function vectorize(text, idf) {
  const tf = termFreq(tokenize(text));
  const vec = new Map();
  let norm = 0;
  tf.forEach((f, term) => {
    const w = (1 + Math.log(f)) * (idf.get(term) || 0.6);
    vec.set(term, w);
    norm += w * w;
  });
  norm = Math.sqrt(norm) || 1;
  const out = new Map();
  vec.forEach((w, t) => out.set(t, w / norm));
  return out;
}

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  small.forEach((w, t) => { if (big.has(t)) dot += w * big.get(t); });
  return dot;
}

/** 向量检索：返回 [{item, score}] */
function search(query, items, textOf, topK) {
  if (!items.length) return [];
  const texts = items.map((it) => textOf(it));
  const idf = buildIdf(texts.concat([query]));
  const qv = vectorize(query, idf);
  const scored = items.map((it) => ({ item: it, score: cosine(qv, vectorize(textOf(it), idf)) }));
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, topK || 5);
}

/** 安全护栏：输入过滤（提示注入 / 敏感词）、输出过滤 */
const INJECTION_PATTERNS = [/ignore\s+(all\s+)?previous/i, /system\s*prompt/i, /你现在是/i, /忽略上面/i, /drop\s+table/i];
const SENSITIVE = ['sb', '傻逼', ' fuck ', '暴力', '赌博'];

function guardInput(text) {
  const t = String(text || '');
  for (const re of INJECTION_PATTERNS) {
    if (re.test(t)) return { safe: false, reason: 'prompt_injection', text: '检测到疑似提示注入内容，已按安全策略拦截。' };
  }
  for (const w of SENSITIVE) {
    if (t.toLowerCase().includes(w)) return { safe: false, reason: 'sensitive_word', text: '内容包含不合规用语，已拦截。' };
  }
  if (t.length > 2000) return { safe: false, reason: 'too_long', text: '输入过长，请精简后重试。' };
  return { safe: true };
}

function guardOutput(text) {
  let out = String(text || '');
  out = out.replace(/联系方式[:：].*\n?/g, '');
  return out;
}

/** 模板化片段生成（本地网关） */
function synthesize(intro, facts, closing) {
  const parts = [];
  if (intro) parts.push(intro);
  (facts || []).forEach((f) => parts.push('· ' + f));
  if (closing) parts.push(closing);
  return parts.join('\n');
}

module.exports = { tokenize, vectorize, cosine, buildIdf, search, guardInput, guardOutput, synthesize };
