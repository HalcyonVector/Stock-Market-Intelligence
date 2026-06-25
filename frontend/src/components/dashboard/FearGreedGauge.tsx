"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";

function label(score: number): { text: string; color: string } {
  if (score >= 75) return { text: "Extreme Greed", color: "#34d399" };
  if (score >= 55) return { text: "Greed", color: "#6ee7b7" };
  if (score >= 45) return { text: "Neutral", color: "#fbbf24" };
  if (score >= 25) return { text: "Fear", color: "#ff6b81" };
  return { text: "Extreme Fear", color: "#ff3b5c" };
}

export function FearGreedGauge() {
  // Compute from movers + sentiment data
  const { data: movers } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const { data: sentiment } = useQuery({ queryKey: ["trending"], queryFn: () => api.trending() });

  // Simple fear/greed heuristic
  let score = 50;
  if (movers) {
    const gainers = movers.gainers?.length ?? 0;
    const losers = movers.losers?.length ?? 0;
    const total = gainers + losers || 1;
    const gainerAvg = movers.gainers?.reduce((s: number, g: any) => s + Math.abs(g.change_pct), 0) / (gainers || 1) ?? 0;
    const loserAvg = movers.losers?.reduce((s: number, l: any) => s + Math.abs(l.change_pct), 0) / (losers || 1) ?? 0;
    const breadth = (gainers / total) * 100;
    const momentum = gainerAvg > loserAvg ? 60 : 40;
    score = Math.round(breadth * 0.5 + momentum * 0.3 + 50 * 0.2);
  }
  if (sentiment && Array.isArray(sentiment)) {
    const avgSent = sentiment.reduce((s: number, t: any) => s + (t.sentiment_score ?? 0), 0) / (sentiment.length || 1);
    score = Math.round(score * 0.7 + (50 + avgSent * 50) * 0.3);
  }

  score = Math.max(0, Math.min(100, score));
  const { text, color } = label(score);

  // Arc math for semicircle gauge
  const radius = 60;
  const cx = 70;
  const cy = 70;
  const startAngle = Math.PI;
  const endAngle = 0;
  const angle = startAngle - (score / 100) * Math.PI;

  const arcStart = { x: cx + radius * Math.cos(startAngle), y: cy - radius * Math.sin(startAngle) };
  const arcEnd = { x: cx + radius * Math.cos(endAngle), y: cy - radius * Math.sin(endAngle) };
  const needle = { x: cx + (radius - 8) * Math.cos(angle), y: cy - (radius - 8) * Math.sin(angle) };

  const bgPath = `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;

  return (
    <BentoCard span="col-span-6 lg:col-span-3" title="Fear & Greed">
      <div className="flex flex-col items-center">
        <svg width="140" height="85" viewBox="0 0 140 85">
          {/* Background arc */}
          <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" />
          {/* Gradient segments */}
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff3b5c" />
              <stop offset="25%" stopColor="#ff6b81" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="75%" stopColor="#6ee7b7" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <path d={bgPath} fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.6" />
          {/* Needle */}
          <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="4" fill={color} />
        </svg>
        <span className="mt-1 font-mono text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs" style={{ color }}>{text}</span>
      </div>
    </BentoCard>
  );
}
