type Point = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  color?: string;
  points: Point[];
  valueFormatter?: (value: number) => string;
};

export function SimpleLineChart({ title, color = "#b55d38", points, valueFormatter = (value) => `${Math.round(value)}` }: Props) {
  const width = 680;
  const height = 220;
  const padding = 28;
  const leftPadding = 72;
  const bottomPadding = 28;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: maxValue * ratio
  }));

  const path = points
    .map((point, index) => {
      const x = leftPadding + (index / Math.max(points.length - 1, 1)) * (width - leftPadding - padding);
      const y = height - bottomPadding - (point.value / maxValue) * (height - padding - bottomPadding);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="chart">
      <div className="eyebrow">{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220" role="img" aria-label={title}>
        <line x1={leftPadding} y1={padding} x2={leftPadding} y2={height - bottomPadding} stroke="rgba(31,45,38,0.28)" strokeWidth="1.5" />
        <line x1={leftPadding} y1={height - bottomPadding} x2={width - padding} y2={height - bottomPadding} stroke="rgba(31,45,38,0.2)" strokeWidth="1.5" />
        {ticks.map((tick) => {
          const y = height - bottomPadding - tick.ratio * (height - padding - bottomPadding);
          return (
            <g key={tick.ratio}>
              <line x1={leftPadding} y1={y} x2={width - padding} y2={y} stroke="rgba(31,45,38,0.08)" strokeWidth="1" />
              <text x={leftPadding - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#5f6d65">
                {valueFormatter(tick.value)}
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => {
          const x = leftPadding + (index / Math.max(points.length - 1, 1)) * (width - leftPadding - padding);
          const y = height - bottomPadding - (point.value / maxValue) * (height - padding - bottomPadding);
          return (
            <g key={point.label}>
              <circle cx={x} cy={y} r="4.5" fill={color} />
              <text x={x} y={height - 8} textAnchor="middle" fontSize="10" fill="#5f6d65">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
