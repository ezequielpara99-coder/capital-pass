import { isIP } from "node:net";

// Direcciones a las que "investigar prospecto" nunca puede entrar (red interna,
// loopback, metadata de la nube, etc). Ver fetchProspectPage en investigate.ts.
export function isPrivateOrReservedIp(ip: string): boolean {
  const type = isIP(ip);
  if (type === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // privada
    if (a === 172 && b >= 16 && b <= 31) return true; // privada
    if (a === 192 && b === 168) return true; // privada
    if (a === 169 && b === 254) return true; // link-local (incluye metadata cloud)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // pruebas de red
    if (a === 0 || a >= 224) return true; // "esta red", multicast y reservadas
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / sin especificar
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA privada
    // IPv4 "disfrazada" de IPv6 (::ffff:127.0.0.1 o ::ffff:7f00:1): se
    // revisa la IPv4 de adentro -- si no, pasaba el filtro y se podia
    // llegar a una direccion interna.
    const mapped = /^::ffff:(.+)$/.exec(lower)?.[1];
    if (mapped) {
      if (isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
      if (hex) {
        const high = parseInt(hex[1], 16);
        const low = parseInt(hex[2], 16);
        return isPrivateOrReservedIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
      }
      return true;
    }
    return false;
  }
  return true; // no es una IP valida -> no confiar
}
