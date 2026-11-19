"use client";
import { useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/api";

export type LiveEvent = {
  channel: string;
  data: Record<string, any>;
  receivedAt: number;
};

// Connects to the backend WebSocket and keeps a rolling buffer of events.
// Falls back silently if the socket is unavailable (e.g. backend not running).
export function useLiveFeed(limit = 40) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 4000;
    let stopped = false;
    const connect = () => {
      // Hidden tabs do not hold a socket open or retry; they reconnect when shown.
      if (stopped || document.hidden) return;
      try {
        const socket = new WebSocket(WS_URL);
        ws.current = socket;
        socket.onopen = () => { setConnected(true); delay = 4000; };
        socket.onclose = () => {
          setConnected(false);
          if (ws.current !== socket || stopped || document.hidden) return;
          // Back off 4 s, 8 s, 16 s ... up to a minute while the server is away.
          retry = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 60_000);
        };
        socket.onerror = () => socket.close();
        socket.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            setEvents((prev) =>
              [{ ...msg, receivedAt: Date.now() }, ...prev].slice(0, limit)
            );
          } catch {}
        };
      } catch {
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 60_000);
      }
    };
    const onVisibility = () => {
      clearTimeout(retry);
      if (document.hidden) {
        const s = ws.current;
        ws.current = null;
        s?.close();
      } else if (!ws.current) {
        delay = 4000;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisibility);
      ws.current?.close();
    };
  }, [limit]);

  return { events, connected };
}
