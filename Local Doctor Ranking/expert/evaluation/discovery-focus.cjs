'use strict';
// Development verification of the new discovery interaction, not held-out
// retrieval quality or an exhaustive review of every candidate's qualifications.
const {parseBrief}=require('../brief.cjs');
const {directMatch}=require('../search.cjs');
const E=require('../public/evidence.js');
const CASES=[
  {id:'profession-only',message:'Cardiologists',role:'Cardiologist'},
  {id:'radiology-interests',message:'Cardiologists with radiology interests',role:'Cardiologist',anchor:'Medical imaging'},
  {id:'cardiac-imaging-interests',message:'Cardiologists interested in cardiac imaging',role:'Cardiologist',anchor:'Cardiovascular imaging'},
  {id:'imaging-research-interests',message:'Cardiologists with research interests in imaging',role:'Cardiologist',anchor:'Medical imaging'},
  {id:'required-reporting',message:'Only cardiologists. Cardiac CT reporting is essential.',role:'Cardiologist',anchor:'Cardiac CT',strict:true},
  {id:'insufficient-information',message:'I need an expert',clarification:true}
];
function ownedSupport(candidate,support){
  const source=candidate.evidence.find(p=>p.id===support.evidenceId&&p.candidateId===candidate.id);
  if(!source)return false;
  if(support.kind==='reviewed-summary')return source.reviewedParaphrase===true&&support.text===source.text;
  return [source.text,source.sourceQuote].filter(Boolean).some(text=>text.includes(support.text));
}
async function evaluateFocus({engine,onCase=()=>{}}){
  if(!engine?.ready)throw new Error('A ready audited corpus index is required');
  const report={kind:'discovery-development-verification',startedAt:new Date().toISOString(),corpusVersion:engine.corpus.version,scope:'Six supplied discovery briefs across actual BM25-only, semantic-only and hybrid retrieval. Checks cover the first 20 results; sampled proof is not a new independent source audit.',cases:[]};
  for(const scenario of CASES){
    const parsed=parseBrief({message:scenario.message}),brief=parsed.brief,entry={id:scenario.id,message:scenario.message,brief,byMode:{}};
    for(const mode of ['bm25','semantic','hybrid']){
      const start=performance.now(),result=await engine.search(brief,{retrievalMode:mode,...(scenario.strict?{documentedOnly:true}:{})}),top=result.results.slice(0,20),checks=[];
      const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
      check('clarification matches specificity',!!result.needsClarification===!!scenario.clarification);
      if(scenario.clarification){check('no arbitrary recommendations',top.length===0);check('no invented requirements',brief.requirements.length===0);}
      else{
        check('sourced candidates returned',top.length>0);
        check('requested profession is documented in every reviewed result',top.every(c=>c.requirementMatrix.some(m=>m.kind==='role'&&m.label===scenario.role&&m.status==='documented')));
        check('every displayed proof remains source owned',top.every(c=>c.requirementMatrix.every(m=>(m.supportingEvidence||[]).every(s=>ownedSupport(c,s)))));
        check('related research retains ownership and dates',top.every(c=>(c.relatedEvidence||[]).length<=2&&(c.relatedEvidence||[]).every(s=>ownedSupport(c,s)&&s.sourceDate===(c.evidence.find(p=>p.id===s.evidenceId)?.dates?.sourceDate||null))));
        if(!scenario.strict)check('ordinary discovery did not invent mandatory qualifications',brief.requirements.every(r=>r.importance==='focus'));
        else check('documented-only retains requested reporting requirement',top.every(c=>c.requirementMatrix.some(m=>m.kind==='activity'&&m.importance==='essential'&&m.status==='documented')));
        if(scenario.anchor){
          const requirement=brief.requirements.find(r=>r.label===scenario.anchor);
          check('requested clinical concept remains active',!!requirement);
          check('first six have source evidence for requested concept',top.slice(0,6).every(c=>c.requirementMatrix.some(m=>m.requirementId===requirement?.id&&['documented','potential'].includes(m.status)&&m.evidenceIds.length>0)));
          check('visible relevance excerpts include the matching concept',top.slice(0,6).every(c=>{
            const proof=E.cardProofs(c,brief,{limit:2}).find(p=>p.requirement?.id===requirement?.id||p.coveredRequirementIds?.includes(requirement?.id));
            const span=proof?.support||c.requirementMatrix.find(m=>m.requirementId===requirement?.id)?.supportingEvidence?.[0];
            return !!span&&directMatch(requirement,{text:span.text.slice(0,210),type:span.evidenceType,attributes:{}});
          }));
        }
        check('retrieval method remains honest',mode==='bm25'?result.diagnostics.semanticCandidates===0:mode==='semantic'?result.diagnostics.bm25Candidates===0:result.diagnostics.bm25Candidates>0&&result.diagnostics.semanticCandidates>0);
      }
      entry.byMode[mode]={durationMs:Math.round(performance.now()-start),totalResults:result.results.length,checks,top20Ids:top.map(c=>c.id),samples:top.slice(0,6).map(c=>({id:c.id,name:c.name,role:c.role,specialty:c.specialty,proofs:E.cardProofs(c,brief,{limit:2}).map(p=>({criterion:p.requirement?.label||null,text:p.support?.text,evidenceType:p.support?.evidenceType,kind:p.support?.kind,evidenceId:p.support?.evidenceId})),related:(c.relatedEvidence||[]).map(p=>({text:p.text,evidenceType:p.evidenceType,sourceDate:p.sourceDate,evidenceId:p.evidenceId}))})),diagnostics:{bm25Candidates:result.diagnostics.bm25Candidates,semanticCandidates:result.diagnostics.semanticCandidates,retrievalExpansions:result.diagnostics.retrievalExpansions||[]}};
    }
    report.cases.push(entry);onCase(entry);
  }
  const checks=report.cases.flatMap(c=>Object.values(c.byMode).flatMap(mode=>mode.checks));
  report.summary={briefs:CASES.length,retrievalRuns:CASES.length*3,checks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};report.passed=checks.every(c=>c.pass);report.completedAt=new Date().toISOString();return report;
}
module.exports={evaluateFocus,CASES};
