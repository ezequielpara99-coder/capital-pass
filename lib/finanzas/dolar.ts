import "server-only";
import type { DollarRates } from "./fixed";

type DolarApiRow = { casa: string; venta: number; fechaActualizacion?: string };

// Cotizacion del dolar del dia desde dolarapi.com (publica y gratuita, sin
// clave). Se cachea 30 minutos. Si falla, devuelve null y la pantalla lo
// avisa en vez de usar un numero viejo o inventado.
export async function fetchDollarRates(): Promise<DollarRates | null> {
  try {
    const response = await fetch("https://dolarapi.com/v1/dolares", {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as DolarApiRow[];
    const find = (casa: string) => rows.find((row) => row.casa === casa);
    const oficial = find("oficial");
    const blue = find("blue");
    const mep = find("bolsa");
    const tarjeta = find("tarjeta");
    if (!oficial || !blue || !mep || !tarjeta) return null;
    const dates = [oficial, blue, mep, tarjeta].map((row) => row.fechaActualizacion).filter(Boolean) as string[];
    return {
      oficial: Number(oficial.venta),
      blue: Number(blue.venta),
      mep: Number(mep.venta),
      tarjeta: Number(tarjeta.venta),
      updatedAt: dates.sort().at(-1) ?? null,
    };
  } catch {
    return null;
  }
}
