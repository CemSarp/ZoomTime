import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {compareVersions,selectUpdate,saveUpdate,type UpdateAsset,type UpdateRelease} from './updates.ts';
interface NativeRelease {release:UpdateRelease;feed:UpdateAsset;signature:UpdateAsset;delta?:UpdateAsset&{fromVersion:string}}
export interface NativePlan {version:string;name:string;notes:string;publishedAt:string;full:UpdateAsset;delta?:UpdateAsset&{fromVersion:string}}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).every(k=>names.includes(k));
const origin='https://github.com/CemSarp/ZoomTime/releases/download/';
function asset(value:unknown,name:string,version:string,max=512*1024*1024):UpdateAsset {
 if(!record(value)||value.name!==name||value.browser_download_url!==`${origin}v${version}/${name}`||value.state!=='uploaded'||typeof value.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value.digest)||!Number.isSafeInteger(value.size)||(value.size as number)<=0||(value.size as number)>max)throw Error('The release has an invalid native update asset.');
 return{name,url:value.browser_download_url as string,sha256:value.digest.slice(7),size:value.size as number};
}
export function selectNativeRelease(metadata:unknown,current:string,arch:string):NativeRelease|null {
 const selected=selectUpdate(metadata,current,arch).release;if(!selected)return null;
 const entries=(metadata as Record<string,unknown>[]).filter(r=>r.tag_name===`v${selected.version}`&&r.draft===false);if(entries.length!==1)throw Error('Duplicate update release.');
 const assets=entries[0].assets as unknown[];
 const one=(name:string,required:boolean,max?:number)=>{const found=assets.filter(a=>record(a)&&a.name===name);if(found.length>1||required&&found.length!==1)throw Error('The publisher has not completed the native update feed.');return found.length?asset(found[0],name,selected.version,max):undefined;};
 const feed=one(`ZoomTime-native-arm64-${selected.version}.json`,true,64*1024)!;
 const signature=one(`ZoomTime-native-arm64-${selected.version}.json.sig`,true,64*1024)!;
 const delta=one(`ZoomTime-darwin-arm64-${current}-to-${selected.version}.delta`,false);
 return{release:selected,feed,signature,...(delta?{delta:{...delta,fromVersion:current}}:{})};
}
export function parseNativeFeed(value:unknown,selected:NativeRelease,current:string):NativePlan {
 if(!record(value)||!keys(value,['currentRelease','releases'])||value.currentRelease!==selected.release.version||!Array.isArray(value.releases)||value.releases.length!==1)throw Error('The native update feed does not match the selected release.');
 const entry=value.releases[0];if(!record(entry)||!keys(entry,['version','updateTo'])||entry.version!==value.currentRelease||!record(entry.updateTo))throw Error('Invalid native update entry.');
 const p=entry.updateTo,r=selected.release;
 if(!keys(p,['version','url','name','notes','pub_date','sha256','size','delta'])||p.version!==r.version||p.url!==r.url||p.sha256!==r.sha256||p.size!==r.size||typeof p.name!=='string'||p.name.length>160||typeof p.notes!=='string'||p.notes.length>16_384||typeof p.pub_date!=='string'||p.pub_date.length>64||!Number.isFinite(Date.parse(p.pub_date)))throw Error('Native update package integrity metadata does not match GitHub.');
 let delta:NativePlan['delta'];
 if(p.delta!==undefined){
  const d=p.delta;
  if(!record(d)||!keys(d,['from_version','url','sha256','size'])||typeof d.from_version!=='string'||compareVersions(d.from_version,r.version)>=0||d.url!==`${origin}v${r.version}/ZoomTime-darwin-arm64-${d.from_version}-to-${r.version}.delta`||typeof d.sha256!=='string'||!/^[a-f0-9]{64}$/.test(d.sha256)||!Number.isSafeInteger(d.size)||(d.size as number)<=0||(d.size as number)>512*1024*1024)throw Error('Invalid native delta metadata.');
  const expected=selected.delta;
  if(d.from_version===current&&expected&&d.url===expected.url&&d.sha256===expected.sha256&&d.size===expected.size)delta=expected;
 }
 return{version:r.version,name:p.name,notes:p.notes,publishedAt:p.pub_date,full:r,...(delta?{delta}:{})};
}
export async function startNativeBroker(plan:NativePlan,cache:string,progress:(percent:number)=>void,save:typeof saveUpdate=saveUpdate){
 const directory=await mkdtemp(join(cache,'native-')),nonce=randomBytes(32).toString('hex'),abort=new AbortController();
 const files=new Map<string,Promise<string>>();let closed=false,port=0;
 const server=createServer({maxHeaderSize:4096,headersTimeout:5000,requestTimeout:15_000},async(request,response)=>{
  if(request.headers.origin||request.headers.host!==`127.0.0.1:${port}`){response.writeHead(403).end();return;}
  if(!['GET','HEAD'].includes(request.method??'')){response.writeHead(405).end();return;}
  const path=request.url;
  if(path===`/${nonce}/feed.json`){
   const body=JSON.stringify({currentRelease:plan.version,releases:[{version:plan.version,updateTo:{version:plan.version,url:`http://127.0.0.1:${port}/${nonce}/full`,name:plan.name,notes:plan.notes,pub_date:plan.publishedAt,sha256:plan.full.sha256,size:plan.full.size,...(plan.delta?{delta:{from_version:plan.delta.fromVersion,url:`http://127.0.0.1:${port}/${nonce}/delta`,sha256:plan.delta.sha256,size:plan.delta.size}}:{})}}]});
   response.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:body);return;
  }
  const selected=path===`/${nonce}/full`?plan.full:path===`/${nonce}/delta`?plan.delta:undefined;
  if(!selected){response.writeHead(404).end();return;}
  try{
   let pending=files.get(selected.name);
   if(!pending){pending=save(selected,directory,progress,abort.signal);files.set(selected.name,pending);}
   const file=await pending;if(closed||response.destroyed)return;
   const info=await stat(file);response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});
   if(request.method==='HEAD'){response.end();return;}
   const stream=createReadStream(file);stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
  }catch{if(!response.destroyed)response.writeHead(500).end('Verified update transfer unavailable.');}
 });
 server.maxConnections=4;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 const address=server.address();if(!address||typeof address==='string')throw Error('Native update broker could not bind loopback.');port=address.port;
 server.on('error',()=>{abort.abort();});
 return{feedUrl:`http://127.0.0.1:${port}/${nonce}/feed.json`,async close(){if(closed)return;closed=true;abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
