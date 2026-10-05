// Convierte un celular argentino cargado de forma local (ej. 03468529047) al
// formato que espera wa.me (5493468529047). Mismo criterio que
// app/panel/vender/vender-client.tsx: si el resultado no es exactamente
// 549 + 10 digitos se rechaza (string vacio) en vez de adivinar -- un numero
// mal tipeado podia coincidir con el WhatsApp real de un desconocido.
export function normalizeWhatsAppNumber(value: string | null | undefined) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) {
    let rest = digits.slice(2);
    if (!rest.startsWith("9")) rest = `9${rest}`;
    digits = `54${rest}`;
  } else {
    if (digits.startsWith("0")) digits = digits.slice(1);
    digits = `549${digits}`;
  }
  return /^549\d{10}$/.test(digits) ? digits : "";
}
