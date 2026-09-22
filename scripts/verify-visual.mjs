// Temporary live visual verification of the theme fix on production.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const PORT = 9341;
const BASE = process.argv[2] || 'https://likelink2.vercel.app';
const profile = mkdtempSync(join(tmpdir(), 'likelink-visual-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws; const errors = [];
const cream = 'rgb(247, 243, 234)'; // #F7F3EA luxury canvas
const cream2 = 'rgb(247, 243, 238)'; // #f7f3ee index.css light bg
const navy = 'rgb(11, 13, 26)'; // #0b0d1a dark bg
try {
  let targets;
  for (let n=0;n<60;n++){try{targets=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();if(targets.length)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  assert.ok(targets?.length,'Edge remote debugger');
  ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown'){errors.push(m.params.exceptionDetails.text);console.log('[vis] EXCEPTION:',m.params.exceptionDetails.text);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
  const until=async (expression,tries=80)=>{for(let i=0;i<tries;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,150));}throw Error('timeout: '+expression);};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

  // --- /studio : Studio must KEEP deep-navy dark theme after async effect settles ---
  await send('Page.navigate',{url:BASE+'/studio'});
  await until(`document.getElementById('root') && document.getElementById('root').children.length > 0`);
  await new Promise(r=>setTimeout(r,600));
  const t1 = await evaluate(`({theme:document.documentElement.getAttribute('data-theme'),cls:document.documentElement.className,bg:getComputedStyle(document.body).backgroundColor,htmlBg:getComputedStyle(document.documentElement).backgroundColor})`);
  console.log('[vis] studio t+0.6s:',JSON.stringify(t1));
  await new Promise(r=>setTimeout(r,2500)); // let async storage effect fully settle
  const t2 = await evaluate(`({theme:document.documentElement.getAttribute('data-theme'),cls:document.documentElement.className,bg:getComputedStyle(document.body).backgroundColor,htmlBg:getComputedStyle(document.documentElement).backgroundColor,text:document.body.innerText.slice(0,120)})`);
  console.log('[vis] studio t+3.1s:',JSON.stringify(t2));
  assert.equal(t2.theme,'dark','/studio data-theme must stay dark');
  assert.ok(t2.text.length>0,'/studio must render real content');
  const studioRootBg = await evaluate(`(()=>{const el=document.querySelector('.ll-studio');return el?getComputedStyle(el).backgroundColor+'|'+getComputedStyle(el).backgroundImage.slice(0,120):'MISSING';})()`);
  console.log('[vis] .ll-studio background:',studioRootBg);
  assert.ok(studioRootBg!=='MISSING','studio container must exist');
  const shot1 = await send('Page.captureScreenshot',{format:'png'});
  const fs1 = await import('node:fs');
  fs1.writeFileSync('scripts/_studio.png',Buffer.from(shot1.data,'base64'));

  // --- home : default theme settles without async flip ---
  await send('Page.navigate',{url:BASE+'/'});
  await until(`document.getElementById('root') && document.getElementById('root').children.length > 0`);
  await new Promise(r=>setTimeout(r,600));
  const h1 = await evaluate(`({theme:document.documentElement.getAttribute('data-theme'),bg:getComputedStyle(document.body).backgroundColor})`);
  await new Promise(r=>setTimeout(r,2000));
  const h2 = await evaluate(`({theme:document.documentElement.getAttribute('data-theme'),bg:getComputedStyle(document.body).backgroundColor,title:document.title,text:document.body.innerText.slice(0,80)})`);
  console.log('[vis] home t+0.6s:',JSON.stringify(h1));
  console.log('[vis] home t+2.6s:',JSON.stringify(h2));
  assert.equal(h1.theme,h2.theme,'home theme must not flip after async effect');
  assert.equal(h2.theme,'dark','home default theme is dark');
  assert.ok(h2.title.includes('לייקלינק')||h2.title.includes('Likelink'),'home title');
  const shot2 = await send('Page.captureScreenshot',{format:'png'});
  const fs2 = await import('node:fs');
  fs2.writeFileSync('scripts/_home.png',Buffer.from(shot2.data,'base64'));

  // Light-theme sanity: flipping data-theme must repaint the luxury cream canvas.
  await evaluate(`document.documentElement.setAttribute('data-theme','light')`);
  await new Promise(r=>setTimeout(r,400));
  const lightBg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  console.log('[vis] forced light body bg:',lightBg);
  assert.notEqual(lightBg,'rgb(11, 13, 26)','light theme must leave the navy palette');
  const shot3 = await send('Page.captureScreenshot',{format:'png'});
  fs2.writeFileSync('scripts/_light.png',Buffer.from(shot3.data,'base64'));

  assert.equal(errors.length,0,'no uncaught page exceptions: '+errors.join(', '));
  console.log('DOM PASS: /studio keeps data-theme=dark after async storage settles; home theme stable; no page exceptions. Screenshots saved for pixel check.');
} finally {
  ws?.close(); edge.kill();
  setTimeout(()=>{try{rmSync(profile,{recursive:true,force:true});}catch{}},1500);
}
