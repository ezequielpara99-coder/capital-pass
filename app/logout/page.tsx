"use client";

import { useEffect } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LogoutPage() {
  useEffect(() => {
    async function logout() {
      const supabase = createClient();

      await supabase.auth.signOut();

      window.location.replace("/login");
    }

    logout();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050308] text-white">
      <div className="text-center">
        <div className="relative mx-auto h-14 w-14 overflow-hidden">
          <div className="absolute inset-[6px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
        </div>

        <p className="mt-5 text-sm text-white/40">
          Cerrando sesión...
        </p>
      </div>
    </main>
  );
}