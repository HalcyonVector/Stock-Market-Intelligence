"use client";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { LandingPage } from "@/components/landing/LandingPage";

// Module-level flag: survives re-renders & route changes, resets on full page refresh
let hasEnteredDashboard = false;

export default function Home() {
  const [showLanding, setShowLanding] = useState(!hasEnteredDashboard);

  const handleEnter = () => {
    hasEnteredDashboard = true;
    setShowLanding(false);
  };

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
            className="fixed inset-0 z-[100] overflow-y-auto"
            style={{ background: "linear-gradient(180deg, #3d1018 0%, #2a0d12 15%, #1a0a0e 35%, #120709 55%, #0a0506 80%, #060304 100%)" }}
          >
            <LandingPage onEnter={handleEnter} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
