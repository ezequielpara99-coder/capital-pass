import assert from "node:assert/strict";
import test from "node:test";

import { computeProspectScore } from "../lib/sales-agent/scoring";
import { normalizeInstagramUsername, normalizeWebsiteDomain, normalizePhoneDigits, phoneMatchKey, normalizeEmail, nameCityKey } from "../lib/sales-agent/duplicates";
import { detectTicketingProvider, detectExternalTools } from "../lib/sales-agent/ticketing";
import { detectOpportunities } from "../lib/sales-agent/opportunities";
import { buildMessageVariants } from "../lib/sales-agent/messages";

test("scoring: un prospecto sin ningun dato da 0 y explica todo lo que falta", () => {
  const result = computeProspectScore({
    eventsPerMonth: null, followers: null, sellsOnline: null, ticketingProvider: null,
    opportunityCount: 0, externalToolsCount: 0, hasWebsite: false, hasInstagram: false, hasUpcomingEvent: false,
    email: null, phone: null, whatsapp: null,
  });
  assert.equal(result.score, 0);
  assert.equal(result.potential, "bajo");
  assert.equal(result.reasons.length, 0);
  assert.ok(result.missing.length > 0);
  assert.equal(result.breakdown.reduce((s, b) => s + b.max, 0), 100, "los puntos maximos del desglose suman 100");
});

test("scoring: un prospecto fuerte en todo llega a 'prioridad' y suma exactamente los puntos esperados", () => {
  const result = computeProspectScore({
    eventsPerMonth: 8, followers: 60000, sellsOnline: true, ticketingProvider: "passline",
    opportunityCount: 3, externalToolsCount: 3, hasWebsite: true, hasInstagram: true, hasUpcomingEvent: true,
    email: "hola@club.test", phone: "3411234567", whatsapp: "5493411234567",
  });
  assert.equal(result.score, 20 + 15 + 20 + 15 + 10 + 10 + 10);
  assert.equal(result.potential, "prioridad");
  assert.ok(result.reasons.includes("Eventos muy frecuentes (8 o más por mes)"));
  assert.equal(result.missing.length, 0);
});

test("scoring: los 4 tramos de potencial coinciden con los cortes de la especificacion (0-30 bajo, 31-60 medio, 61-80 alto, 81-100 prioridad)", () => {
  const base = { eventsPerMonth: null, followers: null, sellsOnline: null, ticketingProvider: null, opportunityCount: 0, externalToolsCount: 0, hasWebsite: false, hasInstagram: false, hasUpcomingEvent: false, email: null, phone: null, whatsapp: null };

  const bajo = computeProspectScore({ ...base, eventsPerMonth: 1 });
  assert.equal(bajo.score, 5);
  assert.equal(bajo.potential, "bajo");

  const medio = computeProspectScore({ ...base, eventsPerMonth: 4, followers: 10000, sellsOnline: true, ticketingProvider: "no_identificado" });
  assert.equal(medio.score, 15 + 9 + 12);
  assert.equal(medio.potential, "medio");

  const alto = computeProspectScore({ ...base, eventsPerMonth: 8, followers: 25000, sellsOnline: true, ticketingProvider: "eventbrite", opportunityCount: 1, hasWebsite: true, hasInstagram: true });
  assert.equal(alto.score, 20 + 12 + 20 + 5 + 6);
  assert.equal(alto.potential, "alto");
});

test("scoring: vender online con proveedor identificado puntua mas que vender sin identificar, que a su vez puntua mas que no vender", () => {
  const base = { eventsPerMonth: null, followers: null, opportunityCount: 0, externalToolsCount: 0, hasWebsite: false, hasInstagram: false, hasUpcomingEvent: false, email: null, phone: null, whatsapp: null };
  const conProveedor = computeProspectScore({ ...base, sellsOnline: true, ticketingProvider: "eventbrite" });
  const sinIdentificar = computeProspectScore({ ...base, sellsOnline: true, ticketingProvider: "no_identificado" });
  const noVende = computeProspectScore({ ...base, sellsOnline: false, ticketingProvider: null });
  assert.ok(conProveedor.score > sinIdentificar.score);
  assert.ok(sinIdentificar.score > noVende.score);
});

