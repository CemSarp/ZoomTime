import {test} from 'node:test';
import assert from 'node:assert/strict';
test('release signing requires a pinned certificate, stable identifiers and no ad-hoc fallback',async()=>{
  const signing=await import('../src/release-signing.ts').catch(()=>null);
  assert.ok(signing,'Persistent release-signing policy must exist');
  const policy={schema:1,certificateSha1:'a'.repeat(40),certificateSha256:'b'.repeat(64),appId:'com.cemsarp.zoomtime',helperId:'com.cemsarp.zoomtime.capture'} as const;
  assert.deepEqual(signing.parseSigningPolicy(policy),policy);
  assert.match(signing.signingRequirement(policy,policy.appId),/certificate leaf = H"a{40}"/);
  for(const value of [null,{...policy,certificateSha1:'-'},{...policy,certificateSha256:''},{...policy,appId:'evil.app'},{...policy,helperId:policy.appId},{...policy,extra:true}])assert.throws(()=>signing.parseSigningPolicy(value));
  assert.throws(()=>signing.signingRequirement(policy,'arbitrary.app'));
});

test('bundle permissions match native delta normalization without following links',async()=>{
 const signing=await import('../src/release-signing.ts');
 assert.equal(typeof signing.normalizeBundlePermissions,'function','Normalize before signing or creating deltas');
 const {mkdtemp,writeFile,mkdir,chmod,stat,symlink}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'zoomtime-mode-')),app=join(root,'App.app'),outside=join(root,'outside');await mkdir(app);await writeFile(outside,'outside');await chmod(outside,0o666);await writeFile(join(app,'file'),'inside');await chmod(join(app,'file'),0o666);await symlink(outside,join(app,'link'));
 signing.normalizeBundlePermissions(app);assert.equal((await stat(join(app,'file'))).mode&0o022,0);assert.equal((await stat(outside)).mode&0o022,0o022);
});
test('sign executable code and seal binary resources without creating resource code-signing xattrs',async()=>{
 const signing=await import('../src/release-signing.ts');assert.equal(typeof signing.skipNonCodeSigning,'function');
 const {mkdtempSync,writeFileSync,mkdirSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'zoomtime-sign-kinds-'));mkdirSync(join(root,'Fixture.framework'));writeFileSync(join(root,'resource.pak'),Buffer.from([0,1,2,3,0]));writeFileSync(join(root,'executable'),Buffer.from([0xcf,0xfa,0xed,0xfe,0]));
 assert.equal(signing.skipNonCodeSigning(join(root,'resource.pak')),true);assert.equal(signing.skipNonCodeSigning(join(root,'executable')),false);assert.equal(signing.skipNonCodeSigning(join(root,'Fixture.framework')),false);
});
test('detached feed signatures bind exact bytes to the persistent publisher certificate',async()=>{
 const signing=await import('../src/release-signing.ts');assert.equal(typeof signing.verifyPinnedData,'function');
 const policy=signing.loadSigningPolicy('build/signing-policy.json'),file='tests/fixtures/native-feed-signed.json',signature=file+'.sig';
 await signing.verifyPinnedData(file,signature,policy);
 const {mkdtempSync,writeFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const changed=join(mkdtempSync(join(tmpdir(),'zoomtime-feed-signature-')),'changed.json');
 writeFileSync(changed,'{"test":"another target or delta hash"}');await assert.rejects(signing.verifyPinnedData(changed,signature,policy));
 await assert.rejects(signing.verifyPinnedData(file,signature,{...policy,certificateSha1:'a'.repeat(40)}));
});
