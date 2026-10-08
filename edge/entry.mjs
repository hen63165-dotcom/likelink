// Entry of the edge API bundle: every API function behind one fetch handler,
// with the API rewrites from vercel.json (the one route table).
import vercel from "../vercel.json" with { type: "json" };
import { createFetchHandler } from "./adapter.mjs";
import store from "../api/store.mjs";
import og from "../api/og.mjs";
import autopilot from "../api/autopilot.mjs";
import ads from "../api/ads.mjs";
import googleFeed from "../api/google-feed.mjs";
import priceWatch from "../api/price-watch.mjs";
import adminAuth from "../api/admin/auth.mjs";
import createOrder from "../api/checkout/create-order.mjs";
import captureOrder from "../api/checkout/capture-order.mjs";
import invoiceSend from "../api/invoice/send.mjs";
import payoutsProcess from "../api/payouts/process.mjs";
import paypalConnect from "../api/paypal/connect.mjs";

export const FILES = Object.freeze({
  "/api/store": store,
  "/api/og": og,
  "/api/autopilot": autopilot,
  "/api/ads": ads,
  "/api/google-feed": googleFeed,
  "/api/price-watch": priceWatch,
  "/api/admin/auth": adminAuth,
  "/api/checkout/create-order": createOrder,
  "/api/checkout/capture-order": captureOrder,
  "/api/invoice/send": invoiceSend,
  "/api/payouts/process": payoutsProcess,
  "/api/paypal/connect": paypalConnect,
});

export const handle = createFetchHandler({ files: FILES, rewrites: vercel.rewrites });
export default handle;
