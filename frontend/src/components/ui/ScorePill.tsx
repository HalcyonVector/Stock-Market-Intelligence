import { cn, scoreColor } from "@/lib/utils";

export function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className={cn("score-pill border border-white/10 bg-black/30", scoreColor(value))}>
      {label} <b>{value}</b>
    </span>
  );
}
