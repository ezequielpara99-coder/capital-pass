// Cache local (IndexedDB) para el modo offline de presupuestos.
// Mismo patrón que lib/offline/ticket-cache.ts (control de ingreso): solo
// se importa desde componentes cliente, nunca corre en el servidor, y
// evita tocar `indexedDB` fuera de una función para no romper un build/SSR
// que igual importe este archivo.

const DB_NAME = "capital-pass-quotes-offline";
const DB_VERSION = 1;
const STORE_BOOTSTRAP = "bootstrap";
const STORE_QUOTES = "quotes";
const STORE_PENDING = "pendingSaves";

export type CachedBootstrap = {
  catalog: unknown[];
  clients: unknown[];
  packages: unknown[];
  syncedAt: string;
};

// Forma tal como la devuelven GET /api/admin/presupuestos/[id] y los
// POST/PATCH (campos de QUOTE_FIELDS en lib/quotes/auth.ts).
export type CachedQuote = {
  id: string;
  number: number | null;
  [key: string]: unknown;
};

export type PendingSaveOperation = "create" | "update";

// A lo sumo una operación pendiente por presupuesto -- si se guarda offline
// varias veces seguidas (se sigue editando sin señal), cada guardado
// reemplaza al anterior con el estado más reciente en vez de acumular una
// cola de cambios (un solo admin edita un presupuesto a la vez, a
// diferencia de la cola de escaneos de control, donde el orden sí importa).
export type PendingSave = {
  quoteId: string;
  operation: PendingSaveOperation;
  // Mismo shape que arma payload() en quote-editor.tsx (el body que ya se
  // manda hoy a POST/PATCH), más un "id" cuando es creación offline.
  payload: Record<string, unknown>;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_BOOTSTRAP)) {
        db.createObjectStore(STORE_BOOTSTRAP, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUOTES)) {
        db.createObjectStore(STORE_QUOTES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "quoteId" });
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

// Guarda el catálogo/clientes/paquetes completos, reemplazando lo que
// hubiera -- se llama cada vez que el bootstrap se pide con éxito online.
export async function saveBootstrap(data: Omit<CachedBootstrap, "syncedAt">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOTSTRAP, "readwrite");
  tx.objectStore(STORE_BOOTSTRAP).put({ key: "current", ...data, syncedAt: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadBootstrap(): Promise<CachedBootstrap | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOTSTRAP, "readonly");
  const result = (await promisifyRequest(tx.objectStore(STORE_BOOTSTRAP).get("current"))) as
    | (CachedBootstrap & { key: string })
    | undefined;
  if (!result) return null;
  return { catalog: result.catalog, clients: result.clients, packages: result.packages, syncedAt: result.syncedAt };
}

// Guarda/actualiza un presupuesto individual en el cache -- se llama tanto
// al abrir uno online (para poder reabrirlo offline después) como al
// guardar una edición offline.
export async function saveQuoteLocal(quote: CachedQuote): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUOTES, "readwrite");
  tx.objectStore(STORE_QUOTES).put(quote);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadQuoteLocal(id: string): Promise<CachedQuote | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUOTES, "readonly");
  const result = await promisifyRequest(tx.objectStore(STORE_QUOTES).get(id));
  return (result as CachedQuote | undefined) ?? null;
}

export async function enqueueSave(save: Omit<PendingSave, "createdAt">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).put({ ...save, createdAt: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingSaves(): Promise<PendingSave[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readonly");
  const all = (await promisifyRequest(tx.objectStore(STORE_PENDING).getAll())) as PendingSave[];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getPendingForQuote(quoteId: string): Promise<PendingSave | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readonly");
  const result = await promisifyRequest(tx.objectStore(STORE_PENDING).get(quoteId));
  return (result as PendingSave | undefined) ?? null;
}

export async function removePendingSave(quoteId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).delete(quoteId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Borra todo el cache local -- se usa al cerrar sesión: tiene nombre,
// contacto, email y teléfono de todos los clientes con presupuesto.
export async function clearQuoteCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
