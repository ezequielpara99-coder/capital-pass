import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

// Catalogo disponible para una organizacion: el global (Capital Pass) +
// los productos propios que ella misma cargo.
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "Falta la organización." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "No tenés permiso." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id, name, category, brand, image_path, servings_per_bottle, organization_id")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order("category")
    .order("name");

  if (error) return NextResponse.json({ error: "No se pudo cargar el catálogo." }, { status: 500 });
  return NextResponse.json({ ok: true, products: data ?? [] });
}

// Agregar un producto propio de la organizacion (no forma parte del
// catalogo global que administra Capital Pass).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const category = body.category === "insumo" ? "insumo" : "bebida";
    const brand = body.brand ? String(body.brand).trim() : null;
    const servingsPerBottle = body.servingsPerBottle ? Number(body.servingsPerBottle) : null;
    const imagePath = body.imagePath ? String(body.imagePath) : null;

    if (!organizationId || !name) {
      return NextResponse.json({ error: "Completá el nombre del producto." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "No tenés permiso." }, { status: 403 });

    const admin = createAdminClient();
    const { data: product, error } = await admin
      .from("products")
      .insert({
        organization_id: organizationId,
        name,
        category,
        brand,
        servings_per_bottle: category === "bebida" ? servingsPerBottle : null,
        image_path: imagePath,
      })
      .select("id, name, category, brand, image_path, servings_per_bottle")
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "No se pudo crear el producto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
