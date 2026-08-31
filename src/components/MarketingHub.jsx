/**
 * MarketingHub — All-in-One Campaign Builder
 * One click → publish to all platforms
 */

import { useState } from 'react';
import { PLATFORMS } from '../lib/marketing';
import { CAMPAIGN_TEMPLATES, shareToPlatform, shareNative, schedulePost } from '../lib/campaigns';
import { autoConvertBuyer, generateViralOffer } from '../lib/viralEngine';

export default function MarketingHub({ product, sellerId, onClose }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [customText, setCustomText] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [published, setPublished] = useState(false);

  const generateText = (template) => {
    if (!template || !product) return '';
    let text = template.text;
    text = text.replace(/\[שם מוצר\]/g, product.title || '');
    text = text.replace(/\[מחיר\]/g, product.price || 0);
    text = text.replace(/\[קישור\]/g, product.affiliateUrl || product.url || '');
    return text;
  };

  const togglePlatform = (id) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handlePublish = async () => {
    const text = customText || generateText(selectedTemplate);
    const results = [];

    for (const platformId of selectedPlatforms) {
      if (platformId === 'native') {
        const result = await shareNative(product, text);
        results.push({ platform: 'native', ...result });
      } else {
        const result = shareToPlatform(platformId, product, text);
        results.push({ platform: platformId, ...result });
      }
    }

    const campaigns = JSON.parse(localStorage.getItem('marketing_campaigns') || '[]');
    campaigns.push({ id: `campaign_${Date.now()}`, results, timestamp: Date.now() });
    localStorage.setItem('marketing_campaigns', JSON.stringify(campaigns));
    setPublished(true);
  };

  const handleSchedule = () => {
    const text = customText || generateText(selectedTemplate);
    for (const platformId of selectedPlatforms) {
      schedulePost(platformId, product, text, new Date(scheduleDate).getTime());
    }
    setPublished(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">🚀 מרכז השיווק</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <p className="text-gray-500 mt-1">בנה קמפיין ופרסם בכל הרשתות בקליק אחד</p>
        </div>

        {product && (
          <div className="p-4 bg-gray-50 border-b flex items-center gap-4">
            <img src={product.image} alt={product.title} className="w-16 h-16 rounded-lg object-cover" />
            <div>
              <h3 className="font-semibold">{product.title}</h3>
              <p className="text-green-600 font-bold">{product.price} ₪</p>
            </div>
          </div>
        )}

        <div className="p-6 border-b">
          <h3 className="font-semibold mb-3">1. בחר תבנית</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(CAMPAIGN_TEMPLATES).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedTemplate(cat.templates[0])}
                className={`p-3 rounded-xl border-2 text-center transition ${
                  selectedTemplate?.id?.startsWith(cat.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                }`}
              >
                <div className="text-2xl">{cat.icon}</div>
                <div className="text-sm font-medium mt-1">{cat.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-b">
          <h3 className="font-semibold mb-3">2. בחר רשתות</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {Object.values(PLATFORMS).map((p) => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                className={`p-2 rounded-lg border-2 text-center transition ${
                  selectedPlatforms.includes(p.id) ? 'border-indigo-500' : 'border-gray-200'
                }`}
                style={{ backgroundColor: selectedPlatforms.includes(p.id) ? p.color + '20' : 'transparent' }}
              >
                <div className="text-xl">{p.icon}</div>
                <div className="text-xs mt-1">{p.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-b">
          <h3 className="font-semibold mb-3">3. התאם טקסט (אופציונלי)</h3>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={selectedTemplate ? generateText(selectedTemplate) : 'בחר תבנית קודם...'}
            className="w-full p-3 border rounded-xl resize-none h-32"
          />
        </div>

        <div className="p-6 border-b">
          <h3 className="font-semibold mb-3">4. תזמון (אופציונלי)</h3>
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="w-full p-3 border rounded-xl"
          />
        </div>

        <div className="p-6 flex gap-3">
          <button
            onClick={handlePublish}
            disabled={!selectedTemplate || selectedPlatforms.length === 0}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:bg-indigo-700 transition"
          >
            🚀 פרסם עכשיו ({selectedPlatforms.length} רשתות)
          </button>
          {scheduleDate && (
            <button onClick={handleSchedule} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition">
              📅 תזמן
            </button>
          )}
        </div>

        {published && (
          <div className="p-4 bg-green-50 border-t text-center">
            <p className="text-green-600 font-semibold">✅ הקמפיין פורסם בהצלחה!</p>
          </div>
        )}
      </div>
    </div>
  );
}
