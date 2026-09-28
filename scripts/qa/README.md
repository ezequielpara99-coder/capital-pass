# QA de punta a punta (app del socio)

`socio-e2e.mjs` prueba la app del socio completa contra la **base real** de
`.env.local` y un servidor de la app en marcha. Cubre: seguridad del link y de la
sesión por email, pedidos (saldo, nivel, puntos dobles, stock), mesas, ranking y
premio mensual (cron), colectivo y sus avisos, avisos al celular, recarga (hasta
antes de Mercado Pago) y la página pública del evento con compra de mesas.

## Cómo correrlo

```bash
npm run build
npx next start -p 3001        # en otra terminal (el build de producción, no npm run dev)
QA_CONFIRM=si node scripts/qa/socio-e2e.mjs setup
```

En PowerShell: `$env:QA_CONFIRM = "si"; node scripts/qa/socio-e2e.mjs setup`.

Si se corta a la mitad, borrá lo que quedó:

```bash
QA_CONFIRM=si node scripts/qa/socio-e2e.mjs cleanup
```

## Qué hace con la base

- Crea una organización y un evento llamados `ZZ QA ...` (el evento queda
  **activo** unos minutos, así que podría verse en el sitemap público) con socios,
  carta, mesas, un colectivo y una cuenta de Mercado Pago **falsa**.
- Al terminar (`setup` no borra solo) hay que correr `cleanup`; verifica que no
  queden organizaciones ni eventos `ZZ QA`.
- No cobra nada real: el pago de la mesa se prueba solo en el camino de error
  (con la cuenta falsa Mercado Pago rechaza y la mesa se libera).
- Las ventas y compradores de las reservas de mesa no se pueden borrar con el
  usuario de servicio (solo funciones de la base tocan esas tablas): `cleanup`
  usa `cp_qa_purge_org`, una función que **solo acepta organizaciones cuyo
  nombre empieza con `ZZ QA`** y rechaza cualquier otra.

## Qué NO cubre

- Cobros reales con Mercado Pago y llegada real de notificaciones a un celular.
- Las pantallas del organizador con sesión iniciada.
