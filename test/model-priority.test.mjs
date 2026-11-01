import {test} from 'node:test';import assert from 'node:assert/strict';
import {MODEL_PRIORITY,defaultParticipants,preferredModerator,chooseModerator} from '../public/model-priority.js';

test('Claude is default final editor whenever selected, independently of visual order',()=>{
 assert.equal(preferredModerator(['grok','openai','claude']),'claude');
 assert.equal(chooseModerator(['claude','openai','mistral'],'',{}),'claude');
});
test('OpenAI is fallback when Claude is absent, Grok is always last',()=>{
 assert.equal(preferredModerator(['grok','gemini','openai']),'openai');
 assert.equal(preferredModerator(['grok','mistral','gemini']),'mistral');
 assert.equal(preferredModerator(['grok','deepseek','qwen']),'qwen');
 assert.equal(preferredModerator(['grok']),'grok');
 assert.equal(preferredModerator([]),null);
 assert.equal(MODEL_PRIORITY.at(-1),'grok');
});
test('initial selected models prefer Claude, OpenAI, Mistral over Grok and respect cap',()=>{
 assert.deepEqual(defaultParticipants(['openai','grok','mistral','claude','gemini']),['claude','openai','mistral']);
 assert.deepEqual(defaultParticipants(['openai','grok','gemini']),['openai','gemini','grok']);
 assert.deepEqual(defaultParticipants(['grok','mistral']),['mistral','grok']);
 assert.deepEqual(defaultParticipants(['grok']),['grok']);
 assert.deepEqual(defaultParticipants(['grok','claude','openai','mistral'],2),['claude','openai']);
});
test('explicit manual moderator choice is retained until user deselects that model',()=>{
 assert.equal(chooseModerator(['claude','openai','grok'],'openai',{manual:true}),'openai');
 assert.equal(chooseModerator(['claude','openai','grok'],'grok',{manual:true}),'grok');
 assert.equal(chooseModerator(['claude','openai','grok'],'grok',{manual:false}),'claude');
 assert.equal(chooseModerator(['claude','openai'],'grok',{manual:true}),'claude');
});
