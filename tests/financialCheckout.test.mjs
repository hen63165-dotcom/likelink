import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createPaymentGateway } from '../api/_utils/paymentGateway.mjs';
import { createFinancialCore } from '../api/_utils/financialCore.mjs';
import { createFinancialHandler } from '../api/_utils/financialHandler.mjs';
export function harness(environment = 'live') {
  const env={PAYMENT_ENV:environment,PAYPLUS_API_KEY:'test-only-key',PAYPLUS_SECRET_KEY:'test-only-secret',PAYPLUS_PAGE_UID:'test-page',PAYMENT_PUBLIC_ORIGIN:'https://example.com',ADMIN_SESSION_SECRET:'test-admin'};
  const sign=body=>({'user-agent':'PayPlus',hash:createHmac('sha256',env.PAYPLUS_SECRET_KEY).update(JSON.stringify(body)).digest('base64')});
  let state={version:0,orders:[],ledger:[]};const subscriptions=new Map();let failWrite=false;const calls=[];
  const store={read:async()=>structuredClone(state),write:async(version,next,sub)=>{
    if(failWrite)throw Error('PAYMENT_STORAGE_REQUIRED');
    if(version!==state.version)throw Error('VERSION_CONFLICT');
    state=structuredClone(next);if(sub)subscriptions.set(sub.id,structuredClone(sub));return structuredClone(state);
  }};
  const gateway=createPaymentGateway({env,fetchFn:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    const data=url.includes('generateLink')?{page_request_uid:'request-reference-123',payment_page_link:`https://${environment==='live'?'payments':'paymentsdev'}.payplus.co.il/request-reference-123`}
      :{transaction:{uid:'refund-reference-123',status_code:'000',currency:'ILS',amount:29}};
    const body={results:{status:'success',code:0},data};return new Response(JSON.stringify(body),{headers:sign(body)});
  }});
  const core=createFinancialCore({store,gateway});
  const handler=createFinancialHandler({core,env,verify:async(token)=>token==='user-token'?{id:'owner'}:null,admin:t=>t==='admin-token'});
  const request=async(action,body={},token='user-token',extra={})=>{
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;},end(){}};
    await handler({method:'POST',url:'/api/store?mode=finance&action='+action,headers:{authorization:'Bearer '+token,...extra},body},res);return res;
  };
  const checkout=()=>request('checkout',{planId:'starter',billingPeriod:'monthly',idempotencyKey:'unique-test-request-123'});
  const event=o=>({transaction_type:'Charge',transaction:{more_info:o.id,payment_request_uid:'request-reference-123',uid:'transaction-reference-123',type:'internal_page',status_code:'000',amount:29,currency:'ILS'}});
  return {core,request,checkout,event,sign,subscriptions,calls,store,setFail:v=>{failWrite=v;}};
}
test('checkout -> signed captured webhook -> one atomic entitlement; replay is harmless',async()=>{
 const h=harness();const r=await h.checkout();assert.equal(r.code,200);const o=r.body.order;
 assert.equal(o.amountMinor,2900);assert.equal(h.subscriptions.size,0);
 assert.equal((await h.checkout()).body.order.id,o.id);assert.equal(h.calls.length,1);
 const e=h.event(o);const action='webhook&order='+o.id;
 assert.equal((await h.request(action,e,'',h.sign(e))).code,200);
 assert.equal((await h.request(action,e,'',h.sign(e))).code,200);
 assert.equal(h.subscriptions.size,1);assert.equal([...h.subscriptions.values()][0].status,'active');
 assert.equal((await h.store.read()).ledger.length,1);
 assert.equal((await h.core.get('owner',o.id)).status,'CAPTURED');
});
test('tampering, invalid signature, failed transaction and cross-owner access cannot grant access',async()=>{
 const h=harness();assert.equal((await h.request('checkout',{planId:'starter',billingPeriod:'monthly',idempotencyKey:'unique-test-request-123',amount:1})).code,400);
 assert.equal((await h.request('checkout',{},'invalid')).code,401);
 const o=(await h.checkout()).body.order;const e=h.event(o);
 assert.equal((await h.request('webhook&order='+o.id,e,'',{'hash':'forged','user-agent':'PayPlus'})).code,401);
 const wrong={...e,transaction:{...e.transaction,amount:1}};assert.equal((await h.request('webhook&order='+o.id,wrong,'',h.sign(wrong))).code,422);
 const failed={...e,transaction:{...e.transaction,status_code:'005'}};assert.equal((await h.request('webhook&order='+o.id,failed,'',h.sign(failed))).code,422);
 await assert.rejects(h.core.get('another-owner',o.id),/ORDER_NOT_FOUND/);assert.equal(h.subscriptions.size,0);
});
test('atomic persistence failure recovers by webhook replay without another charge',async()=>{
 const h=harness();const o=(await h.checkout()).body.order;const e=h.event(o);h.setFail(true);
 assert.equal((await h.request('webhook&order='+o.id,e,'',h.sign(e))).code,503);assert.equal(h.subscriptions.size,0);
 h.setFail(false);assert.equal((await h.request('webhook&order='+o.id,e,'',h.sign(e))).code,200);
 assert.equal(h.calls.length,1);assert.equal(h.subscriptions.size,1);
});
test('full refund is admin-only and idempotent; replay cannot resurrect access',async()=>{
 const h=harness();const o=(await h.checkout()).body.order;const e=h.event(o);
 await h.request('webhook&order='+o.id,e,'',h.sign(e));
 assert.equal((await h.request('refund',{orderId:o.id})).code,403);
 for(let n=0;n<2;n++)assert.equal((await h.request('refund',{orderId:o.id},'admin-token')).body.order.status,'REFUNDED');
 await h.request('webhook&order='+o.id,e,'',h.sign(e));
 assert.equal([...h.subscriptions.values()][0].status,'cancelled');assert.equal(h.calls.length,2);assert.equal((await h.store.read()).ledger.length,2);
});
test('sandbox never grants live entitlement; missing credential performs no request',async()=>{
 const h=harness('sandbox');const o=(await h.checkout()).body.order;const e=h.event(o);
 await h.request('webhook&order='+o.id,e,'',h.sign(e));assert.equal(h.subscriptions.size,0);
 const gateway=createPaymentGateway({env:{},fetchFn:()=>assert.fail('network forbidden')});
 await assert.rejects(gateway.createPaymentIntent({amountMinor:2900,currency:'ILS',id:'test'},'https://example.com'),/PAYMENT_PROVIDER_REQUIRED/);
});

