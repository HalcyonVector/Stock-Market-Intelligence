"use client";
import { BentoCard } from "@/components/ui/BentoCard";

interface Props {
  correlation: {
    symbols: string[];
    matrix: number[][];
  };
}

function corrColor(v: number): string {
  if (v >= 0.7) return "rgba(52,211,153,0.6)";
  if (v >= 0.4) return "rgba(52,211,153,0.3)";
  if (v >= 0.1) return "rgba(52,211,153,0.1)";
  if (v >= -0.1) return "rgba(255,255,255,0.03)";
  if (v >= -0.4) return "rgba(255,59,92,0.15)";
  if (v >= -0.7) return "rgba(255,59,92,0.3)";
  return "rgba(255,59,92,0.5)";
}

export function CorrelationHeatmap({ correlation }: Props) {
  const { symbols, matrix } = correlation;
  const size = symbols.length;

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Correlation Matrix" subtitle="Asset return correlations">
      <div className="overflow-x-auto">
        <div className="inline-grid gap-px" style={{
          gridTemplateColumns: `40px repeat(${size}, 1fr)`,
        }}>
          {/* Header row */}
          <div />
          {symbols.map((s) => (
            <div key={s} className="px-1 text-center text-[9px] text-ink-500 -rotate-45 origin-bottom-left h-8 flex items-end justify-center">
              {s}
            </div>
          ))}
          {/* Matrix rows */}
          {matrix.map((row, i) => (
            <>
              <div key={`label-${i}`} className="flex items-center text-[9px] text-ink-500 pr-1">
                {symbols[i]}
              </div>
              {row.map((val, j) => (
                <div
                  key={`${i}-${j}`}
                  className="flex h-6 min-w-6 items-center justify-center text-[9px] font-mono rounded-sm"
                  style={{ backgroundColor: corrColor(val) }}
                  title={`${symbols[i]}/${symbols[j]}: ${val.toFixed(2)}`}
                >
                  {i === j ? "" : val.toFixed(1)}
                </div>
              ))}
            </>
          ))}
        </div>
      </div>
    </BentoCard>
  );
}
