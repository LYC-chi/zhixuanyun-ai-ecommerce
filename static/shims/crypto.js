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
