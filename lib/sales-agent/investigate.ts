import "server-only";
import { lookup } from "node:dns/promises";
import { isPrivateOrReservedIp } from "./private-ip";

// Trae la pagina publica que el ADMIN indico para un prospecto (nunca una
// que el sistema haya "encontrado" solo) y devuelve su HTML crudo (para
// buscar links) y el texto visible (para buscar palabras clave). Pensado
// para un solo fetch puntual al apretar "Investigar", no para recorrer un
// sitio entero.
//
// Bloquea URLs que apunten a direcciones privadas/locales (mismo motivo que
// cualquier "trae esta URL que me paso el usuario": sin este chequeo, un
// admin -o alguien que comprometa esa cuenta- podria usar "Investigar" para
// pegarle a servicios internos de la red donde corre la app).

const MAX_BYTES = 600_000;
const TIMEOUT_MS = 8000;


export type FetchedPage = { ok: true; html: string; text: string; finalUrl: string } | { ok: false; error: string };

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchProspectPage(rawUrl: string): Promise<FetchedPage> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, error: "El link no es válido." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "El link tiene que ser http o https." };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    return { ok: false, error: "Ese link no se puede investigar." };
  }

  try {
    const resolved = await lookup(hostname, { all: true });
    if (resolved.length === 0 || resolved.some((r) => isPrivateOrReservedIp(r.address))) {
      return { ok: false, error: "Ese link no se puede investigar." };
    }
  } catch {
    return { ok: false, error: "No se pudo resolver ese link." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Sin redirects: evita que una URL valida redirija a una direccion
    // privada por afuera de este chequeo.
    const response = await fetch(url.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CapitalSalesAgent/1.0)" },
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: "Esa página redirige a otra URL. Probá pegando el link final." };
    }
    if (!response.ok) {
      return { ok: false, error: `La página respondió con un error (${response.status}).` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(contentType)) {
      return { ok: false, error: "Esa URL no parece una página web." };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ok: false, error: "No se pudo leer la página." };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          // Corta la descarga de verdad (si no, la conexion seguia abierta
          // hasta el timeout).
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

    return { ok: true, html, text: stripHtml(html), finalUrl: url.toString() };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "La página tardó demasiado en responder." : "No se pudo acceder a esa página.";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
