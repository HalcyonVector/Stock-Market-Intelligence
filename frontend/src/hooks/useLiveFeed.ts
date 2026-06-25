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
    let retry: any;
    const connect = () => {
      try {
        const socket = new WebSocket(WS_URL);
        ws.current = socket;
        socket.onopen = () => setConnected(true);
        socket.onclose = () => { setConnected(false); retry = setTimeout(connect, 4000); };
        socket.onerror = () => socket.close();
        socket.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            setEvents((prev) =>
              [{ ...msg, receivedAt: Date.now() }, ...prev].slice(0, limit)
            );
          } catch {}
        };
      } catch { retry = setTimeout(connect, 4000); }
    };
    connect();
    return () => { clearTimeout(retry); ws.current?.close(); };
  }, [limit]);

  return { events, connected };
}
