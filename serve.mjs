import http from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.argv[2] || 8090);
const prefix = process.argv[3] || '/';
if (!/^\/(?:[\w-]+\/)*$/.test(prefix)) throw new Error('Use a path such as /MetalSlug-webport/.');
const dist = new URL('./dist/', import.meta.url);
const types = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  wasm: 'application/wasm',
  data: 'application/octet-stream',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json',
  png: 'image/png',
};

http.createServer(async (request, response) => {
  const path = (request.url || '/').split('?')[0];
  if (!path.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const name = path.slice(prefix.length) || 'index.html';
  const type = types[name.split('.').pop()];
  if (!['GET', 'HEAD'].includes(request.method) || !type || !/^[a-zA-Z0-9_-]+\.[a-z]+$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(name, dist));
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log('Metal Slug Web: http://127.0.0.1:' + port + prefix));
