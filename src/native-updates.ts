import {fetchReleases,type UpdateState} from './updates.ts';
import {selectNativeRelease} from './native-feed.ts';
export interface NativeDriver {
 on(event:string,listener:(...args:unknown[])=>void):unknown;
 setFeedURL(options:{url:string;serverType:'json'}):void;
 checkForUpdates():void;
 quitAndInstall():void;
}
export interface NativeSession {feedUrl:string;close():Promise<void>;verifyRestart():Promise<void>;recoveryPath():Promise<string>}
export type NativePreparation=(release:NonNullable<ReturnType<typeof selectNativeRelease>>,progress:(percent:number)=>void)=>Promise<NativeSession>;
export class NativeUpdates {
 state:UpdateState;
 private selected:ReturnType<typeof selectNativeRelease>=null;
 private session:NativeSession|null=null;
 private busy=false;
 private disposed=false;
 private epoch=0;
 private current:string;
 private arch:string;
 private driver:NativeDriver;
 private prepare:NativePreparation;
 private changed:(state:UpdateState)=>void;
 private load:typeof fetchReleases;
 constructor(current:string,arch:string,driver:NativeDriver,prepare:NativePreparation,changed:(state:UpdateState)=>void,load=fetchReleases){
  this.current=current;this.arch=arch;this.driver=driver;this.prepare=prepare;this.changed=changed;this.load=load;
  this.state={status:'idle',currentVersion:current,message:'Updates run only when you ask. Update prepares installation on the next quit; Restart applies it now.'};
  driver.on('error',()=>{if(!this.disposed&&['downloading','installing'].includes(this.state.status))void this.fail();});
  driver.on('update-downloaded',()=>{if(!this.disposed&&this.state.status==='downloading')void this.ready();});
 }
 private publish(value:Omit<UpdateState,'currentVersion'>){this.state={currentVersion:this.current,...value};this.changed(this.state);}
 private async fail(){this.epoch++;this.busy=false;this.publish({status:'error',message:'The update could not finish. Your app or its recovery backup is preserved. Check the connection and retry.',...(this.session?{canReveal:true}:{})});await this.session?.close();}
 private async ready(){const epoch=this.epoch;await this.session?.close();if(this.disposed||epoch!==this.epoch)return;this.busy=false;this.publish({status:'ready',version:this.selected!.release.version,prerelease:this.selected!.release.prerelease,message:'Update verified and prepared. It installs when ZoomTime next closes. Finish all calls, then Restart to update.'});}
 async check(){
  if(this.busy||this.disposed||this.state.status==='ready'||this.state.status==='installing')return;
  this.busy=true;this.selected=null;const epoch=++this.epoch;this.publish({status:'checking',message:'Checking GitHub…'});
  try{const selected=selectNativeRelease(await this.load(),this.current,this.arch);if(this.disposed||epoch!==this.epoch)return;this.selected=selected;
   this.publish(selected?{status:'available',version:selected.release.version,prerelease:selected.release.prerelease,message:`Version ${selected.release.version}${selected.release.prerelease?' (prerelease)':''} is available. Update prepares it inside ZoomTime.`}:{status:'current',message:`No newer published build. You have version ${this.current}.`});
  }catch{if(!this.disposed&&epoch===this.epoch)await this.fail();}finally{if(epoch===this.epoch)this.busy=false;}
 }
 async download(){
  if(this.busy||this.disposed||!this.selected||this.state.status!=='available')return;
  this.busy=true;const epoch=++this.epoch,selected=this.selected;
  this.publish({status:'downloading',version:selected.release.version,prerelease:selected.release.prerelease,percent:0,message:'Preparing and downloading the update…'});
  try{
   const session=await this.prepare(selected,percent=>{if(!this.disposed&&epoch===this.epoch&&this.state.status==='downloading')this.publish({status:'downloading',version:selected.release.version,prerelease:selected.release.prerelease,percent,message:'Downloading and verifying update…'});});
   if(this.disposed||epoch!==this.epoch){await session.close();return;}this.session=session;
   this.driver.setFeedURL({url:session.feedUrl,serverType:'json'});this.driver.checkForUpdates();
  }catch{if(!this.disposed&&epoch===this.epoch)await this.fail();}
 }
 async install(ensureIdle:()=>void){
  if(this.busy||this.disposed||this.state.status!=='ready'||!this.session)return;
  try{ensureIdle();}catch{this.publish({...this.state,message:'Finish all calls, device checks and screen capture before restarting.'});return;}
  this.busy=true;
  try{await this.session.verifyRestart();
   if(this.disposed)return;
   try{ensureIdle();}catch{this.publish({...this.state,message:'Finish all calls, device checks and screen capture before restarting.'});return;}
   this.publish({status:'installing',version:this.selected!.release.version,message:'Restarting to finish the verified update…'});this.driver.quitAndInstall();}
  catch{await this.fail();}finally{this.busy=false;}
 }
 async verifiedPath():Promise<string>{if(this.disposed||this.busy||!this.state.canReveal||!this.session)throw Error('No verified recovery backup is available.');return this.session.recoveryPath();}
 async dispose(){if(this.disposed)return;this.disposed=true;this.epoch++;this.busy=false;await this.session?.close();}
}
