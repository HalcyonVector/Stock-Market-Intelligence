"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import {
  Activity, BarChart3, Brain, Shield, TrendingUp, Zap, LineChart,
  Briefcase, Filter, GitCompare, FlaskConical, Bell, Target, Layers,
  ChevronDown, ArrowRight, Sparkles, Globe, Lock, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Particle Background ─────────────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; hue: number;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Create particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        hue: Math.random() > 0.5 ? 350 : 200, // crimson or blue
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.opacity})`;
        ctx.fill();

        // Draw connections
        particles.forEach((p2, j) => {
          if (j <= i) return;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(350, 60%, 50%, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.6 }}
    />
  );
}

/* ── Glowing orbs ────────────────────────────────────────────────── */
function GlowOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-crimson-600/15 blur-[140px] animate-pulse" />
      <div className="absolute top-[20%] right-[10%] h-[400px] w-[400px] rounded-full bg-crimson-700/10 blur-[120px] animate-pulse" style={{ animationDelay: "1.5s" }} />
      <div className="absolute top-[50%] -left-20 h-[350px] w-[350px] rounded-full bg-red-900/10 blur-[100px] animate-pulse" style={{ animationDelay: "3s" }} />
      <div className="absolute -bottom-40 left-1/3 h-[450px] w-[450px] rounded-full bg-crimson-800/8 blur-[110px] animate-pulse" style={{ animationDelay: "4s" }} />
    </div>
  );
}

/* ── Section wrapper with scroll animation ──────────────────────── */
function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Animated counter ────────────────────────────────────────────── */
function Counter({ value, suffix = "", prefix = "" }: { value: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 2000;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [inView, value]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ── Feature card ────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: BarChart3, title: "AI Dashboard",
    desc: "Real-time market overview with fear/greed gauge, sector rotation, volume leaders, and AI briefings",
    color: "from-crimson-500/20 to-crimson-600/5", glow: "shadow-crimson-500/10",
  },
  {
    icon: Briefcase, title: "Portfolio Optimizer",
    desc: "Mean-variance optimization, Monte Carlo simulation, efficient frontier, stress testing, and rebalancing",
    color: "from-blue-500/20 to-blue-600/5", glow: "shadow-blue-500/10",
  },
  {
    icon: Brain, title: "AI Deep Research",
    desc: "Ollama-powered comprehensive stock analysis combining technicals, fundamentals, sentiment, and news",
    color: "from-purple-500/20 to-purple-600/5", glow: "shadow-purple-500/10",
  },
  {
    icon: LineChart, title: "Technical Indicators",
    desc: "RSI, MACD, Bollinger Bands, Stochastic, ATR, OBV with interactive multi-timeframe charts",
    color: "from-emerald-500/20 to-emerald-600/5", glow: "shadow-emerald-500/10",
  },
  {
    icon: Filter, title: "Smart Screener",
    desc: "Filter 50+ stocks by change%, RSI, volume ratio, P/E, market cap with presets for common strategies",
    color: "from-amber-500/20 to-amber-600/5", glow: "shadow-amber-500/10",
  },
  {
    icon: FlaskConical, title: "Strategy Backtester",
    desc: "Test RSI, MACD, SMA, Bollinger strategies with equity curves, trade logs, Sharpe ratio, and alpha",
    color: "from-pink-500/20 to-pink-600/5", glow: "shadow-pink-500/10",
  },
  {
    icon: Cpu, title: "ML Price Forecast",
    desc: "SARIMA seasonal time-series model with 80%/95% confidence intervals (linear + Holt ensemble fallback)",
    color: "from-cyan-500/20 to-cyan-600/5", glow: "shadow-cyan-500/10",
  },
  {
    icon: Shield, title: "Safe Invest Guide",
    desc: "Zero-loss instruments (PPF, FD, NPS, KVP), SIP calculator, goal planner, and AI advisor for beginners",
    color: "from-green-500/20 to-green-600/5", glow: "shadow-green-500/10",
  },
  {
    icon: GitCompare, title: "Stock Comparison",
    desc: "Side-by-side analysis of up to 6 stocks: normalized price overlay, technicals, and fundamentals",
    color: "from-orange-500/20 to-orange-600/5", glow: "shadow-orange-500/10",
  },
];

function FeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const Icon = feature.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.06] p-6",
        "bg-gradient-to-br backdrop-blur-xl transition-all duration-500",
        "hover:border-white/[0.12] hover:shadow-2xl",
        feature.color, feature.glow
      )}
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10">
        <div className="mb-4 inline-flex rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/[0.08]">
          <Icon size={22} className="text-white/80" />
        </div>
        <h3 className="text-lg font-semibold text-white/90">{feature.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/40">{feature.desc}</p>
      </div>
    </motion.div>
  );
}

/* ── Stats bar ───────────────────────────────────────────────────── */
const STATS = [
  { value: 115, suffix: "+", label: "Stocks Tracked" },
  { value: 15, suffix: "+", label: "AI-Powered Features" },
  { value: 4, suffix: "", label: "Backtest Strategies" },
  { value: 16, suffix: "", label: "Indian Safe Instruments" },
];

/* ── Tech stack ──────────────────────────────────────────────────── */
const TECH = [
  "Next.js 14", "FastAPI", "PostgreSQL", "Redis",
  "Ollama AI", "yfinance", "scipy", "Recharts",
  "Framer Motion", "TailwindCSS", "Docker", "Celery",
];

/* ── Main Landing Page ───────────────────────────────────────────── */
export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });

  return (
    <div ref={containerRef} className="relative">
      <ParticleField />
      <GlowOrbs />

      {/* ─── Hero Section ──────────────────────────────────────── */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-crimson-500/20 bg-crimson-500/5 px-4 py-1.5 backdrop-blur-sm"
        >
          <Sparkles size={14} className="text-crimson-400" />
          <span className="text-xs font-medium text-crimson-300">AI-Powered Market Intelligence</span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl"
        >
          <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
            Discover. Analyze.
          </span>
          <br />
          <span className="bg-gradient-to-r from-crimson-400 via-crimson-300 to-pink-400 bg-clip-text text-transparent">
            Invest Smarter.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-6 max-w-2xl text-lg text-white/40 md:text-xl"
        >
          Full-stack market intelligence platform with AI research, portfolio optimization,
          strategy backtesting, ML price forecasting, and a safe investment guide — all running locally.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-10 flex gap-4"
        >
          <button
            onClick={onEnter}
            className="group flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-crimson-600 to-crimson-500 px-10 py-4 text-sm font-semibold text-white shadow-lg shadow-crimson-500/25 transition-all hover:shadow-xl hover:shadow-crimson-500/30 hover:scale-[1.02] active:scale-[0.98] min-w-[200px]"
          >
            Launch Dashboard
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>
          <button
            onClick={() => {
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-10 py-4 text-sm font-semibold text-white/70 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white hover:scale-[1.02] active:scale-[0.98] min-w-[200px]"
          >
            Explore Features
          </button>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">Scroll</span>
            <ChevronDown size={16} className="text-white/20" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Stats Section ─────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/[0.04] bg-crimson-600/[0.03] py-16 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-12 px-6 md:gap-20">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="text-center"
            >
              <p className="text-3xl font-bold text-white md:text-4xl">
                <Counter value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-1 text-sm text-white/30">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features Section ──────────────────────────────────── */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <div className="text-center">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, type: "spring" }}
                className="inline-flex items-center gap-2 rounded-full border border-crimson-500/10 bg-crimson-500/[0.04] px-4 py-1.5 text-xs font-medium text-white/40"
              >
                <Layers size={12} />
                Platform Features
              </motion.span>
              <h2 className="mt-6 text-3xl font-bold text-white md:text-4xl">
                Everything you need.{" "}
                <span className="bg-gradient-to-r from-crimson-400 to-crimson-300 bg-clip-text text-transparent">
                  Nothing you don&apos;t.
                </span>
              </h2>
              <p className="mt-4 text-white/30">
                From real-time market data to AI-powered research — built for learning, not gambling.
              </p>
            </div>
          </AnimatedSection>

          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tech Stack Section ────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <AnimatedSection>
            <h2 className="text-2xl font-bold text-white md:text-3xl">
              Built with{" "}
              <span className="bg-gradient-to-r from-crimson-400 to-crimson-300 bg-clip-text text-transparent">
                modern tech
              </span>
            </h2>
          </AnimatedSection>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {TECH.map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.08, borderColor: "rgba(225,29,58,0.3)" }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-white/50 backdrop-blur-sm transition hover:text-white/70"
              >
                {t}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ───────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-crimson-500/10 bg-gradient-to-br from-crimson-600/15 via-crimson-900/5 to-transparent p-12 text-center backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="inline-flex rounded-full bg-crimson-500/10 p-4"
          >
            <Activity size={28} className="text-crimson-400" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-6 text-3xl font-bold text-white md:text-4xl"
          >
            Ready to explore?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-4 text-white/40"
          >
            Zero API keys needed. Runs entirely on your machine with Docker.
          </motion.p>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5 }}
            onClick={onEnter}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="group mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-crimson-600 to-crimson-500 px-10 py-4 text-sm font-semibold text-white shadow-lg shadow-crimson-500/25 transition-shadow hover:shadow-xl hover:shadow-crimson-500/30"
          >
            Enter the Platform
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="relative z-10 border-t border-white/[0.04] py-8 text-center"
      >
        <p className="text-xs text-white/20">
          Stock Discovery & Intelligence — Educational use only. Not financial advice.
        </p>
      </motion.footer>
    </div>
  );
}
