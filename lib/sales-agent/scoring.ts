// Puntaje de potencial comercial de un prospecto para Capital Pass (0-100).
// No es una opinion sobre el negocio: es una estimacion segun los datos que
// se pudieron conseguir. Funcion pura (sin red ni base) para que sea facil
// de testear y de ajustar sin tocar nada mas.

export type ScoreInput = {
  eventsPerMonth: number | null;
  followers: number | null;
  // "Vende entradas online" segun lo que se pudo ver (web/redes), no un dato inventado.
  sellsOnline: boolean | null;
  ticketingProvider: string | null; // null = no identificado
  // Necesidades detectadas (ver lib/sales-agent/opportunities.ts): cada una suma.
  opportunityCount: number;
  // Herramientas externas detectadas en su web/redes (linktree, formularios, otro proveedor de tickets...).
  externalToolsCount: number;
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasUpcomingEvent: boolean;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type ScoreBreakdownItem = { key: string; label: string; points: number; max: number };
export type Potential = "bajo" | "medio" | "alto" | "prioridad";

export type ScoreResult = {
  score: number;
  potential: Potential;
  breakdown: ScoreBreakdownItem[];
  reasons: string[]; // motivos positivos ("+ ...")
  missing: string[]; // datos que faltan o no se pudieron confirmar
};

function potentialFor(score: number): Potential {
  if (score >= 81) return "prioridad";
  if (score >= 61) return "alto";
  if (score >= 31) return "medio";
  return "bajo";
}

export function computeProspectScore(input: ScoreInput): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];
  const reasons: string[] = [];
  const missing: string[] = [];

  // Frecuencia de eventos (0-20).
  let frecuencia = 0;
  if (input.eventsPerMonth === null) {
    missing.push("No se pudo confirmar con qué frecuencia hace eventos.");
  } else if (input.eventsPerMonth >= 8) {
    frecuencia = 20;
    reasons.push("Eventos muy frecuentes (8 o más por mes)");
  } else if (input.eventsPerMonth >= 4) {
    frecuencia = 15;
    reasons.push("Eventos frecuentes (4 o más por mes)");
  } else if (input.eventsPerMonth >= 2) {
    frecuencia = 10;
    reasons.push("Hace eventos regularmente");
  } else if (input.eventsPerMonth >= 1) {
    frecuencia = 5;
    reasons.push("Hace al menos un evento por mes");
  } else {
    missing.push("No se le conocen eventos recientes.");
  }
  breakdown.push({ key: "frecuencia", label: "Frecuencia de eventos", points: frecuencia, max: 20 });

  // Tamaño / alcance (0-15).
  let tamano = 0;
  if (input.followers === null) {
    missing.push("No se pudo confirmar el alcance (seguidores).");
  } else if (input.followers >= 50000) {
    tamano = 15;
    reasons.push("Alcance muy grande (50.000+ seguidores)");
  } else if (input.followers >= 25000) {
    tamano = 12;
    reasons.push("Alcance grande (25.000+ seguidores)");
  } else if (input.followers >= 10000) {
    tamano = 9;
    reasons.push("Buen alcance (10.000+ seguidores)");
  } else if (input.followers >= 5000) {
    tamano = 6;
    reasons.push("Alcance moderado (5.000+ seguidores)");
  } else if (input.followers >= 1000) {
    tamano = 3;
  }
  breakdown.push({ key: "tamano", label: "Tamaño / alcance", points: tamano, max: 15 });

  // Venta de entradas (0-20).
  let ventaEntradas = 0;
  const knownProvider = input.ticketingProvider && input.ticketingProvider !== "no_identificado";
  if (input.sellsOnline && knownProvider) {
    ventaEntradas = 20;
    reasons.push("Vende entradas online y se identificó el sistema que usa");
  } else if (input.sellsOnline) {
    ventaEntradas = 12;
    reasons.push("Vende entradas online (sistema sin identificar)");
    missing.push("No se pudo determinar qué sistema de venta usa.");
  } else {
    missing.push("No se pudo confirmar si vende entradas online.");
  }
  breakdown.push({ key: "venta_entradas", label: "Venta de entradas", points: ventaEntradas, max: 20 });

  // Necesidad potencial de gestión (oportunidades detectadas, 0-15).
  const necesidad = Math.min(15, input.opportunityCount * 5);
  if (necesidad > 0) reasons.push(input.opportunityCount === 1 ? "Se detectó una necesidad de gestión sin cubrir" : `Se detectaron ${input.opportunityCount} necesidades de gestión sin cubrir`);
  breakdown.push({ key: "necesidad_gestion", label: "Necesidad de gestión", points: necesidad, max: 15 });

  // Uso de herramientas externas (0-10).
  const herramientas = Math.min(10, input.externalToolsCount * 4);
  if (herramientas > 0) reasons.push("Usa herramientas externas (formulario, linktree, otro sistema de tickets)");
  breakdown.push({ key: "herramientas_externas", label: "Herramientas externas", points: herramientas, max: 10 });

  // Presencia digital (0-10).
  let presencia = 0;
  if (input.hasWebsite) presencia += 3;
  if (input.hasInstagram) presencia += 3;
  if (input.hasUpcomingEvent) {
    presencia += 4;
    reasons.push("Tiene un próximo evento detectado");
  }
  presencia = Math.min(10, presencia);
  breakdown.push({ key: "presencia_digital", label: "Presencia digital", points: presencia, max: 10 });

  // Datos de contacto disponibles (0-10): con dos canales distintos ya llega al tope.
  let contacto = 0;
  if (input.email) contacto += 5;
  if (input.whatsapp) contacto += 5;
  else if (input.phone) contacto += 5;
  contacto = Math.min(10, contacto);
  if (contacto === 0) missing.push("No hay ningún dato de contacto disponible todavía.");
  else reasons.push("Tiene datos de contacto disponibles");
  breakdown.push({ key: "contacto_disponible", label: "Contacto disponible", points: contacto, max: 10 });

  const score = breakdown.reduce((sum, item) => sum + item.points, 0);
  return { score, potential: potentialFor(score), breakdown, reasons, missing };
}
