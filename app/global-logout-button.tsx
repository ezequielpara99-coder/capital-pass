"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

// Aparece en TODA la app (organizador, RRPP, puerta, control, bartender,
// admin, cuenta...) apenas hay una sesion activa. En paginas publicas sin
// sesion (landing, login, entrada de un ticket sin estar logueado) no se
// muestra nada.
export default function GlobalLogoutButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (active) setVisible(Boolean(data.user));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setVisible(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;

  return (
    <a
      href="/logout"
      className="fixed right-3 top-3 z-[500] flex h-8 items-center gap-2 border border-white/[0.12] bg-black/70 px-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/50 backdrop-blur-md transition hover:border-red-400/30 hover:text-red-300"
    >
      Cerrar sesión
    </a>
  );
}
