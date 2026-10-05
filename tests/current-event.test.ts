import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCurrentEvent } from "../lib/events/current-event";

const now = Date.parse("2026-10-10T20:00:00Z");
const ev = (id: string, starts_at: string | null, status: string) => ({ id, name: id, starts_at, status });

test("RRPP: con un evento viejo terminado y uno proximo, muestra el proximo (antes mostraba el viejo)", () => {
  const events = [ev("mes-pasado", "2026-09-12T23:00:00Z", "finished"), ev("este-sabado", "2026-10-11T23:00:00Z", "upcoming")];
  assert.equal(pickCurrentEvent(events, now)?.id, "este-sabado");
});

test("RRPP: un evento en curso gana sobre los proximos", () => {
  const events = [ev("proximo", "2026-10-17T23:00:00Z", "upcoming"), ev("hoy", "2026-10-10T18:00:00Z", "active")];
  assert.equal(pickCurrentEvent(events, now)?.id, "hoy");
});

test("RRPP: entre varios proximos, el mas cercano; sin vigentes, el mas reciente; cancelados nunca", () => {
  const upcoming = [ev("lejano", "2026-11-20T23:00:00Z", "upcoming"), ev("cercano", "2026-10-11T23:00:00Z", "upcoming")];
  assert.equal(pickCurrentEvent(upcoming, now)?.id, "cercano");
  const past = [ev("viejo", "2026-08-01T23:00:00Z", "finished"), ev("reciente", "2026-10-03T23:00:00Z", "finished"), ev("cancelado", "2026-10-09T23:00:00Z", "cancelled")];
  assert.equal(pickCurrentEvent(past, now)?.id, "reciente");
  assert.equal(pickCurrentEvent([], now), null);
});
