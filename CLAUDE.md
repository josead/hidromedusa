# Hidromedusa web — reglas del proyecto

SPA en `public/index.html` (sin build). Deploy: push a `main` (GitHub Pages); backend: `bash deploy/aws/deploy-api.sh`.

## SEO / link preview: obligatorio en CADA cambio
Cada cambio de contenido o estructura tiene que dejar el SEO al 100%. Antes de commitear, revisar:

1. **Head**: `<title>` (con keyword + fecha vigente), `meta description` (≤160 car., fecha/lugar/precio), `canonical`, `robots`.
2. **Open Graph + Twitter**: `og:title`, `og:description`, `og:image` (1200×630, **JPG/PNG < 300 KB**, URL absoluta), `og:image:alt`, `twitter:card=summary_large_image`. Sin imagen, WhatsApp/IG muestran solo el dominio.
3. **Cache de previews**: WhatsApp/Facebook cachean días. Si cambia la imagen o el texto, **usar un nombre de archivo nuevo** (ej. `og-<evento>.jpg`) y avisar que se re-scrapee en https://developers.facebook.com/tools/debug/.
4. **JSON-LD** (`MusicGroup` + `MusicEvent` con fecha ISO -03:00, lugar, performers, `offers` con precio/ARS): actualizarlo siempre que cambie la fecha, lugar, line-up o precio. Al pasar la fecha, quitar/actualizar el evento.
5. **Contenido indexable**: fecha, lugar, line-up y precio como texto real en el HTML (no solo en imagen/WebGL/JS); un solo `<h1>`; imágenes con `alt` descriptivo y `width`/`height`.
6. **robots.txt / sitemap.xml**: mantenerlos (`lastmod` al día); `/staff-admin-secreto/` va en Disallow.
7. **Performance** (Core Web Vitals): imágenes comprimidas, sin bloqueos nuevos en el head.

## Cambiar la fecha/evento
Hardcodeado en: `public/index.html` (hero, stub, fechas, modales, `HM_EVENT`, `TICKET`, JSON-LD, metas), `lambdas/tickets/index.js`, `lambdas/lib/email.js`, `lambdas/calendar/index.js`, `docs/CONTRACT.md`. Los bloques se prenden/apagan con `data-until`/`data-after="YYYY-MM-DD"`. Después: commit + push a main + `deploy-api.sh`.

## Métricas
Umami Cloud (sin cookies) en el `<head>` de `public/index.html` (`data-website-id`). Eventos propios con `track(nombre, datos)`: `comprar-abrir`, `comprar-captura` (canal), `copiar-alias`, `eleccion` (opcion), `contratar-enviar` (canal). Al agregar un CTA nuevo, trackearlo.
