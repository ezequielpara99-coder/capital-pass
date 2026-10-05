# Capital Pass — instrucciones para Claude

## Objetivo

Capital Pass es una plataforma para organizadores de eventos, RRPP, vendedores de puerta y controladores de ingreso.

## Estado incluido

- Next.js 16 + React 19 + TypeScript + Tailwind.
- Supabase para autenticación, base de datos y assets.
- Mercado Pago para la suscripción del organizador.
- Registro, inicio de sesión, recuperación y confirmación de cuenta.
- Panel del organizador: eventos, ventas, ingresos, informes, notificaciones y solicitudes de diseño.
- Gestión de tandas, entradas y códigos QR.
- Panel de RRPP y nueva venta.
- Mapa y cobertura de RRPP.
- Panel de puerta y validación de ingresos.
- Vendedores de puerta, devoluciones y controladores.
- Página pública de evento en `/e/[slug]`.
- API routes para ventas, entradas, QR, RRPP, puerta, devoluciones, ubicaciones y Mercado Pago.
- Migraciones SQL en `supabase/migrations/`.

## Cómo iniciar

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Comandos útiles

```bash
npm run build
npm run lint
npm test
```

## Variables de entorno

Crear `.env.local` en la raíz. Nunca escribir valores secretos en el código ni subir `.env.local` al repositorio. Las variables utilizadas se pueden identificar buscando `process.env` en el código. Revisar especialmente Supabase, Mercado Pago y correo antes de probar pagos o emails.

## Reglas de trabajo

1. Antes de cambiar una funcionalidad, leer la ruta, sus componentes y las funciones relacionadas de `lib/`.
2. Mantener los roles existentes: `organizer`, `rrpp`, `controller` y `door_seller`.
3. No eliminar migraciones ni archivos de respaldo sin verificar dependencias.
4. No afirmar que Mercado Pago está cobrando hasta probar credenciales y webhook.
5. Ejecutar `npm run build`, `npm run lint` y `npm test` después de cambios importantes.
6. Conservar la estética oscura premium de Capital Pass.

7. Mantener también el rol `bartender` (además de los cuatro de arriba).

## Cómo trabaja el dueño (Eze)

- Eze es el dueño y opera Capital Pass solo. No es programador: no lee código ni diffs. Escribe en español argentino, corto y casual. Respondé igual: corto, en castellano rioplatense, explicando qué cambió y por qué en palabras simples.
- Reporta bugs con capturas de pantalla de la app en producción. Tomalas como verdad y empezá a investigar enseguida.
- **Cambios en la base de datos:** pasale un bloque SQL para que lo pegue él en el SQL Editor de Supabase. Si son varias migraciones, juntalas en un solo archivo con un único `begin;`/`commit;` (ver `scripts/sql/correr-pendientes-*.sql`). Si no puede descargar el archivo, copiáselo al portapapeles.
- "Dale", "andá", "corré vos" o "le permito todo" significan que avanza. "Ya corrí el SQL" es un aviso: verificalo vos (ver abajo), no le pidas que confirme nada técnico.
- Pide rondas de auditoría seguidas ("seguí con más auditorías"). El objetivo es que todo ande perfecto, no "suficientemente bien". Ir rincón por rincón, verificar en vivo y no solo leyendo código.
- **Guía de uso:** todo cambio que agregue o cambie algo que un usuario ve o puede hacer se refleja en `app/guia/page.tsx` (organizada por rol), en el mismo commit.

## Deploy y verificación

- Repositorio: `github.com/ezequielpara99-coder/capital-pass`. **Cada push a `main` se publica solo en producción (Vercel).** No hay staging.
- Antes de pushear: `npx tsc --noEmit`, `npm run lint` (hoy hay 3 errores viejos de `react-hooks/set-state-in-effect` que no son nuevos), `npm test` y `npm run build`.
- `.env.local` apunta a la base de **producción** de Supabase. Cualquier script o prueba local lee y escribe datos reales.
- Si creás datos de prueba en producción, borralos o desactivalos en el mismo paso. Una vez quedaron planes "QA" activos y aparecieron en la landing pública.
- No uses contraseñas ni tarjetas reales. Las pruebas de login real y de cobro real con Mercado Pago las hace Eze.

## Trampas conocidas de la base (no se ven en el código)

- **Migraciones que no se corrieron:** pasó que algunas migraciones nunca se aplicaron en producción, y el código que ya estaba publicado fallaba.
  - Para chequear columnas y funciones vivas, leé el esquema con `GET {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/` usando `SUPABASE_SECRET_KEY` como apikey y Bearer, con header `Accept: application/openapi+json`. Es solo lectura.
  - Para un chequeo completo, Eze corre `scripts/sql/verificar-migraciones.sql`. Regeneralo cuando agregues migraciones.
  - Nunca vuelvas a correr una migración vieja después de una nueva sin revisar que no pise una función más reciente.
- **Permisos que solo existen en Supabase:** `service_role` NO puede hacer update/delete directo sobre `sales`, `tickets` ni `sale_items`, y a veces tampoco insert en `buyers`.
  - Esos cambios van siempre por una función `security definer` (ej. `create_sale`, `confirm_online_sale`, `claim_ticket_email_sent`).
  - Siempre chequeá `.error` en escrituras directas.
  - El harness de tests (`tests/migration.test.ts`) le da `grant all` a service_role, así que esconde este problema.
- **RLS que solo existe en Supabase:** `events` y `ticket_types` tienen RLS real aunque no aparezca en `supabase/migrations/`. Verificá en vivo (`pg_policies`) antes de reportar un "IDOR".
- **Mercado Pago:** hasta el 2026-10-05 nunca hubo una venta online, recarga de socio ni renovación confirmada con plata real. El circuito de cobro con la cuenta del organizador no está probado en vivo.

## Commits en esta máquina (Windows + PowerShell)

Escribí el mensaje en un archivo y usá `git commit -F archivo`. Si usás `-m`, evitá `"`, `>`, `?` y rutas tipo `/control,`, porque rompen el comando.

## Estado al 2026-10-05

- Auditados a fondo:
  - checkout online y devoluciones;
  - puerta, control de acceso, barra y stock, mesas;
  - colectivos, packs;
  - informes, presupuestos, rentals, notificaciones, papelera, perfil;
  - membresía y app del socio;
  - suscripción del organizador (renovación anticipada);
  - panel admin (suscripciones y organizaciones).
- Falta auditar:
  - registro, login y recuperación vistos juntos;
  - portal del comprador `/mi`;
  - panel principal del RRPP `/rrpp`;
  - tareas automáticas (`app/api/cron/*`);
  - Sales Agent (`/admin/sales-agent`);
  - resto del admin: finanzas, presupuestos y rentals desde el admin.
- Pruebas reales pendientes de Eze:
  1. Crear un RRPP de prueba, mandarle los datos por WhatsApp y entrar con usuario, celular y email.
  2. Comprar una entrada barata online en la cuenta QA y confirmar que llega el mail con el QR.
- Idea anotada, no hecha: el precio de un colectivo pago se cobra "aparte" y no queda registrado en ninguna venta ni informe.

## Primer pedido sugerido para Claude

> Este es el proyecto completo actual de Capital Pass. Leé `CLAUDE.md` entero (sobre todo "Cómo trabaja el dueño", "Trampas conocidas" y "Estado"). Después inspeccioná `package.json`, `lib/`, `app/` y las migraciones de Supabase. No reescribas nada todavía. Prepará un diagnóstico breve del estado actual y seguí con lo que figura en "Falta auditar".
