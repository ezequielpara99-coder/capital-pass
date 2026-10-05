import { test } from "node:test";
import assert from "node:assert/strict";
import { planStopChanges } from "../lib/traslados/stops";

const existing = [
  { id: "a", name: "Pergamino" },
  { id: "b", name: "Rojas" },
  { id: "c", name: "Junín" },
];

test("paradas: agregar una en el medio no le cambia la parada a los pasajeros ya cargados", () => {
  const { assigned, removed } = planStopChanges(existing, ["Pergamino", "Colón", "Rojas", "Junín"]);
  assert.deepEqual(assigned, ["a", null, "b", "c"]);
  assert.deepEqual(removed, []);
});

test("paradas: reordenar conserva cada parada por nombre (sin importar mayusculas ni acentos)", () => {
  const { assigned, removed } = planStopChanges(existing, ["junin", "ROJAS", "Pergamino"]);
  assert.deepEqual(assigned, ["c", "b", "a"]);
  assert.deepEqual(removed, []);
});

test("paradas: corregir un nombre conserva la parada; sacar una la borra", () => {
  assert.deepEqual(planStopChanges(existing, ["Pergamino", "Rojas Centro", "Junín"]), { assigned: ["a", "b", "c"], removed: [] });
  assert.deepEqual(planStopChanges(existing, ["Pergamino", "Junín"]), { assigned: ["a", "c"], removed: ["b"] });
  assert.deepEqual(planStopChanges([], ["Pergamino"]), { assigned: [null], removed: [] });
});
