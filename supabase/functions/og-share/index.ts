// og-share — Plan B del preview de pautas, como edge function de Supabase.
//
// Mismo trabajo que api/r.js y api/w.js de Vercel: servir el Open Graph del
// venue (título/descripción/imagen configurados en Reservas → Compartir) y
// redirigir a la SPA. Existe por si las funciones /api de Vercel no registran
// en el proyecto — vercel.json puede reescribir /r/:code y /w/:code hacia
// esta URL (rewrite externo: Vercel PROXEA, el dominio visible no cambia).
//
//   /functions/v1/og-share?kind=r&code=OC   → reservas
//   /functions/v1/og-share?kind=w&code=PC   → wellness
//
// Necesita el secret PORTAL_BASE_URL (https://tu-dominio) para armar la
// redirección y las URLs absolutas del OG.
// Verify JWT: DESACTIVADO — la consume el robot de Meta, anónimo.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') === 'w' ? 'w' : 'r'
  const code = (url.searchParams.get('code') ?? '').slice(0, 12)
  // Vercel proxea este contenido: el dominio REAL del portal viene en
  // x-forwarded-host — cero secrets que configurar. PORTAL_BASE_URL queda
  // como override opcional (p. ej. si algún día el proxy cambia).
  const fwd = (req.headers.get('x-forwarded-host') ?? '').split(',')[0].trim()
  const base = fwd ? `https://${fwd}` : (Deno.env.get('PORTAL_BASE_URL') ?? '').replace(/\/$/, '')

  // service role solo para LEER los 4 campos del preview — nada más sale de aquí
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let { data: bu } = await db.from('business_units')
    .select('id, name, og_title, og_description, og_image_url')
    .ilike('code', code).limit(1).maybeSingle()
  if (!bu) {
    // Sin og_share.sql las columnas no existen y el select truena: cae al
    // puro nombre — el preview sale genérico pero con el venue correcto
    const { data: solo } = await db.from('business_units')
      .select('id, name').ilike('code', code).limit(1).maybeSingle()
    if (solo) bu = { id: solo.id, name: solo.name, og_title: null, og_description: null, og_image_url: null }
  }

  const dest = kind === 'r' ? `/?reservar=${encodeURIComponent(code)}` : `/?wellness=${encodeURIComponent(code)}`

  // HUMANOS → 302 de servidor directo al landing: cero dependencia de que el
  // navegador ejecute meta-refresh o JS (Safari se quedaba parado en
  // "Redirigiendo…"). El HTML con metas queda SOLO para los robots de preview,
  // que es quien lo necesita. no-store en ambas ramas: una respuesta cacheada
  // en el edge no distingue user-agent y serviría la rama equivocada.
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase()
  const esBot = /facebookexternalhit|facebot|twitterbot|whatsapp|linkedinbot|telegrambot|slackbot|discordbot|pinterest|bot|crawler|spider|preview/.test(ua)
  if (!esBot) {
    // GEO gratis: Vercel calcula país/región/ciudad del visitante y los manda
    // en headers al proxear. Se registra la vista AQUÍ (con geo) y el redirect
    // lleva &t=r para que el tracker del navegador no la cuente OTRA vez.
    if (kind === 'r' && bu?.id) {
      const g = (h: string) => {
        const v = req.headers.get(h)
        try { return v ? decodeURIComponent(v).slice(0, 80) : null } catch { return v?.slice(0, 80) ?? null }
      }
      // fire-and-forget con timeout corto: el redirect no espera a la métrica
      await Promise.race([
        db.from('landing_views').insert({
          bu_id: bu.id, code: code.toUpperCase(), via: 'link',
          device: /mobile|iphone|android/.test(ua) ? 'mobile' : 'desktop',
          referrer: req.headers.get('referer')?.slice(0, 300) ?? null,
          country: g('x-vercel-ip-country'),
          region: g('x-vercel-ip-country-region'),
          city: g('x-vercel-ip-city'),
        }),
        new Promise(r => setTimeout(r, 800)),
      ]).catch(() => {})
    }
    const sep = dest.includes('?') ? '&' : '?'
    return new Response(null, {
      status: 302,
      headers: { Location: base + dest + (kind === 'r' ? sep + 't=r' : ''), 'Cache-Control': 'no-store' },
    })
  }
  const name = bu?.name ?? (kind === 'r' ? 'nuestra casa' : 'nuestro estudio')
  const title = kind === 'r'
    ? (bu?.og_title || `Reserva tu mesa en ${name}`)
    : `Reserva tu clase en ${name}`
  const description = kind === 'r'
    ? (bu?.og_description || 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.')
    : 'Yoga y wellness — aparta tu lugar en segundos, sin cuentas ni contraseñas.'
  const image = bu?.og_image_url || `${base}/icon-512.png`
  const t = esc(title), d = esc(description), u = esc(dest), img = esc(image)

  return new Response(`<!doctype html>
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
<meta property="og:url" content="${esc(base + dest)}">
<meta name="twitter:card" content="${bu?.og_image_url ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${esc(base + dest)}">
<link rel="canonical" href="${esc(base + dest)}">
</head>
<body>
<script>location.replace(${JSON.stringify(base + dest)})</script>
<p>Redirigiendo… <a href="${esc(base + dest)}">continuar</a></p>
</body>
</html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
