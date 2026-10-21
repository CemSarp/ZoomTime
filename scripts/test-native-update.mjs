import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,appendFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {packager} from '@electron/packager';
import {sign} from '@electron/osx-sign';
import {flipFuses,FuseVersion,FuseV1Options} from '@electron/fuses';
import {loadSigningPolicy,signingRequirement,normalizeBundlePermissions,verifyPinnedCode,skipNonCodeSigning} from '../src/release-signing.ts';
import {selectNativeRelease} from '../src/native-feed.ts';
import {prepareNativeSession} from '../src/native-installation.ts';
import {extractApplication,validateApplication} from '../src/update-installer.ts';
import {produceUpdate,treeDigest} from './make-update.mjs';
import {releaseFeed} from '../src/update-release.ts';
const fixtureRoot=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
const root=fixtureRoot?resolve(fixtureRoot):mkdtempSync(resolve('out/verification/native-update-')),config=join(root,'config.json'),events=join(root,'events.jsonl'),policy=loadSigningPolicy('build/signing-policy.json');
const execute=(file,args)=>execFileSync(file,args,{encoding:'utf8',timeout:300000,maxBuffer:1024*1024});
const apps=[];const source=join(root,'source');mkdirSync(source,{recursive:true});
const main=`const {app,autoUpdater}=require('electron');const fs=require('node:fs');const config=${JSON.stringify(config)},events=${JSON.stringify(events)};function record(type,extra={}){fs.appendFileSync(events,JSON.stringify({type,version:app.getVersion(),executable:process.execPath,...extra})+'\\n');}app.setPath('userData',${JSON.stringify(join(root,'profile'))});app.whenReady().then(()=>{record('launch');const c=JSON.parse(fs.readFileSync(config));if(c.version!==app.getVersion())return;autoUpdater.on('error',e=>{record('error',{message:e.message});app.quit();});autoUpdater.on('update-downloaded',()=>{record('ready');autoUpdater.quitAndInstall();});autoUpdater.setFeedURL({url:c.feedUrl,serverType:'json'});autoUpdater.checkForUpdates();});`;
writeFileSync(join(source,'main.cjs'),main);
for(const version of ['0.5.0','0.5.1','0.5.2']){
 const existing=join(root,version,'ZoomTime-darwin-arm64/ZoomTime.app');
 if(existsSync(existing)&&execute('/usr/libexec/PlistBuddy',['-c','Print :LSMinimumSystemVersion',join(existing,'Contents/Info.plist')]).trim()==='14.0'&&execute('/usr/libexec/PlistBuddy',['-c','Print :ElectronSquirrelPreventDowngrades',join(existing,'Contents/Info.plist')]).trim()==='true'){await verifyPinnedCode(existing,policy,policy.appId);apps.push(existing);continue;}
 writeFileSync(join(source,'package.json'),JSON.stringify({name:'zoomtime',productName:'ZoomTime',version,main:'main.cjs'}));
 const [output]=await packager({dir:source,out:join(root,version),name:'ZoomTime',appBundleId:policy.appId,appVersion:version,buildVersion:version,platform:'darwin',arch:'arm64',electronVersion:'44.7.1',asar:true,extraResource:[resolve('out/native/arm64/ZoomTimeCapture')],extendInfo:{LSMinimumSystemVersion:'14.0',ElectronSquirrelPreventDowngrades:true},quiet:true});
 const app=join(output,'ZoomTime.app');await flipFuses(app,{version:FuseVersion.V1,[FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableCookieEncryption]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,[FuseV1Options.OnlyLoadAppFromAsar]:true});
 normalizeBundlePermissions(app);
 await sign({app,identity:policy.certificateSha1,identityValidation:false,ignore:skipNonCodeSigning,optionsForFile:file=>({timestamp:'none',hardenedRuntime:false,entitlements:['com.apple.security.cs.allow-jit','com.apple.security.device.camera','com.apple.security.device.audio-input'],...(file===app?{requirements:'=designated => '+signingRequirement(policy,policy.appId)}:{})})});
 await verifyPinnedCode(app,policy,policy.appId);apps.push(app);console.log('Signed native fixture '+version);
}
const releases=[];for(let i=1;i<apps.length;i++)releases.push(await produceUpdate(apps[i],join(root,'releases'),apps[i-1]));
const versions=['0.5.0','0.5.1','0.5.2'];let downloads=[];
const previousRows=existsSync(events)?readFileSync(events,'utf8').trim().split('\n').filter(Boolean).length:0;
const records=()=>existsSync(events)?readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).slice(previousRows):[];
async function waitFor(predicate,label,expectError=false){for(let n=0;n<600;n++){const rows=records();const error=rows.find(r=>r.type==='error');if(error&&!expectError)throw Error(JSON.stringify(error));if(predicate(rows))return;await delay(100);}throw Error('Native update timed out: '+label+' '+JSON.stringify(records()));}
// Isolated Applications roots never replace either user installation or profile.
const home=mkdtempSync(join(root,'home-')),installed=join(home,'Applications/',process.argv.includes('--experimental')?'ZoomTime Experimental.app':'ZoomTime.app');mkdirSync(join(home,'Applications'),{recursive:true});execute('/usr/bin/ditto',[apps[0],installed]);
mkdirSync(join(root,'profile'),{recursive:true});writeFileSync(join(root,'profile','pairing.encrypted.json'),'synthetic encrypted fixture');writeFileSync(join(root,'profile','settings.json'),'retained settings');
const marker=treeDigest(join(root,'profile'));let child;
try{
 for(let i=0;i<2;i++){
  const release=releases[i],full=release.full,delta=release.delta;assert.ok(delta&&delta.size<full.size,'Delta must save transferred bytes');
  const transfer=[],realFetch=globalThis.fetch;
  const metadata=[{tag_name:'v'+versions[i+1],draft:false,prerelease:true,assets:release.assets.map(asset=>({...asset,state:'uploaded',digest:'sha256:'+asset.sha256,browser_download_url:'https://github.com/CemSarp/ZoomTime/releases/download/v'+versions[i+1]+'/'+asset.name}))}];
  const selected=selectNativeRelease(metadata,versions[i],'arm64');assert.ok(selected);
  globalThis.fetch=async input=>{
   const name=new URL(String(input)).pathname.split('/').pop();const asset=release.assets.find(a=>a.name===name);assert.ok(asset,'No unexpected outbound fixture request');
   if(!name.endsWith('.json')&&!name.endsWith('.sig'))transfer.push(name);
   const bytes=readFileSync(join(release.directory,name));
   if(i===1&&name.endsWith('.delta'))bytes[bytes.length-1]^=1;
   return new Response(bytes,{status:200});
  };
  const broker=await prepareNativeSession({executable:join(installed,'Contents/MacOS/ZoomTime'),current:versions[i],selected,policy,root:join(home,'updates'),home,progress:()=>{}});
  const backup=await broker.recoveryPath();await verifyPinnedCode(backup,policy,policy.appId);await broker.verifyRestart();
  writeFileSync(config,JSON.stringify({version:versions[i],feedUrl:broker.feedUrl}));
  if(i===0)child=spawn(join(installed,'Contents/MacOS/ZoomTime'),[],{env:{...process.env,CFFIXED_USER_HOME:home},stdio:['ignore','ignore','pipe']});
  else { /* Previous relaunch waits for an explicit next check; relaunch it with the next feed. */ execute('/usr/bin/pkill',['-f',join(installed,'Contents/MacOS/ZoomTime')]);await delay(500);child=spawn(join(installed,'Contents/MacOS/ZoomTime'),[],{env:{...process.env,CFFIXED_USER_HOME:home},stdio:['ignore','ignore','pipe']}); }
  child.stderr.on('data',chunk=>appendFileSync(join(root,'stderr.log'),chunk));
  await waitFor(rows=>rows.some(r=>r.version===versions[i+1]&&r.type==='launch'),'install '+versions[i+1]);await broker.close();globalThis.fetch=realFetch;
  await verifyPinnedCode(installed,policy,policy.appId);assert.equal(treeDigest(installed),treeDigest(apps[i+1]));
  downloads.push({from:versions[i],to:versions[i+1],transfer,deltaBytes:delta.size,fullBytes:full.size});
  if(i===0)assert.deepEqual(transfer,[delta.name]);else assert.deepEqual(transfer,[delta.name,full.name]);
  assert.equal(readFileSync(join(root,'profile','pairing.encrypted.json'),'utf8'),'synthetic encrypted fixture');assert.equal(readFileSync(join(root,'profile','settings.json'),'utf8'),'retained settings');
 }


 // Replaying an older/equal signed tree cannot acquire the target feed's signature.
 for(const [kind,targetTree] of [['reverse',apps[0]],['equal',apps[1]]]){
  const attackHome=mkdtempSync(join(root,'binding-')),target=join(attackHome,'Applications/ZoomTime.app');mkdirSync(join(attackHome,'Applications'));execute('/usr/bin/ditto',[apps[1],target]);
  const patch=join(attackHome,'substituted.delta');execute(resolve('out/tools/Sparkle-2.9.5/bin/BinaryDelta'),['create','--version','4','--compression','lzma',apps[1],targetTree,patch]);
  const deltaBytes=readFileSync(patch),release=releases[1],feedName='ZoomTime-native-arm64-0.5.2.json',feed=JSON.parse(readFileSync(join(release.directory,feedName),'utf8'));
  feed.releases[0].updateTo.delta.sha256=createHash('sha256').update(deltaBytes).digest('hex');feed.releases[0].updateTo.delta.size=deltaBytes.length;
  const feedBytes=Buffer.from(JSON.stringify(feed)),assets=release.assets.map(a=>a.name===feedName?{...a,size:feedBytes.length,sha256:createHash('sha256').update(feedBytes).digest('hex')}:a.name.endsWith('.delta')?{...a,size:deltaBytes.length,sha256:createHash('sha256').update(deltaBytes).digest('hex')}:a);
  const selected=selectNativeRelease([{tag_name:'v0.5.2',draft:false,prerelease:true,assets:assets.map(a=>({...a,state:'uploaded',digest:'sha256:'+a.sha256,browser_download_url:'https://github.com/CemSarp/ZoomTime/releases/download/v0.5.2/'+a.name}))}],'0.5.1','arm64');assert.ok(selected);
  let requestedPatch=false;const realFetch=globalThis.fetch;
  globalThis.fetch=async input=>{const name=new URL(String(input)).pathname.split('/').pop();if(name===feedName)return new Response(feedBytes);if(name===feedName+'.sig')return new Response(readFileSync(join(release.directory,name)));requestedPatch=true;throw Error('Untrusted delta requested');};
  try{await assert.rejects(prepareNativeSession({executable:join(target,'Contents/MacOS/ZoomTime'),current:'0.5.1',selected,policy,root:join(attackHome,'updates'),home:attackHome,progress:()=>{}}),error=>String(error).includes('codesign'));assert.equal(requestedPatch,false);assert.equal(treeDigest(target),treeDigest(apps[1]));console.log('Unsigned '+kind+' delta substitution rejected before native staging');}
  finally{globalThis.fetch=realFetch;}
 }
 // A hash-valid package with another signing identity must still be rejected by Squirrel.
 const wrongRoot=join(home,'wrong-signer');mkdirSync(wrongRoot);const wrong=join(wrongRoot,'ZoomTime.app');execute('/usr/bin/ditto',[apps[1],wrong]);execute('/usr/bin/codesign',['--force','--deep','--sign','-',wrong]);
 const wrongZip=join(home,'wrong-signer.zip');execute('/usr/bin/ditto',['-c','-k','--norsrc','--noextattr','--keepParent',wrong,wrongZip]);
 const extractedWrong=await extractApplication(wrongZip,join(home,'wrong-signer-extracted'));await validateApplication(extractedWrong,'0.5.1','arm64');
 await assert.rejects(verifyPinnedCode(extractedWrong,policy,policy.appId),/code failed to satisfy specified code requirement/);
 const bytes=readFileSync(wrongZip),full={name:'ZoomTime-darwin-arm64-0.5.1.zip',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const feedName='ZoomTime-native-arm64-0.5.1.json',feedBytes=Buffer.from(JSON.stringify(releaseFeed('0.5.1',full,undefined,new Date().toISOString())));
 const negativeFeed=join(home,feedName);writeFileSync(negativeFeed,feedBytes);execute('/usr/bin/codesign',['--sign',policy.certificateSha1,'--identifier',policy.appId,'--requirements','=designated => '+signingRequirement(policy,policy.appId),'--timestamp=none','--detached',negativeFeed+'.sig',negativeFeed]);
 const signatureBytes=readFileSync(negativeFeed+'.sig');
 const assets=[full,{name:feedName,size:feedBytes.length,sha256:createHash('sha256').update(feedBytes).digest('hex')},{name:feedName+'.sig',size:signatureBytes.length,sha256:createHash('sha256').update(signatureBytes).digest('hex')}];
 const selected=selectNativeRelease([{tag_name:'v0.5.1',draft:false,prerelease:true,assets:assets.map(a=>({...a,state:'uploaded',digest:'sha256:'+a.sha256,browser_download_url:'https://github.com/CemSarp/ZoomTime/releases/download/v0.5.1/'+a.name}))}],'0.5.0','arm64');assert.ok(selected);
 for(const failure of ['wrong-signer','corrupt-full','cancelled-transfer','unwritable']){
  const failureHome=mkdtempSync(join(root,'failure-')),target=join(failureHome,'Applications/ZoomTime.app');mkdirSync(join(failureHome,'Applications'));execute('/usr/bin/ditto',[apps[0],target]);const before=treeDigest(target),start=records().length,realFetch=globalThis.fetch;
  globalThis.fetch=async(input,options)=>{
   if(String(input).endsWith('.json'))return new Response(feedBytes);
   if(String(input).endsWith('.sig'))return new Response(signatureBytes);
   if(failure==='cancelled-transfer')return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,100));options.signal.addEventListener('abort',()=>controller.error(Error('cancelled')),{once:true});}}));
   const data=Buffer.from(bytes);if(failure==='corrupt-full')data[data.length-1]^=1;return new Response(data);
  };
  let native;
  try{
   if(failure==='unwritable'){chmodSync(join(failureHome,'Applications'),0o555);await assert.rejects(prepareNativeSession({executable:join(target,'Contents/MacOS/ZoomTime'),current:'0.5.0',selected,policy,root:join(failureHome,'updates'),home:failureHome,progress:()=>{}}),/not writable/);}
   else {
    native=await prepareNativeSession({executable:join(target,'Contents/MacOS/ZoomTime'),current:'0.5.0',selected,policy,root:join(failureHome,'updates'),home:failureHome,progress:()=>{}});
    writeFileSync(config,JSON.stringify({version:'0.5.0',feedUrl:native.feedUrl}));
    const probe=spawn(join(target,'Contents/MacOS/ZoomTime'),[],{env:{...process.env,CFFIXED_USER_HOME:failureHome},stdio:['ignore','ignore','pipe']});probe.stderr.on('data',chunk=>appendFileSync(join(root,'stderr.log'),chunk));
    if(failure==='cancelled-transfer'){await delay(1200);await native.close();}
    await waitFor(rows=>rows.slice(start).some(r=>r.type==='error'),'rejection '+failure,true);
    assert.ok(!records().slice(start).some(r=>r.type==='ready'));await verifyPinnedCode(await native.recoveryPath(),policy,policy.appId);
   }
   assert.equal(treeDigest(target),before);console.log('Native failure preserved installation: '+failure);
  }finally{await native?.close();globalThis.fetch=realFetch;chmodSync(join(failureHome,'Applications'),0o755);try{execute('/usr/bin/pkill',['-f',join(target,'Contents/MacOS/ZoomTime')]);}catch{}}
 }
 writeFileSync(join(home,'result.json'),JSON.stringify({result:'pass',root,downloads,sameInstalledPath:true,backupsVerified:true,profilesPreserved:true,deltaTargetBindingVerified:true,wrongSignerRejected:true,corruptFullRejected:true,cancellationPreservedInstallation:true,unwritableRejected:true,permissionContinuity:'not tested',fixtureOnly:true,originalProfileDigest:marker},null,2));console.log(JSON.stringify({result:'pass',root,downloads}));
}finally{try{execute('/usr/bin/pkill',['-f',join(installed,'Contents/MacOS/ZoomTime')]);}catch{}child?.kill();}
