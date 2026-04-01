const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7788;
const LOG_DIR = path.join(__dirname, '..', 'results');
const STATIC_DIR = __dirname;

function findLatestLog() {
  if (!fs.existsSync(LOG_DIR)) return null;
  const runs = fs.readdirSync(LOG_DIR)
    .filter(d => fs.statSync(path.join(LOG_DIR, d)).isDirectory())
    .sort()
    .reverse();
  if (!runs.length) return null;
  const logPath = path.join(LOG_DIR, runs[0], 'logs', 'pipeline-log.md');
  return { run: runs[0], path: logPath };
}

function readLog(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/') {
    const html = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.url === '/api/log') {
    const latest = findLatestLog();
    if (!latest) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ run: null, log: null, status: 'no_runs' }));
      return;
    }
    const log = readLog(latest.path);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      run: latest.run,
      log: log,
      status: log ? 'ok' : 'no_log',
      ts: new Date().toISOString()
    }));
    return;
  }

  // /api/agent-log?run=XXX&agent=YYY
  if (req.url.startsWith('/api/agent-log?')) {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const run = params.get('run'), agent = params.get('agent');
    if (!run || !agent) { res.writeHead(400); res.end('{}'); return; }
    const logPath = path.join(LOG_DIR, run, 'logs', `agent-${agent}.log`);
    const filesDir = path.join(LOG_DIR, run);
    let log = null, files = [];
    if (fs.existsSync(logPath)) log = fs.readFileSync(logPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ log, files }));
    return;
  }

  // /api/final?run=XXX
  if (req.url.startsWith('/api/final?run=')) {
    const run = decodeURIComponent(req.url.split('?run=')[1]);
    const summaryPath = path.join(LOG_DIR, run, '03-final', 'executive-summary.md');
    let content = null;
    if (fs.existsSync(summaryPath)) content = fs.readFileSync(summaryPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
    return;
  }

  // /file?path=XXX — показать файл
  if (req.url.startsWith('/file?path=')) {
    const filePath = decodeURIComponent(req.url.split('?path=')[1]);
    if (!filePath.startsWith('/Users/crabe/.openclaw/workspace/research-lab/results/')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

  if (req.url === '/api/runs') {
    if (!fs.existsSync(LOG_DIR)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }
    const runs = fs.readdirSync(LOG_DIR)
      .filter(d => fs.statSync(path.join(LOG_DIR, d)).isDirectory())
      .sort().reverse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runs));
    return;
  }

  // /api/log?run=XXXX
  if (req.url.startsWith('/api/log?run=')) {
    const run = decodeURIComponent(req.url.split('?run=')[1]);
    const logPath = path.join(LOG_DIR, run, 'logs', 'pipeline-log.md');
    const log = readLog(logPath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ run, log, status: log ? 'ok' : 'no_log' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🦀 Research Lab Dashboard: http://localhost:${PORT}`);
});
