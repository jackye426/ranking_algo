'use strict';
// Explicit result controls are operations/context, never invented expertise.
// Match bounded clauses and mask only the handled words, preserving offsets.
function controls(raw){
  const spans=[],notices=[],context=[];let documentedOnly,clinicalImportance;
  const consume=(pattern,apply)=>{for(const match of raw.matchAll(pattern)){spans.push([match.index,match.index+match[0].length]);apply(match);}};
  consume(/\b(?:(?:we\s+)?(?:only\s+want|want\s+only)|return\s+only|show\s+only|only)\s+(?:options|candidates|experts|results)\s+(?:where\s+every|whose|with\s+all)\s+essential\s+requirements?\s+(?:is\s+|are\s+)?documented\b/gi,()=>{documentedOnly=true;notices.push('Showing candidates with documented evidence for every essential requirement.');});
  consume(/\b(?:turn\s+off|remove|clear|disable)\s+(?:the\s+)?documented[- ](?:essentials[- ])?only\s*(?:filter|restriction)?\b|\binclude\s+(?:candidates|options)\s+with\s+unconfirmed\s+essentials\b/gi,()=>{documentedOnly=false;notices.push('Including candidates with clearly shown essential checks.');});
  consume(/\bclinical\s+expertise\s+(?:is|should\s+be|must\s+be)\s+(essential|required|mandatory|optional|preferred)\b/gi,m=>{clinicalImportance=/essential|required|mandatory/i.test(m[1])?'essential':'preferred';});
  consume(/\b(?:do\s+not|don't|don’t|never)\s+infer\s+independence\s+from\s+(?:a\s+)?(?:missing|absent)\s+(?:company|manufacturer|relationship)\s+(?:mention|evidence|record)\b/gi,()=>notices.push('Independence remains Not reviewed; missing relationship evidence does not establish it.'));
  consume(/\b(?:do\s+not|don't|don’t|never)\s+treat\s+(?:a\s+)?consultant\s+title\s+as\s+proof\s+of\s+(?:it|that|regulatory\s+(?:experience|expertise))\b/gi,()=>notices.push('A consultant title does not establish regulatory-assessment experience.'));
  consume(/\bwithout\s+assuming\s+(?:a\s+)?(?:particular|specific)\s+modality\b/gi,()=>notices.push('No unspecified imaging modality has been added.'));
  consume(/\b(?:show|include|retain|display)\s+(?:any\s+|the\s+)?(?:reporting\s+)?periods?\s+(?:attached\s+to|recorded\s+(?:with|for)|available\s+(?:for|with))\s+(?:the\s+)?(?:figures|counts|activity|procedures)\b/gi,m=>{context.push({label:'Reporting periods',text:m[0]});notices.push('Reporting periods are shown where recorded; missing periods remain unknown.');});
  consume(/\b(?:a\s+)?(?:user|person|patient|layperson)\s+without\s+medical\s+training\s+(?:may|can|will|might)\s+(?:act\s+on|use|follow)\s+(?:its\s+|the\s+)?(?:advice|results|recommendations|outputs)\b/gi,m=>context.push({label:'Intended users and workflow',text:m[0]}));
  // A device's intended users are not automatically the experts being sought.
  // Only consume an explicit device/version statement; ordinary clinician
  // requests such as "Find general practitioners" remain role requirements.
  consume(/\b(?:this|the|our)\s+(?:version|device|software|tool|application)\s+(?:is\s+|will\s+be\s+)?(?:intended\s+)?(?:for\s+(?:use\s+by\s+)?|used\s+by\s+)(?:general practitioners?|GPs?|family (?:doctors?|physicians?))(?:\s+in\s+primary[- ]care)?\b/gi,m=>context.push({label:'Intended users and workflow',text:m[0]}));
  let text=raw;for(const [start,end]of spans)text=text.slice(0,start)+' '.repeat(end-start)+text.slice(end);
  return {text,spans,notices,context,documentedOnly,clinicalImportance};
}
module.exports={controls};
