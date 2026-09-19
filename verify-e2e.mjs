const BASE = "https://likelink2.vercel.app";

// Step 1: Get admin token
console.log("=== Step 1: Get admin token ===");
const authRes = await fetch(`${BASE}/api/admin/auth`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "super_secret_admin_2026" }),
});
const authData = await authRes.json();
const token = authData.token;
console.log("Auth HTTP:", authRes.status, "| Got token:", !!token);

// Step 2: Internal publish
console.log("\n=== Step 2: Internal publish p-live-01 ===");
const publishRes = await fetch(`${BASE}/api/store?mode=publish`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: "Bearer " + token,
  },
  body: JSON.stringify({ productId: "p-live-01" }),
});
console.log("Publish HTTP:", publishRes.status);
const publishData = await publishRes.json();
console.log("Response:", JSON.stringify(publishData, null, 2));

// If 500, try with verbose error
if (publishRes.status === 500) {
  console.log("\n=== Step 3: Get detailed error ===");
  const debugRes = await fetch(`${BASE}/api/store?mode=publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: JSON.stringify({ productId: "p-live-01" }),
  });
  const debugText = await debugRes.text();
  console.log("Debug response:", debugText);
}
