import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// OBRA · portal público (?obra=CODIGO)
//
// Lo abre en el celular el albañil, el electricista, el de mantenimiento o el
// proveedor que NO tiene HOG APP. Una sola columna, letras grandes, cero
// distracciones: la lista de tareas de la obra, un check por tarea, y abajo el
// reporte del día.
//
// Quien entra se identifica con su celular y un PIN (la primera vez da su
// nombre). Todo lo que toca queda firmado con su nombre en la bitácora, que
// escribe un trigger en la base — el portal no decide qué se registra.
//
// Habla en el tono de la hoja original (crema, verde, terracota), no en el
// tema oscuro de HOG APP: esto es una hoja de trabajo, no un command center.
// ─────────────────────────────────────────────────────────────────────────────

interface Tarea {
  id: string; titulo: string; detalle: string | null; orden: number
  hecho: boolean; hecho_at: string | null; hecho_por: string | null
  fecha_plan: string | null; nota: string | null
  requiere_dinero: boolean; costo_estimado: number | null; costo_real: number | null
  ejecutor: string | null; updated_at: string
}
interface Grupo { id: string; nombre: string; orden: number; tareas: Tarea[] }
interface Reporte { id: string; actor: string; fecha: string; texto: string; created_at: string; tarea: string | null }
interface Plan {
  sesion: boolean
  yo?: { id: string; nombre: string; rol: string }
  obra?: {
    id: string; code: string; nombre: string; descripcion: string | null; responsable: string | null
    meta_fecha: string | null; estado: string; presupuesto: number | null; venue: string | null
  }
  grupos?: Grupo[]
  sueltas?: Tarea[]
  equipo?: { id: string; nombre: string; rol: string; last_seen_at: string | null }[]
  reportes?: Reporte[]
}
interface LogItem {
  id: number; actor: string; accion: string; campo: string | null
  antes: unknown; despues: unknown; tarea_titulo: string | null; created_at: string
}
interface Portada { nombre: string; venue: string | null; estado: string; meta_fecha: string | null; total: number; hechas: number }

// Paleta de la hoja original
const C = {
  bg: '#F9F4EF', fg: '#173519', fg2: '#4A5A4C', muted: '#767F76', line: '#C9D0C6',
  card: '#FFFFFF', accent: '#9E5C30', accentSoft: '#F1E3D8', done: '#E6ECE5', danger: '#B4402C',
}
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap'

const CAMPO: Record<string, string> = {
  titulo: 'título', detalle: 'detalle', fecha_plan: 'fecha', nota: 'nota', requiere_dinero: 'requiere dinero',
  costo_estimado: 'costo estimado', costo_real: 'costo real', ejecutor: 'quién ejecuta', grupo_id: 'grupo',
}

