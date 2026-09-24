// Cache local (IndexedDB) para el modo offline del control de ingreso.
// Solo se importa desde componentes cliente -- nunca corre en el
// servidor, así que no hace falta ningún guard de "use client" acá,
// pero sí evitamos tocar `indexedDB` fuera de una función (nunca a
// nivel de módulo) para no romper un build/SSR que igual importe este
// archivo.

const DB_NAME = "capital-pass-control-offline";
const DB_VERSION = 1;
const STORE_TICKETS = "tickets";
const STORE_PENDING = "pendingScans";
const STORE_META = "meta";

export type CachedTicketStatus = "issued" | "used" | "cancelled" | string;

export type CachedTicket = {
  ticketId: string;
  manualCode: string;
  status: CachedTicketStatus;
  buyerName: string;
  buyerDni: string | null;
  ticketType: string;
};

export type PendingScanType = "qr" | "manual";

export type LocalScanResult = "valid" | "already_used" | "cancelled" | "invalid";

export type PendingScan = {
  id: string;
  type: PendingScanType;
  // Para "manual": el código tipeado. Para "qr": el payload crudo del QR
  // (se reenvía tal cual a /api/control/validar-qr para que reverifique
  // la firma real al sincronizar).
  input: string;
  ticketId: string | null;
  localResult: LocalScanResult;
  scannedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_TICKETS)) {
        const store = db.createObjectStore(STORE_TICKETS, { keyPath: "ticketId" });
        store.createIndex("manualCode", "manualCode", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Reemplaza el cache completo de entradas por el de un evento nuevo (o
// actualiza el mismo evento con datos frescos) y guarda cuándo se hizo.
export async function loadEventTickets(eventId: string, tickets: CachedTicket[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_TICKETS, STORE_META], "readwrite");
  const ticketsStore = tx.objectStore(STORE_TICKETS);
  const metaStore = tx.objectStore(STORE_META);

  await promisifyRequest(ticketsStore.clear());
  for (const ticket of tickets) {
    ticketsStore.put(ticket);
  }
  metaStore.put({ key: "eventId", value: eventId });
  metaStore.put({ key: "syncedAt", value: new Date().toISOString() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCacheMeta(): Promise<{ eventId: string | null; syncedAt: string | null }> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readonly");
  const store = tx.objectStore(STORE_META);
  const [eventIdRow, syncedAtRow] = await Promise.all([
    promisifyRequest(store.get("eventId")) as Promise<{ key: string; value: string } | undefined>,
    promisifyRequest(store.get("syncedAt")) as Promise<{ key: string; value: string } | undefined>,
  ]);
  return { eventId: eventIdRow?.value ?? null, syncedAt: syncedAtRow?.value ?? null };
}

export async function lookupByManualCode(code: string): Promise<CachedTicket | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_TICKETS, "readonly");
  const index = tx.objectStore(STORE_TICKETS).index("manualCode");
  const result = await promisifyRequest(index.get(code.trim().toUpperCase()));
  return (result as CachedTicket | undefined) ?? null;
}

export async function lookupByTicketId(ticketId: string): Promise<CachedTicket | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_TICKETS, "readonly");
  const result = await promisifyRequest(tx.objectStore(STORE_TICKETS).get(ticketId));
  return (result as CachedTicket | undefined) ?? null;
}

// Marca la entrada como usada en el cache local -- optimista, antes de
// sincronizar contra el servidor. Evita que el MISMO dispositivo deje
// escanear dos veces la misma entrada mientras está offline.
export async function markUsedLocally(ticketId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_TICKETS, "readwrite");
  const store = tx.objectStore(STORE_TICKETS);
  const existing = (await promisifyRequest(store.get(ticketId))) as CachedTicket | undefined;
  if (existing) {
    store.put({ ...existing, status: "used" });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function enqueueScan(scan: Omit<PendingScan, "id">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).put({ ...scan, id: crypto.randomUUID() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingScans(): Promise<PendingScan[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readonly");
  const all = (await promisifyRequest(tx.objectStore(STORE_PENDING).getAll())) as PendingScan[];
  return all.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
}

export async function removePendingScan(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Borra todo el cache local -- se usa al cerrar sesión o "terminar
// turno": el celular no debería quedar con nombre/DNI de todas las
// entradas del evento después de que el control terminó.
export async function clearOfflineCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
