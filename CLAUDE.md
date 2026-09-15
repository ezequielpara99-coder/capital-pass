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

## Primer pedido sugerido para Claude

> Este es el proyecto completo actual de Capital Pass. Primero inspeccioná la estructura, `package.json`, `README.md`, `CLAUDE.md`, `lib/`, `app/` y las migraciones de Supabase. No reescribas nada todavía. Prepará un diagnóstico breve del estado actual, indicá cómo levantarlo localmente y listá las variables de entorno necesarias.
