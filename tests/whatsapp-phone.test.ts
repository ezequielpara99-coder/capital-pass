import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsAppNumber } from "../lib/whatsapp/phone";

test("whatsapp: formatos argentinos comunes", () => {
  assert.equal(normalizeWhatsAppNumber("03468 529047"), "5493468529047");
  assert.equal(normalizeWhatsAppNumber("3468-529047"), "5493468529047");
  assert.equal(normalizeWhatsAppNumber("+54 9 3468 529047"), "5493468529047");
  assert.equal(normalizeWhatsAppNumber("+54 3468 529047"), "5493468529047");
  assert.equal(normalizeWhatsAppNumber("11 2345-6789"), "5491123456789");
});

test("whatsapp: entiende el 15 de los celulares", () => {
  assert.equal(normalizeWhatsAppNumber("3462 15 555666"), "5493462555666", "característica de 4");
  assert.equal(normalizeWhatsAppNumber("03462-15-555666"), "5493462555666");
  assert.equal(normalizeWhatsAppNumber("011 15 2345-6789"), "5491123456789", "AMBA");
  assert.equal(normalizeWhatsAppNumber("341 15 555 6666"), "5493415556666", "característica de 3");
  assert.equal(normalizeWhatsAppNumber("+54 9 341 15 555 6666"), "5493415556666");
});

test("whatsapp: rechaza en vez de adivinar", () => {
  assert.equal(normalizeWhatsAppNumber(""), "");
  assert.equal(normalizeWhatsAppNumber(null), "");
  assert.equal(normalizeWhatsAppNumber("12345"), "");
  assert.equal(normalizeWhatsAppNumber("3468 5290471"), "", "un dígito de más sin 15 no se adivina");
});
