/* ============================================================
   LIKELINK — Luxury Runtime Enhancements (v2)
   ------------------------------------------------------------
   Guarded augmentation layer that runs AFTER the compiled React
   bundle renders. It never edits or re-parses the bundle; every
   routine is wrapped in try/catch and silently no-ops on error.

   CHANGELOG vs v1:
   - FIX: badges (.ll-badge / .ll-store) had classes but NO actual
     CSS, so they rendered as unstyled inline text. Now a proper
     stylesheet is injected once, with a luxury pill design that
     matches the #F7F3EA / stone palette already used in the app.
   - PERF: card/image processing now uses a WeakSet instead of
     re-querying the DOM with querySelector() per card per pass.
   - PERF: MutationObserver callback is now debounced (150ms) so
     rapid successive DOM updates don't trigger dozens of full
     re-scans back to back.
   - ROBUSTNESS: polling loop now stops as soon as the grid is
     found AND processed once, instead of always running 60 times.
   - ROBUSTNESS: image error placeholder now respects the card's
     actual aspect ratio instead of hardcoding 4:5 everywhere.
   ============================================================ */
(function () {
  "use strict";

  var LABELS = {
    "cart.title": "Cart",
    "cart": "Cart",
    "nav.feed": "Feed",
    "nav.sell": "Sell",
    "nav.admin": "Admin",
    "nav.home": "Home",
    "nav.profile": "Profile",
    "topbar.feed": "Feed",
    "topbar.sell": "Sell",
    "topbar.admin": "Admin",
    "feed.title": "Curated for you",
    "feed.emptyTitle": "Nothing here yet",
    "feed.emptyBody": "Beautiful picks will appear once creators publish them.",
    "sell.title": "Your Studio",
    "toast.openingDeal": "Opening the deal…",
    "creatorPage.listingsCount": "listings",
    "creatorPage.follow": "Follow",
    "creatorPage.following": "Following",
    "creatorPage.moreProducts": "More products",
    "creatorPage.allProductsBy": "All products by",
    "creatorPage.backHome": "Back home"
  };

  var processedCards = new WeakSet();
  var processedImages = new WeakSet();
  var stylesInjected = false;

  function readJSON(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function safe(fn) { try { fn(); } catch (e) { /* no-op by design */ } }

  /* ------- One-time stylesheet injection (the missing piece) ------- */
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      ".ll-meta{position:absolute;left:0;right:0;bottom:0;padding:0 10px 10px;" +
      "display:flex;flex-direction:column;align-items:flex-start;gap:4px;z-index:2;" +
      "pointer-events:none;}" +
      ".ll-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;" +
      "font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;" +
      "background:rgba(28,25,23,0.85);color:#F7F3EA;backdrop-filter:blur(4px);" +
      "-webkit-backdrop-filter:blur(4px);box-shadow:0 1px 3px rgba(0,0,0,.15);" +
      "animation:ll-fade-in .25s ease-out;}" +
      ".ll-badge + .ll-badge{margin-top:2px;}" +
      ".ll-store{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;" +
      "font-weight:500;color:#3D3830;background:rgba(247,243,234,0.92);" +
      "box-shadow:0 1px 2px rgba(0,0,0,.08);animation:ll-fade-in .25s ease-out;" +
      "max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      "@keyframes ll-fade-in{from{opacity:0;transform:translateY(2px);}to{opacity:1;transform:translateY(0);}}" +
      ".ll-img-placeholder{width:100%;aspect-ratio:var(--ll-ratio,4/5);" +
      "background:linear-gradient(140deg,#EDE3CE,#F3EDDF);display:flex;" +
      "align-items:center;justify-content:center;color:#8A8071;font-size:10px;" +
      "letter-spacing:.08em;text-transform:uppercase;}";
    var tag = document.createElement("style");
    tag.setAttribute("data-ll-runtime", "true");
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ------- 1) Clean placeholder / localization keys ------- */
  function labelFixes() {
    var nodes = document.querySelectorAll("#root *");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.childNodes.length !== 1) continue;
      var child = el.firstChild;
      if (!child || child.nodeType !== 3) continue;
      var text = child.data;
      var trimmed = text.trim();
      if (!trimmed || trimmed.indexOf(".") === -1) continue; // fast skip, no dot = never a key
      var cleaned = text;
      if (Object.prototype.hasOwnProperty.call(LABELS, trimmed)) {
        cleaned = LABELS[trimmed];
      } else if (/^[a-z]+\.[a-zA-Z]+$/.test(trimmed)) {
        cleaned = beautify(trimmed);
      }
      if (cleaned !== text) child.data = cleaned;
    }
  }

  function beautify(key) {
    var parts = key.split(".");
    var last = parts[parts.length - 1] || key;
    return last.replace(/([A-Z])/g, " $1").replace(/^./, function (c) { return c.toUpperCase(); }).trim();
  }

  /* ------- 2) Data-driven prominence + store transparency ------- */
  function prominence() {
    var products = readJSON("marketplace:products") || [];
    var sales = readJSON("marketplace:sales") || [];
    var marketers = readJSON("marketplace:marketers") || [];
    if (!Array.isArray(products) || products.length === 0) return;

    injectStyles();

    var salesByProduct = {};
    (Array.isArray(sales) ? sales : []).forEach(function (s) {
      if (s && s.productId) {
        salesByProduct[s.productId] = (salesByProduct[s.productId] || 0) + 1;
      }
    });
    var marketerById = {};
    (Array.isArray(marketers) ? marketers : []).forEach(function (m) {
      if (m && m.id) marketerById[m.id] = m;
    });
    var totalSales = 0;
    products.forEach(function (p) { if (p) totalSales += salesByProduct[p.id] || 0; });
    var medianSales = totalSales / Math.max(1, products.length);

    function ensureMetaHost(card) {
      var host = card.querySelector(".ll-meta");
      if (host) return host;
      host = document.createElement("div");
      host.className = "ll-meta";
      card.appendChild(host);
      return host;
    }

    var cards = document.querySelectorAll(".grid.grid-cols-2 > div");
    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      if (processedCards.has(card)) continue;

      var titleText = (card.textContent || "").trim();
      var product = null;
      for (var p = 0; p < products.length; p++) {
        var pr = products[p];
        if (pr && pr.title && titleText.indexOf(pr.title) !== -1) { product = pr; break; }
      }
      if (!product) continue;
      processedCards.add(card);

      var mk = product.marketerId ? marketerById[product.marketerId] : null;
      var storeName = (mk && mk.name) || "Independent Creator";
      var host = ensureMetaHost(card);

      var domain = "";
      try {
        if (product.affiliateUrl) {
          var u = new URL(product.affiliateUrl, window.location.origin);
          domain = u.hostname.replace(/^www\./, "");
        }
      } catch (e) { domain = ""; }

      var salesCount = salesByProduct[product.id] || 0;
      var chipTexts = [];
      if (salesCount > 0 && salesCount >= Math.max(1, Math.ceil(medianSales))) chipTexts.push("Top Seller");
      var verified = !!(mk && (mk.verified === true || salesCount > 0));
      if (verified) chipTexts.push("Verified");
      chipTexts.forEach(function (chip) {
        var b = document.createElement("span");
        b.className = "ll-badge";
        b.textContent = chip;
        host.appendChild(b);
      });

      var line = document.createElement("span");
      line.className = "ll-store";
      line.textContent = storeName + (domain ? "  ·  " + domain : "");
      host.appendChild(line);
    }

    var imgs = document.querySelectorAll(".grid img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (processedImages.has(img)) continue;
      processedImages.add(img);

      var handleError = (function (el) {
        return function () {
          var wrap = el.parentNode;
          if (!wrap || wrap.querySelector(".ll-img-placeholder")) return;
          var rect = el.getBoundingClientRect();
          var ratio = rect.width && rect.height ? (rect.width + "/" + rect.height) : "4/5";
          el.style.display = "none";
          var ph = document.createElement("div");
          ph.className = "ll-img-placeholder";
          ph.style.setProperty("--ll-ratio", ratio);
          ph.textContent = "Likelink";
          wrap.insertBefore(ph, el.nextSibling);
        };
      })(img);

      if (img.complete && img.naturalWidth === 0) handleError();
      else img.addEventListener("error", handleError, { once: true });
    }
  }

  /* ------- Bootstrap ------- */
  function debounce(fn, wait) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  function runPass() {
    safe(labelFixes);
    safe(prominence);
  }

  function boot() {
    runPass();

    var tries = 0;
    var maxTries = 40; // ~10s at 250ms, enough for slow first paint / async data
    (function poll() {
      var hasGrid = !!document.querySelector("#root .grid");
      if (hasGrid) { runPass(); return; } // found it, stop polling
      if (++tries < maxTries) window.setTimeout(poll, 250);
    })();

    if (window.MutationObserver) {
      var debouncedPass = debounce(runPass, 150);
      var mo = new MutationObserver(debouncedPass);
      window.setTimeout(function () {
        var root = document.getElementById("root");
        if (root) mo.observe(root, { childList: true, subtree: true });
      }, 500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();