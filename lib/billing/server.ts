import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { destinationFor, saleFromReference, signupFromReference, upgradeChargeFromReference, verifiedPayment, type BillingMembership, type ProviderPayment } from "./rules";
import { getPayment, getPlatformCollectorId, paymentsForReference } from "./provider";
import { sendSubscriptionReceipt } from "../email/subscription-receipt";
import { sendPushToPlatformAdmins } from "../push/server";

export type Signup = {
  id: string; user_id: string | null; organization_id: string | null; plan_id: string;
  email: string; first_name: string; last_name: string; organization_name: string;
  expected_amount: number; expected_currency: string; frequency_months: number;
  mercadopago_preapproval_id: string | null; checkout_url: string | null;
  checkout_started_at: string | null; mp_status: string | null;
};

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

export async function accountFor(user: User) {
  const admin = createAdminClient();
  const { data: platformAdmin, error: adminError } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (adminError) throw new Error("No se pudo verificar el acceso.");
  const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));
  if (platformAdmin || isFallbackAdmin) return { active: true, destination: "/admin", organizationId: null, organizationName: "Capital Pass", isAdmin: true, signup: null, email: user.email ?? "", periodEnd: null as string | null, lastPlanId: null as string | null };
  const { data, error } = await admin.from("organization_members").select("organization_id, role, status").eq("user_id", user.id).order("created_at");
  if (error) throw new Error("No se pudo verificar la cuenta.");
  const members = (data ?? []) as BillingMembership[];
  const organizers = members.filter((m) => m.role === "organizer" && m.status === "active");
  let organizationId = organizers[0]?.organization_id ?? null;
  if (!members.length || organizers.length) {
    if (!user.email_confirmed_at) throw new Error("Confirma tu email para continuar.");
    const result = await admin.rpc("cp_ensure_account", { p_user_id: user.id });
    if (result.error) throw new Error("No se pudo preparar la cuenta. Contacta a soporte.");
    organizationId = result.data as string;
  }
  const entitled: BillingMembership[] = [];
  for (const member of members.filter((m) => m.status === "active")) {
    const result = await admin.rpc("cp_org_has_service", { p_organization_id: member.organization_id });
    if (result.error) throw new Error("No se pudo verificar la suscripcion.");
    if (result.data) entitled.push(member);
  }
  const { data: signups, error: signupError } = await admin.from("subscription_signups").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
  if (signupError) throw new Error("No se pudo leer la suscripcion.");
  const { data: org } = organizationId ? await admin.from("organizations").select("name, active").eq("id", organizationId).maybeSingle() : { data: null };
  const { data: subscription } = organizationId
    ? await admin.from("organization_subscriptions").select("current_period_end").eq("organization_id", organizationId).maybeSingle()
    : { data: null };
  // Si la organizacion pago un upgrade de plan vigente para el periodo
  // actual, ese es el plan a preseleccionar en la renovacion -- no el de
  // la solicitud original, que sigue apuntando al plan viejo.
  const { data: upgrade } = organizationId
    ? await admin.from("plan_upgrade_charges").select("to_plan_id")
        .eq("organization_id", organizationId).eq("status", "approved")
        .gte("period_end_at_charge", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  return {
    active: entitled.length > 0, destination: destinationFor(entitled), organizationId,
    organizationName: org?.name ?? "Mi cuenta", isAdmin: false,
    signup: (signups?.[0] ?? null) as Signup | null, email: user.email ?? "",
    periodEnd: subscription?.current_period_end ?? null,
    lastPlanId: upgrade?.to_plan_id ?? signups?.[0]?.plan_id ?? null,
  };
}

// =========================================================
// RECONCILIACION DE PAGOS (Checkout Pro)
//
// Cada intento de pago (alta o renovacion) crea una preference
// de Checkout Pro distinta; no hay un objeto de suscripcion que
// consultar como con Preapproval. Reconciliar significa: buscar
// el pago real por su external_reference y aplicarlo.
// =========================================================

