import "server-only";
import { cookies } from "next/headers";

export const SELECTED_EVENT_COOKIE = "cp_event";

export async function readSelectedEventId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SELECTED_EVENT_COOKIE)?.value?.trim() || null;
}

// Devuelve el evento que el organizador esta administrando: el pedido
// explicitamente por URL, si no el que eligio con el selector (cookie), y si
// no el mas nuevo. "events" tiene que venir ordenado del mas nuevo al mas
// viejo, igual que en el resto del panel.
export async function pickSelectedEvent<T extends { id: string }>(
  events: T[],
  requestedId?: string | null
): Promise<T | null> {
  if (events.length === 0) return null;

  const cookieId = await readSelectedEventId();

  for (const id of [requestedId?.trim(), cookieId]) {
    if (!id) continue;
    const found = events.find((event) => event.id === id);
    if (found) return found;
  }

  return events[0];
}
