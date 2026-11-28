// /reporte/<token> — el reporte que se comparte con un director. Sin cuenta:
// el link vale hasta que vence o se revoca (concha_reporte_publico).
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ReporteVista } from './ReporteVista'
import { periodoTexto, type ReportePublicado } from './datos'
import './reporte.css'

const fechaHora = (s: string) => new Date(s).toLocaleString('es-MX', { timeZone: 'America/Mazatlan', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export function ReportePublico({ token }: { token: string }) {
  const [r, setR] = useState<ReportePublicado | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    document.body.style.background = '#F9CA18'
    supabase.rpc('concha_reporte_publico', { p_token: token }).then(({ data, error: e }) => {
      if (e) setError(true)
      else setR(data as ReportePublicado)
    })
  }, [token])

  useEffect(() => {
    if (r?.estado === 'ok' && r.desde && r.hasta) document.title = `${r.titulo} · ${periodoTexto(r.desde, r.hasta)}`
  }, [r])

  if (error) return <Aviso titulo="No se pudo abrir el reporte" texto="Revisa tu conexión e inténtalo de nuevo." />
  if (!r) return <Aviso titulo="Cargando reporte…" />
  if (r.estado === 'vencido') return <Aviso titulo="Este link ya venció" texto={`Venció el ${fechaHora(r.expira_en!)}; pide un link nuevo.`} />
  if (r.estado === 'revocado') return <Aviso titulo="Este link ya no está disponible" texto="Pide un link nuevo." />
  if (r.estado !== 'ok' || !r.datos) return <Aviso titulo="Este link no existe" texto="Revisa que esté completo o pide uno nuevo." />

  return (
    <ReporteVista
      datos={r.datos} titulo={r.titulo!} desde={r.desde!} hasta={r.hasta!}
      acciones={<button type="button" className="dr-btn" onClick={() => window.print()}>Descargar PDF</button>}
      pie={<>Generado el {fechaHora(r.generado!)}<span className="dr-no-print"> · Link válido hasta el {fechaHora(r.expira_en!)}</span></>}
    />
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="dr" style={{ minHeight: '100vh', justifyContent: 'center', textAlign: 'center' }}>
      <div className="dr-vacio">
        <p style={{ margin: 0, fontFamily: 'var(--dc-title)', fontSize: 22, color: 'var(--dc-primary)' }}>{titulo}</p>
        {texto && <p style={{ margin: '8px 0 0' }}>{texto}</p>}
      </div>
    </div>
  )
}
