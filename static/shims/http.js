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
