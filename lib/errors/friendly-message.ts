// Convierte un error crudo de fetch/JSON en un mensaje entendible para
// alguien no tecnico parado en la puerta de un evento con mala señal.
// `fetch` tira un TypeError generico ("Failed to fetch", "Load failed",
// "NetworkError...") cuando no hay conexion, y `response.json()` tira un
// SyntaxError si el servidor devolvio HTML (ej: una pagina de error del
// proxy bajo mucha carga) en vez del JSON esperado -- antes ambos casos
// mostraban ese texto en ingles tal cual, sin ninguna pista de que hacer.
export function friendlyErrorMessage(error: unknown, fallback = "Ocurrió un error inesperado. Intentá de nuevo."): string {
  if (error instanceof TypeError) {
    return "No hay conexión a internet. Revisá tu wifi/datos y volvé a intentar.";
  }
  if (error instanceof SyntaxError) {
    return "El servidor no respondió correctamente. Esperá unos segundos y volvé a intentar.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
