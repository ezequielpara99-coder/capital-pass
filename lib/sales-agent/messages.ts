// Generador de mensajes comerciales personalizados. Nunca inventa datos: solo
// usa lo que efectivamente vino en "fields". Si un dato no esta, esa parte
// del mensaje simplemente no se incluye (nada de "{{variable}}" vacia).
// Funcion pura -- sin red ni base.

export type MessageFields = {
  name: string;
  city: string | null;
  category: string | null; // "boliche" | "productora" | ...
  opportunity: string | null; // frase corta ya redactada (ver opportunities.ts)
};

export type MessageVariants = { directo: string; natural: string; profesional: string };

function lugar(fields: MessageFields): string {
  return fields.city ? ` en ${fields.city}` : "";
}

function categoriaLabel(category: string | null): string | null {
  if (!category) return null;
  const labels: Record<string, string> = {
    boliche: "el boliche",
    discoteca: "la disco",
    productora: "la productora",
    fiesta: "las fiestas",
    bar: "el bar",
    organizador: "los eventos",
    universitario: "los eventos",
    festival: "el festival",
    corporativo: "los eventos",
    deportivo: "los eventos",
    cultural: "los eventos",
    dj: "los eventos",
  };
  return labels[category] ?? null;
}

export function buildMessageVariants(fields: MessageFields): MessageVariants {
  const place = lugar(fields);
  const catLabel = categoriaLabel(fields.category);
  const opportunityLine = fields.opportunity ? ` ${fields.opportunity}` : "";

  const directo = [
    `Hola! Te escribo de Capital Pass.`,
    `Vi ${catLabel ? `${catLabel} de ${fields.name}` : fields.name}${place} y pensé que les podría servir: centralizamos venta de entradas, RRPP, QR y control de acceso en un solo lugar.`,
    `¿Les interesa que les muestre cómo funciona?`,
  ].join(" ");

  const natural = [
    `Hola! ¿Cómo andan?`,
    `Estuve viendo lo que vienen haciendo${place ? `${place}` : ""} con ${fields.name} y me pareció interesante.${opportunityLine}`,
    `Estoy trabajando con Capital Pass, una plataforma que junta entradas, RRPP, QR y control de acceso en un mismo lugar.`,
    `Si quieren les cuento un poco más y ven si les sirve para alguna próxima fecha.`,
  ].join(" ");

  const profesional = [
    `Buenas, mi nombre es Ezequiel y me comunico en representación de Capital Pass.`,
    `Nos contactamos con ${fields.name}${place} porque gestionan${catLabel ? ` ${catLabel}` : " eventos"} y creemos que podría interesarles una plataforma integral de venta de entradas, gestión de RRPP, control de acceso por QR y estadísticas de venta.`,
    `Quedo a disposición para coordinar una breve demostración en el horario que les resulte más cómodo.`,
  ].join(" ");

  return { directo, natural, profesional };
}
