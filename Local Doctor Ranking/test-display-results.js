const fs = require('fs');
const data = JSON.parse(fs.readFileSync('test-three-tier-evaluation.json', 'utf8'));
const caseId = Object.keys(data.byId)[0];
const caseData = data.byId[caseId];

console.log('=== TEST CASE ===');
console.log('Query:', caseData.userQuery);
console.log('\n=== LLM VERIFICATION ===');
console.log('Overall reason:', caseData.verification.overall_reason);
console.log('\n=== TOP 12 DOCTORS WITH FIT CATEGORIES ===');
caseData.verification.per_doctor.forEach((d, i) => {
  console.log(`${i+1}. ${d.practitioner_name}: ${(d.fit_category || 'unknown').toUpperCase()}`);
  console.log(`   Reason: ${d.brief_reason || 'N/A'}`);
});

console.log('\n=== METRICS ===');
const m = caseData.metrics;
console.log('Top 3:');
console.log(`  Excellent: ${(m.pct_excellent_at_3 * 100).toFixed(1)}% (${m.count_excellent_at_3}/3)`);
console.log(`  Good: ${(m.pct_good_at_3 * 100).toFixed(1)}% (${m.count_good_at_3}/3)`);
console.log(`  Ill-fit: ${(m.pct_ill_fit_at_3 * 100).toFixed(1)}% (${m.count_ill_fit_at_3}/3)`);
console.log('\nTop 5:');
console.log(`  Excellent: ${(m.pct_excellent_at_5 * 100).toFixed(1)}% (${m.count_excellent_at_5}/5)`);
console.log(`  Good: ${(m.pct_good_at_5 * 100).toFixed(1)}% (${m.count_good_at_5}/5)`);
console.log(`  Ill-fit: ${(m.pct_ill_fit_at_5 * 100).toFixed(1)}% (${m.count_ill_fit_at_5}/5)`);
console.log('\nTop 12:');
console.log(`  Excellent: ${(m.pct_excellent_at_12 * 100).toFixed(1)}% (${m.count_excellent_at_12}/12)`);
console.log(`  Good: ${(m.pct_good_at_12 * 100).toFixed(1)}% (${m.count_good_at_12}/12)`);
console.log(`  Ill-fit: ${(m.pct_ill_fit_at_12 * 100).toFixed(1)}% (${m.count_ill_fit_at_12}/12)`);

console.log('\n=== SUMMARY METRICS ===');
const summary = data.summary.success_metrics;
console.log('Three-tier averages:');
if (summary.pct_excellent_at_3_avg !== null) {
  console.log(`  Excellent at top 3 avg: ${(summary.pct_excellent_at_3_avg * 100).toFixed(1)}%`);
  console.log(`  Good at top 3 avg: ${(summary.pct_good_at_3_avg * 100).toFixed(1)}%`);
  console.log(`  Ill-fit at top 3 avg: ${(summary.pct_ill_fit_at_3_avg * 100).toFixed(1)}%`);
}
