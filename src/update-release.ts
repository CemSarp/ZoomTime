import {compareVersions} from './updates.ts';
interface Artifact {name:string;sha256:string;size:number}
export function releaseFeed(version:string,full:Artifact,delta:(Artifact&{fromVersion:string})|undefined,publishedAt:string){
 compareVersions(version,version);
 const valid=(a:Artifact)=>Number.isSafeInteger(a.size)&&a.size>0&&a.size<=512*1024*1024&&/^[a-f0-9]{64}$/.test(a.sha256);
 if(!valid(full)||full.name!==`ZoomTime-darwin-arm64-${version}.zip`||!Number.isFinite(Date.parse(publishedAt)))throw Error('Invalid full release asset.');
 if(delta&&(!valid(delta)||delta.size>=full.size||compareVersions(delta.fromVersion,version)>=0||delta.name!==`ZoomTime-darwin-arm64-${delta.fromVersion}-to-${version}.delta`))throw Error('Invalid incremental release asset.');
 const url=(name:string)=>`https://github.com/CemSarp/ZoomTime/releases/download/v${version}/${name}`;
 return{currentRelease:version,releases:[{version,updateTo:{version,url:url(full.name),name:`ZoomTime ${version}`,notes:'Private prerelease. Screen-capture permission bug remains unresolved; physical acceptance is pending.',pub_date:publishedAt,sha256:full.sha256,size:full.size,...(delta?{delta:{from_version:delta.fromVersion,url:url(delta.name),sha256:delta.sha256,size:delta.size}}:{})}}]};
}
