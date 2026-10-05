// organization_subscriptions.status solo se actualiza cuando llega un cobro:
// una suscripcion que vencio sin renovar sigue diciendo "active" para
// siempre. El estado real sale de la fecha de vencimiento. Lo usan las
// pantallas del admin (suscripciones, organizaciones, detalle).
export function effectiveSubscriptionStatus(status: string | null | undefined, periodEnd: string | null | undefined, now = Date.now()) {
  const end = periodEnd ? Date.parse(periodEnd) : NaN;
  const expired = Number.isFinite(end) && end <= now;
  if (status === "active") return expired ? "vencida" : "activa";
  if (status === "payment_required") return "vencida";
  return status ?? "sin suscripción";
}

function periodEndTime(periodEnd: string | null | undefined) {
  const time = periodEnd ? Date.parse(periodEnd) : NaN;
  return Number.isFinite(time) ? time : 0;
}

// Hay una fila de organization_subscriptions por solicitud de suscripcion:
// una organizacion que cambio de plan o de precio tiene varias. La que le da
// el servicio es la de vencimiento mas lejano (no la actualizada mas
// recientemente: "Verificar mi pago" refresca tambien las viejas).
export function latestSubscriptionByOrganization<T extends { organization_id: string | null; current_period_end: string | null }>(rows: T[]) {
  const byOrganization = new Map<string, T>();
  for (const row of rows) {
    if (!row.organization_id) continue;
    const current = byOrganization.get(row.organization_id);
    if (!current || periodEndTime(row.current_period_end) > periodEndTime(current.current_period_end)) {
      byOrganization.set(row.organization_id, row);
    }
  }
  return byOrganization;
}
