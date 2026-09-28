// ─────────────────────────────────────────────────────────────────────────────
// RADAR BTC · USD · MXN — herramienta personal del Master para seguir cómo va
// el bitcoin frente al dólar y al peso: precios en vivo, noticias con puntaje,
// alertas y un pronóstico a 24 h.
//
// La página es HTML puro y vive en public/radar/index.html, igual que el menú
// del Oyster en /menu/oc.html. Aquí solo se enmarca: un iframe del mismo
// origen, sin sandbox, para que conserve su localStorage (ajustes, historial
// de precios, calificación del pronóstico) y pueda pedir permiso de
// notificaciones. Todo corre en el navegador; no toca Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export function RadarBTC() {
  return (
    <iframe
      src="/radar/index.html"
      title="Radar BTC · USD · MXN"
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'block', background: 'var(--bg-base)' }}
    />
  )
}