const mxn = (n: number | null | undefined) =>
  n == null ? '' : `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const fechaCorta = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : ''
const fechaHora = (ts: string) =>
  new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const guardar = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* incógnito */ }
}
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

function describeLog(l: LogItem): string {
  const v = (x: unknown) => {
    if (x == null || x === '') return 'vacío'
    if (typeof x === 'boolean') return x ? 'sí' : 'no'
    if (typeof x === 'number') return l.campo?.startsWith('costo') ? mxn(x) : String(x)
    if (typeof x === 'string') return l.campo === 'fecha_plan' ? fechaCorta(x) : x
    return JSON.stringify(x)
  }
  switch (l.accion) {
    case 'check': return 'marcó como hecha'
    case 'uncheck': return 'quitó la marca de hecha'
    case 'crear_tarea': return 'agregó la tarea'
    case 'archivar': return 'archivó la tarea'
    case 'borrar': return 'borró la tarea'
    case 'reporte': return `reportó: “${(l.despues as { texto?: string } | null)?.texto ?? ''}”`
    case 'registro': return 'se registró en la obra'
    case 'alta_miembro': return `dio de alta a ${(l.despues as { nombre?: string } | null)?.nombre ?? 'alguien'}`
    case 'editar': return `cambió ${CAMPO[l.campo ?? ''] ?? l.campo}: ${v(l.antes)} → ${v(l.despues)}`
    default: return l.accion
  }
}

export function ObraPortal({ code }: { code: string }) {
  const TOKEN_KEY = `hog_obra_${code.toUpperCase()}`
  const [portada, setPortada] = useState<Portada | null | undefined>(undefined)
  const [token, setToken] = useState<string | null>(() => leer(TOKEN_KEY))
  const [plan, setPlan] = useState<Plan | null>(null)
  const [status, setStatus] = useState<{ text: string; keep?: boolean; error?: boolean } | null>(null)
  const statusTimer = useRef<number | null>(null)

  // Identidad de la hoja en la pestaña: fondo claro y tipografía propia.
  useEffect(() => {
    document.title = 'Avance de obra · HOG'
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.colorScheme = 'light'
    document.body.style.background = C.bg
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = meta?.getAttribute('content')
    meta?.setAttribute('content', C.bg)
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = FONTS_HREF
    document.head.appendChild(link)
    return () => { document.head.removeChild(link); if (prev) meta?.setAttribute('content', prev) }
  }, [])

  const say = useCallback((text: string, opts?: { keep?: boolean; error?: boolean }) => {
    if (statusTimer.current) window.clearTimeout(statusTimer.current)
    setStatus({ text, ...opts })
    if (!opts?.keep) statusTimer.current = window.setTimeout(() => setStatus(null), 2400)
  }, [])

  useEffect(() => {
    supabase.rpc('fn_obra_portada', { p_code: code }).then(({ data, error }) => {
      setPortada(error ? null : ((data ?? null) as Portada | null))
    })
  }, [code])

  const cargarPlan = useCallback(async (silencioso = false) => {
    if (!token) { setPlan(null); return }
    const { data, error } = await supabase.rpc('fn_obra_plan', { p_token: token })
    if (error) { if (!silencioso) say('No se pudo cargar. Revisa tu señal.', { error: true }); return }
    const p = data as Plan
    if (!p?.sesion) { guardar(TOKEN_KEY, null); setToken(null); setPlan(null); return }
    setPlan(p)
  }, [token, TOKEN_KEY, say])

  useEffect(() => { cargarPlan() }, [cargarPlan])

  // Si alguien más palomea desde otro teléfono, que se vea sin recargar.
  useEffect(() => {
    if (!token) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargarPlan(true) }, 20000)
    return () => clearInterval(t)
  }, [token, cargarPlan])

  function entrar(tok: string) { guardar(TOKEN_KEY, tok); setToken(tok) }
  function salir() { guardar(TOKEN_KEY, null); setToken(null); setPlan(null) }

  // Palomear se ve AL INSTANTE: en obra la señal es mala y un check que tarda
  // medio segundo en pintarse se siente roto. La base confirma después (o se
  // revierte si falló).
  const patchTarea = useCallback((id: string, patch: Partial<Tarea>) => {
    setPlan(p => p ? {
      ...p,
      grupos: (p.grupos ?? []).map(g => ({ ...g, tareas: g.tareas.map(t => t.id === id ? { ...t, ...patch } : t) })),
      sueltas: (p.sueltas ?? []).map(t => t.id === id ? { ...t, ...patch } : t),
    } : p)
  }, [])

  const wrap: CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px', fontFamily: FONT, color: C.fg, fontSize: 16, lineHeight: 1.45 }

  if (portada === undefined) return <div style={wrap}><p style={{ color: C.muted }}>Cargando…</p></div>
  if (portada === null) return (
    <div style={wrap}>
      <Brand />
      <h1 style={h1}>Esta obra no existe</h1>
      <p style={{ color: C.fg2 }}>Revisa el link que te mandaron: el código <b>{code}</b> no corresponde a ninguna obra.</p>
    </div>
  )

  if (!token || !plan) {
    return (
      <div style={wrap}>
        <Brand venue={portada.venue} />
        <h1 style={h1}>{portada.nombre}</h1>
        <Progreso hechas={portada.hechas} total={portada.total} />
        {portada.meta_fecha && <p style={{ color: C.fg2, fontSize: 14, margin: '0 0 18px' }}>Meta: todo listo el <b>{fechaCorta(portada.meta_fecha)}</b></p>}
        {portada.estado === 'cerrada'
          ? <p style={{ color: C.fg2 }}>Esta obra ya se cerró. Gracias por el trabajo.</p>
          : <Login code={code} onEntrar={entrar} />}
        <Status status={status} />
      </div>
    )
  }

  return (
    <PlanView plan={plan} token={token} say={say} recargar={() => cargarPlan(true)} patchTarea={patchTarea} salir={salir} wrap={wrap} status={status} />
  )
}

// ── Login / registro ─────────────────────────────────────────────────────────
function Login({ code, onEntrar }: { code: string; onEntrar: (token: string) => void }) {
  const [tel, setTel] = useState(() => leer('hog_obra_tel') ?? '')
  const [pin, setPin] = useState('')
  const [nombre, setNombre] = useState(() => leer('hog_obra_nombre') ?? '')
  const [nuevo, setNuevo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (busy) return
    setBusy(true); setError(null)
    const { data, error: err } = nuevo
      ? await supabase.rpc('fn_obra_registro', { p_code: code, p_nombre: nombre, p_telefono: tel, p_pin: pin })
      : await supabase.rpc('fn_obra_login', { p_code: code, p_telefono: tel, p_pin: pin })
    setBusy(false)
    const r = (data ?? null) as { token?: string; nombre?: string; nuevo?: boolean; error?: string } | null
    if (err || !r) { setError('No se pudo conectar. Revisa tu señal e intenta de nuevo.'); return }
    if (r.error) { setError(r.error); return }
    if (r.nuevo) { setNuevo(true); return }
    if (r.token) {
      guardar('hog_obra_tel', tel); guardar('hog_obra_nombre', r.nombre ?? nombre)
      onEntrar(r.token)
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
      <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 18, letterSpacing: '-.01em' }}>
        {nuevo ? 'Primera vez aquí: dinos quién eres' : 'Entra para ver y marcar las tareas'}
      </p>
      <p style={{ margin: '0 0 14px', color: C.fg2, fontSize: 14 }}>
        {nuevo
          ? 'Tu nombre va a aparecer en cada tarea que marques o edites. Elige un PIN de 4 a 6 números: con él entras las siguientes veces.'
          : 'Con tu celular y tu PIN. Si es tu primera vez, te pedimos tu nombre.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {nuevo && <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre y apellido" autoComplete="name" style={campo} maxLength={60} />}
        <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Tu celular (10 dígitos)" inputMode="tel" autoComplete="tel" style={campo} disabled={nuevo} />
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={nuevo ? 'Elige tu PIN (4 a 6 números)' : 'Tu PIN'}
          inputMode="numeric" type="password" autoComplete={nuevo ? 'new-password' : 'current-password'} style={campo}
          onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
        {error && <p style={{ margin: 0, color: C.danger, fontSize: 14 }}>{error}</p>}
        <button onClick={enviar} disabled={busy} style={btnPrimario}>{busy ? 'Un momento…' : nuevo ? 'Registrarme y entrar' : 'Entrar'}</button>
        {nuevo && <button onClick={() => { setNuevo(false); setError(null) }} style={btnTexto}>Ya tengo cuenta en esta obra</button>}
      </div>
      <p style={{ margin: '14px 0 0', color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
        Tu celular solo se usa para saber quién hizo qué en esta obra.{' '}
        <a href="/?aviso=1" target="_blank" rel="noreferrer" style={{ color: C.fg2 }}>Aviso de privacidad</a>.
      </p>
    </div>
  )
}

// ── El plan ──────────────────────────────────────────────────────────────────
function PlanView({ plan, token, say, recargar, patchTarea, salir, wrap, status }: {
  plan: Plan; token: string
  say: (t: string, o?: { keep?: boolean; error?: boolean }) => void
  recargar: () => Promise<void>; patchTarea: (id: string, patch: Partial<Tarea>) => void
  salir: () => void; wrap: CSSProperties
  status: { text: string; error?: boolean } | null
}) {
  const obra = plan.obra!
  const grupos = useMemo<Grupo[]>(() => {
    const g = [...(plan.grupos ?? [])]
    if (plan.sueltas && plan.sueltas.length) g.push({ id: '', nombre: 'Otras tareas', orden: 999, tareas: plan.sueltas })
    return g
  }, [plan])
  const todas = useMemo(() => grupos.flatMap(g => g.tareas), [grupos])
  const hechas = todas.filter(t => t.hecho).length
  const costoEst = todas.reduce((s, t) => s + (Number(t.costo_estimado) || 0), 0)
  const costoReal = todas.reduce((s, t) => s + (Number(t.costo_real) || 0), 0)
  const conDinero = todas.filter(t => t.requiere_dinero && !t.hecho).length

  const [abierta, setAbierta] = useState<string | null>(null)
  const [bitacora, setBitacora] = useState<LogItem[] | null>(null)

  async function marcar(t: Tarea, hecho: boolean) {
    const antes = { hecho: t.hecho, hecho_por: t.hecho_por, hecho_at: t.hecho_at }
    patchTarea(t.id, { hecho, hecho_por: hecho ? plan.yo?.nombre ?? null : null, hecho_at: hecho ? new Date().toISOString() : null })
    say(hecho ? 'Marcando…' : 'Quitando marca…', { keep: true })
    const { data, error } = await supabase.rpc('fn_obra_marcar', { p_token: token, p_tarea: t.id, p_hecho: hecho })
    const r = (data ?? null) as { ok?: boolean; error?: string; sesion?: boolean } | null
    if (error || !r?.ok) {
      patchTarea(t.id, antes)
      say(r?.error ?? 'No se pudo guardar. Intenta de nuevo.', { error: true })
      if (r?.sesion === false) salir()
      return
    }
    await recargar()
    say(hecho ? `Hecha · ${plan.yo?.nombre}` : 'Marca quitada')
  }

  async function verBitacora() {
    const { data } = await supabase.rpc('fn_obra_historial', { p_token: token, p_tarea: null })
    setBitacora(((data as { items?: LogItem[] } | null)?.items ?? []))
  }

  return (
    <div style={wrap}>
      <Brand venue={obra.venue} />
      <h1 style={h1}>{obra.nombre}</h1>
      {obra.descripcion && <p style={{ color: C.fg2, fontSize: 14, margin: '0 0 10px', maxWidth: '62ch' }}>{obra.descripcion}</p>}
      <Progreso hechas={hechas} total={todas.length} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: C.muted, margin: '6px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
        {obra.meta_fecha && <span>Meta: <b style={{ color: C.fg }}>{fechaCorta(obra.meta_fecha)}</b></span>}
        {obra.responsable && <span>Responsable: <b style={{ color: C.fg }}>{obra.responsable}</b></span>}
        {costoEst > 0 && <span>Estimado: <b style={{ color: C.fg }}>{mxn(costoEst)}</b></span>}
        {costoReal > 0 && <span>Gastado: <b style={{ color: C.fg }}>{mxn(costoReal)}</b></span>}
        {conDinero > 0 && <span>{conDinero} {conDinero === 1 ? 'pendiente requiere' : 'pendientes requieren'} dinero</span>}
      </div>
      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>
        Entraste como <b style={{ color: C.fg }}>{plan.yo?.nombre}</b>. <button onClick={salir} style={btnTexto}>Salir</button>
      </p>

      {grupos.map((g, gi) => {
        const d = g.tareas.filter(t => t.hecho).length
        return (
          <section key={g.id || 'sueltas'} style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${C.fg}`, paddingBottom: 5, marginBottom: 6, gap: 10 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>{g.id ? `${gi + 1} · ` : ''}{g.nombre}</h2>
              <span style={{ fontSize: 13, color: C.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{d} / {g.tareas.length}</span>
            </div>
            {g.tareas.map(t => (
              <TareaRow key={t.id} t={t} abierta={abierta === t.id} onAbrir={() => setAbierta(abierta === t.id ? null : t.id)}
                onMarcar={h => marcar(t, h)} token={token} say={say} recargar={recargar} salir={salir} />
            ))}
            {g.id && <NuevaTarea grupo={g.id} token={token} say={say} recargar={recargar} />}
          </section>
        )
      })}

      <ReporteDelDia token={token} pendientes={todas.filter(t => !t.hecho)} reportes={plan.reportes ?? []} say={say} recargar={recargar} />

      <section style={{ marginTop: 28, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.fg2 }}>
            En esta obra: {(plan.equipo ?? []).map(m => m.nombre).join(', ') || 'solo tú'}.
          </p>
          <button onClick={bitacora ? () => setBitacora(null) : verBitacora} style={btnSecundario}>{bitacora ? 'Ocultar bitácora' : 'Ver bitácora completa'}</button>
        </div>
        {bitacora && <Bitacora items={bitacora} conTarea />}
      </section>

      <Status status={status} />
    </div>
  )
}

