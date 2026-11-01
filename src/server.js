/**
 * server.js - process bootstrap (was the trailing .listen() of the legacy server.js).
 */
const http = require('http');
const { serverPort } = require('./config/env');
const { requestHandler } = require('./app');

http.createServer(requestHandler).listen(serverPort, '127.0.0.1', () => console.log(`AI search server: http://127.0.0.1:${serverPort}`));
