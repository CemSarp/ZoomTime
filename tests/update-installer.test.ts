import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { installedApplication, extractApplication, replaceApplication } from '../src/update-installer.ts';

// Small real ZIPs let the parser exercise malicious names and links without executing code.
async function archive(entries: { name: string; text?: string; mode?: number }[]): Promise<{ file: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'zoomtime-install-test-')), chunks: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.text ?? ''), header = Buffer.alloc(30), index = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt32LE(crc32(data),14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26);
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(0x314,4); index.writeUInt16LE(20,6); index.writeUInt32LE(crc32(data),16); index.writeUInt32LE(data.length,20); index.writeUInt32LE(data.length,24); index.writeUInt16LE(name.length,28); index.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0,38); index.writeUInt32LE(offset,42);
    chunks.push(header,name,data); central.push(index,name); offset += header.length+name.length+data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  const file=join(root,'test.zip');await writeFile(file,Buffer.concat([...chunks,directory,end]));return {file,root};
}
test('installation accepts only the fixed installed app locations', () => {
  assert.equal(installedApplication('/Applications/ZoomTime.app/Contents/MacOS/ZoomTime','/Users/test'),'/Applications/ZoomTime.app');
  assert.equal(installedApplication('/Users/test/Applications/ZoomTime.app/Contents/MacOS/ZoomTime','/Users/test'),'/Users/test/Applications/ZoomTime.app');
  for(const path of ['/tmp/ZoomTime.app/Contents/MacOS/ZoomTime','/Applications/Other.app/Contents/MacOS/ZoomTime','/Applications/ZoomTime.app/Contents/MacOS/../other','/Applications/ZoomTime.app.backup/Contents/MacOS/ZoomTime'])assert.throws(()=>installedApplication(path,'/Users/test'));
});
test('extraction preserves internal framework links and rejects unsafe ZIP entries', async () => {
  const safe=await archive([{name:'ZoomTime.app/Contents/data',text:'new'}, {name:'ZoomTime.app/Contents/link',text:'data',mode:0o120777}]);
  const app=await extractApplication(safe.file,join(safe.root,'out'));assert.equal(await readFile(join(app,'Contents/link'),'utf8'),'new');assert.equal((await lstat(join(app,'Contents/link'))).isSymbolicLink(),true);
  for(const entries of [
    [{name:'../outside',text:'bad'}], [{name:'/tmp/outside'}], [{name:'Other.app/file'}],
    [{name:'ZoomTime.app/Contents/link',text:'../../../outside',mode:0o120777}],
    [{name:'ZoomTime.app/link',text:'Contents',mode:0o120777},{name:'ZoomTime.app/link/child'}],
    [{name:'ZoomTime.app/A'},{name:'ZoomTime.app/a'}], [{name:'ZoomTime.app/fifo',mode:0o010600}],
  ]) {const zip=await archive(entries);await assert.rejects(extractApplication(zip.file,join(zip.root,'out')));}
});
test('replacement keeps the old app and rolls back when reopening fails', async () => {
  for(const fail of [false,true]) {
    const root=await mkdtemp(join(tmpdir(),'zoomtime-swap-')),target=join(root,'ZoomTime.app'),incoming=join(root,'incoming.app'),backup=join(root,'previous.app');
    for(const [path,text]of[[target,'old'],[incoming,'new']]){await mkdir(path);await writeFile(join(path,'content'),text);}
    if(fail){await assert.rejects(replaceApplication(target,incoming,backup,async()=>{throw new Error('launch failed');}));assert.equal(await readFile(join(target,'content'),'utf8'),'old');assert.equal(await readFile(join(incoming,'content'),'utf8'),'new');}
    else{await replaceApplication(target,incoming,backup,async(path)=>assert.equal(path,target));assert.equal(await readFile(join(target,'content'),'utf8'),'new');assert.equal(await readFile(join(backup,'content'),'utf8'),'old');}
  }
});
test('replacement never overwrites an existing backup or follows a target link',async()=>{
 const root=await mkdtemp(join(tmpdir(),'zoomtime-swap-reject-')),target=join(root,'target'),incoming=join(root,'incoming'),backup=join(root,'backup');
 await mkdir(incoming);await mkdir(backup);await mkdir(target);
 await assert.rejects(replaceApplication(target,incoming,backup,async()=>{}));
 const link=join(root,'link');await symlink(target,link);await assert.rejects(replaceApplication(link,incoming,join(root,'backup2'),async()=>{}));
});

