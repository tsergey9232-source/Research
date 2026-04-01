# Research Lab v3 — Personas & Job Descriptions Updates

**Дата:** 1 апреля 2026  
**Версия:** 3.0 (Agent-Centric with Persistent State)

---

## 📋 Что изменилось в описаниях работы

### PERSONAS — Без изменений ✓

Все 16 исследователей, 10 судей, 10 аналитиков сохранили свои **характеры, экспертизу, углы анализа и слепые пятна**.

Их **персонажи** не меняются. Стартапер всё ещё нетерпелив. Финансист всё ещё холоден. Маркетолог всё ещё фокусируется на CAC.

### ТЗ (Job Description) — Полностью переписано

---

## 🔄 Research Team (Исследователи)

### Было (v2):
```
1. Получаешь список из 20 идей
2. Работаешь над каждой своим методом
3. В конце → пишешь отчёт в файл
4. Отчёт: находки, ссылки, выводы

Если краш → всё потеряется
```

### Теперь (v3):
```
1. Получаешь список из 20 идей
2. Работаешь над каждой своим методом
3. По мере работы → пишешь чекпойнты в БД
   
   INSERT researcher_checkpoints:
   - idea_id
   - researcher_id (ты)
   - task_name ("find market size")
   - result_text ("Market is $5B, growing 40% YoY")
   - evidence_sources: [URL1, URL2, citation]
   - confidence: 0.85
   - timestamp
   
4. Каждый claim → обязательно источник
5. На краш → partial results уже в БД, другой researcher может продолжить
6. Автоматически рассчитывается echo_depth (сколько других researchers нашли то же)

Преимущества для тебя:
✅ Zero data loss
✅ Backup researcher может продолжить твою работу
✅ Аналитики видят what you found + who found it
✅ Система автоматически детектирует context echo
```

**Key Changes in Job Description:**
- Write incrementally (per finding), not at the end
- Always include evidence sources (URL, quote, access date)
- confidence: 0.0-1.0 for each claim
- Handle DB write errors gracefully
- Expected context: same as before, output format different

---

## ⚖️ Jury Team (Судьи)

### Было (v2):
```
1. Получаешь 32 идеи
2. Оцениваешь каждую по 9 критериям (1-10)
3. Score = среднее значение (все criteria одинаково важны)
4. Судьи равны между собой (all votes equal)

Проблемы:
❌ Финансист оценивает "лёгкость запуска" одинаково важной как прибыльность
❌ Маркетолог видит весь рынок через lens CAC, a не через стратегию
❌ Венчурщик оценивает на день 1, без данных о том правильно ли он судит
```

### Теперь (v3):
```
1. Получаешь 32 идеи
2. Оцениваешь каждую по 9 критериям (1-10)
3. Score = взвешенная сумма по ТВОИМ приоритетам
4. Специализация:

Стартапер:
  launch_difficulty: 40% ← тебе это самое важное
  time_to_profit: 30%
  scalability: 20%
  other: 10%
  
Финансист:
  profitability: 40%
  market_size: 30%
  scalability: 20%
  other: 10%

Маркетолог:
  customer_acquisition: 40%
  market_size: 30%
  organic_growth: 20%
  other: 10%

(Каждый из 10 судей имеет свои веса)

3-Phase Bootstrap Calibration:
  Phase 1 (ideas 1-20): All weights EQUAL
    → Собираем signal, не зная кто надёжен
    
  Phase 2 (ideas 21-40): Measure accuracy
    → Кто правильно предсказал? Стартапер 85% accurate?
    → Финансист 78%? Маркетолог 62%?
    
  Phase 3 (ideas 41+): Weight future votes by accuracy
    → Твой scalability score × 0.85 (если ты 85% accurate on scalability)
    → Финансист на profitability × 0.78
    → Маркетолог на CAC × 0.62
    
Преимущества для системы:
✅ Специализация улучшает signal
✅ Собственная экспертиза каждого respected
✅ Со временем система учится кому доверять
✅ High disagreement (9/10 vs 4/10) → investigate, не discard
```

