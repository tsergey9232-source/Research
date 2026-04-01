/**
 * 05-research.js — Research Stage v3
 * 
 * Architecture change: checkpoint-based DB writes (not file-at-end)
 * 
 * OLD: collect all findings → write file when done
 * NEW: write checkpoint to DB on each finding → partial work survives crashes
 * 
 * Flow:
 *   1. INSERT checkpoint {status: in_progress}
 *   2. Per finding: UPDATE {result_text, confidence, evidence_sources}
 *   3. On finish: UPDATE {status: success}
 *   4. On timeout: DB already has partial work (status stays partial)
 *   5. After all researchers: UPDATE coverage_matrix
 */

import pg from 'pg';
import { execSync } from 'child_process';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Config ─────────────────────────────────────────────────────────────────
const RESEARCHER_ID  = process.env.RESEARCHER_ID  || 'researcher-unknown';
const IDEA_ID        = process.env.IDEA_ID         || 'idea-unknown';
const TASK_NAME      = process.env.TASK_NAME       || 'general_research';
const SESSION_ID     = process.env.SESSION_ID      || null;
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.5');

// ── Checkpoint helpers ──────────────────────────────────────────────────────

/**
 * Register this researcher as started.
 * Uses INSERT ... ON CONFLICT DO UPDATE so re-runs are safe.
 */
async function initCheckpoint() {
  await pool.query(`
    INSERT INTO researcher_checkpoints
      (idea_id, researcher_id, task_name, status, session_id, timestamp)
    VALUES ($1, $2, $3, 'in_progress', $4, NOW())
    ON CONFLICT (idea_id, researcher_id, task_name)
    DO UPDATE SET status = 'in_progress', session_id = $4, timestamp = NOW()
  `, [IDEA_ID, RESEARCHER_ID, TASK_NAME, SESSION_ID]);
  
  console.log(`[checkpoint] ▶ ${RESEARCHER_ID} → ${TASK_NAME} started (idea: ${IDEA_ID})`);
}

/**
 * Save a finding as we discover it.
 * Calculates echo_depth by checking how many other researchers found similar claims.
 *
 * @param {string} resultText    - The actual research finding
 * @param {number} confidence    - 0.0–1.0, your confidence in this finding
 * @param {Array}  sources       - [{url, title, date, quote}]
 */
async function saveCheckpoint(resultText, confidence, sources = []) {
  if (confidence < MIN_CONFIDENCE) {
    console.log(`[checkpoint] ⚠ Skipping low-confidence finding (${confidence}): ${resultText.slice(0, 60)}...`);
    return;
  }

  // Calculate echo_depth: how many other researchers have similar findings?
  const echoDepth = await calculateEchoDepth(resultText);

  await pool.query(`
    INSERT INTO researcher_checkpoints
      (idea_id, researcher_id, task_name, status, result_text, evidence_sources, confidence, echo_depth, session_id, timestamp)
    VALUES ($1, $2, $3, 'partial', $4, $5::jsonb, $6, $7, $8, NOW())
    ON CONFLICT (idea_id, researcher_id, task_name)
    DO UPDATE SET
      status           = 'partial',
      result_text      = EXCLUDED.result_text,
      evidence_sources = EXCLUDED.evidence_sources,
      confidence       = EXCLUDED.confidence,
      echo_depth       = EXCLUDED.echo_depth,
      timestamp        = NOW()
  `, [
    IDEA_ID,
    RESEARCHER_ID,
    TASK_NAME,
    resultText,
    JSON.stringify(sources),
    confidence,
    echoDepth,
    SESSION_ID
  ]);

  console.log(`[checkpoint] 💾 Saved (confidence=${confidence}, echo_depth=${echoDepth}): ${resultText.slice(0, 80)}...`);
}

/**
 * Mark this researcher as successfully complete.
 */
async function completeCheckpoint() {
  await pool.query(`
    UPDATE researcher_checkpoints
    SET status = 'success', timestamp = NOW()
    WHERE idea_id = $1 AND researcher_id = $2 AND task_name = $3
  `, [IDEA_ID, RESEARCHER_ID, TASK_NAME]);

  console.log(`[checkpoint] ✅ ${RESEARCHER_ID} → ${TASK_NAME} complete`);
}

