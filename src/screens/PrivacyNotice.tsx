import { AppLogoBadge } from '../components/ui/AppLogo'

// Aviso de privacidad — página estática, accesible sin sesión vía /?aviso=1.
// Enlazada desde el checkbox de consentimiento al registrar clientes.
export function PrivacyNotice() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <AppLogoBadge size={32} radius={8} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>HOG APP</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>Aviso de privacidad</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>Aviso de privacidad</h1>

          <Section title="Responsable">
            HOG (House of Gastronomy) y sus unidades de negocio son responsables del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </Section>

          <Section title="Datos que recabamos">
            Nombre, número de teléfono y, de forma opcional, correo electrónico y fecha de cumpleaños. También registramos tus visitas y reservaciones en nuestros venues.
          </Section>

          <Section title="Finalidades">
            <b style={{ color: 'var(--text-primary)' }}>Primarias:</b> gestionar tus reservaciones, brindarte servicio en nuestros establecimientos y mantener tu historial de visitas.<br />
            <b style={{ color: 'var(--text-primary)' }}>Secundarias (solo con tu consentimiento explícito):</b> enviarte promociones y comunicación de marketing. Este consentimiento es opcional, nunca está pre-marcado y puedes retirarlo en cualquier momento.
          </Section>

          <Section title="Transferencias">
            No compartimos, vendemos ni transferimos tus datos personales a terceros. Tus datos viven únicamente en los sistemas internos de HOG.
          </Section>

          <Section title="Derechos ARCO">
            Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición en cualquiera de nuestros establecimientos o escribiendo al personal del venue donde te registraste. Al solicitar la cancelación, tus datos personales se eliminan o anonimizan de forma irreversible; podemos conservar registros estadísticos sin datos que te identifiquen.
          </Section>

          <Section title="Conservación">
            Conservamos tus datos mientras exista una relación activa contigo (visitas o reservaciones). Puedes solicitar su eliminación en cualquier momento.
          </Section>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 20, marginBottom: 0 }}>
            Última actualización: junio 2026 · Si tienes dudas sobre este aviso, pregunta al equipo del venue.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  )
}
