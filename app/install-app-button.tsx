"use client";

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallAppButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Foco de teclado del modal: al abrirse, mueve el foco adentro y devuelve
  // el foco al boton que lo abrio al cerrarse. Mientras esta abierto, Tab
  // no se escapa hacia el resto de la landing detras del overlay, y Escape
  // lo cierra -- antes nada de esto pasaba, dejando perdido a quien navega
  // con teclado o lector de pantalla.
  useEffect(() => {
    if (!showIosHelp) return;

    const triggerButton = openButtonRef.current;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowIosHelp(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerButton?.focus();
    };
  }, [showIosHelp]);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsStandalone(standalone);
    // iPadOS 13+ manda un user-agent de Mac de escritorio (sin "iPad"),
    // asi que el regex solo no lo detecta -- y Safari nunca dispara
    // beforeinstallprompt, asi que sin esto el boton de instalar
    // desaparecia por completo para la mayoria de usuarios de iPad.
    const looksLikeIpadOS =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || looksLikeIpadOS);

    function handlePrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (isStandalone) return null;
  if (!deferredPrompt && !isIos) return null;

  async function handleClick() {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <>
      <button ref={openButtonRef} type="button" onClick={handleClick} className={className}>
        📲 Descargar app
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-[900] flex items-end justify-center bg-black/80 px-4 pb-6 backdrop-blur-sm sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-ios-title"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0705] p-6 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="install-ios-title" className="text-xs font-black uppercase tracking-[0.2em] text-[#ff7354]">Instalar en iPhone</p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-white/70">
              <li>1. Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en Safari.</li>
              <li>2. Elegí <strong>&quot;Agregar a pantalla de inicio&quot;</strong>.</li>
              <li>3. Confirmá tocando <strong>&quot;Agregar&quot;</strong>.</li>
            </ol>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-6 h-11 w-full rounded-xl border border-white/15 text-sm font-bold text-white/70"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