test("scoring: la necesidad de gestion y las herramientas externas no superan su tope aunque haya muchas", () => {
  const base = { eventsPerMonth: null, followers: null, sellsOnline: null, ticketingProvider: null, hasWebsite: false, hasInstagram: false, hasUpcomingEvent: false, email: null, phone: null, whatsapp: null };
  const result = computeProspectScore({ ...base, opportunityCount: 10, externalToolsCount: 10 });
  assert.equal(result.breakdown.find((b) => b.key === "necesidad_gestion")?.points, 15);
  assert.equal(result.breakdown.find((b) => b.key === "herramientas_externas")?.points, 10);
});

test("duplicados: normaliza instagram (arroba, mayusculas, URL) al mismo valor", () => {
  assert.equal(normalizeInstagramUsername("@ClubExample"), "clubexample");
  assert.equal(normalizeInstagramUsername("https://instagram.com/ClubExample/"), "clubexample");
  assert.equal(normalizeInstagramUsername("  clubexample  "), "clubexample");
  assert.equal(normalizeInstagramUsername(null), null);
  assert.equal(normalizeInstagramUsername(""), null);
});

test("duplicados: normaliza el dominio del sitio sin importar protocolo, www o el resto de la URL", () => {
  assert.equal(normalizeWebsiteDomain("https://www.clubexample.com/entradas"), "clubexample.com");
  assert.equal(normalizeWebsiteDomain("clubexample.com"), "clubexample.com");
  assert.equal(normalizeWebsiteDomain("http://CLUBEXAMPLE.com"), "clubexample.com");
  assert.equal(normalizeWebsiteDomain("no es una url"), null);
});

test("duplicados: telefono y su clave de emparejamiento por los ultimos 10 digitos", () => {
  assert.equal(normalizePhoneDigits("+54 9 341 123-4567"), "5493411234567");
  assert.equal(phoneMatchKey("+54 9 341 123-4567"), "3411234567");
  assert.equal(phoneMatchKey("341 123-4567"), "3411234567");
  assert.equal(phoneMatchKey(null), null);
});

test("duplicados: email en minusculas, y nombre+ciudad como clave de sugerencia (sin tildes ni mayusculas)", () => {
  assert.equal(normalizeEmail(" Hola@Club.COM "), "hola@club.com");
  assert.equal(nameCityKey("Club Ñandú", "Rosario"), "club-nandu|rosario");
  assert.equal(nameCityKey("Club Ñandú", null), "club-nandu");
  assert.equal(nameCityKey("", "Rosario"), null);
});

test("ticketing: detecta los proveedores conocidos por su dominio en un link", () => {
  assert.equal(detectTicketingProvider('<a href="https://www.passline.com/club-example">Entradas</a>').provider, "passline");
  assert.equal(detectTicketingProvider('<a href="https://www.eventbrite.com.ar/e/123">Comprar</a>').provider, "eventbrite");
  assert.equal(detectTicketingProvider('Comprá en https://ticketek.com/evento').provider, "ticketek");
  assert.equal(detectTicketingProvider('<a href="https://entradaweb.com.ar/x">Entradas</a>').provider, "entradaweb");
});

test("ticketing: formulario y whatsapp solo cuentan si ademas hay señal de venta", () => {
  const conVenta = detectTicketingProvider('Comprar entradas: <a href="https://forms.gle/abc123">acá</a>');
  assert.equal(conVenta.provider, "formulario");
  assert.equal(conVenta.confidence, "alta");

  const soloWhatsapp = detectTicketingProvider('Consultas <a href="https://wa.me/5493411234567">acá</a>');
  assert.equal(soloWhatsapp.provider, "no_identificado", "un link de whatsapp sin mencionar venta no alcanza");

  const whatsappConVenta = detectTicketingProvider('Comprar entradas por <a href="https://wa.me/5493411234567">WhatsApp</a>');
  assert.equal(whatsappConVenta.provider, "whatsapp");
});

