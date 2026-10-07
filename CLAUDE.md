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
- **Cambios en la base de datos (decisión de Eze, 2026-10-05):** Claude los corre él mismo, sin que Eze pegue nada a mano.
  - **Cómo:** con el conector de Supabase de la app de Claude, que Eze conecta desde Conectores. Si no está conectado, pedirle que lo conecte. Como alternativa, se puede usar la connection string de la base en `.env.local` (`SUPABASE_DB_URL`, nunca en el código).
  - **Antes de correr cualquier SQL contra producción:** mostrarle a Eze qué hace, en una línea simple, y esperar su OK en el permiso de la herramienta. Si borra o pisa datos, avisarle explícitamente.
  - **Varias migraciones:** juntarlas en una sola transacción (`begin;`/`commit;`, ver `scripts/sql/correr-pendientes-*.sql`) y aplicarlas en orden.
  - **Después:** verificar en vivo que quedaron aplicadas (ver "Trampas conocidas"). La migración se guarda igual en `supabase/migrations/`.
  - **Si no hay conector ni connection string:** volver al método viejo. Pasarle a Eze el SQL para que lo pegue en el SQL Editor de Supabase; si no puede descargar el archivo, copiárselo al portapapeles.
- **Vercel:** lo mismo con el conector de Vercel. Claude puede publicar, cargar variables de entorno y conectar dominios, por ejemplo capitalstudio.ar para el proyecto capital-studio. Pedir OK antes de cambiar algo en producción.
- "Dale", "andá", "corré vos" o "le permito todo" significan que avanza. "Ya corrí el SQL" es un aviso: verificalo vos (ver abajo), no le pidas que confirme nada técnico.
- Pide rondas de auditoría seguidas ("seguí con más auditorías"). El objetivo es que todo ande perfecto, no "suficientemente bien". Ir rincón por rincón, verificar en vivo y no solo leyendo código.
- **Guía de uso:** todo cambio que agregue o cambie algo que un usuario ve o puede hacer se refleja en `app/guia/page.tsx` (organizada por rol), en el mismo commit.

## Mantener este archivo al día (pedido de Eze)

Eze va a seguir el proyecto desde otro Claude, así que todo lo que se haga tiene que quedar guardado y explicado:

- Cada cambio se commitea y se pushea a GitHub. No dejar trabajo sin subir.
- Cuando cambie el estado (algo auditado, algo nuevo, una prueba pendiente, una decisión de Eze), actualizar este `CLAUDE.md` en el mismo commit. Lo mismo con el `CLAUDE.md` del otro proyecto.

## Backup de la base en Google Drive (pedido de Eze, 2026-10-05)

