// Convierte un celular argentino cargado como lo escribe la gente al formato
// que espera wa.me: 549 + característica + número, 13 dígitos en total.
//
//   03468 529047  /  3468-529047  /  +54 9 3468 529047  ->  5493468529047
//   011 15 2345-6789  /  3462 15 555666                 ->  sin el "15"
//
// Si el resultado no es exactamente 549 + 10 dígitos se rechaza (string
// vacío) en vez de adivinar: un número mal tipeado podía coincidir con el
// WhatsApp real de un desconocido y mandarle la entrada de otra persona.
//
// Es la ÚNICA copia: antes había cinco iguales (venta del organizador, RRPP,
// puerta, mesas, notificaciones) y ninguna entendía el "15", así que un
// celular cargado como "3462 15 555666" no dejaba mandar la entrada.

// Características de 3 dígitos (sin el 0). La de 2 es solo 11 (AMBA) y el
// resto del país usa 4.
const AREA_CODES_3 = new Set([
  "220", "221", "223", "230", "236", "237", "249", "260", "261", "263", "264",
  "266", "280", "291", "294", "297", "298", "299", "341", "342", "343", "345",
  "348", "351", "353", "358", "362", "364", "370", "376", "379", "380", "381",
  "383", "385", "387", "388",
]);

function areaCodeLength(national: string) {
  if (national.startsWith("11")) return 2;
  if (AREA_CODES_3.has(national.slice(0, 3))) return 3;
  return 4;
}

export function normalizeWhatsAppNumber(value: string | null | undefined) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  // Número nacional (característica + abonado), sin 54, sin 9 y sin 0.
  let national: string;
  if (digits.startsWith("54")) {
    national = digits.slice(2);
    if (national.startsWith("9")) national = national.slice(1);
  } else {
    national = digits.startsWith("0") ? digits.slice(1) : digits;
  }

  // El "15" de los celulares va después de la característica: con él el
  // número tiene 12 dígitos en vez de 10.
  if (national.length === 12) {
    const area = areaCodeLength(national);
    if (national.slice(area, area + 2) === "15") {
      national = national.slice(0, area) + national.slice(area + 2);
    }
  }

  digits = `549${national}`;
  return /^549\d{10}$/.test(digits) ? digits : "";
}
