#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const root = path.resolve(process.cwd());
const port = Number.parseInt(process.env.DETONA_PREVIEW_PORT || '8765', 10);
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

function safePath(urlValue) {
  const pathname = decodeURIComponent(new URL(urlValue, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'course-drafts/pc-ba-2026-investigador/staging-bundle/preview.html' : pathname.slice(1);
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer(async (request, response) => {
  const filePath = safePath(request.url || '/');
  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Arquivo não encontrado.');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`DETONA_PREVIEW_READY http://127.0.0.1:${port}/\n`);
});
