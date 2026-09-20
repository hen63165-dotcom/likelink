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
  CheckCircle2, Loader2, X, ChevronRight, Lightbulb, BarChart3, Copy,
  Target, Brain, Zap, Share2, Activity, BarChart2, Users, PieChart,
  Globe, Send, FileText, Shield, Settings, HelpCircle, Menu
} from 'lucide-react';
import { useI18n } from '../../lib/LangContext';
import { launchProduct, summarizeLaunch } from '../../lib/cloud/launch.js';
import { rankByTrend } from '../../lib/cloud/trends.js';
import { generateContentPack } from '../../lib/cloud/contentStudio.js';
import { verifyProduct, TRUST_STATE, isDiscoveryEligible, trustGateReport } from '../../lib/cloud/trustVerification.js';
import { runGrowthCycle, diagnoseProduct } from '../../lib/cloud/lunaGrowth.js';
import { suggestPrice, scoreStoreHealth } from '../../lib/aiStudio.js';
import { fetchProductInfo } from '../../lib/productInfo.js';
import { canRecordVideo } from '../../lib/videoEngine.js';
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

const CAN_RECORD_VIDEO = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

export default function StudioHub({ marketer, products, sales, clicks, onLaunchComplete, showToast, brandChannelsConfigured = false }) {
  const { t, lang, categoryLabel } = useI18n();
  
  // State for selected product and active tab
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [capabilities, setCapabilities] = useState({});
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
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

  // הפעלת מוצר עם הגנה מפני לחיצה כפולה, התקדמות ו-backoff
  const handleLaunch = useCallback(async (product, retryCount = 0) => {
    if (!product || launching) return;
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
      const isRetryable = retryCount < 2;
      setLaunchResult({
        ok: false,
        error: e.message || 'לא ידוע',
        retryable: isRetryable,
        retryCount,
        steps: [],
      });
      if (isRetryable) {
        showToast?.(`שגיאה בהשקה — מנסה שוב (${retryCount + 1}/3)...`);
        setTimeout(() => handleLaunch(product, retryCount + 1), 1500 * (retryCount + 1));
        return;
      }
      showToast?.('שגיאה בהשקה: ' + (e.message || 'לא ידוע'));
    } finally {
      setLaunching(false);
    }
  }, [marketer, products, clicks, showToast, onLaunchComplete]);

  // פרסום מוצר לערוצים מחוברים או LikeLink2 פנימי
  const handlePublish = useCallback(async (product, provider = null) => {
    if (!product) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const body = {
        mode: 'publish',
        productId: product.id,
      };
      if (provider) {
        body.provider = provider;
      }

      const response = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${window.__likelink?.token || ''}` },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setPublishResult(result);
      if (result.ok) {
        if (result.status === 'PUBLISHED' && result.provider === 'likelink2') {
          showToast?.('המוצר פורסם ב-LikeLink2 בהצלחה! 🚀');
        } else if (result.status === 'ASSISTED') {
          showToast?.('המוצר מוכן לפרסום — השתמש בכלים להלן 📋');
        } else if (result.status === 'PROCESSING') {
          showToast?.('הפרסום נשלח לערוצים מחוברים ⏳');
        } else if (result.status === 'CONNECT_REQUIRED') {
          showToast?.('התחבר לשירות חיצוני דרך ההגדרות');
        } else {
          showToast?.('המוצר פורסם בהצלחה 🚀');
        }
      } else {
        showToast?.(result.error || 'שגיאה בפרסום');
      }
    } catch (e) {
      setPublishResult({ ok: false, error: e.message || 'שגיאה בפרסום' });
      showToast?.('שגיאה בפרסום: ' + (e.message || 'לא ידוע'));
    } finally {
      setPublishing(false);
    }
  }, [marketer, products, showToast]);

  // Trust verification — calls the server-side verify endpoint
  const handleVerify = useCallback(async (product) => {
    if (!product) return;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const body = { productId: product.id };
      const response = await fetch('/api/store?mode=verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + (window.__likelink?.token || '') },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setVerificationResult(result);
    } catch (e) {
      setVerificationResult({ ok: false, error: String(e.message || e) });
    } finally {
      setVerifying(false);
    }
  }, [marketer]);

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

  // טאבים — מגדרים לכל המוצרים המבוקשים מהעיצוב
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', color: '#6C4CF1', icon: <Activity size={14} /> },
    { id: 'intelligence', label: 'Product Intelligence', color: '#6C4CF1', icon: <Lightbulb size={14} /> },
    { id: 'ugc', label: 'UGC AI', color: '#E86A9E', icon: <Video size={14} /> },
    { id: 'content', label: 'Content Studio', color: '#C9A86C', icon: <Sparkles size={14} /> },
    { id: 'launch', label: 'Launch', color: '#00C896', icon: <Rocket size={14} /> },
    { id: 'publish', label: 'Connections', color: '#3B82F6', icon: <Globe size={14} /> },
    { id: 'trust', label: 'Trust & Verification', color: '#8B5CF6', icon: <Shield size={14} /> },
    { id: 'trends', label: 'Live Trends', color: '#E86A9E', icon: <TrendingUp size={14} /> },
    { id: 'reach', label: 'Reach/Performance', color: '#3B82F6', icon: <BarChart2 size={14} /> },
    { id: 'autopilot', label: 'AutoPilot', color: '#00C896', icon: <Zap size={14} /> },
    { id: 'recommendations', label: 'AI Recommendations', color: '#7C4DBE', icon: <Brain size={14} /> },
    { id: 'top', label: 'Top Products', color: '#E86A9E', icon: <PieChart size={14} /> },
    { id: 'community', label: 'Community', color: '#35D354', icon: <Users size={14} /> },
    { id: 'whatsapp', label: 'WhatsApp', color: '#35D354', icon: <MessageCircle size={14} /> },
  ];

  // הצגת רשימת מוצרים (כשאין מוצר נבחר)
  if (!hasProduct) {
    return (
      <div className="pb-6">
        {/* Hero Section */}
        <div className="rounded-2xl p-6 mb-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1f40 0%, #111327 100%)', border: '1px solid rgba(120,130,255,0.15)' }}>
          <div className="absolute top-0 right-0 w-32 h-32 opacity-20" style={{ background: 'radial-gradient(circle, #6C4CF1 0%, transparent 70%)' }} />
          <div className="relative z-10">
            <h2 className="disp text-2xl font-bold mb-1" style={{ color: '#e8ecff' }}>{t('sell.studioTitle')} {marketer?.name?.split(' ')[0]}</h2>
            <p className="text-sm mb-4" style={{ color: '#8a93d8' }}>הסטודיו החכם שלך ל-UGC, תוכן ופרסום אוטונומי</p>
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(108,76,241,0.2)', color: '#b38dff' }}>🤖 AI Content</span>
              <span className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(59,130,246,0.2)', color: '#7aa3ff' }}>📊 Growth OS</span>
              <span className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,200,150,0.2)', color: '#34d399' }}>🚀 AutoPilot</span>
              <span className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(232,106,158,0.2)', color: '#f0a3c9' }}>🎬 Video/UGC</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        {marketer && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{myProducts.length}</p>
              <p className="text-[10px] text-muted">מוצרים</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <p className="text-lg font-bold" style={{ color: '#00C896' }}>{(sales || []).filter(s => s.marketerId === marketer.id).length}</p>
              <p className="text-[10px] text-muted">מכירות</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <p className="text-lg font-bold" style={{ color: '#E86A9E' }}>{studioHealth?.grade || '—'}</p>
              <p className="text-[10px] text-muted">ציון</p>
            </div>
          </div>
        )}

        {/* Product List */}
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
                          style={{ background: trend.momentum === 'verified' ? '#00C89620' : '#6C4CF120', color: trend.momentum === 'verified' ? '#00C896' : '#6C4CF1' }}>
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
      {/* Hero Header for Selected Product */}
      <div className="rounded-2xl p-5 mb-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1f40 0%, #111327 100%)', border: '1px solid rgba(120,130,255,0.15)' }}>
        <div className="absolute top-0 left-0 w-40 h-40 opacity-10" style={{ background: 'radial-gradient(circle, #7aa3ff 0%, transparent 70%)' }} />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0" style={{ border: '2px solid rgba(122,163,255,0.3)' }}>
            <ProductThumb p={product} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="disp text-lg font-semibold truncate" style={{ color: '#e8ecff' }}>{product.title}</h3>
              {product.status === 'approved' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#00C89620', color: '#00C896' }}>APPROVED</span>
              )}
            </div>
            <p className="text-xs" style={{ color: '#8a93d8' }}>{categoryLabel(product.category)} · {money(product.price, lang)} · {product.clicks || 0} קליקים</p>
          </div>
          <button
            onClick={clearSelection}
            className="tap w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <X size={14} style={{ color: '#c5cbf5' }} />
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {cap.status === CAPABILITY_STATUS.PROCESSING && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(122,163,255,0.1)', border: '1px solid rgba(122,163,255,0.2)' }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: '#7aa3ff' }}>מעבד...</span>
        </div>
      )}

      {/* טאבים — עם אייקונים */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="tap shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all"
              style={{
                background: isActive ? `${tab.color}25` : 'var(--bg-elevated)',
                color: isActive ? tab.color : 'var(--text-muted)',
                border: `1px solid ${isActive ? tab.color : 'var(--border)'}`,
                boxShadow: isActive ? `0 4px 12px ${tab.color}30` : 'none',
              }}
            >
              {React.cloneElement(tab.icon, { size: 14 })}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* גוף הטאב */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {/* Dashboard — overview of all capabilities */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            product={product}
            marketer={marketer}
            myProducts={myProducts}
            productTrends={productTrends}
            sales={sales}
            clicks={clicks}
            studioHealth={studioHealth}
            CAPABILITY_STATUS={CAPABILITY_STATUS}
            Loader2={Loader2}
            Lightbulb={Lightbulb}
            Rocket={Rocket}
            TrendingUp={TrendingUp}
            Share2={Share2}
            Copy={Copy}
            generateWhatsappMessage={generateWhatsappMessage}
            openWhatsapp={openWhatsapp}
            copyToClipboard={copyToClipboard}
            clearSelection={clearSelection}
            selectProduct={selectProduct}
          />
        )}

        {/* Growth OS — main autonomous growth dashboard */}
        {activeTab === 'growth' && (
          <GrowthOSTab product={product} marketer={marketer} products={myProducts} clicks={clicks} sales={sales} showToast={showToast} />
        )}

        {/* Product Intelligence */}
        {activeTab === 'intelligence' && (
          <ProductIntelligenceTab product={product} cap={cap} extractProductInfo={extractProductInfo} Lightbulb={Lightbulb} Loader2={Loader2} />
        )}

        {/* UGC AI */}
        {activeTab === 'ugc' && (
          <UGCTab product={product} marketer={marketer} canRecord={canRecord} CAPABILITY_STATUS={CAPABILITY_STATUS} Video={Video} Loader2={Loader2} showToast={showToast} generateContent={generateContent} />
        )}

        {/* Launch — תמיד זמין, לא תלוי ב-cap */}
        {activeTab === 'launch' && (
          <LaunchTab product={product} launchResult={launchResult} launching={launching} handleLaunch={handleLaunch} CheckCircle2={CheckCircle2} Rocket={Rocket} Loader2={Loader2} />
        )}

        {/* Content Studio */}
        {activeTab === 'content' && (
          <ContentStudioTab product={product} cap={cap} generateContent={generateContent} copyToClipboard={copyToClipboard} setVideoProduct={setVideoProduct} canRecord={canRecord} CAPABILITY_STATUS={CAPABILITY_STATUS} Video={Video} Loader2={Loader2} />
        )}

        {/* Video/UGC (legacy compatibility) */}
        {activeTab === 'video' && (
          <VideoUGCTab product={product} marketer={marketer} canRecord={canRecord} CAPABILITY_STATUS={CAPABILITY_STATUS} Video={Video} Loader2={Loader2} showToast={showToast} />
        )}

        {/* Live Trends */}
        {activeTab === 'trends' && (
          <TrendsTab product={product} productTrends={productTrends} CheckCircle2={CheckCircle2} />
        )}

        {/* Reach/Performance */}
        {activeTab === 'reach' && (
          <ReachPerformanceTab product={product} marketer={marketer} sales={sales} clicks={clicks} myProducts={myProducts} BarChart2={BarChart2} Globe={Globe} />
        )}

        {/* AutoPilot */}
        {activeTab === 'autopilot' && (
          <AutoPilotTab product={product} marketer={marketer} CAPABILITY_STATUS={CAPABILITY_STATUS} Zap={Zap} Loader2={Loader2} />
        )}

        {/* AI Recommendations */}
        {activeTab === 'recommendations' && (
          <RecommendationsTab product={product} marketer={marketer} myProducts={myProducts} sales={sales} Brain={Brain} Target={Target} />
        )}

        {/* Top Products */}
        {activeTab === 'top' && (
          <TopProductsTab myProducts={myProducts} productTrends={productTrends} sales={sales} clicks={clicks} PieChart={PieChart} />
        )}

        {/* Community */}
        {activeTab === 'community' && (
          <CommunityTab marketer={marketer} myProducts={myProducts} sales={sales} Users={Users} Share2={Share2} />
        )}

         {/* WhatsApp */}
         {activeTab === 'whatsapp' && (
           <WhatsAppTab product={product} whatsappDraft={whatsappDraft} copied={copied} generateWhatsappMessage={generateWhatsappMessage} copyToClipboard={copyToClipboard} openWhatsapp={openWhatsapp} setWhatsappDraft={setWhatsappDraft} marketer={marketer} />
         )}

         {/* Connections / Publish Center */}
         {activeTab === 'publish' && (
           <PublishCenterTab product={product} marketer={marketer} brandChannelsConfigured={brandChannelsConfigured} publishResult={publishResult} publishing={publishing} handlePublish={handlePublish} Globe={Globe} Rocket={Rocket} Loader2={Loader2} Copy={Copy} Share2={Share2} showToast={showToast} />
         )}
         {activeTab === 'trust' && (
           <TrustVerificationTab product={product} verifying={verifying} verificationResult={verificationResult} handleVerify={handleVerify} Shield={Shield} CheckCircle2={CheckCircle2} Loader2={Loader2} Copy={Copy} />
         )}

       </div>
    </div>
  );
}

// Dashboard tab — overview card grid
const DashboardTab = ({
  product, marketer, myProducts, productTrends, sales, clicks,
  studioHealth, CAPABILITY_STATUS, Loader2, Lightbulb, Rocket,
  TrendingUp, Share2, Copy, generateWhatsappMessage, openWhatsapp,
  copyToClipboard, clearSelection, selectProduct
}) => {
  const [loadingStates, setLoadingStates] = React.useState({});

  const handleQuickAction = useCallback((action, product) => {
    if (action === 'whatsapp') return openWhatsapp(product);
    if (action === 'copy') return Copy;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{myProducts.length}</p>
          <p className="text-[10px] text-muted mt-0.5">מוצרים פעילים</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-bold" style={{ color: '#00C896' }}>{(sales || []).filter(s => s.marketerId === marketer?.id).length}</p>
          <p className="text-[10px] text-muted mt-0.5">מכירות השבוע</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-bold" style={{ color: '#E86A9E' }}>
            {myProducts.reduce((sum, p) => sum + (p.clicks || 0), 0)}
          </p>
          <p className="text-[10px] text-muted mt-0.5">סה״כ קליקים</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-bold" style={{ color: '#6C4CF1' }}>{studioHealth?.grade || '—'}</p>
          <p className="text-[10px] text-muted mt-0.5">ציון סטודיו</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <button
          onClick={() => selectProduct(myProducts[0])}
          disabled={myProducts.length === 0}
          className="tap py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 disabled:opacity-50"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Lightbulb size={14} style={{ color: '#6C4CF1' }} />
          ניתוח מוצר
        </button>
        <button
          onClick={() => openWhatsapp(myProducts[0])}
          disabled={myProducts.length === 0}
          className="tap py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 disabled:opacity-50"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Share2 size={14} style={{ color: '#35D354' }} />
          שיתוף WhatsApp
        </button>
        <button
          onClick={() => copyToClipboard(generateWhatsappMessage(myProducts[0]))}
          disabled={myProducts.length === 0}
          className="tap py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 disabled:opacity-50"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Copy size={14} style={{ color: '#6C4CF1' }} />
          העתק הודעה
        </button>
      </div>

      {/* Publish Quick Action */}
      {myProducts.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => { setActiveTab('publish'); }}
            disabled={!myProducts.length}
            className="tap w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #00C896 0%, #0D9488 55%, #0F766E 100%)',
              color: '#fff',
            }}
          >
            <Rocket size={14} />
            פרסם מוצר ל-LikeLink2
          </button>
        </div>
      )}

      {/* Top Products quick view */}
      {myProducts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted mb-2">🏆 מוצרים מובילים</p>
          <div className="flex flex-col gap-2">
            {productTrends.slice(0, 5).map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-2 p-2 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                  <ProductThumb p={item.product} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{item.product.title}</p>
                  <p className="text-[10px] text-muted">ציון {Math.round(item.score)} · {item.momentum}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#00C89620', color: '#00C896' }}>
                  #{item.rank || productTrends.indexOf(item) + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sales quick view */}
      {sales && sales.filter(s => s.marketerId === marketer?.id).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted mb-2">📈 מכירות אחרונות</p>
          <div className="flex flex-col gap-1">
            {sales.filter(s => s.marketerId === marketer?.id).slice(0, 3).map((s, i) => (
              <div key={s.id || i} className="flex items-center justify-between p-2 rounded-xl text-[11px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <span className="truncate">{s.productTitle || s.productId || 'מכירה'}</span>
                <span style={{ color: '#00C896' }}>₪{(s.marketerNet || s.commissionAmount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Product Intelligence tab (extracted)
const ProductIntelligenceTab = ({ product, cap, extractProductInfo, Lightbulb, Loader2 }) => (
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
);

// UGC AI tab — combines video/UGC and content creation
const UGCTab = ({ product, marketer, canRecord, CAPABILITY_STATUS, Video, Loader2, showToast, generateContent }) => {
  const [ugcStatus, setUgcStatus] = React.useState(CAN_RECORD_VIDEO ? CAPABILITY_STATUS.READY : CAPABILITY_STATUS.UNAVAILABLE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2"><Video size={16} style={{ color: '#E86A9E' }} />UGC AI</p>
      </div>

      {/* UGC Generation */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">UGC VIDEO GENERATION</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Browser Recorder</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: canRecord ? '#00C89620' : '#FEE2E2', color: canRecord ? '#00C896' : '#991B1B' }}>
            {canRecord ? 'READY' : 'UNAVAILABLE'}
          </span>
        </div>
        <p className="text-[11px] text-muted mt-1">
          {canRecord
            ? 'Canvas + MediaRecorder → WebM. No external AI provider.'
            : 'Browser does not support video recording. Fallback: script-based caption export.'
          }
        </p>
        {!canRecord && (
          <p className="text-[10px] text-faint mt-1">Fallback: complete creative package with script, captions, and edit spec ready for external renderer.</p>
        )}
      </div>

      {/* AI Content Pack */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">AI CONTENT PACK</p>
        <button
          onClick={() => generateContent(product)}
          className="tap w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: '#E86A9E', color: '#fff' }}
        >
          <Sparkles size={14} />
          צור חבילת תוכן למוצר
        </button>
        <p className="text-[10px] text-muted mt-1 text-center">Reels, Stories, Posts, TikTok — באחד לחיצה</p>
      </div>
    </div>
  );
};

// Reach/Performance tab
const ReachPerformanceTab = ({ product, marketer, sales, clicks, myProducts, BarChart2, Globe }) => {
  const [reachData, setReachData] = React.useState(null);

  React.useEffect(() => {
    if (!product || !sales || !clicks) return;
    try {
      const { getReachMetrics } = require('../../lib/cloud/discovery.js');
      setReachData(getReachMetrics({ product, sales, clicks }));
    } catch (e) { /* best-effort */ }
  }, [product, sales, clicks]);

  const allClicks = myProducts.reduce((sum, p) => sum + (p.clicks || 0), 0);
  const allSales = sales.filter(s => s.marketerId === marketer?.id).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold flex items-center gap-2"><BarChart2 size={16} style={{ color: '#3B82F6' }} />Reach / Performance</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-lg font-bold" style={{ color: '#3B82F6' }}>{allClicks}</p>
          <p className="text-[10px] text-muted mt-0.5">סה״כ קליקים</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-lg font-bold" style={{ color: '#00C896' }}>{allSales}</p>
          <p className="text-[10px] text-muted mt-0.5">מכירות מאושרות</p>
        </div>
      </div>

      {reachData && reachData.verified ? (
        <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-[11px] text-muted">Reach (verified): {reachData.reach}</p>
          <p className="text-[11px] text-muted">CTR: {reachData.ctr}%</p>
          <p className="text-[11px] text-muted">Conversion rate: {reachData.cvr}%</p>
        </div>
      ) : (
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-[11px] text-muted">מדדי הגעה זמינים כאשר יש נתונים מדויקים (קליקים ומכירות ממותגים למוצר).</p>
        </div>
      )}

      <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Globe size={12} /> מקורות פרסום</p>
        <div className="flex flex-wrap gap-1 text-[10px]">
          <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>Likelink Feed</span>
          <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>WhatsApp Share</span>
          <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>Creator Profile</span>
        </div>
      </div>
    </div>
  );
};

// AutoPilot tab
const AutoPilotTab = ({ product, marketer, CAPABILITY_STATUS, Zap, Loader2 }) => {
  const [config, setConfig] = React.useState(null);
  const [status, setStatus] = React.useState({ overall: 'IDLE' });

  React.useEffect(() => {
    try {
      const { getAutoPilotConfig } = require('../../lib/cloud/autoPilot.js');
      const cfg = getAutoPilotConfig(marketer);
      setConfig(cfg);
    } catch (e) { /* best-effort */ }
  }, [marketer]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold flex items-center gap-2"><Zap size={16} style={{ color: '#00C896' }} />AutoPilot</p>

      {config && (
        <>
          <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted">STATUS</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#00C89620', color: '#00C896' }}>
                {status.overall}
              </span>
            </div>
            <p className="text-[11px] text-muted">אוטומציה של פרסום והתפתחות המוצר על בסיס ביצועים אמיתיים.</p>
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold text-muted mb-2">CONFIGURATION</p>
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between"><span className="text-muted">קצב פרסום</span><span>{config.rate || 'בפעילות'}</span></div>
              <div className="flex justify-between"><span className="text-muted">שעת פיקה</span><span>{config.peakHour !== undefined ? config.peakHour + ':00' : 'אוטומטי'}</span></div>
              <div className="flex justify-between"><span className="text-muted">יעד קליקים/יום</span><span>{config.target || 'ללא הגבלה'}</span></div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-[10px] text-muted">AutoPilot מפעיל את ההשקה וההתפשטות באופן אוטונומי, רק כשיש לך מוצרים מאושרים ופעילים.</p>
      </div>
    </div>
  );
};

// AI Recommendations tab
const RecommendationsTab = ({ product, marketer, myProducts, sales, Brain, Target }) => {
  const [recommendations, setRecommendations] = React.useState(null);

  React.useEffect(() => {
    try {
      const { getAIRecommendations } = require('../../lib/cloud/intelligenceContext.mjs');
      if (product) {
        setRecommendations(getAIRecommendations({ product, marketer, myProducts, sales }));
      }
    } catch (e) { /* best-effort */ }
  }, [product, marketer, myProducts, sales]);

  if (!product) {
    return (
      <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-xs text-muted">בחרי מוצר כדי לקבל המלצות מותאמות אישית</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold flex items-center gap-2"><Brain size={16} style={{ color: '#7C4DBE' }} />AI Recommendations</p>

      {recommendations ? (
        <div className="flex flex-col gap-3">
          {recommendations.map((rec, i) => (
            <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: '#6C4CF1' }}>{rec.type || 'recommendation'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  {rec.priority || 'medium'}
                </span>
              </div>
              <p className="text-sm">{rec.text || rec.title}</p>
              {rec.action && (
                <button className="tap mt-2 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: '#6C4CF1', color: '#fff' }}>
                  {rec.action}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">טוען המלצות...</p>
      )}
    </div>
  );
};

// Top Products tab
const TopProductsTab = ({ myProducts, productTrends, sales, clicks, PieChart }) => {
  const sortedProducts = useMemo(() => {
    return [...myProducts].sort((a, b) => {
      const aScore = (a.clicks || 0) * 2 + (sales.filter(s => s.productId === a.id || s.product === a.id).length) * 10;
      const bScore = (b.clicks || 0) * 2 + (sales.filter(s => s.productId === b.id || s.product === b.id).length) * 10;
      return bScore - aScore;
    });
  }, [myProducts, sales]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold flex items-center gap-2"><PieChart size={16} style={{ color: '#E86A9E' }} />Top Products</p>

      {sortedProducts.length === 0 ? (
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs text-muted">אין מוצרים להצגה</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedProducts.map((product, idx) => {
            const trend = productTrends.find(p => p.product.id === product.id);
            const productSales = sales.filter(s => s.productId === product.id || s.product === product.id);
            const clicksTotal = product.clicks || 0;
            const salesCount = productSales.length;
            const score = clicksTotal * 2 + salesCount * 10;

            return (
              <div key={product.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg" style={{ background: 'var(--bg-subtle)' }}>
                  <span className="text-xs font-bold" style={{ color: idx < 3 ? '#FFB347' : 'var(--text-muted)' }}>
                    #{idx + 1}
                  </span>
                </div>
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                  <ProductThumb p={product} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{product.title}</p>
                  <p className="text-[10px] text-muted">
                    {clicksTotal} קליקים · {salesCount} מכירות · ציון {score}
                  </p>
                </div>
                {trend && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#00C89620', color: '#00C896' }}>
                    {trend.momentum}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Community tab
const CommunityTab = ({ marketer, myProducts, sales, Users, Share2 }) => {
  const [communityData, setCommunityData] = React.useState(null);

  React.useEffect(() => {
    try {
      const { getCommunityMetrics } = require('../../lib/cloud/social.js');
      if (marketer) {
        setCommunityData(getCommunityMetrics(marketer));
      }
    } catch (e) { /* best-effort */ }
  }, [marketer]);

  const myLink = `${window.location.origin}/u/${marketer?.slug || marketer?.id}`;
  const communityProducts = myProducts.filter(p => p.boostedUntil && p.boostedUntil > Date.now());

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold flex items-center gap-2"><Users size={16} style={{ color: '#35D354' }} />Community</p>

      <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">פרופיל יוצרים</p>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
            {marketer?.avatarUrl ? <img src={marketer.avatarUrl} alt={marketer.name} className="w-full h-full object-cover" /> : null}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{marketer?.name || 'משתמש'}</p>
            <p className="text-xs text-muted truncate">{marketer?.email}</p>
          </div>
        </div>
      </div>

      {communityData && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-lg font-bold" style={{ color: '#35D354' }}>{communityData.followers || 0}</p>
            <p className="text-[10px] text-muted mt-0.5">עוקבים</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-lg font-bold" style={{ color: '#6C4CF1' }}>{communityData.reach || 0}</p>
            <p className="text-[10px] text-muted mt-0.5">הגעה</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-lg font-bold" style={{ color: '#E86A9E' }}>{communityData.engagementRate || 0}%</p>
            <p className="text-[10px] text-muted mt-0.5">אינטראקציה</p>
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
        <p className="text-xs font-semibold mb-2">קישור אישי לשיתוף</p>
        <div className="flex items-center gap-2">
          <code className="text-[10px] text-muted truncate flex-1">{myLink}</code>
          <button
            onClick={() => navigator.clipboard.writeText(myLink)}
            className="tap px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <Share2 size={10} />
          </button>
        </div>
      </div>

      {communityProducts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted mb-2">מוצרים מבוססים</p>
          <div className="flex flex-col gap-1">
            {communityProducts.slice(0, 3).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                <span className="truncate flex-1">{p.title}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#6C4CF120', color: '#6C4CF1' }}>boosted</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

// Publish Center tab — connections and one-click publish
const PublishCenterTab = ({ product, marketer, brandChannelsConfigured, publishResult, publishing, handlePublish, Globe, Rocket, Loader2, Copy, Share2, showToast }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [showConnectAssist, setShowConnectAssist] = useState(false);
  const connectedProviders = [
    { id: 'telegram', label: 'Telegram Bot', icon: '✈️' },
    { id: 'facebook', label: 'Facebook Shop', icon: '📘' },
    { id: 'instagram', label: 'Instagram Shop', icon: '📷' },
    { id: 'google', label: 'Google Merchant', icon: '🔍' },
    { id: 'tiktok', label: 'TikTok Shop', icon: '🎵' },
    { id: 'whatsapp', label: 'WhatsApp Channel', icon: '💬' },
  ];
  const connectedCount = brandChannelsConfigured ? 1 : 0;

  const publicUrl = product ? `${window.location.origin}/p/${encodeURIComponent(product.id)}` : null;
  const shareUrls = publishResult?.share || {};

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      showToast?.('הועתק ללוחית ❱❱');
    } catch {
      showToast?.(text);
    }
  }, [showToast]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) {
      copyToClipboard(publicUrl || publishResult?.publishedUrl || '');
      return;
    }
    try {
      await navigator.share({
        title: product?.title || 'מוצר מאסיסטיד',
        text: publishResult?.result?.caption || publishResult?.result?.captionTemplates?.he || product?.title || '',
        url: publishResult?.publishedUrl || publicUrl,
      });
    } catch {
      copyToClipboard(publishResult?.publishedUrl || publicUrl || '');
    }
  }, [product, publishResult, publicUrl, copyToClipboard]);

  if (publishResult?.ok && (publishResult.status === 'PUBLISHED' || publishResult.status === 'PUBLISHED_INTERNAL')) {
    return (
      <div className="flex flex-col gap-4">
        {/* Success Banner */}
        <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981' }}>
          <Rocket size={20} style={{ color: '#10B981' }} />
          <div className="flex-1">
            <p className="text-xs font-bold text-green-400">
              {publishResult.status === 'PUBLISHED' && publishResult.provider === 'likelink2'
                ? 'פורסם ב-LikeLink2 בהצלחה!'
                : 'המוצר פורסם בהצלחה!'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">מזהה פרסום: {publishResult.publicationId || publishResult.idempotencyKey}</p>
          </div>
        </div>

        {/* Public URL */}
        {publishResult.publishedUrl && (
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold mb-2">🔗 כתובת ציבורית</p>
            <div className="flex items-center gap-2">
              <code className="text-[10px] break-all flex-1" style={{ color: '#3B82F6' }}>{publishResult.publishedUrl}</code>
              <button
                onClick={() => copyToClipboard(publishResult.publishedUrl)}
                className="tap p-1.5 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Share Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleNativeShare}
            className="tap py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <Share2 size={12} /> לשתף
          </button>
          {shareUrls?.whatsApp && (
            <a
              href={shareUrls.whatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="tap py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              💬 WhatsApp
            </a>
          )}
          {shareUrls?.telegram && (
            <a
              href={shareUrls.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="tap py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              ✈️ Telegram
            </a>
          )}
          {shareUrls?.email && (
            <a
              href={shareUrls.email}
              className="tap py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              📧 Email
            </a>
          )}
          {shareUrls?.copy && shareUrls.copy !== publishResult.publishedUrl && (
            <button
              onClick={() => copyToClipboard(shareUrls.copy)}
              className="tap py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Copy size={12} /> {copiedLink ? 'הועתק!' : 'העתק כיתובת'}
            </button>
          )}
        </div>

        {/* Caption */}
        {publishResult.result?.caption && (
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold mb-2">📄 כיתוב מוכן</p>
            <p className="text-xs text-muted whitespace-pre-wrap break-words">{publishResult.result.caption}</p>
            <button
              onClick={() => copyToClipboard(publishResult.result.caption)}
              className="tap mt-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Copy size={10} /> העתק כיתוב
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Internal Publishing Section — always available */}
      <div className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid #00C896' }}>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={18} style={{ color: '#00C896' }} />
          <span className="text-xs font-bold text-green-400">פרסום פנימי ל-LikeLink2</span>
        </div>
        <p className="text-[10px] text-muted mb-3">
          פרסם את המוצר ישירות ל-LikeLink2 — קבלת כתובת ציבורית, קישור מעקב, וכלים לשיתוף.
          אין צורך בחיבור חיצוני.
        </p>
        <button
          onClick={() => handlePublish(product)}
          disabled={publishing || !product}
          className="tap w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #00C896 0%, #0D9488 55%, #0F766E 100%)',
            color: '#fff',
          }}
        >
          {publishing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              פורסם...
            </>
          ) : (
            <>
              <Rocket size={14} />
              פרסם ל-LikeLink2
            </>
          )}
        </button>
      </div>

      {/* Brand Channels Status */}
      <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Globe size={16} style={{ color: '#3B82F6' }} />
          <span className="text-xs font-semibold">ערוצי מותג חיצוניים</span>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          brandChannelsConfigured
            ? 'bg-green-500/20 text-green-400'
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {brandChannelsConfigured ? `${connectedCount} מחוברים` : 'לא מחוברים'}
        </div>
      </div>

      {/* Connected Provider Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {connectedProviders.map((provider) => {
          const isConnected = brandChannelsConfigured && provider.id === 'telegram';
          return (
            <div
              key={provider.id}
              className="p-3 rounded-xl flex flex-col items-center gap-1.5"
              style={{
                background: isConnected ? 'var(--bg-elevated)' : 'var(--bg)',
                border: `1px solid ${isConnected ? '#3B82F6' : 'var(--border)'}`,
                opacity: isConnected ? 1 : 0.6,
              }}
            >
              <span className="text-lg">{provider.icon}</span>
              <span className="text-xs font-semibold">{provider.label}</span>
              {isConnected && (
                <span className="text-[10px] px-1.5 py-0.25 rounded-full bg-green-500/20 text-green-400">
                  מחובר
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* External Publish Button */}
      <div className="pt-2">
        <button
          onClick={() => brandChannelsConfigured ? handlePublish(product, 'external') : setShowConnectAssist(true)}
          disabled={publishing || !product || !brandChannelsConfigured}
          className="tap w-full py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{
            background: brandChannelsConfigured
              ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 55%, #1D4ED8 100%)'
              : 'linear-gradient(135deg, #6B7280 0%, #4B5563 55%, #374151 100%)',
            color: '#fff',
          }}
        >
          <Rocket size={14} />
          {brandChannelsConfigured ? 'פרסם לערוצים חיצוניים' : 'התחבר ערוצים חיצוניים קודם'}
        </button>
      </div>

      {/* Assisted Connection Fallback */}
      {showConnectAssist && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-2">אין לך ערוצים חיצוניים מחוברים.</p>
          <p className="text-[10px] text-muted mb-3">
            פרסם ל-LikeLink2 בחינם — אין צורך בחיבור חיצוני.
          </p>
        </div>
      )}

      {/* Publish Result Error */}
      {publishResult && !publishResult.ok && (
        <div className="p-3 rounded-xl text-[10px]" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #EF4444',
        }}>
          <p className="text-red-400 font-semibold">❌ {publishResult.error || 'שגיאה בפרסום'}</p>
        </div>
      )}
    </div>
  );
};


// Trust Verification tab
const TrustVerificationTab = ({ product, verifying, verificationResult, handleVerify, Shield, CheckCircle2, Loader2, Copy }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  const stateColors = {
    VERIFIED: { bg: 'rgba(16, 185, 129, 0.1)', border: '#10B981', text: 'text-green-400' },
    CHECK_REQUIRED: { bg: 'rgba(245, 158, 14, 0.1)', border: '#F59E0B', text: 'text-yellow-400' },
    REJECTED: { bg: 'rgba(239, 68, 68, 0.1)', border: '#EF4444', text: 'text-red-400' },
    EXPIRED: { bg: 'rgba(147, 51, 234, 0.1)', border: '#8B5CF6', text: 'text-purple-400' },
    SUSPENDED: { bg: 'rgba(245, 158, 14, 0.1)', border: '#F59E0B', text: 'text-yellow-400' },
    SOURCE_UNAVAILABLE: { bg: 'rgba(107, 114, 128, 0.1)', border: '#6B7280', text: 'text-gray-400' },
  };

  const currentState = verificationResult?.verification?.state || 'UNVERIFIED';
  const stateColor = stateColors[currentState] || stateColors.CHECK_REQUIRED;

  return (
    <div className="flex flex-col gap-4">
      {/* Verification Status Banner */}
      <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: stateColor.bg, border: '1px solid ' + stateColor.border }}>
        <Shield size={20} style={{ color: stateColor.border }} />
        <div className="flex-1">
          <p className={"text-xs font-bold " + stateColor.text}>
            {currentState}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {verificationResult?.verification?.reason || 'לחץ לאימות המוצר'}
          </p>
        </div>
      </div>

      {/* Verify Button */}
      <button
        onClick={() => handleVerify && handleVerify(product)}
        disabled={verifying || !product}
        className="tap w-full py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 55%, #6D28D9 100%)', color: '#fff' }}
      >
        {verifying ? <Loader2 size={16} className="animate-spin" /> : <Shield size={14} />}
        {verifying ? 'בודק...' : 'אמת מוצר בטחוני'}
      </button>

      {/* Verification Assertions */}
      {verificationResult?.verification && (
        <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-2">🔍 פרטי אימות</p>
          <div className="grid grid-cols-1 gap-1.5">
            {verificationResult.verification.assertions.map((a, i) => {
              const aColor = a.status === 'VERIFIED' ? '#10B981' : a.status === 'REJECTED' ? '#EF4444' : '#F59E0B';
              return (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted">{a.stage}</span>
                  <span className="text-[10px] font-semibold" style={{ color: aColor }}>{a.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trust Gate Report */}
      {verificationResult && verificationResult.trustGateReport && (
        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-2">🛡️ שער אמון</p>
          {verificationResult.discoveryEligible ? (
            <p className="text-xs text-green-400">המוצר זכאי לגילוי בקרב קונים ✅</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-red-400">המוצר לא זכאי לגילוי — נדרש תיקון</p>
              {verificationResult.trustGateReport.details?.map((d, i) => (
                <p key={i} className="text-[10px] text-muted">• {d.reason} → {d.fix}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Launch tab
const LaunchTab = ({ product, launchResult, launching, handleLaunch, CheckCircle2, Rocket, Loader2 }) => {
  const [retrying, setRetrying] = useState(false);
  const steps = launchResult?.steps || [];
  const doneCount = steps.filter((s) => s.status === 'DONE').length;
  const totalSteps = steps.length || 7;
  const progress = launchResult ? Math.round((doneCount / totalSteps) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold flex items-center gap-2"><Rocket size={16} style={{ color: '#00C896' }} />Launch this product</p>
        {launchResult && (
          <span className={`text-xs px-2 py-1 rounded-full ${launchResult.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {launchResult.ok ? 'השקה הושלמה' : 'לא השגת'}
          </span>
        )}
      </div>

      {launching && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted">מפעילה...</span>
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
            <div className="h-1.5 rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!launchResult && !launching && (
        <div className="flex flex-col gap-2">
          <button onClick={() => handleLaunch(product)} disabled={launching || !product} className="tap w-full py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: launching ? 'var(--bg-subtle)' : 'linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)', color: launching ? 'var(--text-muted)' : '#fff' }}>
            <Rocket size={16} />להפעיל את המוצר בקליק אחד
          </button>
          <p className="text-xs text-muted text-center">מפעילה SEO/OG, יוצרת קמפיין, ומבנית קישור מעקב</p>
        </div>
      )}

      {launchResult && (
        <div className="flex flex-col gap-2">
          <div className="p-3 rounded-xl" style={{ background: launchResult.ok ? 'var(--success-subtle)' : 'var(--bg-subtle)', border: `1px solid ${launchResult.ok ? 'var(--success)' : 'var(--border)'}` }}>
            <p className={`text-sm font-semibold ${launchResult.ok ? 'text-green-600' : 'text-red-600'}`}>{launchResult.ok ? '✅ המוצר הושק בהצלחה!' : '❌ ההשקה נכשלה'}</p>
            {launchResult.error && <p className="text-xs mt-1 text-muted">{launchResult.error}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold">צעדים בהפעלה:</p>
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {step.status === 'DONE' ? <CheckCircle2 size={12} style={{ color: '#00C896' }} /> : <span className="text-muted">○</span>}
                <span className={step.status === 'DONE' ? 'text-green-600' : 'text-muted'}>{step.step.replace(/_/g, ' ')} — {step.detail}</span>
              </div>
            ))}
          </div>

          {!launchResult.ok && !retrying && (
            <button
              onClick={() => { setRetrying(true); handleLaunch(product, 0); }}
              disabled={launching}
              className="tap w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
              style={{ background: '#6C4CF1', color: '#fff' }}
            >
              <Rocket size={12} />נסי שוב
            </button>
          )}
          {retrying && (
            <p className="text-xs text-muted text-center">מנסה שוב...</p>
          )}
        </div>
      )}
    </div>
  );
};

