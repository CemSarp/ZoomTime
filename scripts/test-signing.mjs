import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {loadSigningPolicy,signingRequirement,verifyPinnedCode,verifyPinnedData} from '../src/release-signing.ts';
const policy=loadSigningPolicy('build/signing-policy.json'),directory=mkdtempSync(resolve('out/verification/signing-'));
const requirement=signingRequirement(policy,policy.appId),requirements=[];
for(const version of ['A','B']){
 const app=join(directory,version+'.app');mkdirSync(join(app,'Contents/MacOS'),{recursive:true});
 writeFileSync(join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${policy.appId}</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
 const source=join(directory,version+'.c');writeFileSync(source,`#include <stdio.h>\nint main(void){puts("${version}");return 0;}`);
 execFileSync('xcrun',['clang',source,'-o',join(app,'Contents/MacOS/Fixture')]);
 execFileSync('/usr/bin/codesign',['--force','--sign',policy.certificateSha1,'--identifier',policy.appId,'--requirements','=designated => '+requirement,'--timestamp=none',app],{stdio:['ignore','pipe','pipe']});
 await verifyPinnedCode(app,policy,policy.appId);
 const display=spawnSync('/usr/bin/codesign',['-d','-r-',app],{encoding:'utf8'});assert.equal(display.status,0);
 const actual=(display.stdout+display.stderr).match(/designated => (.+)/)?.[1];assert.ok(actual?.includes(policy.certificateSha1));requirements.push(actual);
}
assert.equal(requirements[0],requirements[1]);
const different=join(directory,'wrong-signer');execFileSync('/bin/cp',['/usr/bin/true',different]);
execFileSync('/usr/bin/codesign',['--force','--sign','-','--identifier',policy.appId,different],{stdio:['ignore','pipe','pipe']});
await assert.rejects(verifyPinnedCode(different,policy,policy.appId));
const signedData=join(directory,'feed.json');writeFileSync(signedData,'{"version":"0.5.1"}');
execFileSync('/usr/bin/codesign',['--sign',policy.certificateSha1,'--identifier',policy.appId,'--requirements','=designated => '+requirement,'--timestamp=none','--detached',signedData+'.sig',signedData]);
await verifyPinnedData(signedData,signedData+'.sig',policy);writeFileSync(signedData,'{"version":"0.5.0"}');await assert.rejects(verifyPinnedData(signedData,signedData+'.sig',policy));
const result={result:'pass',detachedFeedTamperingRejected:true,directory,certificateSha256:policy.certificateSha256,requirement,distinctBuilds:['A','B'],mutualIdentity:true,wrongSignerRejected:true,trustSettingsChanged:false,permissionContinuity:'not tested'};
writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
