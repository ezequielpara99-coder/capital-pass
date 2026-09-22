"use client";

import Link from "next/link";
import { useEffect } from "react";

// Boundary de error para cualquier ruta de la app -- sin esto, un error sin
// manejar muestra la pantalla generica de Next.js ("Application error") en
// vez de algo con marca y una salida clara. Se renderiza DENTRO del layout
// raiz (no lleva <html>/<body>): eso queda para app/global-error.tsx, que
// solo se usa si el error rompe el layout raiz mismo.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ERROR NO MANEJADO:", error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 text-[#f7f3ed]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[#ff2a1a]/[0.1] blur-[190px]" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="relative mx-auto h-14 w-14 overflow-hidden">
          <div className="absolute inset-[6px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
        </div>

        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">Capital Pass</p>
        <h1 className="mt-4 text-2xl font-black uppercase tracking-[-0.03em]">Algo salió mal</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Tuvimos un error inesperado. Probá de nuevo — si sigue pasando, avisanos.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="flex h-12 items-center justify-center bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#ff4a2d]"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="flex h-12 items-center justify-center border border-white/20 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
