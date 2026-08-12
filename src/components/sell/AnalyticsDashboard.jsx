import React from "react";
import { motion } from "framer-motion";
import { Eye, MousePointerClick, TrendingUp, DollarSign, Award, ShoppingBag } from "lucide-react";
import { getCreatorAnalytics } from "../../lib/analytics";
import { money } from "../../utils/helpers";
import { useI18n } from "../../lib/LangContext";

export function AnalyticsDashboard({ marketerId, products = [] }) {
  const { t } = useI18n();
  const analytics = getCreatorAnalytics(marketerId, products);

  const stats = [
    {
      label: t("analytics.views", "צפיות"),
      value: analytics.views.toLocaleString("he-IL"),
      icon: Eye,
      color: "var(--accent)",
    },
    {
      label: t("analytics.clicks", "קליקים"),
      value: analytics.clicks.toLocaleString("he-IL"),
      icon: MousePointerClick,
      color: "var(--accent-2)",
    },
    {
      label: t("analytics.conversions", "מכירות"),
      value: analytics.conversions.toLocaleString("he-IL"),
      icon: ShoppingBag,
      color: "#10b981",
    },
    {
      label: t("analytics.earnings", "רווח נקי"),
      value: money(analytics.totalEarnings, "he"),
      icon: DollarSign,
      color: "#f59e0b",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="surface rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${stat.color}15`, color: stat.color }}
              >
                <stat.icon size={16} />
              </div>
            </div>
            <p className="mono text-xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Performance Metrics */}
      <div className="surface rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp size={16} style={{ color: "var(--accent)" }} />
          {t("analytics.performance", "ביצועים")}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("analytics.clickToViewRate", "אחוז קליקים מצפיות")}</span>
            <span className="mono font-semibold" style={{ color: "var(--accent)" }}>
              {analytics.clickToViewRate}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(analytics.clickToViewRate, 100)}%` }}
              className="h-full rounded-full"
              style={{ background: "var(--accent)" }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("analytics.conversionRate", "אחוז המרה")}</span>
            <span className="mono font-semibold" style={{ color: "#10b981" }}>
              {analytics.conversionRate}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(analytics.conversionRate, 100)}%` }}
              className="h-full rounded-full"
              style={{ background: "#10b981" }}
            />
          </div>
        </div>
      </div>

      {/* Top Products */}
      {analytics.topProducts.length > 0 && (
        <div className="surface rounded-xl p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Award size={16} style={{ color: "#f59e0b" }} />
            {t("analytics.topProducts", "מוצרים מובילים")}
          </h3>
          <div className="space-y-2">
            {analytics.topProducts.map((product, index) => {
              const productInfo = products.find((p) => p.id === product.productId);
              return (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-2 rounded-lg"
                  style={{ background: "var(--bg)" }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-bold text-muted w-4">#{index + 1}</span>
                    {productInfo?.image && (
                      <img
                        src={productInfo.image}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {productInfo?.title || t("analytics.unknownProduct", "מוצר")}
                      </p>
                      <p className="text-[10px] text-muted">
                        {product.count} {t("analytics.sales", "מכירות")}
                      </p>
                    </div>
                  </div>
                  <span className="mono text-xs font-bold" style={{ color: "var(--accent)" }}>
                    {money(product.earnings, "he")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
