'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareVectors}=require('./seed-compatibility.cjs');
test('matching finite vectors report exact agreement',()=>{const a=Array(384).fill(0);a[3]=1;assert.deepEqual(compareVectors(a,a),{cosine:1,maxAbsoluteDifference:0,rootMeanSquaredDifference:0});});
test('different directions cannot pass as a compatible model',()=>{const a=Array(384).fill(0),b=[...a];a[1]=1;b[2]=1;const v=compareVectors(a,b);assert.equal(v.cosine,0);assert.equal(v.maxAbsoluteDifference,1);});
test('invalid dimensionality, zero vectors and nonfinite values fail closed',()=>{assert.throws(()=>compareVectors([1],[1]));assert.throws(()=>compareVectors(Array(384).fill(0),Array(384).fill(0)));assert.throws(()=>compareVectors(Array(384).fill(NaN),Array(384).fill(1)));});
