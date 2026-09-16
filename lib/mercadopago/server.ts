import {
  MercadoPagoConfig,
  Preference,
} from "mercadopago";

function requiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}.`
    );
  }

  return value;
}

export function getPlatformMercadoPago() {
  const accessToken =
    requiredEnv(
      "MERCADOPAGO_PLATFORM_ACCESS_TOKEN"
    );

  const client =
    new MercadoPagoConfig({
      accessToken,

      options: {
        timeout: 10000,
      },
    });

  return {
    client,

    preference:
      new Preference(
        client
      ),
  };
}

// Cliente de Mercado Pago operando con la cuenta propia de un organizador
// (Marketplace/OAuth), para que el dinero de sus ventas online le caiga
// directo a su cuenta en vez de a la de Capital Pass.
export function getOrganizerMercadoPago(accessToken: string) {
  const client =
    new MercadoPagoConfig({
      accessToken,

      options: {
        timeout: 10000,
      },
    });

  return {
    client,

    preference:
      new Preference(
        client
      ),
  };
}

export function getAppBaseUrl() {
  const url =
    process.env
      .NEXT_PUBLIC_APP_URL
      ?.trim() ||
    "http://localhost:3000";

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("La URL de la aplicacion debe usar HTTPS.");
  }
  return parsed.origin;
}
