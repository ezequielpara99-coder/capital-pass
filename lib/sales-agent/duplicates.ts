// Normalizacion para detectar prospectos duplicados: la MISMA logica se usa
// para chequear antes de guardar (en la API) y para los indices unicos
// parciales de la base (ultima linea de defensa ante una carrera). Funciones
// puras, sin red ni base.

export function normalizeInstagramUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  // Acepta tanto "@usuario" como una URL de instagram.com/usuario/...
  const urlMatch = /instagram\.com\/([^/?#]+)/i.exec(v);
  if (urlMatch) v = urlMatch[1];
  v = v.replace(/^@/, "").trim().toLowerCase();
  return v || null;
}

export function normalizeWebsiteDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normalizePhoneDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

// Los mismos 10 digitos finales pueden llegar con distinto prefijo de pais/9
// (ej. WhatsApp de Argentina agrega un "9" despues del codigo de pais) -- se
// usan para EMPAREJAR entre si, no para guardar.
export function phoneMatchKey(value: string | null | undefined): string | null {
  const digits = normalizePhoneDigits(value);
  if (!digits) return null;
  return digits.slice(-10) || null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function nameCityKey(name: string | null | undefined, city: string | null | undefined): string | null {
  const slug = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const n = name ? slug(name) : "";
  if (!n) return null;
  const c = city ? slug(city) : "";
  return c ? `${n}|${c}` : n;
}
