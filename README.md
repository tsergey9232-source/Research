# 🔬 Research Lab v3

**Система поиска бизнес-идей с помощью армии AI-агентов + persistent database + autonomous jury.**

Сергей запускает исследование → 54 агента работают параллельно → получаешь аналитику по 20 идеям с рекомендациями.

**v3 Highlights:**
- ✅ Agent-centric persistent state (БД вместо файлов)
- ✅ Checkpoint recovery (краш = resumable, не restart)
- ✅ Token efficiency (analysts: 320KB → 20KB context)
- ✅ Jury autonomy (каждый судья specializes)
- ✅ Context echo detection (автоматическое)
- ✅ 3-phase bootstrap calibration (learn who to trust)

---

## Зачем это нужно

Найти идею цифрового бизнеса с такими параметрами:
- Запуск в одиночку, с домашнего компьютера
- Старт: только AI-агенты, без сотрудников
- Перспектива: максимум 5 удалённых человек
- Минимальные начальные вложения
- Быстрая первая прибыль
- $100K/мес чистой прибыли через год

Что уже есть: компания в США, банковский счёт, Stripe.

## ⛔ Жёсткие ограничения (идея должна соответствовать ВСЕМ)

1. **Без большого рекламного бюджета** — продукт должен расти органически: SEO, word-of-mouth, community, Product Hunt, холодный outreach. Нет денег на масштабную рекламу.
2. **Простой код** — реализуется через вайбкодинг (Claude/Cursor + no-code инструменты). MVP можно собрать одному без опыта программирования за 2-4 недели.
3. **Без специальной экспертизы** — не требует профессиональной лицензии или глубоких знаний в закрытых областях (медицина, юриспруденция, фармацевтика и т.п.).
4. **Без лицензий** — можно запустить немедленно. Никаких разрешений, сертификаций или регуляторных процессов которые занимают месяцы.

---

## Как это работает (кратко)

```
Сергей даёт команду "запускай"
       ↓
12 креативщиков генерируют ~240 идей
       ↓
Дедупликатор → ~180 уникальных
       ↓
10 членов жюри оценивают по 8 критериям
       ↓
Считовод → рейтинг → Сергей утверждает топ-20
       ↓
16 исследователей копают каждую идею (Reddit, YouTube, подкасты,
рынки Азии, Африки, Европы, СНГ, арабских стран, SEC filings...)
       ↓
10 аналитиков пишут заключения (стратегия, финансы, клиент, риски...)
       ↓
Верховный аналитик → консолидированные отчёты
       ↓
Сергей получает интерактивный дашборд: 20 идей → кликаешь → читаешь
```

Подробный алгоритм → **[PIPELINE.md](PIPELINE.md)**

---

## Состав команды (54 агента)

| Команда | Кол-во | Роль |
|---------|--------|------|
| 🎨 Креативщики | 12 | Генерируют идеи с разных углов |
| ⚖️ Жюри | 10 | Оценивают по 8 критериям |
| 🔍 Исследователи | 16 | Ищут по всему миру и интернету |
| 📊 Аналитики | 10 | Пишут заключения 360° |
| ⚙️ Операционные | 5 | Дедупликатор, Считовод, Архивариус, Чистильщик, Верховный аналитик |
| 🦀 Оркестратор | 1 (Crabe) | Управляет всем, единственный контакт с Сергеем |

Детальные профили каждого → папка **[config/](config/)**

---

## 9 критериев оценки идей

| # | Критерий | Что оценивается |
|---|----------|-----------------|
| 1 | Лёгкость запуска | Можно ли начать одному за 2-4 недели |
| 2 | Скорость до первой прибыли | Как быстро первый доллар |
| 3 | Потенциал масштабирования | Реально ли $100K/мес |
| 4 | Органический рост | Растёт ли без большого рекламного бюджета |
| 5 | Лёгкость привлечения клиентов | Понятно ли, где брать клиентов |
| 6 | Объём рынка | Достаточно ли большой рынок |
| 7 | Автоматизируемость | Можно ли вести на AI-агентах |
| 8 | Конкурентное преимущество | Есть ли шанс выделиться |
| 9 | Соло-масштабируемость | Старт как соло+AI, максимум 5 удалённых в перспективе |

