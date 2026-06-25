"use client";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ZAxis, Cell, ReferenceDot,
} from "recharts";
import { BentoCard } from "@/components/ui/BentoCard";

interface Strategy {
  name: string;
  color: string;
  annual_return: number;
  annual_volatility: number;
  sharpe: number;
}

interface Props {
  frontier: {
    curve: { returns: number[]; risks: number[]; sharpes: number[] };
    cloud: { returns: number[]; risks: number[]; sharpes: number[] };
  };
  strategies: Record<string, Strategy>;
}

function sharpeToColor(s: number): string {
  if (s >= 2.0) return "#34d399";
  if (s >= 1.5) return "#6ee7b7";
  if (s >= 1.0) return "#fbbf24";
  if (s >= 0.5) return "#ff6b81";
  return "#ff3b5c";
}

export function EfficientFrontier({ frontier, strategies }: Props) {
  // Cloud points (background scatter)
  const step = Math.max(1, Math.floor(frontier.cloud.returns.length / 800));
  const cloud = frontier.cloud.returns
    .map((r, i) => ({
      ret: +(r * 100).toFixed(2),
      risk: +(frontier.cloud.risks[i] * 100).toFixed(2),
      sharpe: +frontier.cloud.sharpes[i].toFixed(3),
    }))
    .filter((_, i) => i % step === 0);

  // Efficient frontier curve
  const curve = frontier.curve.returns.map((r, i) => ({
    ret: +(r * 100).toFixed(2),
    risk: +(frontier.curve.risks[i] * 100).toFixed(2),
    sharpe: +frontier.curve.sharpes[i].toFixed(3),
  }));

  // Strategy markers
  const markers = Object.entries(strategies).map(([key, s]) => ({
    key,
    name: s.name,
    color: s.color,
    ret: +(s.annual_return * 100).toFixed(2),
    risk: +(s.annual_volatility * 100).toFixed(2),
    sharpe: +s.sharpe.toFixed(3),
  }));

  return (
    <BentoCard span="col-span-12 lg:col-span-8" title="Efficient Frontier"
      subtitle={`${frontier.cloud.returns.length.toLocaleString()} simulated portfolios · optimizer-traced curve`}>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 20 }}>
          <XAxis
            dataKey="risk" type="number" name="Risk"
            tick={{ fill: "#8a7479", fontSize: 10 }}
            label={{ value: "Annualized Volatility (%)", position: "bottom", fill: "#8a7479", fontSize: 10, dy: 15 }}
          />
          <YAxis
            dataKey="ret" type="number" name="Return"
            tick={{ fill: "#8a7479", fontSize: 10 }}
            label={{ value: "Annualized Return (%)", angle: -90, position: "left", fill: "#8a7479", fontSize: 10, dx: -10 }}
          />
          <ZAxis dataKey="sharpe" range={[6, 6]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }}
            contentStyle={{
              background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, fontSize: 11, padding: "8px 12px",
            }}
            formatter={(val: number, name: string) => [
              name === "sharpe" ? val.toFixed(3) : `${val.toFixed(2)}%`,
              name === "ret" ? "Return" : name === "risk" ? "Risk" : "Sharpe",
            ]}
          />
          {/* Background cloud */}
          <Scatter data={cloud} isAnimationActive={false} name="Portfolios">
            {cloud.map((p, i) => (
              <Cell key={i} fill={sharpeToColor(p.sharpe)} fillOpacity={0.15} r={2} />
            ))}
          </Scatter>
          {/* Efficient frontier curve */}
          <Scatter data={curve} isAnimationActive={false} name="Frontier" line={{ stroke: "#ff3b5c", strokeWidth: 2 }}>
            {curve.map((_, i) => (
              <Cell key={i} fill="#ff3b5c" fillOpacity={0.8} r={2} />
            ))}
          </Scatter>
          {/* Strategy markers */}
          {markers.map((m) => (
            <ReferenceDot
              key={m.key} x={m.risk} y={m.ret}
              r={6} fill={m.color} stroke="#fff" strokeWidth={1.5}
              label={{ value: "", position: "top" }}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
        {markers.map((m) => (
          <span key={m.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="text-ink-300">{m.name}</span>
            <span className="font-mono text-ink-500">SR {m.sharpe}</span>
          </span>
        ))}
      </div>
    </BentoCard>
  );
}
