import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function SuscribirsePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/cuenta?retorno=mercadopago" : "/registro");
}
