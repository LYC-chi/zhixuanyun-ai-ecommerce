'use strict';
/**
 * fs 兼容层 —— 静态版把「文件」映射为 localStorage 键值，实现数据跨刷新持久化。
 * 覆盖率：existsSync / statSync / readFileSync / writeFileSync / mkdirSync / renameSync / unlinkSync / readdirSync / createReadStream
 */
var PREFIX = 'aiecp-fs:';
var mem = {};

function keyOf(p) { return PREFIX + String(p); }

function readRaw(p) {
  var k = keyOf(p);
  if (Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
  try {
    var v = globalThis.localStorage ? globalThis.localStorage.getItem(k) : null;
    if (v !== null) { mem[k] = v; return v; }
  } catch (e) { /* 隐私模式等 */ }
  return undefined;
}

function writeRaw(p, v) {
  var k = keyOf(p);
  mem[k] = v;
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(k, v); } catch (e) { /* 配额超限则仅驻内存 */ }
}

function removeRaw(p) {
  var k = keyOf(p);
  delete mem[k];
  try { if (globalThis.localStorage) globalThis.localStorage.removeItem(k); } catch (e) { /* ignore */ }
}

function existsSync(p) { return readRaw(p) !== undefined; }

function statSync(p) {
  var v = readRaw(p);
  if (v === undefined) { var e = new Error('ENOENT: no such file or directory, stat \'' + p + '\''); e.code = 'ENOENT'; throw e; }
  return {
    isFile: function () { return true; },
    isDirectory: function () { return false; },
    size: String(v).length,
    mtimeMs: Date.now(),
  };
}

function readFileSync(p, enc) {
  var v = readRaw(p);
  if (v === undefined) { var e = new Error('ENOENT: no such file or directory, open \'' + p + '\''); e.code = 'ENOENT'; throw e; }
  if (enc === 'utf8' || enc === 'utf-8') return v;
  return Buffer.from(v);
}

function writeFileSync(p, data) {
  writeRaw(p, typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
}

function mkdirSync() { /* 静态版无目录概念，空实现 */ }
function unlinkSync(p) { removeRaw(p); }
function rmSync(p) { removeRaw(p); }

function renameSync(a, b) {
  var v = readRaw(a);
  if (v === undefined) { var e = new Error('ENOENT: no such file or directory, rename \'' + a + '\''); e.code = 'ENOENT'; throw e; }
  writeRaw(b, v);
  removeRaw(a);
}

function readdirSync() { return []; }

function createReadStream(p) {
  var content = readRaw(p);
  var stream = {
    _ended: false,
    pipe: function (dest) {
      if (content !== undefined) { try { dest.write(content); } catch (e) { /* ignore */ } }
      try { dest.end(); } catch (e) { /* ignore */ }
      return dest;
    },
    on: function () { return stream; },
    destroy: function () {},
  };
  return stream;
}

module.exports = {
  existsSync: existsSync,
  statSync: statSync,
  readFileSync: readFileSync,
  writeFileSync: writeFileSync,
  mkdirSync: mkdirSync,
  renameSync: renameSync,
  unlinkSync: unlinkSync,
  rmSync: rmSync,
  readdirSync: readdirSync,
  createReadStream: createReadStream,
  promises: {
    readFile: function (p, enc) { return Promise.resolve(readFileSync(p, enc)); },
    writeFile: function (p, d) { return Promise.resolve(writeFileSync(p, d)); },
  },
};
