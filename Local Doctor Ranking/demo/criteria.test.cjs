'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { updateCriteria, criteriaLabels } = require('./criteria.cjs');
const update = (previous, message) => updateCriteria(previous, message).criteria;

test('demonstration sequence preserves clinical and insurer criteria and applies distance preference', () => {
  const first = update(null, 'Find a knee specialist in London');
  assert.deepEqual(first, { topic: 'knee', specialty:null, procedures:[], location: 'London', insurance: null, sortByDistance: false, radiusMiles: null, gender: null, language: null });
  const second = update(first, 'Only those accepting Bupa');
  assert.deepEqual(second, { ...first, insurance: 'Bupa' });
  const third = update(second, 'Closer to SW5');
  assert.deepEqual(third, { ...second, location: 'SW5', sortByDistance: true });
  assert.deepEqual(criteriaLabels(third).map(item => item.key), ['topic', 'location', 'insurance', 'sortByDistance']);
});

test('changing location preserves explicit radius and nearest preference', () => {
  const first = update({ topic: 'knee', location: 'SW5', insurance: 'Bupa', sortByDistance: true, radiusMiles: 10 }, 'Manchester instead of London');
  assert.equal(first.location, 'Manchester'); assert.equal(first.topic, 'knee');
  assert.equal(first.insurance, 'Bupa'); assert.equal(first.sortByDistance, true); assert.equal(first.radiusMiles, 10);
});

test('postcode is derived from input, normalised, and never guessed', () => {
  assert.equal(update({}, 'Knee surgeon near sw5 0tu').location, 'SW5 0TU');
  assert.equal(update({}, 'knee specialist').location, null);
  assert.equal(update({}, 'aching joint in my knee').location, null);
  assert.equal(update({}, 'Vitamin B12 deficiency').location, null);
  assert.equal(update({}, 'L4 disc pain').location, null);
  assert.equal(update({}, 'knee specialist in Tunbridge Wells').location, 'Tunbridge Wells');
});

test('insurer replacement and removal do not enter the clinical query', () => {
  let c = update({}, 'knee consultant in London accepting Bupa');
  c = update(c, 'AXA Health instead of Bupa'); assert.equal(c.insurance, 'AXA'); assert.equal(c.topic, 'knee');
  c = update(c, 'Switch from AXA to Aviva'); assert.equal(c.insurance, 'Aviva'); assert.equal(c.topic, 'knee');
  c = update(c, 'Any insurer'); assert.equal(c.insurance, null); assert.equal(c.topic, 'knee');
  c = update({ ...c, insurance: 'Bupa' }, 'I will pay privately'); assert.equal(c.insurance, null); assert.equal(c.topic, 'knee');
});

test('removing chips changes only their criteria with dependent location preferences cleared', () => {
  const c = { topic: 'knee', specialty:null, procedures:[], insurance: 'Bupa', location: 'SW5', sortByDistance: true, radiusMiles: 5, gender: 'Female', language: 'French' };
  assert.deepEqual(updateCriteria(c, '', { removeCriterion: 'topic' }).criteria, { ...c, topic: '' });
  assert.deepEqual(updateCriteria(c, '', { removeCriterion: 'insurance' }).criteria, { ...c, insurance: null });
  assert.deepEqual(updateCriteria(c, '', { removeCriterion: 'location' }).criteria, { ...c, location: null, sortByDistance: false, radiusMiles: null });
  assert.equal(c.location, 'SW5', 'previous object is not mutated');
});

test('location removal keeps clinical and insurer requirements', () => {
  const c = update({ topic: 'knee', location: 'SW5', insurance: 'Bupa', sortByDistance: true, radiusMiles: 10 }, 'Anywhere');
  assert.equal(c.topic, 'knee'); assert.equal(c.insurance, 'Bupa'); assert.equal(c.location, null); assert.equal(c.sortByDistance, false); assert.equal(c.radiusMiles, null);
});

test('new clinical topic replaces earlier topic while filters persist', () => {
  const c = update({ topic: 'knee', location: 'London', insurance: 'Bupa' }, 'Hip instead of knee');
  assert.equal(c.topic, 'hip'); assert.equal(c.location, 'London'); assert.equal(c.insurance, 'Bupa');
  assert.equal(update(c, 'Actually shoulder pain').topic, 'shoulder pain');
  assert.equal(update({}, 'My joints ache when climbing stairs').topic, 'joints ache climbing stairs');
});

