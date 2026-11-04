"use client";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { LandingPage } from "@/components/landing/LandingPage";

const SEEN_KEY = "si_seen_landing";

export default function Home() {
  // null = not decided yet (avoids flashing the landing page for returning visitors)
  const [showLanding, setShowLanding] = useState<boolean | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* private mode */ }
    // ?welcome forces the landing page (linked from nowhere, handy for demos)
    if (new URLSearchParams(window.location.search).has("welcome")) seen = false;
    setShowLanding(!seen);
  }, []);

  const handleEnter = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setShowLanding(false);
  };

  return (
    <>
      {/* Only mount the dashboard (and its ~15 queries) once the visitor is past the landing page */}
      {showLanding === false && <Dashboard />}

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
