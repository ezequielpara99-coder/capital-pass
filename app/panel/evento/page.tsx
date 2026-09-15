"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type EventData = {
  id: string;
  organization_id: string;
  name: string;
  status: string;

  rrpp_sales_enabled: boolean;
  rrpp_sales_cutoff_at: string | null;

  door_sales_enabled: boolean;
  door_sales_start_at: string | null;
  door_sales_end_at: string | null;

  banner_horizontal_path: string | null;
  banner_square_path: string | null;
  banner_vertical_path: string | null;

  ticket_background_path: string | null;
  ticket_design_mode: "capital_pass" | "custom";

  design_service_status:
    | "none"
    | "requested"
    | "in_progress"
    | "ready";

  design_service_items: string[];
  design_service_notes: string | null;
  design_service_requested_at: string | null;
};

type AssetField =
  | "banner_horizontal_path"
  | "banner_square_path"
  | "banner_vertical_path"
  | "ticket_background_path";

type AssetKind =
  | "banner-horizontal"
  | "banner-square"
  | "banner-vertical"
  | "ticket-background";

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number | string;
  currency: string;
  capacity: number;
  status: string;
  active: boolean;
};

type TicketRecord = {
  id: string;
  ticket_type_id: string;
  status: string;
};

type SaleItemRecord = {
  ticket_type_id: string;
  quantity: number;
};

export default function ManageEventPage() {
  return (
    <Suspense fallback={<ManageEventFallback />}>
      <ManageEventContent />
    </Suspense>
  );
}

function ManageEventFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-[#f7f3ed]">
      <section className="w-full max-w-xl border border-[#ff5a2a]/20 bg-[#0a0807] p-6 text-center">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Capital Pass
        </p>
        <p className="mt-3 text-sm text-white/45">
          Cargando configuración del evento...
        </p>
      </section>
    </main>
  );
}

function ManageEventContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedEventId = searchParams.get("eventId");

  const [event, setEvent] = useState<EventData | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);

  const [uploadingAsset, setUploadingAsset] =
    useState<AssetField | null>(null);

  const [requestingDesign, setRequestingDesign] =
    useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const [newTicket, setNewTicket] = useState({
    name: "",
    description: "",
    price: "",
    capacity: "",
    status: "upcoming",
  });

  // =======================================================
  // CARGAR DATOS
  // =======================================================

  useEffect(() => {
    loadData();
  }, [requestedEventId]);

  async function loadData() {
    const supabase = createClient();

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const eventSelect = `
      id,
      organization_id,
      name,
      status,

      rrpp_sales_enabled,
      rrpp_sales_cutoff_at,

      door_sales_enabled,
      door_sales_start_at,
      door_sales_end_at,

      banner_horizontal_path,
      banner_square_path,
      banner_vertical_path,

      ticket_background_path,
      ticket_design_mode,

      design_service_status,
      design_service_items,
      design_service_notes,
      design_service_requested_at
    `;

    const eventQuery = supabase
      .from("events")
      .select(eventSelect);

    const {
      data: events,
      error: eventError,
    } = requestedEventId
      ? await eventQuery
          .eq("id", requestedEventId)
          .limit(1)
      : await eventQuery
          .order("starts_at", { ascending: false })
          .limit(1);

    if (eventError) {
      showError("No se pudo cargar el evento.");
      setLoading(false);
      return;
    }

    const selectedEvent = events?.[0];

    if (!selectedEvent) {
      setEvent(null);
      setLoading(false);
      return;
    }

    setEvent({
      ...(selectedEvent as EventData),

      ticket_design_mode:
        selectedEvent.ticket_design_mode === "custom"
          ? "custom"
          : "capital_pass",

      design_service_status:
        (selectedEvent.design_service_status ??
          "none") as EventData["design_service_status"],

      design_service_items:
        Array.isArray(
          selectedEvent.design_service_items
        )
          ? selectedEvent.design_service_items
          : [],

      design_service_notes:
        selectedEvent.design_service_notes ??
        null,

      design_service_requested_at:
        selectedEvent.design_service_requested_at ??
        null,
    });

    // TANDAS
    const { data: ticketTypeData, error: ticketTypeError } =
      await supabase
        .from("ticket_types")
        .select(`
          id,
          name,
          description,
          price_minor,
          currency,
          capacity,
          status,
          active
        `)
        .eq("event_id", selectedEvent.id)
        .order("created_at", { ascending: true });

    if (ticketTypeError) {
      showError("No se pudieron cargar las tandas.");
      setLoading(false);
      return;
    }

    setTicketTypes((ticketTypeData ?? []) as TicketType[]);

    // TICKETS YA GENERADOS
    const { data: ticketData } = await supabase
      .from("tickets")
      .select(`
        id,
        ticket_type_id,
        status
      `)
      .eq("event_id", selectedEvent.id);

    setTickets((ticketData ?? []) as TicketRecord[]);

    // DETALLES DE VENTA
    const { data: saleItemData } = await supabase
      .from("sale_items")
      .select(`
        ticket_type_id,
        quantity
      `)
      .eq("event_id", selectedEvent.id);

    setSaleItems((saleItemData ?? []) as SaleItemRecord[]);

    setLoading(false);
  }

  // =======================================================
  // MENSAJES
  // =======================================================

  function showSuccess(text: string) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(text: string) {
    setMessageType("error");
    setMessage(text);
  }

  function readableDatabaseError(
    errorMessage: string | undefined,
    fallback: string
  ) {
    if (!errorMessage) return fallback;

    if (
      errorMessage.includes("No podés reducir el cupo")
    ) {
      return errorMessage;
    }

    if (
      errorMessage.includes(
        "No se puede eliminar una tanda que ya tiene ventas"
      )
    ) {
      return errorMessage;
    }

    if (
      errorMessage.toLowerCase().includes("duplicate")
    ) {
      return "Ya existe una tanda con ese nombre para este evento.";
    }

    return fallback;
  }

  // =======================================================
  // CANTIDADES POR TANDA
  // =======================================================

  function soldForTicketType(ticketTypeId: string) {
    return tickets.filter(
      (ticket) =>
        ticket.ticket_type_id === ticketTypeId &&
        ticket.status !== "cancelled"
    ).length;
  }

  function hasSales(ticketTypeId: string) {
    return saleItems.some(
      (item) => item.ticket_type_id === ticketTypeId
    );
  }

  // =======================================================
  // IDENTIDAD VISUAL
  // =======================================================

  function assetPublicUrl(
    path: string | null
  ) {
    if (!path) {
      return null;
    }

    const supabase =
      createClient();

    return supabase.storage
      .from("event-assets")
      .getPublicUrl(path)
      .data.publicUrl;
  }

  function fileExtension(
    file: File
  ) {
    if (
      file.type === "image/png"
    ) {
      return "png";
    }

    if (
      file.type === "image/webp"
    ) {
      return "webp";
    }

    return "jpg";
  }

  async function uploadEventAsset({
    file,
    field,
    kind,
    label,
  }: {
    file: File;
    field: AssetField;
    kind: AssetKind;
    label: string;
  }) {
    if (!event) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(
        file.type
      )
    ) {
      showError(
        "La imagen debe ser JPG, PNG o WEBP."
      );

      return;
    }

    if (
      file.size >
      15 * 1024 * 1024
    ) {
      showError(
        "La imagen no puede superar los 15 MB."
      );

      return;
    }

    const supabase =
      createClient();

    setUploadingAsset(field);
    setMessage("");

    const oldPath =
      event[field];

    const extension =
      fileExtension(file);

    const objectPath =
      `${event.organization_id}/${event.id}/${kind}/${crypto.randomUUID()}.${extension}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("event-assets")
      .upload(
        objectPath,
        file,
        {
          cacheControl:
            "3600",

          upsert:
            false,

          contentType:
            file.type,
        }
      );

    if (uploadError) {
      showError(
        `No se pudo subir ${label.toLowerCase()}.`
      );

      setUploadingAsset(null);
      return;
    }

    const {
      error: updateError,
    } = await supabase
      .from("events")
      .update({
        [field]:
          objectPath,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        event.id
      );

    if (updateError) {
      await supabase.storage
        .from("event-assets")
        .remove([
          objectPath,
        ]);

      showError(
        `La imagen se subió, pero no pudimos vincular ${label.toLowerCase()} al evento.`
      );

      setUploadingAsset(null);
      return;
    }

    if (
      oldPath &&
      oldPath !== objectPath
    ) {
      await supabase.storage
        .from("event-assets")
        .remove([
          oldPath,
        ]);
    }

    setEvent({
      ...event,
      [field]:
        objectPath,
    });

    showSuccess(
      `${label} actualizado correctamente.`
    );

    setUploadingAsset(null);
  }

  async function removeEventAsset(
    field: AssetField,
    label: string
  ) {
    if (!event) {
      return;
    }

    const path =
      event[field];

    if (!path) {
      return;
    }

    const confirmed =
      window.confirm(
        `¿Quitar ${label.toLowerCase()} del evento?`
      );

    if (!confirmed) {
      return;
    }

    const supabase =
      createClient();

    setUploadingAsset(field);
    setMessage("");

    const {
      error: updateError,
    } = await supabase
      .from("events")
      .update({
        [field]:
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        event.id
      );

    if (updateError) {
      showError(
        `No se pudo quitar ${label.toLowerCase()}.`
      );

      setUploadingAsset(null);
      return;
    }

    await supabase.storage
      .from("event-assets")
      .remove([
        path,
      ]);

    setEvent({
      ...event,
      [field]:
        null,
    });

    showSuccess(
      `${label} eliminado.`
    );

    setUploadingAsset(null);
  }

  function toggleDesignServiceItem(
    item: string
  ) {
    if (!event) {
      return;
    }

    const exists =
      event.design_service_items.includes(
        item
      );

    setEvent({
      ...event,

      design_service_items:
        exists
          ? event.design_service_items.filter(
              (current) =>
                current !== item
            )
          : [
              ...event.design_service_items,
              item,
            ],
    });
  }

  async function requestCapitalPassDesign() {
    if (!event) {
      return;
    }

    if (
      event.design_service_items.length ===
      0
    ) {
      showError(
        "Elegí al menos una pieza para solicitar el diseño a Capital Pass."
      );

      return;
    }

    const supabase =
      createClient();

    setRequestingDesign(true);
    setMessage("");

    const requestedAt =
      event.design_service_requested_at ??
      new Date().toISOString();

    const {
      error,
    } = await supabase
      .from("events")
      .update({
        design_service_status:
          "requested",

        design_service_items:
          event.design_service_items,

        design_service_notes:
          event.design_service_notes?.trim() ||
          null,

        design_service_requested_at:
          requestedAt,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        event.id
      );

    if (error) {
      showError(
        "No se pudo registrar la solicitud de diseño."
      );

      setRequestingDesign(false);
      return;
    }

    setEvent({
      ...event,

      design_service_status:
        "requested",

      design_service_requested_at:
        requestedAt,
    });

    showSuccess(
      "Solicitud enviada a Capital Pass. Quedó registrada dentro del evento."
    );

    setRequestingDesign(false);
  }

  function downloadTicketTemplate() {
    const template = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#111111"/>
  <rect x="60" y="60" width="960" height="1800" rx="12" fill="none" stroke="#ff5a2a" stroke-width="3" stroke-dasharray="14 10"/>
  <text x="90" y="125" fill="#ffffff" font-family="Arial" font-size="38" font-weight="700">ZONA LIBRE DE DISEÑO</text>
  <text x="90" y="168" fill="#ffffff" opacity=".58" font-family="Arial" font-size="20">Podés diseñar libremente todo el fondo.</text>

  <rect x="60" y="1320" width="960" height="540" rx="34" fill="#ff3b241a" stroke="#ff5a2a" stroke-width="4"/>
  <text x="90" y="1370" fill="#ff9a7d" font-family="Arial" font-size="26" font-weight="700">ZONA RESERVADA CAPITAL PASS</text>
  <text x="90" y="1408" fill="#ffffff" opacity=".58" font-family="Arial" font-size="18">No colocar caras, logos, textos ni elementos importantes en esta zona.</text>

  <rect x="90" y="1465" width="555" height="80" rx="16" fill="none" stroke="#ff5a2a" stroke-width="2"/>
  <text x="110" y="1515" fill="#ff9a7d" font-family="Arial" font-size="22" font-weight="700">NOMBRE Y APELLIDO</text>

  <rect x="90" y="1563" width="555" height="70" rx="16" fill="none" stroke="#ff5a2a" stroke-width="2"/>
  <text x="110" y="1607" fill="#ff9a7d" font-family="Arial" font-size="22" font-weight="700">DNI</text>

  <rect x="90" y="1651" width="555" height="70" rx="16" fill="none" stroke="#ff5a2a" stroke-width="2"/>
  <text x="110" y="1695" fill="#ff9a7d" font-family="Arial" font-size="22" font-weight="700">TIPO DE ENTRADA</text>

  <rect x="90" y="1762" width="555" height="98" rx="16" fill="none" stroke="#ff5a2a" stroke-width="2"/>
  <text x="110" y="1822" fill="#ff9a7d" font-family="Arial" font-size="22" font-weight="700">CÓDIGO MANUAL</text>

  <rect x="710" y="1470" width="310" height="310" rx="24" fill="#ffffff" stroke="#ff3b24" stroke-width="5"/>
  <text x="778" y="1636" fill="#111111" font-family="Arial" font-size="30" font-weight="700">QR</text>
  <text x="758" y="1820" fill="#ff8064" font-family="Arial" font-size="20" font-weight="700">QR DINÁMICO</text>

  <text x="90" y="1890" fill="#ffffff" opacity=".45" font-family="Arial" font-size="16">Capital Pass · Plantilla técnica de entrada · 1080 × 1920 px</text>
</svg>`;

    const blob =
      new Blob(
        [
          template,
        ],
        {
          type:
            "image/svg+xml;charset=utf-8",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      "capital-pass-plantilla-entrada-1080x1920.svg";

    document.body.appendChild(
      anchor
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url
    );
  }

  // =======================================================
  // GUARDAR CONFIGURACIÓN DEL EVENTO
  // =======================================================

  async function saveEventSettings() {
    if (!event) return;

    const supabase = createClient();

    setSavingEvent(true);
    setMessage("");

    const { error } = await supabase
      .from("events")
      .update({
        status: event.status,

        rrpp_sales_enabled: event.rrpp_sales_enabled,

        rrpp_sales_cutoff_at: event.rrpp_sales_cutoff_at
          ? new Date(event.rrpp_sales_cutoff_at).toISOString()
          : null,

        door_sales_enabled: event.door_sales_enabled,

        door_sales_start_at: event.door_sales_start_at
          ? new Date(event.door_sales_start_at).toISOString()
          : null,

        door_sales_end_at: event.door_sales_end_at
          ? new Date(event.door_sales_end_at).toISOString()
          : null,

        ticket_design_mode:
          event.ticket_design_mode,

        design_service_status:
          event.design_service_status,

        design_service_items:
          event.design_service_items,

        design_service_notes:
          event.design_service_notes?.trim() ||
          null,

        design_service_requested_at:
          event.design_service_requested_at,

        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    if (error) {
      showError("No se pudieron guardar los cambios del evento.");
      setSavingEvent(false);
      return;
    }

    showSuccess("Configuración del evento guardada correctamente.");
    setSavingEvent(false);

    await loadData();
  }

  // =======================================================
  // GUARDAR TANDA
  // =======================================================

  async function saveTicketType(ticket: TicketType) {
    const supabase = createClient();

    setMessage("");

    const sold = soldForTicketType(ticket.id);

    if (!ticket.name.trim()) {
      showError("El nombre de la tanda es obligatorio.");
      return;
    }

    if (Number(ticket.price_minor) < 0) {
      showError("El precio no puede ser negativo.");
      return;
    }

    if (Number(ticket.capacity) <= 0) {
      showError("El cupo debe ser mayor a cero.");
      return;
    }

    if (Number(ticket.capacity) < sold) {
      showError(
        `No podés establecer un cupo de ${ticket.capacity}. Ya existen ${sold} entradas vendidas.`
      );
      return;
    }

    setSavingTicketId(ticket.id);

    const { error } = await supabase
      .from("ticket_types")
      .update({
        name: ticket.name.trim(),
        description: ticket.description?.trim() || null,
        price_minor: Number(ticket.price_minor),
        capacity: Number(ticket.capacity),
        status: ticket.status,
        active: ticket.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (error) {
      showError(
        readableDatabaseError(
          error.message,
          "No se pudo actualizar la tanda."
        )
      );

      setSavingTicketId(null);
      return;
    }

    showSuccess(`La tanda "${ticket.name}" fue actualizada correctamente.`);

    setSavingTicketId(null);

    await loadData();
  }

  // =======================================================
  // ELIMINAR TANDA
  // =======================================================

  async function deleteTicketType(ticket: TicketType) {
    const supabase = createClient();

    setMessage("");

    if (hasSales(ticket.id)) {
      showError(
        `No se puede eliminar "${ticket.name}" porque ya tiene ventas. Podés ponerla en estado Pausada.`
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Seguro que querés eliminar la tanda "${ticket.name}"?\n\nEsta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    setDeletingTicketId(ticket.id);

    const { error } = await supabase
      .from("ticket_types")
      .delete()
      .eq("id", ticket.id);

    if (error) {
      showError(
        readableDatabaseError(
          error.message,
          "No se pudo eliminar la tanda."
        )
      );

      setDeletingTicketId(null);
      return;
    }

    showSuccess(`La tanda "${ticket.name}" fue eliminada.`);

    setDeletingTicketId(null);

    await loadData();
  }

  // =======================================================
  // CREAR NUEVA TANDA
  // =======================================================

  async function createTicketType(
    eventSubmit: FormEvent<HTMLFormElement>
  ) {
    eventSubmit.preventDefault();

    if (!event) return;

    const supabase = createClient();

    setMessage("");

    if (!newTicket.name.trim()) {
      showError("Ingresá un nombre para la nueva tanda.");
      return;
    }

    if (!newTicket.price) {
      showError("Ingresá el precio de la nueva tanda.");
      return;
    }

    if (!newTicket.capacity) {
      showError("Ingresá el cupo de la nueva tanda.");
      return;
    }

    if (Number(newTicket.price) < 0) {
      showError("El precio no puede ser negativo.");
      return;
    }

    if (Number(newTicket.capacity) <= 0) {
      showError("El cupo debe ser mayor a cero.");
      return;
    }

    setCreatingTicket(true);

    const { error } = await supabase
      .from("ticket_types")
      .insert({
        event_id: event.id,
        name: newTicket.name.trim(),
        description: newTicket.description.trim() || null,
        price_minor: Number(newTicket.price),
        currency: "ARS",
        capacity: Number(newTicket.capacity),
        status: newTicket.status,
        active: true,
      });

    if (error) {
      showError(
        readableDatabaseError(
          error.message,
          "No se pudo crear la nueva tanda."
        )
      );

      setCreatingTicket(false);
      return;
    }

    setNewTicket({
      name: "",
      description: "",
      price: "",
      capacity: "",
      status: "upcoming",
    });

    showSuccess("Nueva tanda creada correctamente.");

    setCreatingTicket(false);

    await loadData();
  }

  // =======================================================
  // CARGANDO
  // =======================================================

  if (loading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] text-[#f7f3ed]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#ff2a1a]/10 blur-[160px]" />
          <div className="absolute -bottom-52 -left-40 h-[520px] w-[520px] rounded-full bg-[#ff5a2a]/[0.06] blur-[170px]" />
        </div>
        <div className="relative text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#ff5a2a]/20 border-t-[#ff3b24]" />

          <p className="mt-4 text-sm text-white/40">
            Cargando evento...
          </p>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-[#f7f3ed]">
        <p>No hay eventos disponibles.</p>
      </main>
    );
  }

  // =======================================================
  // INTERFAZ
  // =======================================================

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] text-[#f7f3ed]">
      {/* FONDO */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
        <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
        <div className="absolute inset-0 opacity-[0.033]">
          <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
        </div>
      </div>

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[80px] max-w-[1480px] items-center justify-between px-5 md:px-8 xl:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/panel/eventos")}
              className="flex h-10 w-10 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-white/45 transition hover:border-[#ff5a2a]/30 hover:bg-[#ff3b24]/[0.04] hover:text-white"
            >
              ←
            </button>

            <div className="flex items-center gap-3">
              <div className="relative hidden h-9 w-9 overflow-hidden sm:block">
                <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
                <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
              </div>

              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                  Event control
                </p>
                <h1 className="mt-1 max-w-[55vw] truncate text-sm font-black uppercase tracking-[-0.02em] text-white/80">
                  {event.name}
                </h1>
              </div>
            </div>
          </div>

          <button
            onClick={saveEventSettings}
            disabled={savingEvent}
            className="h-10 bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_14px_40px_rgba(255,59,36,.16)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {savingEvent ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </header>

      {/* CONTENIDO */}

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-9 md:px-8 xl:px-10">
        {message && (
          <div
            className={`mb-6 border px-5 py-4 text-sm ${
              messageType === "success"
                ? "border-green-400/20 bg-green-400/[0.07] text-green-200"
                : "border-red-400/20 bg-red-400/[0.07] text-red-200"
            }`}
          >
            {message}
          </div>
        )}

        <section className="mb-8 grid gap-7 border-b border-white/[0.07] pb-9 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                Configuración del evento
              </span>
            </div>

            <h2 className="mt-7 max-w-[980px] text-[clamp(44px,6vw,82px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Gestioná
              <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                {event.name}.
              </span>
            </h2>
          </div>

          <p className="max-w-[420px] text-sm leading-7 text-white/35">
            Identidad, entradas, ventas, RRPPs, puerta y tandas. Todo el evento desde un mismo lugar.
          </p>
        </section>

        {/* IDENTIDAD VISUAL */}

        <Section
          title="Identidad visual"
          description="Subí las piezas gráficas del evento. Los banners y portadas son completamente libres; solamente la entrada personalizada utiliza una plantilla con zonas reservadas."
        >
          <div className="grid gap-4 xl:grid-cols-3">

            <AssetUploadCard
              title="Banner horizontal"
              description="Cabeceras, página pública y espacios panorámicos."
              recommendedSize="1600 × 600 px"
              previewRatio="aspect-[8/3]"
              imageUrl={assetPublicUrl(
                event.banner_horizontal_path
              )}
              loading={
                uploadingAsset ===
                "banner_horizontal_path"
              }
              onUpload={(file) =>
                uploadEventAsset({
                  file,
                  field:
                    "banner_horizontal_path",
                  kind:
                    "banner-horizontal",
                  label:
                    "Banner horizontal",
                })
              }
              onRemove={() =>
                removeEventAsset(
                  "banner_horizontal_path",
                  "Banner horizontal"
                )
              }
            />

            <AssetUploadCard
              title="Portada cuadrada"
              description="Cards del evento, listados y piezas compactas."
              recommendedSize="1080 × 1080 px"
              previewRatio="aspect-square"
              imageUrl={assetPublicUrl(
                event.banner_square_path
              )}
              loading={
                uploadingAsset ===
                "banner_square_path"
              }
              onUpload={(file) =>
                uploadEventAsset({
                  file,
                  field:
                    "banner_square_path",
                  kind:
                    "banner-square",
                  label:
                    "Portada cuadrada",
                })
              }
              onRemove={() =>
                removeEventAsset(
                  "banner_square_path",
                  "Portada cuadrada"
                )
              }
            />

            <AssetUploadCard
              title="Portada vertical"
              description="Vista mobile, piezas editoriales y promoción vertical."
              recommendedSize="1080 × 1350 px"
              previewRatio="aspect-[4/5]"
              imageUrl={assetPublicUrl(
                event.banner_vertical_path
              )}
              loading={
                uploadingAsset ===
                "banner_vertical_path"
              }
              onUpload={(file) =>
                uploadEventAsset({
                  file,
                  field:
                    "banner_vertical_path",
                  kind:
                    "banner-vertical",
                  label:
                    "Portada vertical",
                })
              }
              onRemove={() =>
                removeEventAsset(
                  "banner_vertical_path",
                  "Portada vertical"
                )
              }
            />

          </div>

          {/* DISEÑO ENTRADA */}

          <div className="relative mt-6 overflow-hidden border border-white/[0.09] bg-[#0a0908]/90 p-5 shadow-[0_25px_80px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.03)] backdrop-blur-xl md:p-6">

            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">

              <div>

                <p className="text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]">
                  Entrada digital
                </p>

                <h3 className="mt-2 text-lg font-semibold">
                  Diseño de la entrada
                </h3>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
                  Podés usar el diseño estándar de Capital Pass o subir un fondo diseñado especialmente para tu evento.
                </p>

              </div>

              <button
                type="button"
                onClick={downloadTicketTemplate}
                className="inline-flex h-11 items-center justify-center border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.055] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-[#ffab94] transition hover:border-[#ff5a2a]/45 hover:bg-[#ff3b24]/[0.09] hover:text-white"
              >
                ↓ Descargar plantilla para diseñador
              </button>

            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">

              <DesignModeCard
                title="Diseño Capital Pass"
                description="Usamos la entrada estándar de la plataforma."
                selected={
                  event.ticket_design_mode ===
                  "capital_pass"
                }
                onClick={() =>
                  setEvent({
                    ...event,
                    ticket_design_mode:
                      "capital_pass",
                  })
                }
              />

              <DesignModeCard
                title="Diseño personalizado"
                description="Subís el arte del evento y Capital Pass coloca QR y datos automáticamente."
                selected={
                  event.ticket_design_mode ===
                  "custom"
                }
                onClick={() =>
                  setEvent({
                    ...event,
                    ticket_design_mode:
                      "custom",
                  })
                }
              />

            </div>

            {event.ticket_design_mode ===
              "custom" && (

              <div className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">

                <AssetUploadCard
                  title="Arte de la entrada"
                  description="Diseñá usando la plantilla. Capital Pass agregará la información del comprador en la zona reservada."
                  recommendedSize="1080 × 1920 px"
                  previewRatio="aspect-[9/16]"
                  imageUrl={assetPublicUrl(
                    event.ticket_background_path
                  )}
                  loading={
                    uploadingAsset ===
                    "ticket_background_path"
                  }
                  onUpload={(file) =>
                    uploadEventAsset({
                      file,
                      field:
                        "ticket_background_path",
                      kind:
                        "ticket-background",
                      label:
                        "Diseño de entrada",
                    })
                  }
                  onRemove={() =>
                    removeEventAsset(
                      "ticket_background_path",
                      "Diseño de entrada"
                    )
                  }
                />

                <TicketPreview
                  imageUrl={assetPublicUrl(
                    event.ticket_background_path
                  )}
                  eventName={
                    event.name
                  }
                />

              </div>

            )}

          </div>

          {/* SERVICIO DE DISEÑO */}

          <div className="mt-6 overflow-hidden border border-[#ff5a2a]/[0.16] bg-[linear-gradient(135deg,rgba(255,42,26,.055),rgba(10,9,8,.94)_52%,rgba(255,90,42,.035))] shadow-[0_24px_70px_rgba(255,42,26,.055),inset_0_1px_0_rgba(255,255,255,.03)] backdrop-blur-xl">

            <div className="border-b border-white/[0.06] p-5 md:p-6">

              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">

                <div>

                  <p className="text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]">
                    Servicio opcional
                  </p>

                  <h3 className="mt-2 text-lg font-semibold">
                    Quiero que Capital Pass lo diseñe
                  </h3>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
                    Podés solicitar el diseño gráfico de una o varias piezas. La solicitud queda asociada al evento para coordinarla comercialmente por separado.
                  </p>

                </div>

                <DesignServiceBadge
                  status={
                    event.design_service_status
                  }
                />

              </div>

            </div>

            <div className="p-5 md:p-6">

              <p className="text-sm font-medium">
                ¿Qué necesitás diseñar?
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

                <DesignServiceItem
                  label="Entrada personalizada"
                  selected={event.design_service_items.includes(
                    "ticket"
                  )}
                  onClick={() =>
                    toggleDesignServiceItem(
                      "ticket"
                    )
                  }
                />

                <DesignServiceItem
                  label="Banner horizontal"
                  selected={event.design_service_items.includes(
                    "banner_horizontal"
                  )}
                  onClick={() =>
                    toggleDesignServiceItem(
                      "banner_horizontal"
                    )
                  }
                />

                <DesignServiceItem
                  label="Portada cuadrada"
                  selected={event.design_service_items.includes(
                    "banner_square"
                  )}
                  onClick={() =>
                    toggleDesignServiceItem(
                      "banner_square"
                    )
                  }
                />

                <DesignServiceItem
                  label="Portada vertical"
                  selected={event.design_service_items.includes(
                    "banner_vertical"
                  )}
                  onClick={() =>
                    toggleDesignServiceItem(
                      "banner_vertical"
                    )
                  }
                />

              </div>

              <label className="mt-5 block">

                <span className="text-sm text-white/60">
                  Comentarios para el diseñador
                </span>

                <textarea
                  value={
                    event.design_service_notes ??
                    ""
                  }
                  onChange={(e) =>
                    setEvent({
                      ...event,
                      design_service_notes:
                        e.target.value,
                    })
                  }
                  rows={4}
                  maxLength={1000}
                  placeholder="Ej.: estética futurista, usar negro y dorado, incluir logos de sponsors..."
                  className="mt-2 w-full resize-none border border-white/[0.09] bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/15 focus:border-[#ff5a2a]/45"
                />

              </label>

              <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">

                <div>

                  {event.design_service_requested_at ? (

                    <p className="text-xs text-white/35">
                      Solicitud registrada:{" "}
                      {formatDateTime(
                        event.design_service_requested_at
                      )}
                    </p>

                  ) : (

                    <p className="text-xs text-white/30">
                      Este servicio es adicional al uso de la plataforma.
                    </p>

                  )}

                </div>

                <button
                  type="button"
                  onClick={
                    requestCapitalPassDesign
                  }
                  disabled={
                    requestingDesign
                  }
                  className="h-11 bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-5 text-[9px] font-black uppercase tracking-[0.13em] text-white shadow-[0_12px_35px_rgba(255,59,36,.15)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {requestingDesign
                    ? "Enviando..."
                    : event.design_service_status ===
                        "requested"
                      ? "Actualizar solicitud"
                      : "Solicitar diseño"}
                </button>

              </div>

            </div>

          </div>

        </Section>

        {/* ESTADO */}

        <Section
          title="Estado del evento"
          description="Controlá en qué etapa se encuentra el evento."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

            <StatusButton
              label="Borrador"
              selected={event.status === "draft"}
              onClick={() =>
                setEvent({
                  ...event,
                  status: "draft",
                })
              }
            />

            <StatusButton
              label="Próximo"
              selected={event.status === "upcoming"}
              onClick={() =>
                setEvent({
                  ...event,
                  status: "upcoming",
                })
              }
            />

            <StatusButton
              label="Activo"
              selected={event.status === "active"}
              onClick={() =>
                setEvent({
                  ...event,
                  status: "active",
                })
              }
            />

            <StatusButton
              label="Finalizado"
              selected={event.status === "finished"}
              onClick={() =>
                setEvent({
                  ...event,
                  status: "finished",
                })
              }
            />

            <StatusButton
              label="Cancelado"
              selected={event.status === "cancelled"}
              onClick={() =>
                setEvent({
                  ...event,
                  status: "cancelled",
                })
              }
            />

          </div>
        </Section>

        {/* RRPP */}

        <Section
          title="Ventas de RRPP"
          description="Decidí si tus RRPP pueden continuar vendiendo y hasta qué momento."
        >
          <div className="grid gap-5 lg:grid-cols-2">

            <ToggleCard
              title="Permitir ventas RRPP"
              description="Si lo desactivás, todos los RRPP dejan de poder registrar nuevas ventas inmediatamente."
              enabled={event.rrpp_sales_enabled}
              onChange={(enabled) =>
                setEvent({
                  ...event,
                  rrpp_sales_enabled: enabled,
                })
              }
            />

            <div className="border border-white/[0.08] bg-[#0a0908]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]">

              <label className="text-sm font-medium">
                Hora límite automática
              </label>

              <p className="mt-1 text-xs leading-5 text-white/30">
                Si queda vacío, las ventas se bloquean solamente cuando vos las desactives.
              </p>

              <input
                type="datetime-local"
                value={toDateTimeLocal(event.rrpp_sales_cutoff_at)}
                onChange={(e) =>
                  setEvent({
                    ...event,
                    rrpp_sales_cutoff_at: e.target.value || null,
                  })
                }
                className="mt-4 h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none focus:border-[#ff5a2a]/45"
              />

            </div>

          </div>
        </Section>

        {/* PUERTA */}

        <Section
          title="Venta en puerta"
          description="Configurá si se podrán generar nuevas entradas durante el evento."
        >
          <ToggleCard
            title="Habilitar venta en puerta"
            description="Los vendedores de puerta asignados podrán registrar compradores y generar entradas."
            enabled={event.door_sales_enabled}
            onChange={(enabled) =>
              setEvent({
                ...event,
                door_sales_enabled: enabled,
              })
            }
          />

          <div className="mt-5 grid gap-5 md:grid-cols-2">

            <DateField
              label="Comienza"
              value={event.door_sales_start_at}
              onChange={(value) =>
                setEvent({
                  ...event,
                  door_sales_start_at: value,
                })
              }
            />

            <DateField
              label="Finaliza"
              value={event.door_sales_end_at}
              onChange={(value) =>
                setEvent({
                  ...event,
                  door_sales_end_at: value,
                })
              }
            />

          </div>
        </Section>

        {/* TANDAS */}

        <Section
          title="Tandas y tipos de entrada"
          description="Administrá precio, cupo y disponibilidad. Las tandas que ya tengan ventas no pueden eliminarse."
        >
          {ticketTypes.length === 0 ? (

            <div className="border border-dashed border-white/[0.09] bg-white/[0.015] p-7 text-center text-sm text-white/30">
              Todavía no hay tandas creadas.
            </div>

          ) : (

            <div className="space-y-4">

              {ticketTypes.map((ticket) => {

                const sold =
                  soldForTicketType(
                    ticket.id
                  );

                const ticketHasSales =
                  hasSales(
                    ticket.id
                  );

                return (
                  <TicketEditor
                    key={ticket.id}
                    ticket={ticket}
                    sold={sold}
                    hasSales={ticketHasSales}
                    saving={
                      savingTicketId ===
                      ticket.id
                    }
                    deleting={
                      deletingTicketId ===
                      ticket.id
                    }
                    onChange={(updatedTicket) =>
                      setTicketTypes((current) =>
                        current.map((item) =>
                          item.id === updatedTicket.id
                            ? updatedTicket
                            : item
                        )
                      )
                    }
                    onSave={() =>
                      saveTicketType(
                        ticket
                      )
                    }
                    onDelete={() =>
                      deleteTicketType(
                        ticket
                      )
                    }
                  />
                );
              })}

            </div>

          )}
        </Section>

        {/* CREAR TANDA */}

        <Section
          title="Crear nueva tanda"
          description="Agregá otra etapa de venta con su propio nombre, precio y cupo."
        >
          <form
            onSubmit={
              createTicketType
            }
            className="grid gap-5 md:grid-cols-2"
          >

            <InputField
              label="Nombre"
              placeholder="Ej: Anticipada 2"
              value={newTicket.name}
              onChange={(value) =>
                setNewTicket({
                  ...newTicket,
                  name:
                    value,
                })
              }
            />

            <InputField
              label="Descripción"
              placeholder="Ej: Segunda tanda"
              value={newTicket.description}
              onChange={(value) =>
                setNewTicket({
                  ...newTicket,
                  description:
                    value,
                })
              }
            />

            <InputField
              label="Precio"
              placeholder="12000"
              type="number"
              value={newTicket.price}
              onChange={(value) =>
                setNewTicket({
                  ...newTicket,
                  price:
                    value,
                })
              }
            />

            <InputField
              label="Cupo"
              placeholder="200"
              type="number"
              value={newTicket.capacity}
              onChange={(value) =>
                setNewTicket({
                  ...newTicket,
                  capacity:
                    value,
                })
              }
            />

            <div>

              <label className="mb-2 block text-sm text-white/60">
                Estado inicial
              </label>

              <select
                value={newTicket.status}
                onChange={(e) =>
                  setNewTicket({
                    ...newTicket,
                    status:
                      e.target.value,
                  })
                }
                className="h-12 w-full border border-white/[0.09] bg-[#0a0908] px-4 text-sm text-white outline-none focus:border-[#ff5a2a]/45"
              >
                <option value="upcoming">Próximamente</option>
                <option value="available">Disponible</option>
                <option value="paused">Pausada</option>
                <option value="sold_out">Agotada</option>
              </select>

            </div>

            <div className="flex items-end">

              <button
                type="submit"
                disabled={
                  creatingTicket
                }
                className="h-12 w-full bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingTicket
                  ? "Creando..."
                  : "+ Crear tanda"}
              </button>

            </div>

          </form>
        </Section>

      </div>
    </main>
  );
}

// =========================================================
// COMPONENTES
// =========================================================

function AssetUploadCard({
  title,
  description,
  recommendedSize,
  previewRatio,
  imageUrl,
  loading,
  onUpload,
  onRemove,
}: {
  title: string;
  description: string;
  recommendedSize: string;
  previewRatio: string;
  imageUrl: string | null;
  loading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId =
    `asset-${title
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )}`;

  return (
    <div className="overflow-hidden border border-white/[0.085] bg-[#0a0908]/92 shadow-[0_18px_50px_rgba(0,0,0,.18),inset_0_1px_0_rgba(255,255,255,.025)] backdrop-blur-xl">

      <div
        className={`relative w-full overflow-hidden bg-black/30 ${previewRatio}`}
      >

        {imageUrl ? (

          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover"
          />

        ) : (

          <div className="flex h-full min-h-[160px] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,42,.10),transparent_35%),linear-gradient(145deg,#100806,#070605)] p-6 text-center">

            <div>

              <div className="mx-auto flex h-12 w-12 items-center justify-center border border-white/[0.09] bg-white/[0.025] text-xl text-white/35">
                ◫
              </div>

              <p className="mt-3 text-xs text-white/25">
                Sin imagen
              </p>

            </div>

          </div>

        )}

        {loading && (

          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">

            <div className="text-center">

              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#ff5a2a]" />

              <p className="mt-3 text-xs text-white/60">
                Subiendo...
              </p>

            </div>

          </div>

        )}

      </div>

      <div className="p-4">

        <div className="flex items-start justify-between gap-3">

          <div>

            <p className="text-sm font-semibold">
              {title}
            </p>

            <p className="mt-1 text-xs leading-5 text-white/30">
              {description}
            </p>

          </div>

          <span className="shrink-0 border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white/30">
            {recommendedSize}
          </span>

        </div>

        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file =
              e.target.files?.[0];

            if (file) {
              onUpload(file);
            }

            e.currentTarget.value =
              "";
          }}
        />

        <div className="mt-4 flex gap-2">

          <label
            htmlFor={inputId}
            className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.055] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-[#ffad97] transition hover:border-[#ff5a2a]/45 hover:bg-[#ff3b24]/[0.10] hover:text-white"
          >
            {imageUrl
              ? "Reemplazar imagen"
              : "Subir imagen"}
          </label>

          {imageUrl && (

            <button
              type="button"
              onClick={onRemove}
              disabled={loading}
              className="h-10 border border-red-400/15 bg-red-400/[0.05] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-red-300 transition hover:bg-red-400/[0.1] disabled:opacity-40"
            >
              Quitar
            </button>

          )}

        </div>

        <p className="mt-3 text-[10px] text-white/20">
          JPG, PNG o WEBP · máximo 15 MB
        </p>

      </div>

    </div>
  );
}

function DesignModeCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border p-5 text-left transition ${
        selected
          ? "border-[#ff5a2a]/35 bg-gradient-to-br from-[#ff2a1a]/[0.12] to-[#ff5a2a]/[0.055] shadow-[0_12px_40px_rgba(255,42,26,.08),inset_0_1px_0_rgba(255,255,255,.04)]"
          : "border-white/[0.08] bg-white/[0.018] hover:border-[#ff5a2a]/20 hover:bg-[#ff3b24]/[0.035]"
      }`}
    >

      <div className="flex items-start justify-between gap-4">

        <div>

          <p className={`text-sm font-semibold ${
            selected
              ? "text-[#fff2ea]"
              : "text-white/70"
          }`}>
            {title}
          </p>

          <p className="mt-2 text-xs leading-5 text-white/30">
            {description}
          </p>

        </div>

        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-[#ff8b70] bg-[#ff3b24] text-[10px] text-white"
            : "border-white/15"
        }`}>
          {selected
            ? "✓"
            : ""}
        </span>

      </div>

    </button>
  );
}

