import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { refVigente } from '../lib/prRef'

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE CASAS — el aterrizaje del link de un PR sin venue.
//
// Quien escanea el QR de un relaciones públicas sin que apunte a una casa
// concreta (/p/SOFI-MZT) llega aquí: elige dónde quiere reservar y sigue al
// formulario de siempre. El código ya quedó guardado en el navegador, así que
// la atribución sobrevive al brinco.
//
// Página aislada, sin sesión: la ve gente que no tiene cuenta en HOG APP.
// ─────────────────────────────────────────────────────────────────────────────

interface Casa { code: string; name: string; location: string | null }

export function CasasPicker() {
  const [casas, setCasas] = useState<Casa[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const ref = refVigente()

  useEffect(() => {
    supabase.functions.invoke('public-reservation', { body: { action: 'venues' } })
      .then(({ data, error }) => {
        if (error || data?.error) { setErr('No pudimos cargar las casas. Intenta de nuevo.'); return }
        setCasas((data?.venues ?? []) as Casa[])
      })
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 48px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', textAlign: 'center' }}>
          ¿Dónde te esperamos?
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>
          Elige la casa y reservas en un minuto.
        </p>

        {err && (
          <p style={{ fontSize: 13, color: 'var(--status-risk)', textAlign: 'center' }}>{err}</p>
        )}
        {!casas && !err && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>Cargando…</p>
        )}
        {casas?.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            Ahorita no hay casas con reserva en línea. Escríbenos por WhatsApp y te ayudamos.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(casas ?? []).map(c => (
            <a key={c.code}
              // El código viaja de nuevo en la URL: si el navegador borró el
              // localStorage entre pantallas, la atribución no se pierde.
              href={`/?reservar=${encodeURIComponent(c.code)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 14, padding: '16px 18px', minHeight: 64,
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                {c.location && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.location}</div>}
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>›</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
