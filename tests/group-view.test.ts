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
  const alice=view.remote('alice'),bob=view.remote('bob');assert.equal(view.remote('alice'),alice);assert.equal(root.children.length,2);
  view.pin('bob');assert.equal(root.dataset.pinned,'true');assert.equal(root.children[0].inert,true);assert.equal(root.children[1].inert,false);
  view.pin(null);assert.equal(root.children[0].inert,false);assert.equal(view.remote('bob'),bob);
  assert.deepEqual(root.children.map(c=>c.dataset.participantId),['alice','bob']);view.remove('bob');assert.equal(root.children.length,1);assert.equal(root.dataset.pinned,'false');
});
