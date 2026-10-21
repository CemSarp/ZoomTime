import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base='https://github.com/CemSarp/ZoomTime/releases/download/v0.5.1/';
const asset=(name:string,size=12)=>({name,browser_download_url:base+name,digest:'sha256:'+'a'.repeat(64),size,state:'uploaded'});
const metadata=()=>[{draft:false,prerelease:true,tag_name:'v0.5.1',assets:[asset('ZoomTime-darwin-arm64-0.5.1.zip'),asset('ZoomTime-native-arm64-0.5.1.json'),asset('ZoomTime-native-arm64-0.5.1.json.sig'),asset('ZoomTime-darwin-arm64-0.5.0-to-0.5.1.delta')]}];
const feed=()=>({currentRelease:'0.5.1',releases:[{version:'0.5.1',updateTo:{version:'0.5.1',url:base+'ZoomTime-darwin-arm64-0.5.1.zip',name:'ZoomTime0.5.1',notes:'test',pub_date:'2026-10-18T12:00:00Z',sha256:'a'.repeat(64),size:12,delta:{from_version:'0.5.0',url:base+'ZoomTime-darwin-arm64-0.5.0-to-0.5.1.delta',sha256:'a'.repeat(64),size:12}}}]});
test('native feeds bind exact GitHub assets, version and full/delta integrity',async()=>{
 const native=await import('../src/native-feed.ts').catch(()=>null);assert.ok(native,'Native feed policy must exist');
 const release=native.selectNativeRelease(metadata(),'0.5.0','arm64');assert.ok(release);
 const plan=native.parseNativeFeed(feed(),release,'0.5.0');assert.ok(plan.delta);assert.equal(plan.version,'0.5.1');
 assert.equal(native.selectNativeRelease(metadata(),'0.5.1','arm64'),null);
 for(const mutation of [
  (f:ReturnType<typeof feed>)=>{f.currentRelease='0.5.2';},
  (f:ReturnType<typeof feed>)=>{f.releases[0].updateTo.url='https://evil.example/payload';},
  (f:ReturnType<typeof feed>)=>{f.releases[0].updateTo.sha256='b'.repeat(64);},
  (f:ReturnType<typeof feed>)=>{f.releases[0].updateTo.size++;},
 ]){const f=feed();mutation(f);assert.throws(()=>native.parseNativeFeed(f,release,'0.5.0'));}
 const noDelta=metadata();noDelta[0].assets.pop();const full=native.selectNativeRelease(noDelta,'0.5.0','arm64');assert.ok(full);assert.equal(native.parseNativeFeed(feed(),full,'0.5.0').delta,undefined);
 const invalid=metadata();invalid[0].assets.push(asset('ZoomTime-native-arm64-0.5.1.json'));assert.throws(()=>native.selectNativeRelease(invalid,'0.5.0','arm64'));
});
test('native broker downloads only on authorized requests, deduplicates and permits safe full fallback',async()=>{
 const native=await import('../src/native-feed.ts').catch(()=>null);assert.ok(native);
 const selected=native.selectNativeRelease(metadata(),'0.5.0','arm64');assert.ok(selected);
 const plan=native.parseNativeFeed(feed(),selected,'0.5.0'),root=await mkdtemp(join(tmpdir(),'zoomtime-broker-'));let calls=0;
 const broker=await native.startNativeBroker(plan,root,()=>{},async(asset,directory)=>{calls++;if(asset.name.endsWith('.delta'))throw Error('Corrupt patch');const path=join(directory,'fixture.zip');await writeFile(path,'full archive');return path;});
 try{
  assert.equal(calls,0);const url=new URL(broker.feedUrl);
  assert.equal((await fetch(new URL('/',url))).status,404);
  assert.equal((await fetch(broker.feedUrl,{headers:{Origin:'https://evil.example'}})).status,403);
  const served=await(await fetch(broker.feedUrl)).json();const payload=served.releases[0].updateTo;
  assert.equal((await fetch(payload.delta.url)).status,500);
  const results=await Promise.all([fetch(payload.url).then(r=>r.text()),fetch(payload.url).then(r=>r.text())]);assert.deepEqual(results,['full archive','full archive']);assert.equal(calls,2);
 }finally{await broker.close();}
});
test('feed bytes are bounded and hash checked before parsing; corrupt and truncated feeds fail',async()=>{
 const {fetchUpdateAsset}=await import('../src/updates.ts');const {createHash}=await import('node:crypto');const fetchBefore=globalThis.fetch;const bytes=Buffer.from(JSON.stringify(feed()));
 const expected={name:'feed.json',url:base+'ZoomTime-native-arm64-0.5.1.json',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 try{globalThis.fetch=async()=>new Response(bytes);assert.deepEqual(await fetchUpdateAsset(expected),feed());
 for(const bad of [{...expected,size:bytes.length-1},{...expected,size:bytes.length+1},{...expected,sha256:'b'.repeat(64)},{...expected,size:65537}])await assert.rejects(fetchUpdateAsset(bad));
 }finally{globalThis.fetch=fetchBefore;}
});
