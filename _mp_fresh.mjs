import { MercadoPagoConfig, PreApproval } from "mercadopago";

const accessToken = "APP_USR-7158703983475294-090823-49ea200ea058d348dc02a16f04d40d55-354738946";
const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
const preApproval = new PreApproval(client);

const key = "fresh-" + Date.now();
const result = await preApproval.create({
  body: {
    reason: "Capital Pass Mensual",
    external_reference: `capitalpass_signup:56e4dc63-3cdd-43fe-835a-fd81de265738`,
    payer_email: "focusarg.ok@gmail.com",
    status: "pending",
    back_url: "https://capitalpass.app/cuenta?retorno=mercadopago",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 100, currency_id: "ARS" },
  },
  requestOptions: { idempotencyKey: key },
});
console.log("PREAPPROVAL_ID:", result.id);
console.log("INIT_POINT:", result.init_point);
