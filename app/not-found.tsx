import Link from "next/link";

// Pagina 404 con la estetica de Capital Pass -- sin esto, Next.js muestra
// su pantalla generica blanca para cualquier ruta que no existe.
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 text-[#f7f3ed]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[#ff2a1a]/[0.1] blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="relative mx-auto h-14 w-14 overflow-hidden">
          <div className="absolute inset-[6px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
        </div>

        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">Capital Pass</p>
        <h1 className="mt-4 text-[clamp(56px,12vw,96px)] font-black uppercase leading-none tracking-[-0.05em] text-white/90">404</h1>
        <p className="mt-3 text-lg font-bold">Esta página no existe.</p>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Puede que el link esté viejo o mal escrito. Volvé al inicio o a tu panel.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="flex h-12 items-center justify-center bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#ff4a2d]"
          >
            Ir al inicio
          </Link>
          <Link
            href="/panel"
            className="flex h-12 items-center justify-center border border-white/20 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
          >
            Ir a mi panel
          </Link>
        </div>
      </div>
    </main>
  );
}
