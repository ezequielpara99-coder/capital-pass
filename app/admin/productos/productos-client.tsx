"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Product = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  image_path: string | null;
};

function publicUrl(path: string | null) {
  if (!path) return null;
  return createClient().storage.from("product-assets").getPublicUrl(path).data.publicUrl;
}

export default function ProductosClient({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(productId: string, file: File) {
    setUploadingId(productId);
    setError("");
    try {
      const form = new FormData();
      form.append("productId", productId);
      form.append("file", file);
      const response = await fetch("/api/stock/products/image", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo subir la imagen.");
      setItems((prev) => prev.map((p) => (p.id === productId ? { ...p, image_path: result.imagePath } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1480px] px-5 py-8 md:px-8 xl:px-10">
        <header className="border-b border-white/[0.07] pb-8">
          <Link
            href="/admin"
            className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white"
          >
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(36px,5vw,64px)] font-black uppercase leading-[0.9] tracking-[-0.05em]">
            Catálogo de bebidas.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Subí el logo o foto de botella real de cada bebida del catálogo global. Se va a ver en el stock de cada
            organizador y en la carta de tragos que descargan.
          </p>
        </header>

        {error && (
          <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((product) => {
            const url = publicUrl(product.image_path);
            const uploading = uploadingId === product.id;
            return (
              <div key={product.id} className="border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="flex aspect-square items-center justify-center overflow-hidden border border-white/[0.06] bg-black/40">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={product.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-white/20">Sin foto</span>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-bold">{product.name}</p>
                {product.brand && <p className="truncate text-[10px] uppercase text-white/30">{product.brand}</p>}

                <input
                  ref={(el) => { inputRefs.current[product.id] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(product.id, file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRefs.current[product.id]?.click()}
                  className="mt-2 h-9 w-full border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.08] text-[10px] font-bold uppercase tracking-wide text-[#ff9a7c] disabled:opacity-40"
                >
                  {uploading ? "Subiendo..." : url ? "Cambiar foto" : "Subir foto"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
