'use strict';

// Mapping only: no requests, secrets, DB writes or fallback consultant records.
const publicProfiles = require('./data/public-spire-records.cjs');
const strings = value => Array.isArray(value) ? value.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [];
const unique = values => [...new Set(values)];
const text = value => typeof value === 'string' ? value.trim() : '';
function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function parseSpireProfile(value) {
  const safe = httpsUrl(value); if (!safe) return null;
  const u = new URL(safe);
  if (!/^(?:www\.)?spirehealthcare\.com$/i.test(u.hostname)) return null;
  let pathname; try { pathname=decodeURIComponent(u.pathname); } catch { return null; }
  const match = pathname.match(/^\/(?:consultant-profiles|(?:spire-[a-z0-9-]+|the-montefiore-hospital)\/(?:consultants|consultant-profiles))\/([\p{L}\p{N}-]+)\/?$/iu);
  if (!match || /^(?:profiles|consultant-search|search)$/i.test(match[1])) return null;
  const slug = match[1].toLowerCase();
  const number = slug.match(/-([cpn])(\d{5,9})$/i);
  const canonicalUrl = `https://www.spirehealthcare.com${u.pathname.replace(/\/+$/, '')}/`;
  return {
    url: canonicalUrl, slug,
    registrationType: number?.[1] || null,
    registrationId: number ? String(Number(number[2])) : null,
    identity: number ? `${number[1]}:${String(Number(number[2]))}` : canonicalUrl,
    namePart: slug.replace(/-[cpn]\d{5,9}$/i, '').replace(/-/g, ' '),
  };
}
function gmcIdentity(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  return /^\d{5,9}$/.test(raw) && Number(raw) > 0 ? String(Number(raw)) : null;
}
function nameTokens(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/\bnee?\b.*$/g, '').replace(/[^a-z\s'-]/g, ' ').replace(/'/g, '').replace(/-/g, ' ')
    .split(/\s+/).filter(x => x && !['mr','mrs','ms','miss','dr','doctor','prof','professor','sir','consultant','associate','frcs','frcp','mbbs','mbchb','phd','mrcs','mrcp'].includes(x));
}
function namesCompatible(a, b) {
  const aa = nameTokens(a), bb = nameTokens(b);
  if (aa.length < 2 || bb.length < 2) return aa.join(' ') === bb.join(' ') && aa.length > 0;
  const surname = parts => ['o','d'].includes(parts.at(-2)) ? parts.slice(-2).join('') : parts.at(-1);
  if (surname(aa) !== surname(bb)) return false;
  if (aa[0] === bb[0]) return true;
  // Only actual initials are expanded; unrelated names sharing an initial fail.
  if ((aa[0].length === 1 || bb[0].length === 1) && aa[0][0] === bb[0][0]) return true;
  const aliases = {tim:'timothy',ben:'benjamin',nick:'nicholas',mike:'michael',tony:'anthony',bob:'robert',rob:'robert',jim:'james',andy:'andrew',tom:'thomas',will:'william',paddy:'patrick',yega:'yegappan'};
  return (aliases[aa[0]] || aa[0]) === (aliases[bb[0]] || bb[0]);
}
function plainText(value) {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}
function sourceLink(row, source) {
  const key = text(source).toLowerCase();
  const urls = row.profile_urls && typeof row.profile_urls === 'object' ? row.profile_urls : {};
  return httpsUrl(urls[key]) || (key === 'spire' ? parseSpireProfile(urls.spire)?.url : null) || null;
}
function clinicalFields(row) {
  const supplied = unique([
    ...plainText(row.clinical_interests).split(/;|\r?\n/),
    ...strings(row.areas_of_interest).map(plainText),
  ].map(x => x.trim()).filter(x => x && !/^(?:null|none|n\/a|not available|unknown)$/i.test(x)));
  const about = plainText(row.about);
  // Exact extracted sentences only. No model inference, keyword expansion or
  // public-profile replacement of the Supabase clinical core.
  const extracted = supplied.length ? [] : (about.match(/[^.!?\n]+[.!?]?/g) || [])
    .map(x => x.trim()).filter(x => x.length >= 20 && x.length <= 350 && /specialis|interest|treat|expertise|practice\s+(?:focus|include)|\b(?:offer|perform)\b|diagnos/i.test(x) && !/undertook|training|trained|graduat|fellowship|qualified/i.test(x)).slice(0,3);
  return { clinicalInterests: supplied.length ? supplied : extracted, description: about, derivedFromAbout: !supplied.length && extracted.length > 0 };
}
function procedureFields(row) {
  // Structured procedure fields have no field-level provider link in this
  // schema. Keep the row reference instead of pretending the Spire identity
  // page is the source of a Bupa/PHIN-derived treatment description.
  const evidence = strings(row.procedures).map(plainText).filter(Boolean).map(value => ({
    text:value,sourceUrl:null,sourceRecordId:String(row.id),sourceField:'procedures',
  }));
  for (const item of Array.isArray(row.procedures_completed) ? row.procedures_completed : []) {
    if (!item || typeof item !== 'object') continue;
    const description=plainText(item.description); if (!description) continue;
    evidence.push({text:description,sourceUrl:null,sourceRecordId:String(row.id),sourceField:'procedures_completed',
      ...(text(item.hospital)?{hospital:text(item.hospital).replace(/nHospital\b/g,' Hospital')}:{}),
      ...(text(item.code)?{code:text(item.code)}:{}),
    });
  }
  // count_numeric is a midpoint of a bucket, not a measured volume. Neither it
  // nor the bucket is copied to records, evidence, provenance or ranking.
  return {procedures:unique(evidence.map(e=>e.text)),procedureEvidence:evidence};
}
function numericCoordinate(value, bound) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  const n = Number(value); return Number.isFinite(n) && Math.abs(n) <= bound ? n : null;
}
function mapLocation(location, row, profile) {
  if (!location || typeof location !== 'object') return null;
  // Correct one observed ingestion escape artefact, without guessing names.
  const name = text(location.hospital).replace(/nHospital\b/g, ' Hospital').replace(/\s+/g, ' ');
  if (!/^spire\b/i.test(name)) return null;
  const website = httpsUrl(location.website);
  const directSource = sourceLink(row, location.source);
  let latitude=numericCoordinate(location.latitude,90),longitude=numericCoordinate(location.longitude,180);
  if(latitude==null || longitude==null) {latitude=null;longitude=null;}
  return {
    name, address: text(location.address) || text(location.street), city: text(location.city), region: text(location.region),
    postcode: text(location.postcode).toUpperCase().replace(/\s+/g, '').replace(/^(.*\d)(\d[A-Z]{2})$/, '$1 $2'),
    latitude, longitude,
    sourceUrl: website || directSource || profile.url,
    provenance: { source: text(location.source) || 'integrated_practitioners', sourceRecordId: String(row.id),
      sourceUrl: directSource, website, profileIdentityUrl: profile.url,
      sourceLinkIsIdentityOnly: !website && !directSource },
  };
}
function mergeLocations(locations) {
  const result = new Map();
  for (const location of locations) {
    const key = [location.name.toLowerCase(), location.postcode.replace(/\s/g, ''), location.postcode ? '' : location.address.toLowerCase()].join('|');
    const old = result.get(key);
    if (!old) { result.set(key, {...location, provenance: [location.provenance]}); continue; }
    old.provenance.push(location.provenance);
    for (const field of ['address','city','region','postcode']) if (!old[field] && location[field]) old[field] = location[field];
    if (old.latitude == null && location.latitude != null) old.latitude = location.latitude;
    if (old.longitude == null && location.longitude != null) old.longitude = location.longitude;
    if (old.latitude != null && location.latitude != null && (Math.abs(old.latitude-location.latitude)>0.002 || Math.abs(old.longitude-location.longitude)>0.002)) {
      old.latitude = null; old.longitude = null; old.coordinateConflict = true;
    }
    if (old.coordinateConflict) { old.latitude = null; old.longitude = null; }
  }
  return [...result.values()];
}
function flag(value) { return value === true || value === 1 || value === 'true'; }

