/* ============================================================
   LIKELINK — Luxury Runtime Enhancements (2026)
   ------------------------------------------------------------
   A fully guarded augmentation layer that runs AFTER the compiled
   React bundle renders. It never edits or re-parses the minified
   bundle; every routine is wrapped in try/catch and silently
   no-ops on any error so the host app can never be broken.

   1) labelFixes()  — cleans placeholder/localization keys such as
      "cart.title" / "nav.feed" / "topbar.admin" so crisp, localized
      terms are always shown on the bottom nav & top bar.
   2) prominence()  — reads marketplace:products / marketplace:sales
      / marketplace:marketers from localStorage and adds refined
      "Top Seller", "Verified" and store-source transparency chips
      to product cards, plus a 4:5 editorial crop + elegant offline
      placeholder for every product image (contextual alignment).
   ============================================================ */
(function () {
  "use strict";

  /* ------- Guarded label dictionary (placeholder -> clean term) ------- */
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

  function readJSON(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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
      var cleaned = text;
      if (Object.prototype.hasOwnProperty.call(LABELS, text.trim())) {
        cleaned = LABELS[text.trim()];
      } else if (/^[a-z]+\.[a-zA-Z]+$/.test(text.trim())) {
        cleaned = beautify(text.trim());
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
    if (!Array.isArray(products)) return;

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
    var ms = 0;
    products.forEach(function (p) { if (p) ms += salesByProduct[p.id] || 0; });
    var medianSales = ms / Math.max(1, products.length);

    function ensureMetaHost(card) {
      var host = card.querySelector(".ll-meta");
      if (host) return host;
      host = document.createElement("div");
      host.className = "ll-meta";
      host.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:0 10px 10px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;z-index:2;pointer-events:none;";
      card.appendChild(host);
      return host;
    }

    var cards = document.querySelectorAll(".grid.grid-cols-2 > div");
    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      if (card.querySelector(".ll-badge")) continue;
      var titleText = (card.textContent || "").trim();
      var product = null;
      for (var p = 0; p < products.length; p++) {
        var pr = products[p];
        if (pr && pr.title && titleText.indexOf(pr.title) !== -1) { product = pr; break; }
      }
      if (!product) continue;

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
      if (salesCount >= Math.max(1, Math.ceil(medianSales)) && salesCount > 0) chipTexts.push("Top Seller");
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
      if (img.dataset.llf) continue;
      img.dataset.llf = "1";
      var onError = (function (el) {
        return function () {
          if (el.dataset.llDone) return;
          el.dataset.llDone = "1";
          var wrap = el.parentNode;
          if (!wrap) return;
          el.style.display = "none";
          var ph = document.createElement("div");
          ph.style.cssText = "width:100%;aspect-ratio:4/5;background:linear-gradient(140deg,#EDE3CE,#F3EDDF);display:flex;align-items:center;justify-content:center;color:#8A8071;font-size:10px;letter-spacing:.08em;text-transform:uppercase;";
          ph.textContent = "Likelink";
          wrap.insertBefore(ph, el.nextSibling);
        };
      })(img);
      if (img.complete && img.naturalWidth === 0) onError();
      else img.addEventListener("error", onError);
    }
  }

  /* ------- Bootstrap: run after render, re-run on changes ------- */
  function safe(label, fn) { try { fn(); } catch (e) { } }

  function boot() {
    safe("labels", labelFixes);
    var tries = 0;
    (function poll() {
      if (document.querySelector("#root .grid")) safe("prominence", prominence);
      if (++tries < 60) window.setTimeout(poll, 250);
    })();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { safe("labels", labelFixes); safe("prominence", prominence); });
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