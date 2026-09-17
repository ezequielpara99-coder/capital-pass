"use client";

import { useEffect } from "react";

// Registra el service worker que hace instalable la PWA. No cachea nada de
// la app en si (ver public/sw.js) -- solo habilita el "Agregar a inicio" y
// la pantalla de sin conexion.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
