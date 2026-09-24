"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../../../lib/supabase/client";
import { normalizeKind } from "../../../../lib/quotes/totals";
import { loadBootstrap, saveBootstrap } from "../../../../lib/offline/quote-cache";
import QuoteEditor, { CatalogItem, QuoteClient, QuoteInit, QuotePackageOption } from "../quote-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Bootstrap = { catalog: CatalogItem[]; clients: QuoteClient[]; packages: QuotePackageOption[] };

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] text-[#f7f3ed]">
      <p className="text-sm text-white/40">Cargando presupuesto...</p>
    </main>
  );
}

// useSearchParams() necesita un boundary de Suspense propio (Next lo exige
// para poder prerenderizar el resto de la página) -- por eso la carga vive
// en un componente hijo en vez de directamente en el default export.
function NuevoPresupuestoContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; init: QuoteInit; bootstrap: Bootstrap }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();

      // Chequeo liviano de sesión: getSession() lee lo que ya está
      // guardado localmente, sin red -- a diferencia de getUser(), que
      // revalida contra el servidor y falla sin conexión. La autoridad
      // real sigue siendo el servidor: cualquier intento de guardar se
      // valida ahí (verifyAdmin) apenas haya señal.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }

      const tipo = searchParams.get("tipo") ?? undefined;
      const consulta = searchParams.get("consulta") ?? undefined;

      let init: QuoteInit = { kind: normalizeKind(tipo) };

      let bootstrap: Bootstrap | null = null;
      try {
        const response = await fetch("/api/admin/presupuestos/bootstrap", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar.");
        bootstrap = { catalog: data.catalog, clients: data.clients, packages: data.packages };
        await saveBootstrap(bootstrap);

        // El prefill desde una consulta pública de rental solo se puede
        // resolver con conexión (necesita leer rental_inquiries).
        if (consulta && UUID.test(consulta)) {
          const inquiryResponse = await fetch(`/api/admin/presupuestos/consulta?id=${consulta}`, { cache: "no-store" });
          if (inquiryResponse.ok) {
            const inquiryData = await inquiryResponse.json();
            if (inquiryData?.inquiry) init = inquiryData.inquiry as QuoteInit;
          }
        }
      } catch {
        const cached = await loadBootstrap();
        if (!cached) {
          if (!cancelled) {
            setState({
              status: "error",
              message: "No hay conexión y todavía no se guardó ningún dato local. Abrí esta pantalla una vez con conexión para poder usarla offline después.",
            });
          }
          return;
        }
        bootstrap = cached as unknown as Bootstrap;
      }

      if (!cancelled) setState({ status: "ready", init, bootstrap: bootstrap as Bootstrap });
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") return <LoadingScreen />;

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-center text-[#f7f3ed]">
        <p className="max-w-sm text-sm text-white/50">{state.message}</p>
      </main>
    );
  }

  return (
    <QuoteEditor
      init={state.init}
      catalog={state.bootstrap.catalog}
      clients={state.bootstrap.clients}
      packages={state.bootstrap.packages}
    />
  );
}

export default function NuevoPresupuestoPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <NuevoPresupuestoContent />
    </Suspense>
  );
}
