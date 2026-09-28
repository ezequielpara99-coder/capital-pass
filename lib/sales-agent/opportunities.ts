import type { TicketingProvider } from "./ticketing";

// Oportunidades comerciales detectadas a partir de lo que se sabe del
// prospecto -- reglas simples y explicables, nada de "IA opinando". Cada una
// tiene un tipo (para guardar), una descripcion (para mostrar) y una
// prioridad. Funcion pura.

export type OpportunityInput = {
  sellsOnline: boolean | null;
  ticketingProvider: TicketingProvider | null;
  hasRrppMention: boolean; // se menciona "RRPP" en la pagina investigada
  eventsPerMonth: number | null;
  hasUpcomingEvent: boolean;
};

export type Opportunity = { type: string; description: string; priority: "baja" | "media" | "alta" };

export function detectOpportunities(input: OpportunityInput): Opportunity[] {
  const opportunities: Opportunity[] = [];

  const externalProvider = input.ticketingProvider && !["no_identificado", "sistema_propio"].includes(input.ticketingProvider);

  if (input.sellsOnline && externalProvider) {
    opportunities.push({
      type: "sin_sistema_propio",
      description: "Vende entradas pero no tiene un sistema propio visible: usa un proveedor externo.",
      priority: "alta",
    });
  }

  if (input.sellsOnline && !input.hasRrppMention) {
    opportunities.push({
      type: "sin_rrpp_visible",
      description: "Tiene venta online pero no muestra un sistema de RRPP.",
      priority: "media",
    });
  }

  if (input.hasRrppMention) {
    opportunities.push({
      type: "rrpp_sin_seguimiento",
      description: "Tiene RRPP pero no parece tener un seguimiento centralizado.",
      priority: "media",
    });
  }

  if (input.eventsPerMonth !== null && input.eventsPerMonth >= 2) {
    opportunities.push({
      type: "necesita_control_acceso",
      description: "Hace eventos frecuentes y podría necesitar control de acceso (QR, puerta).",
      priority: "alta",
    });
  }

  if (input.hasUpcomingEvent) {
    opportunities.push({
      type: "evento_proximo",
      description: "Tiene un evento próximo: es un buen momento para mostrarle la plataforma.",
      priority: "media",
    });
  }

  return opportunities;
}