/**
 * Mark as timed out (called by watchdog, not by researcher itself).
 * Partial data is already in DB from saveCheckpoint() calls.
 */
async function timeoutCheckpoint(researcherId, ideaId, taskName) {
  await pool.query(`
    UPDATE researcher_checkpoints
    SET status = 'timeout', timestamp = NOW()
    WHERE idea_id = $1 AND researcher_id = $2 AND task_name = $3
      AND status = 'in_progress'
  `, [ideaId, researcherId, taskName]);

  console.log(`[watchdog] ⏱ Marked timeout: ${researcherId} → ${taskName}`);
}

// ── Echo depth calculation ──────────────────────────────────────────────────

/**
 * Detect if this finding echoes existing research.
 * 
 * echo_depth meaning:
 *   1 = unique finding (first to report this)
 *   2 = corroborated (1-2 others found similar) → higher trust
 *   3 = echoed (3+ others found it) → possible context echo, flag for review
 * 
 * Simple heuristic: keyword overlap with existing result_text in this idea.
 * A more sophisticated version would use embeddings.
 */
async function calculateEchoDepth(newText) {
  const { rows } = await pool.query(`
    SELECT result_text FROM researcher_checkpoints
    WHERE idea_id = $1
      AND researcher_id != $2
      AND result_text IS NOT NULL
      AND status IN ('partial', 'success')
  `, [IDEA_ID, RESEARCHER_ID]);

  if (rows.length === 0) return 1;

  // Extract significant words (>5 chars) from new finding
  const newWords = new Set(
    newText.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 5)
  );

  let similarCount = 0;
  for (const row of rows) {
    const existingWords = row.result_text.toLowerCase().split(/\W+/).filter(w => w.length > 5);
    const overlap = existingWords.filter(w => newWords.has(w)).length;
    const overlapRatio = overlap / Math.max(newWords.size, 1);
    if (overlapRatio > 0.30) similarCount++;  // 30% keyword overlap = "similar"
  }

  if (similarCount === 0) return 1;          // unique
  if (similarCount <= 2) return 2;           // corroborated
  return 3;                                  // echoed — analyst should verify sources
}

// ── Coverage matrix update ──────────────────────────────────────────────────

/**
 * Update coverage_matrix after research round completes.
 * Called by orchestrator after all researchers finish for an idea.
 * 
 * Coverage areas mapped from TASK_NAME patterns.
 */
async function updateCoverageMatrix(ideaId) {
  // Count successful/partial checkpoints per coverage area
  const { rows } = await pool.query(`
    SELECT task_name, status, confidence
    FROM researcher_checkpoints
    WHERE idea_id = $1 AND status IN ('success', 'partial')
  `, [ideaId]);

  const areas = {
    market_analysis:      [],
    user_research:        [],
    competitive_analysis: [],
    financial_analysis:   [],
    regional_markets:     []
  };

  // Route tasks to coverage areas
  for (const row of rows) {
    const t = row.task_name;
    if (t.includes('market') && !t.includes('competitive') && !t.includes('regional'))
      areas.market_analysis.push(row);
    else if (t.includes('user') || t.includes('customer') || t.includes('pain'))
      areas.user_research.push(row);
    else if (t.includes('competi') || t.includes('rival') || t.includes('alternative'))
      areas.competitive_analysis.push(row);
    else if (t.includes('financ') || t.includes('revenue') || t.includes('unit_econ') || t.includes('pricing'))
      areas.financial_analysis.push(row);
    else if (t.includes('region') || t.includes('geo') || t.includes('country') || t.includes('local'))
      areas.regional_markets.push(row);
  }

  // Determine status per area
  function areaStatus(tasks) {
    if (tasks.length === 0) return '✗';
    const successCount = tasks.filter(t => t.status === 'success').length;
    if (successCount >= Math.ceil(tasks.length * 0.7)) return '✓';
    return 'partial';
  }

  await pool.query(`
    INSERT INTO coverage_matrix
      (idea_id, market_analysis, user_research, competitive_analysis, financial_analysis, regional_markets, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (idea_id) DO UPDATE SET
      market_analysis      = EXCLUDED.market_analysis,
      user_research        = EXCLUDED.user_research,
      competitive_analysis = EXCLUDED.competitive_analysis,
      financial_analysis   = EXCLUDED.financial_analysis,
      regional_markets     = EXCLUDED.regional_markets,
      last_updated         = NOW()
  `, [
    ideaId,
    areaStatus(areas.market_analysis),
    areaStatus(areas.user_research),
    areaStatus(areas.competitive_analysis),
    areaStatus(areas.financial_analysis),
    areaStatus(areas.regional_markets)
  ]);

  console.log(`[coverage] Updated matrix for ${ideaId}:`, Object.fromEntries(
    Object.entries(areas).map(([k, v]) => [k, areaStatus(v)])
  ));
}

