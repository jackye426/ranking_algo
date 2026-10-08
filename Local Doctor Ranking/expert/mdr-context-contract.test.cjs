'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {snapshot}=require('./ai.cjs'),{normalizeBrief}=require('./brief.cjs');
test('AI context distinguishes MDR and EMDN classification from candidate evidence',()=>{
 const brief={version:1,summary:'Cardiac CT',requirements:[],deviceContext:{schemaVersion:2,classifications:[{system:'MDR',code:'MDA0315',family:'MDA',officialTerm:'Software',release:'2017/2185'},{system:'EMDN',code:'Z11030692',officialTerm:'CT medical device software',release:'2026'}],interpretation:'Cardiac CT'}};
 const original=structuredClone(brief),context=snapshot({brief,candidates:[{id:'c',name:'Professional',evidence:[]}]});
 assert.deepEqual(brief,original);assert.deepEqual(context.brief.deviceContext.classifications.map(x=>x.system),['MDR','EMDN']);assert.match(context.brief.deviceContext.meaning,/not candidate evidence/);assert.deepEqual(context.candidates[0].evidence,[]);
});
test('normalising equivalent requirements merges classification origins without dangling IDs',()=>{
 const brief={version:1,requirements:[{id:'a',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'focus'},{id:'b',kind:'modality',label:'Coronary CT',text:'Coronary CT',importance:'essential'}],deviceContext:{schemaVersion:2,concepts:[{key:'modality:cardiac ct',requirementId:'a',state:'active',origins:['EMDN:Z11030692'],userOrigin:false,legacyOrigin:false},{key:'modality:coronary ct',requirementId:'b',state:'active',origins:['MDR:MDA0315'],userOrigin:true,legacyOrigin:false}],derivedRequirementIds:['a','b']}};
 const normalized=normalizeBrief(brief);assert.equal(normalized.requirements.length,1);assert.equal(normalized.requirements[0].importance,'essential');assert.equal(normalized.deviceContext.concepts.length,1);assert.equal(normalized.deviceContext.concepts[0].requirementId,'a');assert.equal(normalized.deviceContext.concepts[0].userOrigin,true);assert.deepEqual(normalized.deviceContext.concepts[0].origins,['EMDN:Z11030692','MDR:MDA0315']);assert.deepEqual(normalized.deviceContext.derivedRequirementIds,['a']);assert.equal(brief.requirements.length,2);
});
