"use client";

import { useSyncExternalStore } from "react";

// Reloj para componentes cliente: se actualiza cada 30 segundos y evita llamar
// a Date.now() durante el render (React lo considera impuro). En el servidor
// devuelve 0, asi el HTML del servidor y el del navegador coinciden.
function subscribe(callback: () => void) {
  const timer = setInterval(callback, 30000);
  return () => clearInterval(timer);
}

const snapshot = () => Math.floor(Date.now() / 30000) * 30000;
const serverSnapshot = () => 0;

export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
