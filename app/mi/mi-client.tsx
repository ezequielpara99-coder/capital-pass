"use client";

import { FormEvent, useState } from "react";

export default function MiClient({ expiredLink = false }: { expiredLink?: boolean }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(expiredLink ? "Ese link ya venció. Pedí uno nuevo." : "");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/mi/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo enviar el link.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-5 text-[#f7f3ed]">
      <div className="w-full max-w-[400px]">
        <p className="text-center text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
        <h1 className="mt-3 text-center text-[clamp(28px,6vw,40px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Tu acceso.</h1>
        <p className="mt-3 text-center text-sm text-white/45">
          Entrá con tu email para ver tus entradas y tu membresía, todo en un solo lugar.
        </p>

        {sent ? (
          <div className="mt-8 border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 text-center text-sm text-emerald-200">
            Listo. Si ese email tiene entradas o membresía con nosotros, te llega un link para entrar (revisá spam si no lo ves).
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8">
            {error && <div className="mb-4 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50"
            />
            <button
              type="submit"
              disabled={sending}
              className="mt-3 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40"
            >
              {sending ? "Enviando…" : "Mandarme el link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
