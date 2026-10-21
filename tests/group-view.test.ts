import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActiveSpeaker, GroupVideoView } from '../src/call-view.ts';
import type { MediaPeerState } from '../src/media-peer.ts';
const peer=(level:number|null,patch:Partial<MediaPeerState>={}):MediaPeerState=>({connection:'connected',stale:false,error:null,audioLevel:level,stats:{},...patch});
test('active speaker requires two timed samples, never reorders people, and clears on silence or ineligibility',()=>{
  const speaker=new ActiveSpeaker();
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.02)},0),null);
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.02)},10),null,'Render bursts are not separate samples');
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.02)},500),'alice');
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.3)},1000),'alice');
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.3)},1500),'bob');
  assert.equal(speaker.sample({alice:peer(.1),bob:peer(.3,{stale:true})},1501),null,'Stale media loses highlight immediately');
  assert.equal(speaker.sample({alice:peer(null),bob:peer(null)},2000),null);
  speaker.sample({alice:peer(.2)},2500);assert.equal(speaker.sample({alice:peer(.2)},3000),'alice');
  assert.equal(speaker.sample({alice:peer(0)},3500),'alice');assert.equal(speaker.sample({alice:peer(0)},4000),null);
  assert.equal(speaker.sample({alice:peer(.8,{connection:'failed'})},4500),null);
});
class Element extends EventTarget {
  children:Element[]=[];parent:Element|null=null;dataset:Record<string,string>={};attributes:Record<string,string>={};textContent='';value='';className='';hidden=false;inert=false;srcObject:unknown=null;readyState=2;
  classList={toggle:(_name:string,_on:boolean)=>{}};
  setAttribute(name:string,value:string){this.attributes[name]=value;}
  append(...items:Element[]){for(const item of items){item.remove();item.parent=this;this.children.push(item);}}
  replaceChildren(...items:Element[]){for(const child of this.children)child.remove();this.append(...items);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
}
test('grid and pin reuse each remote video and preserve stable order without duplicating audio',context=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:{createElement:()=>new Element()},configurable:true});
  context.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  const root=new Element(),select=new Element(),view=new GroupVideoView(root as unknown as HTMLElement,select as unknown as HTMLSelectElement,()=>{});
  const alice=view.remote('alice');assert.equal(root.children[0].children[3].hidden,true,'A single tile needs no pin control');
  const bob=view.remote('bob');assert.equal(root.children[0].children[3].hidden,false);assert.equal(view.remote('alice'),alice);assert.equal(root.children.length,2);
  view.pin('bob');assert.equal(root.dataset.pinned,'true');assert.equal(root.children[0].inert,true);assert.equal(root.children[1].inert,false);
  view.pin(null);assert.equal(root.children[0].inert,false);assert.equal(view.remote('bob'),bob);
  assert.deepEqual(root.children.map(c=>c.dataset.participantId),['alice','bob']);view.remove('bob');assert.equal(root.children.length,1);assert.equal(root.dataset.pinned,'false');
  assert.equal(root.children[0].children[3].hidden,true);
});

test('overall and participant volume multiply on the existing playback path and survive pinning/recovery',context=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:{createElement:()=>new Element()},configurable:true});
  context.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  const root=new Element(),select=new Element(),levels=new Element();
  const view=new GroupVideoView(root as unknown as HTMLElement,select as unknown as HTMLSelectElement,()=>{},levels as unknown as HTMLElement);
  assert.equal(typeof view.setOutputVolume,'function');
  view.setOutputVolume(50);const alice=view.remote('alice'),bob=view.remote('bob');const stream={};alice.srcObject=stream as unknown as MediaStream;
  assert.equal(alice.volume,.5);assert.equal(bob.volume,.5);
  view.setParticipantVolume('alice',40);assert.equal(alice.volume,.2);assert.equal(bob.volume,.5);
  view.pin('bob');view.pin(null);assert.equal(view.remote('alice'),alice);assert.equal(alice.srcObject,stream);assert.equal(alice.volume,.2);
  view.setOutputVolume(0);assert.equal(alice.volume,0);assert.equal(bob.volume,0);
  view.setOutputVolume(100);assert.equal(alice.volume,.4);assert.equal(bob.volume,1);
  view.setParticipantVolume('bob',0);assert.equal(bob.volume,0);assert.equal(alice.volume,.4);
  for(const value of [-1,101,NaN,Infinity])assert.throws(()=>view.setOutputVolume(value));
  assert.throws(()=>view.setParticipantVolume('alice',NaN));assert.equal(alice.volume,.4);
  assert.equal(levels.children.length,2);const row=levels.children[0],slider=row.children.find(c=>c.attributes['aria-label']?.includes('volume'))!;
  assert.ok(slider);slider.value='25';slider.dispatchEvent(new Event('input'));assert.equal(alice.volume,.25);assert.equal(levels.children[0],row,'Controls remain stable while dragging');
  view.remove('alice');assert.equal(levels.children.length,1);assert.equal(view.remote('alice').volume,1,'A new participation starts at100%');
  assert.equal(root.children.length,2,'No additional audio playback elements');
});

test('volume controls render literal member names and rename without replacing the slider',context=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:{createElement:()=>new Element()},configurable:true});
 context.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
 const root=new Element(),levels=new Element(),view=new GroupVideoView(root as unknown as HTMLElement,new Element() as unknown as HTMLSelectElement,()=>{},levels as unknown as HTMLElement);
 view.remote('alice');view.setParticipantVolume('alice',0);const row=levels.children[0],slider=row.children[1];
 const state={peers:{}} as Parameters<typeof view.render>[2];view.render([{id:'alice',name:'Alice <b>',online:true}],null,state);
 assert.equal(row.children[0].textContent,'Alice <b>');assert.equal(slider.attributes['aria-label'],'Alice <b> volume');
 view.render([{id:'alice',name:'Alicia',online:true}],null,state);assert.equal(levels.children[0],row);assert.equal(row.children[1],slider);assert.equal(slider.value,'0');assert.equal(slider.attributes['aria-label'],'Alicia volume');
});