test('unsupported availability constraint produces a notice and preserves complete criteria', () => {
  const c = update({}, 'knee consultant in London accepting Bupa');
  for (const text of ['Only after 5pm', 'Available tomorrow', 'Appointments on Saturday', 'Available in the evenings']) {
    const result = updateCriteria(c, text);
    assert.deepEqual(result.criteria, c, text); assert.ok(result.notices.length, text);
  }
});

test('unsupported budget constraint is not treated as clinical intent', () => {
  const c = update({}, 'Find a hip specialist');
  const result = updateCriteria(c, 'Only under £200');
  assert.deepEqual(result.criteria, c); assert.match(result.notices[0], /price filter/);
});

test('gender and language filters preserve topic and can be removed', () => {
  const c = update({ topic: 'knee', location: 'London' }, 'Only female consultants who speak French');
  assert.equal(c.gender, 'Female'); assert.equal(c.language, 'French'); assert.equal(c.topic, 'knee');
  const next = update(c, 'Any gender and any language');
  assert.equal(next.gender, null); assert.equal(next.language, null); assert.equal(next.topic, 'knee');
});

test('radius requires a location and supports kilometres', () => {
  const result = updateCriteria({ topic: 'knee' }, 'Within 5 miles');
  assert.equal(result.criteria.radiusMiles, null); assert.ok(result.notices.length); assert.equal(result.criteria.topic, 'knee');
  const c = update({ topic: 'knee' }, 'Within 10 km of SW5');
  assert.equal(c.location, 'SW5'); assert.equal(c.radiusMiles, 6.21); assert.equal(c.sortByDistance, true); assert.equal(c.topic, 'knee');
});

test('multiple insurers prompt a choice instead of silently selecting a new insurer', () => {
  const result = updateCriteria({ topic: 'hip', insurance: 'Aviva' }, 'Accepting Bupa or AXA');
  assert.equal(result.criteria.insurance, 'Aviva'); assert.equal(result.criteria.topic, 'hip'); assert.ok(result.notices.length);
});

test('clinical alternatives preserve OR while insurer alternatives never become a topic', () => {
  const c = update({}, 'Find a hip or shoulder specialist in London');
  assert.equal(c.topic, 'hip or shoulder'); assert.equal(c.location, 'London');
  const next = updateCriteria(c, 'Bupa or AXA');
  assert.equal(next.criteria.topic, c.topic); assert.ok(next.notices.length);
  assert.equal(update({}, 'Find a knee and hip specialist').topic, 'knee hip');
});

test('unrecognised insurer does not corrupt existing clinical criteria', () => {
  const c = update({}, 'Find a knee specialist in London');
  const result = updateCriteria(c, 'Only those accepting HealthNow');
  assert.deepEqual(result.criteria, c); assert.match(result.notices[0], /do not recognise the insurer/);
});

test('personal location needs explicit information and is not guessed', () => {
  const c = update({}, 'Find a knee specialist');
  const result = updateCriteria(c, 'Near me');
  assert.deepEqual(result.criteria, c); assert.match(result.notices[0], /town or postcode/);
});

test('negated criteria never become positive filters or replacement topics', () => {
  const c = update({}, 'Find a knee specialist in London accepting Bupa');
  for (const message of ['No Bupa', 'Not Bupa', 'Not female', 'No longer London', 'Not London', 'Keep the knee search but not London', 'Not knee, hip', 'Exclude Bupa', 'Without surgery']) {
    const result = updateCriteria(c, message);
    assert.deepEqual(result.criteria, c, message);
    assert.match(result.notices[0], /Excluding/, message);
  }
});

test('unambiguous removal through negation clears insurance while preserving other criteria', () => {
  const c = update({}, 'Find a knee specialist in London accepting Bupa');
  for (const message of ['Bupa is not necessary', 'Bupa not necessary', 'Bupa no longer needed', 'Insurance is not required', "I don't need Bupa", 'No insurance', 'Without insurance', 'No insurance preference']) {
    const result = updateCriteria(c, message);
    assert.deepEqual(result.criteria, { ...c, insurance: null }, message);
    assert.deepEqual(result.notices, [], message);
  }
});

