// Compartido por /r/[code] (reservas) y /w/[code] (wellness).
//
// El problema que resuelve: la app es una SPA — un solo index.html titulado
// "HOG APP". El robot de Instagram/Facebook NO ejecuta JavaScript: lee las
// metaetiquetas del HTML crudo, y por eso una pauta apuntada a ?reservar=OC
// salía con "HOG APP" de copy en lugar de algo que invite a reservar.
//
// Estas funciones responden un HTML mínimo con Open Graph del VENUE — título,
// descripción e imagen CONFIGURABLES desde HOG APP (Reservas → Compartir,
// columnas og_* de business_units vía fn_og_meta) — y redirigen al instante a
// la SPA real. El robot se queda con las metas; el humano ni nota el brinco.

/** Metadatos del venue vía RPC fn_og_meta (anon — devuelve SOLO los campos del preview) */
export async function venueMeta(code) {
  try {
    const base = process.env.VITE_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY
    if (!base || !key) return null
    const r = await fetch(`${base}/rest/v1/rpc/fn_og_meta`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    })
    const data = await r.json()
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/**
 * @param res respuesta de Vercel
 * @param o { title, description, image, dest, host } — dest es la ruta real de la SPA
 */
export function ogRedirect(res, { title, description, image, dest, host }) {
  const t = esc(title), d = esc(description), u = esc(dest)
  const img = esc(image || `https://${host}/icon-512.png`)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // El robot de Meta re-scrapea seguido: cache corto para poder corregir copy
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
  res.status(200).send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${t}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="https://${host}${u}">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${u}">
<link rel="canonical" href="https://${host}${u}">
</head>
<body>
<script>location.replace(${JSON.stringify(dest)})</script>
<p>Redirigiendo… <a href="${u}">continuar</a></p>
</body>
</html>`)
}
