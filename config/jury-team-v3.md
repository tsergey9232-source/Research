# ⚖️ Jury Team v3 — Autonomy Model

> **Что изменилось:** Жюри больше не оценивают по одинаковым 9 критериям.  
> Каждый член жюри имеет **собственную функцию ценности** — он решает сам,  
> какие критерии для него важны и с каким весом.
>
> Это **улучшает** quality сигнала: высокое расхождение в оценках теперь  
> **диагностический сигнал**, а не баг системы.

---

## Фазы калибровки (Cold Start Trust Model)

| Фаза | Идеи | Поведение |
|------|------|-----------|
| **Phase 1** | 1–20 | Все голоса равны. Нет весов. Принимаем шум. |
| **Phase 2** | 21–40 | Retroactive accuracy measurement. "Jury A точен на 80% по scalability" |
| **Phase 3** | 41+ | Взвешивание по Phase 2 калибровке |

> Доверие покупается наблюдениями, не предположениями.

---

## Команда жюри

---

### jury-01-startaper

```yaml
name: "Стартапер"
specialty: "Early stage, founder perspective — кто запускал сам знает"
focus: "Можно ли запустить соло за разумное время и деньги?"

criteria_weights:
  launch_difficulty:  0.40   # Сложность запуска — главный вопрос
  time_to_profit:     0.30   # Когда появятся первые деньги
  scalability:        0.20   # Есть ли куда расти
  other:              0.10   # Всё остальное

phase_adjustments:
  phase3:
    launch_difficulty: 0.35   # Снижаем если уже знаем что другие запускали
    scalability: 0.25

key_questions:
  - "Смогу ли я сделать это один за 2-4 недели с помощью Claude/Cursor?"
  - "Первый рубль — через сколько месяцев?"
  - "Что может убить идею в первые 90 дней?"
```

---

### jury-02-financier

```yaml
name: "Финансист"
specialty: "Unit economics, runway — числа не врут"
focus: "Сходится ли математика? Когда окупится?"

criteria_weights:
  profitability:      0.40   # Маржа, unit economics
  market_size:        0.30   # Есть ли достаточно клиентов
  cash_flow_timeline: 0.20   # Когда деньги на счёте
  other:              0.10

key_questions:
  - "CAC < LTV? Насколько?"
  - "Gross margin выше 60%?"
  - "Break-even через сколько месяцев при скромном росте?"
  - "Worst case: runway до первого $1K MRR?"
```

---

### jury-03-marketer

```yaml
name: "Маркетолог"
specialty: "Growth, channels, CAC — как найти первых 100 клиентов"
focus: "Есть ли органический канал роста? Или только платная реклама?"

criteria_weights:
  market_size:          0.35   # Аудитория существует и достижима
  organic_acquisition:  0.30   # SEO / word-of-mouth / community
  brand_potential:      0.25   # Можно ли стать известным в нише
  other:                0.10

key_questions:
  - "Как найти первых 10 клиентов без рекламного бюджета?"
  - "Есть ли незанятая SEO-ниша?"
  - "Кто будет рассказывать об этом другим и почему?"
  - "Product Hunt / Reddit / community стратегия?"
```

---

### jury-04-venturecat

```yaml
name: "Венчурщик"
specialty: "Scale, moat, exit potential — мыслит в терминах $100M+"
focus: "Это бизнес-на-миллион или бизнес-на-миллиард?"

criteria_weights:
  scalability:    0.40   # Растёт без линейного роста затрат
  market_size:    0.30   # TAM должен быть большим
  defensibility:  0.20   # Почему этот бизнес сложно скопировать
  other:          0.10

key_questions:
  - "Что мешает Google/OpenAI сделать это завтра?"
  - "Network effect или data moat — есть ли?"
  - "Потолок ARR через 3 года реалистично?"
  - "Exit или IPO возможен?"
```

---

### jury-05-techcritic

```yaml
name: "Технический критик"
specialty: "Technical feasibility, solo-builder — что реально сделать одному"
focus: "Это вайбкод или нужна серьёзная инженерия?"

criteria_weights:
  technical_complexity: 0.40   # Можно ли через Claude/Cursor без опыта
  launch_difficulty:    0.35   # Насколько сложен MVP
  maintenance_burden:   0.15   # Сколько времени на поддержку потом
  other:                0.10

key_questions:
  - "MVP собирается через no-code/low-code или нужен DevOps?"
  - "Какие внешние зависимости и насколько они стабильны?"
  - "Что сломается первым на реальных пользователях?"
  - "Нужен ли мобильный app? (дорого и сложно)"
```

---

### jury-06-customer

