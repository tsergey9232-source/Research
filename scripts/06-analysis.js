/**
 * 06-analysis.js — Analysis Stage v3
 * 
 * Architecture change: DB queries instead of reading researcher .md files
 * 
 * OLD: Read all researcher files into context (~320KB) → OOM risk
 * NEW: Query DB for structured {claim, source, confidence, researcher_id}
 *      Only high-confidence, deduplicated findings come into context
 * 
 * Query strategy:
 *   - echo_depth ASC first → unique findings surface first (less echo noise)
 *   - confidence DESC within same echo_depth → best quality first
 *   - Minimum confidence threshold (default 0.6) filters noise
 * 
 * Audit trail:
 *   - Every query is logged with timestamp, filters used, row count
 *   - Analysts can be traced back to exact DB state they saw
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Config ──────────────────────────────────────────────────────────────────
const ANALYST_ID     = process.env.ANALYST_ID     || 'analyst-unknown';
const IDEA_ID        = process.env.IDEA_ID        || 'idea-unknown';
const RUN_DIR        = process.env.RUN_DIR        || './results/current-run';
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const MAX_FINDINGS   = parseInt(process.env.MAX_FINDINGS     || '50');  // cap context size

// ── Query audit log ─────────────────────────────────────────────────────────

const queryAuditLog = [];

function logQuery(sql, params, rowCount, durationMs) {
  const entry = {
    analyst_id:    ANALYST_ID,
    idea_id:       IDEA_ID,
    timestamp:     new Date().toISOString(),
    sql:           sql.replace(/\s+/g, ' ').trim(),
    params,
    rows_returned: rowCount,
    duration_ms:   durationMs,
  };
  queryAuditLog.push(entry);
}

function saveQueryAudit() {
  const auditDir  = path.join(RUN_DIR, 'audit');
  const auditFile = path.join(auditDir, `${ANALYST_ID}-${IDEA_ID}-queries.json`);
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(auditFile, JSON.stringify(queryAuditLog, null, 2));
  console.log(`[audit] Query log saved → ${auditFile} (${queryAuditLog.length} queries)`);
}

// ── Wrapped pool.query with audit ───────────────────────────────────────────

async function query(sql, params = []) {
  const t0 = Date.now();
  const result = await pool.query(sql, params);
  logQuery(sql, params, result.rowCount, Date.now() - t0);
  return result;
}

// ── Core data fetch ─────────────────────────────────────────────────────────

/**
 * Primary query: fetch research findings for this idea.
 * 
 * Ordering rationale:
 *   echo_depth ASC  → unique findings (depth=1) come before corroborated (2) and echoed (3)
 *   confidence DESC → within same echo group, highest quality first
 * 
 * This means analysts see the most novel, reliable findings first,
 * and can stop reading when context budget is exhausted.
 */