// Trends tab — verified data vs recommendation, with source/timestamp
const TrendsTab = ({ product, productTrends, CheckCircle2 }) => {
  const trend = productTrends.find(p => p.product.id === product.id);
  const now = Date.now();
  const dayMs = 86400000;

  return (
    <div>
      <p className="text-sm font-semibold flex items-center gap-2 mb-4"><TrendingUp size={16} style={{ color: '#E86A9E' }} />Trend Intelligence</p>
      {productTrends.length === 0 ? (
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs text-muted">אין עדיין נתונים מספיקים לזיהוי טרנדים</p>
          <p className="text-[10px] text-muted mt-1">נדרשים לפחות קליקים או מכירות מדודים בשבוע האחרון</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {productTrends.map((item, idx) => {
            const isSelected = item.product.id === product.id;
            const isVerified = (item.signals?.sales7d || 0) > 0;
            const isRecommendation = !isVerified && (item.signals?.clicks7d || 0) > 0;
            const freshness = item.product?.createdAt
              ? Math.max(0, Math.round((now - Number(item.product.createdAt)) / dayMs))
              : null;

            return (
              <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: isSelected ? '#E86A9E20' : 'var(--bg)', border: `1px solid ${isSelected ? '#E86A9E' : 'var(--border)'}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{item.product.title}</p>
                     {isVerified && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#00C89620', color: '#00C896' }}>verified</span>}
                     {isRecommendation && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#C9A86C20', color: '#C9A86C' }}>recommendation</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    ציון: {item.score} · {item.momentum}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {(item.signals?.clicks7d || 0) > 0 && (
                      <span className="text-[10px] text-muted">{item.signals.clicks7d} קליקים (7 ימים)</span>
                    )}
                    {(item.signals?.sales7d || 0) > 0 && (
                      <span className="text-[10px] text-muted">{item.signals.sales7d} מכירות (7 ימים)</span>
                    )}
                    {freshness !== null && (
                      <span className="text-[10px] text-muted">נוצר לפני {freshness} ימים</span>
                    )}
                  </div>
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
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] text-muted">
              מקור: נתונים פנימיים (קליקים ומכירות מדודים באפליקציה)
              {trend.product?.createdAt && (
                <span> · עודכן: {new Date(Number(trend.product.createdAt)).toLocaleDateString('he-IL')}</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Growth OS tab — main autonomous growth dashboard
const GrowthOSTab = ({ product, marketer, products, clicks, sales, showToast }) => {
  const [opportunity, setOpportunity] = useState(null);
  const [creative, setCreative] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [learning, setLearning] = useState(null);

  React.useEffect(() => {
    if (!product) return;
    try {
      const { createTrend } = require('../../lib/cloud/trendRadar.js');
      const { evaluateOpportunity } = require('../../lib/cloud/opportunityEngine.js');
      const { createCreativeVariant } = require('../../lib/cloud/creativeMutation.js');
      const trend = createTrend({ state: 'RISING', category: product.category, platform: 'likelink_feed', signal: 'category_momentum', confidence: 'ESTIMATED' });
      const opp = evaluateOpportunity({ product, trend, creativeAvailability: true, connectionStates: { web: 'CONNECTED' } });
      setOpportunity(opp);
      const cv = createCreativeVariant({ product, trend, language: 'he', creativeType: 'post' });
      setCreative(cv);
      const { resolveDistributionState } = require('../../lib/cloud/distributionIntelligence.js');
      setDistribution({ state: resolveDistributionState({ intent: 'share', provider: 'web' }), channel: 'web' });
      const { computeWinningPatterns } = require('../../lib/cloud/growthLearning.js');
      setLearning(computeWinningPatterns(clicks || []));
    } catch (e) {
      // best-effort — growth OS is additive
    }
  }, [product, clicks]);

  if (!product) {
    return (
      <div className="flex flex-col gap-4">
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-subtle)' }}>
          <p className="text-xs text-muted">בחרי מוצר כדי לצפות ב-Growth OS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <Brain size={18} style={{ color: '#6C4CF1' }} />
        <p className="text-sm font-semibold">Autonomous Growth OS</p>
      </div>

      {/* Opportunity */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">OPPORTUNITY ENGINE</p>
        {opportunity ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: opportunity.decision === 'ACT' ? '#10B981' : opportunity.decision === 'WATCH' ? '#3B82F6' : '#6B7280' }}>
                {opportunity.decision}
              </span>
              <span className="text-[10px] text-muted">{opportunity.confidence}</span>
            </div>
            <p className="text-[11px] text-muted">{opportunity.reason} · score: {Math.round(opportunity.total || 0)}</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {Object.entries(opportunity.scores || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-semibold">{Math.round(v || 0)}</span></div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">מערכת מזהה הזדמנויות...</p>
        )}
      </div>

      {/* Creative */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">CREATIVE MUTATION</p>
        {creative ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{creative.title}</p>
            <p className="text-xs italic" style={{ color: 'var(--accent)' }}>"{creative.hooks?.[0]?.text || creative.script?.hook || ''}"</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(creative.hashtags || []).slice(0, 6).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>{tag}</span>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-1">type: {creative.creativeType} · aspect: {creative.aspectRatio}</p>
          </div>
        ) : (
          <p className="text-xs text-muted">יוצר וריאציות יצירה...</p>
        )}
      </div>

      {/* Distribution */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">DISTRIBUTION</p>
        {distribution ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{distribution.channel}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: distribution.state === 'READY' ? '#00C89620' : distribution.state === 'ASSISTED' ? '#C9A86C20' : '#FEE2E2', color: distribution.state === 'READY' ? '#00C896' : distribution.state === 'ASSISTED' ? '#C9A86C' : '#991B1B' }}>
                {distribution.state}
              </span>
            </div>
            <p className="text-[11px] text-muted">סטטוס הערוץ לפרסום אוטונומי</p>
          </div>
        ) : (
          <p className="text-xs text-muted">בודק זמינות ערוצים...</p>
        )}
      </div>

      {/* Learning */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">LEARNING LOOP</p>
        {learning ? (
          <div className="flex flex-col gap-2">
            {learning.hooks?.[0] && <p className="text-[11px]"><span className="text-muted">הוק מוביל:</span> <span className="font-semibold">{learning.hooks[0].key}</span> · cvr: {learning.hooks[0].cvr}%</p>}
            {learning.formats?.[0] && <p className="text-[11px]"><span className="text-muted">פורמט מוביל:</span> <span className="font-semibold">{learning.formats[0].key}</span> · {learning.formats[0].conversions} המרות</p>}
            {learning.channels?.[0] && <p className="text-[11px]"><span className="text-muted">ערוץ מוביל:</span> <span className="font-semibold">{learning.channels[0].key}</span> · {learning.channels[0].conversions} המרות</p>}
            {!learning.hooks?.length && !learning.formats?.length && !learning.channels?.length && (
              <p className="text-[11px] text-muted">אין מספיק נתוני ביצוע למידה — המערכת לומדת מהנתונים האמיתיים</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">מנתח ביצועים...</p>
        )}
      </div>

      {/* Video / Editing / Voiceover / Language — truthful states */}
      <VideoEditingTab product={product} />
      <VoiceoverTab product={product} creative={creative} />
      <LanguageCapabilitiesTab product={product} />
    </div>
  );
};

// Video Editing Tab — truthful edit spec
const VideoEditingTab = ({ product }) => {
  const [spec, setSpec] = React.useState(null);
  React.useEffect(() => {
    if (!product) return;
    try {
      const { createCreativeVariant } = require('../../lib/cloud/creativeMutation.js');
      const { buildEditSpec } = require('../../lib/cloud/videoEditing.js');
      const cv = createCreativeVariant({ product, language: 'he', creativeType: 'reel' });
      if (cv) setSpec(buildEditSpec({ creative: cv, product }));
    } catch (e) { /* best-effort */ }
  }, [product]);

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold text-muted mb-2">VIDEO EDITING</p>
      {spec ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{spec.aspectRatio}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: spec.status === 'READY' ? '#00C89620' : '#FEE2E2', color: spec.status === 'READY' ? '#00C896' : '#991B1B' }}>
              {spec.status}
            </span>
          </div>
          <p className="text-[11px] text-muted">{spec.scenes?.length || 0} scenes · {Math.round((spec.totalDurationMs || 0) / 1000)}s</p>
          {(spec.scenes || []).slice(0, 3).map((s, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="font-semibold">{s.type}</span>
              <span className="text-muted">{s.durationMs}ms</span>
            </div>
          ))}
          {spec.blockers?.length > 0 && <p className="text-[10px] text-faint">Blockers: {spec.blockers.join(', ')}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-muted">Edit spec not generated yet.</p>
      )}
    </div>
  );
};

// Voiceover Tab — truthful voiceover script state
const VoiceoverTab = ({ product, creative }) => {
  const [voiceover, setVoiceover] = React.useState(null);
  React.useEffect(() => {
    if (!product || !creative) return;
    try {
      const { generateVoiceoverScript } = require('../../lib/cloud/voiceoverScript.js');
      setVoiceover(generateVoiceoverScript({ creative, product }));
    } catch (e) { /* best-effort */ }
  }, [product, creative]);

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold text-muted mb-2">VOICEOVER</p>
      {voiceover ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{voiceover.language}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: voiceover.status === 'VOICEOVER_READY' ? '#00C89620' : '#FEE2E2', color: voiceover.status === 'VOICEOVER_READY' ? '#00C896' : '#991B1B' }}>
              {voiceover.status}
            </span>
          </div>
          <p className="text-[11px] text-muted">{voiceover.lines?.length || 0} lines · {Math.round((voiceover.totalDurationMs || 0) / 1000)}s</p>
          {voiceover.blockers?.length > 0 && <p className="text-[10px] text-faint">Blockers: {voiceover.blockers.join(', ')}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-muted">Voiceover script not generated yet.</p>
      )}
    </div>
  );
};

// Language Capabilities Tab — truthful matrix
const LanguageCapabilitiesTab = ({ product }) => {
  const [caps, setCaps] = React.useState({});
  React.useEffect(() => {
    try {
      const { getLanguageCapability, getSupportedLanguages, getUnsupportedLanguages } = require('../../lib/cloud/languageCapabilities.js');
      const supported = getSupportedLanguages();
      const unsupported = getUnsupportedLanguages();
      setCaps({ supported, unsupported, he: getLanguageCapability('he'), en: getLanguageCapability('en') });
    } catch (e) { /* best-effort */ }
  }, []);

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold text-muted mb-2">LANGUAGE CAPABILITIES</p>
      {caps.he && caps.en ? (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="font-semibold">Hebrew (he)</span>
            <span style={{ color: '#00C896' }}>{caps.he.supportLevel}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-semibold">English (en)</span>
            <span style={{ color: '#00C896' }}>{caps.en.supportLevel}</span>
          </div>
          {caps.unsupported?.length > 0 && (
            <p className="text-[10px] text-faint mt-1">Declared but unavailable: {caps.unsupported.join(', ')}</p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted">Language capabilities not loaded.</p>
      )}
    </div>
  );
};

// Video/UGC tab — truthful video generation and editing states
const VideoUGCTab = ({ product, marketer, canRecord, CAPABILITY_STATUS, Video, Loader2, showToast }) => {
  const [videoStatus, setVideoStatus] = useState(CAN_RECORD_VIDEO ? CAPABILITY_STATUS.READY : CAPABILITY_STATUS.UNAVAILABLE);
  const [editSpec, setEditSpec] = useState(null);
  const [voiceover, setVoiceover] = useState(null);
  const [captions, setCaptions] = useState([]);

  React.useEffect(() => {
    if (!product) return;
    try {
      const { createCreativeVariant } = require('../../lib/cloud/creativeMutation.js');
      const { buildEditSpec } = require('../../lib/cloud/videoEditing.js');
      const { generateVoiceoverScript } = require('../../lib/cloud/voiceoverScript.js');
      const { getLanguageCapability } = require('../../lib/cloud/languageCapabilities.js');

      const cv = createCreativeVariant({ product, language: 'he', creativeType: 'reel' });
      if (cv) {
        setCaptions(cv.captions?.he?.lines || []);
        const spec = buildEditSpec({ creative: cv, product });
        setEditSpec(spec);
        const vo = generateVoiceoverScript({ creative: cv, product });
        setVoiceover(vo);
      }
    } catch (e) {
      // best-effort
    }
  }, [product]);

  const langCap = product ? getLanguageCapability('he') : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <Video size={18} style={{ color: '#E86A9E' }} />
        <p className="text-sm font-semibold">Video / UGC</p>
      </div>

      {/* Video Generation Status */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">VIDEO GENERATION</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Browser Recorder</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: canRecord ? '#00C89620' : '#FEE2E2', color: canRecord ? '#00C896' : '#991B1B' }}>
            {canRecord ? 'READY' : 'UNAVAILABLE'}
          </span>
        </div>
        <p className="text-[11px] text-muted mt-1">
          {canRecord ? 'Canvas + MediaRecorder → WebM. No external AI provider.' : 'Browser does not support video recording.'}
        </p>
        {!canRecord && (
          <p className="text-[10px] text-faint mt-1">Fallback: complete creative package with script, captions, and edit spec ready for external renderer.</p>
        )}
      </div>

      {/* Captions / Subtitles */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">CAPTIONS / SUBTITLES</p>
        {captions.length > 0 ? (
          <div className="flex flex-col gap-1">
            {captions.slice(0, 5).map((cap, i) => (
              <div key={i} className="flex justify-between text-[11px] py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="font-semibold">{cap.text.slice(0, 40)}</span>
                <span className="text-muted">{cap.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted">No captions generated yet.</p>
        )}
        <p className="text-[10px] text-faint mt-1">Source: script-based captions (not transcription).</p>
      </div>

      {/* Voiceover */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">VOICEOVER</p>
        {voiceover ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{voiceover.language}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: voiceover.status === 'VOICEOVER_READY' ? '#00C89620' : '#FEE2E2', color: voiceover.status === 'VOICEOVER_READY' ? '#00C896' : '#991B1B' }}>
                {voiceover.status}
              </span>
            </div>
            <p className="text-[11px] text-muted">{voiceover.lines?.length || 0} lines · {Math.round((voiceover.totalDurationMs || 0) / 1000)}s</p>
            {voiceover.blockers?.length > 0 && (
              <p className="text-[10px] text-faint">Blockers: {voiceover.blockers.join(', ')}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted">Voiceover script not generated yet.</p>
        )}
      </div>

      {/* Edit Spec */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">EDIT SPECIFICATION</p>
        {editSpec ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{editSpec.aspectRatio}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: editSpec.status === 'READY' ? '#00C89620' : '#FEE2E2', color: editSpec.status === 'READY' ? '#00C896' : '#991B1B' }}>
                {editSpec.status}
              </span>
            </div>
            <p className="text-[11px] text-muted">{editSpec.scenes?.length || 0} scenes · {Math.round((editSpec.totalDurationMs || 0) / 1000)}s</p>
            <div className="flex flex-col gap-1 mt-1">
              {(editSpec.scenes || []).slice(0, 4).map((scene, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="font-semibold">{scene.type}</span>
                  <span className="text-muted">{scene.durationMs}ms</span>
                </div>
              ))}
            </div>
            {editSpec.blockers?.length > 0 && (
              <p className="text-[10px] text-faint">Blockers: {editSpec.blockers.join(', ')}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted">Edit spec not generated yet.</p>
        )}
      </div>

      {/* Language Capabilities */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-muted mb-2">LANGUAGE CAPABILITIES</p>
        {langCap ? (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold">Hebrew (he)</span>
              <span style={{ color: '#00C896' }}>FULL</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold">English (en)</span>
              <span style={{ color: '#00C896' }}>FULL</span>
            </div>
            <p className="text-[10px] text-faint mt-1">Other languages declared but not fully implemented.</p>
          </div>
        ) : (
          <p className="text-[11px] text-muted">Select a product to view language capabilities.</p>
        )}
      </div>
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

