'use strict';
// Read the candidate prefix of our immutable corpus export without retaining passages.
const fs=require('node:fs'),crypto=require('node:crypto'),{StringDecoder}=require('node:string_decoder');
async function readCandidates(file,{sha256,bytes:expectedBytes,version}={}){
 const hash=crypto.createHash('sha256'),decoder=new StringDecoder('utf8'),marker='],"passages":[',prefix='{"candidates":';let parts=[],tail='',characters=0,candidates=null,bytes=0,ending=Buffer.alloc(0);
 for await(const chunk of fs.createReadStream(file)){
  hash.update(chunk);bytes+=chunk.length;ending=Buffer.concat([ending,chunk]);if(ending.length>4096)ending=ending.subarray(ending.length-4096);
  if(!candidates){const text=decoder.write(chunk),probe=tail+text;parts.push(text);characters+=text.length;if(probe.includes(marker)){const start=parts.join(''),end=start.indexOf(marker);if(!start.startsWith(prefix))throw Error('Unexpected corpus export order');try{candidates=JSON.parse(start.slice(prefix.length,end+1));}catch{throw Error('Invalid baseline candidate JSON');}parts=[];tail='';}else if(characters>150000000)throw Error('Candidate export exceeds bound');else tail=probe.slice(-marker.length);}
 }
 const actual=hash.digest('hex'),actualVersion=ending.toString('utf8').match(/,"version":"([^"\\]+)"\}$/)?.[1];
 if(actual!==sha256||bytes!==expectedBytes||!Array.isArray(candidates)||!actualVersion||version!==undefined&&actualVersion!==version)throw Error('Baseline corpus checksum, length or version mismatch');
 return {candidates,version:actualVersion,sha256:actual,bytes};
}
module.exports={readCandidates};
