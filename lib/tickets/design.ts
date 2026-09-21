// Diseño estandar de la entrada digital: una tarjeta de vidrio sobre un fondo
// (el de Capital Pass, o el arte que suba el organizador). La entrada real y
// la plantilla descargable para disenadores salen de las MISMAS medidas, asi
// lo que el disenador ve en la plantilla es exactamente donde va cada cosa.

export const TICKET_W = 1080;
export const TICKET_H = 1920;

export const DEFAULT_TICKET_ACCENT = "#ff3b24";

export const ACCENT_PRESETS = [
  { name: "Naranja", value: "#ff3b24" },
  { name: "Rojo", value: "#e11d48" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Violeta", value: "#8b5cf6" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Celeste", value: "#06b6d4" },
  { name: "Verde", value: "#10b981" },
  { name: "Dorado", value: "#f59e0b" },
] as const;

export type Zone = { x: number; y: number; w: number; h: number; r?: number };

export const ZONES = {
  brand: { x: 240, y: 110, w: 600, h: 220 },
  eventPill: { x: 150, y: 400, w: 780, h: 150 },
  card: { x: 80, y: 470, w: 920, h: 1290, r: 72 },
  title: { x: 140, y: 610, w: 800, h: 200 },
  subPill: { x: 280, y: 850, w: 520, h: 74 },
  qr: { x: 260, y: 975, w: 560, h: 560, r: 46 },
  buyer: { x: 120, y: 1570, w: 840, h: 170 },
  footPill: { x: 250, y: 1800, w: 580, h: 76 },
} as const satisfies Record<string, Zone>;

export function normalizeAccent(value: string | null | undefined) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : DEFAULT_TICKET_ACCENT;
}

function channels(hex: string) {
  const value = normalizeAccent(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgba(hex: string, alpha: number) {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Mezcla el color con blanco (t>0) o con negro (t<0). t entre -1 y 1.
export function shade(hex: string, t: number) {
  const target = t >= 0 ? 255 : 0;
  const amount = Math.abs(t);
  const mixed = channels(hex).map((c) => Math.round(c + (target - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Plantilla tecnica para disenadores (1080 x 1920). Muestra donde va cada
// pieza de la entrada y que zonas quedan libres para el arte.
export function buildTicketTemplateSvg(accentColor: string) {
  const accent = normalizeAccent(accentColor);
  const light = shade(accent, 0.45);
  const z = ZONES;

  const zone = (
    zoneBox: Zone,
    label: string,
    options: { fill?: string; dash?: boolean; labelSize?: number; labelDy?: number } = {}
  ) => {
    const fill = options.fill ?? rgba(accent, 0.1);
    const dash = options.dash ? ' stroke-dasharray="14 10"' : "";
    const size = options.labelSize ?? 24;
    const radius = zoneBox.r ?? 20;
    const dy = options.labelDy ?? size + 14;
    return `<rect x="${zoneBox.x}" y="${zoneBox.y}" width="${zoneBox.w}" height="${zoneBox.h}" rx="${radius}" fill="${fill}" stroke="${accent}" stroke-width="3"${dash}/>
  <text x="${zoneBox.x + 20}" y="${zoneBox.y + dy}" fill="${light}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700">${label}</text>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TICKET_W}" height="${TICKET_H}" viewBox="0 0 ${TICKET_W} ${TICKET_H}">
  <defs>
    <radialGradient id="g1" cx="20%" cy="12%" r="60%"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="85%" cy="88%" r="55%"><stop offset="0" stop-color="${light}" stop-opacity=".35"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${TICKET_W}" height="${TICKET_H}" fill="#111111"/>
  <rect width="${TICKET_W}" height="${TICKET_H}" fill="url(#g1)"/>
  <rect width="${TICKET_W}" height="${TICKET_H}" fill="url(#g2)"/>

  <text x="60" y="64" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">ARTE DE LA ENTRADA · 1080 × 1920 px</text>
  <text x="60" y="100" fill="#ffffff" fill-opacity=".6" font-family="Arial, Helvetica, sans-serif" font-size="20">Diseñá el fondo completo. Se ve NÍTIDO afuera de la tarjeta y DESENFOCADO a través del vidrio.</text>

  ${zone(z.brand, "ZONA LIBRE SUPERIOR · logo, artista, arte del evento", { fill: "rgba(255,255,255,0.04)", dash: true })}

  ${zone(z.eventPill, "NOMBRE DEL EVENTO · fecha · lugar (automático)", { labelSize: 22 })}

  ${zone(z.card, "TARJETA DE VIDRIO CAPITAL PASS", { fill: "rgba(255,255,255,0.08)", dash: true, labelSize: 22, labelDy: 100 })}
  <text x="${z.card.x + 20}" y="${z.card.y + 126}" fill="#ffffff" fill-opacity=".55" font-family="Arial, Helvetica, sans-serif" font-size="17">No poner caras, logos ni textos importantes dentro de las zonas marcadas.</text>

  ${zone(z.title, "TÍTULO «ESCANEÁ ESTE QR» (automático)", { fill: "rgba(255,255,255,0.02)", dash: true, labelSize: 22 })}
  ${zone(z.subPill, "PARA ACCEDER AL EVENTO", { labelSize: 20 })}

  <rect x="${z.qr.x}" y="${z.qr.y}" width="${z.qr.w}" height="${z.qr.h}" rx="${z.qr.r}" fill="#ffffff" stroke="${accent}" stroke-width="5"/>
  <text x="${z.qr.x + z.qr.w / 2}" y="${z.qr.y + z.qr.h / 2 + 10}" fill="#111111" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" text-anchor="middle">QR DE ACCESO</text>
  <text x="${z.qr.x + z.qr.w / 2}" y="${z.qr.y + z.qr.h / 2 + 50}" fill="#111111" fill-opacity=".6" font-family="Arial, Helvetica, sans-serif" font-size="22" text-anchor="middle">560 × 560 px · único por entrada</text>

  ${zone(z.buyer, "NOMBRE Y APELLIDO · DNI · TIPO DE ENTRADA · CÓDIGO MANUAL", { fill: "rgba(255,255,255,0.02)", dash: true, labelSize: 20 })}

  ${zone(z.footPill, "ENTRADA Nº · CAPITAL PASS", { labelSize: 20, labelDy: 46 })}

  <text x="60" y="${TICKET_H - 14}" fill="#ffffff" fill-opacity=".5" font-family="Arial, Helvetica, sans-serif" font-size="16">Capital Pass · Plantilla técnica de entrada · Las zonas con borde son automáticas y no se diseñan.</text>
</svg>`;
}
