"use client";

import { useRouter } from "next/navigation";

type Props = {
  saleId: string;
  whatsappUrl: string;
};

// Abre WhatsApp con el mensaje ya armado y registra el envío -- para que
// esta misma venta deje de aparecer en "Entradas sin enviar" la próxima
// vez que se cargue la página.
export default function SendWhatsAppButton({ saleId, whatsappUrl }: Props) {
  const router = useRouter();

  function handleClick() {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    fetch(`/api/ventas/${saleId}/whatsapp-enviado`, { method: "POST" })
      .then(() => router.refresh())
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-5 inline-flex h-10 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.07] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-400/[0.12]"
    >
      Enviar por WhatsApp
    </button>
  );
}
