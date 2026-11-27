// Doña Concha · POS — piezas compartidas entre la tablet y el celular.
import { useState, type ReactNode } from 'react'
import logoConcha from './assets/logo-concha.svg'
import logoLettering from './assets/logo-lettering.svg'
import type { Descuento } from './types'
import { supabase } from '../lib/supabase'
import { isValidPin, isValidUsername, normalizeUsername, pinToPassword, usernameToEmail } from '../lib/hohAuth'

/** Logo / Doña Concha — Principal (11:2). No se modifica. */
export function Logo() {
  return (
    <div className="dc-logo" role="img" aria-label="Doña Concha">
      <div className="dc-logo-concha"><img alt="" src={logoConcha} /></div>
      <div className="dc-logo-lettering"><img alt="" src={logoLettering} /></div>
    </div>
  )
}

/** POS / Chip (191:157) · POS / Chip seleccionado (191:159) */
export function Chip({ on, onClick, disabled, children }: { on?: boolean; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={'dc-chip' + (on ? ' is-on' : '')} aria-pressed={!!on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function HojaCodigo({ descuentos, onCerrar, onAplicar }: {
  descuentos: Descuento[]; onCerrar: () => void; onAplicar: (d: Descuento, codigo: string) => void
}) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  function aplicar() {
    const c = codigo.trim().toUpperCase()
    const d = descuentos.find(x => x.codigo?.toUpperCase() === c)
    if (!d) { setError(c ? `El código ${c} no existe o ya no está vigente` : 'Escribe el código'); return }
    onAplicar(d, c)
  }
  return (
    <div className="dc-velo" onClick={onCerrar}>
      <div className="dc-hoja" onClick={e => e.stopPropagation()}>
        <h3>Otro código</h3>
        <p>Códigos de descuento que no son de convenio. Se dan de alta en Descuentos.</p>
        <input className="dc-input" autoFocus value={codigo} onChange={e => { setCodigo(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && aplicar()} placeholder="CÓDIGO" />
        {error && <p style={{ color: 'var(--dc-primary)' }}>{error}</p>}
        <div className="dc-hoja-btns">
          <button type="button" className="dc-pago" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="dc-pago is-on" onClick={aplicar}>Aplicar</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Entrar con la cuenta de HOG APP: usuario y PIN (personal de piso), correo y
 * contraseña, o Google — las mismas tres formas que el login de HOG APP. La
 * sesión queda guardada en la tablet y sigue sirviendo sin internet.
 */
export function HojaEntrar({ onCerrar }: { onCerrar: () => void }) {
  const [modo, setModo] = useState<'pin' | 'correo'>('pin')
  const [usuario, setUsuario] = useState('')
  const [secreto, setSecreto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    if (!navigator.onLine) { setError('Para entrar se necesita internet (solo la primera vez)'); return }
    let email: string, password: string
    if (modo === 'pin') {
      const u = normalizeUsername(usuario)
      if (!isValidUsername(u)) { setError('El usuario debe tener al menos 8 letras o números'); return }
      if (!isValidPin(secreto)) { setError('El PIN es de 4 a 6 dígitos'); return }
      email = usernameToEmail(u); password = pinToPassword(secreto)
    } else {
      if (!usuario.includes('@') || !secreto) { setError('Escribe tu correo y tu contraseña'); return }
      email = usuario.trim(); password = secreto
    }
    setCargando(true)
    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    setCargando(false)
    if (e) setError(modo === 'pin' ? 'Usuario o PIN incorrectos' : 'Correo o contraseña incorrectos')
    else onCerrar()
  }

  async function google() {
    if (!navigator.onLine) { setError('Para entrar se necesita internet (solo la primera vez)'); return }
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/concha' } })
    if (e) setError(e.message)
  }

  function cambiar(m: 'pin' | 'correo') { setModo(m); setUsuario(''); setSecreto(''); setError(null) }

  return (
    <div className="dc-velo" onClick={onCerrar}>
      <div className="dc-hoja" onClick={e => e.stopPropagation()}>
        <h3>Entrar</h3>
        <p>Con tu cuenta de HOG APP. Se pide una sola vez; después la caja sigue funcionando aunque no haya internet.</p>
        <div className="dc-row" style={{ gap: 8 }}>
          <button type="button" className={'dc-chip' + (modo === 'pin' ? ' is-on' : '')} onClick={() => cambiar('pin')}>Usuario y PIN</button>
          <button type="button" className={'dc-chip' + (modo === 'correo' ? ' is-on' : '')} onClick={() => cambiar('correo')}>Correo</button>
        </div>
        <input key={modo} className="dc-input" style={{ textTransform: 'none' }} autoFocus value={usuario}
          placeholder={modo === 'pin' ? 'Usuario' : 'Correo'} type={modo === 'pin' ? 'text' : 'email'}
          autoCapitalize="none" autoCorrect="off" onChange={e => { setUsuario(e.target.value); setError(null) }} />
        <input className="dc-input" style={{ textTransform: 'none' }} value={secreto} type="password"
          placeholder={modo === 'pin' ? 'PIN' : 'Contraseña'} inputMode={modo === 'pin' ? 'numeric' : 'text'}
          onChange={e => { setSecreto(modo === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && entrar()} />
        {error && <p style={{ color: 'var(--dc-primary)' }}>{error}</p>}
        <div className="dc-hoja-btns">
          <button type="button" className="dc-pago" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="dc-pago is-on" onClick={entrar} disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </div>
        <button type="button" className="dc-pago" onClick={google}>Entrar con Google</button>
      </div>
    </div>
  )
}
