'use strict';

const {PROCEDURES, detectSpecialties, detectProcedures, inferTopicSpecialties} = require('./clinical-filters.cjs');

// A conservative, local parser. It extracts preferences, never medical diagnoses.
// Search receives the same accumulated criteria that the interface displays.
const EMPTY = Object.freeze({ topic: '', specialty: null, procedures: Object.freeze([]), location: null, insurance: null, sortByDistance: false, radiusMiles: null, gender: null, language: null });
const INSURERS = [
  ['Bupa', /\bbupa(?:\s+(?:healthcare|international))?\b/gi],
  ['AXA', /\baxa(?:\s+(?:ppp(?:\s+healthcare)?|health))?\b/gi],
  ['Aviva', /\baviva\b/gi], ['Vitality', /\bvitality(?:health)?\b/gi],
  ['WPA', /\bwpa\b/gi], ['Cigna', /\bcigna(?:\s+international)?\b/gi],
  ['The Exeter', /\b(?:the\s+exeter|exeter\s+family\s+friendly)\b/gi],
  ['Allianz', /\ballianz\b/gi], ['Healix', /\bhealix\b/gi],
  ['Aetna', /\baetna(?:\s+global\s+benefits)?\b/gi],
  ['Simplyhealth', /\bsimplyhealth\b/gi], ['Saga', /\bsaga(?:\s+healthcare)?\b/gi],
  ['Freedom', /\bfreedom\s+(?:health|insurance)\b/gi],
];
const LANGUAGES = ['English', 'French', 'Spanish', 'Arabic', 'Hindi', 'Urdu', 'Punjabi', 'Bengali', 'Gujarati', 'Mandarin', 'Cantonese', 'Chinese', 'Polish', 'German', 'Italian', 'Portuguese', 'Russian', 'Turkish', 'Greek', 'Romanian', 'Tamil', 'Telugu', 'Welsh', 'Japanese', 'Korean', 'Persian', 'Farsi', 'Hebrew', 'Swahili'];
const KNOWN_PLACES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Nottingham', 'Leicester', 'Oxford', 'Cambridge', 'Reading', 'Southampton', 'Brighton', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast', 'Newcastle', 'Bath', 'York', 'Norwich', 'Exeter', 'Guildford', 'Watford', 'Bushey', 'Harpenden', 'Brentwood', 'Harrow', 'Windsor', 'Chelmsford', 'Southend', 'Sutton', 'Croydon', 'Slough', 'Woking', 'Canterbury', 'St Albans', 'Milton Keynes', 'South West London', 'North London', 'East London', 'West London', 'South London', 'Surrey', 'Essex', 'Kent', 'Hertfordshire'];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POSTCODE = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?(?:\s?\d[A-Z]{2})?)\b/gi;
const CLINICAL_WORDS = /\b(?:pain|ache|aching|joint|knee|hip|shoulder|back|spine|neck|foot|feet|ankle|hand|wrist|elbow|chest|heart|skin|ear|eye|nose|throat|stomach|abdomen|pelvis|bowel|bladder|head|leg|arm|finger|toe|breast|prostate|kidney|liver|lung|my|his|her|their|the|a|an|both|left|right)\b/i;

