// Local synthetic video for testing a native full-screen Space without using a movie account.
import { createServer } from 'node:http';
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>ZoomTime full-screen fixture</title>
<style>body{background:#17130d;color:#ffe9bc;font:20px system-ui;margin:40px}video{width:70vw}button{padding:16px;font:inherit}</style>
<h1>Synthetic video — local full-screen test</h1><p>This checks the local browser only. Your actual movie workflow on both Macs still needs testing.</p>
<button id="full">Enter video full screen</button><p><video id="video" muted playsinline controls></video></p>
<script>
const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
const ctx=canvas.getContext('2d');const started=performance.now();
function draw(now){ctx.fillStyle='#292116';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#e4b771';ctx.fillRect(100+(Math.sin(now/1000)+1)*400,200,180,180);
ctx.font='40px system-ui';ctx.fillText('Synthetic full-screen video',70,90);ctx.fillText(((now-started)/1000).toFixed(1)+' seconds',70,650);requestAnimationFrame(draw)}
requestAnimationFrame(draw);const video=document.getElementById('video');video.srcObject=canvas.captureStream(24);
document.getElementById('full').onclick=async()=>{await video.play();await video.requestFullscreen()};
</script></html>`;
const server = createServer((request, response) => {
  response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(request.url === '/' ? html : 'Not found');
});
server.listen(0, '127.0.0.1', () => console.log(`Local test fixture: http://127.0.0.1:${server.address().port}/ (Ctrl-C stops it)`));
