import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "../lib/mercadopago/server";

// Deja indexar la landing y las paginas publicas de evento; todo lo demas
// (paneles de organizador/RRPP/puerta/control/bartender, admin, cuenta y
// las rutas de API) es privado y no tiene sentido que aparezca en buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/e/"],
      disallow: [
        "/api/",
        "/admin",
        "/panel",
        "/cuenta",
        "/control",
        "/puerta",
        "/bartender",
        "/rrpp",
        "/rrpp/",
        "/login",
        "/registro",
        "/recuperar-contrasena",
        "/recuperar-confirmar",
        "/crear-contrasena",
        "/suscribirse",
        "/entrada/",
        "/logout",
      ],
    },
    sitemap: `${getAppBaseUrl()}/sitemap.xml`,
  };
}