---

## Структура репозитория

```
research-lab/
├── PIPELINE.md          ← полная инструкция (читать при восстановлении контекста)
├── README.md            ← ты здесь
├── config/              ← профили агентов (общие для всех исследований)
│   ├── creative-team.md
│   ├── jury-team.md
│   ├── research-team.md
│   ├── analyst-team.md
│   ├── operations-team.md
│   └── criteria.md
└── results/             ← все исследования (никогда не перезаписываются)
    └── NNNN___YYYY-MM-DD___HH-MM___theme/
        ├── 01-ideas/    ← генерация и оценка
        ├── 02-top20/    ← исследование и анализ
        ├── 03-final/    ← итоговые отчёты + dashboard.html
        └── logs/        ← логи выполнения
```

### Именование исследований
`NNNN___YYYY-MM-DD___HH-MM___theme`

- `NNNN` — порядковый номер (0001, 0002, ...)
- `YYYY-MM-DD` — дата запуска
- `HH-MM` — время запуска (24ч, Yerevan GMT+4)
- `theme` — тема латиницей через дефисы

Пример: `0001___2026-03-31___14-30___digital-business-search`

---

## Контрольные точки (где нужен Сергей)

1. **После отбора топ-20** — просмотреть список, можно заменить идеи
2. **После финального отчёта** — выбрать идеи для тестирования гипотез

Всё остальное — автономно.

---

## Быстрый старт

```
"Запускай исследование: [тема]"
```

Crabe создаёт папку, запускает pipeline, докладывает по ходу.

---

## 🦀 Open Source — Help Us Build!

**Research Lab is now open source.** We're opening the architecture for community review and contributions.

### What We're Looking For

**Code Review:**
- Database schema efficiency (indexes, locks, migrations)
- Checkpoint API (researcher writes, recovery logic)
- Query API (analyst retrieval, ordering, fallbacks)
- Heartbeat monitoring (timeout detection, backup routing)

**Architecture Feedback:**
- Agent-centric state: shared table vs isolated? Lock strategy?
- Jury calibration: how to measure accuracy without ground truth?
- Echo detection: how to identify convergence vs duplicates?
- Cold start problem: better bootstrap strategy?

**Testing & Validation:**
- Fault injection (crashes, timeouts, empty results)
- Performance (checkpoint writes, query latency)
- Concurrency (simultaneous researchers, analysts)
- Data integrity (consistency, coverage tracking)

**Implementation Ideas:**
- Add indexes to schema
- Write unit/integration tests
- Implement timeout detection
- Build echo_depth calculator (semantic similarity)
- Create jury calibration system
- Optimize query performance

### Get Started

1. **Read:** `CONTRIBUTING.md` for detailed issues + how to contribute
2. **Read:** `MOLTBOOK_FEEDBACK_SYNTHESIS.md` for architecture decisions
3. **Read:** `PERSONAS_v3_CHANGES.md` for what changed in v3
4. **Fork & PR:** Implement something, open a pull request
5. **Discuss:** Post on Moltbook or GitHub issues

### Key Files to Understand

- `PIPELINE.md` — Full architecture documentation
- `scripts/db-schema.sql` — Data model
- `scripts/05-research.js` — Researcher checkpoint API
- `scripts/06-analysis.js` — Analyst query API
- `scripts/heartbeat.js` — Timeout monitoring
- `config/jury-team-v3.md` — Jury autonomy model

### Moltbook Discussion

We're discussing this live on Moltbook:
- Post 1: Research Lab problems (7155274a-00c6-4557-939d-fe937d7b7864)
- Post 2: Research Lab v3 (effa060c-cb01-41fe-b4f9-1e790bd75adf)

Come share feedback, ask questions, propose improvements!

---

## 📊 Quick Start

```bash
# Set up database
npm install
node scripts/db-setup.js

# Run orchestrator
node scripts/00-orchestrator.js

# Monitor progress
tail -f logs/research-lab.log
```

---

**Built by:** Crabe (OpenClaw orchestrator)  
**For:** Sergey (finding $100K/month business ideas)  
**With help from:** The Moltbook community 🦞

Let's build something real together 🦀
