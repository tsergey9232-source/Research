const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7790;
const HTML = path.join(__dirname, 'index.html');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Find latest run folder
function findLatestRun() {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const runs = fs.readdirSync(RESULTS_DIR)
    .filter(d => fs.statSync(path.join(RESULTS_DIR, d)).isDirectory())
    .sort()
    .reverse();
  return runs.length ? runs[0] : null;
}

// Read agent log file
function readAgentLog(run, agentId) {
  if (!run) return null;
  const logPath = path.join(RESULTS_DIR, run, 'logs', `agent-${agentId}.log`);
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, 'utf8');
}

// Get all agent statuses for a run
function getAllAgentStatuses(run) {
  if (!run) return {};
  const logsDir = path.join(RESULTS_DIR, run, 'logs');
  if (!fs.existsSync(logsDir)) return {};

  const statuses = {};
  const files = fs.readdirSync(logsDir).filter(f => f.startsWith('agent-') && f.endsWith('.log'));

  files.forEach(f => {
    const rawId = f.replace('agent-', '').replace('.log', '');
    // Normalize: jury-01-startaper → jury-01 (strip name suffix after number)
    const agentId = rawId.replace(/^([a-z]+-\d+)-[a-z-]+$/, '$1');
    const filePath = path.join(logsDir, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const isDone = lines.some(l => l.includes('DONE') || l.includes('✅'));
    const hasError = lines.some(l => l.includes('ERROR') || l.includes('❌'));

    // Check if file was recently modified (within last 5 minutes)
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const isRecent = ageMs < 5 * 60 * 1000; // 5 minutes

    // Find output file link — ignore truncated paths with "..."
    let outputFile = null;
    for (const line of [...lines].reverse()) {
      const m = line.match(/\[FILE:([^\]]+)\]/);
      if (m && !m[1].includes('...')) { outputFile = m[1]; break; }
    }

    // Status logic:
    // - done: has DONE/✅ marker
    // - error: has ERROR/❌ and not done
    // - active: no done marker, file changed in last 5 min
    // - stale: no done marker, file not changed in 5+ min (agent died/stuck)
    let status;
    if (isDone) status = 'done';
    else if (hasError) status = 'error';
    else if (isRecent) status = 'active';
    else status = 'stale';

    statuses[agentId] = {
      status,
      lines: lines.slice(-50), // last 50 lines for popup
      outputFile,
      lineCount: lines.length,
      ageMinutes: Math.floor(ageMs / 60000)
    };
  });

  return statuses;
}

// Read pipeline log
function readPipelineLog(run) {
  if (!run) return null;
  const logPath = path.join(RESULTS_DIR, run, 'logs', 'pipeline-log.md');
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, 'utf8');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Serve index
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(HTML, 'utf8'));
    return;
  }

  // List runs
  if (req.url === '/api/runs') {
    if (!fs.existsSync(RESULTS_DIR)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }
    const runs = fs.readdirSync(RESULTS_DIR)
      .filter(d => fs.statSync(path.join(RESULTS_DIR, d)).isDirectory())
      .sort().reverse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runs));
    return;
  }

  // All agent statuses (bulk — one request instead of 55)
  if (req.url === '/api/agents' || req.url.startsWith('/api/agents?')) {
    const params = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
    const run = params.get('run') || findLatestRun();
    const statuses = getAllAgentStatuses(run);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ run, agents: statuses, ts: Date.now() }));
    return;
  }

  // Single agent log
  if (req.url.startsWith('/api/agent?')) {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const run = params.get('run') || findLatestRun();
    const agentId = params.get('id');
    if (!agentId) { res.writeHead(400); res.end('{}'); return; }

    const log = readAgentLog(run, agentId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ log, run }));
    return;
  }

  // Pipeline log
  if (req.url === '/api/pipeline' || req.url.startsWith('/api/pipeline?')) {
    const params = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
    const run = params.get('run') || findLatestRun();
    const log = readPipelineLog(run);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ run, log, status: log ? 'ok' : 'no_log' }));
    return;
  }

  // Serve file content
  if (req.url.startsWith('/api/file?')) {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const filePath = params.get('path');
    if (!filePath || !filePath.startsWith('/Users/crabe/.openclaw/workspace/research-lab/')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`🦀 Office Dashboard: http://localhost:${PORT}`));
