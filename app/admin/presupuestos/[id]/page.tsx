"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "../../../../lib/supabase/client";
import { loadBootstrap, loadQuoteLocal, saveBootstrap, saveQuoteLocal, type CachedQuote } from "../../../../lib/offline/quote-cache";
import QuoteEditor, { CatalogItem, QuoteClient, QuoteInit, QuotePackageOption } from "../quote-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Bootstrap = { catalog: CatalogItem[]; clients: QuoteClient[]; packages: QuotePackageOption[] };

function normalizeQuote(quote: Record<string, unknown>): QuoteInit {
  return {
    ...(quote as unknown as QuoteInit),
    package_price_minor: Number(quote.package_price_minor),
    discount_value: Number(quote.discount_value),
  };
}

export default function EditarPresupuestoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; init: QuoteInit; bootstrap: Bootstrap }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!UUID.test(id)) {
        setState({ status: "error", message: "Presupuesto inválido." });
        return;
      }

      const supabase = createClient();

      // Mismo chequeo liviano que en nuevo/page.tsx: getSession() no
      // necesita red, la autoridad real la aplica el servidor en cada
      // fetch/guardado.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }

      let init: QuoteInit | null = null;
      try {
        const response = await fetch(`/api/admin/presupuestos/${id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          if (!cancelled) setState({ status: "error", message: data?.error ?? "No se encontró el presupuesto." });
          return;
        }
        init = normalizeQuote(data.quote);
        await saveQuoteLocal({ ...(data.quote as CachedQuote), ...init } as CachedQuote);
      } catch {
        const cached = await loadQuoteLocal(id);
        if (!cached) {
          if (!cancelled) {
            setState({
              status: "error",
              message: "No hay conexión y este presupuesto todavía no se guardó localmente. Abrilo una vez con conexión para poder editarlo offline después.",
            });
          }
          return;
        }
        init = cached as unknown as QuoteInit;
      }

      let bootstrap: Bootstrap | null = null;
      try {
        const response = await fetch("/api/admin/presupuestos/bootstrap", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error();
        bootstrap = { catalog: data.catalog, clients: data.clients, packages: data.packages };
        await saveBootstrap(bootstrap);
      } catch {
        bootstrap = (await loadBootstrap()) as unknown as Bootstrap | null;
      }

      if (!bootstrap) {
        if (!cancelled) {
          setState({
            status: "error",
            message: "No hay conexión y todavía no se guardó el catálogo local. Abrí esta pantalla una vez con conexión para poder usarla offline después.",
          });
        }
        return;
      }

      if (!cancelled) setState({ status: "ready", init: init as QuoteInit, bootstrap });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-[#f7f3ed]">
        <p className="text-sm text-white/40">Cargando presupuesto...</p>
      </main>
    );
  }

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
