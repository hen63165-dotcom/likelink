// Local browser harness. Real React component/client, isolated authentication and cloud.
import { build } from 'esbuild';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = 'c:/Users/User/Desktop/likelink2';
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Luna from './src/components/ambassador/LunaAssistant.jsx';createRoot(document.getElementById('root')).render(<Luna/>);`, resolveDir: root, loader:'jsx' }, bundle:true, write:false, format:'iife', jsx:'automatic', plugins:[{name:'isolated-dependencies',setup(b){
 const stubs = {
 'LangContext': `export const useI18n=()=>({lang:'he',t:(k,v)=>v});`,
 'MarketplaceContext': `export const useMarketplace=()=>({products:[],marketers:[]});`,
 'cloud/home.js': `export const fetchCloudHome=async()=>({ok:false});`,
 'lib/auth.js': `export const getSessionToken=async()=>null;`
 };
 b.onResolve({filter:/.*/},args=>{const k=Object.keys(stubs).find(k=>args.path.includes(k));if(k)return {path:k,namespace:'stub'};});
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path]}));
}}]});
let attempts=0;const ids=[];let completed=false;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].text);}
 if(req.url==='/api/store?mode=intelligence'){
 let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);
 let result;
 if(b.action==='status') result={ok:true,status:'CORE_DEGRADED',capabilities:[{capability:'text',status:'NOT_CONFIGURED'}]};
 else if(b.action==='inspect')result={ok:true,jobs:completed?[]:[{jobId:'original-job',operation:'luna.suggest',status:'blocked',errorCode:'BLOCKED_BY_CREDENTIAL',expiresAt:Date.now()+3600000}]};
 else if(b.action==='resume'){ids.push(b.jobId);attempts++;if(attempts===1){res.statusCode=500;return res.end('simulated-outage');}completed=true;result={ok:true,job:{jobId:b.jobId,status:'completed'},result:{text:'Verified local browser result'}};}
 else result={ok:false,error:'INVALID_REQUEST'};
 res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
 }
 res.end('<html lang="he" dir="rtl"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=mkdtempSync(join(tmpdir(),'likelink-browser-'));
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9338','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws;const errors=[];
try {
 let targets;for(let n=0;n<50;n++){try{targets=await(await fetch('http://127.0.0.1:9338/json')).json();if(targets.length)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(targets?.length,'Edge remote debugger');
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let seq=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const until=async expression=>{for(let i=0;i<60;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}throw Error('Browser condition timed out: '+expression);};
 await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 await until(`document.querySelector('button[aria-label]')`);
 await evaluate(`document.querySelector('button[aria-label]').click()`);
 const resume=`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('המשיכי את אותה משימה'))`;
 await until(resume);await evaluate(`${resume}.click()`);
 await until(`document.body.textContent.includes('הענן לא זמין כרגע')`);
 assert.equal(await evaluate(`${resume}.disabled`),false);
 assert.equal(await evaluate(`document.body.textContent.includes('לונה חושבת…')`),false);
 await evaluate(`${resume}.click()`);
 await until(`document.body.textContent.includes('Verified local browser result')`);
 assert.deepEqual(ids,['original-job','original-job']);assert.equal(attempts,2);assert.deepEqual(errors,[]);
 console.log('PASS: Edge 390px, real Luna + client, blocked job -> failed resume (honest cloud-unavailable state) -> enabled resume -> same job success; no uncaught exceptions. Cloud mocked, not production.');
} finally {
 ws?.close();edge.kill();server.closeAllConnections();await new Promise(r=>server.close(r));
 setTimeout(()=>{try{rmSync(profile,{recursive:true,force:true});}catch{}},1500);
}
