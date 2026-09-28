import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { findDuplicate, normalizedColumns, rescoreProspect, type ProspectInput } from "../../../../../../lib/sales-agent/prospect";

const MAX_ROWS = 500;

// Parser de CSV chico (sin dependencias): soporta comillas, comas dentro de
// comillas y comillas escapadas (""). Alcanza para un CSV exportado de Excel/
// Google Sheets, que es el caso de uso real ("importar una planilla").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") pushField();
    else if (char === "\n") pushRow();
    else if (char === "\r") { /* ignora, el \n de CRLF hace el salto de fila */ }
    else field += char;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_MAP: Record<string, keyof ProspectInput> = {
  nombre: "name", name: "name",
  instagram: "instagramUsername", instagramusername: "instagramUsername", usuario: "instagramUsername",
  instagramurl: "instagramUrl",
  web: "website", website: "website", sitio: "website",
  ciudad: "city", city: "city",
  provincia: "province", province: "province",
  categoria: "category", category: "category",
  seguidores: "followers", followers: "followers",
  eventospormes: "eventsPerMonth", eventos: "eventsPerMonth",
  email: "email", mail: "email",
  telefono: "phone", phone: "phone",
  whatsapp: "whatsapp",
  notas: "notes", notes: "notes",
};

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// POST { csv, campaignId? }: importa prospectos desde un CSV pegado como
// texto. Salta duplicados (no rompe la importacion entera por uno solo).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const csvText = String(body.csv ?? "");
    if (!csvText.trim()) return NextResponse.json({ error: "Pegá el contenido del CSV." }, { status: 400 });
    const campaignId = /^[0-9a-f-]{36}$/i.test(String(body.campaignId ?? "")) ? body.campaignId : null;

    const rows = parseCsv(csvText);
    if (rows.length === 0) return NextResponse.json({ error: "El CSV está vacío." }, { status: 400 });
    if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ error: `Máximo ${MAX_ROWS} filas por importación.` }, { status: 400 });

    const headers = rows[0].map(normalizeHeader);
    const columnIndex: Partial<Record<keyof ProspectInput, number>> = {};
    headers.forEach((h, i) => {
      const field = HEADER_MAP[h];
      if (field && columnIndex[field] === undefined) columnIndex[field] = i;
    });
    if (columnIndex.name === undefined) return NextResponse.json({ error: "El CSV necesita una columna 'nombre'." }, { status: 400 });

    const admin = createAdminClient();
    let created = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const get = (field: keyof ProspectInput) => {
        const idx = columnIndex[field];
        return idx === undefined ? undefined : cells[idx]?.trim() || undefined;
      };

      try {
        const name = get("name");
        if (!name) { errors++; errorDetails.push(`Fila ${r + 1}: sin nombre.`); continue; }

        const input: ProspectInput = {
          name: name.slice(0, 150),
          instagramUsername: get("instagramUsername") ?? null,
          website: get("website") ?? null,
          city: get("city") ?? null,
          province: get("province") ?? null,
          category: get("category") ?? null,
          followers: get("followers") ? Math.max(0, Math.round(Number(get("followers")))) : null,
          eventsPerMonth: get("eventsPerMonth") ? Math.max(0, Math.round(Number(get("eventsPerMonth")))) : null,
          email: get("email") ?? null,
          phone: get("phone") ?? null,
          whatsapp: get("whatsapp") ?? null,
          notes: get("notes") ?? null,
          campaignId,
        };

        const duplicate = await findDuplicate(admin, input);
        if (duplicate) { duplicates++; continue; }

        const { data, error } = await admin
          .from("prospects")
          .insert({
            campaign_id: input.campaignId,
            name: input.name,
            instagram_username: input.instagramUsername,
            website: input.website,
            city: input.city,
            province: input.province,
            category: input.category,
            followers: input.followers,
            events_per_month: input.eventsPerMonth,
            email: input.email,
            phone: input.phone,
            whatsapp: input.whatsapp,
            notes: input.notes,
            source: "csv",
            created_by: verification.userId,
            ...normalizedColumns(input),
          })
          .select("id")
          .single();

        if (error) {
          if (error.code === "23505") { duplicates++; continue; }
          throw error;
        }

        await rescoreProspect(admin, data.id as string);
        created++;
      } catch (rowError) {
        errors++;
        errorDetails.push(`Fila ${r + 1}: ${rowError instanceof Error ? rowError.message : "error inesperado"}.`);
      }
    }

    return NextResponse.json({ ok: true, processed: rows.length - 1, created, duplicates, errors, errorDetails: errorDetails.slice(0, 20) });
  } catch (error) {
    console.error("SALES AGENT IMPORTAR:", error);
    return NextResponse.json({ error: "No se pudo importar el archivo." }, { status: 500 });
  }
}
