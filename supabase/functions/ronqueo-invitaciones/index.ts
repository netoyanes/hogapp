// ronqueo-invitaciones — herramienta de PR de Bruma Records (/pr/invitaciones)
//
// Entradas (POST JSON):
//   · registro { nombre, telefono, pin }          → { token, usuario }
//   · login    { telefono, pin }                  → { token, usuario } | { nuevo: true }
//   · yo       { token }                          → { usuario }
//   · emitir   { token, tipo, nombre, titular?, acompanantes?, firma, formato }
//                                                 → { invitacion }  (toma el consecutivo)
//   · png      { token, codigo, formato }         → { png (base64), archivo }
//   · lista    { token, q? }                      → { invitaciones }
//   · anular   { token, codigo }                  → { ok }
//
// El PNG se renderiza AQUÍ con Satori + resvg a partir de lo guardado en la
// base: volver a descargar da exactamente la misma imagen. Las plantillas
// viven en plantillas.ts (el navegador usa el mismo archivo para la vista
// previa) y las fuentes/imágenes van embebidas en assets.ts.
//
// Verify JWT: DESACTIVADO — quien entra no es usuario de Supabase; su llave es
// el token de sesión (celular + PIN), que se valida en cada llamada.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import satori from 'npm:satori@0.63.2'
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.2'
import { plantilla, FUENTES, MEDIDAS, type DatosInvitacion, type Formato, type Titular } from './plantillas.ts'
import { FUENTES_B64, IMAGENES } from './assets.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const FIRMAS = ['neto', 'norbert', 'bárbara', 'bruma records']
const TITULARES: Titular[] = ['invitada', 'invitado', 'invitados']

// ── render ──────────────────────────────────────────────────────────────────
const b64aBuffer = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer
let listo: Promise<void> | null = null
const fuentes = FUENTES.map(f => ({ name: f.name, weight: f.weight, style: 'normal' as const, data: b64aBuffer(FUENTES_B64[f.key]) }))
function preparar() {
  return (listo ??= initWasm(fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')))
}
async function renderPng(d: DatosInvitacion): Promise<Uint8Array> {
  await preparar()
  const { w, h } = MEDIDAS[d.formato]
  const svg = await satori(plantilla(d, f => IMAGENES[f]) as never, { width: w, height: h, fonts: fuentes })
  return new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng()
}
function aBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// ── sesión ──────────────────────────────────────────────────────────────────
async function sha256(t: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('')
}
async function abrirSesion(db: SupabaseClient, usuarioId: string) {
  const token = crypto.randomUUID() + crypto.randomUUID()
  await db.from('ronqueo_pr_sesiones').insert({ token_hash: await sha256(token), usuario_id: usuarioId })
  const { data: u } = await db.from('ronqueo_pr_usuarios').select('id,nombre,telefono').eq('id', usuarioId).single()
  return { token, usuario: u }
}
async function usuarioDe(db: SupabaseClient, token: unknown) {
  if (typeof token !== 'string' || token.length < 40) return null
  const { data } = await db.from('ronqueo_pr_sesiones')
    .select('usuario_id, expires_at, ronqueo_pr_usuarios(id,nombre,telefono)')
    .eq('token_hash', await sha256(token)).maybeSingle()
  if (!data || new Date(data.expires_at) < new Date()) return null
  return data.ronqueo_pr_usuarios as unknown as { id: string; nombre: string; telefono: string }
}

// ── handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    const b = await req.json().catch(() => ({}))

    if (b.action === 'registro') {
      const { data, error } = await db.rpc('ronqueo_pr_registro', { p_nombre: b.nombre, p_telefono: b.telefono, p_pin: b.pin })
      if (error) throw error
      if (data.error) return json({ error: data.error }, 400)
      return json(await abrirSesion(db, data.id))
    }
    if (b.action === 'login') {
      const { data, error } = await db.rpc('ronqueo_pr_login', { p_telefono: b.telefono, p_pin: b.pin })
      if (error) throw error
      if (data.nuevo) return json({ nuevo: true })
      if (data.error) return json({ error: data.error }, 400)
      return json(await abrirSesion(db, data.id))
    }

    const yo = await usuarioDe(db, b.token)
    if (!yo) return json({ error: 'sesión vencida. vuelve a entrar.' }, 401)

    switch (b.action) {
      case 'yo':
        return json({ usuario: yo })

      case 'emitir': {
        const tipo = b.tipo === 'cortesia' ? 'cortesia' : b.tipo === 'venta' ? 'venta' : null
        const nombre = String(b.nombre ?? '').trim().toLocaleLowerCase('es-MX').slice(0, 60)
        const formato = ['feed', 'story', 'ambos'].includes(b.formato) ? b.formato : null
        const firma = FIRMAS.includes(b.firma) ? b.firma : null
        const titular = TITULARES.includes(b.titular) ? b.titular : 'invitada'
        const acompanantes = Math.max(0, Math.min(10, Math.floor(Number(b.acompanantes ?? 1)) || 0))
        if (!tipo || !nombre || !formato || !firma) return json({ error: 'faltan datos de la invitación.' }, 400)
        const { data, error } = await db.rpc('ronqueo_inv_emitir', {
          p_tipo: tipo, p_nombre: nombre, p_titular: titular, p_acompanantes: acompanantes,
          p_firma: firma, p_formato: formato, p_usuario: yo.id,
        })
        if (error) throw error
        return json({ invitacion: data[0] })
      }

      case 'png': {
        const formato: Formato = b.formato === 'story' ? 'story' : 'feed'
        const { data: inv } = await db.from('ronqueo_invitaciones').select('*').eq('codigo', String(b.codigo ?? '')).maybeSingle()
        if (!inv) return json({ error: 'no existe ese código.' }, 404)
        if (inv.anulada_at) return json({ error: 'ese código está anulado.' }, 410)
        const png = await renderPng({
          tipo: inv.tipo, formato, nombre: inv.nombre, codigo: inv.codigo, firma: inv.firma,
          titular: inv.titular ?? undefined, acompanantes: inv.acompanantes,
        })
        await db.from('ronqueo_invitaciones').update({ descargas: inv.descargas + 1 }).eq('id', inv.id)
        // Sin acentos ni espacios: se comparte por WhatsApp y se abre en cualquier teléfono
        const ascii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const archivo = `${ascii(inv.codigo)}-${ascii(inv.nombre)}-${formato}.png`
        return json({ png: aBase64(png), archivo })
      }

      case 'lista': {
        let q = db.from('ronqueo_invitaciones').select('*').order('created_at', { ascending: false }).limit(500)
        const t = String(b.q ?? '').trim()
        if (t) q = q.or(`nombre.ilike.%${t.replace(/[%,()]/g, '')}%,codigo.ilike.%${t.replace(/[%,()]/g, '')}%`)
        const { data, error } = await q
        if (error) throw error
        return json({ invitaciones: data })
      }

      case 'anular': {
        const { data, error } = await db.from('ronqueo_invitaciones')
          .update({ anulada_at: new Date().toISOString(), anulada_por: `${yo.nombre} · ${yo.telefono}` })
          .eq('codigo', String(b.codigo ?? '')).is('anulada_at', null).select('codigo')
        if (error) throw error
        return json({ ok: (data ?? []).length > 0 })
      }

      default:
        return json({ error: 'acción desconocida' }, 400)
    }
  } catch (e) {
    console.error('ronqueo-invitaciones', e)
    return json({ error: 'error interno' }, 500)
  }
})
