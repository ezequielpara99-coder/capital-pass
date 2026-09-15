"use client";

import {
  FormEvent,
  useState,
} from "react";

type Props = {
  planId: string;
};

type ApiResponse =
  | {
      ok: true;

      checkoutUrl: string;

      signupId: string;
    }
  | {
      ok: false;

      error: string;
    };

export default function SubscriptionForm({
  planId,
}: Props) {
  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    setLoading(
      true
    );

    setError(
      ""
    );

    const form =
      new FormData(
        event.currentTarget
      );

    try {
      const response =
        await fetch(
          "/api/mercadopago/suscripcion",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                planId,

                firstName:
                  String(
                    form.get(
                      "first_name"
                    ) ??
                      ""
                  ),

                lastName:
                  String(
                    form.get(
                      "last_name"
                    ) ??
                      ""
                  ),

                organizationName:
                  String(
                    form.get(
                      "organization_name"
                    ) ??
                      ""
                  ),

                email:
                  String(
                    form.get(
                      "email"
                    ) ??
                      ""
                  ),

                whatsapp:
                  String(
                    form.get(
                      "whatsapp"
                    ) ??
                      ""
                  ),
              }),
          }
        );

      const data =
        (await response
          .json()) as ApiResponse;

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.ok
            ? "No se pudo iniciar Mercado Pago."
            : data.error
        );
      }

      window.location.assign(
        data.checkoutUrl
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la suscripción."
      );

      setLoading(
        false
      );
    }
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="mt-6 space-y-4"
    >
      {error && (
        <div className="border border-red-400/25 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          name="first_name"
          placeholder="Ej. Martín"
          required
        />

        <Field
          label="Apellido"
          name="last_name"
          placeholder="Ej. González"
          required
        />
      </div>

      <Field
        label="Nombre de la organización"
        name="organization_name"
        placeholder="Ej. Club Prisma"
        required
      />

      <Field
        label="Email"
        name="email"
        type="email"
        placeholder="organizador@email.com"
        required
      />

      <Field
        label="WhatsApp"
        name="whatsapp"
        type="tel"
        placeholder="Ej. 5493415555555"
      />

      <button
        type="submit"
        disabled={
          loading
        }
        className="group mt-2 flex h-13 w-full items-center justify-between bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_45px_rgba(255,59,36,.20)] transition hover:scale-[1.01] hover:shadow-[0_18px_55px_rgba(255,59,36,.28)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {loading
            ? "Abriendo Mercado Pago..."
            : "Suscribirme con Mercado Pago"}
        </span>

        <span className="transition group-hover:translate-x-1">
          →
        </span>
      </button>

      <p className="text-center text-[10px] leading-5 text-white/25">
        El precio se valida directamente en Capital Pass.
        El navegador no puede modificar el monto.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;

  name: string;

  type?: string;

  placeholder?: string;

  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.12em] text-white/35">
        {label}

        {required && (
          <span className="ml-1 text-[#ff6244]">
            *
          </span>
        )}
      </span>

      <input
        name={
          name
        }
        type={
          type
        }
        required={
          required
        }
        placeholder={
          placeholder
        }
        className="h-12 w-full border border-white/[0.09] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/15 focus:border-[#ff5a2a]/50 focus:bg-black/45"
      />
    </label>
  );
}
