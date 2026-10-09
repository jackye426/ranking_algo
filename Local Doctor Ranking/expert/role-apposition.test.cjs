'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matrixFor}=require('./search.cjs');
const person={id:'person',name:'Alex Example'},requirement={id:'role',kind:'role',label:'Dietitian',text:'Dietitian',importance:'focus'};
function result(text,name=person.name){const p={id:'passage',candidateId:'person',sourceRecordId:'source',text,field:'about',type:'professional-background',attributes:{},qualifiers:[]};return matrixFor({...person,name},[p],{requirements:[requirement]})[0];}
test('named owner role remains supported across an explicit founding apposition and promotional adjective',()=>{
 for(const text of ['Alex Example, Founder of Example Nutrition, is a multi award-winning dietitian and consultant nutritionist.','Alex Example, director of Example Nutrition, is a registered dietitian.','Alex Example is an award-winning dietitian.']){
  const row=result(text);assert.equal(row.status,'documented',text);assert.ok(text.includes(row.supportingEvidence[0].text));
 }
});
test('founding appositions and promotional adjectives never assign another person’s role to the owner',()=>{
 for(const text of ['Alex Example works with an award-winning dietitian.','Alex Example, whose colleague is a registered dietitian, provides coaching.','Alex Example, Founder of Example Nutrition, employs a dietitian.','Alex Example, Founder of Example Nutrition, is not a dietitian.','Jordan Other, Founder of Example Nutrition, is a registered dietitian.','Alex Example previously worked as a dietitian.','Alex Example founded a clinic with Jordan Other, an award-winning dietitian.'])assert.notEqual(result(text).status,'documented',text);
});
