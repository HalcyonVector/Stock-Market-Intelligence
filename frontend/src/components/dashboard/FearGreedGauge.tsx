"use client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, TrendingUp, Brain } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { useEffect, useState } from "react";

function label(score: number): { text: string; color: string; bg: string } {
  if (score >= 75) return { text: "Extreme Greed", color: "#34d399", bg: "bg-emerald-500/20" };
  if (score >= 55) return { text: "Greed", color: "#6ee7b7", bg: "bg-emerald-400/15" };
  if (score >= 45) return { text: "Neutral", color: "#fbbf24", bg: "bg-amber-400/15" };
  if (score >= 25) return { text: "Fear", color: "#ff6b81", bg: "bg-crimson-400/15" };
  return { text: "Extreme Fear", color: "#ff3b5c", bg: "bg-crimson-500/20" };
}

function AnimatedScore({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <>{display}</>;
}

export function FearGreedGauge() {
  const { data: movers } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const { data: sentiment } = useQuery({ queryKey: ["trending"], queryFn: () => api.trending() });

  let score = 50;
  let breadthScore = 50;
  let momentumScore = 50;
  let sentimentScore = 50;

  if (movers) {
    const gainers = movers.gainers?.length ?? 0;
    const losers = movers.losers?.length ?? 0;
    const total = gainers + losers || 1;
    const gainerAvg = (movers.gainers?.reduce((s: number, g: any) => s + Math.abs(g.change_pct), 0) ?? 0) / (gainers || 1);
    const loserAvg = (movers.losers?.reduce((s: number, l: any) => s + Math.abs(l.change_pct), 0) ?? 0) / (losers || 1);
    breadthScore = Math.round((gainers / total) * 100);
    momentumScore = gainerAvg > loserAvg ? 60 : 40;
    score = Math.round(breadthScore * 0.5 + momentumScore * 0.3 + 50 * 0.2);
  }
  if (sentiment && Array.isArray(sentiment)) {
    const avgSent = sentiment.reduce((s: number, t: any) => s + (t.sentiment_score ?? 0), 0) / (sentiment.length || 1);
    sentimentScore = Math.round(50 + avgSent * 50);
    score = Math.round(score * 0.7 + sentimentScore * 0.3);
  }

  score = Math.max(0, Math.min(100, score));
  const { text, color, bg } = label(score);

  const radius = 80;
  const strokeWidth = 14;
  const cx = 100;
  const cy = 95;
  const startAngle = Math.PI;
  const endAngle = 0;
  const angle = startAngle - (score / 100) * Math.PI;

  const arcStart = { x: cx + radius * Math.cos(startAngle), y: cy - radius * Math.sin(startAngle) };
  const arcEnd = { x: cx + radius * Math.cos(endAngle), y: cy - radius * Math.sin(endAngle) };
  const needleTip = { x: cx + (radius - 20) * Math.cos(angle), y: cy - (radius - 20) * Math.sin(angle) };
  const bgPath = `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;

  const miniStats = [
    { label: "Breadth", value: breadthScore, icon: Activity },
    { label: "Momentum", value: momentumScore, icon: TrendingUp },
    { label: "Sentiment", value: sentimentScore, icon: Brain },
  ];

  return (
    <BentoCard span="col-span-6 lg:col-span-3" title="Fear & Greed">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center justify-center h-full"
      >
        {/* Gauge */}
        <div className="relative">
          <svg width="200" height="115" viewBox="0 0 200 115">
            <defs>
              <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff3b5c" />
                <stop offset="30%" stopColor="#ff6b81" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="75%" stopColor="#6ee7b7" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
              <filter id="needleGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="arcGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Track background */}
            <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth + 4} strokeLinecap="round" />

            {/* Gradient arc with glow */}
            <path d={bgPath} fill="none" stroke="url(#gaugeArc)" strokeWidth={strokeWidth} strokeLinecap="round" filter="url(#arcGlow)" opacity="0.8" />

            {/* Tick marks */}
            {[0, 25, 50, 75, 100].map((tick) => {
              const a = Math.PI - (tick / 100) * Math.PI;
              const inner = radius + strokeWidth / 2 + 2;
              const outer = inner + 5;
              return (
                <line
                  key={tick}
                  x1={cx + inner * Math.cos(a)}
                  y1={cy - inner * Math.sin(a)}
                  x2={cx + outer * Math.cos(a)}
                  y2={cy - outer * Math.sin(a)}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Needle */}
            <motion.g
              initial={{ rotate: 0, originX: cx, originY: cy }}
              animate={{ rotate: 0 }}
              filter="url(#needleGlow)"
            >
              <line
                x1={cx}
                y1={cy}
                x2={needleTip.x}
                y2={needleTip.y}
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={cx} cy={cy} r="6" fill="var(--color-base-950, #0a0a0f)" stroke={color} strokeWidth="2.5" />
              <circle cx={cx} cy={cy} r="2.5" fill={color} />
            </motion.g>
          </svg>
        </div>

        {/* Score display */}
        <div className="flex flex-col items-center -mt-2">
          <span className="font-mono text-3xl font-bold tracking-tight" style={{ color }}>
            <AnimatedScore value={score} />
          </span>
          <span
            className={`mt-1.5 rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${bg}`}
            style={{ color }}
          >
            {text}
          </span>
        </div>

        {/* Mini stat pills */}
        <div className="mt-4 flex w-full gap-2">
          {miniStats.map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-lg bg-white/[0.04] px-2 py-1.5 border border-white/[0.06]"
            >
              <stat.icon size={12} className="text-ink-500" />
              <span className="text-[10px] text-ink-500">{stat.label}</span>
              <span className="font-mono text-xs font-semibold text-ink-100">{stat.value}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </BentoCard>
  );
}
