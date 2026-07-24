import { sparklinePath } from "./analytics.js";

/** Tiny inline SVG line chart. Renders nothing useful below 2 points. */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
  dashed = false,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  dashed?: boolean;
}) {
  if (values.length < 2) {
    return <span className="spark-empty">collecting…</span>;
  }
  const pts = sparklinePath(values, width, height);
  const last = pts.split(" ").pop()!.split(",");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* color may be a var(--token); var() only resolves in CSS properties,
          not SVG presentation attributes, so stroke/fill go through style. */}
      <polyline
        points={pts}
        fill="none"
        style={{ stroke: color }}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "3 3" : undefined}
        opacity={dashed ? 0.75 : 1}
      />
      <circle cx={last[0]} cy={last[1]} r="2.4" style={{ fill: color }} opacity={dashed ? 0.75 : 1} />
    </svg>
  );
}