// ── Una tarea ────────────────────────────────────────────────────────────────
function TareaRow({ t, abierta, onAbrir, onMarcar, token, say, recargar, salir }: {
  t: Tarea; abierta: boolean; onAbrir: () => void; onMarcar: (hecho: boolean) => void; token: string
  say: (t: string, o?: { keep?: boolean; error?: boolean }) => void; recargar: () => Promise<void>; salir: () => void
}) {
  const pill = t.hecho
    ? <span style={{ ...pillBase, background: C.done, color: C.fg2 }}>hecha{t.hecho_por ? ` · ${t.hecho_por}` : ''}{t.hecho_at ? ` · ${fechaCorta(t.hecho_at)}` : ''}</span>
    : t.fecha_plan
      ? <span style={pillBase}>{fechaCorta(t.fecha_plan)}</span>
      : <span style={pillBase}>sin fecha</span>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '4px 12px', padding: '12px 0', borderBottom: `1px solid ${C.line}`, alignItems: 'start' }}>
      <input type="checkbox" checked={t.hecho} onChange={e => onMarcar(e.target.checked)} aria-label={`Marcar: ${t.titulo}`}
        style={{ width: 24, height: 24, margin: '2px 0 0', accentColor: C.accent, cursor: 'pointer' }} />
      <button onClick={onAbrir} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', minWidth: 0 }}>
        <span style={{ fontWeight: 600, display: 'block', fontSize: 16, textDecoration: t.hecho ? 'line-through' : 'none', color: t.hecho ? C.muted : C.fg }}>{t.titulo}</span>
        {t.detalle && <span style={{ color: t.hecho ? C.muted : C.fg2, fontSize: 13.5, display: 'block', marginTop: 2, textDecoration: t.hecho ? 'line-through' : 'none' }}>{t.detalle}</span>}
      </button>
      <div style={{ gridColumn: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', opacity: t.hecho ? 0.7 : 1 }}>
        {pill}
        {t.ejecutor && <span style={{ ...pillBase, background: 'transparent', border: `1px solid ${C.line}`, color: C.fg2 }}>ejecuta: {t.ejecutor}</span>}
        {t.requiere_dinero && <span style={{ ...pillBase, background: '#FBEFC9', color: '#6B4E00' }}>
          {t.costo_real != null ? `gastado ${mxn(t.costo_real)}` : t.costo_estimado != null ? `estimado ${mxn(t.costo_estimado)}` : 'requiere dinero'}
        </span>}
        {t.nota && !abierta && <span style={{ fontSize: 12.5, color: C.fg2 }}>📝 {t.nota}</span>}
        {!abierta && <button onClick={onAbrir} style={{ ...btnTexto, fontSize: 12.5, marginLeft: 'auto' }}>Editar</button>}
      </div>
      {abierta && <TareaEditor t={t} token={token} say={say} recargar={recargar} salir={salir} onCerrar={onAbrir} />}
    </div>
  )
}

