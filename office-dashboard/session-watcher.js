/**
 * session-watcher.js — следит за JSONL-сессиями OpenClaw и пишет
 * читаемые строки в activity.log в реальном времени.
 */

// (standalone process — no singleton guard needed here)

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
const SESSIONS_JSON = path.join(SESSIONS_DIR, 'sessions.json');
const ACTIVITY_LOG  = path.join(__dirname, '..', 'activity.log');

// ─── Человеческие описания tool calls ───────────────────────────────────────

// Возвращает читаемое описание файла по пути
function humanFile(f) {
  const base = path.basename(f);
  const rel  = f.replace(/.*workspace\//, '');
  // Специальные имена
  const known = {
    'SOUL.md':        'свою личность (SOUL.md)',
    'USER.md':        'профиль Сергея (USER.md)',
    'RULES.md':       'правила работы',
    'MEMORY.md':      'долгосрочную память',
    'AGENTS.md':      'инструкции рабочего стола',
    'TOOLS.md':       'заметки об инструментах',
    'HEARTBEAT.md':   'список задач для проверки',
    'activity.log':   'лог активности',
    'session-watcher.js': 'скрипт слежения за сессиями',
    'server.js':      'сервер монитора',
    'index.html':     'интерфейс дашборда',
    'pipeline-log.md':'лог пайплайна',
    'deduplicated.md':'список идей после дедупликации',
    'scored.md':      'итоговые оценки идей',
  };
  if (known[base]) return known[base];
  // По расширению и папке
  if (base.startsWith('jury-') && base.endsWith('.md')) {
    const who = base.replace('jury-','').replace('.md','').replace(/-/g,' ');
    return `оценки жюри (${who})`;
  }
  if (base.startsWith('creator-') && base.endsWith('.md')) return `сырые идеи (${base.replace('.md','')})`;
  if (rel.includes('scores/')) return `таблица оценок: ${base}`;
  if (rel.includes('logs/')) return `лог агента: ${base}`;
  if (rel.includes('prompts/')) return `промпт агента: ${base}`;
  if (rel.includes('memory/')) return `дневник памяти: ${base}`;
  if (rel.includes('config/')) return `конфиг: ${base}`;
  if (base.endsWith('.md')) return `документ: ${base}`;
  if (base.endsWith('.js')) return `скрипт: ${base}`;
  if (base.endsWith('.json')) return `данные: ${base}`;
  return base;
}

// Интерпретирует shell-команду в читаемое действие
function humanExec(cmd) {
  const c = cmd.trim().replace(/\s+/g, ' ');

  // Убийство процессов / перезапуск
  if (/^kill\b/.test(c) || /pkill|killall/.test(c)) {
    if (/monitor|server/.test(c)) return '🔄 Перезапускаю сервер монитора';
    if (/watcher/.test(c)) return '🔄 Перезапускаю watcher';
    return '🛑 Останавливаю процесс';
  }

  // Node запуск
  if (/node\s+.*server\.js/.test(c)) return '🚀 Запускаю сервер монитора';
  if (/node\s+.*session-watcher/.test(c)) return '🚀 Запускаю session watcher';
  if (/node\s+/.test(c)) return '🚀 Запускаю Node.js скрипт';

  // Проверка процессов
  if (/ps\s+aux/.test(c) && /grep/.test(c)) {
    const what = (c.match(/grep[^|]*"([^"]+)"/) || c.match(/grep\s+(\S+)/))?.[1] || '';
    if (/monitor|server/.test(what)) return '🔍 Проверяю, запущен ли монитор';
    if (/watcher/.test(what)) return '🔍 Проверяю статус watcher\'а';
    return '🔍 Смотрю список запущенных процессов';
  }
  if (/ps\s+aux/.test(c)) return '🔍 Смотрю список запущенных процессов';

  // curl / HTTP
  if (/curl/.test(c)) {
    const url = c.match(/https?:\/\/[^\s'"]+/)?.[0] || '';
    if (/api\/log/.test(url)) return '🌐 Проверяю лог через API';
    if (/api\/agents/.test(url)) return '🌐 Проверяю статусы агентов';
    if (/localhost/.test(url)) return '🌐 Проверяю локальный сервер';
    return `🌐 Делаю HTTP-запрос`;
  }

  // git
  if (/^git\s+status/.test(c)) return '📦 Смотрю статус git репозитория';
  if (/^git\s+add/.test(c))    return '📦 Добавляю файлы в git';
  if (/^git\s+commit/.test(c)) return '📦 Делаю git коммит';
  if (/^git\s+push/.test(c))   return '📦 Отправляю изменения в git';
  if (/^git\s+/.test(c))       return '📦 Выполняю git операцию';

  // npm / yarn / pip
  if (/npm\s+install|yarn\s+add|pip\s+install/.test(c)) return '📦 Устанавливаю зависимости';
  if (/npm\s+/.test(c)) return '📦 npm команда';

  // tail / head / cat / less
  if (/^tail\s/.test(c)) {
    const f = c.match(/(\S+\.(?:log|md|json|js|txt))\s*$/)?.[1];
    return f ? `📜 Читаю конец файла: ${path.basename(f)}` : '📜 Читаю конец файла';
  }
  if (/^cat\s/.test(c)) {
    const f = c.match(/cat\s+(\S+)/)?.[1] || '';
    return f ? `📖 Открываю файл: ${path.basename(f)}` : '📖 Читаю файл';
  }
  if (/^head\s/.test(c)) return '📜 Читаю начало файла';

  // ls
  if (/^ls\b/.test(c)) {
    const dir = c.match(/ls\s+(?:-[a-z]+\s+)?(\S+)/)?.[1] || '';
    if (dir.includes('sessions')) return '📂 Смотрю список сессий';
    if (dir.includes('scores'))   return '📂 Смотрю папку с оценками';
    if (dir.includes('logs'))     return '📂 Смотрю папку логов';
    return dir ? `📂 Смотрю папку: ${path.basename(dir)}` : '📂 Смотрю содержимое папки';
  }

  // mkdir / cp / mv / rm
  if (/^mkdir\s/.test(c))  return '📁 Создаю папку';
  if (/^cp\s/.test(c))     return '📋 Копирую файл';
  if (/^mv\s/.test(c))     return '📋 Перемещаю файл';
  if (/^rm\s/.test(c) || /^trash\s/.test(c)) return '🗑 Удаляю файл';

  // echo / printf → запись в файл
  if (/>>\s*\S+\.log/.test(c)) return '📝 Дописываю строку в лог';
  if (/echo\s/.test(c) && />>/.test(c)) return '📝 Добавляю запись в файл';

  // Python
  if (/python3?\s/.test(c)) {
    if (/json/.test(c)) return '🐍 Парсю JSON данные';
    return '🐍 Запускаю Python скрипт';
  }

  // wc / grep / find
  if (/^wc\s/.test(c))   return '🔢 Считаю строки в файлах';
  if (/^grep\s/.test(c)) return '🔍 Ищу текст в файлах';
  if (/^find\s/.test(c)) return '🔍 Ищу файлы';

  // sleep
  if (/^sleep\s/.test(c)) return '⏳ Жду секунду...';

  // Длинная цепочка — берём первую значимую часть
  const firstCmd = c.split(/&&|;|\|/)[0].trim();
  if (firstCmd !== c && firstCmd.length > 5) return humanExec(firstCmd);

  // Fallback — первые 60 символов
  return `⚡ ${c.slice(0, 60)}${c.length > 60 ? '…' : ''}`;
}

function describeToolCall(name, args) {
  switch (name) {

    case 'Read': {
      const f = args.file || args.filePath || args.file_path || args.path || '?';
      return `📖 Читаю: ${humanFile(f)}`;
    }

    case 'Write': {
      const f = args.file || args.filePath || args.file_path || args.path || '?';
      const kb = args.content ? ` (${Math.round(args.content.length / 1024 * 10) / 10} KB)` : '';
      return `✍️  Записываю: ${humanFile(f)}${kb}`;
    }

    case 'Edit': {
      const f = args.file || args.filePath || args.file_path || args.path || '?';
      const n = args.edits ? args.edits.length : 1;
      const suffix = n > 1 ? ` (${n} правок)` : '';
      return `✏️  Правлю: ${humanFile(f)}${suffix}`;
    }

    case 'exec': {
      const cmd = (args.command || '').trim();
      const bg  = args.background ? ' [в фоне]' : '';
      return humanExec(cmd) + bg;
    }

    case 'process': {
      const action = args.action || '?';
      const map = {
        list:        '📋 Проверяю список фоновых задач',
        poll:        '⏳ Жду завершения задачи...',
        log:         '📜 Читаю вывод фоновой задачи',
        write:       '📝 Отправляю данные в фоновую задачу',
        kill:        '🛑 Останавливаю фоновую задачу',
        'send-keys': '⌨️  Управляю терминалом',
        paste:       '📋 Вставляю текст в терминал',
      };
      return map[action] || `🔧 Управляю процессом (${action})`;
    }

    case 'web_search': {
      const q = (args.query || '').slice(0, 70);
      return `🔍 Ищу в интернете: «${q}»`;
    }

    case 'web_fetch': {
      const url = (args.url || '').replace(/^https?:\/\//, '').split('/')[0];
      return `🌐 Открываю сайт: ${url}`;
    }

    case 'image': {
      const src = args.image || (args.images && args.images[0]) || '?';
      return `🖼️  Смотрю на изображение: ${path.basename(src)}`;
    }

    case 'sessions_yield': {
      return `🔄 Жду пока субагент закончит работу...`;
    }

    default:
      return `🔧 Использую инструмент: ${name}`;
  }
}

function describeToolResult(name, args, resultText) {
  const ok = !resultText?.toLowerCase().includes('error') && !resultText?.includes('❌');
  switch (name) {
    case 'exec': {
      if (!resultText || resultText.trim() === '') return `   └─ готово (нет вывода)`;
      const hasError = /error|failed|No such|command not found/i.test(resultText);
      if (hasError) {
        const first = resultText.trim().split('\n')[0].slice(0, 80);
        return `   └─ ⚠️  Ошибка: ${first}`;
      }
      const lines = resultText.trim().split('\n').length;
      return lines === 1
        ? `   └─ ✓ ${resultText.trim().slice(0, 80)}`
        : `   └─ ✓ готово (${lines} строк вывода)`;
    }
    case 'Read': {
      const lines = (resultText || '').split('\n').length;
      return `   └─ ✓ прочитал ${lines} строк`;
    }
    case 'Write':
      return `   └─ ✓ файл сохранён`;
    case 'Edit':
      return `   └─ ✓ изменения применены`;
    case 'web_search': {
      const hits = (resultText || '').match(/Title:/g);
      return `   └─ ✓ нашёл ${hits ? hits.length : '?'} результатов`;
    }
    case 'web_fetch': {
      const len = resultText ? `${Math.round(resultText.length / 1024)} KB` : '?';
      return `   └─ ✓ страница загружена (${len})`;
    }
    default: {
      const short = (resultText || '').trim().slice(0, 80).replace(/\n/g, ' ');
      return short ? `   └─ ✓ ${short}` : null;
    }
  }
}

// ─── Лог-файл ────────────────────────────────────────────────────────────────

function appendLog(line) {
  const ts = new Date().toLocaleString('sv-SE').replace(' ', ' ').slice(0, 16);
  const entry = `[${ts}] ${line}\n`;
  fs.appendFileSync(ACTIVITY_LOG, entry);
}

// ─── Следилка за JSONL ───────────────────────────────────────────────────────

let currentFile  = null;
let currentSize  = 0;
let watchedFiles = new Set();

// Последние N строк — чтобы не обрабатывать файл заново при рестарте
const seenIds = new Set();

function processLine(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch { return; }

  if (obj.type !== 'message') return;

  const msg = obj.message;
  if (!msg) return;

  // toolCall — что делаю
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'toolCall') {
        const key = block.id;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        const desc = describeToolCall(block.name, block.arguments || {});
        appendLog(desc);
        // Запоминаем для result
        pendingCalls.set(block.id, { name: block.name, args: block.arguments || {} });
      }
      // Текстовый ответ — первое предложение / мысль
      if (block.type === 'text' && block.text && block.text.length > 10) {
        const key = `text-${obj.id}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        // Берём первое значимое предложение (не markdown-заголовки, не системные строки)
        const lines = block.text.trim().split('\n').map(l => l.trim())
          .filter(l => l.length > 5 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('```'));
        const first = lines[0] || block.text.trim();
        const preview = first.slice(0, 100);
        appendLog(`💬 ${preview}${first.length > 100 ? '…' : ''}`);
      }
    }
  }

  // toolResult — что получил
  if (msg.role === 'toolResult') {
    const key = `result-${msg.toolCallId}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);

    const pending = pendingCalls.get(msg.toolCallId);
    if (!pending) return;
    pendingCalls.delete(msg.toolCallId);

    const text = Array.isArray(msg.content)
      ? msg.content.map(c => c.text || '').join('\n')
      : (msg.content || '');

    const desc = describeToolResult(pending.name, pending.args, text);
    if (desc) appendLog(desc);
  }
}

const pendingCalls = new Map();

function tailFile(filePath) {
  if (currentFile === filePath) return; // уже следим
  currentFile = filePath;
  currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  appendLog(`🔌 Подключился к сессии: ${path.basename(filePath)}`);

  // Читаем хвост существующего файла (последние 64KB) чтобы загрузить seen IDs
  // без вывода в лог — просто чтобы не дублировать
  try {
    const stat = fs.statSync(filePath);
    const readFrom = Math.max(0, stat.size - 65536);
    const buf = Buffer.alloc(stat.size - readFrom);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, buf.length, readFrom);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'message' && obj.message) {
          const msg = obj.message;
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const b of msg.content) {
              if (b.type === 'toolCall') seenIds.add(b.id);
              if (b.type === 'text') seenIds.add(`text-${obj.id}`);
            }
          }
          if (msg.role === 'toolResult') seenIds.add(`result-${msg.toolCallId}`);
        }
      } catch {}
    }
    currentSize = stat.size;
  } catch {}

  // Следим за новыми данными
  fs.watch(filePath, (event) => {
    if (event !== 'change') return;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= currentSize) return;
      const delta = stat.size - currentSize;
      const buf = Buffer.alloc(delta);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, delta, currentSize);
      fs.closeSync(fd);
      currentSize = stat.size;
      const newText = buf.toString('utf8');
      const lines = newText.split('\n').filter(l => l.trim());
      for (const line of lines) processLine(line);
    } catch (e) {}
  });
}

// ─── Определяем активную сессию ──────────────────────────────────────────────

function findActiveSession() {
  // Самый свежий .jsonl без .deleted и .reset
  try {
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted') && !f.includes('.reset') && !f.includes('.lock'))
      .map(f => {
        try {
          return { f, mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    return files.length ? path.join(SESSIONS_DIR, files[0].f) : null;
  } catch { return null; }
}

// ─── Главный цикл ────────────────────────────────────────────────────────────

function tick() {
  const active = findActiveSession();
  if (active && active !== currentFile) {
    tailFile(active);
  }
}

appendLog('👁  Session Watcher запущен');
tick();
setInterval(tick, 5000); // проверяем смену сессии каждые 5 сек
