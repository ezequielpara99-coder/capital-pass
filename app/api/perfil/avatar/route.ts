import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024;

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

// file.type lo declara el propio cliente (el FormData no lo verifica): sin
// esto, cualquiera podia subir bytes arbitrarios declarando "image/png" y
// quedaban servidos publicamente con ese Content-Type falso desde el bucket.
// Se detecta el tipo real por los primeros bytes del archivo (magic
// numbers) y se usa ESE para decidir si se acepta y con que Content-Type se
// sube, ignorando lo que el cliente haya declarado.
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen no puede superar los 8 MB." }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const realType = sniffImageType(buffer);
    if (!realType || !ALLOWED_TYPES.includes(realType)) {
      return NextResponse.json({ error: "La imagen debe ser JPG, PNG o WEBP." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: current } = await admin.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();

    const objectPath = `${user.id}/${crypto.randomUUID()}.${extensionFor(realType)}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(objectPath, buffer, { cacheControl: "3600", upsert: false, contentType: realType });

    if (uploadError) {
      return NextResponse.json({ error: "No se pudo subir la foto." }, { status: 500 });
    }

    const { error: updateError } = await admin.from("profiles").update({ avatar_path: objectPath }).eq("id", user.id);

    if (updateError) {
      await admin.storage.from("avatars").remove([objectPath]);
      return NextResponse.json({ error: "La foto se subió, pero no se pudo vincular al perfil." }, { status: 500 });
    }

    if (current?.avatar_path && current.avatar_path !== objectPath) {
      await admin.storage.from("avatars").remove([current.avatar_path]);
    }

    const { data: publicUrl } = admin.storage.from("avatars").getPublicUrl(objectPath);
    return NextResponse.json({ ok: true, avatarPath: objectPath, publicUrl: publicUrl.publicUrl });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
