import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
const base='https://github.com/CemSarp/ZoomTime/releases/download/v0.5.1/';
const metadata=[{draft:false,prerelease:true,tag_name:'v0.5.1',assets:['ZoomTime-darwin-arm64-0.5.1.zip','ZoomTime-native-arm64-0.5.1.json','ZoomTime-native-arm64-0.5.1.json.sig'].map(name=>({name,browser_download_url:base+name,state:'uploaded',size:10,digest:'sha256:'+'a'.repeat(64)}))}];
class Driver extends EventEmitter {checks=0;restarts=0;url='';setFeedURL(options:{url:string}){this.url=options.url;}checkForUpdates(){this.checks++;}quitAndInstall(){this.restarts++;}}
test('native updates are explicit, serialize staging, retain ready state during active calls and verify before restart',async()=>{
 const module=await import('../src/native-updates.ts').catch(()=>null);assert.ok(module,'Native updater controller must exist');
 const driver=new Driver();let loads=0,prepared=0,closed=0,verified=0;const states:unknown[]=[];
 const updates=new module.NativeUpdates('0.5.0','arm64',driver,async()=>{prepared++;return{feedUrl:'http://127.0.0.1/test',close:async()=>{closed++;},verifyRestart:async()=>{verified++;},recoveryPath:async()=>'/private/backup.app'};},s=>states.push(s),async()=>{loads++;return metadata;});
 assert.equal(loads,0);await updates.download();assert.equal(prepared,0);await updates.check();assert.equal(updates.state.status,'available');assert.equal(driver.checks,0);
 await updates.download();await updates.download();await updates.check();assert.equal(prepared,1);assert.equal(driver.checks,1);assert.equal(updates.state.status,'downloading');
 driver.emit('update-downloaded');await new Promise(r=>setImmediate(r));assert.equal(updates.state.status,'ready');assert.equal(closed,1);
 await updates.install(()=>{throw Error('Call active');});assert.equal(driver.restarts,0);assert.equal(updates.state.status,'ready');
 await updates.install(()=>{});assert.equal(driver.restarts,1);assert.equal(verified,1);assert.equal(updates.state.status,'installing');
 assert.doesNotMatch(JSON.stringify(states),/127\.0\.0\.1|private\/backup/);await updates.dispose();
});
test('native errors and late events cannot revive cancelled staging or expose native paths',async()=>{
 const module=await import('../src/native-updates.ts').catch(()=>null);assert.ok(module);
 const driver=new Driver();let close=0;
 const updates=new module.NativeUpdates('0.5.0','arm64',driver,async()=>({feedUrl:'http://127.0.0.1/test',close:async()=>{close++;},verifyRestart:async()=>{throw Error('tampered');},recoveryPath:async()=>'/private/backup.app'}),()=>{},async()=>metadata);
 await updates.check();await updates.download();driver.emit('error',Error('https://secret-url /private/cache'));
 await new Promise(r=>setImmediate(r));assert.equal(updates.state.status,'error');assert.doesNotMatch(updates.state.message,/secret-url|private\/cache/);assert.equal(await updates.verifiedPath(),'/private/backup.app');
 await updates.dispose();driver.emit('update-downloaded');assert.notEqual(updates.state.status,'ready');assert.ok(close>=1);
});
test('a session starting during backup verification retains the staged update; install errors are visible',async()=>{
 const {NativeUpdates}=await import('../src/native-updates.ts');const driver=new Driver();let checks=0;
 const updates=new NativeUpdates('0.5.0','arm64',driver,async()=>({feedUrl:'http://127.0.0.1/test',close:async()=>{},verifyRestart:async()=>{},recoveryPath:async()=>'/backup'}),()=>{},async()=>metadata);
 await updates.check();await updates.download();driver.emit('update-downloaded');await new Promise(r=>setImmediate(r));
 await updates.install(()=>{if(++checks===2)throw Error('call began');});assert.equal(updates.state.status,'ready');assert.equal(driver.restarts,0);
 await updates.install(()=>{});driver.emit('error',Error('installation failed'));await new Promise(r=>setImmediate(r));assert.equal(updates.state.status,'error');await updates.dispose();
});
test('disposing while preparation is pending closes it without starting native downloads',async()=>{
 const {NativeUpdates}=await import('../src/native-updates.ts');const driver=new Driver();let finish!:(session:import('../src/native-updates.ts').NativeSession)=>void,closed=0;
 const updates=new NativeUpdates('0.5.0','arm64',driver,()=>new Promise(resolve=>{finish=resolve;}),()=>{},async()=>metadata);
 await updates.check();const pending=updates.download();await updates.dispose();finish({feedUrl:'http://127.0.0.1/test',close:async()=>{closed++;},verifyRestart:async()=>{},recoveryPath:async()=>'/backup'});await pending;
 assert.equal(driver.checks,0);assert.equal(closed,1);
});
