import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MediaCall } from '../src/media-call.ts';
import { emptyCallingState, type CallingState } from '../src/calling-service.ts';
import type { ClientMessage, ServerMessage } from '../src/protocol.ts';
import { hostFixture, id } from './group-fixtures.ts';
import { drain, FakePeer, FakeStream, FakeTrack, FakeVideo, mediaEnvironment } from './media-fixtures.ts';
function snapshot(count:number,operationId:string):CallingState {
  const host=hostFixture(count),members=host.members.map(({id,name})=>({id,name,online:true}));
  let next=900;
  return {...emptyCallingState(),role:'host',selfId:id(1),hostId:id(1),groupId:host.groupId,members,network:{state:'online',message:''},busy:true,
    call:{id:id(800),callerId:id(1),members:members.map(m=>({id:m.id,status:'joined',invitationId:null,invitedById:null,expiresAt:null,operationId:m.id===id(1)?operationId:id(100+members.indexOf(m)),media:{audio:true,video:true}})),pairs:members.flatMap((a,i)=>members.slice(i+1).map(b=>({id:id(next++),a:a.id,b:b.id,offererId:a.id,generation:1,phase:'connecting'})))}};
}
async function setup(context:Parameters<typeof mediaEnvironment>[0],count=5){
  const env=mediaEnvironment(context),signals:ClientMessage[]=[];let released=0;
  const media=new MediaCall({authorizeCapture:async()=>{},releaseCapture:async()=>{released++;},sendSignal:async m=>{signals.push(m);}},
    {local:env.local as unknown as HTMLVideoElement,remote:memberId=>{if(!env.remotes.has(memberId))env.remotes.set(memberId,new FakeVideo());return env.remotes.get(memberId)! as unknown as HTMLVideoElement;},removeRemote:memberId=>{env.remotes.delete(memberId);},changed:()=>{}});
  context.after(()=>media.stop());const initial=snapshot(count,id(101));initial.call=null;initial.busy=false;media.handleState(initial);
  await media.start({action:'call',targetIds:initial.members.slice(1).map(m=>m.id)});
  const request=signals.find(m=>m.type==='request');assert.ok(request?.type==='request'&&request.v===2,'One v2 request must carry explicit recipients');
  const state=snapshot(count,request.operationId);media.handleState(state);await drain();return{...env,media,signals,state,released:()=>released};
}
test('live speaker reduction replaces only the microphone across four unchanged peers and preserves mute',async context=>{
  const s=await setup(context),stream=s.local.srcObject!,camera=stream.getVideoTracks()[0],oldMic=stream.getAudioTracks()[0],peers=[...s.media.connections.values()],signals=s.signals.length;
  s.media.toggleMute();
  await s.media.setSpeakerEchoReduction(true);await drain();
  const microphone=stream.getAudioTracks()[0];assert.notEqual(microphone,oldMic);assert.equal(oldMic.readyState,'ended');assert.equal(microphone.enabled,false);
  assert.equal(s.local.srcObject,stream);assert.equal(stream.getVideoTracks()[0],camera);assert.equal(camera.readyState,'live');
  assert.deepEqual([...s.media.connections.values()],peers);assert.equal(s.acquisitions(),2);assert.equal(s.captured.filter(t=>t.readyState==='live').length,2);
  for(const peer of FakePeer.instances)assert.equal(peer.getSenders().find(sender=>sender.track?.kind==='audio')?.track,microphone);
  assert.ok(s.signals.slice(signals).every(m=>!['request','accept','description','recover'].includes(m.type)));
  await s.media.setSpeakerEchoReduction(false);await drain();assert.equal(microphone.readyState,'ended');assert.equal(stream.getAudioTracks()[0].enabled,false);assert.equal(s.media.state.speakerEcho,'standard');
});
test('failed live echo acquisition preserves the current microphone, camera and peers',async context=>{
  const s=await setup(context,2),stream=s.local.srcObject!,tracks=stream.getTracks(),peers=[...s.media.connections.values()];
  s.devices.getUserMedia=async()=>{throw Error('permission denied');};
  await assert.rejects(()=>s.media.setSpeakerEchoReduction(true),/speaker echo/i);
  assert.deepEqual(stream.getTracks(),tracks);assert.ok(tracks.every(t=>t.readyState==='live'));assert.deepEqual([...s.media.connections.values()],peers);assert.equal(s.media.state.capturing,false);
});
test('leaving during a live echo microphone request stops late audio without reviving the call',async context=>{
  const s=await setup(context,2);let release!:(stream:FakeStream)=>void;
  s.devices.getUserMedia=async()=>new Promise<FakeStream>(resolve=>{release=resolve;});
  const changing=s.media.setSpeakerEchoReduction(true);await drain();s.media.stop();const late=new FakeTrack('audio');release(new FakeStream([late]));await changing;
  assert.equal(late.readyState,'ended');assert.equal(s.local.srcObject,null);assert.equal(s.media.connections.size,0);
});
test('leaving during queued echo sender replacement stops old and new microphones immediately',async context=>{
  const s=await setup(context,2),sender=FakePeer.instances[0].getSenders()[0],replace=sender.replaceTrack.bind(sender);let release!:()=>void;
  sender.replaceTrack=async track=>{await new Promise<void>(resolve=>{release=resolve;});await replace(track);};
  const changing=s.media.setSpeakerEchoReduction(true);await drain();s.media.stop();
  assert.ok(s.captured.every(track=>track.readyState==='ended'));release();await changing;
});
test('a rejected echo sender change rolls back without closing peers or reacquiring camera',async context=>{
  const s=await setup(context,3);await s.media.toggleCamera();FakePeer.instances[0].failReplacement=true;
  const original=s.local.srcObject!.getAudioTracks()[0];await assert.rejects(()=>s.media.setSpeakerEchoReduction(true),/speaker echo/i);await drain();
  assert.equal(s.media.state.cameraOn,false);assert.equal(s.captured.filter(track=>track.kind==='video').length,1);
  const microphone=s.captured.find(track=>track.kind==='audio'&&track.readyState==='live');assert.ok(microphone);
  assert.equal(microphone,original);assert.ok(FakePeer.instances.every(peer=>peer.connectionState!=='closed'));
  for(const peer of FakePeer.instances)assert.equal(peer.getSenders().find(sender=>sender.track?.kind==='audio')?.track,original);
  assert.equal(s.signals.some(m=>m.type==='failed'),false);assert.equal(s.captured.filter(t=>t.readyState==='live').length,1);
});
test('leaving during echo rollback immediately stops the rejected replacement microphone too',async context=>{
  const s=await setup(context,3),original=s.local.srcObject!.getAudioTracks()[0],sender=FakePeer.instances[1].getSenders()[0],replace=sender.replaceTrack.bind(sender);let release!:()=>void;
  FakePeer.instances[0].failReplacement=true;
  sender.replaceTrack=async track=>{if(track===original)await new Promise<void>(resolve=>{release=resolve;});await replace(track);};
  const changing=s.media.setSpeakerEchoReduction(true);await drain();assert.ok(release);s.media.stop();
  assert.ok(s.captured.every(track=>track.readyState==='ended'));release();await changing;
});
test('five-person media shares one capture across four peers and camera/mute updates every sender',async context=>{
  const s=await setup(context);assert.equal(s.acquisitions(),1);assert.equal(FakePeer.instances.length,4);
  const microphone=s.captured.find(t=>t.kind==='audio')!,camera=s.captured.find(t=>t.kind==='video')!;
  for(const peer of FakePeer.instances){assert.equal(peer.getSenders().length,2);assert.ok(peer.getSenders().some(sender=>sender.track===microphone));assert.ok(peer.getSenders().some(sender=>sender.track===camera));}
  s.media.toggleMute();assert.equal(microphone.enabled,false);await s.media.toggleCamera();assert.equal(camera.readyState,'ended');
  assert.ok(FakePeer.instances.every(peer=>peer.getSenders().some(sender=>sender.track===null)));
  await s.media.toggleCamera();assert.equal(s.acquisitions(),2);assert.equal(s.media.state.cameraOn,true);assert.equal(microphone.enabled,false);
  s.media.stop();assert.ok(s.captured.every(track=>track.readyState==='ended'));assert.ok(FakePeer.instances.every(peer=>peer.connectionState==='closed'));
});
test('leaving a peer preserves other connections, capture and remote element identity',async context=>{
  const s=await setup(context,3);const peers=[...s.media.connections];const elements=new Map(s.remotes);
  const next=structuredClone(s.state);next.call!.members.find(m=>m.id===id(3))!.status='left';next.call!.pairs=next.call!.pairs.filter(p=>p.a!==id(3)&&p.b!==id(3));
  s.media.handleState(next);await drain();assert.equal(s.media.connections.size,1);assert.equal(s.media.connections.get(id(2)),peers.find(([member])=>member===id(2))![1]);
  assert.equal(s.remotes.get(id(2)),elements.get(id(2)));assert.equal(s.captured.filter(t=>t.readyState==='live').length,2);assert.equal(s.acquisitions(),1);
});
test('one sender replacement failure cannot strand a muted new microphone or healthy peers',async context=>{
  const s=await setup(context,3);s.media.toggleMute();FakePeer.instances[0].failReplacement=true;
  await s.media.retryDevices();await drain();const live=s.captured.filter(t=>t.readyState==='live');assert.equal(live.length,2);assert.equal(live.find(t=>t.kind==='audio')!.enabled,false);
  assert.equal(FakePeer.instances[0].connectionState,'closed');assert.equal(FakePeer.instances[1].getSenders().find(sender=>sender.track?.kind==='audio')?.track,live.find(t=>t.kind==='audio'));
  assert.ok(s.signals.some(m=>m.type==='failed'));
});
test('cancelled pending capture stops late tracks without signaling or creating peers',async context=>{
  const env=mediaEnvironment(context);let resolveCapture!:(stream:FakeStream)=>void;env.devices.getUserMedia=async()=>new Promise<FakeStream>(resolve=>{resolveCapture=resolve;});
  const signals:ClientMessage[]=[];
  const media=new MediaCall({authorizeCapture:async()=>{},releaseCapture:async()=>{},sendSignal:async m=>{signals.push(m);}},{local:env.local as unknown as HTMLVideoElement,remote:()=>new FakeVideo() as unknown as HTMLVideoElement,removeRemote:()=>{},changed:()=>{}});
  const state=snapshot(2,id(101));state.call=null;media.handleState(state);const starting=media.start({action:'call',targetIds:[id(2)]});await drain();media.hangup();
  const tracks=[new FakeTrack('audio'),new FakeTrack('video')];resolveCapture(new FakeStream(tracks));await starting;assert.ok(tracks.every(t=>t.readyState==='ended'));assert.equal(signals.length,0);assert.equal(FakePeer.instances.length,0);
});
test('early/stale ICE and pair generations stay isolated, and closing a pair never stops capture',async context=>{
  const s=await setup(context,3);const pair=s.state.call!.pairs.find(p=>p.b===id(2))!;
  await s.media.handleSignal({v:2,type:'ice',callId:s.state.call!.id,pairId:pair.id,generation:999,candidate:null,fromId:id(2)} as ServerMessage);
  await s.media.handleSignal({v:2,type:'ice',callId:s.state.call!.id,pairId:pair.id,generation:1,candidate:null,fromId:id(2)});
  await s.media.handleSignal({v:2,type:'description',callId:s.state.call!.id,pairId:pair.id,generation:1,description:{type:'answer',sdp:'v=0'},fromId:id(2)});
  const next=structuredClone(s.state);next.call!.pairs.find(p=>p.id===pair.id)!.generation=2;next.call!.pairs.find(p=>p.id===pair.id)!.phase='reconnecting';s.media.handleState(next);await drain();
  assert.equal(FakePeer.instances.length,2);assert.equal(s.acquisitions(),1);assert.ok(s.signals.some(m=>m.type==='description'&&m.pairId===pair.id&&m.generation===2));
  assert.ok(s.captured.every(t=>t.readyState==='live'));
});
test('frozen media requests one bounded ICE restart even while the connection still reports connected',async context=>{
  context.mock.timers.enable({apis:['Date','setTimeout','setInterval']});const s=await setup(context,2),peer=FakePeer.instances[0];
  peer.report.set('video',{type:'inbound-rtp',kind:'video',framesReceived:1,framesDecoded:1,bytesReceived:50});peer.connectionState='connected';peer.onconnectionstatechange!();
  context.mock.timers.tick(500);await drain();context.mock.timers.tick(5000);await drain();assert.equal(s.media.state.peers[id(2)].stale,true);
  context.mock.timers.tick(5000);await drain();assert.equal(s.signals.filter(m=>m.type==='recover').length,1);
  const next=structuredClone(s.state);next.call!.pairs[0].generation=2;next.call!.pairs[0].phase='reconnecting';s.media.handleState(next);await drain();
  await s.media.handleSignal({v:2,type:'description',callId:next.call!.id,pairId:next.call!.pairs[0].id,generation:2,fromId:id(2),description:{type:'answer',sdp:'v=0'}});
  context.mock.timers.tick(25000);await drain();assert.equal(s.signals.filter(m=>m.type==='recover').length,1);assert.equal(s.signals.filter(m=>m.type==='failed').length,1);
  assert.equal(peer.connectionState,'closed');assert.ok(s.captured.every(t=>t.readyState==='live'),'A failed peer never stops shared local capture');
});
test('decoded-frame suppression from a hidden tile cannot fake an outage when frames still arrive',async context=>{
  context.mock.timers.enable({apis:['Date','setTimeout','setInterval']});const s=await setup(context,2),peer=FakePeer.instances[0];peer.connectionState='connected';peer.onconnectionstatechange!();
  for(let i=1;i<=14;i++){peer.report.set('video',{type:'inbound-rtp',kind:'video',framesReceived:i,framesDecoded:0});context.mock.timers.tick(500);await drain();}
  assert.equal(s.media.state.peers[id(2)].stats.decodedVideoFrames,0);assert.equal(s.media.state.peers[id(2)].stats.receivedVideoFrames,14);
  assert.equal(s.media.state.peers[id(2)].stale,false);assert.equal(s.signals.some(m=>m.type==='recover'),false);
});
test('a participant joining during device replacement receives the new live shared tracks',async context=>{
  const s=await setup(context,2);const sender=FakePeer.instances[0].getSenders()[0],replace=sender.replaceTrack.bind(sender);
  let release!:()=>void,delayed=false;
  sender.replaceTrack=async track=>{if(!delayed){delayed=true;await new Promise<void>(resolve=>{release=resolve;});}await replace(track);};
  const replacing=s.media.retryDevices();await drain();assert.ok(delayed);
  const next=snapshot(3,s.state.call!.members[0].operationId!);s.media.handleState(next);await drain();release();await replacing;await drain();
  const newPeer=FakePeer.instances[1];assert.ok(newPeer.getSenders().every(sender=>sender.track?.readyState==='live'),'Newly joined peer must not retain the stopped old stream');
  assert.equal(newPeer.getSenders().find(sender=>sender.track?.kind==='audio')?.track,s.captured.filter(t=>t.kind==='audio'&&t.readyState==='live')[0]);
});
test('stale early ICE cannot consume the new generation queue',async context=>{
  const s=await setup(context,2),pair=s.state.call!.pairs[0];
  for(let i=0;i<100;i++)await s.media.handleSignal({v:2,type:'ice',callId:s.state.call!.id,pairId:pair.id,generation:1,candidate:null,fromId:id(2)});
  const next=structuredClone(s.state);next.call!.pairs[0].generation=2;next.call!.pairs[0].phase='reconnecting';s.media.handleState(next);await drain();
  await s.media.handleSignal({v:2,type:'ice',callId:s.state.call!.id,pairId:pair.id,generation:2,candidate:null,fromId:id(2)});
  assert.equal(s.signals.some(m=>m.type==='failed'),false);assert.notEqual(FakePeer.instances[0].connectionState,'closed');
});
test('device replacement queued behind negotiation survives a pair generation change',async context=>{
  const s=await setup(context,2),peer=FakePeer.instances[0];let release!:()=>void;
  const offer=peer.createOffer.bind(peer);peer.createOffer=async options=>{await new Promise<void>(resolve=>{release=resolve;});return offer(options);};
  const next=structuredClone(s.state);next.call!.pairs[0].generation=2;next.call!.pairs[0].phase='reconnecting';s.media.handleState(next);await drain();
  const replacing=s.media.retryDevices();await drain();assert.ok(release);
  next.call!.pairs[0].generation=3;s.media.handleState(structuredClone(next));
  peer.createOffer=offer;release();await replacing;await drain();
  assert.ok(peer.getSenders().every(sender=>sender.track?.readyState==='live'),'No sender may retain an ended capture after restart changes generation');
  assert.equal(peer.getSenders().find(sender=>sender.track?.kind==='audio')?.track,s.captured.find(t=>t.kind==='audio'&&t.readyState==='live'));
});
test('device recovery times out after sixty seconds and stops its late replacement capture',async context=>{
  context.mock.timers.enable({apis:['Date','setTimeout','setInterval']});const s=await setup(context,2);let release!:(stream:FakeStream)=>void;
  s.devices.getUserMedia=async()=>new Promise<FakeStream>(resolve=>{release=resolve;});
  const replacing=s.media.retryDevices();await drain();context.mock.timers.tick(60_000);await drain();
  assert.ok(s.captured.every(track=>track.readyState==='ended'),'Timed-out recovery releases the original capture');
  const late=[new FakeTrack('audio'),new FakeTrack('video')];release(new FakeStream(late));await replacing;
  assert.ok(late.every(track=>track.readyState==='ended'));assert.equal(s.media.connections.size,0);
});
test('leaving during a queued sender replacement immediately releases old and new capture tracks',async context=>{
  const s=await setup(context,2),sender=FakePeer.instances[0].getSenders()[0],replace=sender.replaceTrack.bind(sender);let release!:()=>void;
  sender.replaceTrack=async track=>{await new Promise<void>(resolve=>{release=resolve;});await replace(track);};
  const replacing=s.media.retryDevices();await drain();s.media.stop();
  assert.ok(s.captured.every(track=>track.readyState==='ended'),'Both captures belong to the cancelled session, including tracks awaiting replacement');
  release();await replacing;
});
