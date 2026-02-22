/**
 * Compare benchmark ground-truth reasoning to session context (intent_terms, anchor_phrases).
 * Outputs: per-question gaps (what benchmark said mattered but we didn't have) and
 * aggregate "missing terms" by frequency so you can fix intent extraction and BM25/ranking.
 *
 * Usage: node compare-reasons-to-session-context.js [--output=report.json] [--csv]
 * Reads: benchmark-ground-truth-reasons.json, benchmark-session-context-cache.json
 * Writes: benchmark-reasoning-comparison-report.json (default), optional CSV summary.
 */

const path = require('path');
const fs = require('fs');

const REASONS_FILE = path.join(__dirname, '../benchmarks/benchmark-ground-truth-reasons.json');
const CACHE_FILE = path.join(__dirname, '../benchmarks/benchmark-session-context-cache.json');
const REPORT_FILE = path.join(__dirname, 'benchmark-reasoning-comparison-report.json');

const STOPWORDS = new Set([
  'in', 'of', 'and', 'the', 'or', 'to', 'for', 'with', 'on', 'at', 'by',
  'clinical', 'expertise', 'procedures', 'subspecialties', 'subspecialty',
  'procedure', 'conditions', 'description', 'qualifications', 'memberships',
]);
function isStopword(t) {
  return STOPWORDS.has(t.toLowerCase()) || t.length < 2;
}

/** Normalize to lowercase tokens (split on non-alphanumeric, keep length >= 2). */
function toTokens(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !isStopword(t));
}

/** Extract concept terms from match_factors. "X in Y" -> prefer X (value); "subspecialty: X" -> add X; skip structural stopwords. */
function extractBenchmarkTerms(reasonsEntry) {
  const tokens = new Set();
  if (!reasonsEntry || !reasonsEntry.reasons) return tokens;
  for (const r of reasonsEntry.reasons) {
    const factors = r.match_factors || [];
    for (const f of factors) {
      let s = String(f).trim();
      // "subspecialty: X" or "condition: X" -> add X as concept
      const colon = s.indexOf(':');
      if (colon !== -1) {
        const label = s.slice(0, colon).trim().toLowerCase();
        const value = s.slice(colon + 1).trim();
        if (value.length >= 2 && !['clinical expertise', 'procedures', 'conditions'].includes(label)) {
          tokens.add(value.toLowerCase());
          toTokens(value).forEach((t) => tokens.add(t));
        }
        s = value;
      }
      // "X in Y" -> add the value part (X) as phrase + tokens
      const inIndex = s.search(/\s+in\s+/i);
      if (inIndex !== -1) {
        const x = s.slice(0, inIndex).trim();
        const y = s.slice(inIndex + 4).trim();
        if (x.length >= 2) {
          tokens.add(x.toLowerCase());
          toTokens(x).forEach((t) => tokens.add(t));
        }
        if (y.length >= 2 && !['clinical expertise', 'procedures', 'conditions'].includes(y.toLowerCase())) {
          toTokens(y).forEach((t) => tokens.add(t));
        }
      } else if (s.length >= 2) {
        toTokens(s).forEach((t) => tokens.add(t));
        tokens.add(s.toLowerCase());
      }
    }
  }
  return tokens;
}

/** Extract tokens from session context (intent_terms, anchor_phrases, safe_lane_terms). */
function extractSessionTerms(cacheEntry) {
  const tokens = new Set();
  if (!cacheEntry) return tokens;
  const intent = cacheEntry.intent_terms || [];
  const anchors = cacheEntry.anchor_phrases || [];
  const safe = cacheEntry.safe_lane_terms || [];
  [...intent, ...anchors, ...safe].forEach((phrase) => {
    toTokens(phrase).forEach((t) => tokens.add(t));
    if (phrase && phrase.length >= 2) tokens.add(String(phrase).toLowerCase());
  });
  return tokens;
}

function main() {
  const args = process.argv.slice(2);
  let outputPath = path.join(__dirname, REPORT_FILE);
  let writeCsv = false;
  for (const arg of args) {
    if (arg.startsWith('--output=')) outputPath = path.resolve(arg.slice(9));
    if (arg === '--csv') writeCsv = true;
  }

  const reasonsPath = path.join(__dirname, REASONS_FILE);
  const cachePath = path.join(__dirname, CACHE_FILE);
  if (!fs.existsSync(reasonsPath)) {
    console.error(`Missing ${REASONS_FILE}. Run node build-benchmark-ground-truth-reasons.js first.`);
    process.exit(1);
  }
  if (!fs.existsSync(cachePath)) {
    console.error(`Missing ${CACHE_FILE}. Run node build-session-context-cache.js first.`);
    process.exit(1);
  }

  const reasons = JSON.parse(fs.readFileSync(reasonsPath, 'utf8'));
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  const perQuestion = [];
  const missingCount = {};

  for (const id of Object.keys(reasons)) {
    const benchmarkTerms = extractBenchmarkTerms(reasons[id]);
    const sessionTerms = extractSessionTerms(cache[id]);
    const missing = [...benchmarkTerms].filter((t) => !sessionTerms.has(t));
    const overlap = [...benchmarkTerms].filter((t) => sessionTerms.has(t));

    missing.forEach((t) => {
      missingCount[t] = (missingCount[t] || 0) + 1;
    });

    perQuestion.push({
      id,
      benchmarkTermCount: benchmarkTerms.size,
      sessionTermCount: sessionTerms.size,
      overlapCount: overlap.length,
      missingCount: missing.length,
      missingTerms: missing.slice(0, 30),
      overlapTerms: overlap.slice(0, 20),
    });
  }

  const aggregateMissing = Object.entries(missingCount)
    .sort((a, b) => b[1] - a[1])
    .map(([term, count]) => ({ term, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalQuestions: perQuestion.length,
      avgMissingPerQuestion: perQuestion.reduce((s, p) => s + p.missingCount, 0) / perQuestion.length,
      topMissingTerms: aggregateMissing.slice(0, 50),
    },
    perQuestion,
    aggregateMissingTerms: aggregateMissing,
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Compare] Written report to ${outputPath}`);
  console.log(`[Compare] Summary: ${report.summary.totalQuestions} questions, avg ${report.summary.avgMissingPerQuestion.toFixed(1)} missing terms per question.`);
  console.log('[Compare] Top 15 missing terms (benchmark said mattered, session context did not have):');
  report.summary.topMissingTerms.slice(0, 15).forEach(({ term, count }) => {
    console.log(`  ${count}\t${term}`);
  });

  if (writeCsv) {
    const csvPath = outputPath.replace(/\.json$/i, '.csv');
    const header = 'id,benchmarkTermCount,sessionTermCount,overlapCount,missingCount,missingTermsSample';
    const rows = perQuestion.map((p) => {
      const sample = (p.missingTerms || []).slice(0, 10).join('; ');
      return [p.id, p.benchmarkTermCount, p.sessionTermCount, p.overlapCount, p.missingCount, `"${sample.replace(/"/g, '""')}"`].join(',');
    });
    fs.writeFileSync(csvPath, [header, ...rows].join('\n'), 'utf8');
    console.log(`[Compare] CSV written to ${csvPath}`);
  }
}

main();