function TicketPreview({
  imageUrl,
  eventName,
}: {
  imageUrl: string | null;
  eventName: string;
}) {
  return (
    <div className="border border-white/[0.08] bg-[#080706]/80 p-5">

      <div className="flex items-center justify-between gap-4">

        <div>

          <p className="text-sm font-semibold">
            Vista previa
          </p>

          <p className="mt-1 text-xs text-white/30">
            Ejemplo con datos ficticios.
          </p>

        </div>

        <span className="border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#ff9b82]">
          Preview
        </span>

      </div>

      <div className="mx-auto mt-5 max-w-[330px]">

        <div className="relative aspect-[9/16] overflow-hidden border border-white/[0.1] bg-gradient-to-br from-[#160805] via-[#0b0908] to-black shadow-[0_25px_80px_rgba(0,0,0,.35)]">

          {imageUrl ? (

            <img
              src={imageUrl}
              alt="Preview de entrada"
              className="absolute inset-0 h-full w-full object-cover"
            />

          ) : (

            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">

              <div>

                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#ff7958]/70">
                  Capital Pass
                </p>

                <p className="mt-3 text-2xl font-black uppercase">
                  {eventName}
                </p>

                <p className="mt-3 text-xs text-white/30">
                  Subí el diseño para verlo aplicado acá.
                </p>

              </div>

            </div>

          )}

          <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/78 p-4 backdrop-blur-md">

            <div className="grid grid-cols-[1fr_92px] gap-4">

              <div>

                <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">
                  Comprador
                </p>

                <p className="mt-1 text-sm font-bold">
                  JUAN PÉREZ
                </p>

                <p className="mt-2 text-[10px] text-white/45">
                  DNI 41.234.567
                </p>

                <p className="mt-1 text-[10px] font-semibold text-[#ff9b82]">
                  ANTICIPADA
                </p>

                <p className="mt-3 font-mono text-[9px] text-white/45">
                  0000021-TEST
                </p>

              </div>

              <FakeQr />

            </div>

          </div>

        </div>

      </div>

      <p className="mt-4 text-center text-[10px] leading-5 text-white/25">
        La zona inferior se reserva automáticamente para que los datos siempre sean legibles y no tapen partes importantes del diseño.
      </p>

    </div>
  );
}

