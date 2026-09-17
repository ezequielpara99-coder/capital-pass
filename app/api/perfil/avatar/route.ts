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
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "La imagen debe ser JPG, PNG o WEBP." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen no puede superar los 8 MB." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: current } = await admin.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();

    const objectPath = `${user.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type });

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
