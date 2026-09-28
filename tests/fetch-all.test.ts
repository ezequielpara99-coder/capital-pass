import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllRows } from "../lib/supabase/fetch-all";

// Simula una tabla de N filas con el mismo limite de PostgREST: cada pagina
// devuelve como maximo el tamaño pedido, y se puede forzar un error.
function fakeTable(total: number, failAtFrom: number | null = null) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    if (failAtFrom !== null && from === failAtFrom) return { data: null, error: { message: "boom" } };
    const rows: number[] = [];
    for (let i = from; i <= Math.min(to, total - 1); i++) rows.push(i);
    return { data: rows, error: null };
  };
  return { page, calls };
}

test("fetchAllRows: trae todas las filas aunque pasen de 1000 (el limite de PostgREST)", async () => {
  const table = fakeTable(2500);
  const result = await fetchAllRows<number>(table.page);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 2500, "no se corta en 1000");
  assert.equal(result.data[0], 0);
  assert.equal(result.data[2499], 2499);
  assert.equal(new Set(result.data).size, 2500, "sin filas repetidas entre paginas");
  assert.deepEqual(table.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAllRows: con exactamente 1000 filas pide una pagina mas y termina", async () => {
  const table = fakeTable(1000);
  const result = await fetchAllRows<number>(table.page);
  assert.equal(result.data.length, 1000);
  assert.equal(table.calls.length, 2, "la segunda pagina vuelve vacia y corta");
});

test("fetchAllRows: tabla vacia y menos de una pagina", async () => {
  assert.equal((await fetchAllRows<number>(fakeTable(0).page)).data.length, 0);
  assert.equal((await fetchAllRows<number>(fakeTable(37).page)).data.length, 37);
});

test("fetchAllRows: un error en cualquier pagina se devuelve y no se ocultan datos parciales", async () => {
  const result = await fetchAllRows<number>(fakeTable(3000, 1000).page);
  assert.equal(result.error?.message, "boom");
  assert.equal(result.data.length, 0, "ante un error no se devuelven totales parciales");
});

test("fetchAllRows: respeta el tope maximo de filas", async () => {
  const result = await fetchAllRows<number>(fakeTable(10_000).page, { pageSize: 1000, maxRows: 3000 });
  assert.equal(result.data.length, 3000);
});
