const fs = require('fs');
const path = require('path');

const pogpPath = path.join(__dirname, 'pogp_profiles_20260213_133317.json');
const data = JSON.parse(fs.readFileSync(pogpPath, 'utf8'));

// Patient query keywords for relevance scoring
const queryKeywords = [
  'endometriosis', 'pelvic pain', 'chronic pain', 'post-surgical', 'surgery',
  'flare', 'exercise', 'pelvic floor', 'nerve', 'muscular', 'tension',
  'pain management', 'rehabilitation', 'urogynaecology', 'women'
];

function scoreProfile(p) {
  let score = 0;
  const region = (p.region || '').toLowerCase();
  if (!region.includes('london')) return -1;

  // Must be London
  score += 10;

  // Pelvic Pain specialty is essential for this query
  const specialties = (p.specialties || []).map(s => (s || '').toLowerCase());
  const specialtyStr = (p.specialty || '').toLowerCase();
  if (specialties.includes('pelvic pain') || specialtyStr.includes('pelvic pain')) {
    score += 50;
  } else {
    return -1; // exclude if no pelvic pain
  }

  // Full Member preferred (more qualified)
  if ((p.member_type || '').toLowerCase().includes('full member')) score += 15;

  // Urogynaecology often overlaps with endometriosis/gynae pain
  if (specialties.some(s => s.includes('urogynaecology'))) score += 12;
  // Musculo Skeletal – relevant for muscular imbalance / exercise
  if (specialties.some(s => s.includes('musculo skeletal'))) score += 8;
  // Sexual Dysfunction often co-managed with pelvic pain
  if (specialties.some(s => s.includes('sexual dysfunction'))) score += 5;
  // Sports – relevant for “exercise safely”
  if (specialties.some(s => s.includes('sports'))) score += 5;

  // Personal statement relevance
  const statement = (p.personal_statement || '').toLowerCase();
  if (statement) {
    for (const kw of queryKeywords) {
      if (statement.includes(kw)) score += 6;
    }
    if (statement.includes('pelvic pain')) score += 10;
    if (statement.includes('chronic') || statement.includes('pain management')) score += 5;
  }

  // Has practice/website – more contactable
  if (p.website) score += 5;
  if (p.practice_name) score += 3;

  return score;
}

const scored = data.profiles
  .map(p => ({ profile: p, score: scoreProfile(p) }))
  .filter(x => x.score >= 0)
  .sort((a, b) => b.score - a.score);

const top5 = scored.slice(0, 5);

console.log('Top 5 POGP matches for London-based pelvic pain / endometriosis-focused physiotherapist:\n');
top5.forEach(({ profile: p, score }, i) => {
  console.log(`${i + 1}. ${p.name} (score: ${score})`);
  console.log(`   Member: ${p.member_type || '—'}`);
  console.log(`   Specialties: ${p.specialty || '—'}`);
  if (p.personal_statement) console.log(`   Statement: ${(p.personal_statement || '').slice(0, 120)}...`);
  console.log(`   POGP profile: ${p.profile_url}`);
  if (p.website) console.log(`   Practice website: ${p.website}`);
  console.log('');
});
