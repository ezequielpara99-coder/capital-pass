"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Complaint = {
  id: string; subject: string; message: string; status: string;
  admin_response: string | null; created_at: string; resolved_at: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return createClient().storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default function PerfilClient({
  firstName, lastName, phone, avatarPath, email,
  organizationName, subscriptionActive, periodEnd, mpStatus,
}: {
  firstName: string; lastName: string; phone: string; avatarPath: string | null; email: string;
  organizationName: string; subscriptionActive: boolean; periodEnd: string | null; mpStatus: string | null;
}) {
  const [avatar, setAvatar] = useState(avatarPath);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [phoneValue, setPhoneValue] = useState(phone);
  const [savingProfile, setSavingProfile] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendingComplaint, setSendingComplaint] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [pushSupported, setPushSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [barSaleAlerts, setBarSaleAlerts] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState<string>("");
  const [savingNotifications, setSavingNotifications] = useState(false);

  async function loadNotificationSettings() {
    try {
      const response = await fetch("/api/push/settings", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) {
        setBarSaleAlerts(result.settings.barSaleAlerts);
        setLowStockAlerts(result.settings.lowStockAlerts);
        setSummaryInterval(result.settings.summaryIntervalMinutes ? String(result.settings.summaryIntervalMinutes) : "");
      }
    } catch {
      // no bloquea el resto del perfil
    }

    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(Boolean(existing));
      } catch {
        // no bloquea el resto del perfil
      }
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    // La clave VAPID a veces llega con espacios/saltos de linea invisibles
    // si se pego mal en algun lado (terminal, panel de Vercel) -- eso hace
    // que atob() explote con "characters outside of the Latin1 range".
    // Sacamos todo lo que no sea un caracter valido de base64url primero.
    const cleaned = base64String.trim().replace(/[^A-Za-z0-9_-]/g, "");
    const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
    const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
    let rawData: string;
    try {
      rawData = window.atob(base64);
    } catch {
      throw new Error("La clave de notificaciones está mal configurada. Avisale a soporte.");
    }
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function enableNotifications() {
    setSubscribing(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Necesitamos tu permiso para poder avisarte.");

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Notificaciones no configuradas todavía.");

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setSubscribed(true);
      notify("Notificaciones activadas en este dispositivo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron activar las notificaciones.");
    } finally {
      setSubscribing(false);
    }
  }

  async function saveNotificationSettings() {
    setSavingNotifications(true);
    setError("");
    try {
      const response = await fetch("/api/push/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barSaleAlerts, lowStockAlerts,
          summaryIntervalMinutes: summaryInterval ? Number(summaryInterval) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notify("Preferencias guardadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las preferencias.");
    } finally {
      setSavingNotifications(false);
    }
  }

  async function loadComplaints() {
    setLoadingComplaints(true);
    try {
      const response = await fetch("/api/complaints", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setComplaints(result.complaints ?? []);
      else setError(result.error ?? "No se pudieron cargar los reclamos.");
    } catch {
      setError("No se pudieron cargar los reclamos.");
    } finally {
      setLoadingComplaints(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadComplaints();
    loadNotificationSettings();
  }, []);

  function notify(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/perfil/avatar", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAvatar(result.avatarPath);
      notify("Foto actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay una sesión válida.");
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ first_name: first.trim(), last_name: last.trim(), phone: phoneValue.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) throw new Error("No se pudo guardar el perfil.");
      notify("Perfil guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function sendComplaint() {
    if (!subject.trim() || !message.trim()) return;
    setSendingComplaint(true);
    setError("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSubject("");
      setMessage("");
      notify("Reclamo enviado.");
      loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el reclamo.");
    } finally {
      setSendingComplaint(false);
    }
  }

  const url = avatarUrl(avatar);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-200px] top-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/[0.14] blur-[130px]" />
        <div className="absolute bottom-[-200px] right-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/[0.10] blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-5 py-8 md:px-8">
        <Link href="/panel" className="text-xs text-white/40 hover:text-white">← Panel</Link>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
        <h1 className="mt-1 text-3xl font-black uppercase tracking-[-0.03em]">Mi perfil</h1>

        {notice && <div className="mt-5 rounded-xl border border-[#ff5a2a]/25 bg-[#ff3b24]/10 px-4 py-3 text-sm text-[#ffb199]">{notice}</div>}
        {error && <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/40">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-white/20">{first[0] ?? "?"}</span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAvatar(file); e.target.value = ""; }}
              />
              <button
                type="button" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}
                className="h-10 rounded-lg border border-white/15 px-4 text-xs font-bold uppercase text-white/60 disabled:opacity-40"
              >
                {uploadingAvatar ? "Subiendo..." : "📷 Cambiar foto"}
              </button>
              <p className="mt-2 text-xs text-white/30">{email}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="block text-xs text-white/40">
              Nombre
              <input value={first} onChange={(e) => setFirst(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm" />
            </label>
            <label className="block text-xs text-white/40">
              Apellido
              <input value={last} onChange={(e) => setLast(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm" />
            </label>
          </div>
          <label className="mt-3 block text-xs text-white/40">
            Teléfono
            <input value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm" />
          </label>
          <button
            type="button" disabled={savingProfile || !first.trim() || !last.trim()} onClick={saveProfile}
            className="mt-4 h-11 rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 text-sm font-black text-white disabled:opacity-40"
          >
            {savingProfile ? "Guardando..." : "Guardar perfil"}
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-lg font-bold">Suscripción</h2>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-bold">{organizationName}</p>
              <p className="mt-1 text-xs text-white/40">
                {subscriptionActive ? `Activa · vence ${formatDate(periodEnd)}` : mpStatus ? `Estado: ${mpStatus}` : "Sin suscripción activa"}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${subscriptionActive ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
              {subscriptionActive ? "Activa" : "Inactiva"}
            </span>
          </div>
          <Link href="/cuenta" className="mt-4 inline-block text-xs font-bold text-[#ff9a7c] hover:underline">
            Gestionar suscripción y pagos →
          </Link>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-lg font-bold">Notificaciones</h2>
          <p className="mt-1 text-xs text-white/40">Avisos en tiempo real de ventas de barra/mesa, stock bajo, y un resumen periódico.</p>

          {!pushSupported ? (
            <p className="mt-4 text-sm text-white/35">Este navegador no soporta notificaciones push.</p>
          ) : !subscribed ? (
            <button
              type="button" disabled={subscribing} onClick={enableNotifications}
              className="mt-4 h-11 rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 text-sm font-black text-white disabled:opacity-40"
            >
              {subscribing ? "Activando..." : "🔔 Activar notificaciones en este dispositivo"}
            </button>
          ) : (
            <>
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Activadas en este dispositivo
              </p>

              <div className="mt-4 space-y-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Venta de barra / mesa</span>
                  <input type="checkbox" checked={barSaleAlerts} onChange={(e) => setBarSaleAlerts(e.target.checked)} className="h-5 w-5" />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Alertas de stock bajo</span>
                  <input type="checkbox" checked={lowStockAlerts} onChange={(e) => setLowStockAlerts(e.target.checked)} className="h-5 w-5" />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Resumen periódico</span>
                  <select
                    value={summaryInterval} onChange={(e) => setSummaryInterval(e.target.value)}
                    className="h-9 rounded-lg border border-white/15 bg-black px-2 text-xs"
                  >
                    <option value="" className="bg-black">Desactivado</option>
                    <option value="15" className="bg-black">Cada 15 min</option>
                    <option value="30" className="bg-black">Cada 30 min</option>
                    <option value="60" className="bg-black">Cada 60 min</option>
                  </select>
                </label>
              </div>

              <button
                type="button" disabled={savingNotifications} onClick={saveNotificationSettings}
                className="mt-4 h-10 rounded-xl border border-white/15 px-5 text-xs font-bold text-white/70 disabled:opacity-40"
              >
                {savingNotifications ? "Guardando..." : "Guardar preferencias"}
              </button>
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-lg font-bold">Reclamos</h2>
          <p className="mt-1 text-xs text-white/40">¿Algo no funcionó como esperabas? Contanos y te respondemos.</p>

          <div className="mt-4 space-y-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" className="h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm" />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contanos qué pasó" rows={3} className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm" />
            <button
              type="button" disabled={sendingComplaint || !subject.trim() || !message.trim()} onClick={sendComplaint}
              className="h-11 rounded-xl border border-white/15 px-6 text-sm font-bold text-white/70 disabled:opacity-40"
            >
              {sendingComplaint ? "Enviando..." : "Enviar reclamo"}
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {loadingComplaints && <p className="text-sm text-white/30">Cargando...</p>}
            {!loadingComplaints && complaints.length === 0 && <p className="text-sm text-white/30">Todavía no enviaste ningún reclamo.</p>}
            {complaints.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{c.subject}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.status === "resuelto" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/50">{c.message}</p>
                <p className="mt-1 text-[10px] text-white/25">{formatDate(c.created_at)}</p>
                {c.admin_response && (
                  <div className="mt-2 rounded-lg border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-3 text-sm text-white/70">
                    <p className="text-[10px] font-bold uppercase text-[#ff9a7c]">Respuesta de Capital Pass</p>
                    <p className="mt-1">{c.admin_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