test('no preference removes gender, language or location without an exclusion warning', () => {
  const c = update({}, 'Find a female knee specialist in London who speaks French');
  for (const [message, key] of [['No gender preference', 'gender'], ['No language preference', 'language'], ['No location restriction', 'location']]) {
    const result = updateCriteria(c, message);
    assert.equal(result.criteria[key], null, message); assert.equal(result.criteria.topic, 'knee'); assert.deepEqual(result.notices, []);
  }
});

test('invalid or empty input returns a complete stable contract', () => {
  assert.deepEqual(updateCriteria(null, null), { criteria: { topic: '', specialty:null, procedures:[], location: null, insurance: null, sortByDistance: false, radiusMiles: null, gender: null, language: null }, notices: [] });
  assert.deepEqual(criteriaLabels(null), []);
});

test('complete AND refinement retains topic, location, insurer, specialty and each requested procedure', () => {
  let c=update({},'Find a knee specialist in London');
  c=update(c,'Only those accepting Bupa');
  const base={...c};
  c=update(c,'Only orthopaedic surgeons');
  assert.deepEqual(c,{...base,specialty:'Orthopaedics'});
  c=update(c,'Those who perform knee replacement');
  assert.deepEqual(c,{...base,specialty:'Orthopaedics',procedures:['Knee replacement']});
  c=update(c,'Also arthroscopy');
  assert.deepEqual(c,{...base,specialty:'Orthopaedics',procedures:['Knee replacement','Knee arthroscopy']});
  const labels=criteriaLabels(c);
  assert.ok(labels.some(label=>label.key==='specialty'&&label.label==='Orthopaedics'));
  assert.ok(labels.some(label=>label.key==='procedures'&&label.label==='Knee replacement + Knee arthroscopy'));
  c=update(c,'Closer to SW5');
  assert.deepEqual(c,{...base,location:'SW5',sortByDistance:true,specialty:'Orthopaedics',procedures:['Knee replacement','Knee arthroscopy']});
});

test('bare specialty and procedure follow-ups are filters, not replacement clinical concerns', () => {
  const c=update({},'Find a knee pain specialist in London accepting Bupa');
  const specialist=update(c,'Orthopedics');
  assert.equal(specialist.topic,'knee pain'); assert.equal(specialist.specialty,'Orthopaedics');
  const procedural=update(specialist,'Knee replacement');
  assert.equal(procedural.topic,'knee pain'); assert.deepEqual(procedural.procedures,['Knee replacement']);
  assert.equal(procedural.location,'London'); assert.equal(procedural.insurance,'Bupa');
});

test('body words inside recorded-title specialty aliases remain part of the patient concern', () => {
  for(const location of ['London','Tunbridge Wells']) {
    const c=update({},`Find a knee surgeon in ${location}`);
    assert.equal(c.topic,'knee'); assert.equal(c.specialty,'Orthopaedics'); assert.equal(c.location,location);
  }
  const combined=update({},'Find hip and knee surgeons in London');
  assert.equal(combined.topic,'hip knee'); assert.equal(combined.specialty,'Orthopaedics');
});

test('procedure replacement changes the explicit body focus and preserves every nonclinical preference', () => {
  let c=update({},'Find a female knee specialist in London accepting Bupa who speaks French');
  c=update(c,'Only orthopaedic surgeons'); c=update(c,'Knee replacement'); c=update(c,'Also arthroscopy'); c=update(c,'Within 10 miles');
  const {criteria,notices}=updateCriteria(c,'Hip replacement instead of knee replacement');
  assert.deepEqual(criteria,{...c,topic:'hip',procedures:['Hip replacement']});
  assert.ok(notices.some(notice=>notice.includes('Changed the clinical focus to hip')));
  const otherSyntax=update(c,'Switch from knee replacement to hip replacement');
  assert.equal(otherSyntax.topic,'hip'); assert.deepEqual(otherSyntax.procedures,['Hip replacement']);
});

