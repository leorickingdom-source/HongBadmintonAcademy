"use client";

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

// Recharts can't read CSS vars from canvas/SVG context, so colours are the
// brand hexes inline. Shared axis tick style.
const AXIS = { fontSize: 12, fill: "#64748b" } as const;
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" } as const;

export function RevenueAreaChart({ data, currency }: { data: { label: string; amount: number }[]; currency: string }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-MY", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
          <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={TOOLTIP} />
          <Area type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={2} fill="url(#revGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBarChart({ data, color = "#3b82f6" }: { data: { label: string; count: number }[]; color?: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={TOOLTIP} />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SkillBarChart({ data }: { data: { name: string; pct: number }[] }) {
  const h = Math.max(160, data.length * 34 + 24);
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={120} />
          <Tooltip formatter={(v: any) => `${v}%`} cursor={{ fill: "#f8fafc" }} contentStyle={TOOLTIP} />
          <Bar dataKey="pct" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
