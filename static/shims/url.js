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
