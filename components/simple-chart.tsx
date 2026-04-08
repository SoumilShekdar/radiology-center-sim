"use client";

import { useTheme } from "@mui/material/styles";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Point = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  color?: string;
  points: Point[];
  ghostPoints?: Point[];
  valueFormatter?: (value: number) => string;
};

export function SimpleLineChart({
  title,
  color = "#2563eb",
  points,
  ghostPoints,
  valueFormatter = (value: number) => `${Math.round(value)}`,
}: Props) {
  const theme = useTheme();
  
  // Combine real and ghost points for Recharts.
  const data = points.map((p, i) => {
    const datum: any = { label: p.label, value: p.value };
    if (ghostPoints && ghostPoints[i]) {
      datum.ghostValue = ghostPoints[i].value;
    }
    return datum;
  });

  const chartId = Math.random().toString(36).substring(7);

  return (
    <div className="chart" style={{ width: "100%", height: "260px", position: "relative" }}>
      <div className="eyebrow" style={{ fontWeight: 600, marginBottom: 8, color: theme.palette.text.secondary }}>
        {title}
      </div>
      <div style={{ width: "100%", height: "220px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorValue-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              {ghostPoints && (
                <linearGradient id={`colorGhost-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={valueFormatter} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontFamily: "var(--font-jetbrains-mono, monospace)"
              }}
              formatter={(val: number) => [valueFormatter(val), ""]}
              labelStyle={{ color: theme.palette.text.primary, fontWeight: 600, marginBottom: "4px" }}
            />
            {ghostPoints && (
              <Area
                type="monotone"
                dataKey="ghostValue"
                name="What-If"
                stroke={theme.palette.secondary.main}
                strokeWidth={2}
                strokeDasharray="5 5"
                fill={`url(#colorGhost-${chartId})`}
                isAnimationActive={true}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              name="Value"
              stroke={color}
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#colorValue-${chartId})`}
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
