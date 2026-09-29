// Tiny static file server for local testing (service workers need http://localhost or https).
//   node tools/serve.js [dir=www] [port=5173]
// Add --host to listen on the LAN so a phone on the same Wi-Fi can open http://<pc-ip>:<port>
// (the service worker only registers on localhost/https, the game itself works either way).
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dir = path.resolve(__dirname, '..', args[0] || 'www');
const port = +(args[1] || 5173);
const host = process.argv.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8' };

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(dir, rel);
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, host, () => console.log(`serving ${path.relative(process.cwd(), dir) || '.'} at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
