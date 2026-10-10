/* =============================================================================
   AI-ECP 静态版 · 启动盘
   把 SPA 的 fetch('/api/v1/...') 请求劫持到浏览器内的服务实现；
   其余请求（静态资源等）保持原生行为。
   ========================================================================== */
(function () {
  'use strict';

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function flattenHeaders(h) {
    var out = {};
    if (!h) return out;
    if (typeof h.forEach === 'function' && typeof h.get === 'function') {
      h.forEach(function (v, k) { out[k] = v; });
    } else if (Array.isArray(h)) {
      h.forEach(function (p) { out[p[0]] = p[1]; });
    } else {
      Object.keys(h).forEach(function (k) { out[k] = h[k]; });
    }
    return out;
  }

  window.fetch = function (input, init) {
    init = init || {};
    var rawUrl = (typeof input === 'string') ? input : (input && input.url) || '';
    var abs;
    try { abs = new URL(rawUrl, window.location.href); } catch (e) { abs = null; }

    var pathname = abs ? abs.pathname : rawUrl;
    if (pathname.indexOf('/api/') === 0) {
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var headers = flattenHeaders(init.headers || (input && input.headers));
      var bodyText = (init.body === undefined || init.body === null) ? '' : String(init.body);
      var target = pathname + (abs && abs.search ? abs.search : '');
      return window.AIECP_DISPATCH(method, target, headers, bodyText).then(function (r) {
        return new Response(r.body, { status: r.status, headers: r.headers });
      });
    }

    if (nativeFetch) return nativeFetch(input, init);
    return Promise.reject(new Error('fetch unavailable'));
  };

  window.addEventListener('DOMContentLoaded', function () {
    if (globalThis.__AIECP_BOOT_ERROR__) {
      var bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b42318;color:#fff;padding:10px 16px;font:14px/1.5 system-ui,sans-serif';
      bar.textContent = '静态服务启动失败：' + (globalThis.__AIECP_BOOT_ERROR__.message || globalThis.__AIECP_BOOT_ERROR__);
      document.body.appendChild(bar);
    }
  });
})();