test("ticketing: linktree es la señal mas debil (solo si no hay nada mejor)", () => {
  const soloLinktree = detectTicketingProvider('<a href="https://linktr.ee/clubexample">Links</a>');
  assert.equal(soloLinktree.provider, "linktree");
  assert.equal(soloLinktree.confidence, "baja");

  const conMejorSenal = detectTicketingProvider('<a href="https://linktr.ee/clubexample">Links</a> <a href="https://passline.com/x">Entradas</a>');
  assert.equal(conMejorSenal.provider, "passline", "un proveedor conocido pesa mas que linktree");
});

test("ticketing: sin ninguna señal reconocible, no identificado (nunca inventa un proveedor)", () => {
  assert.equal(detectTicketingProvider("<html><body>Bienvenidos al club</body></html>").provider, "no_identificado");
});

test("ticketing: detecta varias herramientas externas presentes a la vez, sin duplicar", () => {
  const html = '<a href="https://linktr.ee/x">Links</a> <a href="https://wa.me/123">WSP</a> <a href="https://wa.me/123">WSP de nuevo</a>';
  const tools = detectExternalTools(html);
  assert.deepEqual([...tools].sort(), ["linktree", "whatsapp"]);
});

test("oportunidades: cada regla dispara solo con las condiciones que le corresponden", () => {
  const conProveedorExterno = detectOpportunities({ sellsOnline: true, ticketingProvider: "eventbrite", hasRrppMention: true, eventsPerMonth: 1, hasUpcomingEvent: false });
  assert.ok(conProveedorExterno.some((o) => o.type === "sin_sistema_propio"));
  assert.ok(!conProveedorExterno.some((o) => o.type === "sin_rrpp_visible"), "tiene RRPP mencionado, no aplica esa oportunidad");

  const sinRrpp = detectOpportunities({ sellsOnline: true, ticketingProvider: "sistema_propio", hasRrppMention: false, eventsPerMonth: null, hasUpcomingEvent: false });
  assert.ok(sinRrpp.some((o) => o.type === "sin_rrpp_visible"));
  assert.ok(!sinRrpp.some((o) => o.type === "sin_sistema_propio"), "el sistema propio no cuenta como proveedor externo");

  const frecuente = detectOpportunities({ sellsOnline: false, ticketingProvider: null, hasRrppMention: false, eventsPerMonth: 3, hasUpcomingEvent: true });
  assert.ok(frecuente.some((o) => o.type === "necesita_control_acceso"));
  assert.ok(frecuente.some((o) => o.type === "evento_proximo"));

  const sinNada = detectOpportunities({ sellsOnline: null, ticketingProvider: null, hasRrppMention: false, eventsPerMonth: null, hasUpcomingEvent: false });
  assert.deepEqual(sinNada, []);
});

test("mensajes: nunca incluye un dato que no vino (sin ciudad no menciona 'en null' ni deja huecos)", () => {
  const variants = buildMessageVariants({ name: "Club Example", city: null, category: null, opportunity: null });
  for (const text of Object.values(variants)) {
    assert.ok(!/null|undefined|\{\{/.test(text), `no debe filtrar datos crudos: ${text}`);
    assert.ok(text.includes("Club Example"));
  }
});

test("mensajes: con ciudad y categoria, el mensaje las menciona; los 3 estilos son distintos entre si", () => {
  const variants = buildMessageVariants({ name: "Club Example", city: "Rosario", category: "boliche", opportunity: "Notamos que no tienen RRPP visible." });
  assert.ok(variants.directo.includes("Rosario"));
  assert.ok(variants.natural.includes("Rosario"));
  assert.ok(variants.profesional.includes("Rosario"));
  assert.ok(variants.natural.includes("RRPP visible"));
  assert.notEqual(variants.directo, variants.natural);
  assert.notEqual(variants.natural, variants.profesional);
});