function mapSupabaseRows(rows, { supplements = publicProfiles } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Supabase rows must be an array.');
  const rejected = {}, blocked = new Set(), prepared = [];
  const reject = reason => { rejected[reason] = (rejected[reason] || 0) + 1; };
  // A blocked duplicate cannot be resurrected via another row of the identity.
  for (const row of rows) {
    if (!row || !(flag(row.do_not_recommend) || flag(row.requires_review))) continue;
    const profile = parseSpireProfile(row.profile_urls?.spire), gmc = gmcIdentity(row.gmc_number);
    if (profile) blocked.add(profile.identity);
    if (gmc) blocked.add(`c:${gmc}`);
  }
  for (const row of rows) {
    if (!row || row.id == null || !String(row.id).trim() || !text(row.name)) { reject('missingIdentity'); continue; }
    const profile = parseSpireProfile(row.profile_urls?.spire);
    if (!profile) { reject('invalidSpireProfile'); continue; }
    const gmc = gmcIdentity(row.gmc_number);
    if (row.gmc_number != null && String(row.gmc_number).trim() && !gmc) { reject('invalidGmc'); continue; }
    if (flag(row.do_not_recommend) || flag(row.requires_review)) { reject('flagged'); continue; }
    if (blocked.has(profile.identity) || (gmc && blocked.has(`c:${gmc}`))) { reject('flaggedDuplicate'); continue; }
    if (gmc && profile.registrationType === 'c' && gmc !== profile.registrationId) { reject('gmcProfileMismatch'); continue; }
    if (gmc && profile.registrationType && profile.registrationType !== 'c') { reject('registrationTypeConflict'); continue; }
    if (!namesCompatible(row.name, profile.namePart)) { reject('nameProfileMismatch'); continue; }
    const locations = (Array.isArray(row.locations) ? row.locations : []).map(l => mapLocation(l,row,profile)).filter(Boolean);
    if (!locations.length) { reject('noSpireLocation'); continue; }
    prepared.push({row,profile,gmc,locations,clinical:clinicalFields(row),procedure:procedureFields(row),key:gmc ? `c:${gmc}` : profile.identity});
  }
  // Also prevent a no-number URL being attached to two different GMCs.
  const urlGroups = new Map();
  for (const entry of prepared) {
    const list = urlGroups.get(entry.profile.url) || []; list.push(entry); urlGroups.set(entry.profile.url,list);
  }
  const conflictKeys = new Set();
  for (const group of urlGroups.values()) if (unique(group.map(e=>e.gmc).filter(Boolean)).length > 1) group.forEach(e=>conflictKeys.add(e.key));
  const groups = new Map(), parents=new Map();
  const find=key=>{if(!parents.has(key)) parents.set(key,key); if(parents.get(key)!==key) parents.set(key,find(parents.get(key))); return parents.get(key);};
  for (const entry of prepared) parents.set(find(`url:${entry.profile.url}`),find(entry.key));
  for (const entry of prepared) { const key=find(entry.key),list=groups.get(key)||[]; list.push(entry); groups.set(key,list); }
  const records=[]; let duplicateRowsMerged=0, derivedClinicalRows=0;
  for (const [, group] of groups) {
    if (group.some(e=>conflictKeys.has(e.key)) || unique(group.map(e=>e.gmc).filter(Boolean)).length>1 || group.some(e=>!namesCompatible(e.row.name,group[0].row.name))) {
      group.forEach(()=>reject('duplicateIdentityConflict')); continue;
    }
    const ordered = [...group].sort((a,b)=>String(a.row.id).localeCompare(String(b.row.id)));
    const first = ordered[0], gmc = ordered.find(e=>e.gmc)?.gmc || null;
    const identity=gmc?`c:${gmc}`:first.profile.identity;
    const locations=mergeLocations(ordered.flatMap(e=>e.locations));
    const interests=unique(ordered.flatMap(e=>e.clinical.clinicalInterests));
    const descriptions=unique(ordered.map(e=>e.clinical.description).filter(Boolean));
    const bestDescription = [...descriptions].sort((a,b)=>b.length-a.length)[0] || '';
    const specialties=unique(ordered.map(e=>text(e.row.specialty)).filter(Boolean));
    const procedures=unique(ordered.flatMap(e=>e.procedure.procedures));
    const procedureEvidence=ordered.flatMap(e=>e.procedure.procedureEvidence);
    const profileUrls=unique(ordered.map(e=>e.profile.url));
    const supplement = supplements.find(s=>{
      const p=parseSpireProfile(s.profileUrl); if (!p || !namesCompatible(first.row.name,s.name)) return false;
      return (gmc && gmcIdentity(s.gmc)===gmc && (p.registrationType!=='c'||p.registrationId===gmc)) || profileUrls.includes(p.url);
    });
    const insuranceEvidence = supplement ? (supplement.insuranceEvidence || []).filter(e=>text(e.insurer)&&httpsUrl(e.sourceUrl)&&text(e.text)).map(e=>({
      insurer:e.insurer, sourceUrl:httpsUrl(e.sourceUrl), text:e.text,
      provenance:{type:'verified-public-profile-supplement',match:gmc&&gmcIdentity(supplement.gmc)===gmc?'exact-gmc':'exact-profile-url',retrievedAt:supplement.retrievedAt,profileUrl:supplement.profileUrl},
    })) : [];
    const insurers=unique(insuranceEvidence.map(e=>e.insurer));
    const clinicalProvenance=ordered.map(e=>({sourceRecordId:String(e.row.id),field:e.clinical.derivedFromAbout?'about':'clinical_interests / areas_of_interest',
      source:e.clinical.derivedFromAbout?text(e.row.about_source):'integrated_practitioners',
      sourceUrl:e.clinical.derivedFromAbout?sourceLink(e.row,e.row.about_source):null,
      profileIdentityUrl:e.profile.url,derivedBy:e.clinical.derivedFromAbout?'exact-sentence-extraction':null,values:e.clinical.clinicalInterests}));
    records.push({
      id:`supabase-${identity.replace(/[^a-z0-9]+/gi,'-')}`, name:text(first.row.name), gmc,
      specialty:specialties.join(' / '), clinicalInterests:interests, description:bestDescription, procedures, procedureEvidence,
      locations, insurers, insuranceEvidence, profileUrl:first.profile.url,
      sourceUrls:unique([...profileUrls,...ordered.flatMap(e=>[...strings(e.row.urls),...Object.values(e.row.profile_urls||{})].map(httpsUrl).filter(Boolean)),...insuranceEvidence.map(e=>e.sourceUrl)]),
      affiliationEvidence:{sourceUrl:first.profile.url,text:`The Supabase consultant record links an official Spire profile and lists ${locations.map(l=>l.name).join(' and ')} as practice locations.`,
        source:'integrated_practitioners',sourceRecordIds:ordered.map(e=>String(e.row.id)),identityChecks:['official-spire-profile','compatible-profile-name',...(gmc?['gmc-profile-number-consistent']:[])]},
      imageUrl:supplement?httpsUrl(supplement.imageUrl):null,
      languages:unique(ordered.flatMap(e=>strings(e.row.languages))), gender:null,
      retrievedAt:null, sourceMergeDates:unique(ordered.map(e=>text(e.row.merge_date)).filter(Boolean)),
      sourceRecordIds:ordered.map(e=>String(e.row.id)),
      fieldProvenance:{clinicalInterests:clinicalProvenance,description:ordered.filter(e=>e.clinical.description===bestDescription).map(e=>({sourceRecordId:String(e.row.id),source:text(e.row.about_source)||'integrated_practitioners',sourceUrl:sourceLink(e.row,e.row.about_source),profileIdentityUrl:e.profile.url})),
        specialty:ordered.map(e=>({sourceRecordId:String(e.row.id),source:text(e.row.specialty_source)||'integrated_practitioners',sourceUrl:sourceLink(e.row,e.row.specialty_source)})),
        procedures:procedureEvidence.map(e=>({...e,source:'integrated_practitioners'}))},
      supplementalEvidence:supplement?{profileUrl:supplement.profileUrl,retrievedAt:supplement.retrievedAt,fields:[...(insuranceEvidence.length?['insuranceEvidence','insurers']:[]),...(httpsUrl(supplement.imageUrl)?['imageUrl']:[])]}:null,
    });
    duplicateRowsMerged += ordered.length-1;
    derivedClinicalRows += ordered.filter(e=>e.clinical.derivedFromAbout).length;
  }
  const excludedRows=Object.values(rejected).reduce((a,b)=>a+b,0);
  return {records,quality:{input:rows.length,accepted:records.length,excluded:rows.length-records.length,excludedRows,duplicateRowsMerged,rejected,
    withInsuranceEvidence:records.filter(r=>r.insurers.length).length,withGmc:records.filter(r=>r.gmc).length,
    withPostcodes:records.filter(r=>r.locations.some(l=>l.postcode)).length,withClinicalInterests:records.filter(r=>r.clinicalInterests.length).length,
    withProcedures:records.filter(r=>r.procedures.length).length,
    derivedClinicalRows,withPublicSupplements:records.filter(r=>r.supplementalEvidence).length,
    insuranceNote:'BUPA source labels alone are not insurer acceptance evidence; only exact-identity public evidence supplements are used.'}};
}
module.exports={mapSupabaseRows,parseSpireProfile,namesCompatible,gmcIdentity,clinicalFields,procedureFields,mergeLocations};
