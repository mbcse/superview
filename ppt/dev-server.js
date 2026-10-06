const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const root = __dirname;
const preferred = Number(process.env.PORT || 4173);
const extra = Number(process.env.EXTRA_PORT || 3300);
const clients = new Set();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

const reloadSnippet = `
<script>
(() => {
  const source = new EventSource('/__live-reload');
  source.onmessage = (event) => {
    if (event.data === 'reload') window.location.reload();
  };
})();
</script>`;

function safePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const filePath = path.normalize(path.join(root, decoded === '/' ? 'index.html' : decoded));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

function sendReload() {
  for (const client of clients) {
    client.write('data: reload\n\n');
  }
}

function createServer() {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);

    if (parsed.pathname === '/__live-reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    const filePath = safePath(parsed.pathname);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath);
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');

      if (ext === '.html') {
        const html = data.toString().replace('</body>', `${reloadSnippet}\n</body>`);
        res.end(html);
        return;
      }

      res.end(data);
    });
  });

  server.on('error', (error) => {
    console.error(error.message);
  });

  return server;
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', reject);
      console.log(`SuperView deck: http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

let reloadTimer;
fs.watch(root, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (filename.includes('node_modules') || filename === 'dev-server.js') return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(sendReload, 120);
});

(async () => {
  const ports = [...new Set([preferred, extra])];
  let started = 0;
  for (const port of ports) {
    try {
      await listen(port);
      started += 1;
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is in use, skipping`);
        continue;
      }
      throw error;
    }
  }
  if (!started) {
    console.error('Could not bind any port. Set PORT=4173 and retry.');
    process.exit(1);
  }
})();