async function applyPayment(payment: ProviderPayment, signupId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("subscription_signups").select("*").eq("id", signupId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la solicitud.");
  if (!data) return false;
  const signup = data as Signup;
  const collectorId = await getPlatformCollectorId();
  const verified = verifiedPayment(payment, {
    amount: Number(signup.expected_amount), currency: signup.expected_currency,
    collectorId, live: process.env.MERCADOPAGO_ENV !== "sandbox",
  });
  const result = await admin.rpc("cp_record_payment", {
    p_signup_id: signupId, p_payment_id: String(payment.id), p_status: verified.status,
    p_amount: payment.transaction_amount, p_currency: payment.currency_id,
    p_paid_at: verified.paidAt, p_updated_at: payment.date_last_updated,
  });
  if (result.error) throw new Error("No se pudo registrar el cobro verificado.");
  const refreshed = await admin.rpc("cp_refresh_subscription", { p_signup_id: signupId });
  if (refreshed.error) throw new Error("No se pudo actualizar el acceso.");
  // El envio de un recibo nunca determina si se habilita el acceso. El
  // remitente puede venir de RECEIPTS_FROM_EMAIL o, si no esta seteada, de
  // RESEND_FROM_EMAIL (asi lo resuelve sendSubscriptionReceipt) -- este
  // guard tiene que aceptar la misma combinacion, si no un deploy que solo
  // configuro RESEND_FROM_EMAIL nunca manda el recibo sin ningun aviso.
  if (verified.status === "approved" && process.env.RESEND_API_KEY?.startsWith("re_") && (process.env.RECEIPTS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)) {
    try {
      const receipts = await admin.from("subscription_payments").select("payment_id, amount, currency, paid_at, period_end")
        .eq("signup_id", signupId).eq("status", "approved").is("receipt_sent_at", null).order("paid_at", { ascending: false }).limit(1);
      const plan = await admin.from("subscription_plans").select("name").eq("id", signup.plan_id).single();
      for (const receipt of receipts.data ?? []) {
        const sent = await sendSubscriptionReceipt({
          to: signup.email, customerName: `${signup.first_name} ${signup.last_name}`,
          organizationName: signup.organization_name, planName: plan.data?.name ?? "Capital Pass",
          amount: Number(receipt.amount), currency: receipt.currency,
          paidAt: receipt.paid_at, periodEnd: receipt.period_end, mercadoPagoPreapprovalId: String(payment.id), paymentId: receipt.payment_id,
        });
        if (sent.ok) await admin.from("subscription_payments").update({ receipt_sent_at: new Date().toISOString() }).eq("payment_id", receipt.payment_id);
      }
    } catch { console.error("BILLING: recibo pendiente de envio."); }
  }
  // Aviso push a los admins de la plataforma cuando una organizacion nueva
  // paga por primera vez (no en cada renovacion).
  if (verified.status === "approved") {
    try {
      const { data: orgSignups } = await admin
        .from("subscription_signups")
        .select("id")
        .eq("organization_id", signup.organization_id);
      const orgSignupIds = (orgSignups ?? []).map((s) => s.id);
      const { count } = await admin
        .from("subscription_payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .in("signup_id", orgSignupIds);
      if (count === 1) {
        await sendPushToPlatformAdmins({
          title: "🎉 Nueva suscripción",
          body: `${signup.organization_name} se suscribió a Capital Pass.`,
          url: "/admin/suscripciones",
        });
      }
    } catch { console.error("BILLING: no se pudo avisar la nueva suscripcion."); }
  }
  return true;
}

// =========================================================
// UPGRADE DE PLAN (cobro unico de la diferencia prorrateada)
// =========================================================

async function applyUpgradeCharge(payment: ProviderPayment, chargeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("plan_upgrade_charges").select("*").eq("id", chargeId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la actualizacion de plan.");
  if (!data) return false;
  const collectorId = await getPlatformCollectorId();
  const verified = verifiedPayment(payment, {
    amount: Number(data.amount_minor), currency: data.currency,
    collectorId, live: process.env.MERCADOPAGO_ENV !== "sandbox",
  });
  const result = await admin.rpc("cp_apply_upgrade_payment", {
    p_charge_id: chargeId, p_payment_id: String(payment.id), p_status: verified.status,
    p_amount: payment.transaction_amount, p_currency: payment.currency_id, p_paid_at: verified.paidAt,
  });
  if (result.error) throw new Error("No se pudo registrar el cobro de actualizacion.");
  return true;
}

// =========================================================
// VENTA DE ENTRADAS ONLINE (checkout del comprador final)
// =========================================================

async function applySalePayment(payment: ProviderPayment, saleId: string) {
  const admin = createAdminClient();
  const { data: sale, error } = await admin.from("sales")
    .select("id, organization_id, total_charged_minor, currency")
    .eq("id", saleId).eq("channel", "online").maybeSingle();
  if (error) throw new Error("No se pudo consultar la venta.");
  if (!sale || sale.total_charged_minor == null) return false;
  const { data: account } = await admin.from("organization_mercadopago_accounts")
    .select("mp_user_id").eq("organization_id", sale.organization_id).maybeSingle();
  if (!account) return false;
  const verified = verifiedPayment(payment, {
    amount: Number(sale.total_charged_minor), currency: sale.currency, collectorId: account.mp_user_id,
    live: process.env.MERCADOPAGO_ENV !== "sandbox",
  });
  const result = await admin.rpc("confirm_online_sale", { p_sale_id: saleId, p_status: verified.status });
  if (result.error) throw new Error("No se pudo confirmar la venta.");
  return true;
}

// Mismo mecanismo que reconcileUpgradeCharge/reconcileSignup: busca el pago
// real por external_reference en vez de depender de que el webhook ya haya
// llegado. Lo usa el comprador final desde "Verificar mi pago" en la
// pantalla de vuelta de Mercado Pago, sin necesitar sesion (la referencia
// es el UUID de la venta, ya visible en esa misma URL).
export async function reconcileOnlineSale(saleId: string) {
  const payments = await paymentsForReference(`capitalpass_sale:${saleId}`);
  let applied = false;
  for (const payment of payments) {
    if (await applySalePayment(payment, saleId)) applied = true;
  }
  return applied;
}

export async function reconcilePayment(paymentId: string) {
  const payment = await getPayment(paymentId);
  const signupId = signupFromReference(payment.external_reference);
  if (signupId) return applyPayment(payment, signupId);
  const chargeId = upgradeChargeFromReference(payment.external_reference);
  if (chargeId) return applyUpgradeCharge(payment, chargeId);
  const saleId = saleFromReference(payment.external_reference);
  if (saleId) return applySalePayment(payment, saleId);
  return false;
}

export async function reconcileUpgradeCharge(chargeId: string) {
  const payments = await paymentsForReference(`capitalpass_upgrade:${chargeId}`);
  let applied = false;
  for (const payment of payments) {
    if (await applyUpgradeCharge(payment, chargeId)) applied = true;
  }
  return applied;
}

export async function reconcileUpgradesForUser(user: User) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id).eq("role", "organizer").eq("status", "active");
  if (error) throw new Error("No se pudo verificar la organizacion.");
  const orgIds = [...new Set((data ?? []).map((m) => m.organization_id))];
  if (!orgIds.length) return { upgraded: false };
  const { data: charges, error: chargesError } = await admin
    .from("plan_upgrade_charges")
    .select("id, status")
    .in("organization_id", orgIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  if (chargesError) throw new Error("No se pudo buscar la actualizacion de plan.");
  let upgraded = false;
  for (const charge of charges ?? []) {
    if (await reconcileUpgradeCharge(charge.id)) upgraded = true;
  }
  return { upgraded };
}

export async function reconcileSignup(signupId: string) {
  const payments = await paymentsForReference(`capitalpass_signup:${signupId}`);
  let applied = false;
  for (const payment of payments) {
    if (await applyPayment(payment, signupId)) applied = true;
  }
  return applied;
}

export async function reconcileUser(user: User) {
  await accountFor(user);
  const admin = createAdminClient();
  const { data, error } = await admin.from("subscription_signups").select("id")
    .eq("user_id", user.id).not("mercadopago_preapproval_id", "is", null).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("No se pudo buscar el pago.");
  // Un intento viejo/abandonado (ej: de cuando se probaba otro precio) no
  // tiene por que impedir confirmar el pago bueno de los demas intentos.
  for (const row of data ?? []) {
    try {
      await reconcileSignup(row.id);
    } catch (err) {
      console.error("reconcileUser: fallo al reconciliar signup", row.id, err instanceof Error ? err.message : err);
    }
  }
  return accountFor(user);
}
