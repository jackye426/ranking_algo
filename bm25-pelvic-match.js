const fs = require('fs');
const path = require('path');

// ---------- Config ----------
const POGP_PATH = path.join(__dirname, 'pogp_profiles_20260213_133317.json');
const K1 = 1.2;
const B = 0.75;
const TOP_N = 5;

const PATIENT_QUERY = `Endometriosis Persistent pelvic pain Pain neuroscience Central sensitisation Complex pelvic pain`;

// ---------- Tokenizer ----------
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1);
}

// ---------- BM25 ----------
function buildBM25(corpus) {
  const N = corpus.length;
  const docTokens = corpus.map(d => tokenize(d.text));
  const docLengths = docTokens.map(tokens => tokens.length);
  const avgdl = docLengths.reduce((a, b) => a + b, 0) / N || 1;

  // document frequency: how many docs contain term t
  const df = new Map();
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  function idf(term) {
    const nt = df.get(term) || 0;
    return Math.log((N - nt + 0.5) / (nt + 0.5) + 1);
  }

  function termFreq(tokens, term) {
    let n = 0;
    for (const t of tokens) if (t === term) n++;
    return n;
  }

  function score(queryTokens, docIdx) {
    const tokens = docTokens[docIdx];
    const len = docLengths[docIdx];
    let s = 0;
    const seenInDoc = new Set();
    for (const term of queryTokens) {
      if (seenInDoc.has(term)) continue;
      seenInDoc.add(term);
      const tf = termFreq(tokens, term);
      if (tf === 0) continue;
      const idfVal = idf(term);
      const norm = 1 - B + B * (len / avgdl);
      s += idfVal * (tf * (K1 + 1)) / (tf + K1 * norm);
    }
    return s;
  }

  return { score, docTokens, N };
}

// ---------- Main ----------
const data = JSON.parse(fs.readFileSync(POGP_PATH, 'utf8'));

// London only; build document from statement + specialty (so query fits within their statement)
const london = data.profiles.filter(
  p => (p.region || '').toLowerCase().includes('london')
);

const corpus = london.map(p => {
  const parts = [
    p.personal_statement || '',
    p.specialty || '',
    (p.specialties || []).join(' '),
    p.practice_name || ''
  ];
  return { profile: p, text: parts.join(' ').trim() };
});

// Only score docs that have some content (at least statement or specialty)
const withText = corpus.filter(d => d.text.length > 0);
if (withText.length === 0) {
  console.log('No London profiles with statement/specialty text.');
  process.exit(1);
}

const { score: bm25Score } = buildBM25(withText);
const queryTokens = tokenize(PATIENT_QUERY);

const scored = withText.map((doc, i) => ({
  profile: doc.profile,
  bm25: bm25Score(queryTokens, i)
})).filter(x => x.bm25 > 0)
  .sort((a, b) => b.bm25 - a.bm25);

const top = scored.slice(0, TOP_N);

console.log('BM25 ranking: London (Greater London) POGP, query matched against statement/specialty\n');
console.log('Keywords: Endometriosis, Persistent pelvic pain, Pain neuroscience, Central sensitisation, Complex pelvic pain\n');
console.log(`Top ${top.length} matches (London region only):\n`);

top.forEach(({ profile: p, bm25 }, i) => {
  console.log(`${i + 1}. ${p.name} (BM25: ${bm25.toFixed(3)})`);
  console.log(`   ${p.member_type || '—'} | London: ${p.region || '—'}`);
  if (p.practice_name) console.log(`   Practice: ${p.practice_name}`);
  console.log(`   Specialties: ${(p.specialty || '—').slice(0, 80)}${(p.specialty || '').length > 80 ? '...' : ''}`);
  if (p.personal_statement) {
    const snip = (p.personal_statement || '').replace(/\s+/g, ' ').slice(0, 150);
    console.log(`   Statement: ${snip}${(p.personal_statement || '').length > 150 ? '...' : ''}`);
  }
  console.log(`   URL: ${p.profile_url}`);
  if (p.website) console.log(`   Website: ${p.website}`);
  console.log('');
});

// URLs only
console.log('--- URLs only ---');
top.forEach(({ profile: p }, i) => console.log(`${i + 1}. ${p.profile_url}`));