- Al terminar cada tanda de trabajo, corré `node scripts/backup/exportar-base.mjs`. Es solo lectura: baja todas las tablas y los usuarios a `backups/capital-pass-base-<fecha>.json.gz`. La carpeta `backups/` está en `.gitignore` porque tiene datos personales.
- Después copiá el archivo a la carpeta de Drive **"Capital Pass – Backups"** (id `1YVc-rCcaAaiLYPnMCPT9L8jiZRjmOQwX`, privada).
  - En la compu de Eze, Google Drive para escritorio está en `G:\Mi unidad\`, así que alcanza con copiar el archivo a `G:\Mi unidad\Capital Pass – Backups\`.
  - Se guarda uno por fecha, sin pisar los anteriores.
- El backup no incluye tokens ni secretos (por ejemplo, el token de Mercado Pago de cada organizador): si hay que restaurar, el organizador vuelve a conectar Mercado Pago.
  - `payment_proofs` no se puede leer con service_role (permiso solo en Supabase); al 2026-10-05 estaba vacía.
- Las claves (`.env.local`) NO van a Drive. Si se pierden, están en Vercel → Settings → Environment Variables.

## Proyectos

- **capital-pass** (esta carpeta): la plataforma de entradas, en capitalpass.app.
- **capital-studio** (`../capital-studio`): el sitio madre, en capitalstudio.ar. Presenta Capital Design, Capital Prod, Capital Rentals y Capital Pass. Es un proyecto aparte, con su propio repo, su propio proyecto de Vercel y su propio `CLAUDE.md`. Para verlo local: `preview_start` con la configuración `studio` (puerto 3001).
  - Estado al 2026-10-05: subido a GitHub (`github.com/ezequielpara99-coder/capital-studio`, privado). Falta importarlo en Vercel como proyecto nuevo, cargar `NEXT_PUBLIC_WHATSAPP` (y opcional `NEXT_PUBLIC_INSTAGRAM`), conectar el dominio capitalstudio.ar (registrado en nic.ar) y cargar los trabajos de Capital Design.
  - Los textos de Capital Prod son provisorios: falta que Eze diga qué ofrece.

## Deploy y verificación

- Repositorio: `github.com/ezequielpara99-coder/capital-pass`. **Cada push a `main` se publica solo en producción (Vercel).** No hay staging.
- Antes de pushear: `npx tsc --noEmit`, `npm run lint` (hoy hay 3 errores viejos de `react-hooks/set-state-in-effect` que no son nuevos), `npm test` y `npm run build`.
- `.env.local` apunta a la base de **producción** de Supabase. Cualquier script o prueba local lee y escribe datos reales.
- Si creás datos de prueba en producción, borralos o desactivalos en el mismo paso. Una vez quedaron planes "QA" activos y aparecieron en la landing pública.
- No uses contraseñas ni tarjetas reales. Las pruebas de login real y de cobro real con Mercado Pago las hace Eze.

## Trampas conocidas de la base (no se ven en el código)

- **Migraciones que no se corrieron:** pasó que algunas migraciones nunca se aplicaron en producción, y el código que ya estaba publicado fallaba.
  - Para chequear columnas y funciones vivas, leé el esquema con `GET {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/` usando `SUPABASE_SECRET_KEY` como apikey y Bearer, con header `Accept: application/openapi+json`. Es solo lectura.
  - Para un chequeo completo, corré `scripts/sql/verificar-migraciones.sql` (con el conector de Supabase lo corrés vos; si no, Eze). Regeneralo cuando agregues migraciones.
  - Nunca vuelvas a correr una migración vieja después de una nueva sin revisar que no pise una función más reciente.
- **Permisos que solo existen en Supabase:** `service_role` NO puede hacer update/delete directo sobre `sales`, `tickets` ni `sale_items`, y a veces tampoco insert en `buyers`.
  - Esos cambios van siempre por una función `security definer` (ej. `create_sale`, `confirm_online_sale`, `claim_ticket_email_sent`).
  - Siempre chequeá `.error` en escrituras directas.
  - El harness de tests (`tests/migration.test.ts`) le da `grant all` a service_role, así que esconde este problema.
- **RLS que solo existe en Supabase:** `events` y `ticket_types` tienen RLS real aunque no aparezca en `supabase/migrations/`. Verificá en vivo (`pg_policies`) antes de reportar un "IDOR".
- **Mercado Pago:** hasta el 2026-10-05 nunca hubo una venta online, recarga de socio ni renovación confirmada con plata real. El circuito de cobro con la cuenta del organizador no está probado en vivo.

## Commits en esta máquina (Windows + PowerShell)

Escribí el mensaje en un archivo y usá `git commit -F archivo`. Cloná con `core.autocrlf=false`: con fin de línea de Windows (CRLF) falla el test del script de borrado de eventos de prueba. Si usás `-m`, evitá `"`, `>`, `?` y rutas tipo `/control,`, porque rompen el comando.

## Estado al 2026-10-05

- Auditados a fondo:
  - checkout online y devoluciones;
  - puerta, control de acceso, barra y stock, mesas;
  - colectivos, packs;
  - informes, presupuestos, rentals, notificaciones, papelera, perfil;
  - membresía y app del socio;
  - suscripción del organizador (renovación anticipada);
  - panel admin (suscripciones y organizaciones).
- Auditados también (2026-10-05, segunda tanda): registro, login y recuperación; portal del comprador `/mi`; panel del RRPP y la elección de evento de todo el equipo (`lib/events/current-event.ts`).
- Tareas automáticas (`app/api/cron/*`) auditadas el 2026-10-05: resumen de ventas corregido; checkout online con `binary_mode` (sin efectivo) y aviso al organizador si entra un pago aprobado sin cupo.
- Sales Agent auditado el 2026-10-05: el filtro para no entrar a direcciones internas cubre IPv6 disfrazadas (`lib/sales-agent/private-ip.ts`), y el valor mensual de una conversión va en pesos enteros.
- Nuevo (2026-10-05): **Admin → Finanzas → Cuentas del mes** (`/admin/finanzas/mensual`, migración 20261019, tabla `finance_fixed_items`). Son los ingresos y gastos fijos de Eze, separados en Negocio y Personal, en pesos o dólares. Los dólares se pasan con la cotización del día de dolarapi.com (`lib/finanzas/dolar.ts`), con dólar tarjeta por defecto. Tiene un tilde de IVA 21% para servicios del exterior, y el monotributo va como gasto fijo. El cálculo está en `lib/finanzas/fixed.ts`, con tests.
- Avisos al celular (push) auditados el 2026-10-05 (tercera tanda): las ventas de barra, combos y mesas ya no esperan el envío del aviso para responder (van en `after()`); tocar un aviso abre la pantalla correcta aunque la pestaña no esté controlada por el service worker; en iPhone sin la app en la pantalla de inicio, Perfil explica cómo activarlos en vez de decir que no se puede. Al 2026-10-05 había 1 solo celular suscripto (Eze, Android) y 0 socios.
- Ventas con QR auditadas el 2026-10-06 (migración 20261020, aplicada y verificada en vivo):
  - cancelar una mesa (`cancel_table_sale`) ahora anula su QR;
  - una mesa online pagada tarde y ya tomada por otro no genera QR;
  - `validate_ticket_manual` rechaza entradas de ventas no confirmadas, y lo mismo hacen el modo sin señal (`/api/control/preload`) y la página `/entrada/[id]`;
  - se arreglaron los acentos rotos en los mensajes de la base (`validate_ticket_manual` y `validate_transfer_ticket`).
  - Los celulares con "15" ahora se normalizan bien para WhatsApp: hay una sola copia en `lib/whatsapp/phone.ts`, con tests (antes eran cinco iguales).
- Comisiones de RRPP y compra online, segunda vuelta (2026-10-06):
  - la pantalla de RRPP descuenta de la comisión también las devoluciones con reintegro pendiente, igual que Informes (antes las dos pantallas mostraban números distintos);
  - las tandas a $0 ya no se ofrecen en la venta online, porque Mercado Pago rechaza montos en cero. El checkout las corta con un mensaje claro y libera el cupo.
  - Decisión abierta para Eze: un RRPP que vende una mesa (canal `mesa`) no cobra comisión por esa venta. ¿Es así como lo quiere?
- **Trampa nueva:** la migración 20261020 parchea la definición VIVA de las funciones con `pg_temp.cp_patch`, que falla si no encuentra el texto. Si se reescribe una de esas funciones en el futuro, partí de `pg_get_functiondef` en vivo, no del repo: en vivo tenían CRLF y, antes de este arreglo, acentos rotos.
- Para la próxima ronda: todo tuvo al menos una pasada. Conviene una segunda vuelta por los flujos de plata con datos reales (venta online, recarga, suscripción) apenas haya movimiento real.
- Pruebas reales pendientes de Eze:
  1. Crear un RRPP de prueba, mandarle los datos por WhatsApp y entrar con usuario, celular y email.
  2. Comprar una entrada barata online en la cuenta QA y confirmar que llega el mail con el QR.
- Idea anotada, no hecha: el precio de un colectivo pago se cobra "aparte" y no queda registrado en ninguna venta ni informe.

## Primer pedido sugerido para Claude

> Este es el proyecto completo actual de Capital Pass. Leé `CLAUDE.md` entero (sobre todo "Cómo trabaja el dueño", "Trampas conocidas" y "Estado"). Después inspeccioná `package.json`, `lib/`, `app/` y las migraciones de Supabase. No reescribas nada todavía. Prepará un diagnóstico breve del estado actual y seguí con lo que figura en "Falta auditar".
