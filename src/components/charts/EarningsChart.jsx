import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { money } from "../../utils/helpers";

export function EarningsChart({ title, data, lang }) {
  const hasData = data.some((d) => d.value > 0);
  return (
    <div className="surface rounded-2xl p-4 mb-5">
      <p className="text-xs font-semibold mb-3">{title}</p>
      {!hasData ? (
        <div className="h-[120px] flex items-center justify-center">
          <p className="text-xs text-muted">—</p>
        </div>
      ) : (
        <div style={{ width: "100%", height: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-faint)" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                formatter={(v) => [money(v, lang), ""]}
                labelFormatter={() => ""}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  background: "var(--bg-elevated)",
                  color: "var(--text)",
                }}
              />
              <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#earningsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
