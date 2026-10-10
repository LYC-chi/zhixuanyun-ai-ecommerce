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
