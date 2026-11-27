// Doña Concha · POS — quién cobra.
//
// Con internet, la contraseña la valida Supabase (la misma cuenta de HOG APP:
// usuario de piso + PIN, o correo + contraseña) y la sesión queda guardada para
// sincronizar. En ese momento la tablet guarda una huella de la contraseña
// (PBKDF2 con sal aleatoria; la contraseña nunca se guarda) para que la misma
// persona pueda volver a entrar aunque no haya red. La primera vez en cada
// dispositivo se necesita internet.
import { supabase } from '../lib/supabase'
import { normalizeUsername, pinToPassword, usernameToEmail } from '../lib/hohAuth'
import { abrirCaja, getPOS } from './store'

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')

export async function huellaClave(usuario: string, clave: string, sal: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${usuario}\u0000${clave}`), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: 210000 }, base, 256)
  return hex(bits)
}

function conTiempo<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error('tiempo')), ms))])
}

/** Normaliza lo que escribe la persona: «Rodo» → rodo; un correo se queda como correo */
export function usuarioDe(raw: string): string {
  const t = raw.trim()
  return t.includes('@') ? t.toLowerCase() : normalizeUsername(t)
}

export async function entrarCaja(raw: string, clave: string): Promise<string | null> {
  const usuario = usuarioDe(raw)
  if (!usuario || !clave) return 'Escribe tu usuario y tu contraseña'
  const local = getPOS().cajeros.find(c => c.usuario === usuario)

  if (navigator.onLine) {
    try {
      const esCorreo = usuario.includes('@')
      const { data, error } = await conTiempo(supabase.auth.signInWithPassword({
        email: esCorreo ? usuario : usernameToEmail(usuario),
        password: esCorreo ? clave : pinToPassword(clave),
      }), 12000)
      if (data?.session) {
        const userId = data.session.user.id
        const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
        const nombre = (perfil?.full_name as string | undefined) || local?.nombre || usuario
        const sal = crypto.randomUUID()
        abrirCaja(
          { usuario, nombre, userId, desde: new Date().toISOString() },
          { usuario, nombre, userId, sal, huella: await huellaClave(usuario, clave, sal) },
        )
        return null
      }
      // Supabase respondió que no: la contraseña está mal (no se intenta sin red)
      if (error && error.status && error.status < 500) return 'Usuario o contraseña incorrectos'
    } catch { /* sin conexión real: se intenta con lo guardado en la tablet */ }
  }

  if (!local) return 'La primera vez que entras en este dispositivo se necesita internet'
  if (await huellaClave(usuario, clave, local.sal) !== local.huella) return 'Usuario o contraseña incorrectos'
  abrirCaja({ usuario, nombre: local.nombre, userId: local.userId, desde: new Date().toISOString() }, null)
  return null
}