function normalizePostcode(value) {
  const compact = value.replace(/\s/g, '').toUpperCase();
  return /\d[A-Z]{2}$/.test(compact) && compact.length > 4 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

function normalizePrevious(previous) {
  const p = previous && typeof previous === 'object' ? previous : {};
  return {
    topic: typeof p.topic === 'string' ? p.topic : '',
    specialty: typeof p.specialty === 'string' && p.specialty.trim() ? p.specialty : null,
    procedures: [...new Set(Array.isArray(p.procedures) ? p.procedures.filter(value => typeof value === 'string' && value.trim()) : [])],
    location: typeof p.location === 'string' && p.location.trim() ? p.location : null,
    insurance: typeof p.insurance === 'string' && p.insurance.trim() ? p.insurance : null,
    sortByDistance: p.sortByDistance === true,
    radiusMiles: Number.isFinite(p.radiusMiles) && p.radiusMiles > 0 ? p.radiusMiles : null,
    gender: typeof p.gender === 'string' && p.gender.trim() ? p.gender : null,
    language: typeof p.language === 'string' && p.language.trim() ? p.language : null,
  };
}

function cleanTopic(value) {
  return value.toLowerCase()
    .replace(/\b(?:spire(?:\s+healthcare)?|docmap|consultants?|specialists?|doctors?|surgeons?|physicians?|practitioners?|profiles?|results?)\b/g, ' ')
    .replace(/\b(?:find|search|show|looking|look|need|want|help|recommend|recommendations?|someone|anyone|somebody|please|only|those|ones|one|who|that|which|with|without|accepting|accepts?|taking|takes|insurance|insurer|insured|covered|cover|coverage|provider|providers|instead|rather|than|change|switch|make|it|them|they|these|now|also|just|still|same|closer|nearest|closest|nearer|sort|distance|first|based|located|practising|practicing|working|offering|seeing|treating|treats|offered|perform(?:s|ing)?|offer(?:s)?|carry|carries|carrying|out|experienced|expertise|specialt(?:y|ies)|specialit(?:y|ies)|procedures?|filters?|remove|clear|drop|ignore|add|include|including|keep|require(?:d|s)?|as\s+well)\b/g, ' ')
    .replace(/\b(?:i|i'm|im|am|me|my|we|our|you|your|can|could|would|should|will|do|does|doing|undertake|undertakes|undertaking|provide|provides|providing|both|either|too|have|has|had|been|be|is|are|a|an|the|for|to|of|in|on|at|by|and|but|from|as|get|go|actually|when)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(?:or(?:\s+|$))+|(?:\s+or)+$/g, '').trim();
}

const bodyAreas = text => [...new Set((text || '').toLowerCase().match(/\b(?:knee|hip|shoulder|ankle|wrist|elbow|spine)\b/g) || [])];
const unique = values => [...new Set(values)];
function explicitSpecialties(text) {
  return detectSpecialties(text).filter(match => !(match.label==='Pain medicine' && /^pain\s+specialist/i.test(match.text) && /\b(?:knee|hip|shoulder|ankle|wrist|elbow|back|neck)\s*$/i.test(text.slice(0,match.start))));
}
function removeSpans(text, matches) {
  const spans = [...matches].sort((a,b) => b.start-a.start);
  for (const match of spans) text = text.slice(0,match.start) + (match.replacement || '').padEnd(match.end-match.start,' ') + text.slice(match.end);
  return text;
}
function clinicalReplacement(text) {
  const instead = text.match(/^(.*?)\b(?:instead\s+of|rather\s+than)\b([\s\S]+)$/i);
  if (instead) return {target:instead[1],old:instead[2]};
  const change = text.match(/\b(?:switch|change|replace)\s+(?:from\s+)?([\s\S]+?)\s+(?:to|with)\s+([\s\S]+)$/i);
  if (change) return {target:change[2],old:change[1]};
  return /\b(?:instead|switch\s+to|change\s+to)\b/i.test(text) ? {target:text,old:''} : null;
}
function contextualProcedures(matches, text, criteria) {
  const explicit = bodyAreas(text);
  const context = explicit.length ? explicit : bodyAreas([criteria.topic,...criteria.procedures].join(' '));
  return unique(matches.map(match => {
    if (context.length !== 1) return match.label;
    const area = context[0][0].toUpperCase()+context[0].slice(1);
    const label = match.label === 'Arthroscopy' ? `${area} arthroscopy`
      : match.label === 'Joint replacement' ? `${area} replacement` : match.label;
    return PROCEDURES.some(procedure => procedure.label === label) ? label : match.label;
  }));
}
function clinicalConflict(criteria, specialty) {
  if (!specialty) return false;
  const topicOptions = inferTopicSpecialties(criteria.topic);
  if (topicOptions.length && !topicOptions.includes(specialty)) return true;
  return criteria.procedures.some(label => {
    const definition = PROCEDURES.find(procedure => procedure.label === label);
    return definition?.specialties?.length && !definition.specialties.includes(specialty);
  });
}
function extractClinicalRefinement(criteria, input) {
  let text = input;
  const notices = [];
  const reset = /\b(?:(?:reset|clear|replace)\s+(?:the\s+|my\s+)?clinical\s+(?:criteria|search|filters)|(?:start|begin)\s+(?:a\s+)?new\s+clinical\s+search)(?:\s+(?:to|for|with))?\b/gi;
  if (reset.test(text)) {
    criteria.topic=''; criteria.specialty=null; criteria.procedures=[];
    reset.lastIndex=0; text=text.replace(reset,' ');
    notices.push('Started a new clinical search and kept your location, insurance and other preferences.');
  }
  const clearSpecialty = /\b(?:any\s+special(?:t|it)y|all\s+special(?:t|it)ies|(?:remove|clear|drop|ignore)\s+(?:the\s+)?special(?:t|it)y(?:\s+(?:filter|requirement|restriction))?)\b/gi;
  const clearProcedures = /\b(?:any\s+procedures?|all\s+procedures|(?:remove|clear|drop|ignore)\s+(?:the\s+)?procedures?(?:\s+(?:filter|requirement|restriction))?)\b/gi;
  if (clearSpecialty.test(text)) { criteria.specialty=null; clearSpecialty.lastIndex=0; text=text.replace(clearSpecialty,' '); }
  if (clearProcedures.test(text)) { criteria.procedures=[]; clearProcedures.lastIndex=0; text=text.replace(clearProcedures,' '); }
  const specialties=explicitSpecialties(text), procedures=detectProcedures(text);
  const replacement=clinicalReplacement(text);
  const target=replacement?.target || text;
  const specialtyLabels=unique(explicitSpecialties(target).map(match=>match.label));
  const targetProcedures=detectProcedures(target);
  const procedureLabels=contextualProcedures(targetProcedures,target,criteria);
  // Validate the requested procedure, leaving subsequent supported preference
  // clauses for their own parsers. Unknown procedures before the boundary must
  // still fail closed, including mixed known-and-unknown procedure requests.
  const explicitProcedureRequest=target.match(/\b(?:perform(?:s|ing)?|offer(?:s|ing)?|provide(?:s|ing)?|undertake(?:s|ing)?|carry(?:ing)?\s+out)\s+(.+?)(?=[\s,;]+(?:and\s+)?(?:in|near|around|accept(?:s|ing)?|covered|insured|who|with|closer|nearest|closest|nearer|within|under|less\s+than|sort\s+by\s+distance|speak(?:s|ing)?|fluent\s+in)\b|$)/i);
  const additiveProcedureRequest=!procedures.length && /^\s*(?:also|only|add|include)\b/i.test(target) && /\b(?:treatment|injections?|resurfacing|replacement|repair|reconstruction|arthroscopy|ablation|implantation|surgery)\b/i.test(target);
  if (explicitProcedureRequest || additiveProcedureRequest) {
    const requested=explicitProcedureRequest?.[1] || target;
    const unrecognised=cleanTopic(removeSpans(requested,detectProcedures(requested))).replace(/\b(?:both|surgery|procedures?|treatments?|too)\b/g,'').trim();
    if (unrecognised) return {blocked:true,notices:['I do not recognise that requested procedure as a supported filter, so your current criteria are unchanged. Try a named procedure such as knee replacement or arthroscopy.']};
  }
  // A procedure array means AND. Never silently turn alternatives into an AND
  // filter or discard a requested alternative to fit the single-specialty field.
  if (specialtyLabels.length>1 || (procedures.length && /\bor\b/i.test(target) && (procedureLabels.length>1 || /\b(?:hip|knee|shoulder)\s+or\s+(?:hip|knee|shoulder)\b/i.test(target)))) {
    return {blocked:true,notices:[specialtyLabels.length>1 ? 'Choose one specialty at a time; your current criteria are unchanged.' : 'Procedure filters require every selected procedure. Choose one procedure, or say “both” to require all of them; your current criteria are unchanged.']};
  }
  const removingSpecific = /\b(?:remove|drop|clear)\b/i.test(target) && !replacement;
  if (removingSpecific) {
    if (specialtyLabels.includes(criteria.specialty)) criteria.specialty=null;
    criteria.procedures=criteria.procedures.filter(label=>!procedureLabels.includes(label));
  } else {
    if (procedureLabels.length) {
      const priorProcedures=[...criteria.procedures];
      criteria.procedures=replacement ? procedureLabels : unique([...criteria.procedures,...procedureLabels]);
      const newBodies=bodyAreas(procedureLabels.join(' '));
      if (replacement && newBodies.length===1) {
        const oldBodies=bodyAreas(replacement.old || [criteria.topic,...priorProcedures].join(' ')).filter(body=>body!==newBodies[0]);
        let changed=false;
        for (const body of oldBodies) {
          const pattern=new RegExp(`\\b${body}\\b`,'gi');
          if (pattern.test(criteria.topic)) { criteria.topic=criteria.topic.replace(pattern,newBodies[0]); changed=true; }
        }
        if (changed) notices.push(`Changed the clinical focus to ${newBodies[0]} to match your replacement procedure and removed the previous procedure requirements.`);
      }
      if (!criteria.topic && newBodies.length===1) criteria.topic=newBodies[0];
    }
    const selectedSpecialty=specialtyLabels[0] || criteria.specialty;
    if (clinicalConflict(criteria,selectedSpecialty)) {
      return {blocked:true,notices:[`${selectedSpecialty} conflicts with your existing clinical criteria, so I have kept them. To change the clinical focus, say “reset clinical search to ${specialtyLabels[0] || procedureLabels.join(' and ')}”; your location and insurance will stay.`]};
    }
    if (specialtyLabels.length) criteria.specialty=specialtyLabels[0];
  }
  // Recorded-title aliases such as "knee surgeon" identify Orthopaedics, but
  // the user's explicit body concern must remain an independent criterion.
  text=removeSpans(text,[...specialties.map(match=>({...match,replacement:bodyAreas(match.text).join(' ')})),...procedures]);
  return {text,notices};
}

function updateCriteria(previous, message, { removeCriterion } = {}) {
  const criteria = normalizePrevious(previous);
  const notices = [];
  if (removeCriterion && Object.hasOwn(EMPTY, removeCriterion)) {
    criteria[removeCriterion] = removeCriterion==='procedures' ? [] : EMPTY[removeCriterion];
    if (removeCriterion === 'location') { criteria.sortByDistance = false; criteria.radiusMiles = null; }
    return { criteria, notices };
  }
  if (typeof message !== 'string' || !message.trim()) return { criteria, notices };
  let text = message.trim().slice(0, 2000);
  const original = text;

  // Explicit removal is supported. Exclusion is a different operation: there is
  // no negative-filter field in the contract, so never reverse "not female" or
  // "no Bupa" into a positive requirement (or a replacement clinical topic).
  const insurerNames = INSURERS.map(([, pattern]) => pattern.source).join('|');
  const removalRules = [
    ['insurance', new RegExp(`\\b(?:(?:${insurerNames}|(?:the\\s+)?(?:insurance|insurer)(?:\\s+(?:filter|requirement|preference))?)\\s+(?:(?:is|are)\\s+)?(?:(?:not|no\\s+longer)\\s+(?:necessary|required|needed)|unnecessary)|(?:i\\s+)?(?:do\\s+not|don't|no\\s+longer)\\s+need\\s+(?:${insurerNames}|(?:the\\s+)?(?:insurance|insurer)(?:\\s+filter)?)|(?:no|without)\\s+insurance(?:\\s+(?:filter|preference|restriction))?|no\\s+(?:insurer\\s+preference|preference\\s+for\\s+(?:insurance|insurer)))\\b`, 'gi')],
    ['gender', /\b(?:no\s+gender\s+preference|no\s+preference\s+(?:for|on)\s+gender)\b/gi],
    ['language', /\b(?:no\s+language\s+preference|no\s+preference\s+(?:for|on)\s+language)\b/gi],
    ['location', /\b(?:no\s+location\s+(?:filter|preference|restriction)|no\s+preference\s+(?:for|on)\s+location)\b/gi],
    ['specialty', /\b(?:no\s+special(?:t|it)y\s+(?:filter|preference|restriction)|no\s+preference\s+(?:for|on)\s+special(?:t|it)y)\b/gi],
    ['procedures', /\b(?:no\s+procedures?\s+(?:filter|preference|restriction)|no\s+preference\s+(?:for|on)\s+procedures?)\b/gi],
  ];
  for (const [key, pattern] of removalRules) {
    if (pattern.test(text)) {
      criteria[key] = key==='procedures' ? [] : null;
      if (key === 'location') { criteria.sortByDistance = false; criteria.radiusMiles = null; }
      pattern.lastIndex = 0; text = text.replace(pattern, ' ');
    }
  }
  if (/\b(?:not|no\s+(?!problem\b)|without|exclude|excluding|except|avoid|don't|do\s+not|doesn't|does\s+not)\b/i.test(text)) {
    return { criteria: normalizePrevious(previous), notices: ['Excluding a specific preference is not supported yet, so I have kept your current criteria. To remove a filter, say “any insurer”, “any gender” or “anywhere”, or remove its chip.'] };
  }

  const unsupported = [
    [/\b(?:(?:only\s+)?(?:available|appointments?|availability|bookable|book|see\s+(?:me|someone))\s+)?(?:after|before)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b(?:\s+(?:only|on\s+weekdays))?/gi, 'Appointment times are not available in these records, so I cannot filter by appointment time.'],
    [/\b(?:(?:available|appointments?|availability|bookable|book)\s+)?(?:today|tomorrow|tonight|this\s+(?:week|weekend|month)|next\s+(?:week|weekend|month)|(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s+(?:appointments?|only))?\b/gi, 'These records do not include live appointment availability.'],
    [/\b(?:available|appointments?|availability|bookable)\s+(?:in\s+the\s+)?(?:evenings?|mornings?|afternoons?|weekends?)\b/gi, 'These records do not include appointment schedules.'],
    [/(?:\b(?:under|below|less\s+than|up\s+to|maximum|max|budget(?:\s+of)?)\s*)£\s*\d+(?:\.\d{1,2})?/gi, 'Consultation fees are not consistently available, so I cannot apply a price filter.'],
    [/\b(?:rated?\s+(?:over|above|at\s+least)\s+\d(?:\.\d)?|\d(?:\.\d)?\s*(?:star|stars)(?:\s+(?:or\s+)?(?:above|higher))?)\b/gi, 'Comparable ratings are not available for every consultant, so I cannot apply a rating filter.'],
  ];
  for (const [pattern, notice] of unsupported) {
    if (pattern.test(text)) { notices.push(notice); pattern.lastIndex = 0; text = text.replace(pattern, ' '); }
    pattern.lastIndex = 0;
  }

  const clinical=extractClinicalRefinement(criteria,text);
  if (clinical.blocked) return {criteria:normalizePrevious(previous),notices:clinical.notices};
  text=clinical.text; notices.push(...clinical.notices);

  // Multiple explicit alternatives need clarification instead of quietly choosing one.
  const insurerHits = INSURERS.flatMap(([name, pattern]) => { pattern.lastIndex = 0; const hit = pattern.test(text); pattern.lastIndex = 0; return hit ? [name] : []; });
  const clearInsurance = /\b(?:any\s+(?:insurance|insurer)|all\s+insurers|no\s+insurance\s+(?:filter|preference|restriction)|(?:remove|clear|drop|ignore)\s+(?:the\s+)?(?:insurance|insurer|bupa|axa)(?:\s+(?:filter|requirement|restriction))?|self[- ]pay|self[- ]fund(?:ed|ing)|pay(?:ing)?\s+privately)\b/i;
  if (clearInsurance.test(text)) { criteria.insurance = null; text = text.replace(new RegExp(clearInsurance.source, 'gi'), ' '); }
  else if (insurerHits.length > 1 && !/\b(?:instead\s+of|rather\s+than|from\b.+\bto)\b/i.test(text)) {
    notices.push('Please choose one insurer at a time; your existing insurance preference is unchanged.');
  } else if (insurerHits.length) {
    let selected = insurerHits[0];
    if (insurerHits.length > 1) {
      const alternative = text.match(/(.+?)\b(?:instead\s+of|rather\s+than)\b/i)?.[1] || text.match(/\bto\s+(.+)$/i)?.[1] || text;
      selected = INSURERS.find(([, pattern]) => { pattern.lastIndex = 0; const hit = pattern.test(alternative); pattern.lastIndex = 0; return hit; })?.[0] || selected;
    }
    criteria.insurance = selected;
  }
  for (const [, pattern] of INSURERS) { pattern.lastIndex = 0; text = text.replace(pattern, ' '); }
  if (!insurerHits.length) {
    const unknownInsurance = text.match(/\b(?:accepting|accepts|covered\s+by|insured\s+with)\s+([\p{L}][\p{L}\s-]{1,35}?)(?=\s+(?:in|near|for|and|only)\b|[,;.!?]|$)/iu);
    if (unknownInsurance) {
      notices.push(`I do not recognise the insurer “${unknownInsurance[1].trim()}”. Your current insurance preference is unchanged.`);
      text = text.replace(unknownInsurance[0], ' ');
    }
  }

  const clearGender = /\b(?:any\s+gender|either\s+gender|no\s+gender\s+preference|(?:remove|clear|drop|ignore)\s+(?:the\s+)?gender(?:\s+filter)?)\b/gi;
  if (clearGender.test(text)) { criteria.gender = null; clearGender.lastIndex = 0; text = text.replace(clearGender, ' '); }
  else {
    const gender = text.match(/\b(female|male|woman|man|women|men)\b/i);
    if (gender) { criteria.gender = /^(female|woman|women)$/i.test(gender[1]) ? 'Female' : 'Male'; text = text.replace(/\b(female|male|woman|man|women|men)\b/gi, ' '); }
  }
  const clearLanguage = /\b(?:any\s+language|no\s+language\s+preference|(?:remove|clear|drop|ignore)\s+(?:the\s+)?language(?:\s+filter)?)\b/gi;
  if (clearLanguage.test(text)) { criteria.language = null; clearLanguage.lastIndex = 0; text = text.replace(clearLanguage, ' '); }
  else {
    const languagePattern = new RegExp(`\\b(?:(?:who\\s+)?speak(?:s|ing)?\\s+|fluent\\s+in\\s+)?(${LANGUAGES.join('|')})(?:[- ]speaking)?\\b`, 'gi');
    const languages = [...text.matchAll(languagePattern)];
    if (languages.length) {
      criteria.language = LANGUAGES.find(language => language.toLowerCase() === languages.at(-1)[1].toLowerCase());
      text = text.replace(languagePattern, ' ');
    }
  }

  const clearLocation = /\b(?:anywhere|any\s+location|no\s+location\s+(?:filter|preference|restriction)|(?:remove|clear|drop|ignore)\s+(?:the\s+)?location(?:\s+(?:filter|restriction))?|across\s+(?:the\s+)?(?:uk|country))\b/gi;
  let nextLocation = null;
  let foundLocation = false;
  let radius = null;
  const wantsDistance = /\b(?:closer|nearest|closest|nearer|sort\s+by\s+distance)\b/i.test(text);
  const personalLocation = /\b(?:near\s+me|near\s+home|closer\s+to\s+(?:me|home)|in\s+my\s+(?:area|neighbourhood|neighborhood))\b/gi;
  if (personalLocation.test(text)) {
    notices.push('Tell me a town or postcode; I do not have access to your current location.');
    personalLocation.lastIndex = 0; text = text.replace(personalLocation, ' ');
  }
  if (clearLocation.test(text)) {
    criteria.location = null; criteria.sortByDistance = false; criteria.radiusMiles = null;
    clearLocation.lastIndex = 0; text = text.replace(clearLocation, ' ');
  } else {
    const radiusMatch = text.match(/\b(?:within|under|less\s+than)\s+(\d+(?:\.\d+)?)\s*(miles?|mi|km|kilomet(?:re|er)s?)\b/i);
    if (radiusMatch) {
      radius = Number(radiusMatch[1]) * (/^(km|kilomet)/i.test(radiusMatch[2]) ? 0.621371 : 1);
      if (radius <= 0 || radius > 500) { notices.push('Please choose a search radius between 1 and 500 miles.'); radius = null; }
      text = text.replace(radiusMatch[0], ' ');
    }
    POSTCODE.lastIndex = 0;
    const postcodes = [...text.matchAll(POSTCODE)].filter(match => {
      const before = text.slice(0, match.index);
      const after = text.slice(match.index + match[0].length);
      const explicit = /\b(?:in|near|around|to|of|postcode)\s*$/i.test(before);
      const full = /\d\s*[a-z]{2}$/i.test(match[0]);
      // B12 and vertebral levels can resemble postcode districts. Only treat
      // these as locations when the person actually supplied a location cue.
      const medicalContext = /\b(?:vitamin|vertebra|vertebral|nerve|stage)\s*$/i.test(before) || (/^(?:B12|L[1-5]|S[12]|C[1-8]|T\d{1,2})$/i.test(match[0]) && /\b(?:deficiency|pain|nerve|disc|fracture|injury)\b/i.test(after));
      return !medicalContext && (explicit || full || !after.trim() || /^\s*(?:instead|rather|who|with|accepting|and|or)\b/i.test(after));
    });
    const placePattern = new RegExp(`\\b(?:${[...KNOWN_PLACES].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})\\b`, 'gi');
    const places = [...text.matchAll(placePattern)];
    const locationMentions=unique([...postcodes.map(match=>match[0].toLowerCase()),...places.map(match=>match[0].toLowerCase())]);
    if (locationMentions.length>1 && /\b(?:or|and)\b/i.test(text)) {
      const replacement=clinicalReplacement(text);
      const countIn=fragment=>locationMentions.filter(value=>fragment.toLowerCase().includes(value)).length;
      if (!replacement?.old || countIn(replacement.target)!==1 || countIn(replacement.old)!==1) return {criteria:normalizePrevious(previous),notices:['Choose one location at a time; your current criteria are unchanged.']};
    }
    if (postcodes.length) {
      nextLocation = normalizePostcode(postcodes.at(-1)[0]); foundLocation = true;
      for (const postcode of postcodes) text = text.replace(postcode[0], ' ');
    } else {
      if (places.length) {
        let selected = places.at(-1)[0];
        if (/\b(?:instead\s+of|rather\s+than)\b/i.test(text)) selected = places[0][0];
        nextLocation = KNOWN_PLACES.find(place => place.toLowerCase() === selected.toLowerCase());
        foundLocation = true; text = text.replace(placePattern, ' ');
      } else {
        // Unknown places remain literal text for the backend geocoder. Body phrases
        // such as "pain in my knee" are deliberately excluded from this branch.
        const place = text.match(/\b(?:in|near|around|closer\s+to|nearest\s+to|close\s+to|based\s+in|located\s+in)\s+([\p{L}][\p{L}\s.'-]{1,55}?)(?=\s+(?:who|with|accepting|accepts?|taking|covered|speaking|for|and|only|instead|rather)\b|[,;.!?]|$)/iu);
        if (place && !CLINICAL_WORDS.test(place[1])) {
          nextLocation = place[1].trim().replace(/\b\w/g, c => c.toUpperCase());
          foundLocation = true; text = text.replace(place[0], ' ');
        }
      }
    }
    if (foundLocation) {
      criteria.location = nextLocation;
    }
    if (radius !== null) {
      if (criteria.location) { criteria.radiusMiles = Math.round(radius * 100) / 100; criteria.sortByDistance = true; }
      else notices.push('Add a town or postcode so I can apply a distance filter.');
    }
    if (wantsDistance) {
      if (criteria.location) criteria.sortByDistance = true;
      else notices.push('Add a town or postcode so I can prioritise nearby consultants.');
    }
  }
  text = text.replace(/\b(?:near|around|close\s+to|within|miles?|kilomet(?:re|er)s?)\b/gi, ' ');
  const clearRadius = /\b(?:any\s+distance|(?:remove|clear|drop|ignore)\s+(?:the\s+)?(?:radius|distance)(?:\s+filter)?)\b/gi;
  if (clearRadius.test(text)) { criteria.radiusMiles = null; criteria.sortByDistance = false; clearRadius.lastIndex = 0; text = text.replace(clearRadius, ' '); }

  // "Hip instead of knee" changes the clinical topic, without retaining knee.
  const topicReplacement = text.match(/^(.*?)\b(?:instead\s+of|rather\s+than)\b.+$/i);
  if (topicReplacement) text = topicReplacement[1];
  else {
    const fromTo = text.match(/\b(?:switch|change)\s+(?:from\s+)?(.+?)\s+to\s+(.+)$/i);
    if (fromTo) text = fromTo[2];
  }
  const topic = cleanTopic(text);
  // Residual conversational acknowledgements and preference words are not topics.
  if (topic && !/^(?:yes|no|ok|okay|thanks|thank you|great|perfect|more|show more|filter|preference|restriction|requirement|private|privately|any|all|same criteria|keep|keep criteria|evenings?|mornings?|afternoons?)$/.test(topic)) {
    const oldBodies=bodyAreas(criteria.topic), newBodies=bodyAreas(topic);
    if (oldBodies.length===1 && newBodies.length===1 && oldBodies[0]!==newBodies[0]) {
      const removed=criteria.procedures.filter(label=>bodyAreas(label).includes(oldBodies[0]));
      if (removed.length) {
        criteria.procedures=criteria.procedures.filter(label=>!removed.includes(label));
        notices.push(`Changed the clinical topic and removed procedures tied to ${oldBodies[0]}: ${removed.join(', ')}.`);
      }
    }
    criteria.topic = topic;
    if (clinicalConflict(criteria,criteria.specialty)) return {criteria:normalizePrevious(previous),notices:[`Your new clinical topic conflicts with the ${criteria.specialty} filter, so I have kept your current criteria. Remove the specialty filter or say “reset clinical search to ${topic}”.`]};
  }
  if (!criteria.topic && !criteria.specialty && !criteria.procedures.length && !criteria.location && !criteria.insurance && !criteria.language && !criteria.gender && !notices.length && original.trim()) {
    notices.push('Tell me the condition, treatment or type of specialist you are looking for.');
  }
  return { criteria, notices: [...new Set(notices)] };
}

function criteriaLabels(criteria) {
  const c = normalizePrevious(criteria);
  return [
    c.topic && { key: 'topic', label: c.topic[0].toUpperCase() + c.topic.slice(1) },
    c.specialty && { key: 'specialty', label: c.specialty },
    c.procedures.length && { key: 'procedures', label: c.procedures.join(' + ') },
    c.location && { key: 'location', label: /^(london|manchester|birmingham|leeds|bristol)$/i.test(c.location) ? `${c.location} area` : c.location },
    c.insurance && { key: 'insurance', label: c.insurance },
    c.radiusMiles && { key: 'radiusMiles', label: `Within ${c.radiusMiles} ${c.radiusMiles===1?'mile':'miles'}` },
    c.sortByDistance && { key: 'sortByDistance', label: 'Nearest first' },
    c.gender && { key: 'gender', label: `${c.gender} consultant` },
    c.language && { key: 'language', label: `Speaks ${c.language}` },
  ].filter(Boolean);
}

module.exports = { updateCriteria, criteriaLabels };
