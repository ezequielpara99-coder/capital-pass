"use client";

import { useEffect } from "react";

// Registra el service worker que hace instalable la PWA. No cachea nada de
// la app en si (ver public/sw.js) -- solo habilita el "Agregar a inicio" y
// la pantalla de sin conexion.
//
// De paso, en CADA carga de página con sesión, reclama de nuevo (mismo
// endpoint, upsert por endpoint) cualquier suscripción push que el
// navegador ya tenga activa. Esto corre en TODA la app, no solo en
// /panel/perfil, porque un dispositivo compartido (tablet de control/
// puerta/barra entre turnos) puede quedar con la suscripción de la
// persona anterior si esta no cerró sesión -- sin este reclamo global, la
// próxima persona que se loguea nunca ve /panel/perfil y le siguen
// llegando al dispositivo las notificaciones de la cuenta anterior. La
// ruta de subscribe ya exige sesión válida del lado del servidor, así que
// este intento es inofensivo si no hay nadie logueado.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (registration) => {
          try {
            const existing = await registration.pushManager.getSubscription();
            if (!existing) return;
            const json = existing.toJSON();
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
            });
          } catch {
            // No bloquea la carga de la app si esto falla.
          }
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
