'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function canonical(v){if(v===undefined||v===null)return 'null';if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const hash=v=>sha(canonical(v));
async function fileHash(file){const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))h.update(c);return h.digest('hex');}
async function regular(file){if(!path.isAbsolute(file))throw Error('Absolute private paths required');let current=path.parse(file).root;for(const part of file.slice(current.length).split(path.sep)){current=path.join(current,part);if((await fsp.lstat(current)).isSymbolicLink())throw Error('Symlink/junction input denied');}if(!(await fsp.stat(file)).isFile())throw Error('Regular artifact required');return file;}
function inside(root,rel){if(typeof rel!=='string'||path.isAbsolute(rel)||/[\0<>:"|?*]/.test(rel)||rel.split(/[\\/]/).some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe artifact path');return path.join(root,rel);}
async function verify(file,expected){await regular(file);if(!/^[a-f0-9]{64}$/.test(expected||'')||await fileHash(file)!==expected)throw Error('Artifact hash mismatch: '+path.basename(file));}
async function json(file){return JSON.parse(await fsp.readFile(file,'utf8'));}
// Frozen release format: top-level arrays of objects. Scan only the requested
// array and JSON.parse bounded complete records; do not tokenize every skipped
// passage in a multi-gigabyte corpus on each preparation pass.
async function eachArray(file,key,fn){
  const stream=fs.createReadStream(file,{highWaterMark:256*1024}),decoder=new TextDecoder('utf-8',{fatal:true});
  let depth=0,inString=false,escaped=false,keyText=null,currentKey=null,selected=false,record=false,parts=[],bytes=0,ordinal=0,arrayState='empty';
  try{for await(const chunk of stream){const text=decoder.decode(chunk,{stream:true});let start=record?0:-1;
    for(let i=0;i<text.length;i++){const ch=text[i];
      if(inString){if(escaped){escaped=false;if(keyText!==null)keyText+=ch;continue;}if(ch==='\\'){escaped=true;if(keyText!==null)keyText+=ch;continue;}if(ch==='"'){inString=false;if(keyText!==null){currentKey=JSON.parse('"'+keyText+'"');keyText=null;}}else if(keyText!==null){keyText+=ch;if(keyText.length>500)throw Error('Corpus key limit');}continue;}
      if(ch==='"'){if(selected&&!record&&depth===2)throw Error('Release array requires object records');inString=true;if(depth===1)keyText='';continue;}
      if(ch==='{'||ch==='['){if(selected&&!record&&depth===2){if(ch!=='{'||arrayState==='comma')throw Error('Release array requires comma-separated object records');record=true;start=i;parts=[];bytes=0;}if(ch==='['&&depth===1&&currentKey===key)selected=true;depth++;if(depth>40)throw Error('Release nesting limit');continue;}
      if(ch==='}'||ch===']'){
        if(record&&ch==='}'&&depth===3){parts.push(text.slice(start,i+1));const serialized=parts.join('');if(Buffer.byteLength(serialized)>8*1024*1024)throw Error('Release record limit');const value=JSON.parse(serialized);await fn(value,ordinal++);record=false;start=-1;parts=[];bytes=0;arrayState='comma';}
        if(selected&&!record&&ch===']'&&depth===2){if(arrayState==='value')throw Error('Trailing array comma');return;}
        depth--;if(depth<0)throw Error('Malformed release JSON');continue;
      }
      if(selected&&!record&&depth===2){if(ch===','){if(arrayState!=='comma')throw Error('Malformed release array comma');arrayState='value';}else if(!/\s/.test(ch))throw Error('Malformed release array');}
    }
    if(record){const tail=text.slice(start);parts.push(tail);bytes+=Buffer.byteLength(tail);if(bytes>8*1024*1024)throw Error('Release record limit');}
  }decoder.decode();throw Error('Missing or incomplete release array: '+key);}finally{stream.destroy();}
}
async function insertBatch(db,table,rows){if(!rows.length)return;if(!/^[a-z_]+$/.test(table))throw Error('Invalid internal table');const columns=Object.keys(rows[0]);const sql=`insert into docmap_professional.${table} (${columns.join(',')}) select ${columns.map(c=>table==='fields'&&c==='value'?"coalesce(x.value,'null'::jsonb)":`x.${c}`).join(',')} from jsonb_populate_recordset(null::docmap_professional.${table}, $1::jsonb) x${['identities','archive_links'].includes(table)?' on conflict do nothing':''}`;await db.query(sql,[JSON.stringify(rows)]);}
function batch(db,table,size=200){let rows=[];return {async push(row){rows.push(row);if(rows.length>=size)await this.flush();},async flush(){if(rows.length){const pending=rows;rows=[];await insertBatch(db,table,pending);}}};}
function safeUrl(v){if(v==null)return null;try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.hostname==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':')||[...u.searchParams.keys()].some(k=>/token|password|secret|email|session/i.test(k)))throw Error();return u.href;}catch{throw Error('Unsafe provenance URL');}}
function date(v){if(v==null)return;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Unsupported date semantics');const day=v.slice(0,10);if(new Date(day).toISOString().slice(0,10)!==day)throw Error('Invalid calendar date');}
module.exports={sha,hash,canonical,fileHash,regular,inside,verify,json,eachArray,insertBatch,batch,safeUrl,date};