test('explicit body topic changes remove contradictory body-specific procedures with an explanation', () => {
  let c=update({},'knee specialist in London accepting Bupa'); c=update(c,'Only orthopaedic surgeons'); c=update(c,'Knee replacement');
  const result=updateCriteria(c,'Hip pain instead of knee pain');
  assert.equal(result.criteria.topic,'hip pain'); assert.deepEqual(result.criteria.procedures,[]);
  assert.equal(result.criteria.specialty,'Orthopaedics'); assert.equal(result.criteria.insurance,'Bupa');
  assert.ok(result.notices.some(notice=>notice.includes('removed procedures tied to knee')));
});

test('arthroscopy is body-specific only with an unambiguous explicit clinical context', () => {
  assert.deepEqual(update({topic:'knee pain'},'Also arthroscopy').procedures,['Knee arthroscopy']);
  assert.deepEqual(update({topic:'hip pain'},'Arthroscopy').procedures,['Hip arthroscopy']);
  assert.deepEqual(update({topic:'hip or knee pain'},'Also arthroscopy').procedures,['Arthroscopy']);
  assert.deepEqual(update({},'Arthroscopy').procedures,['Arthroscopy']);
});

test('any procedure, direct removal and chip removal clear only the procedure dimension', () => {
  let c=update({},'knee specialist in London accepting Bupa'); c=update(c,'Only orthopaedics'); c=update(c,'Knee replacement'); c=update(c,'Also arthroscopy');
  for(const message of ['Any procedure','Remove procedure filter','No procedure preference']) {
    assert.deepEqual(update(c,message),{...c,procedures:[]},message);
  }
  assert.deepEqual(updateCriteria(c,'',{removeCriterion:'procedures'}).criteria,{...c,procedures:[]});
  assert.deepEqual(update(c,'Remove knee replacement'),{...c,procedures:['Knee arthroscopy']});
  assert.deepEqual(c.procedures,['Knee replacement','Knee arthroscopy'],'the old state is not mutated');
});

test('any specialty, direct removal and chip removal clear only the specialty dimension', () => {
  const c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  for(const message of ['Any specialty','Any speciality','Remove specialty','Remove speciality filter','No speciality preference']) {
    assert.deepEqual(update(c,message),{...c,specialty:null},message);
  }
  assert.deepEqual(updateCriteria(c,'',{removeCriterion:'specialty'}).criteria,{...c,specialty:null});
});

test('incompatible specialty changes preserve state and provide an explicit clinical-reset route', () => {
  const c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  const rejected=updateCriteria(c,'Dermatology instead');
  assert.deepEqual(rejected.criteria,c); assert.match(rejected.notices[0],/reset clinical search to Dermatology/);
  const reset=updateCriteria(c,'Reset clinical search to dermatology');
  assert.deepEqual(reset.criteria,{...c,topic:'',specialty:'Dermatology',procedures:[]});
  assert.ok(reset.notices.length);
});

test('specialty may change to a compatible specialty without removing the body concern', () => {
  const c=update({},'Orthopaedic specialist for knee pain in London accepting Bupa');
  const next=update(c,'Rheumatology instead');
  assert.deepEqual(next,{...c,specialty:'Rheumatology'});
});

test('unknown requested procedures never become a new topic or an unsupported hard filter', () => {
  const c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  for(const message of ['Those who perform cyberknife treatment','Who offer cyberknife treatment','Only consultants who provide timewarp therapy','Also hip resurfacing','Perform knee replacement and cyberknife treatment']) {
    const result=updateCriteria(c,message);
    assert.deepEqual(result.criteria,c,message);
    assert.match(result.notices[0],/do not recognise that requested procedure/,message);
  }
});

