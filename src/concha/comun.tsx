// Doña Concha · POS — piezas compartidas entre la tablet y el celular.
import { useState, type ReactNode } from 'react'
import logoConcha from './assets/logo-concha.svg'
import logoLettering from './assets/logo-lettering.svg'
import type { Descuento } from './types'

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
