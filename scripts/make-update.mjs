import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,statSync,lstatSync,readdirSync,readlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {loadSigningPolicy,verifyPinnedCode,verifyPinnedData,signingRequirement} from '../src/release-signing.ts';
import {releaseFeed} from '../src/update-release.ts';
import {compareVersions} from '../src/updates.ts';
const run=(file,args)=>execFileSync(file,args,{encoding:'utf8',maxBuffer:1024*1024,timeout:300000});
export const bundleVersion=app=>run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',join(app,'Contents/Info.plist')]).trim();
export function treeDigest(root){
 const hash=createHash('sha256');
 function visit(path,relative){const s=lstatSync(path);hash.update(JSON.stringify([relative,s.mode&0o7777,s.isSymbolicLink()?'link':s.isDirectory()?'dir':'file'])+'\n');if(s.isSymbolicLink())hash.update(readlinkSync(path));else if(s.isDirectory())for(const name of readdirSync(path).sort())visit(join(path,name),relative+'/'+name);else hash.update(readFileSync(path));}
 visit(root,'');return hash.digest('hex');
}
export async function produceUpdate(app,output,previous){
 const policy=loadSigningPolicy('build/signing-policy.json'),version=bundleVersion(app);
 const validate=async path=>{await verifyPinnedCode(path,policy,policy.appId);await verifyPinnedCode(join(path,'Contents/Resources/ZoomTimeCapture'),policy,policy.helperId);};
 await validate(app);mkdirSync(output,{recursive:true});
 // A fresh directory keeps the exact signed base and all failed reconstruction evidence.
 const directory=mkdtempSync(join(output,version+'-')),bundle=join(directory,'ZoomTime.app');run('/usr/bin/ditto',[app,bundle]);assert.equal(treeDigest(app),treeDigest(bundle));
 const zip=join(directory,`ZoomTime-darwin-arm64-${version}.zip`);run('/usr/bin/ditto',['-c','-k','--norsrc','--noextattr','--keepParent',bundle,zip]);
 const artifact=file=>({name:basename(file),size:statSync(file).size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')});
 const full=artifact(zip);let delta,base;
 if(previous){
  await validate(previous);base=bundleVersion(previous);assert.ok(compareVersions(base,version)<0,'Delta must start at an older signed release');
  run(process.execPath,['scripts/setup-delta-tool.mjs']);
  const tool=resolve('out/tools/Sparkle-2.9.5/bin/BinaryDelta'),patch=join(directory,`ZoomTime-darwin-arm64-${base}-to-${version}.delta`);
  run(tool,['create','--version','4','--compression','lzma',previous,bundle,patch]);
  const reconstructed=join(directory,'reconstructed.app');run(tool,['apply',previous,reconstructed,patch]);await validate(reconstructed);
  assert.equal(treeDigest(reconstructed),treeDigest(bundle),'Delta must reconstruct every signed byte, path and mode');
  const result=artifact(patch);if(result.size<full.size)delta={...result,fromVersion:base};
 }
 const feedName=`ZoomTime-native-arm64-${version}.json`;writeFileSync(join(directory,feedName),JSON.stringify(releaseFeed(version,full,delta,new Date().toISOString()),null,2)+'\n');
 const feedFile=join(directory,feedName),signature=feedFile+'.sig';
 run('/usr/bin/codesign',['--sign',policy.certificateSha1,'--identifier',policy.appId,'--requirements','=designated => '+signingRequirement(policy,policy.appId),'--timestamp=none','--detached',signature,feedFile]);
 await verifyPinnedData(feedFile,signature,policy);
 const assets=[full,...(delta?[delta]:[]),artifact(feedFile),artifact(signature)];
 const source={commit:run('git',['rev-parse','HEAD']).trim(),dirty:run('git',['status','--porcelain']).trim()!==''};
 writeFileSync(join(directory,'build-manifest.json'),JSON.stringify({schema:1,version,source,certificateSha256:policy.certificateSha256,bundleTreeSha256:treeDigest(bundle),base:base??null,deltaVerified:!!delta,tool:{name:'Sparkle BinaryDelta',version:'2.9.5',archiveSha256:'015336b601493e05c237964954bff6191370003d94edefe663724c88840d73cc'},lockfileSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),assets,physicalAcceptance:'pending',published:false},null,2)+'\n');
 assets.push(artifact(join(directory,'build-manifest.json')));writeFileSync(join(directory,'SHA256SUMS'),assets.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n');
 return{directory,version,full,delta,assets};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const result=await produceUpdate(resolve(process.argv[2]??'out/ZoomTime-darwin-arm64/ZoomTime.app'),resolve('out/incremental-releases'),process.argv[3]?resolve(process.argv[3]):undefined);console.log(JSON.stringify(result,null,2));}
