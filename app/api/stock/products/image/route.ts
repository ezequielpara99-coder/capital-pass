import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyProductAccess } from "../../../../../lib/stock/auth";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024;

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const productId = String(form.get("productId") ?? "").trim();
    const file = form.get("file");

    if (!productId || !(file instanceof File)) {
      return NextResponse.json({ error: "Falta el producto o el archivo." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "La imagen debe ser JPG, PNG o WEBP." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen no puede superar los 8 MB." }, { status: 400 });
    }

    const verification = await verifyProductAccess(productId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const objectPath = `${productId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

    const { error: uploadError } = await admin.storage
      .from("product-assets")
      .upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });
    }

    const { data: current } = await admin.from("products").select("image_path").eq("id", productId).maybeSingle();

    const { error: updateError } = await admin
      .from("products")
      .update({ image_path: objectPath })
      .eq("id", productId);

    if (updateError) {
      await admin.storage.from("product-assets").remove([objectPath]);
      return NextResponse.json({ error: "La imagen se subió, pero no se pudo vincular al producto." }, { status: 500 });
    }

    if (current?.image_path && current.image_path !== objectPath) {
      await admin.storage.from("product-assets").remove([current.image_path]);
    }

    const { data: publicUrl } = admin.storage.from("product-assets").getPublicUrl(objectPath);

    return NextResponse.json({ ok: true, imagePath: objectPath, publicUrl: publicUrl.publicUrl });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
