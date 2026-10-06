'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCorpus,normalizeRegistration,extractAttributes,classifyPassage,splitPassages}=require('./data.cjs');
const row=(overrides={})=>({id:'source-1',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Consultant Cardiologist',about:'I routinely report cardiac CT in adults with coronary artery disease.',merge_date:'2026-02-15T00:00:00Z',...overrides});
test('builds source-backed clinical passages without inventing current verification',()=>{
  const c=buildCorpus([row()]);const p=c.passages.find(p=>p.field==='about');
  assert.equal(c.candidates[0].id,'expert-gmc-1234567');assert.equal(p.sourceUrl,null);assert.equal(p.attribution,'source-record');
  assert.equal(p.dates.sourceDate,null);assert.equal(p.dates.observedAt,null);assert.equal(p.dates.mergeDate,'2026-02-15T00:00:00Z');
  assert.deepEqual(p.attributes.population,['adults']);assert.ok(p.attributes.modality.includes('cardiac CT'));assert.ok(p.qualifiers.includes('reported-current-practice'));
});
test('same name without a trustworthy identifier is held out, never names-only merged',()=>{
  const c=buildCorpus([row({id:'a',gmc_number:null}),row({id:'b',gmc_number:null})]);
  assert.equal(c.candidates.length,2);assert.equal(c.passages.length,0);assert.equal(c.audit.heldForIdentityReview,2);
});
test('merges compatible typed registrations and preserves alternate source evidence',()=>{
  const c=buildCorpus([row(),row({id:'source-2',name:'Alex Example',about:'I undertake cardiac MRI research.',about_source:'Other',profile_urls:{other:'https://hospital.example/doctors/alex-example'}})]);
  assert.equal(c.candidates.length,1);assert.equal(c.audit.duplicateRowsMerged,1);
  assert.ok(c.passages.some(p=>p.text.includes('cardiac CT')));assert.ok(c.passages.some(p=>p.text.includes('MRI research')&&p.sourceUrl==='https://hospital.example/doctors/alex-example'));
});
test('shared typed ID with incompatible names holds both records out',()=>{
  const c=buildCorpus([row(),row({id:'other',name:'Dr Beth Different'})]);
  assert.equal(c.passages.length,0);assert.ok(c.candidates.every(x=>x.needsIdentityReview));
  assert.equal(new Set(c.candidates.map(x=>x.id)).size,2);
});
test('contradictory official profile number is quarantined',()=>{
  const c=buildCorpus([row({profile_urls:{spire:'https://www.spirehealthcare.com/spire-test-hospital/consultants/dr-alex-example-c7654321/'}})]);
  assert.equal(c.passages.length,0);assert.ok(c.candidates[0].identityIssues.includes('profile-registration-mismatch'));
});
test('non-doctor named profile can corroborate identity without a GMC inferred from URL',()=>{
  const c=buildCorpus([row({gmc_number:null,name:'Ms Alex Example',specialty:'Physiotherapist',profile_urls:{spire:'https://www.spirehealthcare.com/spire-test-hospital/consultants/ms-alex-example-c1234567/'}})]);
  assert.equal(c.candidates[0].needsIdentityReview,false);assert.deepEqual(c.candidates[0].registrations,[]);assert.match(c.candidates[0].id,/^expert-profile-/);
});
test('registration fields preserve body and identifier and reject ingestion words',()=>{
  assert.deepEqual(normalizeRegistration('HCPC','PH12345'),{body:'HCPC',identifier:'PH12345'});assert.equal(normalizeRegistration('HCPC','Chartered'),null);
  assert.equal(normalizeRegistration('GMC','PH12345'),null);
  const c=buildCorpus([row({hcpc_number:'Society'})]);assert.equal(c.audit.invalidRegistrations,1);assert.deepEqual(c.candidates[0].registrations,[{body:'GMC',identifier:'1234567'}]);
});
test('a flagged duplicate cannot contribute searchable evidence',()=>{
  const c=buildCorpus([row(),row({id:'flagged',do_not_recommend:true})]);assert.equal(c.passages.length,0);assert.equal(c.candidates[0].needsIdentityReview,true);
});
test('source-specific alternative biographies preserve attribution and common text provenance',()=>{
  const text='I report adult cardiac CT.';
  const c=buildCorpus([row({about:text,about_source:'Spire',about_alternatives:{phin:text,other:'I perform echocardiography.'},profile_urls:{spire:'https://www.spirehealthcare.com/spire-test-hospital/consultants/dr-alex-example-c1234567/',phin:'https://www.phin.org.uk/profiles/consultants/alex-example-1'}})]);
  const p=c.passages.find(x=>x.text===text);assert.equal(c.passages.filter(x=>x.text===text).length,1);assert.equal(p.sources.length,2);assert.ok(p.sources.some(s=>s.sourceLabel==='phin'));
  assert.ok(c.passages.some(x=>x.text==='I perform echocardiography.'));
});
test('unattributed procedures do not inherit an identity profile as proof',()=>{
  const c=buildCorpus([row({procedures:['Coronary CT angiography'],profile_urls:{spire:'https://www.spirehealthcare.com/spire-test-hospital/consultants/dr-alex-example-c1234567/'}})]);
  assert.equal(c.passages.find(x=>x.field==='procedures').sourceUrl,null);
});
test('procedure bucket midpoint remains derived and volume without period is not comparable',()=>{
  const c=buildCorpus([row({procedures_completed:[{description:'Coronary angiography',count:'100–199',count_numeric:149.5}],procedure_volumes_phin:[{procedure_name:'Chemotherapy',admissions:855,procedure_id:150}]})]);
  const a=c.passages.find(x=>x.text==='Coronary angiography');assert.equal(a.volume.countNumericDerived,true);assert.equal(a.volume.reportingPeriod,null);assert.equal(a.volume.comparable,false);
  const b=c.passages.find(x=>x.text==='Chemotherapy');assert.equal(b.volume.reportedAdmissions,855);assert.equal(b.volume.reportingPeriod,null);assert.equal(b.volume.comparable,false);assert.ok(!c.passages.some(x=>x.text==='855'||x.text==='150'));
});
test('qualifications preserve degree and description rather than losing one',()=>{
  const c=buildCorpus([row({detailed_qualifications:[{degree:'MBBS / Example University / 1986',description:'Bachelor of Medicine, Bachelor of Surgery'}]})]);
  assert.ok(c.passages.some(x=>x.text.includes('MBBS')&&x.text.includes('Bachelor of Medicine')));
});
test('publication-listing URLs are retained as metadata rather than proof of authorship',()=>{
  const c=buildCorpus([row({publications:['https://www.researchgate.net/profile/Example']})]);const p=c.passages.find(x=>x.field==='publications');
  assert.equal(p.type,'professional-background');assert.ok(p.qualifiers.includes('publication-listing-link-not-authorship'));assert.equal(p.publication.listingUrl,'https://www.researchgate.net/profile/Example');
});
test('explicit reviewed enrichment needs identity binding, URL, observation date and verification',()=>{
  const base={sourceRecordId:'source-1',sourceUrl:'https://journal.example/paper',observedAt:'2026-10-06',verified:true,text:'Coauthor of a 2010 diagnostic trial protocol.',type:'research',sourceDate:'2010',review:{limitations:['Does not establish present clinical activity.']}};
  const c=buildCorpus([row()],{enrichments:[base,{...base,sourceRecordId:'missing'},{...base,verified:false},{...base,observedAt:null}]});
  assert.equal(c.audit.rejectedEnrichments,3);const p=c.passages.find(x=>x.attribution==='verified-source');assert.equal(p.dates.sourceDate,'2010');assert.equal(p.dates.mergeDate,null);assert.deepEqual(p.review,base.review);
});
test('privacy projection ignores contacts, appointments, feedback and booking data',()=>{
  const c=buildCorpus([row({email:'private@example.com',contact_phone:'01234567890',reddit_patient_notes:'private condition',appointments:[{name:'Patient Secret'}],about:'I report cardiac CT. Email private@example.com for more information.',locations:[{hospital:'Example NHS Trust',phone:'01234567890',email:'secret@example.com',address:'Clinic Road'}]})]);
  const serialized=JSON.stringify(c);assert.ok(!serialized.includes('private@example.com'));assert.ok(!serialized.includes('secret@example.com'));assert.ok(!serialized.includes('01234567890'));assert.ok(!serialized.includes('Patient Secret'));assert.ok(!serialized.includes('private condition'));
});
test('interest, training, research and relationship evidence remain distinct',()=>{
  assert.equal(classifyPassage('I have a developing interest in cardiac CT.','about'),'clinical-interest');
  assert.equal(classifyPassage('I trained in cardiac CT during my fellowship.','about'),'training');
  assert.equal(classifyPassage('I conduct research on diagnostic studies.','about'),'research');
  assert.equal(classifyPassage('I am a consultant for two implant companies.','about'),'relationship');
});
test('passage splitting keeps negation intact and retains all long content within bound',()=>{
  const text='I do not currently interpret cardiac CT scans.';assert.deepEqual(splitPassages(text),[text]);
  const long='Relevant professional activity '.repeat(150);const p=splitPassages(long);assert.ok(p.length>1);assert.ok(p.every(x=>x.length<=900));assert.equal(p.join(' '),long.trim());
});
test('attributes are recall hints, not formal approval or clinical-quality claims',()=>{
  const a=extractAttributes('Dermoscopy study in primary care involving adults.');assert.ok(a.modality.includes('dermoscopy'));assert.ok(a.setting.includes('primary care'));assert.deepEqual(a.population,['adults']);
  assert.ok(!Object.hasOwn(a,'approved'));assert.ok(!Object.hasOwn(a,'matchScore'));
});
test('corpus IDs/version do not depend on input row order',()=>{
  const rows=[row(),row({id:'another',about:'I undertake cardiac MRI research.'})];const a=buildCorpus(rows),b=buildCorpus([...rows].reverse());
  assert.deepEqual(a.candidates.map(x=>x.id),b.candidates.map(x=>x.id));assert.equal(a.version,b.version);
});
test('HCPC numeric suffix misfiled as GMC never becomes GMC registration',()=>{
  const c=buildCorpus([row({gmc_number:'1234567',hcpc_number:'PH1234567',specialty:'Physiotherapist'})]);
  assert.deepEqual(c.candidates[0].registrations,[{body:'HCPC',identifier:'PH1234567'}]);assert.equal(c.candidates[0].id,'expert-hcpc-PH1234567');assert.ok(c.candidates[0].identityIssues.includes('invalid-gmc-attribution'));
  assert.equal(normalizeRegistration('GMC','023816'),null);assert.equal(normalizeRegistration('GMC','07825750'),null);
});
test('clearly nonmedical role does not silently inherit a numeric GMC field',()=>{
  const c=buildCorpus([row({specialty:'Clinical Psychologist',profile_urls:{provider:'https://hospital.example/consultants/dr-alex-example'}})]);
  assert.deepEqual(c.candidates[0].registrations,[]);assert.equal(c.candidates[0].needsIdentityReview,false);
});
test('named professional directory slug can corroborate non-doctor identity with descriptive suffix',()=>{
  const c=buildCorpus([row({name:'Alex Example',gmc_number:null,specialty:'Dietitian',profile_urls:{bda:'https://www.bda.uk.com/find-a-dietitian/alex-example-clinic-london-united-kingdom-1234.html'}})]);
  assert.equal(c.candidates[0].needsIdentityReview,false);assert.ok(c.passages.length>0);
});
test('ordinary medical employment and clinical interests are not industry or demonstrated practice',()=>{
  assert.equal(classifyPassage('UK qualified consultant medical oncologist since 2014','about'),'training');
  assert.equal(classifyPassage('Consultant in Medical Oncology','about'),'professional-background');
  assert.equal(classifyPassage('I have specialist interests in the treatment of knee pain.','about'),'clinical-interest');
  assert.equal(classifyPassage('I completed fellowships in cardiology.','about'),'training');
});
test('billing, hobbies and observed truncated ingestion fragments are not indexed',()=>{
  const c=buildCorpus([row({about:'Outside work I play at Mosley Golf Club. I report cardiac CT.',procedures:['Pay member claim - missing information'],areas_of_interest:['e Medicine','ts inju','Glaucoma']})]);
  assert.ok(!c.passages.some(p=>/Golf|Pay member|e Medicine|ts inju/.test(p.text)));assert.ok(c.passages.some(p=>p.text.includes('Glaucoma')));
});
test('deduplication keeps all procedure volumes and their activity labels',()=>{
  const c=buildCorpus([row({procedures:['Coronary angiography'],procedures_completed:[{description:'Coronary angiography',count:'100–199',count_numeric:149.5}]})]);
  const p=c.passages.find(x=>x.text==='Coronary angiography');assert.equal(p.sources.length,2);assert.equal(p.volumes[0].reportedRange,'100–199');assert.equal(p.volumes[0].activity,'Coronary angiography');
});
test('research-interest topic fields do not establish actual research participation',()=>{
  const c=buildCorpus([row({research_interests:'Medical technologies; vascular bypass to salvage ischaemic legs.'})]);const p=c.passages.find(x=>x.field==='research_interests');
  assert.equal(p.type,'clinical-interest');assert.ok(p.qualifiers.includes('research-interest-not-study-experience'));assert.ok(p.qualifiers.includes('stated-interest'));
  assert.equal(classifyPassage('I was the principal investigator in a diagnostic trial.','research_interests'),'research');
});
test('malformed DOI references remain metadata without invented bibliographic authorship',()=>{
  const c=buildCorpus([row({publications:['http://doi:10.1136/bcr-2017-2225842016']})]);const p=c.passages.find(x=>x.field==='publications');
  assert.equal(p.type,'professional-background');assert.ok(p.qualifiers.includes('publication-listing-link-not-authorship'));assert.equal(p.publication.listingUrl,null);assert.equal(p.publication.unverifiedReference,'http://doi:10.1136/bcr-2017-2225842016');
});
test('booking link inside malformed biography and generic billing are outside evidence',()=>{
  const c=buildCorpus([row({about:'To register for an appointment, register here: https://clinic.carebit.co/patients/accounts/sign-upMr Example performs surgery.',procedures:['Follow-up out-patient consultation - remote','Coronary angiography']})]);
  assert.ok(!JSON.stringify(c.passages).includes('carebit'));assert.ok(!JSON.stringify(c.passages).includes('consultation - remote'));assert.ok(c.passages.some(x=>x.text.includes('Coronary angiography')));
});
test('recorded locations have explicit source references and do not infer country or recency',()=>{
  const c=buildCorpus([row({locations:[{hospital:'Example Hospital',postcode:'SW5 0AA',source:'Spire',website:'https://hospital.example/'}],profile_urls:{spire:'https://www.spirehealthcare.com/spire-test-hospital/consultants/dr-alex-example-c1234567/'}})]);
  const l=c.candidates[0].locations[0],p=c.passages.find(x=>x.type==='location');assert.equal(l.sourceRecordId,'source-1');assert.equal(l.field,'locations');assert.equal(l.country,null);
  assert.equal(p.text,'Example Hospital, SW5 0AA');assert.equal(p.sourceRecordId,'source-1');assert.equal(p.field,'locations');assert.equal(p.dates.observedAt,null);assert.equal(p.dates.sourceDate,null);assert.ok(p.qualifiers.includes('recorded-location-not-residence-or-current-practice'));assert.ok(p.sourceUrl.includes('dr-alex-example'));
});

test('training received and teaching-hospital names do not assert delivery of teaching',()=>{
  for(const text of ['She completed specialist training at a teaching hospital.','He trained in cardiac CT during a fellowship.','Her fellowship taught her how to treat tendon injuries.']) {
    const type=classifyPassage(text,'about'),attributes=extractAttributes(text,{field:'about',type});
    assert.equal(type,'training');assert.ok(!attributes.activity.includes('teaching'));assert.ok(!attributes.activity.includes('clinical practice'));
  }
  const text='He supervises trainee surgeons and regularly teaches medical students.';
  const type=classifyPassage(text,'about');assert.equal(type,'professional-background');
  const a=extractAttributes(text,{field:'about',type});assert.deepEqual(a.activity,['teaching']);
});

test('a paragraph can retain real teaching without promoting learned techniques into performed clinical care',()=>{
  const text='His fellowship taught him how to treat hand injuries. He is an accredited trainer and teaches medical students.';
  const a=extractAttributes(text,{field:'about',type:'training'});
  assert.ok(a.activity.includes('teaching'));assert.ok(!a.activity.includes('clinical practice'));
});

test('pure metadata cannot create clinical modality, population or activity claims',()=>{
  for(const [field,text] of [
    ['professional_memberships','British Society of Paediatric Gastroenterology and Gynaecological Endoscopy'],
    ['qualifications','MSc Institute of Cancer Research, University of London'],
    ['locations','Practice, Teaching Hospital, Children Street'],
    ['nhs_base',"Children's Hospital NHS Trust"],
    ['publications','Journal of Cardiac CT in Children'],
  ])assert.ok(Object.values(extractAttributes(text,{field,type:'professional-background'})).every(values=>values.length===0));
});

test('journal-review and society metadata in a biography do not establish patient population',()=>{
  const text="I am a consultant hand surgeon. I regularly teach surgical techniques. I review the journal of children's orthopaedics.";
  const a=extractAttributes(text,{field:'about',type:'professional-background'});assert.deepEqual(a.population,[]);assert.ok(a.activity.includes('teaching'));
});

test('bare topics in interest fields do not become performed research or clinical work',()=>{
  for(const text of ['telemedicine and research','Back pain and Medical Reports.','Interpretation of cardiac CT'])assert.equal(classifyPassage(text,'areas_of_interest'),'clinical-interest');
  const c=buildCorpus([row({areas_of_interest:['telemedicine and research','Back pain and Medical Reports.']})]);
  for(const p of c.passages.filter(p=>p.field==='areas_of_interest')){assert.equal(p.type,'clinical-interest');assert.ok(p.qualifiers.includes('stated-interest'));assert.ok(!p.attributes.activity.includes('clinical research'));assert.ok(!p.attributes.activity.includes('clinical practice'));}
  assert.equal(classifyPassage('I conduct clinical research in telemedicine.','areas_of_interest'),'research');
});

test('medico-legal practice is retained with its scope and does not establish direct patient care',()=>{
  const c=buildCorpus([row({about:'My medico-legal practice includes work for legal firms and expert witness reports.'})]);
  const p=c.passages.find(p=>p.field==='about');assert.equal(p.type,'professional-background');assert.ok(p.qualifiers.includes('legal-work-not-clinical-care'));assert.deepEqual(p.attributes.activity,[]);
});

test('registration statements are professional background rather than specialist interests',()=>{
  assert.equal(classifyPassage('He achieved recognition on the Specialist Register for Urology and the FRCS in 2001.','about'),'professional-background');
  const c=buildCorpus([row({about:'GMC Specialist register for Ophthalmology\nClinical Interests:'})]);
  assert.ok(c.passages.some(p=>p.type==='professional-background'&&p.text.includes('GMC')));assert.ok(!c.passages.some(p=>p.text==='Clinical Interests:'));
});

test('joined biography sentences preserve a company role and remove a subsequent personal hobby',()=>{
  const c=buildCorpus([row({about:'Alex is a medical director of an artificial intelligence company.James enjoys skiing and playing tennis.'})]);
  assert.ok(c.passages.some(p=>p.type==='relationship'&&p.text.includes('company')));assert.ok(!c.passages.some(p=>/skiing|tennis/.test(p.text)));
});

test('personal training, empty cross-references and visibly corrupt source fragments are withheld',()=>{
  const c=buildCorpus([row({about:'She enjoys running, strength training and Pilates. Please see the list below for areas in which I have particular specialist experience. Renowned globally, he is not just a surgeon but a pioneer in the field.',clinical_interests:'Colop; octologyColonoscopyLapa; oscopic Su; ge; yHe; nia Su; ge; yPiles THD Su; ge; yHaemo; hoidsFissu; es'})]);
  assert.ok(!c.passages.some(p=>['about','clinical_interests'].includes(p.field)));
});

test('recorded addresses preserve abbreviations and do not create clinical-practice attributes',()=>{
  const c=buildCorpus([row({locations:[{hospital:'Practice',address:'London Spine Specialists Hospital Of St. John, 12 Example Rd.',postcode:'SW5 0AA'}]})]);
  const passages=c.passages.filter(p=>p.type==='location');assert.equal(passages.length,1);assert.ok(passages[0].text.includes('St. John'));assert.ok(passages[0].text.includes('SW5 0AA'));assert.ok(Object.values(passages[0].attributes).every(values=>values.length===0));
});

test('reviewed paraphrases retain the literal supporting excerpt and review identity basis separately',()=>{
  const text='The reviewed professional page describes cardiac CT reporting.';
  const sourceQuote='I report cardiac CT';
  const c=buildCorpus([row()],{enrichments:[{sourceRecordId:'source-1',sourceUrl:'https://hospital.example/profile',observedAt:'2026-10-06',verified:true,type:'clinical',text,excerpt:sourceQuote,review:{identityBasis:'Existing exact registration and named professional profile',limitations:['Undated source']}}]});
  const p=c.passages.find(p=>p.text===text);
  assert.equal(p.reviewedParaphrase,true);assert.equal(p.sourceQuote,sourceQuote);assert.notEqual(p.sourceQuote,p.text);
  assert.equal(p.sources[0].sourceQuote,sourceQuote);assert.equal(p.sources[0].reviewedParaphrase,true);assert.equal(p.identityBasis,'Existing exact registration and named professional profile');assert.deepEqual(p.review.limitations,['Undated source']);
});

test('a membership sentence in a biography remains background even when a society name contains Specialists',()=>{
  const text='He is a member of the European Society of Retinal Specialists.';
  assert.equal(classifyPassage(text,'about'),'professional-background');
});

test('clinical pharmacology and insurance acceptance cannot fabricate an industry relationship',()=>{
  assert.notEqual(classifyPassage('Dr Example is a consultant physician and clinical pharmacologist at a university hospital.','about'),'relationship');
  assert.notEqual(classifyPassage('The consultant works with all major insurance companies and treats self funded patients.','about'),'relationship');
});

test('explicit company roles and advisory work survive other professional activities in the same sentence',()=>{
  for(const text of [
    'I carry out medicolegal work and sit on international industry advisory panels for multinational companies.',
    'He is co-founder and Chief Clinical Officer at Example Devices, a start-up specialising in joint replacement implants.',
    'She consults for international orthopaedic companies.',
    'He advises pharmaceutical companies on cancer drug development.',
  ])assert.equal(classifyPassage(text,'about'),'relationship');
});

test('procedure size limits are descriptors rather than self-reported case volumes',()=>{
  const c=buildCorpus([row({procedures:['Wound debridement up to 25cm2 in area','Skin graft up to 9 cm2 in area','Scar revision up to 5cm'],about:'I have performed over 100 operations and interpreted approximately 200 diagnostic scans.'})]);
  for(const p of c.passages.filter(p=>p.field==='procedures'))assert.ok(!p.qualifiers.includes('self-reported-activity'));
  assert.ok(c.passages.some(p=>p.field==='about'&&p.qualifiers.includes('self-reported-activity')));
});

test('an author-and-title reference about training is not evidence of the clinician receiving training',()=>{
  const text='Example-Smith A.Training model for ultrasound-guided aspiration.';
  const c=buildCorpus([row({about:text})]);const p=c.passages.find(p=>p.field==='about');
  assert.equal(p.type,'professional-background');assert.equal(p.text,text);assert.ok(p.qualifiers.includes('bibliographic-reference-not-training-or-authorship'));assert.ok(!p.qualifiers.includes('training-not-practice'));assert.deepEqual(p.attributes.activity,[]);
});

test('qualifications and memberships in a biography are background, without inferred clinical interests',()=>{
  assert.equal(classifyPassage('She acquired a range of qualifications and memberships of specialist professional societies.','about'),'professional-background');
});

test('repeated broken word fragments glued to following words are withheld without rewriting the source',()=>{
  const text='Gall stonesHe; niaIncisional he; niaInguinal He; niaVent; al he; niaUm; ilical he; niaFemo; al he; niaPanc; eatitisA; dominal pain';
  const c=buildCorpus([row({clinical_interests:text})]);assert.ok(!c.passages.some(p=>p.field==='clinical_interests'));
});

test('explicit historical research roles and completed work are useful without implying current practice',()=>{
  for(const text of [
    'She has presented her research nationally and internationally.',
    'He was a Research Fellow at a medical school.',
    'I was awarded a PhD for completing a programme of clinical research.',
    'I completed a clinical research programme and published its findings.',
    'I am engaged in research and development.',
    'I am currently the research lead for trauma.',
    'My research focused on refractory angina.',
    'She is the Principal Investigator for a multi-centre project investigating real-world data.',
  ])assert.equal(classifyPassage(text,'about'),'research');
  assert.notEqual(classifyPassage('She hopes to become the principal investigator in a research study.','about'),'research');
  assert.equal(classifyPassage('I completed my Research MD with numerous publications.','about'),'training');
});

test('teaching delivery includes course leadership, past training of colleagues and lecturing',()=>{
  for(const text of [
    'I developed and directed an annual educational symposium.',
    'He has trained many surgeons in cataract surgery.',
    'She regularly lectures internationally.',
    'I am clinical lead for Education and Training and act as faculty on national teaching courses.',
    'I run international courses to teach ear surgery to other doctors.',
  ]){
    const type=classifyPassage(text,'about');assert.equal(type,'professional-background');assert.ok(extractAttributes(text,{field:'about',type}).activity.includes('teaching'));
  }
  const future='He hopes to train many surgeons in the future.';assert.ok(!extractAttributes(future,{field:'about',type:classifyPassage(future,'about')}).activity.includes('teaching'));
});

test('explicit patient care and procedures are retained without equating learned techniques with performance',()=>{
  for(const text of ['I undertake general dermatology clinics.','I offer cryotherapy treatment for warts.','He is a trained endoscopist, also undertaking endoscopic surgical procedures.','Surgical procedures undertaken include hearing implants.','I only see children over three years old.'])assert.equal(classifyPassage(text,'about'),'clinical-practice');
  assert.equal(classifyPassage('His fellowship taught him how to undertake endoscopic surgical procedures.','about'),'training');
});

test('all named provider profiles, including HCA and Ramsay, are checked within an upstream row',()=>{
  for(const sourceUrl of ['https://www.ramsayhealth.co.uk/specialists/mr-alex-exemplar','https://www.hcahealthcare.co.uk/finder/stepconsultantprofile/mr-alex-exemplar']) {
    const c=buildCorpus([row({profile_urls:{provider:sourceUrl}})]);
    assert.equal(c.candidates[0].needsIdentityReview,true);assert.equal(c.passages.length,0);
    assert.ok(c.identityLedger[0].sourceAssertions.some(a=>a.issue==='profile-name-mismatch'&&a.sourceUrl===sourceUrl&&a.sourceName==='mr alex exemplar'));
  }
});

test('opaque provider IDs and title changes alone are not evidence of a different person',()=>{
  const c=buildCorpus([row({name:'Dr Alex Example',hcpc_number:'PH54321',name_alternatives:{spire:'Mr Alex Example'},profile_urls:{phin:'https://www.phin.org.uk/consultants/123456',provider:'https://hospital.example/consultants/mr-alex-example'}})]);
  assert.equal(c.candidates[0].needsIdentityReview,false);assert.equal(c.candidates[0].registrations.length,2);assert.ok(c.passages.length);
});

test('a reviewed same-name provider registration conflict quarantines the complete connected group',()=>{
  const sourceUrl='https://hospital.example/consultants/dr-alex-example';
  const review={sourceUrl,sourceLabel:'Hospital',observedAt:'2026-10-06',sourceDate:null,name:'Dr Alex Example',registration:{body:'GMC',identifier:'7654321'},role:'Nephrologist',checked:true,excerpts:['GMC 7654321'],limitations:['Provider assertion, not regulator verification.']};
  const c=buildCorpus([row({id:'original',profile_urls:{provider:sourceUrl},specialty:'General Surgeon'}),row({id:'second',name:'Mr Alex Example'})],{identityReviews:[review]});
  assert.equal(c.candidates.length,1);assert.equal(c.candidates[0].needsIdentityReview,true);assert.equal(c.passages.length,0);
  assert.ok(c.identityLedger.every(l=>l.decision==='held-for-review'));
  const assertion=c.identityLedger.find(l=>l.sourceRecordId==='original').sourceAssertions.find(a=>a.issue==='reviewed-source-registration-conflict');
  assert.equal(assertion.registration.identifier,'7654321');assert.equal(assertion.recordedRegistrations[0].identifier,'1234567');assert.equal(assertion.sourceDate,null);assert.equal(assertion.observedAt,review.observedAt);assert.deepEqual(assertion.excerpts,review.excerpts);
  assert.deepEqual(c.candidates[0].registrations,[{body:'GMC',identifier:'1234567'}]);
});

test('source-bound name alternatives cannot silently override the canonical person',()=>{
  const c=buildCorpus([row({name_alternatives:{other:'Alex Exemplar'}})]);
  assert.equal(c.candidates[0].needsIdentityReview,true);assert.equal(c.passages.length,0);assert.ok(c.identityLedger[0].sourceAssertions.some(a=>a.field==='name_alternatives.other'&&a.issue==='source-name-conflict'));
});

test('unchecked, undated or unrelated identity observations cannot quarantine or reassign a person',()=>{
  const sourceUrl='https://hospital.example/consultants/alex-example';const review={sourceUrl,checked:true,observedAt:'2026-10-06',name:'Someone Else',registration:{body:'GMC',identifier:'7654321'}};
  for(const invalid of [{...review,checked:false},{...review,observedAt:null},{...review,sourceUrl:'https://unrelated.example/profile'}]){
    const c=buildCorpus([row({profile_urls:{provider:sourceUrl}})],{identityReviews:[invalid]});assert.equal(c.candidates[0].needsIdentityReview,false);assert.equal(c.identityLedger[0].sourceAssertions.length,0);
  }
});

test('a reviewed provider without a registration does not externally verify a raw HCPC number',()=>{
  const sourceUrl='https://hospital.example/consultants/alex-example';
  const c=buildCorpus([row({hcpc_number:'PH54321',profile_urls:{provider:sourceUrl}})],{identityReviews:[{sourceUrl,checked:true,observedAt:'2026-10-06',name:'Alex Example',registration:null,role:'Physiotherapy',excerpts:['Alex Example','Physiotherapy']}]});
  assert.equal(c.identityLedger[0].sourceAssertions[0].registration,null);assert.ok(c.candidates[0].registrations.some(r=>r.body==='HCPC'));
});

test('undergraduate studies plus conducting fellowship training is not research participation',()=>{
  const text='His undergraduate studies took place in Bristol. He then conducted sub-speciality fellowship training in Australia.';
  assert.equal(classifyPassage(text,'about'),'training');assert.ok(!extractAttributes(text,{field:'about',type:classifyPassage(text,'about')}).activity.includes('clinical research'));
  assert.equal(classifyPassage('After undergraduate studies, she conducted a clinical trial.','about'),'research');
});

test('education employment is not education received and device-use teaching can be patient care',()=>{
  assert.equal(classifyPassage('I have experience in public health, health education and support work in higher education.','about'),'professional-background');
  assert.equal(classifyPassage('The consultation includes training in adrenaline autoinjectors and nasal spray technique if prescribed.','about'),'clinical-practice');
  assert.equal(classifyPassage('I completed medical education and specialist fellowship training.','about'),'training');
});

test('research leadership remains searchable without attributing an institution name as a clinical interest',()=>{
  const text="Dr Example is a Gastroenterologist and Honorary Associate Professor for the University's cancer research centre.Dr Example is Director of Research & Innovation at the hospital.";
  const type=classifyPassage(text,'about');assert.equal(type,'research');
  const a=extractAttributes(text,{field:'about',type});assert.deepEqual(a.condition,[]);
  assert.equal(classifyPassage('She is the director of research at a university.','about'),'research');
});

test('official HCPC profession prefixes accept hearing-aid and prosthetics registrations',()=>{
  assert.deepEqual(normalizeRegistration('HCPC','HAD01234'),{body:'HCPC',identifier:'HAD01234'});
  assert.deepEqual(normalizeRegistration('HCPC','PO12345'),{body:'HCPC',identifier:'PO12345'});
  for(const [identifier,specialty]of [['HAD01234','Hearing aid dispenser'],['PO12345','Prosthetist and orthotist'],['PYL12345','Psychology'],['PH12345','Physiotherapist']]) {
    const c=buildCorpus([row({gmc_number:null,hcpc_number:identifier,specialty})]);assert.equal(c.candidates[0].needsIdentityReview,false);
  }
});

test('a HCPC profession-prefix disagreement quarantines evidence without repairing the ID',()=>{
  const c=buildCorpus([row({gmc_number:null,hcpc_number:'PH54321',specialty:'Psychology',specialty_source:'Provider'})]);
  assert.equal(c.candidates[0].needsIdentityReview,true);assert.equal(c.passages.length,0);assert.deepEqual(c.candidates[0].registrations,[{body:'HCPC',identifier:'PH54321'}]);
  const assertion=c.identityLedger[0].sourceAssertions.find(a=>a.issue==='hcpc-profession-role-conflict');
  assert.equal(assertion.field,'specialty');assert.equal(assertion.prefix,'PH');assert.deepEqual(assertion.compatiblePrefixes,['PYL']);assert.match(assertion.ruleSourceUrl,/hcpc-uk\.org/);
  const unclear=buildCorpus([row({gmc_number:null,hcpc_number:'PH54321',specialty:'Mental health services'})]);assert.equal(unclear.candidates[0].needsIdentityReview,false);
});

test('a reviewed linked-page investigation retains its exact provenance and cannot silently repair a raw registration',()=>{
  const review={checked:true,sourceUrl:'https://professional.example/about',sourceLabel:'Professional website',observedAt:'2026-10-06',sourceDate:null,reviewedSourceRecordIds:['source-1'],corroboratingUrl:'https://provider.example/people/alex-example',name:'Dr Alex Example',registration:{body:'HCPC',identifier:'PYL12345'},role:'Clinical psychologist',excerpts:['Clinical psychologist','HCPC PYL12345']};
  const c=buildCorpus([row({gmc_number:null,hcpc_number:'PH54321',specialty:'Psychology'})],{identityReviews:[review]});
  assert.equal(c.candidates[0].needsIdentityReview,true);assert.equal(c.candidates[0].registrations[0].identifier,'PH54321');
  const a=c.identityLedger[0].sourceAssertions.find(a=>a.issue==='reviewed-source-registration-conflict');assert.equal(a.binding,'reviewed-source-record-investigation');assert.equal(a.corroboratingUrl,review.corroboratingUrl);assert.deepEqual(a.excerpts,review.excerpts);
  const unrelated=buildCorpus([row({gmc_number:null,hcpc_number:'PYL54321',specialty:'Psychology'})],{identityReviews:[{...review,reviewedSourceRecordIds:['different-source']}]});assert.equal(unrelated.candidates[0].needsIdentityReview,false);
});

test('generic healthcare-industry employment is not an industry relationship',()=>{
  const text='I am an experienced Consultant Gynaecologist with a history of working in the hospital and healthcare industry.';
  assert.notEqual(classifyPassage(text,'about'),'relationship');
  assert.equal(classifyPassage('I advise pharmaceutical companies in the healthcare industry.','about'),'relationship');
});

test('supervising a clinical audit does not establish performing the clinical procedure',()=>{
  const text='I am supervising a multi-centre national audit on incidence and prophylaxis of DVT in foot and ankle surgery.';
  const type=classifyPassage(text,'about');assert.equal(type,'professional-background');assert.deepEqual(extractAttributes(text,{field:'about',type}).activity,[]);
  assert.equal(classifyPassage('I supervise and report adult cardiac CT.','about'),'clinical-practice');
});

test('generic website welcome text does not attach NHS/private settings to a practitioner',()=>{
  const c=buildCorpus([row({about:'Whether you are looking for the care from a specialist in the NHS or Private sector, we hope you find the information on these pages helpful.'})]);
  assert.ok(!c.passages.some(p=>p.field==='about'));
});

test('therapeutic ultrasound in cataract procedures is distinct from diagnostic imaging',()=>{
  const a=extractAttributes('Ultrasound phacoemulsification of cataract, with lens implant - unilateral',{field:'procedures',type:'procedure'});
  assert.deepEqual(a.modality,['therapeutic ultrasound']);
  const mixed=extractAttributes('Ultrasound phacoemulsification of cataracts. I also perform abdominal ultrasound scanning.',{field:'about',type:'clinical-practice'});
  assert.ok(mixed.modality.includes('therapeutic ultrasound'));assert.ok(mixed.modality.includes('ultrasound'));
  const c=buildCorpus([row({procedures:['Ultrasound phacoemulsification of cataracts, with lens implant - bilateral']})]);
  const p=c.passages.find(p=>p.field==='procedures');assert.match(p.text,/Ultrasound phacoemulsification/);assert.deepEqual(p.attributes.modality,['therapeutic ultrasound']);
});
