// Decide, al guardar la lista de paradas de un colectivo, que parada
// existente se convierte en cual de las nuevas -- asi los pasajeros
// conservan su parada aunque se reordene, se agregue una en el medio o se
// corrija un nombre. Antes se reescribia por POSICION: agregar una parada en
// el medio dejaba al que subia en "B" figurando en la parada nueva.
//
// 1) Se emparejan por nombre (sin importar mayusculas ni acentos).
// 2) Las existentes que quedan sin pareja se toman como renombradas, en orden.
// 3) Las que todavia sobran se borran.
export function planStopChanges(existing: { id: string; name: string }[], names: string[]) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const assigned: (string | null)[] = names.map(() => null);
  const used = new Set<string>();

  names.forEach((name, i) => {
    const match = existing.find((s) => !used.has(s.id) && normalize(s.name) === normalize(name));
    if (match) {
      assigned[i] = match.id;
      used.add(match.id);
    }
  });

  const leftovers = existing.filter((s) => !used.has(s.id));
  names.forEach((_, i) => {
    if (assigned[i] === null && leftovers.length > 0) {
      const renamed = leftovers.shift()!;
      assigned[i] = renamed.id;
    }
  });

  return { assigned, removed: leftovers.map((s) => s.id) };
}