async function fetchResearchFindings(ideaId, options = {}) {
  const minConf   = options.minConfidence ?? MIN_CONFIDENCE;
  const maxRows   = options.maxFindings   ?? MAX_FINDINGS;
  const taskFilter = options.taskName     ?? null;

  const sql = `
    SELECT 
      id,
      researcher_id,
      task_name,
      result_text,
      evidence_sources,
      confidence,
      echo_depth,
      status,
      timestamp
    FROM researcher_checkpoints
    WHERE idea_id = $1
      AND confidence >= $2
      AND status IN ('success', 'partial')
      ${taskFilter ? 'AND task_name = $4' : ''}
    ORDER BY echo_depth ASC, confidence DESC
    LIMIT $3
  `;

  const params = taskFilter
    ? [ideaId, minConf, maxRows, taskFilter]
    : [ideaId, minConf, maxRows];

  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Fetch coverage matrix — tells analyst which areas have good data vs gaps.
 */
async function fetchCoverageMatrix(ideaId) {
  const { rows } = await query(`
    SELECT * FROM coverage_matrix WHERE idea_id = $1
  `, [ideaId]);

  return rows[0] || null;
}

/**
 * Fetch echo-flagged findings (depth=3) separately.
 * These are claims that 3+ researchers reported — could be truth OR context echo.
 * Analyst should verify sources before treating as established facts.
 */
async function fetchEchoedFindings(ideaId) {
  const { rows } = await query(`
    SELECT 
      researcher_id,
      task_name,
      result_text,
      evidence_sources,
      confidence,
      echo_depth
    FROM researcher_checkpoints
    WHERE idea_id = $1
      AND echo_depth = 3
      AND status IN ('success', 'partial')
    ORDER BY confidence DESC
  `, [ideaId]);

  return rows;
}

/**
 * Fetch jury evaluations for this idea (if available from prior round).
 * Analysts use this for triangulation — what did jury flag as concerning?
 */
async function fetchJurySignals(ideaId, phase = null) {
  const sql = phase
    ? `SELECT jury_id, criterion_name, score, confidence, weight_override, phase
       FROM jury_evaluations
       WHERE idea_id = $1 AND phase = $2
       ORDER BY jury_id, criterion_name`
    : `SELECT jury_id, criterion_name, score, confidence, weight_override, phase
       FROM jury_evaluations
       WHERE idea_id = $1
       ORDER BY phase, jury_id, criterion_name`;

  const params = phase ? [ideaId, String(phase)] : [ideaId];
  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Fetch variance-flagged criteria — high jury disagreement = diagnostic signal.
 * Returns criteria where stddev(score) > 2.0 (significant disagreement).
 */
async function fetchHighVarianceCriteria(ideaId) {
  const { rows } = await query(`
    SELECT
      criterion_name,
      ROUND(AVG(score)::numeric, 2)    AS avg_score,
      ROUND(STDDEV(score)::numeric, 2) AS stddev_score,
      MIN(score)                        AS min_score,
      MAX(score)                        AS max_score,
      COUNT(*)                          AS jury_count
    FROM jury_evaluations
    WHERE idea_id = $1
    GROUP BY criterion_name
    HAVING STDDEV(score) > 2.0
    ORDER BY stddev_score DESC
  `, [ideaId]);

  return rows;  // High stddev = not a bug, it's a signal → investigate why
}

// ── Context builder ─────────────────────────────────────────────────────────

/**
 * Build a structured context object for the analyst agent.
 * This replaces "read all .md files from research/" pattern.
 * 
 * Total context size is controlled — ~10-20KB vs old ~320KB.
 */
async function buildAnalystContext(ideaId) {
  console.log(`[analysis] Building context for ${ANALYST_ID} on ${ideaId}...`);

  const [findings, coverage, echoed, jurySignals, highVariance] = await Promise.all([
    fetchResearchFindings(ideaId),
    fetchCoverageMatrix(ideaId),
    fetchEchoedFindings(ideaId),
    fetchJurySignals(ideaId),
    fetchHighVarianceCriteria(ideaId),
  ]);

  // Group findings by task area
  const findingsByArea = {};
  for (const f of findings) {
    const area = f.task_name || 'general';
    if (!findingsByArea[area]) findingsByArea[area] = [];
    findingsByArea[area].push(f);
  }

  const context = {
    idea_id:          ideaId,
    analyst_id:       ANALYST_ID,
    query_timestamp:  new Date().toISOString(),
    
    summary: {
      total_findings:    findings.length,
      coverage:          coverage,
      echo_warnings:     echoed.length,
      high_variance_criteria: highVariance.map(v => v.criterion_name),
    },
    
    findings_by_area:  findingsByArea,
    
    echo_warnings: echoed.length > 0 ? {
      note: 'These claims were reported by 3+ researchers. Verify sources — may indicate context echo rather than independent corroboration.',
      items: echoed
    } : null,
    
    jury_signals:      jurySignals.length > 0 ? jurySignals : null,
    
    high_variance_criteria: highVariance.length > 0 ? {
      note: 'High jury variance = diagnostic signal. Investigate why these criteria polarize opinions.',
      items: highVariance
    } : null,
  };

  // Report context size
  const ctxSize = JSON.stringify(context).length;
  console.log(`[analysis] Context built: ${findings.length} findings, coverage=${JSON.stringify(coverage)}, size≈${Math.round(ctxSize/1024)}KB`);

  return context;
}

// ── Output writer ────────────────────────────────────────────────────────────

/**
 * Write analyst output to files (same destination as v2, different source).
 * Output format is unchanged — downstream agents don't need to know we use DB now.
 */
function writeAnalysisOutput(ideaId, analystId, reportText, summaryText) {
  const analysisDir = path.join(RUN_DIR, '02-top20', 'ideas', ideaId, 'analysis');
  mkdirSync(analysisDir, { recursive: true });

  const reportFile  = path.join(analysisDir, `${analystId}.md`);
  const summaryFile = path.join(analysisDir, `${analystId}-summary.md`);

  writeFileSync(reportFile,  reportText);
  writeFileSync(summaryFile, summaryText);

  console.log(`[output] ✅ Written: ${reportFile} (${reportText.length} chars)`);
}

// ── Stats for orchestrator ───────────────────────────────────────────────────

/**
 * Quick status check — how many researchers done vs in_progress for this idea?
 * Orchestrator calls this to decide when to start analysis phase.
 */
async function getResearchStatus(ideaId) {
  const { rows } = await query(`
    SELECT 
      status,
      COUNT(*) AS count
    FROM researcher_checkpoints
    WHERE idea_id = $1
    GROUP BY status
    ORDER BY status
  `, [ideaId]);

  const statusMap = Object.fromEntries(rows.map(r => [r.status, parseInt(r.count)]));
  const total     = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
  const done      = (statusMap.success || 0) + (statusMap.partial || 0) + (statusMap.timeout || 0);

  return {
    idea_id:      ideaId,
    total,
    done,
    in_progress:  statusMap.in_progress || 0,
    success:      statusMap.success     || 0,
    partial:      statusMap.partial     || 0,
    timeout:      statusMap.timeout     || 0,
    ready:        done > 0 && (statusMap.in_progress || 0) === 0,  // all finished
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────
export {
  pool,
  query,
  saveQueryAudit,
  fetchResearchFindings,
  fetchCoverageMatrix,
  fetchEchoedFindings,
  fetchJurySignals,
  fetchHighVarianceCriteria,
  buildAnalystContext,
  writeAnalysisOutput,
  getResearchStatus,
};

// ── Demo / test run ───────────────────────────────────────────────────────────
// Run: IDEA_ID=idea-03 ANALYST_ID=analyst-01-strategist node 06-analysis.js
if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log('--- 06-analysis.js v3 self-test ---');

  (async () => {
    try {
      const status = await getResearchStatus(IDEA_ID);
      console.log('[status]', status);

      if (!status.ready) {
        console.log(`[analysis] Research not fully complete yet (${status.in_progress} still in_progress). Run anyway? [set FORCE=1]`);
        if (!process.env.FORCE) {
          await pool.end();
          process.exit(0);
        }
      }

      const context = await buildAnalystContext(IDEA_ID);

      console.log('\n=== CONTEXT SUMMARY ===');
      console.log(`Findings:   ${context.summary.total_findings}`);
      console.log(`Coverage:   ${JSON.stringify(context.summary.coverage)}`);
      console.log(`Echo warns: ${context.summary.echo_warnings}`);
      console.log(`High var:   ${context.summary.high_variance_criteria.join(', ') || 'none'}`);

      // Save audit trail
      saveQueryAudit();

      // At this point, an analyst agent would receive `context` and write its report.
      // The context object is passed into the agent's task prompt — not the raw files.
      console.log('\n[analysis] Context ready for analyst agent. Size:', 
        Math.round(JSON.stringify(context).length / 1024) + 'KB');

    } finally {
      await pool.end();
    }
  })();
}
