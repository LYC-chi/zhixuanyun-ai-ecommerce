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
