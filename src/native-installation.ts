import {access,lstat,realpath,mkdir,mkdtemp,writeFile,rename,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname,basename} from 'node:path';
import {validateApplication,extractApplication} from './update-installer.ts';
import {verifyPinnedCode,verifyPinnedData,type SigningPolicy} from './release-signing.ts';
import {fetchUpdateBytes,saveUpdate} from './updates.ts';
import {parseNativeFeed,startNativeBroker,type selectNativeRelease} from './native-feed.ts';
import type {NativeSession} from './native-updates.ts';
export function nativeApplication(executable:string,home:string):string {
 for(const root of ['/Applications',join(home,'Applications')])for(const name of ['ZoomTime.app','ZoomTime Experimental.app']){
  const app=join(root,name);if(executable===join(app,'Contents/MacOS/ZoomTime'))return app;
 }
 throw Error('Use ZoomTime or ZoomTime Experimental in Applications before updating.');
}
async function owned(path:string,privateMode=false){const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||await realpath(path)!==path||privateMode&&(info.mode&0o077))throw Error('The update location is not a safe user-owned directory.');return info;}
async function validate(path:string,version:string,policy:SigningPolicy){await validateApplication(path,version,'arm64');await verifyPinnedCode(path,policy,policy.appId);await verifyPinnedCode(join(path,'Contents/Resources/ZoomTimeCapture'),policy,policy.helperId);}
export async function prepareNativeSession(options:{executable:string;current:string;selected:NonNullable<ReturnType<typeof selectNativeRelease>>;policy:SigningPolicy;root:string;home:string;progress:(percent:number)=>void}):Promise<NativeSession>{
 const {current,selected,policy,root,home,progress}=options,target=nativeApplication(options.executable,home);
 const original=await owned(target);await validate(target,current,policy);
 try{await access(dirname(target),constants.W_OK);}catch{throw Error('The Applications folder is not writable. Your installed app was not changed.');}
 await mkdir(root,{recursive:true,mode:0o700});await owned(root,true);
 const directory=await mkdtemp(join(root,`backup-${current}-`)),backup=join(directory,basename(target));
 await promisify(execFile)('/usr/bin/ditto',[target,backup],{timeout:120_000,maxBuffer:8192});await validate(backup,current,policy);
 const receipt={schema:1,from:current,to:selected.release.version,target,backup,at:new Date().toISOString()};
 const temporary=join(directory,'receipt.json');await writeFile(temporary,JSON.stringify(receipt),{flag:'wx',mode:0o600});
 const pointer=join(root,'pending-native.json'),staged=join(directory,'pending.json');await writeFile(staged,JSON.stringify(receipt),{flag:'wx',mode:0o600});await rename(staged,pointer);
 const [feedBytes,signatureBytes]=await Promise.all([fetchUpdateBytes(selected.feed),fetchUpdateBytes(selected.signature)]);
 const feedFile=join(directory,'feed.json'),signatureFile=feedFile+'.sig';
 await writeFile(feedFile,feedBytes,{flag:'wx',mode:0o600});await writeFile(signatureFile,signatureBytes,{flag:'wx',mode:0o600});
 await verifyPinnedData(feedFile,signatureFile,policy);
 const plan=parseNativeFeed(JSON.parse(feedBytes.toString('utf8')),selected,current);
 const broker=await startNativeBroker(plan,root,progress,async(asset,cache,notify,signal)=>{
  const file=await saveUpdate(asset,cache,notify,signal);
  if(asset.name.endsWith('.zip')){
   const incoming=await extractApplication(file,join(cache,'verified-full'));
   await validate(incoming,selected.release.version,policy);
  }
  return file;
 });
 return{...broker,async verifyRestart(){const info=await owned(target);if(info.dev!==original.dev||info.ino!==original.ino)throw Error('Installed app changed during update preparation.');await validate(target,current,policy);await validate(backup,current,policy);},async recoveryPath(){await validate(backup,current,policy);return backup;}};
}
export async function nativeUpdateOutcome(root:string,current:string):Promise<string|null>{
 try{
  await owned(root,true);const file=join(root,'pending-native.json'),info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.()||info.size>4096||(info.mode&0o077))return null;
  const value=JSON.parse(await readFile(file,'utf8'));
  return value.schema===1&&value.to===current&&typeof value.from==='string'?`Updated to version ${current}. Your previous app is retained as a recovery backup.`:null;
 }catch{return null;}
}
