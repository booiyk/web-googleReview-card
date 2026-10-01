/* Server statis untuk membandingkan versi sebelum & sesudah.
   Dipakai oleh test-perf / ablate lewat env TARGET. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = process.argv[2] || '.';
const port = Number(process.argv[3] || 8899);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    let p = join(root, decodeURIComponent(req.url.split('?')[0]));
    if ((await stat(p).catch(() => null))?.isDirectory()) p = join(p, 'index.html');
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`serving ${root} → http://localhost:${port}`));
