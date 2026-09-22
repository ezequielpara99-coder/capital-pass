import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { designBackgroundPng, designCardPng, rentalBannerPng } from "./raster";
import {
  computeTotals,
  contentCount,
  DiscountType,
  formatMoney,
  formatQuantity,
  itemTotal,
  KIND_LABEL,
  Modality,
  MODALITY_LABEL,
  MONTHLY_DISCOUNT_LABEL,
  PriceMode,
  QuoteItem,
  QuoteKind,
  quoteCode,
} from "./totals";

export type QuoteForPdf = {
  number: number;
  kind: QuoteKind;
  client_name: string;
  client_contact: string | null;
  client_phone: string | null;
  client_email: string | null;
  title: string | null;
  event_name: string | null;
  modality: Modality | null;
  items: QuoteItem[];
  price_mode: PriceMode;
  package_price_minor: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_label: string | null;
  notes: string | null;
  valid_days: number;
  created_at: string;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 62;

type Color = ReturnType<typeof rgb>;

type Fonts = { regular: PDFFont; bold: PDFFont; boldItalic: PDFFont };

type Block = {
  h: number;
  inCard?: boolean;
  isItem?: boolean;
  draw: (page: PDFPage, top: number) => void;
};

// La fuente estandar solo entiende WinAnsi: se reemplaza lo que no se pueda dibujar.
function makeSafe(font: PDFFont) {
  const replacements: Record<string, string> = {
    "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "→": "->", " ": " ",
  };
  return (text: string) => {
    let out = "";
    for (const char of text.replace(/\r/g, "").replace(/[‘’“”–—→ ]/g, (m) => replacements[m])) {
      if (char === "\n") { out += char; continue; }
      try {
        font.encodeText(char);
        out += char;
      } catch {
        out += "?";
      }
    }
    return out;
  };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }

      if (current) lines.push(current);
      // Palabra mas larga que la linea: se corta.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  return lines;
}

function supportWhatsApp() {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && !/X/i.test(raw) ? `+${digits}` : null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(value);
}

