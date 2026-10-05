"use client";

import { useState } from "react";
import Link from "next/link";

type Role = "organizador" | "rrpp" | "puerta" | "bartender" | "socio" | "comprador";

type Section = { title: string; steps: string[] };
type RoleGuide = { label: string; intro: string; sections: Section[] };

const GUIDE: Record<Role, RoleGuide> = {
  organizador: {
    label: "Organizador",
    intro: "Todo lo que armás y controlás desde /panel: eventos, entradas, RRPP, puerta, stock, mesas, socios y finanzas.",
    sections: [
      {
        title: "Crear un evento",
        steps: [
          "Entrá a Mis eventos → + Crear evento.",
          "Cargá nombre, fecha, lugar y ciudad. Podés subir una portada: esa misma imagen se usa de fondo (blureado) en la página pública del evento.",
          "El evento arranca en estado \"Próximo\". Lo pasás a \"Activo\" el día del evento para habilitar la venta en puerta y el escaneo de entradas.",
        ],
      },
      {
        title: "Tandas de entradas",
        steps: [
          "Desde el evento, agregá una tanda: nombre, precio, cupo y (opcional) fecha de inicio/fin de venta.",
          "Una tanda se agota sola cuando se vende todo el cupo. Si devolvés una entrada, se reabre automáticamente si vuelve a haber lugar.",
          "No podés bajar el cupo de una tanda por debajo de lo ya vendido — el sistema lo bloquea para no dejar la cuenta en negativo.",
        ],
      },
      {
        title: "Combos y packs",
        steps: [
          "Un combo es una entrada con consumición incluida (ej. \"Entrada + Fernet\"): se vincula a un producto de tu stock y se descuenta solo cuando el bartender lo entrega.",
          "Un pack es un conjunto de varias entradas de la misma tanda con descuento (ej. \"Pack x4\"), pensado para grupos. Puede tener de 2 a 50 entradas.",
        ],
      },
      {
        title: "RRPP y comisiones",
        steps: [
          "Invitá un RRPP desde RRPPs → agregar. Asignalo al evento y definí su % de comisión.",
          "El % se congela en cada venta: si después lo cambiás, no afecta lo que ya vendió, solo las ventas nuevas.",
          "Podés dejar a tu equipo (RRPP, puerta, control, barra) asignado a varios eventos: cada uno ve siempre el evento en curso o el próximo, no uno que ya terminó.",
          "En Informes vas a ver cuánto generó cada RRPP y cuánto ya le pagaste. Si le pagás de más por error, el sistema te lo muestra aparte para que lo descuentes del próximo pago.",
        ],
      },
      {
        title: "Venta en puerta",
        steps: [
          "Creá un usuario de vendedor de puerta y asignalo al evento en Venta en puerta.",
          "Se puede prender/apagar la venta en puerta y definir un horario límite desde la configuración del evento.",
          "El vendedor cobra en efectivo o transferencia; la entrada se genera al toque con su QR.",
        ],
      },
      {
        title: "Stock y barras",
        steps: [
          "Cargá tus productos en Stock, asignalos al evento con el stock total comprado, y repartilo entre las barras que tengas.",
          "Asigná bartenders a cada barra. Cada trago que entregan descuenta del stock de ESA barra, no del pool general.",
          "El pool general de stock no se puede repartir de más entre barras: si ya está todo asignado, no te deja cargar más hasta que subas el total.",
        ],
      },
      {
        title: "Mesas",
        steps: [
          "Cargá las mesas del evento con su capacidad y precio.",
          "Podés vender una mesa vos mismo, dejar que la compren online desde la página pública del evento, o que un socio premium la reserve desde su carnet.",
          "Toda mesa vendida (en persona u online) genera su propia entrada con QR y código — el control de ingreso la valida igual que cualquier otra entrada.",
        ],
      },
      {
        title: "Traslados",
        steps: [
          "Desde RRPPs → Traslados armás los colectivos del evento: nombre, horario, lugar de salida, cupo y recorrido (paradas).",
          "Podés dejarlo a cargo de un RRPP puntual o como colectivo \"general\", que cualquier RRPP del evento puede usar para sumar pasajeros.",
          "Si un pasajero avisa que no va, entrá a Pasajeros dentro de ese colectivo y cancelá su pasaje: libera el lugar para otro y su código deja de ser válido.",
          "Podés agregar, reordenar o corregir paradas cuando quieras: cada pasajero conserva la parada donde sube. El cupo no se puede bajar por debajo de los pasajeros que ya tiene.",
        ],
      },
      {
        title: "Control de acceso",
        steps: [
          "Asigná controladores al evento en Ingresos. Ellos validan el QR o el código manual en la puerta.",
          "La app de control funciona offline: si se corta el wifi del lugar, sigue validando contra los datos ya descargados y sincroniza apenas vuelve la señal.",
          "Lista negra: cargá un DNI restringido y cualquier controlador lo va a ver marcado al escanear, incluso sin conexión.",
        ],
      },
      {
        title: "Datos de acceso de tu equipo",
        steps: [
          "Al crear un RRPP, vendedor de puerta, controlador o bartender, cargá su email y su WhatsApp. La contraseña podés dejarla vacía: se genera sola.",
          "Apenas lo creás te aparece un mensaje con su usuario, email, contraseña y el link para entrar, con un botón para mandárselo por WhatsApp. La contraseña se muestra una sola vez: mandala o copiala antes de cerrar.",
          "Cada persona puede entrar con su usuario, su email o su celular (con código de área), más la contraseña.",
          "Si alguien se la olvida, tocá \"🔑 Contraseña\" al lado de esa persona (en RRPPs, Venta en puerta, Ingresos o Stock): se genera una nueva al instante y la anterior deja de funcionar.",
        ],
      },
      {
        title: "Membresía premium (app del socio)",
        steps: [
          "Si tu boliche tiene socios fijos, activá Membresía y cargá cada socio con su carnet digital (QR + código de socio).",
          "Armá la carta (tragos, combos, premios) para que el socio pida desde su celular y pague con saldo cargado o en la barra.",
          "El socio ve su ranking, sus puntos y puede cargar saldo con Mercado Pago desde su propio carnet — la plata va directo a tu cuenta de Mercado Pago conectada.",
        ],
      },
      {
        title: "Mercado Pago",
        steps: [
          "Para vender entradas o mesas online, conectá tu cuenta de Mercado Pago desde el panel (OAuth, un click).",
          "Capital Pass no cobra comisión por entrada: lo único que se descuenta es lo que cobra Mercado Pago por el pago.",
        ],
      },
      {
        title: "Tu suscripción",
        steps: [
          "La suscripción se paga por período con Mercado Pago, desde Perfil → Gestionar suscripción y pagos. Te avisamos por email 5 días antes del vencimiento.",
          "Desde 7 días antes del vencimiento ya podés renovar ahí mismo: lo que pagues se suma a partir del vencimiento, así que no perdés ningún día.",
          "Si no renovás a tiempo, tu panel y el de tu equipo se bloquean hasta que pagues. Apenas se confirma el pago, se habilita todo de nuevo.",
        ],
      },
      {
        title: "Informes y finanzas",
        steps: [
          "En Informes vas a ver ventas por canal (online, RRPP, puerta, mesas), comisiones y totales del evento.",
        ],
      },
    ],
  },
  rrpp: {
    label: "RRPP",
    intro: "Vendés entradas para los eventos a los que te asignó el organizador y cobrás tu comisión.",
    sections: [
      {
        title: "Vender",
        steps: [
          "Entrá a Nueva venta, elegí la tanda y la cantidad, cargá los datos del comprador y cobrá en efectivo o transferencia.",
          "La entrada se genera al toque con su QR — se la mandás al comprador por WhatsApp o email desde la misma pantalla.",
        ],
      },
      {
        title: "Traslados",
        steps: [
          "Si el evento tiene colectivo/combi organizado, podés sumar pasajeros al armar la venta.",
          "El pasajero ve en su celular por dónde va el colectivo y cuánto falta para su parada, sin necesidad de GPS en vivo.",
        ],
      },
      {
        title: "Tu comisión",
        steps: [
          "El % que cobrás por cada venta te lo asigna el organizador al evento — se congela en el momento de cada venta.",
          "Si se devuelve una entrada que vos vendiste, tu comisión de esa venta se descuenta del total que se te debe.",
        ],
      },
    ],
  },
  puerta: {
    label: "Puerta / Control",
    intro: "Validás entradas en el ingreso, o vendés directo en la puerta si el organizador te habilitó esa función.",
    sections: [
      {
        title: "Validar entradas",
        steps: [
          "Escaneá el QR de la entrada o ingresá el código manual.",
          "Una entrada usada no se puede volver a escanear — si alguien intenta entrar dos veces, la app te avisa.",
          "Funciona sin wifi: si el lugar tiene mala señal, la app sigue validando contra lo descargado y avisa el resultado final cuando vuelve la conexión.",
        ],
      },
      {
        title: "Vender en la puerta",
        steps: [
          "Si el organizador te asignó como vendedor de puerta, vas a ver la opción de vender en la misma pantalla.",
          "Elegí la tanda, cargá los datos del comprador y cobrá — la entrada se genera al toque.",
        ],
      },
      {
        title: "Lista negra",
        steps: [
          "Si escaneás a alguien restringido, la app te lo marca en pantalla aunque no tengas conexión en ese momento.",
        ],
      },
    ],
  },
  bartender: {
    label: "Bartender",
    intro: "Entregás pedidos de la barra y ves el stock disponible en tiempo real.",
    sections: [
      {
        title: "Pedidos",
        steps: [
          "Vas a ver los pedidos que llegan de la app de los socios, y podés cargar ventas sueltas de la barra.",
          "Al entregar un pedido, el stock se descuenta solo de tu barra. Si no alcanza el stock, el sistema te avisa en vez de entregarlo igual.",
        ],
      },
      {
        title: "Combos",
        steps: [
          "Si alguien tiene una entrada con combo (consumición incluida), escaneá su QR para canjearlo — descuenta del combo, no le vuelve a cobrar.",
        ],
      },
    ],
  },
  socio: {
    label: "Socio premium",
    intro: "Si el boliche te dio de alta como socio, tenés tu propia app con carnet, carta y puntos.",
    sections: [
      {
        title: "Tu carnet",
        steps: [
          "Entrás con el link que te mandaron por WhatsApp o email — no hace falta instalar nada.",
          "Ahí ves tu QR de socio, tu saldo y tus puntos.",
        ],
      },
      {
        title: "Pedir y reservar mesa",
        steps: [
          "Desde la carta podés pedir tragos o combos, pagando con tu saldo o en la barra.",
          "Para pagar con saldo o canjear premios con tus puntos necesitás haber iniciado sesión con tu email una vez (no alcanza con tener el link del carnet) — es una protección para que nadie gaste tu saldo ni tus puntos sin tu permiso.",
          "También podés reservar una mesa desde ahí mismo, aunque sea para un evento de otro día: la reserva se mantiene hasta el evento.",
        ],
      },
      {
        title: "Cargar saldo",
        steps: [
          "Cargás saldo con Mercado Pago directo desde tu carnet. Es dinero que ya no se puede devolver, así que te lo avisa antes de cobrarte.",
        ],
      },
      {
        title: "Puntos y ranking",
        steps: [
          "Ganás puntos con cada consumo que te entregan y, si el boliche lo activó, por cada fiesta a la que vas (al escanear tu carnet en la puerta). Podés ver el ranking de socios y competir por los premios del mes.",
          "Algunos días pueden tener puntos dobles (o más) — te lo muestra en tu carnet cuando está activo.",
        ],
      },
    ],
  },
  comprador: {
    label: "Comprador de entradas",
    intro: "Si vas a un evento organizado con Capital Pass, así comprás y usás tu entrada.",
    sections: [
      {
        title: "Comprar",
        steps: [
          "Entrá a la página del evento (el link que te compartió el organizador), elegí tu tanda y pagá con Mercado Pago, con tarjeta o dinero en cuenta (no se puede pagar en efectivo en Rapipago o Pago Fácil: la entrada se reserva solo por 30 minutos).",
          "La entrada te llega con su QR — no hace falta imprimir nada.",
        ],
      },
      {
        title: "Usar la entrada",
        steps: [
          "Mostrá el QR en el ingreso. Si no tenés señal en el momento, el QR igual se valida (queda guardado en tu celular).",
        ],
      },
    ],
  },
};

