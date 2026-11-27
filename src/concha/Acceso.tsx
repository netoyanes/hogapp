// Doña Concha · POS — pantalla de entrada: «¿Quién cobra?»
import { useState } from 'react'
import './concha.css'
import { Logo } from './comun'
import { entrarCaja } from './acceso'
import { usePOS } from './store'

export function Acceso() {
  const { cajeros } = usePOS()
  const [usuario, setUsuario] = useState(cajeros.length === 1 ? cajeros[0].usuario : '')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    setCargando(true); setError(null)
    const e = await entrarCaja(usuario, clave)
    setCargando(false)
    if (e) { setError(e); setClave('') }
  }

  return (
    <div className="dc da">
      <div className="da-caja">
        <Logo />
        <h1 className="dm-h1">¿QUIÉN COBRA?</h1>
        {cajeros.length > 0 && (
          <div className="dm-dos">
            {cajeros.map(c => (
              <button key={c.usuario} type="button" className={'dm-opcion' + (usuario === c.usuario ? ' is-on' : '')}
                onClick={() => { setUsuario(c.usuario); setError(null) }}>{c.nombre}</button>
            ))}
          </div>
        )}
        <input className="dc-input" style={{ textTransform: 'none' }} placeholder="Usuario" value={usuario}
          autoCapitalize="none" autoCorrect="off" autoComplete="username"
          onChange={e => { setUsuario(e.target.value); setError(null) }} />
        <input className="dc-input" placeholder="Contraseña" type="password" inputMode="numeric" value={clave}
          autoComplete="current-password" autoFocus={!!usuario}
          onChange={e => { setClave(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && entrar()} />
        {error && <p className="dc-cobro-error">{error}</p>}
        <button type="button" className="dm-principal" onClick={entrar} disabled={cargando || !usuario || !clave}>
          {cargando ? 'Entrando…' : 'ENTRAR'}
        </button>
        <p className="dm-ayuda">La primera vez en este dispositivo se necesita internet. Después puedes entrar aunque no haya.</p>
      </div>
    </div>
  )
}