**Key Changes in Job Description:**
- Include criteria_weights in your scoring (each jury member different)
- Provide confidence: 0.0-1.0 for each score (how sure are you?)
- Comments still required (1 sentence per score)
- Understand Phase 1/2/3 bootstrap (your early scores have equal weight)
- Phase 2: your accuracy will be measured (be honest)
- Phase 3: your future scores weighted by Phase 2 accuracy

---

## 📊 Analyst Team (Аналитики)

### Было (v2):
```
1. Получаешь все 20 идей
2. Для каждой идеи:
   - Load researcher-01-reddit.md (80KB)
   - Load researcher-02-youtube.md (75KB)
   - Load researcher-03-market.md (90KB)
   - ... (16 files × 20 ideas = 320KB+ loaded into context)
3. Пиши анализ (context уже занят на 320KB)

Проблемы:
❌ Context explosion (320KB для одной идеи)
❌ Не видно кто нашёл что
❌ Дублировать информацию (context echo) → analyst не знает
❌ Дорого (по стоимости токенов)
```

### Теперь (v3):
```
1. Получаешь все 20 идей
2. Для каждой идеи:
   - Crabe выполнит SQL query:
   
   SELECT claim, source, confidence, researcher_id, echo_depth
   FROM researcher_checkpoints
   WHERE idea_id=$1 AND confidence >= 0.6
   ORDER BY echo_depth, confidence DESC
   
   Result: ~5-10 rows (~10-20KB вместо 320KB)
   
   Пример:
   {
     "claim": "Market is growing 40% YoY",
     "source": "Statista report, link=...",
     "confidence": 0.9,
     "researcher_id": "researcher-04-market-analyst",
     "echo_depth": 2  ← нашли 2 других researcher, good convergence
   },
   {
     "claim": "Top 3 competitors are X, Y, Z",
     "source": "CB Insights",
     "confidence": 0.85,
     "researcher_id": "researcher-05-startup-scout",
     "echo_depth": 1  ← только один нашёл, verify
   },
   ...

3. Получишь также:
   - coverage_matrix: что fully researched, what partial, what missing
   - jury_variance_analysis: на каких критериях судьи diverge больше
   - jury_high_scores: какие судьи дали высокие оценки этой идее

4. Пиши анализ (context теперь ~20KB вместо 320KB)

Преимущества для тебя:
✅ Context save: 320KB → 20KB (15x меньше)
✅ Ясность: видишь кто нашёл, где источник, как он уверен
✅ Echo detection: автоматически помечены findings что нашли несколько researchers
✅ Coverage: видишь что researched и что не researched
✅ On-demand deep-dive: если нужна full quote → запросишь по researcher_id

Если нужна полная цитата:
  "Мне нужна full analysis от researcher-04-market-analyst на идею-031"
  → Crabe достанет из DB и даст тебе полный текст (if needed)
```

**Key Changes in Job Description:**
- Don't ask for all research files — query DB instead
- You'll get structured findings: claim + source + confidence + researcher_id
- Coverage_matrix shows you what's complete vs what's partial
- Use echo_depth to detect convergence (good) vs duplicates (check)
- Write analysis like before, but with much smaller context window
- On-demand retrieval if you need deep-dive (ask for researcher_id)

---

## 🦀 Orchestrator (Crabe)

### Было (v2):
```
1. Spawn creators → collect results → load in context
2. Spawn jury → collect results → load in context
3. Spawn researchers (16) → wait for ALL to finish → load ALL in context
4. Spawn analysts (10) → pass 320KB+ context → wait
5. Spawn consolidator
6. Check coverage via file counting
7. Detect timeouts via file timestamps

Issues:
❌ Context bloat
❌ No partial recovery (crash = restart)
❌ No visibility into researcher progress
```

