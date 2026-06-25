import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function scoreColor(v: number) {
  if (v >= 70) return "text-emerald-400";
  if (v >= 45) return "text-amber-400";
  return "text-crimson-400";
}

export function changeColor(n: number) {
  return n >= 0 ? "text-emerald-400" : "text-crimson-400";
}
