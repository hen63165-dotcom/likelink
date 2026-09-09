import { useState, useEffect } from 'react';
import { getSessionToken } from '../../lib/auth.js';

/**
 * TrendingPanel — shows what's HOT right now.
 * Displays trending products, emerging picks, and declining items.
 */
export default function TrendingPanel({ origin }) {
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTrends();
  }, []);

  async function fetchTrends() {
    try {
      setLoading(true);
      const token = getSessionToken();
      const res = await fetch('/api/store?mode=trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) setTrends(data);
      else setError(data.error || 'Failed to load trends');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="card"><div className="loading">טוען טרנדים...</div></div>;
  if (error) return <div className="card"><div className="error">שגיאה: {error}</div></div>;
  if (!trends) return null;

  return (
    <div className="trending-panel">
      <h3>🔥 מה חם עכשיו</h3>
      
      {trends.hottest?.length > 0 && (
        <div className="trend-section">
          <h4>הכי חמים</h4>
          {trends.hottest.map((item, i) => (
            <div key={item.product.id} className="trend-item">
              <span className="rank">#{i + 1}</span>
              <div className="info">
                <div className="title">{item.product.title}</div>
                <div className="meta">
                  <span className={`momentum ${item.momentum.replace(/[^a-z]/g, '')}`}>{item.momentum}</span>
                  <span className="score">ציון: {item.score}</span>
                  {item.signals?.sales7d > 0 && <span className="signal">💰 {item.signals.sales7d} מכירות</span>}
                  {item.signals?.clicks7d > 0 && <span className="signal">👆 {item.signals.clicks7d} קליקים</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {trends.emerging?.length > 0 && (
        <div className="trend-section">
          <h4>🆕 מתעוררים</h4>
          {trends.emerging.map((item) => (
            <div key={item.product.id} className="trend-item emerging">
              <span className="badge">NEW</span>
              <div className="info">
                <div className="title">{item.product.title}</div>
                <div className="meta"><span className="momentum">{item.momentum}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {trends.declining?.length > 0 && (
        <div className="trend-section">
          <h4>📙 יורדים (כדאי להחליף)</h4>
          {trends.declining.map((item) => (
            <div key={item.product.id} className="trend-item declining">
              <div className="info">
                <div className="title">{item.product.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="trend-summary">
        <span>סה"כ מוצרים: {trends.totalProducts}</span>
        <span>פעילים: {trends.activeProducts}</span>
      </div>

      <button onClick={fetchTrends} className="refresh-btn">🔄 רענן</button>
    </div>
  );
}