### Теперь (v3):
```
1. Spawn creators (same)
2. Spawn jury (same)
3. Spawn researchers (16) → they write to DB:
   - Crabe runs heartbeat loop every 2 min
   - SELECT * FROM researcher_checkpoints WHERE status='in_progress' AND last_update > 5 min
   - If timeout found → mark as partial, alert backup pool
   - SELECT COUNT(*) FROM coverage_matrix WHERE idea_id=$1 → know progress
4. Spawn analysts (10) → they query DB:
   - SELECT claim FROM checkpoints WHERE confidence >= 0.6
   - Context: 20KB instead of 320KB
5. Spawn consolidator (same)
6. Check coverage via SELECT from coverage_matrix (one row per idea!)
7. Detect timeouts via DB queries (actual progress, not file timestamps)
8. Backup researchers route automatically if timeout

Improvements:
✅ No context explosion
✅ Partial recovery (crash → resume from checkpoint)
✅ Real-time visibility (heartbeat loop)
✅ Automatic backup routing
✅ Coverage matrix (one row vs counting files)
```

---

## 📊 Summary of Changes by Role

| Роль | Persona | ТЗ | Context Impact |
|------|---------|----|----|
| **16 Researchers** | ✅ Unchanged | ✅ Write to DB incrementally | -320KB per idea |
| **10 Jury** | ✅ Unchanged | ✅ Autonomous criteria weights | Same (different calculation) |
| **10 Analysts** | ✅ Unchanged | ✅ Query DB instead of load files | -300KB per idea |
| **Crabe** | ✅ Unchanged | ✅ Heartbeat monitoring, backup routing | Much simpler |

---

## 🎯 What Stays the Same

✅ **Characters don't change** — Стартапер still impatient, Финансист still cold, Маркетолог still focused on CAC  
✅ **Expertise doesn't change** — Гуглер still digs deep Google, Реддитор still finds Reddit communities  
✅ **Final outputs don't change** — Analysts still write заключения, consolidator still generates reports  
✅ **Dashboards don't change** — All HTML/CSS/visualization files untouched  
✅ **Phases 1-4 don't change** — Creativity, jury scoring, ranking are file-based as before  

---

## 🚀 Migration Path

1. **Phase 1 (ideas 1-5):** Researchers write to DB, analysts query DB, jury equal-weighted
2. **Phase 2 (ideas 6-25):** Same as Phase 1, measure jury accuracy in background
3. **Phase 3 (ideas 26+):** Jury votes weighted by Phase 2 accuracy, backup researchers if timeouts

All personas and expertise remain constant throughout.

---

## 💬 FAQ

**Q: Does my character change?**  
A: No. Стартапер is still impatient, финансист still pedantic, маркетолог still CAC-focused.

**Q: Does my expertise change?**  
A: No. Гуглер still digs pages 50-100. Реддитор still finds deep Reddit threads.

**Q: Will I get less information as an analyst?**  
A: No. You get the SAME information, just more efficiently. Instead of 320KB of raw text, you get 20KB of structured findings with source attribution.

**Q: What if I need the full research report?**  
A: On-demand deep-dive. Ask Crabe for researcher_id + idea_id, get full transcript from DB.

**Q: Can I see who found what?**  
A: Yes! Each finding now has researcher_id attached. Гуглер's findings labeled "researcher-01", Реддитор's labeled "researcher-02", etc.

**Q: What's this echo_depth thing?**  
A: If 3 researchers independently found "market is growing 40%", echo_depth=3. Means convergence (good). If only 1 found it, echo_depth=1 (verify).

---

## 📌 Remember

**The system changed. The people didn't.**

We gave agents (researchers, analysts) better tools to work with (DB, checkpoints, queries). We didn't change who they are or how they think.

Your job is the same: analyze, score, research, write. The *how* (which files? which context?) changed, but the *what* (what analysis?) stays the same.
