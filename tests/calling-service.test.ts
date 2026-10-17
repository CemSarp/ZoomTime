import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CallingService, type CallingEvent } from '../src/calling-service.ts';
import { SignalingClient } from '../src/signaling-client.ts';
import type { ServerMessage } from '../src/protocol.ts';
import { id, waitFor } from './group-fixtures.ts';
const unavailable = { isEncryptionAvailable: () => false, encryptString: () => assert.fail(), decryptString: () => assert.fail() };
const endpoint='wss://mac.tail.ts.net:8443/zoomtime';
async function setup() {
  const file=join(mkdtempSync(join(tmpdir(),'zoomtime-service-')),'pairing.bin'), events:CallingEvent[]=[];
  let stored='',locked=false;
  const codec={isEncryptionAvailable:()=>!locked,encryptString:(text:string)=>{stored=text;return Buffer.from('opaque');},decryptString:()=>stored};
  const service=new CallingService(file,codec,e=>events.push(e),0), guests:{id:string;client:SignalingClient;messages:ServerMessage[]}[]=[];
  await service.createHost(endpoint);
  try { await waitFor(()=>service.state.network.state==='online'); } catch (error) { await service.shutdown(); throw error; }
  const guest=async(name:string)=>{
    service.addMember(name); const member=service.state.members.find(m=>m.name===name)!;
    const invitation=JSON.parse(service.invitation(member.id)), messages:ServerMessage[]=[];
    const client=new SignalingClient(`ws://127.0.0.1:${service.localPort}/zoomtime`,invitation.token,m=>messages.push(m),()=>{});
    guests.push({id:member.id,client,messages});client.start();await waitFor(()=>service.state.members.some(m=>m.id===member.id&&m.online));return guests.at(-1)!;
  };
  const start=async(targetIds:string[],operationId=id(101))=>{
    service.authorizeCapture({action:'call',operationId,targetIds});service.send({v:2,type:'request',operationId,targetIds});await waitFor(()=>service.state.call!==null);return service.state.call!;
  };
  return {service,file,events,guest,start,lock:(value:boolean)=>{locked=value;},close:async()=>{for(const g of guests)g.client.stop();await service.shutdown();}};
}
test('unpaired apps cannot authorize capture, expose invitations or send messages', async()=>{
  const service=new CallingService(join(mkdtempSync(join(tmpdir(),'zoomtime-service-')),'pairing.bin'),unavailable,()=>{},0);
  await service.initialize();assert.equal(service.state.role,null);assert.equal(service.captureAllowed,false);
  for(const value of ['call',{}, {action:'call',operationId:id(101),targetIds:[id(2)]}])assert.throws(()=>service.authorizeCapture(value));
  assert.throws(()=>service.send({v:2,type:'sync'}));assert.throws(()=>service.invitation(id(2)));await service.shutdown();
});
test('named member changes persist before publication and secrets never enter renderer state',async()=>{
  const s=await setup();try{
    const alice=await s.guest('Alice');assert.equal(JSON.stringify(s.service.state).includes('token'),false);
    s.service.renameMember(alice.id,'Alicia');await waitFor(()=>s.service.state.members.some(m=>m.name==='Alicia'));
    s.lock(true);assert.throws(()=>s.service.addMember('Bob'),/Keychain/);assert.equal(s.service.state.members.some(m=>m.name==='Bob'),false);
    assert.throws(()=>s.service.revokeMember(alice.id),/Keychain/);assert.ok(s.service.state.members.some(m=>m.id===alice.id));
    s.lock(false);s.service.revokeMember(alice.id);await waitFor(()=>!s.service.state.members.some(m=>m.id===alice.id));assert.throws(()=>s.service.invitation(alice.id));
  }finally{await s.close();}
});
test('capture lease binds exact recipients and operation; device checks cannot authorize calls',async()=>{
  const s=await setup();try{
    const a=await s.guest('Alice'),b=await s.guest('Bob');s.service.authorizeDeviceCheck();
    assert.throws(()=>s.service.send({v:2,type:'request',operationId:id(101),targetIds:[a.id]}));
    s.service.authorizeCapture({action:'call',operationId:id(101),targetIds:[a.id]});assert.equal(s.service.deviceCheckAllowed,false);
    assert.throws(()=>s.service.send({v:2,type:'request',operationId:id(101),targetIds:[b.id]}));
    assert.throws(()=>s.service.send({v:2,type:'request',operationId:id(102),targetIds:[a.id]}));
    s.service.send({v:2,type:'request',operationId:id(101),targetIds:[a.id]});await waitFor(()=>!!s.service.state.call);
    assert.throws(()=>s.service.authorizeDeviceCheck(),/End/);assert.ok(s.events.some(e=>e.type==='check-stop'));
  }finally{await s.close();}
});
test('late state cannot revive a cancelled capture and repeated interrupts notify once',async()=>{
  const s=await setup();try{
    const a=await s.guest('Alice');const call=await s.start([a.id]);s.service.releaseCapture();
    a.client.send({v:2,type:'accept',callId:call.id,invitationId:call.members.find(m=>m.id===a.id)!.invitationId!,operationId:id(102)});
    await waitFor(()=>s.service.state.call===null);assert.equal(s.service.captureAllowed,false);
    s.service.interrupt('reload');s.service.interrupt('wake');
    assert.equal(s.service.state.call,null);await waitFor(()=>a.messages.some(m=>m.type==='ended'));
    assert.equal(a.messages.filter(m=>m.type==='ended').length,1);
  }finally{await s.close();}
});
test('host Leave stops local capture but keeps guest call and blocks host retry or installation',async()=>{
  const s=await setup();try{
    const a=await s.guest('Alice'),b=await s.guest('Bob');const call=await s.start([a.id,b.id]);
    for(const g of [a,b])g.client.send({v:2,type:'accept',callId:call.id,invitationId:call.members.find(m=>m.id===g.id)!.invitationId!,operationId:id(g===a?102:103)});
    await waitFor(()=>s.service.state.call?.pairs.length===3);
    s.service.send({v:2,type:'hangup',callId:call.id});await waitFor(()=>s.service.state.call===null&&s.service.state.busy);
    assert.equal(s.service.captureAllowed,false);assert.equal(s.service.hostingActiveCall,true);
    assert.equal(s.service.inUse,true);await assert.rejects(s.service.retry(),/active group call/i);
    s.service.authorizeDeviceCheck();assert.equal(s.service.deviceCheckAllowed,true);s.service.releaseDeviceCheck();
    await waitFor(()=>{const latest=a.messages.filter(m=>m.type==='state').at(-1);return latest?.type==='state'&&latest.call?.pairs.length===1;});
    const guestCall=a.messages.filter(m=>m.type==='state').at(-1);assert.ok(guestCall?.type==='state'&&guestCall.call?.pairs.length===1);
    const port=s.service.localPort;await s.service.shutdown();assert.equal(s.service.localPort,null);await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  }finally{await s.close();}
});
test('stale invitation cannot authorize acceptance and re-invitation is a separate capture operation',async()=>{
  const s=await setup();try{
    const a=await s.guest('Alice');a.client.send({v:2,type:'request',operationId:id(102),targetIds:[s.service.state.selfId!]});await waitFor(()=>!!s.service.state.call);
    const call=s.service.state.call!, invite=call.members.find(m=>m.id===s.service.state.selfId)!;
    assert.throws(()=>s.service.authorizeCapture({action:'accept',operationId:id(101),callId:call.id,invitationId:id(999)}));
    s.service.authorizeCapture({action:'accept',operationId:id(101),callId:call.id,invitationId:invite.invitationId});
    s.service.send({v:2,type:'accept',operationId:id(101),callId:call.id,invitationId:invite.invitationId});
    await waitFor(()=>s.service.state.call?.pairs.length===1);assert.equal(s.service.captureAllowed,true);
  }finally{await s.close();}
});
test('failed reset stops the host and capture, and successful reset invalidates old credentials',async()=>{
  const s=await setup();try{
    const a=await s.guest('Alice');await s.start([a.id]);const port=s.service.localPort;s.lock(true);
    await assert.rejects(s.service.reset(),/Keychain/);assert.equal(s.service.captureAllowed,false);assert.equal(s.service.localPort,null);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`));s.lock(false);await s.service.reset();assert.equal(s.service.state.role,null);
  }finally{await s.close();}
});
test('reset during host startup cannot leave a revoked listener',async()=>{
  const file=join(mkdtempSync(join(tmpdir(),'zoomtime-service-')),'pairing.bin');let stored='';
  const service=new CallingService(file,{isEncryptionAvailable:()=>true,encryptString:(text:string)=>{stored=text;return Buffer.from('cipher');},decryptString:()=>stored},()=>{},0);
  try{const starting=service.createHost(endpoint);await service.reset();await starting;assert.equal(service.localPort,null);assert.equal(service.state.role,null);}finally{await service.shutdown();}
});
test('failed secure pairing leaves the app unpaired and writes no secret',async()=>{
  const file=join(mkdtempSync(join(tmpdir(),'zoomtime-service-')),'pairing.bin'),service=new CallingService(file,unavailable,()=>{},0);
  await assert.rejects(service.createHost(endpoint),/Keychain/);assert.equal(service.state.role,null);assert.throws(()=>readFileSync(file));
  await assert.rejects(service.importInvitation('{bad'),/invitation/i);await service.shutdown();
});
test('device check is separate, idempotent, expires after two minutes and stops on shutdown',async context=>{
  context.mock.timers.enable({apis:['setTimeout','Date']});const events:CallingEvent[]=[];
  const service=new CallingService(join(mkdtempSync(join(tmpdir(),'zoomtime-service-')),'pairing.bin'),unavailable,e=>events.push(e),0);
  try{service.authorizeDeviceCheck();assert.equal(service.captureAllowed,false);assert.throws(()=>service.authorizeDeviceCheck());context.mock.timers.tick(119999);assert.equal(service.deviceCheckAllowed,true);context.mock.timers.tick(1);assert.equal(service.deviceCheckAllowed,false);assert.equal(events.filter(e=>e.type==='check-stop').length,1);service.endDeviceCheck('again');service.authorizeDeviceCheck();await service.shutdown();assert.equal(service.deviceCheckAllowed,false);}finally{await service.shutdown();}
});
