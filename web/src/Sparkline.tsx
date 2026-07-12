import { sparklinePath } from "./analytics.js";

/** Tiny inline SVG line chart. Renders nothing useful below 2 points. */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <span className="spark-empty">collecting…</span>;
  }
  const pts = sparklinePath(values, width, height);
  const last = pts.split(" ").pop()!.split(",");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
