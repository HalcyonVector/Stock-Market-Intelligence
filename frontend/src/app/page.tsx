"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { LandingPage } from "@/components/landing/LandingPage";

export default function Home() {
  const [showLanding, setShowLanding] = useState(true);

  return (
    <>
      {/* Dashboard renders underneath, always mounted */}
      <Dashboard />

      {/* Landing overlay — covers sidebar + everything */}
      <AnimatePresence>
        {showLanding && (
          <motion.div
            key="landing"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[100] overflow-y-auto bg-base-950"
          >
            <LandingPage onEnter={() => setShowLanding(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
