'use strict';

// These are next-step examples, not clinical inferences or new requirements.
// Callers choose a stable reason at the decision point; question prose is
// never inspected to guess which options to show.
const QUESTIONS=Object.freeze({
  'ct-application':'That’s CT medical-device software. What will it be used for?',
  'device-purpose':'What does the software do?',
  'device-clinical-subject':'Which clinical subject, procedure or modality does this purpose concern? Include that expertise with what the software does.',
  expertise:'What expertise are you looking for? A specialty, clinical interest, procedure or research area is enough to start.',
  context:'What else should we know about the expertise you need?'
});
const REPLIES=Object.freeze({
  'ct-application':[
    ['cardiac-ct','Cardiac CT'],['brain-ct','Brain CT'],['lung-ct','Lung CT'],['general-ct','General CT']
  ],
  'device-purpose':[
    ['diagnosis','The software supports diagnosis.'],
    ['monitoring','The software monitors a clinical condition.'],
    ['treatment-planning','The software supports treatment planning.']
  ],
  expertise:[['cardiologists','Cardiologists'],['dermatologists','Dermatologists'],['cardiac-imaging-research','Cardiac imaging research']]
});
function createClarification(kind,{question,deviceCode}={}){
  if(!Object.hasOwn(QUESTIONS,kind))kind='context';
  const reviewed=kind==='expertise'||kind==='ct-application'&&deviceCode==='Z11030692'||kind==='device-purpose'&&deviceCode==='V92';
  return {kind,question:typeof question==='string'&&question.trim()?question:QUESTIONS[kind],quickReplies:(reviewed?REPLIES[kind]||[]:[]).map(([id,message])=>({id,message}))};
}
function withClarification(result,kind='expertise',options={}){
  // A failed interpretation is a recovery task, not an invitation to replace
  // the user's intent with an unrelated example. Successful search has none.
  if(result.interpretationIncomplete||!result.needsClarification){delete result.clarification;return result;}
  if(result.deviceError)return result;
  const selected=result.clarification?.kind||kind;
  result.clarification=createClarification(selected,{...options,question:result.question||options.question});
  result.question=result.clarification.question;
  return result;
}
module.exports={QUESTIONS,createClarification,withClarification};
