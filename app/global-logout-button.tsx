"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

// Cada pantalla de trabajo (panel del organizador, puerta, control,
// bartender, RRPP, cuenta) ya tiene su propia forma de cerrar sesion en el
// header o en un menu. La unica seccion que no tenia ninguna es Admin, asi
// que el boton flotante global se limita a esas rutas -- en cualquier otro
// lado terminaba tapando algo (el avatar del organizador, la barra de
// Presupuestos, los botones flotantes de soporte).
function needsFloatingLogout(pathname: string | null) {
  return Boolean(pathname && pathname.startsWith("/admin"));
}

export default function GlobalLogoutButton() {
  const pathname = usePathname();
  const onAdmin = needsFloatingLogout(pathname);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!onAdmin) return;

    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthed(Boolean(data.user));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthed(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [onAdmin]);

  if (!onAdmin || !authed) return null;

  return (
    <a
      href="/logout"
      className="fixed right-3 top-3 z-[500] flex h-8 items-center gap-2 border border-white/[0.12] bg-black/70 px-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/50 backdrop-blur-md transition hover:border-red-400/30 hover:text-red-300"
    >
      Cerrar sesión
    </a>
  );
}