import { execFile as execute, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareInstallation, validateApplication, updateOutcome, runUpdateHelper } from '../src/update-installer.ts';
const exec=promisify(execute);
test('real signed app staging checks version, architecture, quarantine and preserves installed files', {skip:process.platform!=='darwin'}, async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'zoomtime-native-stage-'))),home=join(root,'home'),target=join(home,'Applications/ZoomTime.app'),candidate=join(root,'payload/ZoomTime.app');
 await writeFile(join(root,'fixture.c'),'int main(void){return 0;}');
 for(const [app,version]of[[target,'0.3.4'],[candidate,'0.3.5']]){
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  await exec('/usr/bin/clang',['-mmacosx-version-min=14.0',join(root,'fixture.c'),'-o',join(app,'Contents/MacOS/ZoomTime')]);
  await writeFile(join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.cemsarp.zoomtime</string><key>CFBundleExecutable</key><string>ZoomTime</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  await exec('/usr/bin/codesign',['--force','--sign','-',app]);
 }
 await validateApplication(candidate,'0.3.5',process.arch);await assert.rejects(validateApplication(candidate,'9.9.9',process.arch));await assert.rejects(validateApplication(candidate,'0.3.5',process.arch==='arm64'?'x64':'arm64'));
 const archive=join(root,'release.zip');await exec('/usr/bin/zip',['-q','-r','-y',archive,'ZoomTime.app'],{cwd:join(root,'payload')});
 const data=await readFile(archive),arch=process.arch;
 const release={version:'0.3.5',name:`ZoomTime-darwin-${arch}-0.3.5.zip`,url:`https://github.com/CemSarp/ZoomTime/releases/download/v0.3.5/ZoomTime-darwin-${arch}-0.3.5.zip`,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),prerelease:true};
 const jobs=join(root,'jobs'),directory=await prepareInstallation(archive,release,join(target,'Contents/MacOS/ZoomTime'),'0.3.4',arch,jobs,home);
 const job=JSON.parse(await readFile(join(directory,'job.json'),'utf8'));
 const staged=join(home,'Applications',`.ZoomTime-update-${job.id}`,'ZoomTime.app');
 await validateApplication(staged,'0.3.5',arch);await validateApplication(target,'0.3.4',arch);
 assert.match((await exec('/usr/bin/xattr',['-p','com.apple.quarantine',staged])).stdout,/^[0-9a-f]+;/i);
 await writeFile(join(directory,'result.json'),JSON.stringify({stage:'installed'}),{mode:0o600});assert.match((await updateOutcome(directory,jobs))??'',/Update installed/);assert.equal(await updateOutcome('/etc',jobs),null);
 const child=spawn(process.execPath,['--input-type=module','-e',`import {runUpdateHelper} from ${JSON.stringify(import.meta.resolve('../src/update-installer.ts'))}; await runUpdateHelper(...JSON.parse(process.argv[1]));`,JSON.stringify([directory,join(target,'Contents/MacOS/ZoomTime'),arch,jobs,home])],{stdio:'ignore'});
 try {
  for(let i=0;i<100;i++){assert.equal(child.exitCode,null,'Helper must remain alive until the parent quits');try{if(await readFile(join(directory,'ready'),'utf8')==='ready')break;}catch{}await new Promise(r=>setTimeout(r,50));}
  assert.equal(await readFile(join(directory,'ready'),'utf8'),'ready');await validateApplication(target,'0.3.4',arch);
 }finally{const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await exited;}
 await writeFile(join(staged,'Contents/MacOS/ZoomTime'),'tampered');await assert.rejects(validateApplication(staged,'0.3.5',arch));
});

test('extraction rejects oversized entry counts before writing app files',async()=>{
 const zip=await archive([{name:'ZoomTime.app/file'}]),data=await readFile(zip.file);
 data.writeUInt16LE(20001,data.length-14);data.writeUInt16LE(20001,data.length-12);await writeFile(zip.file,data);
 await assert.rejects(extractApplication(zip.file,join(zip.root,'out')),/excessive/);
});
test('extraction rejects excessive expanded size before decompressing',async()=>{
 const zip=await archive([{name:'ZoomTime.app/file'}]),data=await readFile(zip.file),central=data.readUInt32LE(data.length-6);
 data.writeUInt16LE(8,8);data.writeUInt32LE(2*1024**3+1,22);data.writeUInt16LE(8,central+10);data.writeUInt32LE(2*1024**3+1,central+24);await writeFile(zip.file,data);
 await assert.rejects(extractApplication(zip.file,join(zip.root,'out')),/excessive/);
});

test('a handoff cannot be replayed by a different parent process',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'zoomtime-parent-bind-'))),directory=join(root,'job-abcdef'),home=join(root,'home'),target=join(home,'Applications/ZoomTime.app');await mkdir(directory,{mode:0o700});
 const release={version:'0.3.5',name:`ZoomTime-darwin-${process.arch}-0.3.5.zip`,url:`https://github.com/CemSarp/ZoomTime/releases/download/v0.3.5/ZoomTime-darwin-${process.arch}-0.3.5.zip`,sha256:'a'.repeat(64),size:1,prerelease:true};
 await writeFile(join(directory,'job.json'),JSON.stringify({schema:1,id:'12345678-1234-1234-1234-123456789abc',target,oldVersion:'0.3.4',parentPid:1000000000,dev:1,ino:2,release}),{mode:0o600});
 await assert.rejects(runUpdateHelper(directory,join(target,'Contents/MacOS/ZoomTime'),process.arch,root,home),/Invalid update handoff data/);
 await assert.rejects(lstat(join(directory,'result.json')),{code:'ENOENT'});
});
