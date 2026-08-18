// og-share — Plan B del preview de pautas, como edge function de Supabase.
//
// Mismo trabajo que api/r.js y api/w.js de Vercel: servir el Open Graph del
// venue (título/descripción/imagen configurados en Reservas → Compartir) y
// redirigir a la SPA. Existe por si las funciones /api de Vercel no registran
// en el proyecto — vercel.json puede reescribir /r/:code y /w/:code hacia
// esta URL (rewrite externo: Vercel PROXEA, el dominio visible no cambia).
//
//   /functions/v1/og-share?kind=r&code=OC          → reservas
//   /functions/v1/og-share?kind=w&code=PC          → wellness
//   /functions/v1/og-share?kind=p&code=SOFI-MZT    → link de un PR
//   /functions/v1/og-share?kind=p&code=SOFI-MZT&v=OC → link de un PR a UN venue
//
// El kind=p resuelve el código contra pr_profiles y manda al visitante con
// ?ref=CODIGO: la SPA lo guarda 30 días (last touch) y lo aplica al reservar.
// Si el código no existe o está dado de baja, el visitante NO se queda tirado
// — entra al portal normal, simplemente sin atribución.
//
// Necesita el secret PORTAL_BASE_URL (https://tu-dominio) para armar la
// redirección y las URLs absolutas del OG.
// Verify JWT: DESACTIVADO — la consume el robot de Meta, anónimo.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const kindRaw = url.searchParams.get('kind')
  const kind: 'r' | 'w' | 'p' = kindRaw === 'w' ? 'w' : kindRaw === 'p' ? 'p' : 'r'
  // Los códigos de venue son cortos (OC); los de PR llevan guion (SOFI-MZT)
  const code = (url.searchParams.get('code') ?? '').slice(0, kind === 'p' ? 24 : 12)
  // Link de PR apuntado a UN venue: /p/SOFI-MZT?v=OC
  const venueParam = (url.searchParams.get('v') ?? '').slice(0, 12).toUpperCase()
  // Vercel proxea este contenido: el dominio REAL del portal viene en
  // x-forwarded-host — cero secrets que configurar. PORTAL_BASE_URL queda
  // como override opcional (p. ej. si algún día el proxy cambia).
  const fwd = (req.headers.get('x-forwarded-host') ?? '').split(',')[0].trim()
  const base = fwd ? `https://${fwd}` : (Deno.env.get('PORTAL_BASE_URL') ?? '').replace(/\/$/, '')

  // service role solo para LEER los 4 campos del preview — nada más sale de aquí
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // El código de venue a buscar: en /r/ y /w/ es el código mismo; en /p/ es el
  // ?v= opcional (un link de PR puede apuntar a una casa concreta o a ninguna)
  const buCode = kind === 'p' ? venueParam : code
  let bu: { id: string; name: string; og_title: string | null; og_description: string | null; og_image_url: string | null } | null = null
  if (buCode) {
    const r1 = await db.from('business_units')
      .select('id, name, og_title, og_description, og_image_url')
      .ilike('code', buCode).limit(1).maybeSingle()
    bu = r1.data as typeof bu
    if (!bu) {
      // Sin og_share.sql las columnas no existen y el select truena: cae al
      // puro nombre — el preview sale genérico pero con el venue correcto
      const { data: solo } = await db.from('business_units')
        .select('id, name').ilike('code', buCode).limit(1).maybeSingle()
      if (solo) bu = { id: solo.id, name: solo.name, og_title: null, og_description: null, og_image_url: null }
    }
  }

  // ── Código de PR: se resuelve para (a) saludar por su nombre en el preview
  // y (b) NO mandar ?ref= de un código muerto. Un código inválido no rompe la
  // visita: el cliente entra igual, solo que sin atribución.
  let pr: { full_name: string; codigo: string } | null = null
  if (kind === 'p' && code) {
    const { data } = await db.from('pr_profiles')
      .select('full_name, codigo').ilike('codigo', code).eq('estatus', 'activo').limit(1).maybeSingle()
    pr = data as typeof pr
  }

  const refQ = pr ? `ref=${encodeURIComponent(pr.codigo)}` : ''
  const dest = kind === 'w'
    ? `/?wellness=${encodeURIComponent(code)}`
    : kind === 'p'
      // Con venue → directo a reservar ahí. Sin venue → el selector de casas.
      ? (bu ? `/?reservar=${encodeURIComponent(buCode)}${refQ ? '&' + refQ : ''}`
            : `/?casas=1${refQ ? '&' + refQ : ''}`)
      : `/?reservar=${encodeURIComponent(code)}`

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
    if ((kind === 'r' || kind === 'p') && bu?.id) {
      const g = (h: string) => {
        const v = req.headers.get(h)
        try { return v ? decodeURIComponent(v).slice(0, 80) : null } catch { return v?.slice(0, 80) ?? null }
      }
      // fire-and-forget con timeout corto: el redirect no espera a la métrica
      await Promise.race([
        db.from('landing_views').insert({
          bu_id: bu.id, code: buCode.toUpperCase(),
          // 'pr' distingue las visitas que trajo un relaciones públicas de las
          // del link normal del venue — sin esto, Analítica no sabe de dónde vino
          via: kind === 'p' ? 'pr' : 'link',
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
      headers: { Location: base + dest + (kind === 'r' || kind === 'p' ? sep + 't=r' : ''), 'Cache-Control': 'no-store' },
    })
  }
  const name = bu?.name ?? (kind === 'w' ? 'nuestro estudio' : 'nuestra casa')
  const title = kind === 'w'
    ? `Reserva tu clase en ${name}`
    : kind === 'p'
      // El preview del link de un PR: si apunta a una casa, la nombra; si no,
      // invita al grupo entero. Nunca dice "SOFI-MZT" — eso no le dice nada
      // a quien lo recibe por WhatsApp.
      ? (bu?.og_title || (bu ? `Reserva tu mesa en ${name}` : 'Reserva tu mesa con nosotros'))
      : (bu?.og_title || `Reserva tu mesa en ${name}`)
  const description = kind === 'w'
    ? 'Yoga y wellness — aparta tu lugar en segundos, sin cuentas ni contraseñas.'
    : kind === 'p'
      ? (bu?.og_description || (pr
          ? `${pr.full_name} te invita — elige día, hora y cuántos son.`
          : 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.'))
      : (bu?.og_description || 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.')
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
