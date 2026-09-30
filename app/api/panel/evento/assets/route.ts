import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { sniffImageType, extensionForImageType } from "../../../../../lib/uploads/sniff-image-type";

const MAX_SIZE = 15 * 1024 * 1024;

// field -> kind del path (mismo mapeo que ya usaba app/panel/evento/page.tsx
// subiendo directo a Storage con la clave anon).
const FIELDS = {
  banner_horizontal_path: "banner-horizontal",
  banner_square_path: "banner-square",
  banner_vertical_path: "banner-vertical",
  ticket_background_path: "ticket-background",
} as const;
type AssetField = keyof typeof FIELDS;

// Banners/flyer del evento y fondo de entrada: antes se subian directo del
// navegador a Supabase Storage (bucket público "event-assets") con
// `contentType: file.type` -- ese tipo lo declara el propio cliente, asi que
// cualquiera podia subir un archivo no-imagen (HTML/SVG con script, etc.)
// declarando un Content-Type de imagen falso. Mismo fix que ya tiene el
// avatar de perfil: se sube por acá, se detecta el tipo real por los
// primeros bytes del archivo, y se usa ese.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    const eventId = String(form.get("eventId") ?? "").trim();
    const field = String(form.get("field") ?? "") as AssetField;

    if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });
    if (!(field in FIELDS)) return NextResponse.json({ error: "Campo inválido." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "La imagen no puede superar los 15 MB." }, { status: 400 });

    const { data: event } = await supabase.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
    if (!event) return NextResponse.json({ error: "No se encontró el evento." }, { status: 404 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", event.organization_id)
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "No tenés permiso sobre este evento." }, { status: 403 });

    const buffer = new Uint8Array(await file.arrayBuffer());
    const realType = sniffImageType(buffer);
    if (!realType) return NextResponse.json({ error: "La imagen debe ser JPG, PNG o WEBP." }, { status: 400 });

    const admin = createAdminClient();
    const { data: current } = await admin.from("events").select(field).eq("id", eventId).maybeSingle();
    const oldPath = (current as Record<string, string | null> | null)?.[field] ?? null;

    const objectPath = `${event.organization_id}/${event.id}/${FIELDS[field]}/${crypto.randomUUID()}.${extensionForImageType(realType)}`;
    const { error: uploadError } = await admin.storage
      .from("event-assets")
      .upload(objectPath, buffer, { cacheControl: "3600", upsert: false, contentType: realType });
    if (uploadError) return NextResponse.json({ error: `No se pudo subir la imagen.` }, { status: 500 });

    const { error: updateError } = await admin
      .from("events")
      .update({ [field]: objectPath, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    if (updateError) {
      await admin.storage.from("event-assets").remove([objectPath]);
      return NextResponse.json({ error: "La imagen se subió, pero no se pudo vincular al evento." }, { status: 500 });
    }

    if (oldPath && oldPath !== objectPath) {
      await admin.storage.from("event-assets").remove([oldPath]);
    }

    return NextResponse.json({ ok: true, path: objectPath });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
