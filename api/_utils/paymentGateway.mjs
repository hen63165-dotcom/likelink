// The single boundary for the Studio package rail. Hosted collection only.
// Official contract: PayPlus PaymentPages/generateLink, signed callbacks,
// Transactions/RefundByTransactionUID. No PAN, CVV or wallet data is accepted.
import { createHmac, timingSafeEqual } from 'node:crypto';
const fail = code => { throw new Error(code); };
export const paymentError = code => fail(code);
export function createPaymentGateway({ env = process.env, fetchFn = fetch } = {}) {
  const live = env.PAYMENT_ENV === 'live';
  const base = live ? 'https://restapi.payplus.co.il/api/v1.0' : 'https://restapidev.payplus.co.il/api/v1.0';
  const configured = () => Boolean(env.PAYPLUS_API_KEY && env.PAYPLUS_SECRET_KEY && env.PAYPLUS_PAGE_UID && ['live', 'sandbox'].includes(env.PAYMENT_ENV));
  function verifySignature(body, headers) {
    if (!configured()) fail('PAYMENT_PROVIDER_REQUIRED');
    const get = name => headers?.get ? headers.get(name) : headers?.[name];
    const sig = get('hash');
    if (get('user-agent') !== 'PayPlus' || typeof sig !== 'string' || sig.length > 100) fail('INVALID_SIGNATURE');
    const actual = Buffer.from(sig, 'base64');
    const expected = createHmac('sha256', env.PAYPLUS_SECRET_KEY).update(JSON.stringify(body)).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('INVALID_SIGNATURE');
    return true;
  }
  async function request(path, body) {
    if (!configured()) fail('PAYMENT_PROVIDER_REQUIRED');
    let response;
    try {
      response = await fetchFn(`${base}/${path}`, { method: 'POST', redirect: 'error',
        headers: { 'api-key': env.PAYPLUS_API_KEY, 'secret-key': env.PAYPLUS_SECRET_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    } catch { fail('PAYMENT_RECONCILIATION_REQUIRED'); }
    if (!response.ok) fail('PAYMENT_RECONCILIATION_REQUIRED');
    const raw = await response.text();
    if (raw.length > 64000) fail('FAILED_VERIFICATION');
    let data; try { data = JSON.parse(raw); } catch { fail('FAILED_VERIFICATION'); }
    verifySignature(data, response.headers);
    if (data.results?.status !== 'success' || data.results?.code !== 0) fail('PAYMENT_REJECTED');
    return data.data;
  }
  function checkoutUrl(value) {
    let url; try { url = new URL(value); } catch { fail('FAILED_VERIFICATION'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.hostname !== (live ? 'payments.payplus.co.il' : 'paymentsdev.payplus.co.il')) fail('FAILED_VERIFICATION');
    return url.href;
  }
  return {
    status: () => ({ configured: configured(), environment: live ? 'live' : 'sandbox',
      status: configured() ? 'CONFIGURED_NOT_VERIFIED' : 'PAYMENT_PROVIDER_REQUIRED',
      collection: 'hosted', recurring: false }),
    verifySignature,
    async createPaymentIntent(order, origin) {
      const callback = `${origin}/api/store?mode=finance&action=webhook&order=${order.id}`;
      const data = await request('PaymentPages/generateLink', {
        payment_page_uid: env.PAYPLUS_PAGE_UID, charge_method: 1,
        amount: order.amountMinor / 100, currency_code: order.currency,
        language_code: 'he', sendEmailApproval: true, sendEmailFailure: false,
        expiry_datetime: '30', more_info: order.id, payments: 1,
        allowed_charge_methods: ['credit-card', 'apple-pay', 'google-pay'],
        refURL_callback: callback, refURL_success: `${origin}/studio?payment=${order.id}`,
        refURL_failure: `${origin}/studio?payment=${order.id}`, refURL_cancel: `${origin}/studio?payment=${order.id}`,
      });
      if (!/^[a-zA-Z0-9-]{10,80}$/.test(data?.page_request_uid || '')) fail('FAILED_VERIFICATION');
      return { reference: data.page_request_uid, checkoutUrl: checkoutUrl(data.payment_page_link) };
    },
    // Browser redirects NEVER call this with trusted data. Caller must verify HMAC first.
    confirmPayment(order, event) {
      // Official Transaction Callback Response; verify the signed envelope BEFORE projection.
      const t = event.transaction;
      if (!t || t.more_info !== order.id || t.payment_request_uid !== order.reference ||
        t.currency !== order.currency || !Number.isFinite(Number(t.amount)) ||
        Math.round(Number(t.amount) * 100) !== order.amountMinor ||
        !/^[a-zA-Z0-9-]{10,80}$/.test(t.uid || '')) fail('FAILED_VERIFICATION');
      if (event.transaction_type !== 'Charge' || t.status_code !== '000') fail('PAYMENT_NOT_CAPTURED');
      return { transactionId: t.uid, status: 'CAPTURED' };
    },
    async refundPayment(order) {
      const data = await request('Transactions/RefundByTransactionUID', {
        transaction_uid: order.transactionId, amount: order.amountMinor / 100, more_info: order.id,
      });
      const t = data?.transaction;
      if (!t || t.status_code !== '000' || t.currency !== order.currency ||
        Math.round(Number(t.amount) * 100) !== order.amountMinor || !/^[a-zA-Z0-9-]{10,80}$/.test(t.uid || '')) fail('FAILED_VERIFICATION');
      return { refundId: t.uid, status: 'REFUNDED' };
    },
  };
}
