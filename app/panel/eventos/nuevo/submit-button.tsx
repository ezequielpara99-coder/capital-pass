"use client";

import { useFormStatus } from "react-dom";

// El form de crear evento usa un server action nativo (sin JS de estado
// propio en la pagina), asi que el boton nunca se deshabilitaba mientras
// se procesaba -- un doble click disparaba createEvent() dos veces en
// paralelo y, como el slug siempre lleva un sufijo random, las dos
// inserciones tenian exito: quedaban dos eventos duplicados.
export default function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 items-center justify-center gap-3 bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-7 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_40px_rgba(255,42,26,.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Creando..." : "Crear evento"}
      {!pending && <span>→</span>}
    </button>
  );
}
