/* 智选云 AI 电商在线售货系统 · 静态版运行时（自动生成，请勿手改） */
(function () {
var __ROOT__ = "/";
/* =============================================================================
   AI-ECP 静态版 · 运行时前置
   在浏览器中提供最小的 Buffer / process 兼容层，使 Node 端源码可原样复用。
   ========================================================================== */
(function () {
  'use strict';

  if (!globalThis.process) {
    globalThis.process = {
      env: {},
      argv: [],
      version: 'v20.0.0-static',
      platform: 'browser',
      on: function () {},
      exit: function () {},
      nextTick: function (fn) { setTimeout(fn, 0); },
    };
  } else if (!globalThis.process.env) {
    globalThis.process.env = {};
  }

  function decodeBase64(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodeBase64(bytes) {
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
    }
    return btoa(bin);
  }

  function utf8Encode(str) { return new TextEncoder().encode(String(str)); }
  function utf8Decode(bytes) { return new TextDecoder().decode(bytes); }

  /** 跨 realm 安全的类型判定（iframes / worker / 注入实现等场景下 instanceof 会失效） */
  function isBytes(x) {
    return (typeof ArrayBuffer !== 'undefined') && ArrayBuffer.isView(x) && !(x instanceof DataView);
  }

  function Buf(input, enc) {
    var u8;
    if (typeof input === 'string') {
      u8 = (enc === 'base64' || enc === 'base64url') ? decodeBase64(input) : utf8Encode(input);
    } else if (isBytes(input)) {
      u8 = new Uint8Array(input.length);
      u8.set(input);
    } else if (input instanceof ArrayBuffer) {
      u8 = new Uint8Array(input.slice(0));
    } else if (Array.isArray(input)) {
      u8 = new Uint8Array(input);
    } else if (input == null) {
      u8 = new Uint8Array(0);
    } else {
      u8 = utf8Encode(String(input));
    }
    Object.setPrototypeOf(u8, Buf.prototype);
    return u8;
  }

  Buf.prototype = Object.create(Uint8Array.prototype);
  Buf.prototype.constructor = Buf;

  Buf.prototype.toString = function (enc) {
    enc = String(enc || 'utf8').toLowerCase();
    if (enc === 'hex') {
      var s = '';
      for (var i = 0; i < this.length; i++) s += (this[i] < 16 ? '0' : '') + this[i].toString(16);
      return s;
    }
    if (enc === 'base64') return encodeBase64(this);
    if (enc === 'latin1' || enc === 'binary') {
      var b = '';
      for (var j = 0; j < this.length; j++) b += String.fromCharCode(this[j]);
      return b;
    }
    return utf8Decode(this);
  };

  Buf.from = function (v, enc) { return Buf(v, enc); };
  Buf.concat = function (list) {
    var total = 0, i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c == null) continue;
      if (!isBytes(c)) c = utf8Encode(String(c));
      total += c.length;
    }
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c == null) continue;
      if (!isBytes(c)) c = utf8Encode(String(c));
      out.set(c, off);
      off += c.length;
    }
    return Buf(out);
  };
  Buf.byteLength = function (s, enc) {
    if (typeof s !== 'string') return (s && s.length) || 0;
    return (enc === 'base64') ? decodeBase64(s).length : utf8Encode(s).length;
  };
  Buf.isBuffer = function (x) { return x instanceof Uint8Array; };

  globalThis.Buffer = Buf;
  globalThis.__utf8Encode = utf8Encode;
  globalThis.__base64EncodeBytes = encodeBase64;
  globalThis.__base64Decode = decodeBase64;
})();

/* =============================================================================
   AI-ECP 静态版 · 运行时内核
   1) 迷你 CommonJS 加载器：让 src/*.js 与 server.js 原样运行在浏览器中
   2) 请求分发器 AIECP_DISPATCH：把 fetch 调用转成 Node 风格的 (req, res)
   ========================================================================== */
'use strict';

var __mods = {};
var __cache = {};

function __def(id, fn, dir) { __mods[id] = { fn: fn, dir: dir }; }

function __resolveId(spec, dir) {
  if (spec.charAt(0) !== '.') return spec;
  var joined = dir + '/' + spec;
  var parts = joined.split('/');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i];
    if (s === '' || s === '.') continue;
    if (s === '..') { out.pop(); continue; }
    out.push(s);
  }
  var id = '/' + out.join('/');
  if (!/\.js$/.test(id)) id += '.js';
  return id;
}

function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  var m = __mods[id];
  if (!m) throw new Error("Cannot find module '" + id + "'");
  var mod = { exports: {} };
  __cache[id] = mod;
  var req = function (spec) { return __require(__resolveId(spec, m.dir)); };
  m.fn(mod, mod.exports, req, m.dir, id);
  return mod.exports;
}

function AIECP_DISPATCH(method, url, headers, bodyText) {
  return new Promise(function (resolve, reject) {
    var handler = globalThis.__AIECP_SERVER_HANDLER__;
    if (typeof handler !== 'function') { reject(new Error('AI-ECP 静态服务尚未就绪')); return; }

    var lower = {};
    if (headers) {
      if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
        headers.forEach(function (v, k) { lower[String(k).toLowerCase()] = v; });
      } else if (Array.isArray(headers)) {
        headers.forEach(function (p) { lower[String(p[0]).toLowerCase()] = p[1]; });
      } else {
        Object.keys(headers).forEach(function (k) { lower[String(k).toLowerCase()] = headers[k]; });
      }
    }

    var ls = {};
    var req = {
      method: String(method || 'GET').toUpperCase(),
      url: String(url || '/'),
      headers: lower,
      socket: {}, connection: {},
      on: function (ev, fn) { (ls[ev] = ls[ev] || []).push(fn); return req; },
      once: function (ev, fn) { return req.on(ev, fn); },
      removeListener: function () { return req; },
      destroy: function () {},
      pause: function () {}, resume: function () {}, setEncoding: function () { return req; },
    };

    function emit(ev, arg) {
      var fns = ls[ev] || [];
      for (var i = 0; i < fns.length; i++) {
        try { fns[i](arg); } catch (e) {
          if (globalThis.console && globalThis.console.error) {
            globalThis.console.error('[AI-ECP] 请求监听器异常（' + ev + '）：', e && (e.stack || e.message));
          }
        }
      }
    }

    var settled = false, status = 200, rh = {};
    var res = {
      statusCode: 200,
      finished: false,
      writeHead: function (s, h) { status = s; res.statusCode = s; if (h) Object.assign(rh, h); return res; },
      setHeader: function (k, v) { rh[k] = v; return res; },
      getHeader: function (k) { return rh[k]; },
      removeHeader: function (k) { delete rh[k]; return res; },
      write: function () { return true; },
      end: function (b) {
        if (settled) return res;
        settled = true;
        res.finished = true;
        var body;
        if (b === undefined || b === null) body = '';
        else if (typeof b === 'string') body = b;
        else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(b)) body = b;
        else body = String(b);
        resolve({ status: status, headers: rh, body: body });
        return res;
      },
      on: function () { return res; },
      once: function () { return res; },
    };

    Promise.resolve().then(function () { return handler(req, res); }).catch(reject);

    setTimeout(function () {
      if (bodyText) emit('data', typeof bodyText === 'string' ? globalThis.__utf8Encode(bodyText) : bodyText);
      emit('end');
    }, 0);
  });
}

