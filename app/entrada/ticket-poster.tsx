import type { CSSProperties, ReactNode } from "react";

import {
  TICKET_H,
  TICKET_W,
  ZONES,
  normalizeAccent,
  readableTextOn,
  rgba,
  shade,
  type Zone,
} from "../../lib/tickets/design";

export type TicketPosterProps = {
  accent: string | null | undefined;
  // Arte subido por el organizador. Si no hay, se usa el fondo de Capital Pass.
  backgroundUrl: string | null;
  eventName: string;
  eventMeta: string;
  buyerName: string;
  dni: string;
  ticketTypeName: string;
  manualCode: string;
  number: string;
  qr: ReactNode;
  status?: "used" | "cancelled" | null;
};

const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;

// 1cqw = 1% del ancho de la entrada: los tamaños de letra escalan con ella.
const cq = (px: number) => `${(px / (TICKET_W / 100)).toFixed(3)}cqw`;

function box(zone: Zone): CSSProperties {
  return {
    position: "absolute",
    left: pct(zone.x, TICKET_W),
    top: pct(zone.y, TICKET_H),
    width: pct(zone.w, TICKET_W),
    height: pct(zone.h, TICKET_H),
  };
}

const ellipsis: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export default function TicketPoster({
  accent: accentValue,
  backgroundUrl,
  eventName,
  eventMeta,
  buyerName,
  dni,
  ticketTypeName,
  manualCode,
  number,
  qr,
  status = null,
}: TicketPosterProps) {
  const accent = normalizeAccent(accentValue);
  const light = shade(accent, 0.45);
  const dark = shade(accent, -0.5);
  const eventPillText = readableTextOn(accent);
  const z = ZONES;

  const stampText = status === "used" ? "Utilizada" : status === "cancelled" ? "Anulada" : null;

  return (
    <div
      className="relative w-full select-none overflow-hidden bg-[#050505]"
      style={{ aspectRatio: `${TICKET_W} / ${TICKET_H}`, containerType: "inline-size" }}
    >
      {/* FONDO: arte del organizador o el de Capital Pass */}
      {backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: [
                `radial-gradient(60% 38% at 18% 12%, ${rgba(accent, 0.85)}, transparent 70%)`,
                `radial-gradient(48% 32% at 88% 30%, ${rgba(light, 0.5)}, transparent 70%)`,
                `radial-gradient(75% 42% at 25% 92%, ${rgba(dark, 0.95)}, transparent 70%)`,
                `radial-gradient(45% 28% at 92% 86%, ${rgba(accent, 0.55)}, transparent 70%)`,
                "#050505",
              ].join(","),
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: "-10%",
              top: "32%",
              width: "42%",
              height: "24%",
              background: rgba(light, 0.35),
              filter: `blur(${cq(60)})`,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              right: "-14%",
              bottom: "8%",
              width: "46%",
              height: "26%",
              background: rgba(accent, 0.4),
              filter: `blur(${cq(70)})`,
            }}
          />

          {/* MARCA (solo en el diseño estandar: en el personalizado esa zona es del disenador) */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={box(z.brand)}
          >
            <div className="relative" style={{ width: cq(120), height: cq(120) }}>
              <div
                className="absolute rounded-[45%_55%_65%_35%]"
                style={{
                  inset: "10%",
                  transform: "rotate(-18deg)",
                  background: `linear-gradient(135deg, ${accent}, ${light})`,
                  boxShadow: `0 0 ${cq(50)} ${rgba(accent, 0.55)}`,
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  inset: "18%",
                  background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,.6), transparent 35%)",
                }}
              />
            </div>
            <p
              className="font-black uppercase text-white"
              style={{ fontSize: cq(40), letterSpacing: "0.16em", marginTop: cq(14) }}
            >
              Capital Pass
            </p>
            <p
              className="uppercase text-white/60"
              style={{ fontSize: cq(20), letterSpacing: "0.34em", marginTop: cq(6) }}
            >
              Acceso digital
            </p>
          </div>
        </>
      )}

      {/* TARJETA DE VIDRIO */}
      <div
        aria-hidden="true"
        style={{
          ...box({ x: z.card.x - 14, y: z.card.y - 14, w: z.card.w + 28, h: z.card.h + 28 }),
          borderRadius: cq(z.card.r + 14),
          border: `1px solid ${rgba(light, 0.32)}`,
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(6px)",
        }}
      />
      <div
        style={{
          ...box(z.card),
          borderRadius: cq(z.card.r),
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05) 45%, rgba(0,0,0,0.30))",
          backdropFilter: "blur(22px) saturate(1.3)",
          WebkitBackdropFilter: "blur(22px) saturate(1.3)",
          border: "1px solid rgba(255,255,255,0.30)",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 ${cq(30)} ${cq(90)} rgba(0,0,0,0.45), 0 0 ${cq(80)} ${rgba(accent, 0.22)}`,
        }}
      />

      {/* NOMBRE DEL EVENTO */}
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{
          ...box(z.eventPill),
          borderRadius: 9999,
          background: `linear-gradient(90deg, ${accent}, ${shade(accent, 0.3)})`,
          border: "2px solid rgba(255,255,255,0.30)",
          boxShadow: `0 0 ${cq(50)} ${rgba(accent, 0.5)}, inset 0 1px 0 rgba(255,255,255,0.45)`,
          padding: `0 ${cq(40)}`,
          color: eventPillText,
        }}
      >
        <p
          className="w-full font-black uppercase"
          style={{ ...ellipsis, fontSize: cq(44), letterSpacing: "0.02em", lineHeight: 1.1 }}
        >
          {eventName}
        </p>
        <p
          className="w-full uppercase opacity-85"
          style={{ ...ellipsis, fontSize: cq(21), letterSpacing: "0.16em", marginTop: cq(8) }}
        >
          {eventMeta}
        </p>
      </div>

      {/* TITULO */}
      <div
        className="flex items-center justify-center text-center font-black uppercase leading-[0.95] text-white"
        style={{
          ...box(z.title),
          fontSize: cq(96),
          letterSpacing: "-0.01em",
          textShadow: "0 4px 30px rgba(0,0,0,0.35)",
        }}
      >
        <span>
          Escaneá
          <br />
          este QR
        </span>
      </div>

      {/* PILDORA */}
      <div
        className="flex items-center justify-center font-semibold uppercase text-white/90"
        style={{
          ...box(z.subPill),
          borderRadius: 9999,
          border: `${cq(3)} solid ${light}`,
          fontSize: cq(24),
          letterSpacing: "0.16em",
        }}
      >
        Para acceder al evento
      </div>

      {/* QR */}
      <div
        style={{
          ...box(z.qr),
          borderRadius: cq(z.qr.r),
          background: "#ffffff",
          padding: cq(30),
          boxShadow: `0 0 ${cq(70)} ${rgba(accent, 0.35)}, 0 ${cq(24)} ${cq(60)} rgba(0,0,0,0.35)`,
        }}
      >
        <div
          className="h-full w-full"
          style={status ? { opacity: 0.12, filter: "grayscale(1)" } : undefined}
        >
          {qr}
        </div>

        {stampText && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: "rotate(-12deg)" }}
          >
            <span
              className="border-4 border-solid font-black uppercase"
              style={{
                fontSize: cq(84),
                letterSpacing: "0.06em",
                padding: `${cq(6)} ${cq(30)}`,
                color: status === "used" ? "#c2410c" : "#b91c1c",
                borderColor: status === "used" ? "#c2410c" : "#b91c1c",
                background: "rgba(255,255,255,0.85)",
                borderRadius: cq(16),
              }}
            >
              {stampText}
            </span>
          </div>
        )}
      </div>

      {/* DATOS DEL COMPRADOR */}
      <div
        className="flex flex-col items-center justify-between text-center text-white"
        style={box(z.buyer)}
      >
        <p
          className="w-full font-black uppercase"
          style={{ ...ellipsis, fontSize: cq(40), letterSpacing: "0.01em" }}
        >
          {buyerName}
        </p>
        <p
          className="w-full uppercase text-white/75"
          style={{ ...ellipsis, fontSize: cq(25), letterSpacing: "0.1em" }}
        >
          DNI {dni} · {ticketTypeName}
        </p>
        <p
          className="w-full font-mono font-black"
          style={{ ...ellipsis, fontSize: cq(36), letterSpacing: "0.12em", color: light }}
        >
          {manualCode}
        </p>
      </div>

      {/* PIE */}
      <div
        className="flex items-center justify-center font-semibold uppercase text-white/85"
        style={{
          ...box(z.footPill),
          borderRadius: 9999,
          background: "rgba(255,255,255,0.10)",
          border: `2px solid ${rgba(light, 0.5)}`,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          fontSize: cq(22),
          letterSpacing: "0.14em",
        }}
      >
        Entrada Nº {number} · Capital Pass
      </div>
    </div>
  );
}

// QR de mentira para la vista previa del organizador (no es escaneable).
export function PreviewQr() {
  const size = 25;
  const cells: string[] = [];
  const isFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFinder(x, y)) continue;
      if ((x * 7 + y * 13 + x * y * 3) % 5 < 2) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" shapeRendering="crispEdges" aria-hidden="true">
      <path d={cells.join("")} fill="#050505" />
      <Finder x={0} y={0} />
      <Finder x={size - 7} y={0} />
      <Finder x={0} y={size - 7} />
    </svg>
  );
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#050505">
      <path d={`M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5z`} fillRule="evenodd" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
}
