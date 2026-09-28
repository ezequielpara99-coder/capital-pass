// Deteccion del sistema de venta de entradas que usa un prospecto, a partir
// del HTML/texto de SU PROPIA pagina publica (la que el admin indico para
// investigar) -- no scrapea nada mas. Funcion pura sobre texto ya obtenido.

export type TicketingProvider =
  | "passline"
  | "eventbrite"
  | "ticketek"
  | "entradaweb"
  | "mercadopago"
  | "sistema_propio"
  | "formulario"
  | "whatsapp"
  | "linktree"
  | "otro"
  | "no_identificado";

export type TicketingDetection = {
  provider: TicketingProvider;
  url: string | null;
  confidence: "alta" | "media" | "baja";
};

// Herramientas externas que suman como señal aparte del puntaje (una pagina
// puede tener varias a la vez, por eso esto devuelve una lista).
export type ExternalTool = "linktree" | "formulario" | "whatsapp" | "eventbrite" | "passline" | "ticketek" | "entradaweb" | "mercadopago";

const PROVIDER_PATTERNS: { provider: TicketingProvider; pattern: RegExp; tool?: ExternalTool }[] = [
  { provider: "passline", pattern: /passline\.com/i, tool: "passline" },
  { provider: "eventbrite", pattern: /eventbrite\.(com|com\.ar)/i, tool: "eventbrite" },
  { provider: "ticketek", pattern: /ticketek\.com/i, tool: "ticketek" },
  { provider: "entradaweb", pattern: /entradaweb\.com\.ar/i, tool: "entradaweb" },
];

const LINKTREE_PATTERN = /linktr\.ee\//i;
const FORM_PATTERN = /(forms\.gle|docs\.google\.com\/forms)/i;
const WHATSAPP_PATTERN = /(wa\.me\/|api\.whatsapp\.com\/send)/i;
const MERCADOPAGO_PATTERN = /(mercadopago\.com[a-z./]*\/checkout|mpago\.la\/)/i;

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html))) links.push(match[1]);
  // Tambien URLs sueltas en el texto (no siempre estan como <a href>).
  const bareRe = /https?:\/\/[^\s"'<>]+/gi;
  while ((match = bareRe.exec(html))) links.push(match[0]);
  return links;
}

// html: el HTML (o texto) de la pagina del prospecto. ownDomain: su propio
// dominio (para distinguir "vende con un link a su propio sitio" de "usa un
// proveedor externo").
export function detectTicketingProvider(html: string, ownDomain: string | null = null): TicketingDetection {
  const links = extractLinks(html);
  const haystack = `${html}\n${links.join("\n")}`;

  for (const { provider, pattern } of PROVIDER_PATTERNS) {
    const found = links.find((link) => pattern.test(link)) ?? (pattern.test(haystack) ? pattern.source : null);
    if (found) {
      const url = links.find((link) => pattern.test(link)) ?? null;
      return { provider, url, confidence: "alta" };
    }
  }

  if (MERCADOPAGO_PATTERN.test(haystack)) {
    const url = links.find((link) => MERCADOPAGO_PATTERN.test(link)) ?? null;
    return { provider: "mercadopago", url, confidence: "alta" };
  }

  const sellsKeyword = /(comprar entradas|venta de entradas|comprá tu entrada|entradas online|comprar tickets)/i.test(html);

  if (FORM_PATTERN.test(haystack)) {
    const url = links.find((link) => FORM_PATTERN.test(link)) ?? null;
    return { provider: "formulario", url, confidence: sellsKeyword ? "alta" : "media" };
  }

  if (WHATSAPP_PATTERN.test(haystack) && sellsKeyword) {
    const url = links.find((link) => WHATSAPP_PATTERN.test(link)) ?? null;
    return { provider: "whatsapp", url, confidence: "media" };
  }

  if (LINKTREE_PATTERN.test(haystack)) {
    const url = links.find((link) => LINKTREE_PATTERN.test(link)) ?? null;
    return { provider: "linktree", url, confidence: "baja" };
  }

  if (sellsKeyword && ownDomain) {
    // Vende entradas y no se detecto ningun proveedor externo: parece un
    // sistema propio (formulario/checkout hecho a medida), confianza baja
    // porque es una inferencia, no algo confirmado.
    return { provider: "sistema_propio", url: null, confidence: "baja" };
  }

  return { provider: "no_identificado", url: null, confidence: "baja" };
}

// Herramientas externas presentes en la pagina (para el puntaje de
// "uso de herramientas externas"), sin importar cual quedo como el
// "ticketing_provider" principal.
export function detectExternalTools(html: string): ExternalTool[] {
  const links = extractLinks(html);
  const haystack = `${html}\n${links.join("\n")}`;
  const tools: ExternalTool[] = [];
  if (LINKTREE_PATTERN.test(haystack)) tools.push("linktree");
  if (FORM_PATTERN.test(haystack)) tools.push("formulario");
  if (WHATSAPP_PATTERN.test(haystack)) tools.push("whatsapp");
  if (MERCADOPAGO_PATTERN.test(haystack)) tools.push("mercadopago");
  for (const { pattern, tool } of PROVIDER_PATTERNS) {
    if (tool && pattern.test(haystack)) tools.push(tool);
  }
  return [...new Set(tools)];
}
