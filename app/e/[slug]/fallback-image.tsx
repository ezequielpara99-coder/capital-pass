"use client";

// Si el banner del evento fue borrado o quedo inaccesible en storage, esto
// oculta la imagen rota en vez de mostrar el icono quebrado del navegador
// encima del layout -- la pagina publica de un evento se comparte
// activamente por WhatsApp/redes, asi que es el peor lugar para un error
// visual asi.
export default function FallbackImage(
  props: React.ImgHTMLAttributes<HTMLImageElement>
) {
  return (
    <img
      {...props}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
