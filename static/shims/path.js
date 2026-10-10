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
