import{c as i,e as p}from"./index-DAXVIMd5.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=i("ArrowLeft",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=i("Facebook",[["path",{d:"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",key:"1jg4f8"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=i("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=i("MessageCircle",[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z",key:"vv11sd"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=i("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function d(t,e=[]){const n=(t==null?void 0:t.marketerId)==null?"":String(t.marketerId).trim();return n?(Array.isArray(e)?e:[]).some(r=>r&&String(r.id)===n):!1}function R(t,e=[]){return!!(t&&t.status==="approved"&&d(t,e))}const h=Object.freeze(["landing_view","content_view","cta_click","share_started","share_completed","share_target","creator_landing_view","creator_cta_click","creator_signup_started","studio_opened","creator_lead","merchant_lead","merchant_landing_view","merchant_cta_click","merchant_signup_started","referral_visit"]);function $(t,e){const n="https://likelink2.vercel.app".replace(/\/+$/,""),o=String(t||"/");return`${n}${o.startsWith("/")?o:`/${o}`}`}function v(t,e={}){try{const n=new URL(t);for(const[o,r]of Object.entries(e))r==null||r===""||n.searchParams.set(o,String(r).slice(0,120));return n.toString()}catch{return t}}function I({source:t,medium:e="social",campaign:n,content:o}={}){const r={};return t&&(r.utm_source=t),e&&(r.utm_medium=e),n&&(r.utm_campaign=n),o&&(r.utm_content=o),r}const m=Object.freeze({whatsapp:(t,e)=>`https://wa.me/?text=${encodeURIComponent(`${e}
${t}`)}`,telegram:(t,e)=>`https://t.me/share/url?url=${encodeURIComponent(t)}&text=${encodeURIComponent(e)}`,x:(t,e)=>`https://twitter.com/intent/tweet?url=${encodeURIComponent(t)}&text=${encodeURIComponent(e)}`,facebook:t=>`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(t)}`,pinterest:(t,e,n)=>n?`https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(t)}&media=${encodeURIComponent(n)}&description=${encodeURIComponent(e)}`:null,email:(t,e)=>`mailto:?subject=${encodeURIComponent(e)}&body=${encodeURIComponent(`${e}
${t}`)}`}),U=Object.freeze(["whatsapp","telegram","x","facebook","email"]),C=Object.freeze(["whatsapp","telegram","facebook","pinterest","x","email"]);function f(t,{page:e,ref:n,utm:o,productId:r,marketerId:a,storyId:s,target:l}={}){if(!h.includes(t))return null;const u={type:t,siteEvent:!0,page:e?String(e).slice(0,200):null,ref:n?String(n).slice(0,120):null,productId:r?String(r).slice(0,80):null,marketerId:a?String(a).slice(0,80):null,storyId:s?String(s).slice(0,80):null,target:l?String(l).slice(0,24):null};if(o&&typeof o=="object")for(const c of["utm_source","utm_medium","utm_campaign","utm_content"])o[c]&&(u[c]=String(o[c]).slice(0,120));return u}function E(t){return`/p/${encodeURIComponent(String(t||""))}`}function A(t){return`/u/${encodeURIComponent(String(t||""))}`}function x(t,e,n="",o=""){const r=m[t];if(!r)return null;try{return r(e,n,/^https:\/\//i.test(String(o||""))?o:"")||null}catch{return null}}function g(t,e={}){const n=f(t,e);if(!n)return null;try{fetch("/api/store?mode=record-click",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(n),keepalive:!0}).catch(()=>{})}catch{}return n}function T(t,e,n={}){g(t,n);try{p(t,e,n)}catch{}}export{k as A,S as F,w as M,U as S,y as T,b as a,x as b,g as c,E as d,A as e,C as f,R as i,$ as p,T as t,I as u,v as w};