function FakeQr() {
  const pattern = [
    1, 1, 1, 0, 1, 0, 1,
    1, 0, 1, 1, 0, 1, 0,
    1, 1, 1, 0, 1, 1, 1,
    0, 1, 0, 1, 0, 1, 0,
    1, 0, 1, 1, 1, 0, 1,
    0, 1, 1, 0, 1, 1, 0,
    1, 0, 1, 1, 0, 1, 1,
  ];

  return (
    <div className="grid aspect-square grid-cols-7 gap-[2px] rounded-lg bg-white p-2">

      {pattern.map(
        (
          cell,
          index
        ) => (
          <span
            key={index}
            className={
              cell
                ? "bg-black"
                : "bg-white"
            }
          />
        )
      )}

    </div>
  );
}

function DesignServiceItem({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 border px-4 py-3 text-left text-xs transition ${
        selected
          ? "border-[#ff5a2a]/30 bg-[#ff3b24]/[0.07] text-[#fff2ea]"
          : "border-white/[0.07] bg-white/[0.02] text-white/45 hover:bg-white/[0.04]"
      }`}
    >

      <span>
        {label}
      </span>

      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
        selected
          ? "border-[#ff8b70] bg-[#ff3b24] text-[10px] text-white"
          : "border-white/15"
      }`}>
        {selected
          ? "✓"
          : ""}
      </span>

    </button>
  );
}

