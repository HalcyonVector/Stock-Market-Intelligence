"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function BentoCard({
  title, subtitle, span = "col-span-12 md:col-span-6", children, action, className, icon,
}: {
  title?: string; subtitle?: string; span?: string;
  children: React.ReactNode; action?: React.ReactNode; className?: string; icon?: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("glass glass-hover p-5", span, className)}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            {title && <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">{icon}{title}</h3>}
            {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}
