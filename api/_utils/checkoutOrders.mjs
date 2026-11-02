import { createHash } from "node:crypto";

const TABLE = "checkout_orders";

function headers(serviceKey, prefer) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function endpoint(baseUrl, query = "", table = TABLE) {
  return `${baseUrl}/rest/v1/${table}${query}`;
}

async function request(baseUrl, serviceKey, path, init = {}, table = TABLE) {
  if (!baseUrl || !serviceKey) throw new Error("supabase_not_configured");
  const response = await fetch(endpoint(baseUrl, path, table), {
    ...init,
    headers: { ...headers(serviceKey, init.prefer), ...init.headers },
    signal: init.signal || AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`checkout_orders_${response.status}${detail ? `_${detail}` : ""}`);
  }
  return response.status === 204 ? [] : response.json();
}

export function hashIdempotencyKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export async function getCheckoutOrderByIdempotency(baseUrl, serviceKey, keyHash) {
  const rows = await request(
    baseUrl,
    serviceKey,
    `?idempotency_key=eq.${encodeURIComponent(keyHash)}&select=*`
  );
  return rows[0] || null;
}

export async function getCheckoutOrderByPayPalId(baseUrl, serviceKey, orderId) {
  const rows = await request(
    baseUrl,
    serviceKey,
    `?paypal_order_id=eq.${encodeURIComponent(orderId)}&select=*`
  );
  return rows[0] || null;
}

export async function insertCheckoutOrder(baseUrl, serviceKey, values) {
  const response = await fetch(endpoint(baseUrl, "?on_conflict=idempotency_key"), {
    method: "POST",
    headers: headers(serviceKey, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify(values),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 409) return null;
  if (!response.ok) throw new Error(`checkout_order_insert_${response.status}`);
  const rows = await response.json();
  return rows[0] || null;
}

export async function updateCheckoutOrder(baseUrl, serviceKey, orderId, values, expectedStatus, expectedUpdatedAt) {
  const statusFilter = expectedStatus ? `&status=eq.${encodeURIComponent(expectedStatus)}` : "";
  const updatedAtFilter = expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : "";
  const rows = await request(
    baseUrl,
    serviceKey,
    `?paypal_order_id=eq.${encodeURIComponent(orderId)}${statusFilter}${updatedAtFilter}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
    }
  );
  return rows[0] || null;
}

export async function updateCheckoutOrderByIdempotency(baseUrl, serviceKey, keyHash, values, expectedStatus) {
  const statusFilter = expectedStatus ? `&status=eq.${encodeURIComponent(expectedStatus)}` : "";
  const rows = await request(
    baseUrl,
    serviceKey,
    `?idempotency_key=eq.${encodeURIComponent(keyHash)}${statusFilter}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
    }
  );
  return rows[0] || null;
}

export async function deleteExpiredCheckoutOrders(baseUrl, serviceKey) {
  const response = await fetch(
    endpoint(baseUrl, "?status=in.(CREATING,CREATED,FAILED)&expires_at=lt." + encodeURIComponent(new Date().toISOString())),
    {
      method: "DELETE",
      headers: headers(serviceKey, "return=minimal"),
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!response.ok) throw new Error(`checkout_order_cleanup_${response.status}`);
}

export async function insertUserEvent(baseUrl, serviceKey, event) {
  const response = await fetch(`${baseUrl}/rest/v1/user_events?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw new Error(`user_event_insert_${response.status}`);
}

export async function readUserEvents(baseUrl, serviceKey, { limit = 5000, since } = {}) {
  const params = new URLSearchParams({
    select: "id,event_type,product_id,marketer_id,source,campaign_id,utm_source,utm_medium,utm_campaign,utm_content,page,event_target,story_id,language,occurred_at",
    order: "occurred_at.desc",
    limit: String(Math.max(1, Math.min(5000, Number(limit) || 5000))),
  });
  if (since) params.set("occurred_at", `gte.${new Date(since).toISOString()}`);
  const rows = await request(baseUrl, serviceKey, `?${params}`, {}, "user_events");
  return rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    productId: row.product_id,
    marketerId: row.marketer_id,
    source: row.source,
    cid: row.campaign_id,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    page: row.page,
    target: row.event_target,
    storyId: row.story_id,
    language: row.language,
    ts: new Date(row.occurred_at).getTime(),
  })).reverse();
}
