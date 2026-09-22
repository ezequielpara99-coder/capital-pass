"use client";

import { useEffect } from "react";
import { createClient } from "../lib/supabase/client";

const PING_MS = 60_000;

// Avisa cada 60s (y al volver a la pestana) que este usuario sigue activo.
// Silencioso: si la migracion de presencia todavia no se corrio, la RPC
// no existe y esto no hace nada (no rompe nada tampoco).
export default function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let stopped = false;

    async function ping() {
      if (stopped || document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        await supabase.rpc("cp_touch_presence");
      } catch {
        // Silencioso: si la migracion de presencia no se corrio todavia,
        // la RPC no existe y no pasa nada.
      }
    }

    void ping();
    const interval = window.setInterval(ping, PING_MS);
    const onVisible = () => void ping();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
