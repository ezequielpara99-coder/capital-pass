import QRCode from "qrcode";
import { notFound } from "next/navigation";

import { createAdminClient } from "../../../lib/supabase/admin";
import { createMemberQRPayload, verifyMemberSignature } from "../../../lib/members/signature";
import { MEMBER_QR_OPTIONS } from "../../../lib/members/qr-image";

type PageProps = {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
};

const STATUS_LABEL: Record<string, string> = { active: "Activo", expired: "Vencido", cancelled: "Cancelado" };

function formatDate(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

export default async function SocioPage({ params, searchParams }: PageProps) {
  const { memberId } = await params;
  const { s } = await searchParams;
  const signature = Array.isArray(s) ? s[0] : s;

  if (!signature || !verifyMemberSignature(memberId, signature)) notFound();

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("premium_members")
    .select("id, organization_id, first_name, last_name, member_code, status, expires_at, balance_minor")
    .eq("id", memberId)
    .maybeSingle();

  if (!member) notFound();

  const { data: organization } = await admin.from("organizations").select("name").eq("id", member.organization_id).maybeSingle();

  const qrDataUrl = await QRCode.toDataURL(createMemberQRPayload(member.id), MEMBER_QR_OPTIONS);
  const isActive = member.status === "active";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-5 py-10 text-[#f7f3ed]">
      <div className="w-full max-w-[380px]">
        <div className={`overflow-hidden rounded-[28px] border ${isActive ? "border-violet-400/30" : "border-white/10"} bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl`}>
          <div className={`px-6 py-5 text-center ${isActive ? "bg-violet-500/10" : "bg-white/[0.03]"}`}>
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-violet-300">{organization?.name ?? "Capital Pass"}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Socio premium</p>
          </div>

          <div className="px-6 py-6 text-center">
            <h1 className="text-2xl font-black">{member.first_name} {member.last_name}</h1>
            <p className="mt-1 font-mono text-sm tracking-[0.15em] text-white/50">{member.member_code}</p>

            <div className={`mt-2 inline-flex border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
              isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"
            }`}>
              {STATUS_LABEL[member.status] ?? member.status}
            </div>

            <div className="mx-auto mt-4 w-fit border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2">
              <p className="text-[9px] font-black uppercase tracking-wide text-emerald-300/70">Saldo</p>
              <p className="text-lg font-black text-emerald-300">{formatMoney(Number(member.balance_minor))}</p>
            </div>

            <div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Código QR del socio" className="h-52 w-52" />
            </div>

            <p className="mt-4 text-xs text-white/35">Vence: {formatDate(member.expires_at)}</p>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/25">Presentá este QR en la puerta para que te reconozcan como socio.</p>
        <p className="mt-3 text-center">
          <a href="/mi" className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 underline underline-offset-4 hover:text-white/60">
            Ver mi portal →
          </a>
        </p>
      </div>
    </main>
  );
}