function fitSize(text: string, font: PDFFont, maxSize: number, minSize: number, maxWidth: number) {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function roundedPath(w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  return `M ${radius},0 H ${w - radius} A ${radius},${radius} 0 0 1 ${w},${radius} V ${h - radius} A ${radius},${radius} 0 0 1 ${w - radius},${h} H ${radius} A ${radius},${radius} 0 0 1 0,${h - radius} V ${radius} A ${radius},${radius} 0 0 1 ${radius},0 Z`;
}

export async function buildQuotePdf(quote: QuoteForPdf) {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const safe = makeSafe(fonts.regular);

  const isDesign = quote.kind === "diseno";
  const code = quoteCode(quote.number);
  const created = new Date(quote.created_at);
  const validUntil = new Date(created.getTime() + quote.valid_days * 86400000);
  const showPrices = quote.price_mode === "items";
  const totals = computeTotals(
    quote.items,
    quote.discount_type,
    quote.discount_value,
    showPrices ? null : quote.package_price_minor
  );
  const whatsapp = supportWhatsApp();

  const white = rgb(1, 1, 1);
  const palette = isDesign
    ? { text: white, muted: rgb(0.74, 0.7, 0.88), accent: rgb(0.7, 0.6, 1), line: rgb(1, 1, 1) }
    : { text: white, muted: rgb(0.5, 0.5, 0.52), accent: rgb(1, 0.4, 0.24), line: rgb(0.19, 0.19, 0.2) };

  pdf.setTitle(`Presupuesto ${code} - ${safe(quote.client_name)}`);
  pdf.setAuthor("CapitalStudio");
  pdf.setCreator("Capital Pass");

  const bgImage: PDFImage = isDesign
    ? await pdf.embedPng(designBackgroundPng())
    : await pdf.embedPng(rentalBannerPng());

  // --- Primitivas de dibujo -------------------------------------------------
  const text = (
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont = fonts.regular,
    color: Color = palette.text,
    opacity = 1
  ) => page.drawText(safe(value), { x, y, size, font, color, opacity });

  const textRight = (
    page: PDFPage,
    value: string,
    rightX: number,
    y: number,
    size: number,
    font: PDFFont = fonts.regular,
    color: Color = palette.text
  ) => {
    const cleaned = safe(value);
    page.drawText(cleaned, { x: rightX - font.widthOfTextAtSize(cleaned, size), y, size, font, color });
  };

  const pill = (
    page: PDFPage,
    x: number,
    top: number,
    w: number,
    h: number,
    fill: Color,
    opacity: number,
    border?: Color
  ) =>
    page.drawSvgPath(roundedPath(w, h, h / 2), {
      x,
      y: top,
      color: fill,
      opacity,
      ...(border ? { borderColor: border, borderWidth: 0.7, borderOpacity: 0.6 } : {}),
    });

  const logoMark = (page: PDFPage, cx: number, cy: number, radius: number, fill: Color, ink: Color) => {
    page.drawCircle({ x: cx, y: cy, size: radius, color: fill });
    const size = radius * 1.35;
    const letter = "C";
    text(page, letter, cx - fonts.bold.widthOfTextAtSize(letter, size) / 2, cy - size * 0.35, size, fonts.bold, ink);
  };

  // --- Encabezados de pagina ------------------------------------------------
  const wordmark = (page: PDFPage, y: number) => {
    logoMark(page, MARGIN + 13, y + 4, 13, white, rgb(0.1, 0.05, 0.3));
    text(page, "CAPITALSTUDIO", MARGIN + 34, y, 13, fonts.bold, white);
  };

  // Devuelve la coordenada Y desde la que empieza el contenido.
  const drawDesignChrome = (page: PDFPage, first: boolean) => {
    page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    const headY = PAGE_H - 52;
    wordmark(page, headY);
    textRight(page, `PRESUPUESTO ${code}`, PAGE_W - MARGIN, headY + 3, 9.5, fonts.bold, palette.muted);
    textRight(page, formatDate(created), PAGE_W - MARGIN, headY - 10, 8.5, fonts.regular, palette.muted);

    if (!first) return PAGE_H - 88;

    // Barra de cliente
    const barTop = PAGE_H - 88;
    const barH = 50;
    page.drawSvgPath(roundedPath(CONTENT_W, barH, 14), { x: MARGIN, y: barTop, color: rgb(0.16, 0.16, 0.19), opacity: 0.92 });
    text(page, "Cliente", MARGIN + 24, barTop - 31, 15, fonts.bold, white);

    const name = safe(quote.client_name);
    const nameSize = fitSize(name, fonts.boldItalic, 20, 11, CONTENT_W - 150);
    textRight(page, name, PAGE_W - MARGIN - 24, barTop - 32, nameSize, fonts.boldItalic, white);

    // Etiquetas: fiesta / modalidad / cantidad de contenido
    const chips: string[] = [];
    if (quote.event_name) chips.push(`Fiesta: ${quote.event_name}`);
    if (quote.modality) chips.push(MODALITY_LABEL[quote.modality]);
    const pieces = contentCount(quote.items);
    if (pieces > 0) chips.push(`${formatQuantity(pieces)} ${pieces === 1 ? "pieza" : "piezas"} de contenido`);

    let chipX = MARGIN;
    let chipTop = barTop - barH - 14;
    for (const chip of chips) {
      const label = safe(chip);
      const w = fonts.bold.widthOfTextAtSize(label, 9.5) + 26;
      if (chipX + w > PAGE_W - MARGIN && chipX > MARGIN) { chipX = MARGIN; chipTop -= 28; }
      pill(page, chipX, chipTop, w, 21, rgb(0.6, 0.42, 0.98), 0.22, palette.accent);
      text(page, label, chipX + 13, chipTop - 14.5, 9.5, fonts.bold, rgb(0.92, 0.89, 1));
      chipX += w + 8;
    }

    return chips.length ? chipTop - 21 - 20 : barTop - barH - 22;
  };

  const drawRentalChrome = (page: PDFPage, first: boolean) => {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0, 0, 0) });

    if (!first) {
      wordmark(page, PAGE_H - 44);
      textRight(page, `${code} · ${quote.client_name}`, PAGE_W - MARGIN, PAGE_H - 44, 9, fonts.regular, palette.muted);
      return PAGE_H - 84;
    }

    const bannerH = (PAGE_W * 250) / 480;
    page.drawImage(bgImage, { x: 0, y: PAGE_H - bannerH, width: PAGE_W, height: bannerH });

    const rowY = PAGE_H - 244;
    logoMark(page, MARGIN + 16, rowY, 16, white, rgb(0.05, 0.05, 0.05));
    textRight(page, code, PAGE_W - MARGIN, rowY - 3, 11, fonts.bold, white);

    const title = "PRESUPUESTO";
    text(page, title, MARGIN, rowY - 62, 46, fonts.bold, white);

    // Desde / Para / Emitido
    const metaTop = rowY - 100;
    const col2 = MARGIN + 190;
    const label = (value: string, x: number, y: number, right = false) =>
      right
        ? textRight(page, value, PAGE_W - MARGIN, y, 6.5, fonts.bold, palette.muted)
        : text(page, value, x, y, 6.5, fonts.bold, palette.muted);

    label("DESDE", MARGIN, metaTop);
    label("PARA", col2, metaTop);
    label("EMITIDO", 0, metaTop, true);

    let fromY = metaTop - 15;
    text(page, "CapitalStudio", MARGIN, fromY, 10.5, fonts.bold, white);
    fromY -= 13;
    for (const line of ["Capital Rentals", "Instagram @capitalpass.ar", ...(whatsapp ? [`WhatsApp ${whatsapp}`] : [])]) {
      text(page, line, MARGIN, fromY, 8.5, fonts.regular, palette.muted);
      fromY -= 12;
    }

    let toY = metaTop - 15;
    for (const wrapped of wrap(safe(quote.client_name), fonts.bold, 10.5, 210)) {
      text(page, wrapped, col2, toY, 10.5, fonts.bold, white);
      toY -= 13;
    }
    for (const line of [quote.client_contact, quote.client_phone, quote.client_email]) {
      if (!line) continue;
      text(page, line, col2, toY, 8.5, fonts.regular, palette.muted);
      toY -= 12;
    }

    textRight(page, formatDate(created), PAGE_W - MARGIN, metaTop - 15, 10, fonts.regular, white);
    label("VÁLIDO HASTA", 0, metaTop - 36, true);
    textRight(page, formatDate(validUntil), PAGE_W - MARGIN, metaTop - 51, 10, fonts.regular, white);

    return Math.min(fromY, toY, metaTop - 60) - 26;
  };

  // --- Bloques de contenido -------------------------------------------------
  const blocks: Block[] = [];
  let rentalHeader: (() => Block) | null = null;
  const CARD_PAD_X = 26;
  const listX = isDesign ? MARGIN + CARD_PAD_X + 6 : MARGIN;
  const listW = isDesign ? CONTENT_W - CARD_PAD_X * 2 - 6 : CONTENT_W;

  const qtyColW = 60;
  const priceColW = 84;
  const amountColW = 88;

  if (isDesign) {
    const subtitle = quote.event_name || quote.title || "contenido";
    blocks.push({
      h: 96,
      inCard: true,
      draw: (page, top) => {
        logoMark(page, MARGIN + CARD_PAD_X + 25, top - 30, 25, white, rgb(0.13, 0.08, 0.36));
        text(page, "Contenido", MARGIN + CARD_PAD_X + 64, top - 30, 31, fonts.bold, white);
        const sub = safe(subtitle);
        text(page, sub, MARGIN + CARD_PAD_X + 65, top - 50, fitSize(sub, fonts.bold, 13, 9, CONTENT_W - 260), fonts.bold, rgb(0.84, 0.78, 1));

        const label = "A pagar";
        const size = 15;
        const w = fonts.boldItalic.widthOfTextAtSize(label, size) + 30;
        const x = PAGE_W - MARGIN - CARD_PAD_X - w;
        page.drawSvgPath(roundedPath(w, 34, 7), { x, y: top - 6, color: rgb(0.92, 0.9, 1) });
        text(page, label, x + 15, top - 28, size, fonts.boldItalic, rgb(0.2, 0.1, 0.5));

        page.drawLine({
          start: { x: MARGIN + CARD_PAD_X, y: top - 74 },
          end: { x: PAGE_W - MARGIN - CARD_PAD_X, y: top - 74 },
          thickness: 0.8,
          color: white,
          opacity: 0.35,
        });
      },
    });
  } else {
    const tableHeader = (): Block => ({
      h: 26,
      draw: (page, top) => {
        text(page, "DESCRIPCIÓN", listX, top - 8, 6.5, fonts.bold, palette.muted);
        const qtyRight = PAGE_W - MARGIN - (showPrices ? priceColW + amountColW : 0);
        textRight(page, "CANT.", qtyRight, top - 8, 6.5, fonts.bold, palette.muted);
        if (showPrices) {
          textRight(page, "PRECIO", PAGE_W - MARGIN - amountColW, top - 8, 6.5, fonts.bold, palette.muted);
          textRight(page, "IMPORTE", PAGE_W - MARGIN, top - 8, 6.5, fonts.bold, palette.muted);
        }
        page.drawLine({ start: { x: MARGIN, y: top - 18 }, end: { x: PAGE_W - MARGIN, y: top - 18 }, thickness: 0.6, color: palette.line });
      },
    });
    rentalHeader = tableHeader;
    blocks.push(tableHeader());
  }

  if (quote.items.length === 0) {
    blocks.push({
      h: 28,
      inCard: isDesign,
      isItem: true,
      draw: (page, top) => text(page, "Sin contenido cargado.", listX, top - 16, 10, fonts.regular, palette.muted),
    });
  }

  for (const item of quote.items) {
    if (isDesign) {
      const prefix = item.quantity !== 1 ? `${formatQuantity(item.quantity)} × ` : "";
      const priceW = showPrices ? amountColW : 0;
      const lines = wrap(safe(`${prefix}${item.description}`), fonts.bold, 11.5, listW - 12 - priceW);
      blocks.push({
        h: lines.length * 15 + 5,
        inCard: true,
        isItem: true,
        draw: (page, top) => {
          lines.forEach((line, index) => {
            text(page, index === 0 ? `- ${line}` : `  ${line}`, listX, top - 12 - index * 15, 11.5, fonts.bold, white);
          });
          if (showPrices) textRight(page, formatMoney(itemTotal(item)), PAGE_W - MARGIN - CARD_PAD_X, top - 12, 11, fonts.bold, white);
        },
      });
    } else {
      const descW = listW - qtyColW - (showPrices ? priceColW + amountColW : 0) - 8;
      const lines = wrap(safe(item.description), fonts.regular, 10.5, descW);
      blocks.push({
        h: lines.length * 14 + 20,
        isItem: true,
        draw: (page, top) => {
          lines.forEach((line, index) => text(page, line, listX, top - 17 - index * 14, 10.5, fonts.regular, white));
          const qtyRight = PAGE_W - MARGIN - (showPrices ? priceColW + amountColW : 0);
          textRight(page, `${formatQuantity(item.quantity)} ${item.unit}`, qtyRight, top - 17, 10, fonts.regular, palette.muted);
          if (showPrices) {
            textRight(page, formatMoney(item.unit_price_minor), PAGE_W - MARGIN - amountColW, top - 17, 10, fonts.regular, palette.muted);
            textRight(page, formatMoney(itemTotal(item)), PAGE_W - MARGIN, top - 17, 10.5, fonts.bold, white);
          }
          page.drawLine({
            start: { x: MARGIN, y: top - (lines.length * 14 + 20) + 4 },
            end: { x: PAGE_W - MARGIN, y: top - (lines.length * 14 + 20) + 4 },
            thickness: 0.5,
            color: palette.line,
          });
        },
      });
    }
  }

  // Totales
  const discountLabel =
    (quote.discount_label || (quote.modality === "mensual" && isDesign ? MONTHLY_DISCOUNT_LABEL : "Descuento")) +
    (quote.discount_type === "percent" ? ` (${formatQuantity(quote.discount_value)}%)` : "");
  const showBreakdown = totals.discount > 0;

  if (isDesign) {
    const rows = showBreakdown ? 2 : 0;
    blocks.push({
      h: 30 + rows * 20 + 46,
      inCard: true,
      draw: (page, top) => {
        page.drawLine({
          start: { x: MARGIN + CARD_PAD_X, y: top - 12 },
          end: { x: PAGE_W - MARGIN - CARD_PAD_X, y: top - 12 },
          thickness: 0.8,
          color: white,
          opacity: 0.35,
        });
        let y = top - 34;
        if (showBreakdown) {
          text(page, "Subtotal", listX, y, 11, fonts.regular, rgb(0.9, 0.86, 1));
          textRight(page, formatMoney(totals.subtotal), PAGE_W - MARGIN - CARD_PAD_X, y, 11, fonts.regular, rgb(0.9, 0.86, 1));
          y -= 20;
          text(page, discountLabel, listX, y, 11, fonts.regular, rgb(0.9, 0.86, 1));
          textRight(page, `- ${formatMoney(totals.discount)}`, PAGE_W - MARGIN - CARD_PAD_X, y, 11, fonts.regular, rgb(0.9, 0.86, 1));
          y -= 30;
        } else {
          y -= 6;
        }
        text(page, `TOTAL - ${formatMoney(totals.total)}`, listX, y, 22, fonts.bold, white);
      },
    });
  } else {
    const rows = showBreakdown ? 2 : 0;
    blocks.push({
      h: 20 + rows * 20 + 34,
      draw: (page, top) => {
        const labelX = PAGE_W - MARGIN - 230;
        let y = top - 20;
        if (showBreakdown) {
          text(page, "Subtotal", labelX, y, 10, fonts.regular, palette.muted);
          textRight(page, formatMoney(totals.subtotal), PAGE_W - MARGIN, y, 10, fonts.regular, white);
          y -= 20;
          text(page, discountLabel, labelX, y, 10, fonts.regular, palette.muted);
          textRight(page, `- ${formatMoney(totals.discount)}`, PAGE_W - MARGIN, y, 10, fonts.regular, white);
          y -= 12;
        }
        page.drawLine({ start: { x: labelX, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.6, color: palette.line });
        text(page, "Total", labelX, y - 16, 12, fonts.bold, white);
        textRight(page, formatMoney(totals.total), PAGE_W - MARGIN, y - 16, 14, fonts.bold, white);
      },
    });
  }

  // Notas y condiciones (fuera de la tarjeta). Todo presupuesto de diseño
  // lleva siempre la condicion de pago y los datos de pago fijos -- no
  // dependen de lo que se haya escrito en "notas" de ese presupuesto puntual.
  const paymentTerms = isDesign
    ? "Se solicita la totalidad del pago para iniciar el proyecto (en el caso de ser trabajo mensual, la seña será del 35% y el resto en una fecha acordada con el cliente). "
    : "";
  const conditions = `${paymentTerms}Presupuesto válido por ${quote.valid_days} días (hasta el ${formatDate(validUntil)}). Precios en pesos argentinos.`;
  const noteBlocks = [
    ...(quote.notes ? [{ title: "NOTAS", body: quote.notes }] : []),
    { title: "CONDICIONES", body: conditions },
    ...(isDesign ? [{ title: "DATOS DE PAGO", body: "Alias: capitaldesing\nCBU: 1430001713001164190015" }] : []),
  ];

  blocks.push({ h: 16, draw: () => {} });
  for (const note of noteBlocks) {
    blocks.push({
      h: 18,
      draw: (page, top) => text(page, note.title, MARGIN, top - 10, 7, fonts.bold, palette.accent),
    });
    for (const line of wrap(safe(note.body), fonts.regular, 9.5, CONTENT_W)) {
      blocks.push({
        h: 13,
        draw: (page, top) => text(page, line, MARGIN, top - 9, 9.5, fonts.regular, isDesign ? rgb(0.86, 0.83, 0.96) : rgb(0.72, 0.72, 0.74)),
      });
    }
    blocks.push({ h: 8, draw: () => {} });
  }

  // --- Paginado ---------------------------------------------------------------
  const pages: PDFPage[] = [];
  const CARD_PAD_Y = 22;
  const startPage = () => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    const top = isDesign ? drawDesignChrome(page, pages.length === 1) : drawRentalChrome(page, pages.length === 1);
    return { page, top };
  };

  let cursor = 0;
  while (cursor < blocks.length) {
    const { page, top } = startPage();
    const available = top - BOTTOM;
    const pageBlocks: Block[] = [];
    let used = 0;
    let cardOpen = false;

    // El encabezado de tabla (rentals) se repite si la pagina arranca con items.
    if (!isDesign && pages.length > 1 && rentalHeader && blocks[cursor].isItem) {
      const header = rentalHeader();
      pageBlocks.push(header);
      used += header.h;
    }

    while (cursor < blocks.length) {
      const block = blocks[cursor];
      const extra = block.inCard && !cardOpen ? CARD_PAD_Y * 2 : 0;
      if (used + extra + block.h > available && pageBlocks.length > 0) break;
      if (block.inCard) cardOpen = true;
      pageBlocks.push(block);
      used += extra + block.h;
      cursor++;
    }

    // Tarjeta de fondo (diseño): cubre los bloques `inCard` de esta pagina.
    const cardBlocks = pageBlocks.filter((b) => b.inCard);
    let y = top;
    if (isDesign && cardBlocks.length > 0) {
      const cardH = cardBlocks.reduce((sum, b) => sum + b.h, 0) + CARD_PAD_Y * 2;
      const pxPerPt = 1.6;
      const card = await pdf.embedPng(designCardPng(Math.round(CONTENT_W * pxPerPt), Math.round(cardH * pxPerPt), Math.round(20 * pxPerPt)));
      page.drawImage(card, { x: MARGIN, y: top - cardH, width: CONTENT_W, height: cardH });
      y = top - CARD_PAD_Y;
    }

    let insideCard = false;
    for (const block of pageBlocks) {
      if (isDesign && insideCard && !block.inCard) {
        y -= CARD_PAD_Y;
        insideCard = false;
      }
      if (block.inCard) insideCard = true;
      block.draw(page, y);
      y -= block.h;
    }
  }

  // --- Pie con numeracion ------------------------------------------------------
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 0.5,
      color: isDesign ? white : palette.line,
      opacity: isDesign ? 0.2 : 1,
    });
    const parts = ["CapitalStudio", "Instagram @capitalpass.ar", ...(whatsapp ? [`WhatsApp ${whatsapp}`] : [])];
    text(page, parts.join("  ·  "), MARGIN, 30, 8, fonts.regular, palette.muted);
    textRight(page, `${KIND_LABEL[quote.kind]} · ${code} · ${index + 1}/${pages.length}`, PAGE_W - MARGIN, 30, 8, fonts.bold, palette.muted);
  });

  return pdf.save();
}
