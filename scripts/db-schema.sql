-- ============================================================
-- Research Lab v3 — Database Schema
-- Agent-centric persistent state (replaces file-based memory)
-- ============================================================

-- Enum types
DO $$ BEGIN
  CREATE TYPE checkpoint_status AS ENUM ('in_progress', 'success', 'partial', 'timeout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coverage_status AS ENUM ('✓', '✗', 'partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE jury_phase AS ENUM ('1', '2', '3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE variant_type AS ENUM ('business_model', 'market', 'implementation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- researcher_checkpoints
-- Written by researchers as they work — not at end!
-- Enables: crash recovery, partial results, echo detection
-- ============================================================
CREATE TABLE IF NOT EXISTS researcher_checkpoints (
  id               SERIAL PRIMARY KEY,
  idea_id          TEXT NOT NULL,                  -- e.g. "idea-03"
  researcher_id    TEXT NOT NULL,                  -- e.g. "researcher-07-economist"
  task_name        TEXT NOT NULL,                  -- e.g. "market_size_analysis"
  status           checkpoint_status NOT NULL DEFAULT 'in_progress',
  result_text      TEXT,                           -- actual finding / null if in_progress
  evidence_sources JSONB DEFAULT '[]',             -- [{url, title, date, quote}]
  confidence       DECIMAL(3,2) CHECK (confidence BETWEEN 0.0 AND 1.0),
  echo_depth       SMALLINT CHECK (echo_depth BETWEEN 1 AND 3) DEFAULT 1,
                                                   -- 1=unique, 2=corroborated, 3=echoed
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id       TEXT,                           -- subagent session id for tracing
  UNIQUE (idea_id, researcher_id, task_name)       -- upsert-safe
);

CREATE INDEX IF NOT EXISTS idx_rc_idea_id         ON researcher_checkpoints(idea_id);
CREATE INDEX IF NOT EXISTS idx_rc_confidence      ON researcher_checkpoints(idea_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_rc_echo_depth      ON researcher_checkpoints(idea_id, echo_depth, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_rc_status          ON researcher_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_rc_researcher      ON researcher_checkpoints(researcher_id);

-- ============================================================
-- coverage_matrix
-- One row per idea — tracks what research areas are done
-- Orchestrator reads this to decide what to spawn next
-- ============================================================
CREATE TABLE IF NOT EXISTS coverage_matrix (
  idea_id              TEXT PRIMARY KEY,
  market_analysis      coverage_status NOT NULL DEFAULT '✗',
  user_research        coverage_status NOT NULL DEFAULT '✗',
  competitive_analysis coverage_status NOT NULL DEFAULT '✗',
  financial_analysis   coverage_status NOT NULL DEFAULT '✗',
  regional_markets     coverage_status NOT NULL DEFAULT '✗',
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cm_last_updated ON coverage_matrix(last_updated DESC);

-- ============================================================
-- jury_evaluations
-- Jury writes evaluations here instead of .md files
-- Supports 3-phase calibration model (cold start → calibrated)
-- ============================================================
CREATE TABLE IF NOT EXISTS jury_evaluations (
  id             SERIAL PRIMARY KEY,
  idea_id        TEXT NOT NULL,
  jury_id        TEXT NOT NULL,                  -- e.g. "jury-01-startaper"
  criterion_name TEXT NOT NULL,                  -- e.g. "scalability"
  score          SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),
  confidence     DECIMAL(3,2) CHECK (confidence BETWEEN 0.0 AND 1.0),
  weight_override DECIMAL(4,3),                  -- NULL = use default from jury_criteria_weights
  phase          jury_phase NOT NULL DEFAULT '1',
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idea_id, jury_id, criterion_name, phase)
);

CREATE INDEX IF NOT EXISTS idx_je_idea_id  ON jury_evaluations(idea_id);
CREATE INDEX IF NOT EXISTS idx_je_jury_id  ON jury_evaluations(jury_id);
CREATE INDEX IF NOT EXISTS idx_je_phase    ON jury_evaluations(idea_id, phase);
CREATE INDEX IF NOT EXISTS idx_je_disagree ON jury_evaluations(idea_id, criterion_name); -- for variance calc

-- ============================================================
-- idea_variants
-- Spawned when jury disagrees heavily on an idea
-- High-variance idea → explore its sub-variants
-- ============================================================
CREATE TABLE IF NOT EXISTS idea_variants (
  id             SERIAL PRIMARY KEY,
  parent_idea_id TEXT NOT NULL,
  variant_id     TEXT NOT NULL UNIQUE,           -- e.g. "idea-03-variant-b2b"
  variant_type   variant_type NOT NULL,
  description    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iv_parent ON idea_variants(parent_idea_id);

-- ============================================================
-- jury_criteria_weights
-- Per-jury autonomous weighting (the v3 autonomy model)
-- Each jury member has their own value function
-- ============================================================
CREATE TABLE IF NOT EXISTS jury_criteria_weights (
  jury_id         TEXT NOT NULL,
  criterion_name  TEXT NOT NULL,
  default_weight  DECIMAL(4,3) NOT NULL CHECK (default_weight BETWEEN 0.0 AND 1.0),
  custom_weights  JSONB DEFAULT '{}',            -- phase-specific overrides: {"phase2": 0.35}
  specialty       TEXT,                          -- human-readable specialty description
  PRIMARY KEY (jury_id, criterion_name)
);

CREATE INDEX IF NOT EXISTS idx_jcw_jury_id ON jury_criteria_weights(jury_id);

-- ============================================================
-- Seed: jury_criteria_weights (v3 autonomy model)
-- Weights must sum to ~1.0 per jury_id
-- ============================================================
INSERT INTO jury_criteria_weights (jury_id, criterion_name, default_weight, specialty) VALUES

-- jury-01-startaper: ранний старт, фаундерский взгляд
('jury-01-startaper', 'launch_difficulty',   0.40, 'Early stage, founder perspective'),
('jury-01-startaper', 'time_to_profit',      0.30, 'Early stage, founder perspective'),
('jury-01-startaper', 'scalability',         0.20, 'Early stage, founder perspective'),
('jury-01-startaper', 'other',               0.10, 'Early stage, founder perspective'),

-- jury-02-financier: юнит-экономика, взлётная полоса
('jury-02-financier', 'profitability',       0.40, 'Unit economics, runway'),
('jury-02-financier', 'market_size',         0.30, 'Unit economics, runway'),
('jury-02-financier', 'cash_flow_timeline',  0.20, 'Unit economics, runway'),
('jury-02-financier', 'other',               0.10, 'Unit economics, runway'),

-- jury-03-marketer: рост, каналы, CAC
('jury-03-marketer', 'market_size',          0.35, 'Growth, channels, CAC'),
('jury-03-marketer', 'organic_acquisition',  0.30, 'Growth, channels, CAC'),
('jury-03-marketer', 'brand_potential',      0.25, 'Growth, channels, CAC'),
('jury-03-marketer', 'other',               0.10, 'Growth, channels, CAC'),

-- jury-04-venturecat: масштаб, монополия, выход
('jury-04-venturecat', 'scalability',        0.40, 'Scale, moat, exit potential'),
('jury-04-venturecat', 'market_size',        0.30, 'Scale, moat, exit potential'),
('jury-04-venturecat', 'defensibility',      0.20, 'Scale, moat, exit potential'),
('jury-04-venturecat', 'other',              0.10, 'Scale, moat, exit potential'),

-- jury-05-techcritic: исполнимость технически, solo-builder
('jury-05-techcritic', 'technical_complexity', 0.40, 'Technical feasibility, solo-builder'),
('jury-05-techcritic', 'launch_difficulty',    0.35, 'Technical feasibility, solo-builder'),
('jury-05-techcritic', 'maintenance_burden',   0.15, 'Technical feasibility, solo-builder'),
('jury-05-techcritic', 'other',                0.10, 'Technical feasibility, solo-builder'),

-- jury-06-customer: голос клиента, реальный спрос
('jury-06-customer', 'demand_evidence',      0.45, 'Customer voice, real demand'),
('jury-06-customer', 'user_pain_score',      0.30, 'Customer voice, real demand'),
('jury-06-customer', 'willingness_to_pay',   0.15, 'Customer voice, real demand'),
('jury-06-customer', 'other',                0.10, 'Customer voice, real demand'),

-- jury-07-operator: операционные риски, повседневная работа
('jury-07-operator', 'operational_complexity', 0.40, 'Ops risk, day-to-day'),
('jury-07-operator', 'support_burden',         0.30, 'Ops risk, day-to-day'),
('jury-07-operator', 'automation_potential',   0.20, 'Ops risk, day-to-day'),
('jury-07-operator', 'other',                  0.10, 'Ops risk, day-to-day'),

-- jury-08-globalizer: интернациональность, локализация
('jury-08-globalizer', 'geographic_portability', 0.40, 'International, localization'),
('jury-08-globalizer', 'regulatory_simplicity',  0.30, 'International, localization'),
('jury-08-globalizer', 'language_sensitivity',   0.20, 'International, localization'),
('jury-08-globalizer', 'other',                  0.10, 'International, localization'),

-- jury-09-riskmanager: юридические, регуляторные, репутационные риски
('jury-09-riskmanager', 'legal_risk',        0.35, 'Legal, regulatory, reputational risk'),
('jury-09-riskmanager', 'regulatory_risk',   0.30, 'Legal, regulatory, reputational risk'),
('jury-09-riskmanager', 'reputational_risk', 0.25, 'Legal, regulatory, reputational risk'),
('jury-09-riskmanager', 'other',             0.10, 'Legal, regulatory, reputational risk'),

-- jury-10-ethicist: этика, предвзятость, долгосрочный вред
('jury-10-ethicist', 'ethical_concerns',     0.40, 'Ethics, bias, long-term harm'),
('jury-10-ethicist', 'data_privacy',         0.30, 'Ethics, bias, long-term harm'),
('jury-10-ethicist', 'societal_impact',      0.20, 'Ethics, bias, long-term harm'),
('jury-10-ethicist', 'other',               0.10, 'Ethics, bias, long-term harm')

ON CONFLICT (jury_id, criterion_name) DO NOTHING;
