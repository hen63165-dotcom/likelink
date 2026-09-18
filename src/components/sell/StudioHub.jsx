/**
 * StudioHub - Creator/Seller Studio מרכזי
 * מרכז אחד שמתאר את כל המוצרים ומענץ למוכר או משפיען
 * את כל כלי העבודה הרלוונטיים בקליק אחד.
 * 
 * מחובר למערכות הקיימות:
 * - Product Intelligence: חילוץ מידע מהלינק
 * - Content Studio: סרטון, ריל, סטורי, קמפיין
 * - Launch: הפעלת מוצר בקליק אחד (ממושק ל-launch.js)
 * - Trend Intelligence: נתוני טרנד לפי מוצר
 * - WhatsApp: שיתוף מוצר ויצירת הודעת מכירה
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Sparkles, Video, Play, Rocket, TrendingUp, MessageCircle,
  CheckCircle2, Loader2, X, ChevronRight, Lightbulb, BarChart3, Copy
} from 'lucide-react';
import { useI18n } from '../../lib/LangContext';
import { launchProduct, summarizeLaunch } from '../../lib/cloud/launch.js';
import { rankByTrend } from '../../lib/cloud/trends.js';
import { generateContentPack } from '../../lib/cloud/contentStudio.js';
import { suggestPrice, scoreStoreHealth } from '../../lib/aiStudio.js';
import { fetchProductInfo } from '../../lib/productInfo.js';
import { money } from '../../utils/helpers.js';
import { ProductThumb } from '../product/ProductComponents.jsx';
import { EmptyState } from '../ui/index.jsx';

// סטטוסים של כל יכולת
const CAPABILITY_STATUS = {
  READY: 'ready',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable',
  NOT_STARTED: 'not_started',
};

export default function StudioHub({ marketer, products, sales, clicks, onLaunchComplete, showToast }) {
  const { t, lang, categoryLabel } = useI18n();
  
  // State for selected product and active tab
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('intelligence');
  const [capabilities, setCapabilities] = useState({});
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [videoProduct, setVideoProduct] = useState(null);
  const [whatsappDraft, setWhatsappDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const hasProduct = selectedProduct != null;

  // מצריפת מוצרי המשתמש עם טרנדים
  const myProducts = useMemo(() => 
    products?.filter(p => p.marketerId === marketer?.id && p.status === 'approved') || [],
    [products, marketer]
  );

  const productTrends = useMemo(() => {
    if (!myProducts.length || !sales?.length || !clicks?.length) return [];
    return rankByTrend(myProducts, { sales, clicks, views: [], limit: myProducts.length });
  }, [myProducts, sales, clicks]);

  // בחירת מוצר
  const selectProduct = useCallback((product) => {
    setSelectedProduct(product);
    setActiveTab('intelligence');
    setCapabilities({});
    setLaunchResult(null);
  }, []);

  // ניקוי בחירה
  const clearSelection = useCallback(() => {
    setSelectedProduct(null);
    setActiveTab('intelligence');
    setCapabilities({});
    setLaunchResult(null);
  }, []);

  // חילוץ מידע מהלינק
  const extractProductInfo = useCallback(async (product) => {
    if (!product?.url && !product?.affiliateUrl) {
      setCapabilities(prev => ({ ...prev, intelligence: { status: CAPABILITY_STATUS.UNAVAILABLE, error: 'אין לינק מוצר' } }));
      return;
    }
    const url = product.url || product.affiliateUrl;
    setCapabilities(prev => ({ ...prev, intelligence: { status: CAPABILITY_STATUS.PROCESSING } }));
    try {
      const info = await fetchProductInfo(url);
      setCapabilities(prev => ({
        ...prev,
        intelligence: {
          status: info.title || info.image ? CAPABILITY_STATUS.COMPLETED : CAPABILITY_STATUS.READY,
          data: info,
        }
      }));
    } catch (e) {
      setCapabilities(prev => ({
        ...prev,
        intelligence: { status: CAPABILITY_STATUS.FAILED, error: e.message || 'שגיאה בחילוץ מידע' }
      }));
    }
  }, []);

  // יצירת תוכן
  const generateContent = useCallback(async (product) => {
    if (!product) return;
    setCapabilities(prev => ({ ...prev, content: { status: CAPABILITY_STATUS.PROCESSING } }));
    try {
      const pack = generateContentPack(product, { format: 'all' });
      setCapabilities(prev => ({
        ...prev,
        content: { status: CAPABILITY_STATUS.COMPLETED, data: pack }
      }));
      showToast?.('תוכן נוצר בהצלחה 🎉');
    } catch (e) {
      setCapabilities(prev => ({
        ...prev,
        content: { status: CAPABILITY_STATUS.FAILED, error: e.message || 'שגיאה ביצירת תוכן' }
      }));
    }
  }, [showToast]);

  // הפעלת מוצר
  const handleLaunch = useCallback(async (product) => {
    if (!product) return;
    setLaunching(true);
    setLaunchResult(null);
    try {
      const result = await launchProduct(product, {
        marketer,
        products,
        clicks,
        config: { enabled: false },
      });
      setLaunchResult(result);
      const summary = summarizeLaunch(result);
      if (result.ok) {
        showToast?.('המוצר הושק בהצלחה 🚀');
        onLaunchComplete?.(product, result);
      } else if (result.blocked) {
        showToast?.(summary.text || 'ההשקה חסומה');
      } else {
        showToast?.(summary.text || 'שגיאה בהשקה');
      }
    } catch (e) {
      setLaunchResult({ ok: false, error: e.message, steps: [] });
      showToast?.('שגיאה בהשקה: ' + (e.message || 'לא ידוע'));
    } finally {
      setLaunching(false);
    }
  }, [marketer, products, clicks, showToast, onLaunchComplete]);

  // הודעת וואטסאפ
  const generateWhatsappMessage = useCallback((product, customText = '') => {
    if (!product) return '';
    const lines = [
      `🛍️ ${product.title}`,
      product.price ? `מחיר: ₪${product.price}` : '',
      customText || 'קנייה בקליק — לינק בתיאור 👇',
      '',
      `${window.location.origin}/p/${product.id}`,
    ].filter(Boolean);
    return lines.join('\n');
  }, []);

  // העתקה ללוחית
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast?.('הועתק ללוחית ❱❱');
    } catch {
      showToast?.(text);
    }
  }, [showToast]);

  // פתיחת וואטסאפ
  const openWhatsapp = useCallback((product) => {
    const message = generateWhatsappMessage(product, whatsappDraft);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  }, [whatsappDraft, generateWhatsappMessage]);

  // בריאות הסטודיו
  const studioHealth = useMemo(() => {
    if (!marketer) return null;
    return scoreStoreHealth({
      marketer,
      products: myProducts,
      sales: sales || [],
      paypalConnected: Boolean(marketer?.payPalEmail),
    });
  }, [marketer, myProducts, sales]);

  // טאבים
  const tabs = [
    { id: 'intelligence', label: 'Product Intelligence', color: '#6C4CF1' },
    { id: 'content', label: 'Content Studio', color: '#C9A86C' },
    { id: 'launch', label: 'Launch', color: '#00C896' },
    { id: 'trends', label: 'Trends', color: '#E86A9E' },
    { id: 'whatsapp', label: 'WhatsApp', color: '#35D354' },
  ];

  // הצגת רשימת מוצרים (כשאין מוצר נבחר)
  if (!hasProduct) {
    return (
      <div className="pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="disp text-xl font-semibold">{t('sell.studioTitle')} {marketer?.name?.split(' ')[0]}</h2>
            <p className="text-xs text-muted mt-0.5">כל הכלים במקום אחד — בחרי מוצר כדי להתחיל</p>
          </div>
        </div>

        {marketer && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded-xl" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-xs font-semibold">Capability Hub</span>
            </div>
            <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            <div className="flex items-center gap-1 text-[10px] text-muted">
              <CheckCircle2 size={12} style={{ color: '#00C896' }} />
              <span>{myProducts.length} מוצרים</span>
            </div>
            {studioHealth && (
              <div className="flex items-center gap-1 text-[10px]">
                <BarChart3 size={12} style={{ color: studioHealth.score >= 70 ? '#00C896' : '#E86A9E' }} />
                <span style={{ color: studioHealth.score >= 70 ? '#00C896' : '#E86A9E' }}>{studioHealth.grade}</span>
              </div>
            )}
          </div>
        )}

        {myProducts.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title={t('sell.emptyTitle')}
            body={t('sell.emptyBody')}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {myProducts.map((product) => {
              const trend = productTrends.find(p => p.product.id === product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  className="tap w-full text-left rounded-2xl p-3 flex gap-3 transition-all hover:shadow-md"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                    <ProductThumb p={product} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{product.title}</p>
                      {trend && trend.score > 50 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: trend.momentum === '🔥 viral' ? '#E86A9E20' : '#6C4CF120', color: trend.momentum === '🔥 viral' ? '#E86A9E' : '#6C4CF1' }}>
                          {trend.momentum}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {categoryLabel(product.category)} · {money(product.price, lang)}
                    </p>
                    <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                      <Play size={11} /> {product.clicks || 0} קליקים
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </button>
              );
            })}
          </div>
        )}

        {marketer && myProducts.length > 0 && (
          <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--bg-subtle)' }}>
            <p className="font-semibold mb-1">💡 איך זה עובד:</p>
            <p className="text-muted">בחרי מוצר כדי לראות את כל הכלים: חילוץ מידע, יצירת תוכן, הפעלה, טרנדים ושיתוף בוואטסאפ.</p>
          </div>
        )}
      </div>
    );
  }

  // מוצר נבחר - הצגת כלי העבודה
  const product = selectedProduct;
  const cap = capabilities[activeTab] || { status: CAPABILITY_STATUS.NOT_STARTED };
  const canRecord = typeof MediaRecorder !== 'undefined';

  return (
    <div className="pb-6">
      {/* כותרת עם חזרה */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={clearSelection}
            className="tap w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
          >
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <div>
            <h3 className="disp text-lg font-semibold truncate max-w-[200px]">{product.title}</h3>
            <p className="text-xs text-muted">{categoryLabel(product.category)} · {money(product.price, lang)}</p>
          </div>
        </div>
        {cap.status === CAPABILITY_STATUS.PROCESSING && (
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
        )}
      </div>

      {/* טאבים */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="tap shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: isActive ? `${tab.color}20` : 'var(--bg-elevated)',
                color: isActive ? tab.color : 'var(--text-muted)',
                border: `1px solid ${isActive ? tab.color : 'var(--border)'}`,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* גוף הטאב */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {/* Launch — תמיד זמין, לא תלוי ב-cap */}
        {activeTab === 'launch' && (
          <LaunchTab product={product} launchResult={launchResult} launching={launching} handleLaunch={handleLaunch} CheckCircle2={CheckCircle2} Rocket={Rocket} Loader2={Loader2} />
        )}

        {/* Content Studio */}
        {activeTab === 'content' && (
          <ContentStudioTab product={product} cap={cap} generateContent={generateContent} copyToClipboard={copyToClipboard} setVideoProduct={setVideoProduct} canRecord={canRecord} CAPABILITY_STATUS={CAPABILITY_STATUS} Video={Video} Loader2={Loader2} />
        )}

        {/* Trends */}
        {activeTab === 'trends' && (
          <TrendsTab product={product} productTrends={productTrends} CheckCircle2={CheckCircle2} />
        )}

        {/* WhatsApp */}
        {activeTab === 'whatsapp' && (
          <WhatsAppTab product={product} whatsappDraft={whatsappDraft} copied={copied} generateWhatsappMessage={generateWhatsappMessage} copyToClipboard={copyToClipboard} openWhatsapp={openWhatsapp} setWhatsappDraft={setWhatsappDraft} marketer={marketer} />
        )}

        {/* Product Intelligence */}
        {activeTab === 'intelligence' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb size={16} style={{ color: '#6C4CF1' }} />
                Product Intelligence
              </p>
              <button
                onClick={() => extractProductInfo(product)}
                disabled={cap.status === CAPABILITY_STATUS.PROCESSING}
                className="tap text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  background: cap.status === CAPABILITY_STATUS.PROCESSING ? 'var(--bg-subtle)' : '#6C4CF1',
                  color: cap.status === CAPABILITY_STATUS.PROCESSING ? 'var(--text-muted)' : '#fff',
                }}
              >
                {cap.status === CAPABILITY_STATUS.PROCESSING ? <Loader2 size={12} className="animate-spin" /> : 'חילוץ מידע'}
              </button>
            </div>

            {cap.status === CAPABILITY_STATUS.NOT_STARTED && (
              <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs text-muted">חילוץ כותרת, מחיר ותמונה מלינק המוצר — לפני ההשקה</p>
                <button
                  onClick={() => extractProductInfo(product)}
                  className="tap mt-2 text-xs font-semibold px-4 py-2 rounded-full"
                  style={{ background: '#6C4CF1', color: '#fff' }}
                >
                  חילוץ מידע עכשיו
                </button>
              </div>
            )}

            {cap.status === CAPABILITY_STATUS.PROCESSING && (
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm">מחלצת מידע מהלינק…</span>
                </div>
              </div>
            )}

            {cap.status === CAPABILITY_STATUS.COMPLETED && cap.data && (
              <div className="flex flex-col gap-3">
                {cap.data.image && (
                  <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                    <img src={cap.data.image} alt={product.title} className="w-full h-32 object-cover" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {cap.data.title && (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                      <p className="text-[10px] text-muted mb-1">כותרת</p>
                      <p className="text-sm font-semibold">{cap.data.title}</p>
                    </div>
                  )}
                  {cap.data.price && (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                      <p className="text-[10px] text-muted mb-1">מחיר</p>
                      <p className="text-sm font-semibold">₪{cap.data.price}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {cap.status === CAPABILITY_STATUS.FAILED && (
              <div className="p-4 rounded-xl" style={{ background: '#FEE2E2', border: '1px solid #FECACA' }}>
                <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>שגיאה בחילוץ מידע</p>
                <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>{cap.error}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// Content Studio tab JSX
const ContentStudioTab = ({ product, cap, generateContent, copyToClipboard, setVideoProduct, canRecord, CAPABILITY_STATUS, Video, Loader2 }) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold flex items-center gap-2"><Video size={16} style={{ color: '#C9A86C' }} />Content Studio</p>
      <button onClick={() => generateContent(product)} disabled={cap.status === CAPABILITY_STATUS.PROCESSING} className="tap text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: cap.status === CAPABILITY_STATUS.PROCESSING ? 'var(--bg-subtle)' : '#C9A86C', color: cap.status === CAPABILITY_STATUS.PROCESSING ? 'var(--text-muted)' : '#fff' }}>
        {cap.status === CAPABILITY_STATUS.PROCESSING ? <Loader2 size={12} className="animate-spin" /> : 'יצירת תוכן'}
      </button>
    </div>

    {cap.status === CAPABILITY_STATUS.NOT_STARTED && (
      <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-xs text-muted">ליצירת תוכן מותאם למוצר זה</p>
        <button onClick={() => generateContent(product)} className="tap mt-2 text-xs font-semibold px-4 py-2 rounded-full" style={{ background: '#C9A86C', color: '#fff' }}>יצירת תוכן עכשיו</button>
      </div>
    )}

    {cap.status === CAPABILITY_STATUS.COMPLETED && cap.data && (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(cap.data.formats || {}).map(([key, format]) => (
            <button key={key} onClick={() => copyToClipboard(JSON.stringify(format, null, 2))} className="tap p-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <span className="text-lg">{key === 'story' ? '📱' : key === 'reel' ? '🎬' : key === 'tiktok' ? '🎵' : key === 'post' ? '📷' : '🎥'}</span>
              <span className="capitalize">{key}</span><span className="text-[10px] text-muted">העתקו</span>
            </button>
          ))}
        </div>
        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs font-semibold mb-2">Hook שיווקי:</p>
          <p className="text-sm italic" style={{ color: 'var(--accent)' }}>"{cap.data.hook}"</p>
        </div>
        <button onClick={() => setVideoProduct(product)} disabled={!canRecord} className="tap w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: canRecord ? '#C9A86C' : 'var(--bg-subtle)', color: canRecord ? '#fff' : 'var(--text-muted)' }}>
          <Video size={16} />{canRecord ? 'צרי סרטון בקליק אחד' : 'הדפדפן לא תומך בהקלטת וידאו'}
        </button>
        <p className="text-[10px] text-muted mt-1 text-center">קליפ 9:16 · ללא עלות · רץ בדפדפן</p>
      </div>
    )}

    {cap.status === CAPABILITY_STATUS.FAILED && (
      <div className="p-4 rounded-xl" style={{ background: '#FEE2E2', border: '1px solid #FECACA' }}>
        <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>שגיאה ביצירת תוכן</p>
        <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>{cap.error}</p>
      </div>
    )}
  </div>
);

// Launch tab
const LaunchTab = ({ product, launchResult, launching, handleLaunch, CheckCircle2, Rocket, Loader2 }) => (
  <div>
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm font-semibold flex items-center gap-2"><Rocket size={16} style={{ color: '#00C896' }} />Launch this product</p>
      {launchResult && <span className={`text-xs px-2 py-1 rounded-full ${launchResult.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{launchResult.ok ? 'השקה הושלמה' : 'לא השגת'}</span>}
    </div>
    {!launchResult && (
      <div className="flex flex-col gap-2">
        <button onClick={() => handleLaunch(product)} disabled={launching || !product} className="tap w-full py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: launching ? 'var(--bg-subtle)' : 'linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)', color: launching ? 'var(--text-muted)' : '#fff' }}>
          {launching ? <><Loader2 size={16} className="animate-spin" />מפעילה…</> : <><Rocket size={16} />להפעיל את המוצר בקליק אחד</>}
        </button>
        <p className="text-xs text-muted text-center">מפעילה SEO/OG, יוצרת קמפיין, ומבנית קישור מעקב</p>
      </div>
    )}
    {launchResult && (
      <div className="flex flex-col gap-2">
        <div className="p-3 rounded-xl" style={{ background: launchResult.ok ? 'var(--success-subtle)' : 'var(--bg-subtle)', border: `1px solid ${launchResult.ok ? 'var(--success)' : 'var(--border)'}` }}>
          <p className={`text-sm font-semibold ${launchResult.ok ? 'text-green-600' : 'text-red-600'}`}>{launchResult.ok ? '✅ המוצר הושק בהצלחה!' : '❌ ההשקה נכשלה'}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold">צעדים בהפעלה:</p>
          {launchResult.steps?.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {step.status === 'DONE' ? <CheckCircle2 size={12} style={{ color: '#00C896' }} /> : <span className="text-muted">○</span>}
              <span className={step.status === 'DONE' ? 'text-green-600' : 'text-muted'}>{step.step.replace(/_/g, ' ')} — {step.detail}</span>
            </div>
          ))}
        </div>
        {!launchResult.ok && <button onClick={() => handleLaunch(product)} disabled={launching} className="tap w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: '#6C4CF1', color: '#fff' }}><Rocket size={12} />נסי שוב</button>}
      </div>
    )}
  </div>
);

// Trends tab — source is measured clicks/sales (see trends.js), never invented
const TrendsTab = ({ product, productTrends, CheckCircle2 }) => {
  const trend = productTrends.find(p => p.product.id === product.id);
  return (
    <div>
      <p className="text-sm font-semibold flex items-center gap-2 mb-4"><TrendingUp size={16} style={{ color: '#E86A9E' }} />Trend Intelligence</p>
      {productTrends.length === 0 ? (
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs text-muted">אין עדיין נתונים מספיקים לזיהוי טרנדים</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {productTrends.map((item, idx) => {
            const isSelected = item.product.id === product.id;
            return (
              <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: isSelected ? '#E86A9E20' : 'var(--bg)', border: `1px solid ${isSelected ? '#E86A9E' : 'var(--border)'}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{item.product.title}</p>
                    {idx === 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#6C4CF120', color: '#6C4CF1' }}>#1</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">ציון: {item.score} · {item.momentum}</p>
                </div>
                {isSelected && <CheckCircle2 size={16} style={{ color: '#E86A9E' }} />}
              </div>
            );
          })}
        </div>
      )}
      {trend && (
        <div className="p-3 rounded-xl mt-4" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs font-semibold mb-2">פירוט טרנד למוצר זה:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-muted">ציון כולל</p><p className="font-bold text-lg" style={{ color: '#E86A9E' }}>{trend.score}</p></div>
            <div><p className="text-muted">מומנטום</p><p className="font-bold capitalize">{trend.momentum}</p></div>
            <div><p className="text-muted">קליקים (7 ימים)</p><p className="font-bold">{trend.signals?.clicks7d || 0}</p></div>
            <div><p className="text-muted">מכירות (7 ימים)</p><p className="font-bold">{trend.signals?.sales7d || 0}</p></div>
          </div>
          <p className="text-[10px] text-muted mt-2">מקור: נתונים פנימיים — קליקים ומכירות מודדים באפליקציה</p>
        </div>
      )}
    </div>
  );
};

// WhatsApp tab — share via wa.me link only, no external API
const WhatsAppTab = ({ product, whatsappDraft, copied, generateWhatsappMessage, copyToClipboard, openWhatsapp, setWhatsappDraft, marketer }) => (
  <div>
    <p className="text-sm font-semibold flex items-center gap-2 mb-4"><MessageCircle size={16} style={{ color: '#35D354' }} />WhatsApp</p>
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-xs font-semibold mb-2">יצירת הודעת מכירה</p>
        <textarea value={whatsappDraft} onChange={(e) => setWhatsappDraft(e.target.value)} placeholder="הוספי טקסט מותאם אישית לפרסום בוואטסאפ..." className="w-full p-2.5 rounded-xl text-sm mb-2 resize-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} rows={3} />
        <div className="flex gap-2">
          <button onClick={() => copyToClipboard(generateWhatsappMessage(product, whatsappDraft))} className="tap flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: '#35D354', color: '#fff' }}>
            <Copy size={12} />{copied ? 'הועתק!' : 'העתקי הודעה'}
          </button>
          <button onClick={() => openWhatsapp(product)} className="tap py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
            <MessageCircle size={12} />פתיחת וואטסאפ
          </button>
        </div>
      </div>
      <div className="p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-xs font-semibold mb-2">שיתוף מוצר בוואטסאפ</p>
        <button onClick={() => openWhatsapp(product)} className="tap w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: '#25D36B', color: '#fff' }}>
          <MessageCircle size={16} />שלחי מוצר בוואטסאפ
        </button>
        <p className="text-[10px] text-muted mt-1 text-center">יפתח בחלון חדש עם המוצר והלינק לקנייה</p>
      </div>
      {(() => {
        const persona = marketer ? { name: marketer.name?.split(' ')[0] || 'לונה', emoji: '🧚' } : { name: 'לונה', emoji: '🧚' };
        const message = [
          `${persona.emoji} שלום! אני ${persona.name}`,
          `מצאתי משהו מגניב — ${product.title}`,
          `מחיר: ₪${product.price || 'להזינו'}`,
          '',
          'קנייה בקליק — לינק בתיאור 👇',
          '',
          `${window.location.origin}/p/${product.id}`,
        ].join('\n');
        return (
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
            <p className="text-xs font-semibold mb-2">הודעת מכירה מוכנה (לונה):</p>
            <pre className="text-xs p-2 rounded-xl whitespace-pre-wrap" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>{message}</pre>
            <button onClick={() => copyToClipboard(message)} className="tap mt-2 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: '#6C4CF1', color: '#fff' }}>
              <Copy size={12} />העתקי הודעת לונה
            </button>
          </div>
        );
      })()}
    </div>
  </div>
);

