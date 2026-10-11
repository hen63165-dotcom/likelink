import{c as a,e as p}from"./index-BX_z4-6V.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("ArrowLeft",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=a("Facebook",[["path",{d:"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",key:"1jg4f8"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=a("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=a("MessageCircle",[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z",key:"vv11sd"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=a("Store",[["path",{d:"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",key:"ztvudi"}],["path",{d:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",key:"1b2hhj"}],["path",{d:"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",key:"2ebpfo"}],["path",{d:"M2 7h20",key:"1fcdvo"}],["path",{d:"M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7",key:"jon5kx"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=a("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function h(t,e=[]){const n=(t==null?void 0:t.marketerId)==null?"":String(t.marketerId).trim();return n?(Array.isArray(e)?e:[]).some(o=>o&&String(o.id)===n):!1}function R(t,e=[]){return!!(t&&t.status==="approved"&&h(t,e))}const d=Object.freeze(["landing_view","content_view","cta_click","share_started","share_completed","share_target","creator_landing_view","creator_cta_click","creator_signup_started","studio_opened","creator_lead","merchant_lead","merchant_landing_view","merchant_cta_click","merchant_signup_started","referral_visit"]);function $(t,e){const n="https://likelink2.vercel.app".replace(/\/+$/,""),r=String(t||"/");return`${n}${r.startsWith("/")?r:`/${r}`}`}function A(t,e={}){try{const n=new URL(t);for(const[r,o]of Object.entries(e))o==null||o===""||n.searchParams.set(r,String(o).slice(0,120));return n.toString()}catch{return t}}function I({source:t,medium:e="social",campaign:n,content:r}={}){const o={};return t&&(o.utm_source=t),e&&(o.utm_medium=e),n&&(o.utm_campaign=n),r&&(o.utm_content=r),o}const f=Object.freeze({whatsapp:(t,e)=>`https://wa.me/?text=${encodeURIComponent(`${e}
${t}`)}`,telegram:(t,e)=>`https://t.me/share/url?url=${encodeURIComponent(t)}&text=${encodeURIComponent(e)}`,x:(t,e)=>`https://twitter.com/intent/tweet?url=${encodeURIComponent(t)}&text=${encodeURIComponent(e)}`,facebook:t=>`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(t)}`,pinterest:(t,e,n)=>n?`https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(t)}&media=${encodeURIComponent(n)}&description=${encodeURIComponent(e)}`:null,email:(t,e)=>`mailto:?subject=${encodeURIComponent(e)}&body=${encodeURIComponent(`${e}
${t}`)}`}),U=Object.freeze(["whatsapp","telegram","x","facebook","email"]),C=Object.freeze(["whatsapp","telegram","facebook","pinterest","x","email"]);function m(t,{page:e,ref:n,utm:r,productId:o,marketerId:c,storyId:s,target:l}={}){if(!d.includes(t))return null;const u={type:t,siteEvent:!0,page:e?String(e).slice(0,200):null,ref:n?String(n).slice(0,120):null,productId:o?String(o).slice(0,80):null,marketerId:c?String(c).slice(0,80):null,storyId:s?String(s).slice(0,80):null,target:l?String(l).slice(0,24):null};if(r&&typeof r=="object")for(const i of["utm_source","utm_medium","utm_campaign","utm_content"])r[i]&&(u[i]=String(r[i]).slice(0,120));return u}function E(t){return`/p/${encodeURIComponent(String(t||""))}`}function M(t){return`/u/${encodeURIComponent(String(t||""))}`}function j(t,e,n="",r=""){const o=f[t];if(!o)return null;try{return o(e,n,/^https:\/\//i.test(String(r||""))?r:"")||null}catch{return null}}function g(t,e={}){const n=m(t,e);if(!n)return null;try{fetch("/api/store?mode=record-click",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(n),keepalive:!0}).catch(()=>{})}catch{}return n}function x(t,e,n={}){g(t,n);try{p(t,e,n)}catch{}}export{k as A,S as F,y as M,b as S,w as T,v as a,j as b,g as c,U as d,E as e,M as f,C as g,R as i,$ as p,x as t,I as u,A as w};
