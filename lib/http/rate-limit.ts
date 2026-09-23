import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "../supabase/admin";

// Vercel siempre agrega x-forwarded-for con la IP real del cliente primero
// en la lista (los proxies intermedios se van agregando despues).
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Envuelve cp_check_rate_limit (ventana fija guardada en la base, ver
// migracion 20260950). Si la consulta a la base falla por algun motivo,
// no bloqueamos la request real por un problema del limitador en si --
// se deja pasar y se loguea.
export async function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cp_check_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("RATE LIMIT: no se pudo verificar, se deja pasar la request.", error);
    return true;
  }
  return Boolean(data);
}