// ── Watchdog: detect stuck researchers ─────────────────────────────────────

/**
 * Find researchers that started but never finished (past timeout threshold).
 * Called periodically by orchestrator heartbeat.
 * 
 * @param {number} timeoutMinutes  - Mark as timed out after this many minutes
 */
async function detectTimeouts(timeoutMinutes = 60) {
  const { rows } = await pool.query(`
    SELECT id, idea_id, researcher_id, task_name, timestamp
    FROM researcher_checkpoints
    WHERE status = 'in_progress'
      AND timestamp < NOW() - INTERVAL '${timeoutMinutes} minutes'
  `);

  if (rows.length === 0) {
    console.log('[watchdog] No timeouts detected.');
    return [];
  }

  for (const row of rows) {
    await timeoutCheckpoint(row.researcher_id, row.idea_id, row.task_name);
    console.log(`[watchdog] ⏱ Timed out: ${row.researcher_id} (started ${row.timestamp})`);
  }

  return rows;
}

// ── Query helpers for analysts (06-analysis.js) ────────────────────────────

/**
 * Fetch research findings for an idea, ordered for analyst consumption.
 * Filters by minimum confidence, surfaces unique findings first.
 * 
 * This is what 06-analysis.js calls instead of reading .md files.
 */
async function getResearchForIdea(ideaId, minConfidence = 0.6) {
  const { rows } = await pool.query(`
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
    ORDER BY echo_depth ASC, confidence DESC, timestamp ASC
  `, [ideaId, minConfidence]);

  return rows;
}

/**
 * Coverage summary for orchestrator — shows what's done and what's missing.
 */
async function getCoverageMatrix(ideaId) {
  const { rows } = await pool.query(`
    SELECT * FROM coverage_matrix WHERE idea_id = $1
  `, [ideaId]);

  return rows[0] || null;
}

// ── Exports ─────────────────────────────────────────────────────────────────
export {
  pool,
  initCheckpoint,
  saveCheckpoint,
  completeCheckpoint,
  timeoutCheckpoint,
  calculateEchoDepth,
  updateCoverageMatrix,
  detectTimeouts,
  getResearchForIdea,
  getCoverageMatrix
};

// ── Demo / test run ──────────────────────────────────────────────────────────
// Run directly: IDEA_ID=idea-03 RESEARCHER_ID=researcher-07-economist TASK_NAME=market_size_analysis node 05-research.js
if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log('--- 05-research.js v3 self-test ---');
  
  (async () => {
    try {
      await initCheckpoint();

      // Simulate finding #1
      await saveCheckpoint(
        'Global market for AI productivity tools estimated at $12B in 2025, growing 34% YoY. Primary segments: SMB automation (40%), enterprise workflow (35%), developer tools (25%).',
        0.82,
        [
          { url: 'https://example.com/report', title: 'AI Tools Market 2025', date: '2025-03', quote: '$12B market size' }
        ]
      );

      // Simulate finding #2
      await saveCheckpoint(
        'Solo-founder SaaS businesses in productivity space average 14 months to $10K MRR. Top quartile: 6 months. Key driver: niche focus vs broad tool.',
        0.71,
        [
          { url: 'https://example.com/study', title: 'SaaS Founder Study', date: '2025-01', quote: '14 months avg to $10K MRR' }
        ]
      );

      await completeCheckpoint();
      await updateCoverageMatrix(IDEA_ID);

      // Show what analysts will see
      const findings = await getResearchForIdea(IDEA_ID);
      console.log(`\n[query] ${findings.length} findings ready for analysts:`);
      findings.forEach(f => {
        console.log(`  [${f.researcher_id}] conf=${f.confidence} echo=${f.echo_depth} | ${f.result_text?.slice(0,80)}...`);
      });

    } finally {
      await pool.end();
    }
  })();
}