function TareaEditor({ t, token, say, recargar, salir, onCerrar }: {
  t: Tarea; token: string; say: (t: string, o?: { keep?: boolean; error?: boolean }) => void
  recargar: () => Promise<void>; salir: () => void; onCerrar: () => void
}) {
  const [f, setF] = useState({
    titulo: t.titulo, detalle: t.detalle ?? '', fecha_plan: t.fecha_plan ?? '', nota: t.nota ?? '',
    requiere_dinero: t.requiere_dinero, costo_estimado: t.costo_estimado == null ? '' : String(t.costo_estimado),
    costo_real: t.costo_real == null ? '' : String(t.costo_real), ejecutor: t.ejecutor ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [hist, setHist] = useState<LogItem[] | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }))

  async function guardarCambios() {
    if (busy) return
    // Solo lo que cambió: así la bitácora no se llena de "cambios" iguales.
    const cambios: Record<string, unknown> = {}
    if (f.titulo.trim() !== t.titulo) cambios.titulo = f.titulo
    if (f.detalle.trim() !== (t.detalle ?? '')) cambios.detalle = f.detalle
    if (f.fecha_plan !== (t.fecha_plan ?? '')) cambios.fecha_plan = f.fecha_plan
    if (f.nota.trim() !== (t.nota ?? '')) cambios.nota = f.nota
    if (f.requiere_dinero !== t.requiere_dinero) cambios.requiere_dinero = f.requiere_dinero
    if (f.costo_estimado !== (t.costo_estimado == null ? '' : String(t.costo_estimado))) cambios.costo_estimado = f.costo_estimado
    if (f.costo_real !== (t.costo_real == null ? '' : String(t.costo_real))) cambios.costo_real = f.costo_real
    if (f.ejecutor.trim() !== (t.ejecutor ?? '')) cambios.ejecutor = f.ejecutor
    if (!Object.keys(cambios).length) { say('No hay cambios'); onCerrar(); return }
    setBusy(true); say('Guardando…', { keep: true })
    const { data, error } = await supabase.rpc('fn_obra_editar', { p_token: token, p_tarea: t.id, p_cambios: cambios })
    setBusy(false)
    const r = (data ?? null) as { ok?: boolean; error?: string; sesion?: boolean } | null
    if (error || !r?.ok) { say(r?.error ?? 'No se pudo guardar. Intenta de nuevo.', { error: true }); if (r?.sesion === false) salir(); return }
    await recargar()
    say('Guardado · quedó registrado a tu nombre')
    onCerrar()
  }

  async function verHistorial() {
    const { data } = await supabase.rpc('fn_obra_historial', { p_token: token, p_tarea: t.id })
    setHist(((data as { items?: LogItem[] } | null)?.items ?? []))
  }

  return (
    <div style={{ gridColumn: '1 / -1', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={lbl}>Tarea<input value={f.titulo} onChange={e => set('titulo', e.target.value)} style={campo} /></label>
      <label style={lbl}>Detalle<textarea value={f.detalle} onChange={e => set('detalle', e.target.value)} rows={2} style={{ ...campo, minHeight: 56, paddingTop: 10, resize: 'vertical' }} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={lbl}>Cuándo<input type="date" value={f.fecha_plan} onChange={e => set('fecha_plan', e.target.value)} style={campo} /></label>
        <label style={lbl}>Quién ejecuta<input value={f.ejecutor} onChange={e => set('ejecutor', e.target.value)} placeholder="nombre o empresa" style={campo} /></label>
      </div>
      <label style={lbl}>Nota (material, pendiente, quién)<textarea value={f.nota} onChange={e => set('nota', e.target.value)} rows={2} style={{ ...campo, minHeight: 56, paddingTop: 10, resize: 'vertical' }} /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
        <input type="checkbox" checked={f.requiere_dinero} onChange={e => set('requiere_dinero', e.target.checked)} style={{ width: 22, height: 22, accentColor: C.accent }} />
        ¿Requiere dinero?
      </label>
      {f.requiere_dinero && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={lbl}>Costo estimado<input type="number" inputMode="decimal" value={f.costo_estimado} onChange={e => set('costo_estimado', e.target.value)} placeholder="$" style={campo} /></label>
          <label style={lbl}>Costo real<input type="number" inputMode="decimal" value={f.costo_real} onChange={e => set('costo_real', e.target.value)} placeholder="$" style={campo} /></label>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={guardarCambios} disabled={busy} style={btnPrimario}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        <button onClick={onCerrar} style={btnSecundario}>Cancelar</button>
        <button onClick={hist ? () => setHist(null) : verHistorial} style={{ ...btnTexto, marginLeft: 'auto', fontSize: 13 }}>{hist ? 'Ocultar historial' : 'Ver quién la cambió'}</button>
      </div>
      {t.hecho && t.hecho_por && <p style={{ margin: 0, fontSize: 12.5, color: C.fg2 }}>Marcada como hecha por <b>{t.hecho_por}</b>{t.hecho_at ? ` el ${fechaHora(t.hecho_at)}` : ''}.</p>}
      {hist && <Bitacora items={hist} />}
    </div>
  )
}

function NuevaTarea({ grupo, token, say, recargar }: {
  grupo: string; token: string; say: (t: string, o?: { keep?: boolean; error?: boolean }) => void; recargar: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <button onClick={() => setOpen(true)} style={{ ...btnTexto, padding: '10px 0', fontSize: 14 }}>+ Agregar una tarea que surgió</button>
  async function crear() {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_obra_nueva_tarea', { p_token: token, p_grupo: grupo, p_titulo: titulo, p_detalle: detalle || null })
    setBusy(false)
    const r = (data ?? null) as { ok?: boolean; error?: string } | null
    if (error || !r?.ok) { say(r?.error ?? 'No se pudo agregar.', { error: true }); return }
    setTitulo(''); setDetalle(''); setOpen(false)
    await recargar()
    say('Tarea agregada a tu nombre')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
      <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué hay que hacer?" style={campo} autoFocus />
      <input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)" style={campo} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={crear} disabled={busy || titulo.trim().length < 3} style={btnPrimario}>Agregar</button>
        <button onClick={() => setOpen(false)} style={btnSecundario}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Reporte del día ──────────────────────────────────────────────────────────
function ReporteDelDia({ token, pendientes, reportes, say, recargar }: {
  token: string; pendientes: Tarea[]; reportes: Reporte[]
  say: (t: string, o?: { keep?: boolean; error?: boolean }) => void; recargar: () => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [tarea, setTarea] = useState('')
  const [busy, setBusy] = useState(false)
  const [verTodos, setVerTodos] = useState(false)

  async function enviar() {
    if (busy) return
    setBusy(true); say('Enviando reporte…', { keep: true })
    const { data, error } = await supabase.rpc('fn_obra_reportar', { p_token: token, p_texto: texto, p_tarea: tarea || null })
    setBusy(false)
    const r = (data ?? null) as { ok?: boolean; error?: string } | null
    if (error || !r?.ok) { say(r?.error ?? 'No se pudo enviar.', { error: true }); return }
    setTexto(''); setTarea('')
    await recargar()
    say('Reporte enviado')
  }

  const lista = verTodos ? reportes : reportes.slice(0, 5)
  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ borderBottom: `2px solid ${C.fg}`, paddingBottom: 5, marginBottom: 10 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>Reporte del día</h2>
      </div>
      <p style={{ color: C.fg2, fontSize: 14, margin: '0 0 10px' }}>Qué se hizo hoy, qué faltó, qué se necesita para mañana. Dos líneas bastan.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder="Hoy se…" style={{ ...campo, minHeight: 84, paddingTop: 10, resize: 'vertical' }} />
        {pendientes.length > 0 && (
          <select value={tarea} onChange={e => setTarea(e.target.value)} style={{ ...campo, color: tarea ? C.fg : C.muted }}>
            <option value="">Sobre la obra en general</option>
            {pendientes.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
        )}
        <button onClick={enviar} disabled={busy || texto.trim().length < 3} style={btnPrimario}>{busy ? 'Enviando…' : 'Enviar reporte'}</button>
      </div>
      {lista.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {lista.map(r => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
              <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}><b style={{ color: C.fg }}>{r.actor}</b> · {fechaHora(r.created_at)}{r.tarea ? ` · ${r.tarea}` : ''}</p>
              <p style={{ margin: '3px 0 0', fontSize: 15, whiteSpace: 'pre-wrap' }}>{r.texto}</p>
            </div>
          ))}
          {reportes.length > 5 && <button onClick={() => setVerTodos(v => !v)} style={{ ...btnTexto, padding: '10px 0', fontSize: 13 }}>{verTodos ? 'Ver menos' : `Ver los ${reportes.length} reportes`}</button>}
        </div>
      )}
    </section>
  )
}

// ── Bitácora ─────────────────────────────────────────────────────────────────
function Bitacora({ items, conTarea }: { items: LogItem[]; conTarea?: boolean }) {
  if (!items.length) return <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted }}>Todavía no hay movimientos.</p>
  return (
    <div style={{ marginTop: 10 }}>
      {items.map(l => (
        <p key={l.id} style={{ margin: 0, padding: '7px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13.5, lineHeight: 1.4 }}>
          <span style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fechaHora(l.created_at)}</span> · <b>{l.actor}</b> {describeLog(l)}
          {conTarea && l.tarea_titulo && l.accion !== 'reporte' && <span style={{ color: C.fg2 }}> — {l.tarea_titulo}</span>}
        </p>
      ))}
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────
function Brand({ venue }: { venue?: string | null }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: C.muted }}>
    hospitality operations group{venue ? ` · ${venue}` : ''}
  </div>
}
function Progreso({ hechas, total }: { hechas: number; total: number }) {
  const pct = total ? Math.round(hechas / total * 100) : 0
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
      <b style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{hechas} / {total}</b>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.line, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: C.accent }} /></div>
      <span style={{ fontSize: 13, color: C.muted }}>{pct}% terminado</span>
    </div>
  )
}
function Status({ status }: { status: { text: string; error?: boolean } | null }) {
  return (
    <div role="status" style={{
      position: 'fixed', left: '50%', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)',
      background: status?.error ? C.danger : C.fg, color: C.bg, fontSize: 13, padding: '8px 14px', borderRadius: 999,
      opacity: status ? 1 : 0, transition: 'opacity .2s', pointerEvents: 'none', maxWidth: '90vw', textAlign: 'center', fontFamily: FONT,
    }}>{status?.text ?? ''}</div>
  )
}

const h1: CSSProperties = { fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', margin: '2px 0 6px', textWrap: 'balance' }
const campo: CSSProperties = {
  fontFamily: 'inherit', fontSize: 16, color: C.fg, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
  padding: '0 12px', minHeight: 46, width: '100%', boxSizing: 'border-box', outline: 'none',
}
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }
const pillBase: CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: C.accentSoft, color: C.accent, whiteSpace: 'nowrap' }
const btnPrimario: CSSProperties = {
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#fff', background: C.accent, border: 0, borderRadius: 10,
  minHeight: 46, padding: '0 18px', cursor: 'pointer',
}
const btnSecundario: CSSProperties = {
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: C.fg, background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 10,
  minHeight: 40, padding: '0 14px', cursor: 'pointer',
}
const btnTexto: CSSProperties = {
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: C.accent, background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline',
}
