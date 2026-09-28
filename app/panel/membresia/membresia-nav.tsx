import Link from "next/link";

export const FIELD_INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
export const FIELD_LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

export function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

const TABS = [
  { id: "socios", label: "Socios", href: "/panel/membresia" },
  { id: "datos", label: "Datos", href: "/panel/membresia/datos" },
  { id: "pedidos", label: "Pedidos", href: "/panel/membresia/pedidos" },
  { id: "carta", label: "Carta y puntos", href: "/panel/membresia/carta" },
] as const;

// Encabezado comun de las pantallas de membresia premium.
export function MembresiaHeader({ active, title, subtitle }: { active: (typeof TABS)[number]["id"]; title: string; subtitle: string }) {
  return (
    <header className="border-b border-white/[0.07] pb-6">
      <Link href="/panel" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
        ← Panel
      </Link>
      <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
      <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 max-w-xl text-sm text-white/45">{subtitle}</p>
      <nav className="mt-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`inline-flex h-10 items-center border px-4 text-[10px] font-black uppercase tracking-[0.14em] transition ${
              tab.id === active ? "border-[#ff5a2a]/60 bg-[#ff5a2a]/10 text-white" : "border-white/[0.10] text-white/45 hover:border-white/30 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
