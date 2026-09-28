import Link from "next/link";

export const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
export const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

const TABS = [
  { id: "dashboard", label: "Dashboard", href: "/admin/sales-agent" },
  { id: "prospectos", label: "Prospectos", href: "/admin/sales-agent/prospectos" },
  { id: "campanas", label: "Campañas", href: "/admin/sales-agent/campanas" },
] as const;

export function SalesAgentHeader({ active, title, subtitle }: { active: (typeof TABS)[number]["id"]; title: string; subtitle: string }) {
  return (
    <header className="border-b border-white/[0.07] pb-6">
      <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
        ← Admin
      </Link>
      <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Sales Agent</p>
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

export const POTENTIAL_LABEL: Record<string, string> = { bajo: "Bajo", medio: "Medio", alto: "Alto", prioridad: "Prioridad" };
export const POTENTIAL_STYLE: Record<string, string> = {
  bajo: "border-white/15 text-white/40",
  medio: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  alto: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  prioridad: "border-[#ff5a2a]/40 bg-[#ff5a2a]/10 text-[#ff9b82]",
};

export const STATUS_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  investigando: "Investigando",
  calificado: "Calificado",
  listo_para_contactar: "Listo para contactar",
  contactado: "Contactado",
  respondio: "Respondió",
  interesado: "Interesado",
  demo: "Demo",
  negociacion: "Negociación",
  cliente: "Cliente",
  no_interesado: "No interesado",
  no_contactar: "No contactar",
};

export const CATEGORY_LABEL: Record<string, string> = {
  boliche: "Boliche",
  discoteca: "Discoteca",
  club: "Club",
  productora: "Productora",
  organizador: "Organizador",
  fiesta_electronica: "Fiesta electrónica",
  fiesta_universitaria: "Fiesta universitaria",
  evento_masivo: "Evento masivo",
  bar: "Bar con eventos",
  rooftop: "Rooftop / terraza",
  salon: "Salón",
  festival: "Festival",
  corporativo: "Evento corporativo",
  deportivo: "Evento deportivo",
  cultural: "Evento cultural",
  dj: "DJ / productor",
  otro: "Otro",
};

export const TICKETING_LABEL: Record<string, string> = {
  passline: "Passline",
  eventbrite: "Eventbrite",
  ticketek: "Ticketek",
  entradaweb: "EntradaWeb",
  mercadopago: "Mercado Pago",
  sistema_propio: "Sistema propio",
  formulario: "Formulario",
  whatsapp: "WhatsApp",
  linktree: "Linktree",
  otro: "Otro",
  no_identificado: "No identificado",
};
