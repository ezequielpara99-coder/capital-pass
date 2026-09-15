import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Faltan las variables de entorno necesarias para conectar con Supabase."
    );
  }

  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey
  );
}

// Cliente específico para recuperar/crear contraseña.
// Usa flujo "implicit" en vez de PKCE porque el link de recuperación
// casi siempre se abre en otro navegador/pestaña (el del email), y PKCE
// exige que sea la misma sesión que pidió el reset — con implicit no hace falta.
export function createRecoveryClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Faltan las variables de entorno necesarias para conectar con Supabase."
    );
  }

  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        flowType: "implicit",
      },
    }
  );
}