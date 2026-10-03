const {readSupabaseRows} = require('./supabase-reader.cjs');

function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
function spireProfile(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && /(^|\.)spirehealthcare\.com$/.test(u.hostname) && /\/(consultants|consultant-profiles)\//.test(u.pathname); } catch { return false; }
}
const strings = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];
function normalizeRecord(row) {
  // Fail closed: affiliation must be evidenced by an official consultant profile.
  if (!row || row.blacklisted === true || !row.id || !row.name || !spireProfile(row.affiliationEvidence?.sourceUrl || row.profileUrl)) return null;
  const evidence = (Array.isArray(row.insuranceEvidence) ? row.insuranceEvidence : []).filter(e => e && typeof e.insurer === 'string' && safeUrl(e.sourceUrl) && typeof e.text === 'string' && e.text);
  const insurers = strings(row.insurers).filter(i => evidence.some(e => e.insurer.toLowerCase() === i.toLowerCase()));
  const locations = (Array.isArray(row.locations) ? row.locations : []).filter(l => l && typeof l.name === 'string' && /\bspire\b/i.test(l.name)).map(l => ({
    name: String(l.name), address: String(l.address || ''), postcode: String(l.postcode || ''), city: String(l.city || ''),
    latitude: Number.isFinite(l.latitude) ? l.latitude : null, longitude: Number.isFinite(l.longitude) ? l.longitude : null,
    sourceUrl: safeUrl(l.sourceUrl) || safeUrl(row.profileUrl), provenance: l.provenance || null
  }));
  if (!locations.length) return null;
  return {
    id: String(row.id), name: String(row.name), specialty: String(row.specialty || ''), description: String(row.description || ''),
    clinicalInterests: strings(row.clinicalInterests), procedures: strings(row.procedures),
    procedureEvidence: Array.isArray(row.procedureEvidence) ? row.procedureEvidence.filter(e=>e && typeof e.text==='string') : [],
    locations, insurers, insuranceEvidence: evidence,
    profileUrl: safeUrl(row.profileUrl), sourceUrls: [...new Set([row.profileUrl, ...strings(row.sourceUrls), ...evidence.map(e => e.sourceUrl)].map(safeUrl).filter(Boolean))],
    affiliationEvidence: row.affiliationEvidence, imageUrl: safeUrl(row.imageUrl), gmc: row.gmc ? String(row.gmc) : null,
    gender: row.gender || null, languages: strings(row.languages), retrievedAt: row.retrievedAt || null,
    sourceRecordIds: strings(row.sourceRecordIds), sourceMergeDates: strings(row.sourceMergeDates), fieldProvenance: row.fieldProvenance || {},
    supplementalEvidence: row.supplementalEvidence || [], evidenceUrl: `/sources/${encodeURIComponent(row.id)}`
  };
}
async function loadRecords() {
  const source = process.env.DEMO_DATA_SOURCE || 'public-profile-snapshot';
  let rows, audit = {}, fetchedAt = null;
  if (source === 'supabase') {
    const loaded = await readSupabaseRows(); fetchedAt = loaded.fetchedAt;
    const mapped = require('./supabase-mapper.cjs').mapSupabaseRows(loaded.rows);
    rows = mapped.records; audit = mapped.quality;
  } else if (source === 'public-profile-snapshot') {
    rows = require('./data/public-spire-records.cjs');
  } else { throw new Error('Unknown DEMO_DATA_SOURCE.'); }
  const normalized = rows.map(normalizeRecord).filter(Boolean);
  const records = [...new Map(normalized.map(r => [r.gmc || r.id, r])).values()];
  if (!records.length) throw new Error('No records have verifiable Spire affiliation and a Spire practice location.');
  return { records, source, fetchedAt, sourceLabel: source === 'supabase' ? 'DocMap consultant records · connected to Supabase' : 'Verified public Spire profiles · demo collection',
    quality: { input: rows.length, accepted: records.length, excluded: rows.length - records.length, ...audit,
      withInsuranceEvidence: records.filter(r => r.insurers.length).length, withGmc: records.filter(r => r.gmc).length,
      withPostcodes: records.filter(r => r.locations.some(l => l.postcode)).length } };
}
module.exports = { normalizeRecord, loadRecords, safeUrl, spireProfile };