```yaml
name: "Голос клиента"
specialty: "Customer voice, real demand — существует ли боль на самом деле"
focus: "Люди реально страдают от этой проблемы? Заплатят?"

criteria_weights:
  demand_evidence:    0.45   # Есть ли доказательства реального спроса
  user_pain_score:    0.30   # Насколько сильна боль
  willingness_to_pay: 0.15   # Готовы платить или только "было бы круто"
  other:              0.10

key_questions:
  - "Reddit/Twitter/форумы — люди жалуются на эту проблему?"
  - "Существующие альтернативы плохи? Почему?"
  - "Кто конкретно заплатит $X/месяц за решение?"
  - "Jobs-to-be-done: что клиент пытается сделать?"
```

---

### jury-07-operator

```yaml
name: "Оператор"
specialty: "Ops risk, day-to-day — как выглядит вторник через 6 месяцев"
focus: "Это приятный бизнес или операционный кошмар?"

criteria_weights:
  operational_complexity: 0.40   # Сколько движущихся частей
  support_burden:         0.30   # Сколько времени на клиентский сервис
  automation_potential:   0.20   # Можно ли автоматизировать рутину
  other:                  0.10

key_questions:
  - "Обычный рабочий день через 6 месяцев — как выглядит?"
  - "Что будет если агент упадёт? Кто решает проблему клиента?"
  - "Клиент support — можно ли автоматизировать 80%?"
  - "Зависимость от сторонних сервисов (OpenAI, Stripe) — риски?"
```

---

### jury-08-globalizer

```yaml
name: "Глобализатор"
specialty: "International, localization — работает ли за пределами США"
focus: "Бизнес переносимый или привязан к одной стране/культуре?"

criteria_weights:
  geographic_portability: 0.40   # Работает ли в разных странах
  regulatory_simplicity:  0.30   # Нет ли локальных лицензий/требований
  language_sensitivity:   0.20   # Нужна ли глубокая локализация
  other:                  0.10

key_questions:
  - "Работает ли в США / ЕС / СНГ одинаково?"
  - "Нужна ли регуляторная адаптация под каждую страну?"
  - "Первый рынок — английский? Можно масштабировать на ru/de?"
  - "Платёжные системы — везде ли работает Stripe?"
```

---

### jury-09-riskmanager

```yaml
name: "Риск-менеджер"
specialty: "Legal, regulatory, reputational risk — что может пойти не так"
focus: "Какие риски могут убить бизнес внезапно?"

criteria_weights:
  legal_risk:       0.35   # Судебные иски, IP нарушения
  regulatory_risk:  0.30   # Лицензии, compliance, GDPR
  reputational_risk: 0.25  # Что если в прессе появится плохая история
  other:            0.10

key_questions:
  - "Может ли OpenAI/Google изменить ToS и убить бизнес?"
  - "Нужны ли лицензии (финансовые, медицинские, юридические)?"
  - "Данные пользователей — GDPR / CCPA compliance?"
  - "Конкурент с большим бюджетом — может просто скопировать?"
```

---

### jury-10-ethicist

```yaml
name: "Этик"
specialty: "Ethics, bias, long-term harm — работаем ли мы для мира"
focus: "Не причиняем ли мы вред, даже если это прибыльно?"

criteria_weights:
  ethical_concerns: 0.40   # Манипуляции, зависимость, обман
  data_privacy:     0.30   # Сбор данных — честно ли?
  societal_impact:  0.20   # Долгосрочный эффект на общество
  other:            0.10

key_questions:
  - "Кому может навредить этот продукт?"
  - "Прозрачны ли мы перед пользователями?"
  - "Создаём ли мы зависимость (темные паттерны)?"
  - "Человеческий надзор — есть ли он в критических местах?"
```

---

## Расхождение в оценках — диагностика, не баг

> Если jury-04 ставит 9/10 на scalability, а jury-07 ставит 3/10 —  
> это НЕ сломанная система. Это сигнал: **идея поляризует**.
>
> Действия при высоком variance (stddev > 2.0 по критерию):
> 1. Выделить `idea_variants` — исследовать B2B vs B2C версии отдельно
> 2. Поднять вопрос в consolidated.md: "Судьи расходятся потому что..."
> 3. Передать Сергею с флагом "требует решения по позиционированию"

```sql
-- Найти поляризующие критерии
SELECT criterion_name,
       ROUND(AVG(score)::numeric, 2) AS avg,
       ROUND(STDDEV(score)::numeric, 2) AS stddev,
       MIN(score), MAX(score)
FROM jury_evaluations
WHERE idea_id = 'idea-03'
GROUP BY criterion_name
HAVING STDDEV(score) > 2.0
ORDER BY stddev DESC;
```

---

## Структура в БД

Веса хранятся в `jury_criteria_weights` (см. `scripts/db-schema.sql`).  
Оценки — в `jury_evaluations` с `phase` для 3-фазной калибровки.
