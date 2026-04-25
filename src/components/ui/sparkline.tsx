import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  height = 28,
  stroke = "currentColor",
}: {
  values: number[];
  className?: string;
  height?: number;
  stroke?: string;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const step = w / (values.length - 1 || 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const lastX = (values.length - 1) * step;
  const lastY = height - ((last - min) / range) * height;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      aria-hidden
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} />
      <circle cx={lastX} cy={lastY} r={1.8} fill={stroke} />
    </svg>
  );
}
