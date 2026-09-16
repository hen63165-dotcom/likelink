import { verifyToken } from './authVerify.js';
import { verifyAdminToken } from './adminAuth.js';
import { applyCors } from './cors.js';
import { createFinancialCore } from './financialCore.mjs';


// Mounted in the existing store function, not a new serverless endpoint.
export function createFinancialHandler({ core = createFinancialCore(), verify = verifyToken,
  admin = verifyAdminToken, env = process.env } = {}) {
  const codes = { UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_SIGNATURE: 401,
    INVALID_CHECKOUT: 400, INVALID_REQUEST: 400, INVALID_REFUND: 409, FAILED_VERIFICATION: 422,
    PAYMENT_NOT_CAPTURED: 422, ORDER_NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409,
    PAYMENT_LIMIT: 429, PAYMENT_PROVIDER_REQUIRED: 503, PAYMENT_STORAGE_REQUIRED: 503,
    PAYMENT_RECONCILIATION_REQUIRED: 503, REQUEST_TOO_LARGE: 413, VERSION_CONFLICT: 409 };
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store'); applyCors(res,req);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
    try {
      const params = new URL(req.url,'https://localhost').searchParams;
      const action = params.get('action');
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i,'');
      let user;
      if (action !== 'webhook' && action !== 'status') {
        if (action === 'refund') {
          if (!(env.ADMIN_SESSION_SECRET || env.ADMIN_CODE) || !admin(token)) throw Error('FORBIDDEN');
        } else {
          user = token ? await verify(token) : null;
          if (!user?.id) throw Error('UNAUTHENTICATED');
        }
      }
      let raw, size = 0;
      if (Number(req.headers?.['content-length']) > 32000) throw Error('REQUEST_TOO_LARGE');
      if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      else {
        const chunks=[];
        for await(const chunk of req) {
          const b=Buffer.from(chunk); size+=b.length;
          if(size>32000) throw Error('REQUEST_TOO_LARGE'); chunks.push(b);
        }
        raw=Buffer.concat(chunks).toString('utf8');
      }
      if(Buffer.byteLength(raw || '')>32000) throw Error('REQUEST_TOO_LARGE');
      let body; try { body=JSON.parse(raw || '{}'); } catch { throw Error('INVALID_REQUEST'); }
      if(!body || typeof body!=='object' || Array.isArray(body)) throw Error('INVALID_REQUEST');
      if(action==='status') return res.status(200).json({ok:true,...core.status()});
      if(action==='webhook') return res.status(200).json({ok:true,...await core.webhook(params.get('order'),body,req.headers)});
      if(action==='checkout') {
        let origin; try { origin=new URL(env.PAYMENT_PUBLIC_ORIGIN); } catch { throw Error('PAYMENT_PROVIDER_REQUIRED'); }
        if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw Error('PAYMENT_PROVIDER_REQUIRED');
        const order=await core.checkout(user.id,body,origin.origin);
        return res.status(200).json({ok:true,order});
      }
      if(action==='list') return res.status(200).json({ok:true,orders:await core.list(user.id)});
      if(!/^[a-f0-9-]{36}$/.test(body.orderId || '') || Object.keys(body).some(k=>k!=='orderId')) throw Error('INVALID_REQUEST');
      if(action==='get') return res.status(200).json({ok:true,order:await core.get(user.id,body.orderId)});
      if(action==='refund') return res.status(200).json({ok:true,order:await core.refund(body.orderId)});
      throw Error('INVALID_REQUEST');
    } catch(e) {
      const code=codes[e.message] ? e.message : 'PAYMENT_RECONCILIATION_REQUIRED';
      return res.status(codes[code]).json({ok:false,error:code});
    }
  };
}
export const financialHandler = createFinancialHandler();
