import {test} from 'node:test';
import assert from 'node:assert/strict';
test('native installation preserves known standard and Experimental app paths only',async()=>{
 const module=await import('../src/native-installation.ts').catch(()=>null);assert.ok(module,'Native installation ownership must exist');
 for(const root of ['/Applications','/Users/test/Applications'])for(const name of ['ZoomTime.app','ZoomTime Experimental.app'])assert.equal(module.nativeApplication(`${root}/${name}/Contents/MacOS/ZoomTime`,'/Users/test'),`${root}/${name}`);
 for(const path of ['/tmp/ZoomTime.app/Contents/MacOS/ZoomTime','/Applications/Other.app/Contents/MacOS/ZoomTime','/Applications/ZoomTime.app/Contents/MacOS/Other'])assert.throws(()=>module.nativeApplication(path,'/Users/test'));
});
