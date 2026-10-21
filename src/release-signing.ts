import {join} from 'node:path';
import {readFileSync,lstatSync,readdirSync,chmodSync,openSync,readSync,closeSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export interface SigningPolicy {schema:1;certificateSha1:string;certificateSha256:string;appId:'com.cemsarp.zoomtime';helperId:'com.cemsarp.zoomtime.capture'}
export function parseSigningPolicy(value:unknown):SigningPolicy {
  const p=value as SigningPolicy;
  if(!p||typeof p!=='object'||Object.keys(p).sort().join(',')!=='appId,certificateSha1,certificateSha256,helperId,schema'||p.schema!==1||!/^\p{ASCII_Hex_Digit}{40}$/u.test(p.certificateSha1)||!/^\p{ASCII_Hex_Digit}{64}$/u.test(p.certificateSha256)||p.appId!=='com.cemsarp.zoomtime'||p.helperId!=='com.cemsarp.zoomtime.capture')throw Error('Persistent signing certificate policy is missing or invalid. Run the explicit signing setup; ad-hoc release signing is disabled.');
  return p;
}
export const loadSigningPolicy=(file:string):SigningPolicy=>parseSigningPolicy(JSON.parse(readFileSync(file,'utf8')));
export function signingRequirement(policy:SigningPolicy,id:string):string {
  parseSigningPolicy(policy);if(id!==policy.appId&&id!==policy.helperId)throw Error('Unexpected signing identifier.');
  return `identifier "${id}" and certificate leaf = H"${policy.certificateSha1}"`;
}
export async function verifyPinnedCode(path:string,policy:SigningPolicy,id:string):Promise<void>{
  await promisify(execFile)('/usr/bin/codesign',['--verify','--deep','--strict','-R='+signingRequirement(policy,id),path],{timeout:60_000,maxBuffer:8192});
}

export function normalizeBundlePermissions(path:string):void {
 const entry=lstatSync(path);if(entry.isSymbolicLink())return;
 chmodSync(path,entry.mode&~0o022);
 if(entry.isDirectory())for(const name of readdirSync(path))normalizeBundlePermissions(join(path,name));
}

// Resources are sealed by their bundle; signing them individually creates unpatchable xattrs.
export function skipNonCodeSigning(path:string):boolean {
 if(path.endsWith('/Contents/Resources/ZoomTimeCapture'))return true;
 if(!lstatSync(path).isFile())return false;
 const fd=openSync(path,'r'),magic=Buffer.alloc(4);
 try{if(readSync(fd,magic,0,4,0)<4)return true;}finally{closeSync(fd);}
 return ![0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca].includes(magic.readUInt32BE());
}

export async function verifyPinnedData(path:string,signature:string,policy:SigningPolicy):Promise<void>{
 await promisify(execFile)('/usr/bin/codesign',['--verify','--strict','--detached',signature,'-R='+signingRequirement(policy,policy.appId),path],{timeout:15_000,maxBuffer:8192});
}