globalThis.AIECP_DISPATCH = AIECP_DISPATCH;

__def("fs", function (module, exports, require, __dirname, __filename) {
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

}, "/");
__def("path", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * path 兼容层 —— 静态版实现 POSIX 风格的 join / normalize / extname。
 * 覆盖率：server.js 与 src/* 仅使用 join / normalize / extname / basename / dirname。
 */
function normalize(p) {
  p = String(p).replace(/\\/g, '/');
  var isAbs = p.charAt(0) === '/';
  var trailing = p.length > 1 && p.charAt(p.length - 1) === '/';
  var parts = p.split('/');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i];
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!isAbs) out.push('..');
      continue;
    }
    out.push(seg);
  }
  var r = (isAbs ? '/' : '') + out.join('/');
  if (!r) r = isAbs ? '/' : '.';
  if (trailing && r !== '/' && r !== './') r += '/';
  return r;
}

function join() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    if (a === undefined || a === null || a === '') continue;
    parts.push(String(a));
  }
  if (!parts.length) return '.';
  return normalize(parts.join('/'));
}

function extname(p) {
  var base = String(p).split('/').pop();
  var i = base.lastIndexOf('.');
  return (i > 0) ? base.slice(i) : '';
}

function basename(p, ext) {
  var b = String(p).split('/').pop() || '';
  if (ext && b.slice(-ext.length) === ext) b = b.slice(0, -ext.length);
  return b;
}

function dirname(p) {
  var n = normalize(p);
  var i = n.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return n.slice(0, i);
}

module.exports = {
  normalize: normalize,
  join: join,
  extname: extname,
  basename: basename,
  dirname: dirname,
  resolve: join,
  sep: '/',
  delimiter: ':',
  parse: function (p) {
    return { root: p.charAt(0) === '/' ? '/' : '', dir: dirname(p), base: basename(p), ext: extname(p), name: basename(p).replace(/\.[^.]+$/, '') };
  },
  relative: function (from, to) { return normalize(to); },
  isAbsolute: function (p) { return String(p).charAt(0) === '/'; },
};

}, "/");
__def("url", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * url 兼容层 —— 仅实现 server.js 用到的 url.parse(str, true)。
 */
function parse(u, parseQueryString) {
  var base = 'http://localhost';
  var U = new URL(String(u), base);
  var res = {
    href: U.href,
    protocol: U.protocol,
    host: U.host,
    hostname: U.hostname,
    port: U.port,
    pathname: U.pathname,
    search: U.search,
    hash: U.hash,
  };
  if (parseQueryString) {
    var q = {};
    U.searchParams.forEach(function (v, k) {
      if (!Object.prototype.hasOwnProperty.call(q, k)) q[k] = v;
      else if (Array.isArray(q[k])) q[k].push(v);
      else q[k] = [q[k], v];
    });
    res.query = q;
  } else {
    res.query = U.search ? U.search.slice(1) : '';
  }
  return res;
}

module.exports = {
  parse: parse,
  format: function (o) { return String(o && o.href) || ''; },
  URL: URL,
  URLSearchParams: URLSearchParams,
};

}, "/");
__def("crypto", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * crypto 兼容层 —— 纯 JS 同步实现 SHA-256 / HMAC-SHA256 / PBKDF2。
 *
 * 说明：Node 端使用 scrypt 做口令散列；浏览器缺少同步 scrypt，静态版改用
 * 等效强度的 PBKDF2-HMAC-SHA256（迭代 4096 次）作为 KDF。散列与校验都走本模块，
 * 因此行为自洽。该实现仅用于公开演示站点，不用于生产环境口令存储。
 */
var B = globalThis.Buffer;

var K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function toBytes(x) {
  if (typeof x === 'string') return globalThis.__utf8Encode(x);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(x)) {
    var v = new Uint8Array(x.length);
    v.set(x);
    return v;
  }
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  return globalThis.__utf8Encode(String(x));
}

function concatBytes(list) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var out = new Uint8Array(total), off = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
  return out;
}

function sha256(bytes) {
  var l = bytes.length;
  var bitLen = l * 8;
  var totalLen = Math.ceil((l + 9) / 64) * 64;
  var buf = new Uint8Array(totalLen);
  buf.set(bytes);
  buf[l] = 0x80;
  var dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 8, Math.floor(bitLen / 4294967296), false);
  dv.setUint32(totalLen - 4, bitLen >>> 0, false);

  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Uint32Array(64);

  for (var off = 0; off < totalLen; off += 64) {
    for (var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4, false);
    for (var t2 = 16; t2 < 64; t2++) {
      var x = w[t2 - 15], y = w[t2 - 2];
      var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t2] = (w[t2 - 16] + s0 + w[t2 - 7] + s1) >>> 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (var i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t22 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t22) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  var out = new Uint8Array(32);
  var odv = new DataView(out.buffer);
  for (var j = 0; j < 8; j++) odv.setUint32(j * 4, H[j], false);
  return out;
}

function hmacSha256(keyBytes, msgBytes) {
  var BLOCK = 64;
  var k = keyBytes;
  if (k.length > BLOCK) k = sha256(k);
  var padded = new Uint8Array(BLOCK);
  padded.set(k);
  var iKey = new Uint8Array(BLOCK), oKey = new Uint8Array(BLOCK);
  for (var i = 0; i < BLOCK; i++) { iKey[i] = padded[i] ^ 0x36; oKey[i] = padded[i] ^ 0x5c; }
  var inner = sha256(concatBytes([iKey, msgBytes]));
  return sha256(concatBytes([oKey, inner]));
}

function pbkdf2(password, salt, iterations, keylen) {
  var pw = toBytes(password);
  var saltBytes = toBytes(salt);
  var blocks = Math.ceil(keylen / 32);
  var out = new Uint8Array(blocks * 32);
  for (var b = 1; b <= blocks; b++) {
    var idx = new Uint8Array([0, 0, 0, b & 0xff]);
    var u = hmacSha256(pw, concatBytes([saltBytes, idx]));
    var t = new Uint8Array(u);
    for (var j = 1; j < iterations; j++) {
      u = hmacSha256(pw, u);
      for (var z = 0; z < 32; z++) t[z] ^= u[z];
    }
    out.set(t, (b - 1) * 32);
  }
  return out.subarray(0, keylen);
}

function randomBytes(n) {
  var b = new Uint8Array(n);
  var c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(b);
  } else {
    for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return B(b);
}

