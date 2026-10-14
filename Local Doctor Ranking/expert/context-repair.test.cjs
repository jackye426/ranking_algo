'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {identity,strings,canonical}=require('./repair/prepare-context.cjs');
test('context identity corroboration refuses same name with conflicting registration',()=>{
 assert.equal(identity({name:'Dr Jane Smith',gmc_number:'1234567'},{name:'Jane Smith',gmc_number:'7654321'}),'registration-conflict');
 assert.equal(identity({name:'Dr John Smith',gmc_number:'1234567'},{name:'Jane Smith',gmc_number:'1234567'}),'name-conflict');
 assert.equal(identity({name:'Dr Jane Smith',gmc_number:'1234567'},{name:'Jane Smith',gmc_number:'1234567'}),'canonical-url-name-and-gmc');
});
test('context extraction preserves exact short and negative source entries and rejects structured surprises',()=>{
 assert.deepEqual(strings(['CT','MR','No','Adults aged 18–65']),['CT','MR','No','Adults aged 18–65']);
 assert.deepEqual(strings({title:'Unexpected nested data'}),[]);
 assert.deepEqual(strings(['CT',{text:'MR'}]),[]);
 assert.deepEqual(strings('No surgical treatment, 2010–2020'),['No surgical treatment, 2010–2020']);
});
test('context URLs reject credential-bearing and executable sources',()=>{
 assert.equal(canonical('https://user:pass@example.com/a'),null);
 assert.equal(canonical('javascript:alert(1)'),null);
 assert.equal(canonical('https://example.com/person/?x=1#top'),'https://example.com/person');
});