test('named procedure and other preference clauses apply together without losing prior criteria', () => {
  let c=update({},'Find a knee specialist in London accepting Bupa');
  c=update(c,'Only orthopaedic surgeons');
  const cases=[
    ['Those who perform knee replacement closer to SW5',{location:'SW5',sortByDistance:true}],
    ['Who perform knee replacement and nearest to SW5',{location:'SW5',sortByDistance:true}],
    ['Who perform knee replacement within 10 miles of SW5',{location:'SW5',radiusMiles:10,sortByDistance:true}],
    ['Who perform knee replacement under 5 miles from London',{radiusMiles:5,sortByDistance:true}],
    ['Who perform knee replacement accepting AXA',{insurance:'AXA'}],
    ['Who perform knee replacement and accept Aviva',{insurance:'Aviva'}],
    ['Who perform knee replacement and speak French',{language:'French'}],
    ['Who perform knee replacement who speaks Spanish',{language:'Spanish'}],
    ['Who perform knee replacement, closer to SW5, accepting AXA and speaking French',{location:'SW5',sortByDistance:true,insurance:'AXA',language:'French'}],
  ];
  for(const [message,changes] of cases) {
    const result=updateCriteria(c,message);
    assert.deepEqual(result.criteria,{...c,procedures:['Knee replacement'],...changes},message);
    assert.deepEqual(result.notices,[],message);
  }
});

test('unknown procedures still reject a combined turn before applying later preferences', () => {
  const c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  for(const message of [
    'Those who perform cyberknife treatment closer to SW5',
    'Who perform knee replacement and cyberknife treatment within 10 miles of SW5',
    'Who offer cyberknife treatment and accept AXA',
    'Who provide timewarp therapy and speak French',
  ]) {
    const result=updateCriteria(c,message);
    assert.deepEqual(result.criteria,c,message);
    assert.match(result.notices[0],/do not recognise that requested procedure/,message);
  }
});

test('procedure and specialty exclusions preserve previous state with a notice', () => {
  const c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  for(const message of ['Not knee replacement','No arthroscopy','Exclude orthopaedics']) {
    const result=updateCriteria(c,message); assert.deepEqual(result.criteria,c); assert.ok(result.notices.length);
  }
});

test('procedure OR and specialty OR are not silently implemented as AND or one alternative', () => {
  const c=update({},'knee specialist in London accepting Bupa');
  for(const message of ['Knee replacement or arthroscopy','Hip or knee replacement','Orthopaedics or rheumatology']) {
    const result=updateCriteria(c,message); assert.deepEqual(result.criteria,c,message); assert.ok(result.notices.length,message);
  }
  const both=update(c,'Both knee replacement and arthroscopy');
  assert.deepEqual(both.procedures,['Knee replacement','Knee arthroscopy']); assert.equal(both.topic,'knee');
});

test('multiple explicitly conjunctive procedures remain separate AND requirements', () => {
  const c=update({},'Both hip and knee replacement in London accepting Bupa');
  assert.deepEqual(c.procedures,['Hip replacement','Knee replacement']);
  assert.equal(c.topic,''); assert.equal(c.location,'London'); assert.equal(c.insurance,'Bupa');
});

test('explicit radius survives subsequent postcode and city refinements', () => {
  let c=update({},'knee specialist in London accepting Bupa'); c=update(c,'Within 10 miles');
  c=update(c,'Closer to SW5');
  assert.equal(c.radiusMiles,10); assert.equal(c.sortByDistance,true); assert.equal(c.location,'SW5');
  c=update(c,'Manchester instead');
  assert.equal(c.radiusMiles,10); assert.equal(c.sortByDistance,true); assert.equal(c.location,'Manchester');
  const cleared=update(c,'Any distance'); assert.equal(cleared.radiusMiles,null); assert.equal(cleared.sortByDistance,false); assert.equal(cleared.location,'Manchester');
});

test('changing insurer and location preserves specialty and procedure requirements', () => {
  let c=update({},'Orthopaedic surgeons for knee replacement in London accepting Bupa');
  c=update(c,'AXA instead of Bupa'); c=update(c,'Manchester instead of London');
  assert.equal(c.insurance,'AXA'); assert.equal(c.location,'Manchester'); assert.equal(c.specialty,'Orthopaedics'); assert.deepEqual(c.procedures,['Knee replacement']); assert.equal(c.topic,'knee');
});

test('location alternatives do not silently choose a city or postcode', () => {
  const c=update({},'knee specialist in London accepting Bupa');
  for(const message of ['London or Manchester','SW5 or SW7','London and Manchester']) {
    const result=updateCriteria(c,message); assert.deepEqual(result.criteria,c,message); assert.match(result.notices[0],/Choose one location/);
  }
});
