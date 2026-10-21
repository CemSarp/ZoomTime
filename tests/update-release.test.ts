import {test} from 'node:test';
import assert from 'node:assert/strict';
test('release feed uses immutable canonical assets and requires a preceding base for delta',async()=>{
 const m=await import('../src/update-release.ts').catch(()=>null);assert.ok(m,'Release producer contract must exist');
 const full={name:'ZoomTime-darwin-arm64-0.5.1.zip',sha256:'a'.repeat(64),size:100};
 const feed=m.releaseFeed('0.5.1',full,undefined,'2026-10-18T00:00:00Z');
 assert.equal(feed.releases[0].updateTo.url,'https://github.com/CemSarp/ZoomTime/releases/download/v0.5.1/'+full.name);
 assert.equal(feed.releases[0].updateTo.delta,undefined);
 const delta={name:'ZoomTime-darwin-arm64-0.5.0-to-0.5.1.delta',sha256:'b'.repeat(64),size:10,fromVersion:'0.5.0'};
 assert.equal(m.releaseFeed('0.5.1',full,delta,'2026-10-18T00:00:00Z').releases[0].updateTo.delta?.from_version,'0.5.0');
 for(const bad of [{...delta,fromVersion:'0.5.1'},{...delta,size:101},{...delta,name:'bad.delta'}])assert.throws(()=>m.releaseFeed('0.5.1',full,bad,'2026-10-18T00:00:00Z'));
 assert.throws(()=>m.releaseFeed('0.5.1',{...full,sha256:'bad'},undefined,'2026-10-18T00:00:00Z'));
});
