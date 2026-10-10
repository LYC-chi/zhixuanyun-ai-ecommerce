#!/usr/bin/env node
'use strict';
/**
 * build-static.js —— 把 Node 端源码打包为「纯静态」站点，产出到 docs/。
 *
 * 思路：不重写任何业务逻辑，而是：
 *   1) 为 fs / path / url / crypto / http 提供浏览器兼容层（static/shims）；
 *   2) 用一个迷你 CommonJS 加载器把 src/*.js 与 server.js 原样装进浏览器；
 *   3) 运行时分发器把 fetch('/api/v1/*') 转成 Node 风格的 (req, res)。
 * 这样静态站与动态服务共享同一套领域逻辑与 AI 能力，行为一致。
 *
 * 用法：node tools/build-static.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs');
const OUT_ASSETS = path.join(OUT_DIR, 'assets');

const BUILTINS = ['fs', 'path', 'url', 'crypto', 'http'];

function readRoot(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readAbs(abs) { return fs.readFileSync(abs, 'utf8'); }

// --------------------------------------------------------------------- 收集模块
const modules = new Map(); // id -> { src, dir }

function scanRequires(src, dir) {
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    if (spec.startsWith('.')) {
      let id = path.posix.normalize(path.posix.join(dir, spec));
      if (!id.startsWith('/')) id = '/' + id;
      if (!/\.js$/.test(id)) id += '.js';
      addModule(id);
    } else if (BUILTINS.indexOf(spec) < 0) {
      throw new Error(`未知的内置模块 "${spec}"，静态版暂不支持`);
    }
  }
}

function addModule(id) {
  if (modules.has(id)) return;
  const abs = path.join(ROOT, id.replace(/^\//, ''));
  if (!fs.existsSync(abs)) throw new Error('模块不存在：' + id);
  const src = readAbs(abs);
  const dir = path.posix.dirname(id);
  modules.set(id, { src, dir });
  scanRequires(src, dir);
}

addModule('/server.js');

// --------------------------------------------------------------------- 生成 vendor.js
const chunks = [];
chunks.push('/* 智选云 AI 电商在线售货系统 · 静态版运行时（自动生成，请勿手改） */');
chunks.push('(function () {');
chunks.push('var __ROOT__ = "/";');
chunks.push(readRoot('static/prelude.js'));
chunks.push(readRoot('static/runtime.js'));

BUILTINS.forEach((b) => {
  const src = readRoot(`static/shims/${b}.js`);
  chunks.push(`__def(${JSON.stringify(b)}, function (module, exports, require, __dirname, __filename) {\n${src}\n}, "/");`);
});

modules.forEach((info, id) => {
  chunks.push(`__def(${JSON.stringify(id)}, function (module, exports, require, __dirname, __filename) {\n${info.src}\n}, ${JSON.stringify(info.dir)});`);
});

chunks.push(`
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
`);

const vendorCode = chunks.join('\n');

// --------------------------------------------------------------------- 输出
// 说明：不整体删除输出目录（避免误删/受系统回收站策略影响），仅覆盖写入固定文件名。
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_ASSETS, { recursive: true });

fs.writeFileSync(path.join(OUT_ASSETS, 'vendor.js'), vendorCode, 'utf8');
fs.copyFileSync(path.join(ROOT, 'public/assets/app.css'), path.join(OUT_ASSETS, 'app.css'));
fs.copyFileSync(path.join(ROOT, 'public/assets/app.js'), path.join(OUT_ASSETS, 'app.js'));

// 启动盘：仅替换 fetch 入口，其余照搬
const bootSrc = readRoot('static/boot.js').replace(/^\/\* ={5,}[\s\S]*?={5,} \*\/\n/, '/* AI-ECP 静态版启动盘，请勿手改 */\n');
fs.writeFileSync(path.join(OUT_ASSETS, 'boot.js'), bootSrc, 'utf8');

// index.html：改为相对路径 + 注入 vendor/boot
let html = readRoot('public/index.html');
const before = html;
html = html.replace('href="/assets/app.css"', 'href="assets/app.css"');
html = html.replace(
  '<script src="/assets/app.js"></script>',
  '<script src="assets/vendor.js"></script>\n  <script src="assets/boot.js"></script>\n  <script src="assets/app.js"></script>'
);
if (html === before) throw new Error('index.html 资源引用未匹配，请检查 public/index.html 是否已改动');

// 静态版提示：Node 单端口服务改为浏览器内置服务
html = html.replace(
  '<span class="muted">Node.js 单端口服务 · JSON 自定义品类 · 智能客服 / 智能选品 / 智能组货</span>',
  '<span class="muted">静态版（GitHub Pages）· 浏览器内置服务 · JSON 自定义品类 · 智能客服 / 智能选品 / 智能组货</span>'
);

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '', 'utf8');

// --------------------------------------------------------------------- 汇报
const sizeKB = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('[build-static] 业务模块数:', modules.size);
modules.forEach((info, id) => console.log('  -', id, sizeKB(Buffer.byteLength(info.src, 'utf8'))));
console.log('[build-static] vendor.js:', sizeKB(Buffer.byteLength(vendorCode, 'utf8')));
console.log('[build-static] 输出目录:', path.relative(ROOT, OUT_DIR));
