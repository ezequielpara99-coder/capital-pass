import { deflateSync } from "node:zlib";

// Mini rasterizador para los fondos del PDF (degradados y brillos). pdf-lib no
// dibuja degradados, asi que se generan como PNG y se incrustan como imagen.

export type RGB = [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export class Raster {
  readonly data: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 4);
  }

  fill(color: RGB, alpha = 1) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = color[0];
      this.data[i + 1] = color[1];
      this.data[i + 2] = color[2];
      this.data[i + 3] = Math.round(alpha * 255);
    }
    return this;
  }

  private blend(index: number, color: RGB, alpha: number) {
    if (alpha <= 0) return;
    const a = clamp01(alpha);
    const d = this.data;
    d[index] = Math.round(d[index] + (color[0] - d[index]) * a);
    d[index + 1] = Math.round(d[index + 1] + (color[1] - d[index + 1]) * a);
    d[index + 2] = Math.round(d[index + 2] + (color[2] - d[index + 2]) * a);
  }

  // Degradado vertical entre paradas t (0 arriba, 1 abajo).
  verticalGradient(stops: { t: number; color: RGB }[]) {
    for (let y = 0; y < this.height; y++) {
      const t = this.height > 1 ? y / (this.height - 1) : 0;
      let lower = stops[0];
      let upper = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s].t && t <= stops[s + 1].t) {
          lower = stops[s];
          upper = stops[s + 1];
          break;
        }
      }
      const span = upper.t - lower.t || 1;
      const k = clamp01((t - lower.t) / span);
      const color: RGB = [
        Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * k),
        Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * k),
        Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * k),
      ];
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        this.data[i] = color[0];
        this.data[i + 1] = color[1];
        this.data[i + 2] = color[2];
        this.data[i + 3] = 255;
      }
    }
    return this;
  }

  // Brillo suave (elipse con caida cuadratica). Coordenadas y radios en fraccion del tamaño.
  glow(cx: number, cy: number, rx: number, ry: number, color: RGB, strength: number) {
    const px = cx * this.width;
    const py = cy * this.height;
    const radiusX = rx * this.width;
    const radiusY = ry * this.height;
    for (let y = 0; y < this.height; y++) {
      const dy = (y - py) / radiusY;
      if (Math.abs(dy) >= 1) continue;
      for (let x = 0; x < this.width; x++) {
        const dx = (x - px) / radiusX;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 1) continue;
        const falloff = 1 - dist;
        this.blend((y * this.width + x) * 4, color, strength * falloff * falloff);
      }
    }
    return this;
  }

  // Elipse solida con borde suave (para recortar la "colina" oscura del encabezado).
  softEllipse(cx: number, cy: number, rx: number, ry: number, color: RGB, feather: number, alpha = 1) {
    const px = cx * this.width;
    const py = cy * this.height;
    const radiusX = rx * this.width;
    const radiusY = ry * this.height;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = (x - px) / radiusX;
        const dy = (y - py) / radiusY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.blend((y * this.width + x) * 4, color, alpha * (1 - smooth(1 - feather, 1, dist)));
      }
    }
    return this;
  }

  // Borde luminoso fino sobre el contorno de una elipse.
  ellipseRim(cx: number, cy: number, rx: number, ry: number, color: RGB, width: number, strength: number) {
    const px = cx * this.width;
    const py = cy * this.height;
    const radiusX = rx * this.width;
    const radiusY = ry * this.height;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = (x - px) / radiusX;
        const dy = (y - py) / radiusY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const k = 1 - Math.min(1, Math.abs(dist - 1) / width);
        if (k > 0) this.blend((y * this.width + x) * 4, color, strength * k * k);
      }
    }
    return this;
  }

  // Oscurece hacia un color al pie de la imagen (para fundir el encabezado con el fondo).
  fadeBottom(color: RGB, from: number) {
    for (let y = 0; y < this.height; y++) {
      const k = smooth(from, 1, y / (this.height - 1));
      if (k <= 0) continue;
      for (let x = 0; x < this.width; x++) this.blend((y * this.width + x) * 4, color, k);
    }
    return this;
  }

  // Recorta esquinas redondeadas (radio en px) con borde suavizado.
  roundCorners(radius: number) {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const qx = Math.abs(x + 0.5 - halfW) - (halfW - radius);
        const qy = Math.abs(y + 0.5 - halfH) - (halfH - radius);
        const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius;
        const coverage = clamp01(0.5 - outside);
        const i = (y * this.width + x) * 4 + 3;
        this.data[i] = Math.round(this.data[i] * coverage);
      }
    }
    return this;
  }

  toPng() {
    const stride = this.width * 4;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (stride + 1)] = 0;
      Buffer.from(this.data.buffer, this.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; // bits por canal
    header[9] = 6; // RGBA

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

// --- Fondos concretos --------------------------------------------------------

// Diseño: indigo muy oscuro con brillos lila en los bordes.
export function designBackgroundPng() {
  return new Raster(360, 510)
    .fill([7, 3, 26])
    .glow(0, 0.12, 0.62, 0.3, [167, 139, 250], 0.85)
    .glow(1, 0.56, 0.6, 0.32, [139, 92, 246], 0.8)
    .glow(0, 0.9, 0.55, 0.28, [109, 40, 217], 0.55)
    .glow(0.5, 0, 0.6, 0.18, [76, 29, 149], 0.35)
    .toPng();
}

// Diseño: tarjeta lila con degradado vertical (alto y ancho en px).
export function designCardPng(width: number, height: number, radius: number) {
  return new Raster(width, height)
    .verticalGradient([
      { t: 0, color: [156, 117, 240] },
      { t: 0.55, color: [110, 68, 205] },
      { t: 1, color: [82, 48, 168] },
    ])
    .glow(0.1, 0.02, 0.7, 0.35, [255, 255, 255], 0.16)
    .roundCorners(radius)
    .toPng();
}

// Rentals: banda superior negra con ola azul -> naranja, se funde con el negro.
export function rentalBannerPng() {
  return new Raster(480, 250)
    .fill([0, 0, 0])
    .glow(0.06, 0.6, 0.5, 0.9, [47, 91, 214], 0.95)
    .glow(0.9, 0.28, 0.5, 0.85, [255, 106, 50], 0.95)
    .glow(0.55, 0.52, 0.22, 0.4, [235, 60, 40], 0.85)
    .ellipseRim(0.5, 1.25, 0.46, 0.85, [255, 190, 150], 0.09, 0.55)
    .softEllipse(0.5, 1.25, 0.46, 0.85, [0, 0, 0], 0.06)
    .fadeBottom([0, 0, 0], 0.72)
    .toPng();
}
