/**
 * db-setup.js — Database initialization for Research Lab v3
 * 
 * Run once before first pipeline run:
 *   DATABASE_URL=postgres://... node scripts/db-setup.js
 * 
 * Safe to re-run (idempotent — uses IF NOT EXISTS + ON CONFLICT DO NOTHING).
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set.');
    console.error('   Export it first:');
    console.error('   export DATABASE_URL=postgres://user:pass@localhost:5432/researchlab');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔧 Research Lab v3 — Database Setup');
    console.log('   Connected to:', process.env.DATABASE_URL.replace(/:\/\/.*@/, '://***@'));
    console.log('');

    // ── Step 1: Load and run schema ──────────────────────────────────────────
    console.log('📄 Step 1: Running db-schema.sql...');
    const schemaPath = path.join(__dirname, 'db-schema.sql');
    const schemaSql  = readFileSync(schemaPath, 'utf-8');

    await pool.query(schemaSql);
    console.log('   ✅ Schema applied (tables + indexes + seed data)');

    // ── Step 2: Verify tables exist ──────────────────────────────────────────
    console.log('');
    console.log('🔍 Step 2: Verifying tables...');

    const expectedTables = [
      'researcher_checkpoints',
      'coverage_matrix',
      'jury_evaluations',
      'idea_variants',
      'jury_criteria_weights',
    ];

    const { rows: existingTables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = ANY($1)
      ORDER BY table_name
    `, [expectedTables]);

    const found = existingTables.map(r => r.table_name);

    for (const tableName of expectedTables) {
      const ok = found.includes(tableName);
      console.log(`   ${ok ? '✅' : '❌'} ${tableName}`);
    }

    const missing = expectedTables.filter(t => !found.includes(t));
    if (missing.length > 0) {
      console.error(`\n❌ Missing tables: ${missing.join(', ')}`);
      process.exit(1);
    }

    // ── Step 3: Verify jury weights seed ────────────────────────────────────
    console.log('');
    console.log('⚖️  Step 3: Verifying jury weights...');

    const { rows: weights } = await pool.query(`
      SELECT jury_id, COUNT(*) AS criteria_count
      FROM jury_criteria_weights
      GROUP BY jury_id
      ORDER BY jury_id
    `);

    if (weights.length === 0) {
      console.log('   ⚠️  No jury weights found — re-running seed...');
      // Seeds are in schema, try again
      const seedMatch = schemaSql.match(/-- Seed:.*?(?=-- ====|$)/s);
      if (seedMatch) await pool.query(seedMatch[0]);
    } else {
      for (const row of weights) {
        console.log(`   ✅ ${row.jury_id}: ${row.criteria_count} criteria`);
      }
    }

    // ── Step 4: Add extra indexes (non-blocking) ─────────────────────────────
    console.log('');
    console.log('📊 Step 4: Ensuring performance indexes...');

    const extraIndexes = [
      // Composite index for the analyst's primary query pattern
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rc_analyst_query
       ON researcher_checkpoints(idea_id, confidence DESC, echo_depth ASC)
       WHERE status IN ('success', 'partial')`,

      // Index for watchdog timeout detection
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rc_watchdog
       ON researcher_checkpoints(status, timestamp)
       WHERE status = 'in_progress'`,

      // Index for jury variance analysis
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_je_variance
       ON jury_evaluations(idea_id, criterion_name, score)`,
    ];

    for (const sql of extraIndexes) {
      try {
        await pool.query(sql);
        const name = sql.match(/IF NOT EXISTS (\w+)/)?.[1] || 'index';
        console.log(`   ✅ ${name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   ↩️  Already exists (skipped)`);
        } else {
          console.warn(`   ⚠️  ${err.message}`);
        }
      }
    }

    // ── Step 5: Print summary ────────────────────────────────────────────────
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('✅ Database setup complete!');
    console.log('');
    console.log('Tables:');
    console.log('  researcher_checkpoints  — agent state & findings');
    console.log('  coverage_matrix         — per-idea research coverage');
    console.log('  jury_evaluations        — jury scores (3-phase)');
    console.log('  idea_variants           — branched idea variants');
    console.log('  jury_criteria_weights   — per-jury autonomy weights');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Set DATABASE_URL in your environment');
    console.log('  2. Run pipeline: node scripts/05-research.js (per researcher)');
    console.log('  3. Run analysis: node scripts/06-analysis.js (per analyst)');
    console.log('═══════════════════════════════════════');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
