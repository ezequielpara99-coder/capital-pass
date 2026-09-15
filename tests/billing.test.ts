import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WebhookSignatureValidator } from "mercadopago";
import { destinationFor, safeCheckoutUrl, signupFromReference, verifiedPayment } from "../lib/billing/rules";

test("una cuenta sin membresia va a su cuenta y no vuelve al login", () => {
  assert.equal(destinationFor([]), "/cuenta");
  assert.equal(destinationFor([{ organization_id: "x", role: "organizer", status: "disabled" }]), "/cuenta");
  assert.equal(destinationFor([{ organization_id: "x", role: "rrpp", status: "active" }]), "/rrpp");
});

test("solo acepta referencias propias y enlaces HTTPS de Mercado Pago", () => {
  assert.equal(signupFromReference("capitalpass_signup:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(signupFromReference("approved"), null);
  assert.equal(safeCheckoutUrl("https://www.mercadopago.com.ar/subscriptions/checkout?id=1"), "https://www.mercadopago.com.ar/subscriptions/checkout?id=1");
  for (const url of ["http://mercadopago.com.ar/a", "https://mercadopago.com.ar.evil.test/a", "https://evil.test", "javascript:alert(1)"]) assert.equal(safeCheckoutUrl(url), null);
});

const payment = { id: 123, status: "approved", transaction_amount: 10000, currency_id: "ARS", date_approved: "2026-09-13T10:00:00Z", date_last_updated: "2026-09-13T10:00:00Z", collector_id: 55, live_mode: true };
const expected = { amount: 10000, currency: "ARS", collectorId: 55, live: true };

test("verifica importe, moneda, vendedor, modo y fecha del cobro", () => {
  assert.equal(verifiedPayment(payment, expected).status, "approved");
  assert.throws(() => verifiedPayment({ ...payment, transaction_amount: 100 }, expected));
  assert.throws(() => verifiedPayment({ ...payment, currency_id: "USD" }, expected));
  assert.throws(() => verifiedPayment({ ...payment, collector_id: 99 }, expected));
  assert.throws(() => verifiedPayment({ ...payment, live_mode: false }, expected));
  assert.throws(() => verifiedPayment({ ...payment, date_approved: null }, expected));
  assert.equal(verifiedPayment({ ...payment, transaction_amount_refunded: 1 }, expected).status, "refunded");
  assert.equal(verifiedPayment({ ...payment, status: "pending", date_approved: null }, expected).status, "pending");
});

test("rechaza firmas falsificadas y cambios en la referencia firmada", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "test-only").update(`id:123;request-id:req-1;ts:${ts};`).digest("hex");
  const args = { xSignature: `ts=${ts},v1=${signature}`, xRequestId: "req-1", dataId: "123", secret: "test-only" };
  assert.doesNotThrow(() => WebhookSignatureValidator.validate(args));
  assert.throws(() => WebhookSignatureValidator.validate({ ...args, dataId: "456" }));
  assert.throws(() => WebhookSignatureValidator.validate({ ...args, secret: "wrong" }));
});
