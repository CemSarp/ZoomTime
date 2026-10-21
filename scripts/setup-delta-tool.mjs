import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const version='2.9.5',sha256='015336b601493e05c237964954bff6191370003d94edefe663724c88840d73cc',size=15557500;
const root=resolve('out/tools'),archive=join(root,`Sparkle-${version}.tar.xz`),directory=join(root,`Sparkle-${version}`);
await mkdir(root,{recursive:true,mode:0o700});
let bytes;try{bytes=await readFile(archive);}catch{
 const response=await fetch(`https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,{signal:AbortSignal.timeout(120000)});
 if(!response.ok||!['github.com','release-assets.githubusercontent.com'].includes(new URL(response.url).hostname))throw Error('Unapproved BinaryDelta download.');
 const chunks=[];let received=0;for await(const chunk of response.body){received+=chunk.length;if(received>size)throw Error('Oversized BinaryDelta archive.');chunks.push(chunk);}bytes=Buffer.concat(chunks);
}
if(bytes.length!==size||createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Pinned BinaryDelta archive verification failed.');
await writeFile(archive,bytes,{mode:0o600});
const entries=execFileSync('/usr/bin/tar',['-tf',archive],{encoding:'utf8'}).trim().split('\n');
if(entries.some(p=>p.startsWith('/')||p.split('/').includes('..')))throw Error('Unsafe BinaryDelta archive path.');
await mkdir(directory,{recursive:true,mode:0o700});execFileSync('/usr/bin/tar',['-xf',archive,'-C',directory]);
const tool=join(directory,'bin/BinaryDelta');if(!(await stat(tool)).isFile())throw Error('Pinned BinaryDelta executable missing.');
console.log(JSON.stringify({tool,version,archiveSha256:sha256}));
