type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

// PostgREST devuelve como maximo 1000 filas por consulta (el limite del
// proyecto): una consulta "trae todo" se corta en silencio y los totales de
// finanzas quedan subestimados. Esto lee pagina por pagina hasta agotar las
// filas. La consulta DEBE tener un orden estable (ej. .order("id")), si no las
// paginas pueden repetir o saltearse filas.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const pageSize = options.pageSize ?? 1000;
  const maxRows = options.maxRows ?? 100_000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: [], error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return { data: rows, error: null };
}