module.exports = {
  randomBytes: randomBytes,

  createHmac: function (algo, key) {
    var keyBytes = toBytes(key);
    var chunks = [];
    return {
      update: function (d) { chunks.push(toBytes(d)); return this; },
      digest: function (enc) {
        var out = B(hmacSha256(keyBytes, concatBytes(chunks)));
        return enc ? out.toString(enc) : out;
      },
    };
  },

  createHash: function () {
    var chunks = [];
    return {
      update: function (d) { chunks.push(toBytes(d)); return this; },
      digest: function (enc) {
        var out = B(sha256(concatBytes(chunks)));
        return enc ? out.toString(enc) : out;
      },
    };
  },

  /** 浏览器端 KDF（代替 Node 的 scryptSync）：PBKDF2-HMAC-SHA256 */
  scryptSync: function (password, salt, keylen) {
    return B(pbkdf2(String(password), String(salt), 4096, keylen || 32));
  },

  timingSafeEqual: function (a, b) {
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a[i] ^ b[i];
    return r === 0;
  },
};

}, "/");
__def("http", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * http 兼容层 —— 静态版只需截获 createServer 注册的请求处理器，
 * 由运行时分发器（AIECP_DISPATCH）直接调用，不产生真实监听。
 */
module.exports = {
  createServer: function (handler) {
    globalThis.__AIECP_SERVER_HANDLER__ = handler;
    var server = {
      listen: function (port, host, cb) {
        if (typeof host === 'function') { cb = host; }
        if (typeof port === 'function') { cb = port; }
        if (typeof cb === 'function') setTimeout(cb, 0);
        return server;
      },
      close: function (cb) { if (typeof cb === 'function') setTimeout(cb, 0); return server; },
      on: function () { return server; },
      address: function () { return { port: 3000, address: '0.0.0.0' }; },
    };
    return server;
  },
  STATUS_CODES: { 200: 'OK', 204: 'No Content', 301: 'Moved Permanently', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' },
};

}, "/");
__def("/server.js", function (module, exports, require, __dirname, __filename) {
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

}, "/");
__def("/src/store.js", function (module, exports, require, __dirname, __filename) {
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

}, "/src");
__def("/src/seed.js", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * seed.js — 初始数据集
 * 品类数据通过真实的「JSON 品类定义 → 解析校验 → 树构建 → 索引映射」链路生成，
 * 保证种子数据与解析引擎行为一致（一次声明、多端生效）。
 */
const cat = require('./category');
const { hashPassword } = require('./auth');

// ---------------------------------------------------------------------------
// 一、品类定义 JSON（商家自定义品类，对应 FR-07 ~ FR-10）
// ---------------------------------------------------------------------------
const CATEGORY_JSONS = [
  {
    source: '家用电器品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'HOME_APPLIANCE', name: '家用电器', sort: 10,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'ENERGY_LEVEL', name: '能效等级', dataType: 'enum', options: ['一级', '二级', '三级'], required: true, filterable: true },
          { code: 'WARRANTY_YEARS', name: '整机保修年限', dataType: 'integer', unit: '年', range: [1, 10], required: false, filterable: true },
        ],
        children: [
          {
            code: 'HOME_APPLIANCE_KITCHEN', name: '厨房电器', sort: 20,
            attributes: [
              { code: 'CAPACITY', name: '容量', dataType: 'decimal', unit: 'L', range: [0.5, 60], required: false, filterable: true },
            ],
            children: [
              {
                code: 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', name: '电饭煲', sort: 21,
                attributes: [
                  { code: 'INNER_POT', name: '内胆材质', dataType: 'enum', options: ['铝合金', '不锈钢', '陶瓷', '铸铁'], required: true, filterable: true },
                  { code: 'KEEP_WARM_HOURS', name: '保温时长', dataType: 'integer', unit: '小时', range: [0, 48], required: false, filterable: true },
                ],
              },
              {
                code: 'HOME_APPLIANCE_KITCHEN_BLENDER', name: '破壁料理机', sort: 22,
                attributes: [
                  { code: 'SPEED_LEVELS', name: '调速档位', dataType: 'integer', unit: '档', range: [1, 12], required: false, filterable: true },
                ],
              },
            ],
          },
          {
            code: 'HOME_APPLIANCE_CLEANING', name: '清洁电器', sort: 30,
            attributes: [
              { code: 'SUCTION_POWER', name: '吸力', dataType: 'integer', unit: 'Pa', range: [1000, 40000], required: false, filterable: true },
              { code: 'RUNTIME_MIN', name: '续航时长', dataType: 'integer', unit: '分钟', range: [10, 200], required: false, filterable: true },
            ],
            children: [
              { code: 'HOME_APPLIANCE_CLEANING_VACUUM', name: '吸尘器', sort: 31, attributes: [] },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '数码电子品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'DIGITAL', name: '数码电子', sort: 20,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'COLOR', name: '颜色', dataType: 'multiEnum', options: ['曜石黑', '月光银', '晴空蓝', '樱花粉', '原野绿'], required: false, filterable: true },
        ],
        children: [
          {
            code: 'DIGITAL_PHONE', name: '智能手机', sort: 21,
            attributes: [
              { code: 'SCREEN_SIZE', name: '屏幕尺寸', dataType: 'decimal', unit: '英寸', range: [4, 8], required: false, filterable: true },
              { code: 'STORAGE', name: '存储容量', dataType: 'enum', options: ['128GB', '256GB', '512GB', '1TB'], required: true, filterable: true },
              { code: 'BATTERY', name: '电池容量', dataType: 'integer', unit: 'mAh', range: [2000, 8000], required: false, filterable: true },
            ],
          },
          {
            code: 'DIGITAL_LAPTOP', name: '笔记本电脑', sort: 22,
            attributes: [
              { code: 'CPU', name: '处理器', dataType: 'string', required: false, searchable: true, filterable: true },
              { code: 'MEMORY', name: '内存容量', dataType: 'enum', options: ['8GB', '16GB', '32GB', '64GB'], required: true, filterable: true },
              { code: 'DISK', name: '硬盘容量', dataType: 'enum', options: ['256GB', '512GB', '1TB', '2TB'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '服饰鞋包品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'FASHION', name: '服饰鞋包', sort: 30,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
        ],
        children: [
          {
            code: 'FASHION_MEN', name: '男士上衣', sort: 31,
            attributes: [
              { code: 'SIZE', name: '尺码', dataType: 'enum', options: ['S', 'M', 'L', 'XL', 'XXL'], required: true, filterable: true },
              { code: 'MATERIAL', name: '面料', dataType: 'string', required: false, searchable: true, filterable: true },
            ],
          },
          {
            code: 'FASHION_SHOES', name: '运动鞋', sort: 32,
            attributes: [
              { code: 'SHOE_SIZE', name: '鞋码', dataType: 'integer', range: [35, 46], required: true, filterable: true },
              { code: 'CLOSURE', name: '闭合方式', dataType: 'enum', options: ['系带', '套脚', '拉链'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '食品饮料品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'FOOD', name: '食品饮料', sort: 40,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'SHELF_LIFE', name: '保质期', dataType: 'integer', unit: '天', range: [1, 730], required: false, filterable: true },
        ],
        children: [
          {
            code: 'FOOD_SNACK', name: '休闲零食', sort: 41,
            attributes: [
              { code: 'FLAVOR', name: '口味', dataType: 'enum', options: ['原味', '香辣', '甜味', '咸味', '海盐'], required: false, filterable: true },
              { code: 'PACKAGE_TYPE', name: '包装形式', dataType: 'enum', options: ['袋装', '盒装', '罐装'], required: false, filterable: true },
            ],
          },
          {
            code: 'FOOD_DRINK', name: '饮料冲调', sort: 42,
            attributes: [
              { code: 'VOLUME', name: '容量', dataType: 'integer', unit: 'ml', range: [200, 3000], required: false, filterable: true },
              { code: 'SUGAR', name: '含糖类型', dataType: 'enum', options: ['无糖', '低糖', '常规'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
];

// ---------------------------------------------------------------------------
// 二、商品种子（SPU / SKU / 属性值 / 库存）
// ---------------------------------------------------------------------------
// 每项：[工厂名, 品类码, 标题, 副标题, 图标, 主色, 属性, [SKU 规格…]]
const PRODUCT_SEEDS = [
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '智选云 IH 电饭煲 4L', 'IH 电磁加热 · 24h 智能预约', '🍚', '#2f6fb0',
    { BRAND: '智选云', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 3, CAPACITY: 4, INNER_POT: '铸铁', KEEP_WARM_HOURS: 24 },
    [['4L 珍珠白', 599, 799, 120], ['4L 曜石黑', 619, 799, 60], ['5L 珍珠白', 699, 899, 45]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '云膳 陶瓷内胆电饭煲 3L', '陶瓷内胆 · 低糖饭模式', '🍚', '#3f9d7a',
    { BRAND: '云膳', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 2, CAPACITY: 3, INNER_POT: '陶瓷', KEEP_WARM_HOURS: 12 },
    [['3L 米白', 349, 459, 200], ['3L 浅灰', 369, 459, 80]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_BLENDER', '智选云 破壁料理机 Pro', '12 档调速 · 静音降噪', '🥤', '#b06a2f',
    { BRAND: '智选云', ENERGY_LEVEL: '二级', WARRANTY_YEARS: 2, CAPACITY: 1.75, SPEED_LEVELS: 12 },
    [['标准版', 899, 1099, 66], ['降噪升级版', 1099, 1299, 30]]],
  ['自营', 'HOME_APPLIANCE_CLEANING_VACUUM', '风行者 无线吸尘器 V10', '40000Pa 强吸力 · 60 分钟续航', '🧹', '#5b6ef0',
    { BRAND: '风行者', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 2, SUCTION_POWER: 40000, RUNTIME_MIN: 60 },
    [['标准版', 1299, 1699, 88], ['洗地一体版', 1899, 2299, 25]]],
  ['自营', 'HOME_APPLIANCE_CLEANING_VACUUM', '轻岚 手持吸尘器 Lite', '轻量化 1.2kg · 便携除螨', '🧹', '#7a5cf0',
    { BRAND: '轻岚', ENERGY_LEVEL: '二级', WARRANTY_YEARS: 1, SUCTION_POWER: 12000, RUNTIME_MIN: 35 },
    [['标准版', 499, 699, 150], ['除螨套装', 599, 799, 70]]],

  ['自营', 'DIGITAL_PHONE', '智选云 Phone 15 Pro', '6.7 英寸 · 全系潜望长焦', '📱', '#1f4e79',
    { BRAND: 'ZCloud', COLOR: ['曜石黑', '晴空蓝'], SCREEN_SIZE: 6.7, STORAGE: '256GB', BATTERY: 4800 },
    [['256GB 曜石黑', 4999, 5499, 60], ['256GB 晴空蓝', 4999, 5499, 45], ['512GB 曜石黑', 5699, 6199, 30]]],
  ['自营', 'DIGITAL_PHONE', 'ZCloud Neo 12', '轻旗舰 · 5000mAh 长续航', '📱', '#2a7fbf',
    { BRAND: 'ZCloud', COLOR: ['月光银', '樱花粉'], SCREEN_SIZE: 6.4, STORAGE: '128GB', BATTERY: 5000 },
    [['128GB 月光银', 2299, 2599, 120], ['256GB 樱花粉', 2599, 2899, 90]]],
  ['自营', 'DIGITAL_LAPTOP', '智选云 Book Air 14', '1.29kg 轻薄本 · 2.8K 高刷屏', '💻', '#3b4a6b',
    { BRAND: 'ZCloud', CPU: '酷睿 Ultra 5', MEMORY: '16GB', DISK: '512GB', SCREEN_SIZE: 14 },
    [['16GB+512GB', 5299, 5999, 55], ['32GB+1TB', 6899, 7599, 20]]],
  ['自营', 'DIGITAL_LAPTOP', '智选云 Book Pro 16', '高性能创作本 · 独显', '💻', '#5a3b6b',
    { BRAND: 'ZCloud', CPU: '酷睿 Ultra 9', MEMORY: '32GB', DISK: '1TB', SCREEN_SIZE: 16 },
    [['32GB+1TB', 9999, 10999, 26], ['64GB+2TB', 12999, 13999, 10]]],

  ['自营', 'FASHION_MEN', '简白 精梳棉圆领 T 恤', '100% 新疆长绒棉 · 亲肤透气', '👕', '#4a5a6a',
    { BRAND: '简白', SIZE: 'L', MATERIAL: '精梳棉' },
    [['S 白色', 89, 129, 200], ['M 白色', 89, 129, 260], ['L 白色', 89, 129, 180], ['XL 藏青', 99, 139, 120]]],
  ['自营', 'FASHION_MEN', '极北 户外冲锋衣三合一', '防风防水 · 可拆内胆', '🧥', '#2f6b5a',
    { BRAND: '极北', SIZE: 'XL', MATERIAL: '锦纶' },
    [['M 军绿', 699, 899, 60], ['L 军绿', 699, 899, 55], ['XL 黑色', 729, 929, 40]]],
  ['自营', 'FASHION_SHOES', '云跃 轻量跑鞋 3.0', '回弹中底 · 仅 218g', '👟', '#e0784a',
    { BRAND: '云跃', SHOE_SIZE: 42, CLOSURE: '系带' },
    [['41 竞速红', 399, 499, 90], ['42 竞速红', 399, 499, 110], ['42 曜石黑', 399, 499, 130], ['43 曜石黑', 399, 499, 80]]],
  ['自营', 'FASHION_SHOES', '云跃 复古板鞋', '百搭复古 · 耐磨橡胶大底', '👟', '#a05a7a',
    { BRAND: '云跃', SHOE_SIZE: 40, CLOSURE: '系带' },
    [['39 奶油白', 299, 399, 100], ['40 奶油白', 299, 399, 120], ['41 复古棕', 319, 399, 70]]],

  ['自营', 'FOOD_SNACK', '山野 每日坚果混合装 750g', '7 种果仁 · 独立小包', '🥜', '#b07a2f',
    { BRAND: '山野', SHELF_LIFE: 180, FLAVOR: '原味', PACKAGE_TYPE: '袋装' },
    [['750g 袋装', 79, 99, 300], ['750g×2 组合装', 149, 198, 120]]],
  ['自营', 'FOOD_SNACK', '脆乐 海盐薯片 大桶装', '非油炸 · 海盐轻咸', '🍟', '#c9a02f',
    { BRAND: '脆乐', SHELF_LIFE: 270, FLAVOR: '海盐', PACKAGE_TYPE: '罐装' },
    [['104g 罐装', 15.9, 19.9, 500], ['104g×3 组合装', 42, 59.7, 160]]],
  ['自营', 'FOOD_DRINK', '清源 无糖气泡水 12 瓶', '0 糖 0 卡 · 天然矿泉水基', '🥤', '#3f9db0',
    { BRAND: '清源', SHELF_LIFE: 365, VOLUME: 480, SUGAR: '无糖' },
    [['480ml×12 原味', 39, 55, 400], ['480ml×12 青柠味', 39, 55, 260]]],
  ['自营', 'FOOD_DRINK', '暖阳 冷萃拿铁 咖啡液 10 条', '0 蔗糖 · 冷萃锁鲜', '☕', '#6b4a2f',
    { BRAND: '暖阳', SHELF_LIFE: 240, VOLUME: 30, SUGAR: '低糖' },
    [['30ml×10 经典', 59, 79, 200], ['30ml×20 家庭装', 109, 158, 90]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '智选云 迷你电饭煲 1.6L', '1-2 人食 · 小巧不占地', '🍚', '#6fa0cf',
    { BRAND: '智选云', ENERGY_LEVEL: '三级', WARRANTY_YEARS: 1, CAPACITY: 1.6, INNER_POT: '铝合金', KEEP_WARM_HOURS: 8 },
    [['1.6L 白', 199, 259, 180]]],
];

// 品牌 → 商家映射（自营旗舰店）
const MERCHANT_SHOP = '智选云自营旗舰店';

function buildCategories(db) {
  db.categories = [];
  db.categoryVersions = [];
  db.indexMappings = [];
  let versionSeq = 0;
  let nextId = 1; // 全局唯一 id 分配（跨根品类树）
  CATEGORY_JSONS.forEach((item, idx) => {
    const syn = cat.syntaxCheck(item.text);
    if (!syn.ok) throw new Error('种子品类 JSON 语法错误：' + item.source);
    const v = cat.validate(syn.value);
    if (v.errors.length) throw new Error('种子品类校验失败：' + item.source + ' ' + JSON.stringify(v.errors));
    const tree = cat.buildTree(syn.value.category, nextId);
    const flat = cat.flatten(tree);
    nextId = Math.max.apply(null, flat.map((n) => n.id)) + 1;
    flat.forEach((node) => {
      db.categories.push({
        id: node.id, code: node.code, name: node.name, parentId: node.parentId, level: node.level,
        path: node.path, isLeaf: node.isLeaf, sort: node.sort,
        attributes: node.attributes, version: idx + 1, status: 1,
        source: item.source, merchantId: 2,
      });
    });
    const idxMap = cat.buildIndexMapping(tree);
    db.indexMappings.push(Object.assign({ id: db.indexMappings.length + 1, categoryId: tree.id }, idxMap));
    versionSeq = idx + 1;
    db.categoryVersions.push({
      id: db.categoryVersions.length + 1, code: tree.code, version: idx + 1,
      createdAt: new Date(Date.now() - (CATEGORY_JSONS.length - idx) * 86400000).toISOString(),
      attrCount: cat.flatten(tree).reduce((n, c) => n + c.attributes.length, 0),
      nodeCount: flat.length, source: item.source, status: 'published',
    });
  });
  db.meta.categoryVersionSeq = versionSeq;
}

function buildProducts(db) {
  const leafByCode = {};
  db.categories.forEach((c) => { leafByCode[c.code] = c; });
  let skuId = 1;
  const products = [];
  const skus = [];
  const inventories = [];
  PRODUCT_SEEDS.forEach((seed, i) => {
    const [merchantTag, catCode, title, subtitle, emoji, color, attrs, skuList] = seed;
    const category = leafByCode[catCode];
    if (!category) throw new Error('未找到品类 ' + catCode);
    const pid = i + 1;
    const productSkus = skuList.map((s, k) => {
      const [specText, salePrice, marketPrice, stock] = s;
      const id = skuId++;
      skus.push({ id, productId: pid, specText, salePrice, marketPrice, status: 1, attrs });
      inventories.push({ id: inventories.length + 1, skuId: id, warehouseId: k % 2 === 0 ? 1 : 2, totalQty: stock, lockedQty: 0, safeQty: Math.max(5, Math.round(stock * 0.1)), version: 1 });
      return id;
    });
    const prices = skuList.map((s) => s[1]);
    products.push({
      id: pid, merchantId: 2, merchantName: MERCHANT_SHOP,
      categoryId: category.id, categoryCode: catCode, categoryName: category.name,
      title, subtitle, emoji, color, mainImage: '',
      attrs, skuIds: productSkus,
      priceMin: Math.min.apply(null, prices), priceMax: Math.max.apply(null, prices),
      status: 1, tags: ['自营', '包邮'],
      salesCount: Math.round(200 / (i + 2)) + (i % 5) * 13,
      ratingAvg: 4.5 + ((i % 5) / 10), reviewCount: 0,
      createdAt: new Date(Date.now() - (PRODUCT_SEEDS.length - i) * 3600000 * 6).toISOString(),
    });
  });
  db.products = products;
  db.skus = skus;
  db.inventories = inventories;
}

function seedFactory(isMerge) {
  const db = {
    meta: {
      system: 'AI-ECP',
      name: '智选云 AI 电商在线售货系统',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      categoryVersionSeq: 0,
      orderSeq: 0,
    },
    users: [
      { id: 1, username: 'consumer01', nickname: '云小买', mobile: '13800000001', role: 'consumer', password: hashPassword('consumer123'), memberLevel: 2, status: 1, createdAt: new Date().toISOString() },
      { id: 2, username: 'merchant01', nickname: '智选云自营旗舰店', mobile: '13800000002', role: 'merchant', password: hashPassword('merchant123'), shopName: MERCHANT_SHOP, memberLevel: 0, status: 1, createdAt: new Date().toISOString() },
      { id: 3, username: 'admin', nickname: '平台管理员', mobile: '13800000003', role: 'admin', password: hashPassword('admin123'), memberLevel: 0, status: 1, createdAt: new Date().toISOString() },
    ],
    addresses: [
      { id: 1, userId: 1, receiver: '云小买', phone: '13800000001', province: '广东省', city: '深圳市', district: '南山区', detail: '科技园南路 88 号智选大厦 A 座 1201', isDefault: 1 },
    ],
    userProfiles: [],
    categories: [],
    categoryVersions: [],
    indexMappings: [],
    products: [],
    skus: [],
    inventories: [],
    inventoryLogs: [],
    carts: [],
    orders: [],
    orderItems: [],
    payments: [],
    shipments: [],
    logisticsTraces: [],
    reviews: [],
    afterSales: [],
    coupons: [
      { id: 1, code: 'WELCOME20', name: '新人满 200 减 20', type: 'full_reduce', threshold: 200, value: 20, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 1000, claimed: 0, status: 1 },
      { id: 2, code: 'SUMMER50', name: '夏日满 500 减 50', type: 'full_reduce', threshold: 500, value: 50, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 500, claimed: 0, status: 1 },
      { id: 3, code: 'DISCOUNT95', name: '全场 9.5 折', type: 'discount', threshold: 0, value: 0.95, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 300, claimed: 0, status: 1 },
    ],
    userCoupons: [],
    behaviors: [],
    conversations: [],
    messages: [],
    recommendLogs: [],
    bundles: [],
    bundleItems: [],
    knowledge: [],
    prompts: [
      { id: 1, name: '智能客服主提示词', scene: 'customer_service', version: 3, content: '你是智选云 AI 电商客服助手，依据检索到的知识片段与受控工具返回结果作答；不确定时建议转人工。', status: 'published', updatedAt: new Date().toISOString() },
      { id: 2, name: '智能选品排序提示词', scene: 'selection', version: 2, content: '结合用户画像与实时行为，对多路召回商品进行精排并给出推荐理由。', status: 'published', updatedAt: new Date().toISOString() },
      { id: 3, name: '智能组货搭配提示词', scene: 'bundle', version: 1, content: '以主商品为中心生成成套搭配方案与组合优惠；仅生成可售组合的搭配理由。', status: 'published', updatedAt: new Date().toISOString() },
    ],
    auditLogs: [],
    config: {
      llm: { provider: 'local-gateway', model: 'aiecp-rule-engine', temperature: 0.3, enabled: true, fallbackEnabled: true },
      recommend: { recallChannels: ['vector', 'hot', 'new', 'cf'], rerankTopN: 12, diversity: true },
      guardrail: { inputFilter: true, outputFilter: true, toolWhitelist: ['order_query', 'logistics_query', 'inventory_query', 'coupon_query'] },
    },
  };

  buildCategories(db);
  buildProducts(db);
  buildKnowledge(db);
  if (!isMerge) {
    db.userProfiles = [{
      id: 1, userId: 1, preferredCategories: ['DIGITAL', 'HOME_APPLIANCE'], priceBand: 'mid',
      activityScore: 0.62, updatedAt: new Date().toISOString(),
    }];
  }
  return db;
}

function buildKnowledge(db) {
  const K = [
    ['售后政策', '七天无理由退货：自签收之日起 7 天内，商品完好、配件齐全可申请无理由退货，运费由平台承担。', 'AFTERSALE'],
    ['售后政策', '退货流程：订单详情页点击「申请售后」→ 选择退货退款 → 上传凭证 → 审核通过后按提示寄回 → 验收后 1-3 个工作日退款到原支付渠道。', 'AFTERSALE'],
    ['配送说明', '默认使用顺丰/京东物流发货，付款后 48 小时内出库，全国大部分地区 1-3 天送达，偏远地区 3-5 天。', 'LOGISTICS'],
    ['配送说明', '满 99 元包邮，未满收取 8 元基础运费；大件家电支持送装一体，偏远地区可能加收运费。', 'LOGISTICS'],
    ['支付方式', '支持微信支付、支付宝、银行卡与余额支付；支付回调经签名校验且幂等处理，重复回调不重复扣款。', 'PAYMENT'],
    ['发票说明', '下单时可在备注中填写发票抬头与税号，电子发票将在订单完成后 24 小时内推送至账号邮箱。', 'INVOICE'],
    ['品类自定义', '本系统支持商家以 JSON 文本自定义商品品类结构，系统解析后自动生成属性 Schema、动态商品发布表单与检索索引，新增品类无需代码变更与系统发版。', 'CATEGORY'],
    ['智能客服', '智能客服支持多轮对话与上下文记忆，知识咨询走检索增强生成，订单、物流等业务问题走受控工具查询；置信度不足时可转接人工客服。', 'AI_CS'],
    ['智能选品', '智能选品依据用户画像与实时行为进行多路召回与个性化排序，过滤下架、无库存与限购商品；冷启动时返回热门榜单兜底。', 'AI_REC'],
    ['智能组货', '智能组货以主商品为中心召回配套商品，只有库存、履约、价格与毛利四维同时成立的组合才会输出，否则降级为单品推荐。', 'AI_BUNDLE'],
    ['会员权益', '会员等级分为 V1-V4，等级越高享受越高比例的会员折扣与专属客服；成长值由成交金额与互动行为累积。', 'MEMBER'],
  ];
  db.knowledge = K.map((k, i) => ({
    id: i + 1, categoryCode: k[2], content: k[0] + '：' + k[1],
    title: k[0], embeddingId: 'vec_' + (i + 1), status: 1,
  }));
}

module.exports = { seedFactory, CATEGORY_JSONS, MERCHANT_SHOP };

}, "/src");
__def("/src/category.js", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * category.js — 自定义商品品类 JSON 引擎
 * 对应需求 FR-07 ~ FR-10、报告 3.6 节品类规范与 V-01 ~ V-12 校验规则。
 * 契约：全量校验、一次反馈（不在首个错误处中断）；纯校验(dry-run)与正式提交分离。
 */

const SUPPORTED_VERSIONS = ['1.0'];
const DATA_TYPES = ['string', 'integer', 'decimal', 'boolean', 'enum', 'multiEnum', 'date', 'text', 'image'];
const NUMERIC_TYPES = ['integer', 'decimal'];
const ENUM_TYPES = ['enum', 'multiEnum'];
const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_NODES = 2000;
const MAX_ATTRS = 20000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 5;

/** V-01：JSON 语法校验，定位行号与列号 */
function syntaxCheck(jsonText) {
  if (jsonText == null) return { ok: false, error: { detail: '请求体缺少 jsonText' } };
  const bytes = Buffer.byteLength(jsonText, 'utf8');
  if (bytes > MAX_BYTES) {
    return { ok: false, error: { rule: 'V-12', detail: `JSON 文本超过 2MB 限制（当前 ${bytes} 字节）` } };
  }
  try {
    const value = JSON.parse(jsonText);
    return { ok: true, value };
  } catch (e) {
    const m = /position\s+(\d+)/i.exec(e.message);
    let line = 1, column = 1;
    if (m) {
      const pos = Number(m[1]);
      const before = jsonText.slice(0, pos);
      line = before.split('\n').length;
      column = pos - before.lastIndexOf('\n');
    }
    return {
      ok: false,
      error: {
        rule: 'V-01',
        line, column,
        detail: 'JSON 语法错误：' + e.message,
      },
    };
  }
}

/** 主校验：返回 { errors: [], warnings: [], tree, stats } */
function validate(root) {
  const errors = [];
  const warnings = [];
  const stats = { nodeCount: 0, attrCount: 0, maxDepth: 0 };
  const seenCodes = new Map(); // code -> path

  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    errors.push({ rule: 'V-11', path: '$', detail: '根节点必须是对象，且包含 schemaVersion 与 category' });
    return { errors, warnings, stats };
  }

  // V-02：规范版本
  if (root.schemaVersion == null) {
    errors.push({ rule: 'V-02', path: 'schemaVersion', detail: '缺少 schemaVersion，当前支持版本：' + SUPPORTED_VERSIONS.join('、') });
  } else if (!SUPPORTED_VERSIONS.includes(String(root.schemaVersion))) {
    errors.push({ rule: 'V-02', path: 'schemaVersion', detail: `不支持的 schemaVersion「${root.schemaVersion}」，当前支持：${SUPPORTED_VERSIONS.join('、')}` });
  }

  // V-11：category 必填
  if (!root.category || typeof root.category !== 'object') {
    errors.push({ rule: 'V-11', path: 'category', detail: '缺少 category 根品类节点' });
    return { errors, warnings, stats };
  }

  const visitedInStack = new Set(); // V-10 循环引用检测

  function walk(node, path, depth, inheritedAttrCodes) {
    if (depth > MAX_DEPTH) {
      errors.push({ rule: 'V-05', path, detail: `品类树深度超过 ${MAX_DEPTH} 层限制` });
      return;
    }
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    stats.nodeCount += 1;
    if (stats.nodeCount > MAX_NODES) {
      errors.push({ rule: 'V-12', path, detail: `品类节点总数超过 ${MAX_NODES} 限制` });
      return;
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push({ rule: 'V-11', path, detail: '品类节点必须是对象' });
      return;
    }

    // V-10：循环引用（对象引用层面）
    if (visitedInStack.has(node)) {
      errors.push({ rule: 'V-10', path, detail: '品类树存在循环引用' });
      return;
    }
    visitedInStack.add(node);

    // V-11 / V-04：code
    if (node.code == null || String(node.code).trim() === '') {
      errors.push({ rule: 'V-11', path: path + '.code', detail: '品类缺少非空 code' });
    } else {
      const code = String(node.code);
      if (!CODE_RE.test(code)) {
        errors.push({ rule: 'V-04', path: path + '.code', detail: `品类编码「${code}」不符合 ^[A-Z][A-Z0-9_]{1,63}$ 格式` });
      }
      if (seenCodes.has(code)) {
        errors.push({ rule: 'V-03', path: path + '.code', detail: `品类编码重复：「${code}」已出现在 ${seenCodes.get(code)}` });
      } else {
        seenCodes.set(code, path + '.code');
      }
    }

    // V-11：name
    if (node.name == null || String(node.name).trim() === '') {
      errors.push({ rule: 'V-11', path: path + '.name', detail: '品类缺少非空 name' });
    } else if (String(node.name).length > 64) {
      errors.push({ rule: 'V-11', path: path + '.name', detail: '品类名称超过 64 字符限制' });
    }

    if (node.sort != null && !Number.isInteger(node.sort)) {
      errors.push({ rule: 'V-11', path: path + '.sort', detail: 'sort 必须为整数' });
    }

    // 属性校验
    const localAttrCodes = new Set();
    if (node.attributes != null) {
      if (!Array.isArray(node.attributes)) {
        errors.push({ rule: 'V-11', path: path + '.attributes', detail: 'attributes 必须为数组' });
      } else {
        node.attributes.forEach((attr, i) => {
          const ap = `${path}.attributes[${i}]`;
          stats.attrCount += 1;
          if (stats.attrCount > MAX_ATTRS) {
            errors.push({ rule: 'V-12', path: ap, detail: `属性总数超过 ${MAX_ATTRS} 限制` });
            return;
          }
          if (!attr || typeof attr !== 'object') {
            errors.push({ rule: 'V-11', path: ap, detail: '属性必须是对象' });
            return;
          }
          if (!attr.code || String(attr.code).trim() === '') {
            errors.push({ rule: 'V-11', path: ap + '.code', detail: '属性缺少非空 code' });
          } else if (!CODE_RE.test(String(attr.code))) {
            errors.push({ rule: 'V-04', path: ap + '.code', detail: `属性编码「${attr.code}」不符合 ^[A-Z][A-Z0-9_]{1,63}$ 格式` });
          }
          if (!attr.name || String(attr.name).trim() === '') {
            errors.push({ rule: 'V-11', path: ap + '.name', detail: '属性缺少非空 name' });
          }
          // V-07 数据类型白名单
          if (!attr.dataType || !DATA_TYPES.includes(attr.dataType)) {
            errors.push({ rule: 'V-07', path: ap + '.dataType', detail: `dataType「${attr.dataType}」不在白名单 ${DATA_TYPES.join('/')} 内` });
          }
          // V-08 枚举完备性
          if (ENUM_TYPES.includes(attr.dataType)) {
            if (!Array.isArray(attr.options) || attr.options.length === 0) {
              errors.push({ rule: 'V-08', path: ap + '.options', detail: `${attr.dataType} 类型必须提供非空 options 枚举列表` });
            }
          }
          // V-09 数值区间合法性
          if (attr.range != null) {
            const bad = !Array.isArray(attr.range) || attr.range.length !== 2 ||
              typeof attr.range[0] !== 'number' || typeof attr.range[1] !== 'number' ||
              attr.range[0] > attr.range[1];
            if (bad) {
              errors.push({ rule: 'V-09', path: ap + '.range', detail: 'range 必须为 [min, max] 且 min <= max' });
            } else if (!NUMERIC_TYPES.includes(attr.dataType)) {
              warnings.push({ rule: 'V-09', path: ap + '.range', detail: '非数值型属性设置了 range，已忽略' });
            }
          }
          // V-06 属性编码唯一性
          if (attr.code) {
            if (localAttrCodes.has(attr.code)) {
              errors.push({ rule: 'V-06', path: ap + '.code', detail: `同一品类内属性编码重复：「${attr.code}」` });
            } else {
              localAttrCodes.add(attr.code);
            }
            if (inheritedAttrCodes.has(attr.code)) {
              warnings.push({ rule: 'V-06', path: ap + '.code', detail: `属性「${attr.code}」与继承自父品类的属性编码冲突，视为覆盖意图` });
            }
          }
        });
      }
    }

    // 子品类
    if (node.children != null) {
      if (!Array.isArray(node.children)) {
        errors.push({ rule: 'V-11', path: path + '.children', detail: 'children 必须为数组' });
      } else {
        const inherited = new Set(inheritedAttrCodes);
        if (Array.isArray(node.attributes)) {
          node.attributes.forEach((a) => { if (a && a.code) inherited.add(a.code); });
        }
        node.children.forEach((child, i) => walk(child, `${path}.children[${i}]`, depth + 1, inherited));
      }
    }

    visitedInStack.delete(node);
  }

  walk(root.category, 'category', 1, new Set());

  return { errors, warnings, stats };
}

/** 构建品类树（含继承后的完整属性集） */
function buildTree(rootCategory, idStart) {
  let autoId = idStart || 1;
  function rec(node, parentId, level, parentAttrs) {
    const ownAttrs = Array.isArray(node.attributes) ? node.attributes : [];
    // 继承：父级有效属性（标记 inherited=true）+ 本级属性（本级同名视为覆盖）
    const attrMap = new Map();
    (parentAttrs || []).forEach((a) => { if (a && a.code) attrMap.set(a.code, Object.assign({ inherited: true }, a)); });
    ownAttrs.forEach((a) => { if (a && a.code) attrMap.set(a.code, Object.assign({ inherited: false }, a)); });
    const effectiveAttrs = Array.from(attrMap.values());
    const childInherit = effectiveAttrs;

    const id = autoId++;
    const children = Array.isArray(node.children) ? node.children : [];
    const tree = {
      id,
      code: node.code,
      name: node.name,
      sort: node.sort || 0,
      parentId: parentId || null,
      level,
      path: (parentId ? '' : '') + '/' + node.code,
      isLeaf: children.length === 0,
      ownAttributes: ownAttrs.map((a) => Object.assign({ inherited: false }, a)),
      attributes: effectiveAttrs,
    };
    tree.children = children
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((c) => rec(c, id, level + 1, childInherit));
    return tree;
  }
  const t = rec(rootCategory, null, 1, []);
  // 计算完整 path
  (function fix(n, parentPath) {
    n.path = parentPath + '/' + n.code;
    n.children.forEach((c) => fix(c, n.path));
  })(t, '');
  return t;
}

/** 扁平化品类树 */
function flatten(tree, acc) {
  acc = acc || [];
  acc.push(tree);
  tree.children.forEach((c) => flatten(c, acc));
  return acc;
}

/** FR-09：依据属性 Schema 生成动态商品发布表单描述 */
function buildFormSchema(tree) {
  const fields = tree.attributes.map((a) => {
    const f = {
      field: a.code,
      label: a.name,
      type: a.dataType,
      required: !!a.required,
      inherited: !!a.inherited,
      placeholder: '',
    };
    if (a.unit) f.unit = a.unit;
    if (a.options) f.options = a.options;
    if (a.range) { f.min = a.range[0]; f.max = a.range[1]; }
    if (a.dataType === 'multiEnum') { f.multiple = true; }
    if (a.dataType === 'image') { f.placeholder = '粘贴图片 URL 或上传素材'; }
    return f;
  });
  const groups = [
    { group: '基础信息', fields: [
      { field: 'title', label: '商品标题', type: 'string', required: true },
      { field: 'mainImage', label: '主图', type: 'image', required: false },
      { field: 'subtitle', label: '副标题/卖点', type: 'string', required: false },
    ] },
    { group: '品类属性（由品类 Schema 动态生成）', fields },
    { group: 'SKU 与价格', fields: [
      { field: 'skuSpecs', label: '销售规格', type: 'skuMatrix', required: true },
    ] },
  ];
  return {
    categoryId: tree.id,
    categoryCode: tree.code,
    categoryName: tree.name,
    schemaVersion: '1.0',
    fieldCount: fields.length,
    fields,
    groups,
  };
}

/** FR-10：依据 filterable / searchable 属性生成检索与筛选索引映射 */
function buildIndexMapping(tree) {
  const indexFields = [];
  tree.attributes.forEach((a) => {
    if (a.searchable) indexFields.push({ field: a.code, type: 'text', purpose: 'fulltext', mappedFrom: a.dataType });
    if (a.filterable) {
      const t = NUMERIC_TYPES.includes(a.dataType) ? 'range'
        : (ENUM_TYPES.includes(a.dataType) ? 'keyword' : (a.dataType === 'boolean' ? 'keyword' : 'keyword'));
      indexFields.push({ field: a.code, type: t, purpose: 'filter', mappedFrom: a.dataType, options: a.options || null });
    }
  });
  return {
    indexName: 'idx_product_' + tree.code.toLowerCase(),
    categoryCode: tree.code,
    fieldCount: indexFields.length,
    fields: indexFields,
    analyzer: 'ik_smart',
    syncStatus: 'synced',
  };
}

module.exports = {
  syntaxCheck, validate, buildTree, flatten, buildFormSchema, buildIndexMapping,
  DATA_TYPES, SUPPORTED_VERSIONS, CODE_RE,
};

}, "/src");
__def("/src/auth.js", function (module, exports, require, __dirname, __filename) {
'use strict';
/**
 * auth.js — 鉴权与权限（FR-26）
 * scrypt 口令散列 + HMAC 签名访问令牌；角色/菜单/数据范围三级权限。
 */
const crypto = require('crypto');

const SECRET = process.env.AIECP_SECRET || 'aiecp-2026-signing-key-do-not-change';
const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32).toString('hex');
  return s + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function signToken(payload) {
  const body = Object.assign({ iat: Date.now(), exp: Date.now() + TOKEN_TTL }, payload);
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  return p + '.' + sig;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [p, sig] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  if (sig !== expect) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/** 角色 → 权限矩阵（菜单级 + 数据范围） */
const ROLE_PERMISSIONS = {
  consumer: {
    label: '消费者',
    dataScope: 'self',
    menus: ['mall', 'cart', 'orders', 'ai_assistant', 'profile'],
  },
  merchant: {
    label: '商家',
    dataScope: 'own_shop',
    menus: ['mall', 'cart', 'orders', 'merchant_category', 'merchant_product', 'merchant_inventory', 'merchant_order', 'ai_assistant', 'profile'],
  },
  admin: {
    label: '平台管理员',
    dataScope: 'all',
    menus: ['mall', 'cart', 'orders', 'merchant_category', 'merchant_product', 'merchant_inventory',
      'console_dashboard', 'console_users', 'console_promotion', 'console_ai', 'console_knowledge', 'console_audit', 'ai_assistant', 'profile'],
  },
};

function permissionsOf(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.consumer;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, ROLE_PERMISSIONS, permissionsOf };

}, "/src");
__def("/src/ai/customerService.js", function (module, exports, require, __dirname, __filename) {
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

}, "/src/ai");
__def("/src/ai/llm.js", function (module, exports, require, __dirname, __filename) {
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

}, "/src/ai");
__def("/src/ai/selection.js", function (module, exports, require, __dirname, __filename) {
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

}, "/src/ai");
__def("/src/ai/bundle.js", function (module, exports, require, __dirname, __filename) {
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

}, "/src/ai");

// ------------------------------------------------------------------ 启动
try {
  __require('/server.js');
} catch (e) {
  globalThis.__AIECP_BOOT_ERROR__ = e;
  if (globalThis.console) console.error('[AI-ECP] 静态服务启动失败：', e);
}
globalThis.__AIECP_REQUIRE__ = __require;
globalThis.AIECP_READY = !globalThis.__AIECP_BOOT_ERROR__;
})();
