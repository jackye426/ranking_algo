'use strict';
// Fixed synthetic positive/negative cases. Expectations never enter the request.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function main(){
 if(!process.argv.includes('--live'))throw Error('Explicit --live required');
 const file=path.join(root,'.cache/checker-calibration.json');if(fs.existsSync(file))throw Error('Preserve the existing calibration report');
 const fixtures=require('./checker-calibration.cjs'),{checkerSystemPrompt,checkerSchema}=require('../ai.cjs');
 if(!checkerSystemPrompt||!checkerSchema)throw Error('Production checker contract is not ready');
 require('dotenv').config({path:path.join(root,'../.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
 const OpenAI=require('openai'),{createBufferedClient}=require('../transport.cjs'),model='deepseek/deepseek-v3.2';
 const report={at:new Date().toISOString(),fixtureVersion:fixtures.version,fixtureHash:createHash('sha256').update(fs.readFileSync(path.join(__dirname,'checker-calibration.cjs'))).digest('hex'),checkerPromptHash:createHash('sha256').update(checkerSystemPrompt).digest('hex'),syntheticOnly:true,maxCalls:1,pending:true};
 const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
 const real=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',maxRetries:0,timeout:15000,logLevel:'off'});
 const client=createBufferedClient(real,{provider:'friendli',onCall:metric=>{report.call=metric;save();}});
 try{
  const schema={type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',minItems:fixtures.modelCases.length,maxItems:fixtures.modelCases.length,items:{type:'object',additionalProperties:false,required:['id','unsupportedClaims'],properties:{id:{type:'string',enum:fixtures.modelCases.map(c=>c.id)},unsupportedClaims:checkerSchema.properties.unsupportedClaims}}}}};
  const start=performance.now(),response=await client.chat.completions.create({model,temperature:0,max_tokens:800,reasoning:{enabled:false},provider:{...require('../../demo/models.cjs').openRouterProvider(model,{check:true}),sort:'latency'},messages:[{role:'system',content:checkerSystemPrompt+' Apply that same rubric independently to each supplied case. Return one results entry per case ID, without crossing evidence between cases. Include only actual violations in unsupportedClaims; otherwise use an empty array.'},{role:'user',content:JSON.stringify({cases:fixtures.modelCases})}],response_format:{type:'json_schema',json_schema:{name:'expert_checker_calibration',strict:true,schema}}},{signal:AbortSignal.timeout(15000),timeout:15000});
  report.durationMs=Math.round(performance.now()-start);report.output=JSON.parse(response.choices[0].message.content);
  const output=report.output.results;if(!Array.isArray(output)||output.length!==fixtures.modelCases.length||new Set(output.map(r=>r.id)).size!==output.length)throw Error('Malformed calibration output');
  report.results=fixtures.expectations.map(expected=>{const actual=output.find(r=>r.id===expected.id);if(!actual||!Array.isArray(actual.unsupportedClaims))throw Error('Missing calibration verdict');return{...expected,actualSupported:actual.unsupportedClaims.length===0,unsupportedClaims:actual.unsupportedClaims,passed:(actual.unsupportedClaims.length===0)===expected.supported};});
  report.passed=report.results.every(r=>r.passed);
 }catch(error){report.error={name:error.name};report.passed=false;}
 report.pending=false;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