function DesignServiceBadge({
  status,
}: {
  status:
    EventData["design_service_status"];
}) {
  const config = {
    none: {
      label:
        "Sin solicitud",
      className:
        "border-white/[0.07] bg-white/[0.03] text-white/30",
    },

    requested: {
      label:
        "Solicitado",
      className:
        "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
    },

    in_progress: {
      label:
        "En diseño",
      className:
        "border-[#ff5a2a]/20 bg-[#ff3b24]/[0.07] text-[#ff9b82]",
    },

    ready: {
      label:
        "Listo",
      className:
        "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200",
    },
  }[status];

  return (
    <span className={`inline-flex shrink-0 border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${config.className}`}>
      {config.label}
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative mb-7 overflow-hidden border border-white/[0.09] bg-[#090807]/92 p-5 shadow-[0_28px_90px_rgba(0,0,0,.20),inset_0_1px_0_rgba(255,255,255,.025)] backdrop-blur-2xl md:p-7">

      <div className="pointer-events-none absolute inset-0">

        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.025] to-transparent" />

        <div className="absolute right-[-90px] top-[-120px] h-72 w-72 rounded-full bg-[#ff2a1a]/[0.08] blur-[90px]" />

        <div className="absolute bottom-[-140px] left-[-80px] h-72 w-72 rounded-full bg-[#ff5a2a]/[0.045] blur-[110px]" />

        <div className="absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-[#ff7958]/35 to-transparent" />

      </div>

      <div className="relative z-10">

        <div className="mb-6">

          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
            Capital Pass
          </p>

          <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.035em] text-white">
            {title}
          </h2>

          <p className="mt-1 max-w-4xl text-sm leading-6 text-white/35">
            {description}
          </p>

        </div>

        {children}

      </div>

    </section>
  );
}

function StatusButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-4 py-4 text-[10px] font-black uppercase tracking-[0.10em] transition ${
        selected
          ? "border-[#ff5a2a]/35 bg-[#ff3b24]/[0.08] text-[#fff2ea] shadow-[0_0_25px_rgba(255,59,36,.07)]"
          : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ToggleCard({
  title,
  description,
  enabled,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border border-white/[0.08] bg-[#0a0908]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]">

      <div>

        <p className="text-sm font-medium">
          {title}
        </p>

        <p className="mt-1 max-w-xl text-xs leading-5 text-white/30">
          {description}
        </p>

      </div>

      <button
        type="button"
        onClick={() =>
          onChange(
            !enabled
          )
        }
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          enabled
            ? "bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a]"
            : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
            enabled
              ? "left-6"
              : "left-1"
          }`}
        />
      </button>

    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm text-white/60">
        {label}
      </label>

      <input
        type="datetime-local"
        value={
          toDateTimeLocal(
            value
          )
        }
        onChange={(e) =>
          onChange(
            e.target.value ||
            null
          )
        }
        className="h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none focus:border-[#ff5a2a]/45"
      />

    </div>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm text-white/60">
        {label}
      </label>

      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/15 focus:border-[#ff5a2a]/45"
      />

    </div>
  );
}

function TicketEditor({
  ticket,
  sold,
  hasSales,
  saving,
  deleting,
  onChange,
  onSave,
  onDelete,
}: {
  ticket: TicketType;
  sold: number;
  hasSales: boolean;
  saving: boolean;
  deleting: boolean;
  onChange: (ticket: TicketType) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const remaining =
    Math.max(
      0,
      Number(
        ticket.capacity
      ) -
        sold
    );

  return (
    <div className="border border-white/[0.08] bg-[#0a0908]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]">

      <div className="mb-5 flex flex-col justify-between gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center">

        <div>

          <p className="text-sm font-medium">
            {ticket.name}
          </p>

          <p className="mt-1 text-xs text-white/30">
            {sold} vendidas · {remaining} restantes · Cupo actual{" "}
            {ticket.capacity}
          </p>

        </div>

        <div className="flex items-center gap-2">

          {hasSales ? (

            <span className="border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.10em] text-white/28">
              No se puede eliminar
            </span>

          ) : (

            <span className="border border-green-400/15 bg-green-400/[0.05] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.10em] text-green-300">
              Sin ventas
            </span>

          )}

          <span
            className={`border border-white/[0.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.10em] ${
              ticket.active
                ? "bg-[#ff3b24]/[0.07] text-[#ff9b82]"
                : "bg-white/[0.05] text-white/30"
            }`}
          >
            {ticket.active
              ? "Activa"
              : "Desactivada"}
          </span>

        </div>

      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.75fr_0.65fr_0.9fr]">

        <div>

          <label className="mb-2 block text-xs text-white/30">
            Nombre
          </label>

          <input
            value={
              ticket.name
            }
            onChange={(e) =>
              onChange({
                ...ticket,
                name:
                  e.target.value,
              })
            }
            className="h-11 w-full border border-white/[0.08] bg-black/25 px-3 text-sm outline-none focus:border-[#ff5a2a]/45"
          />

        </div>

        <div>

          <label className="mb-2 block text-xs text-white/30">
            Precio
          </label>

          <input
            type="number"
            min="0"
            value={
              ticket.price_minor
            }
            onChange={(e) =>
              onChange({
                ...ticket,
                price_minor:
                  Number(
                    e.target.value
                  ),
              })
            }
            className="h-11 w-full border border-white/[0.08] bg-black/25 px-3 text-sm outline-none focus:border-[#ff5a2a]/45"
          />

        </div>

        <div>

          <label className="mb-2 block text-xs text-white/30">
            Cupo
          </label>

          <input
            type="number"
            min={
              Math.max(
                1,
                sold
              )
            }
            value={
              ticket.capacity
            }
            onChange={(e) =>
              onChange({
                ...ticket,
                capacity:
                  Number(
                    e.target.value
                  ),
              })
            }
            className={`h-11 w-full rounded-xl border bg-black/20 px-3 text-sm outline-none ${
              Number(
                ticket.capacity
              ) < sold
                ? "border-red-400/50"
                : "border-white/[0.07] focus:border-[#ff5a2a]/45"
            }`}
          />

          {Number(
            ticket.capacity
          ) < sold && (

            <p className="mt-2 text-[11px] text-red-300">
              Mínimo permitido: {sold}
            </p>

          )}

        </div>

        <div>

          <label className="mb-2 block text-xs text-white/30">
            Estado
          </label>

          <select
            value={
              ticket.status
            }
            onChange={(e) =>
              onChange({
                ...ticket,
                status:
                  e.target.value,
              })
            }
            className="h-11 w-full border border-white/[0.08] bg-[#0a0908] px-3 text-sm outline-none focus:border-[#ff5a2a]/45"
          >
            <option value="upcoming">Próximamente</option>
            <option value="available">Disponible</option>
            <option value="sold_out">Agotada</option>
            <option value="paused">Pausada</option>
          </select>

        </div>

      </div>

      <div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">

        <button
          type="button"
          onClick={() =>
            onChange({
              ...ticket,
              active:
                !ticket.active,
            })
          }
          className="border border-white/[0.09] bg-white/[0.02] px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:border-[#ff5a2a]/20 hover:text-white"
        >
          {ticket.active
            ? "Desactivar"
            : "Activar"}
        </button>

        <button
          type="button"
          onClick={
            onDelete
          }
          disabled={
            hasSales ||
            deleting
          }
          title={
            hasSales
              ? "Esta tanda ya tiene ventas y no puede eliminarse."
              : "Eliminar tanda"
          }
          className="border border-red-400/15 bg-red-400/[0.05] px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-red-300 transition hover:bg-red-400/[0.1] disabled:cursor-not-allowed disabled:opacity-25"
        >
          {deleting
            ? "Eliminando..."
            : "Eliminar"}
        </button>

        <button
          type="button"
          onClick={
            onSave
          }
          disabled={
            saving ||
            Number(
              ticket.capacity
            ) < sold
          }
          className="bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.11em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving
            ? "Guardando..."
            : "Guardar tanda"}
        </button>

      </div>

    </div>
  );
}

// =========================================================
// FECHAS
// =========================================================

function formatDateTime(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}