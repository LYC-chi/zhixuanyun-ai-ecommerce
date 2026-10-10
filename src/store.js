'use strict';
/**
 * store.js — 极简 JSON 文件数据持久层
 * 与设计报告「基础设施层」对应：对外暴露仓储式读写，内部以单文件 JSON 落盘。
 * 零外部依赖，随项目一起发布，可在部署沙箱内可靠持久化。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AIECP_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;
let saveTimer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (db) return db;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      // 损坏文件备份后重建，保证服务可启动
      try { fs.renameSync(DB_FILE, DB_FILE + '.broken.' + Date.now()); } catch (_) {}
      db = null;
    }
  }
  return db;
}

function init(seedFactory) {
  load();
  if (!db) {
    db = seedFactory();
    saveNow();
  } else {
    // 向后兼容：补齐缺失的顶层集合
    const fresh = seedFactory(true);
    for (const k of Object.keys(fresh)) {
      if (db[k] === undefined) db[k] = fresh[k];
    }
  }
  return db;
}

function get() {
  if (!db) load();
  return db;
}

function saveNow() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/** 延迟批量落盘，避免高频写造成抖动 */
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveNow(); } catch (e) { console.error('[store] save failed:', e.message); }
  }, 120);
}

/** 自增主键 */
function nextId(collection) {
  const d = get();
  const arr = d[collection] || [];
  const maxId = arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  return maxId + 1;
}

module.exports = { init, get, save, saveNow, nextId, DB_FILE };