const ROLE_ORDER: Role[] = ["organizador", "rrpp", "puerta", "bartender", "socio", "comprador"];

export default function GuiaPage() {
  const [role, setRole] = useState<Role>("organizador");
  const guide = GUIDE[role];

  return (
    <main className="min-h-screen bg-[#050505] text-[#f7f3ed]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[260px] -top-[260px] h-[650px] w-[650px] rounded-full bg-[#ff2a1a]/[0.11] blur-[180px]" />
        <div className="absolute -right-[300px] top-[17%] h-[720px] w-[720px] rounded-full bg-[#ff5a2a]/[0.085] blur-[195px]" />
      </div>

      <header className="relative z-10 border-b border-white/[0.08] bg-[#050505]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[80px] max-w-[1200px] items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
              <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
            </div>
            <p className="text-[12px] font-black tracking-[0.1em]">
              CAPITAL<span className="text-[#ff3b24]">PASS</span>
            </p>
          </Link>
          <Link
            href="/panel"
            className="h-10 items-center border border-white/[0.14] px-5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60 transition hover:text-white sm:flex hidden"
          >
            Ir al panel
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1200px] px-5 py-14 md:px-8 md:py-20">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff6f4d]">Guía de uso</p>
        <h1 className="mt-4 max-w-[720px] text-[clamp(34px,5.5vw,64px)] font-black uppercase leading-[0.92] tracking-[-0.05em]">
          Cómo se usa <span className="text-[#ff3b24]">Capital Pass.</span>
        </h1>
        <p className="mt-5 max-w-[620px] text-sm leading-7 text-white/45 md:text-base">
          Elegí tu rol y seguí los pasos. Si te falta algo, escribinos por WhatsApp desde el botón de soporte.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          {ROLE_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              className={`h-11 border px-5 text-[10px] font-black uppercase tracking-[0.13em] transition ${
                role === value
                  ? "border-[#ff5a2a]/60 bg-[#ff3b24]/15 text-white"
                  : "border-white/[0.12] text-white/45 hover:border-white/25 hover:text-white"
              }`}
            >
              {GUIDE[value].label}
            </button>
          ))}
        </div>

        <div className="mt-10 border-t border-white/[0.08] pt-8">
          <p className="max-w-[680px] text-sm leading-7 text-white/50">{guide.intro}</p>

          <div className="mt-10 space-y-8">
            {guide.sections.map((section, index) => (
              <div key={section.title} className="border border-white/[0.08] bg-white/[0.02] p-6 md:p-7">
                <p className="text-[9px] font-bold text-[#ff6f4d]">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.02em] md:text-2xl">{section.title}</h2>
                <ol className="mt-4 space-y-3">
                  {section.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="flex gap-3 text-sm leading-6 text-white/60">
                      <span className="mt-0.5 shrink-0 text-[#ff6545]">→</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-10 md:px-8">
          <p className="text-[9px] uppercase tracking-[0.18em] text-white/30">
            CAPITAL<span className="text-[#ff3b24]">PASS</span> · Guía de uso
          </p>
          <Link href="/" className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white">
            ← Volver al inicio
          </Link>
        </div>
      </footer>
    </main>
  );
}
