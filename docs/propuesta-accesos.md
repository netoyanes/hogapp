# HOG APP · Propuesta de modelo de accesos

> Estado: propuesta. Lo único ya ejecutable es el seed
> `supabase/seeds/super_user.sql` (Fase 0: crea el nivel Super, te lo asigna y
> cierra el hueco de auto‑promoción de rol). Todo lo demás se implementa por
> fases, sin romper lo que hoy opera.

---

## 1. Diagnóstico: por qué hoy está desorganizado

Hoy conviven **tres mecanismos** que se pisan entre sí, y ninguno es la fuente de verdad:

| Mecanismo | Dónde vive | Qué decide | Problema |
|---|---|---|---|
| **Rol** (`profiles.role`) | 9 valores en TS, 6/7/9 en el CHECK de la base según qué seed corrió último | Listas de vistas hardcodeadas en `App.tsx`, `Sidebar.tsx`, `BottomNav.tsx` (3 copias distintas) + 185 comparaciones `hog_role() in (...)` en RLS | Cada app nueva obliga a tocar 3 archivos del front y N policies. Las listas ya no coinciden entre sí. |
| **Apps por usuario** (`user_apps`) | Tabla + `APP_CATALOG` en Usuarios | Qué apps ve alguien (si tiene filas, SOLO esas) | Finanzas, Nómina, Wellness, Red PR y Comisiones PR se gatean por `user_apps` en `App.tsx`, pero **no están en el catálogo** de Usuarios: no se pueden asignar desde la UI. |
| **Funciones** (`user_capabilities`) | Tabla con CHECK + catálogo en Usuarios | Permisos puntuales (`talento`, `aprobador`) | `wellness_admin` se usa en el front y en RLS pero **no está en el CHECK**: no se puede otorgar. |

Además:

- **Master hace de dueño y de administrador a la vez.** No hay forma de distinguir "quien manda en la plataforma" (tú) de "quien administra usuarios" (los master users).
- **Venues abiertos por default.** `hog_has_venue()` devuelve `true` si el usuario **no tiene ningún venue asignado**. Un usuario recién invitado y sin venues ve todos los venues. Debería ser al revés: sin asignación, nada.
- **Auto‑promoción de rol.** En el repo, la única policy de escritura sobre `profiles` es "Users can update own profile" sin restringir columnas. Cualquier usuario autenticado puede ejecutar `update profiles set role='MASTER' where id=auth.uid()` con su propio token. Hay que confirmarlo en la base viva, pero el seed de Fase 0 ya lo cierra por trigger.
- **Roles que en realidad son "tipo de cuenta", no permisos.** `HEART_OF_HOUSE` = entra con usuario+PIN. `PR` = externo con portal propio. Se están usando como nivel de acceso cuando lo que describen es cómo entra la persona.
- **"Ver como"** solo simula roles, no apps ni venues, así que ya no sirve para probar lo que ve un usuario real.

---

## 2. Principio: dos niveles, y abajo de eso TODO es asignado

```
┌─────────────────────────────────────────────────────────────┐
│  SUPER  (solo tú)                                            │
│  · Ve y opera toda la app.                                   │
│  · Único que puede nombrar/quitar MASTERs.                   │
│  · Único con herramientas de plataforma: ⚡SQL, Ver como,    │
│    changelog, config de tenant.                              │
├─────────────────────────────────────────────────────────────┤
│  MASTER  (master users)                                      │
│  · Ve y opera toda la app.                                   │
│  · Administra a los demás: invita, asigna apps, venues y     │
│    permisos. No puede tocar a SUPER ni a otros MASTERs.      │
├─────────────────────────────────────────────────────────────┤
│  MIEMBRO  (todos los demás — SIN rol)                        │
│  Acceso = APPS asignadas × VENUES asignados × NIVEL por app  │
│  · Sin apps → solo Perfil.   · Sin venues → no ve datos.     │
└─────────────────────────────────────────────────────────────┘
```

El rol desaparece como fuente de permisos. Lo que hoy hace el rol (decidir qué ve cada quien) pasa a ser **asignación explícita** que hacen SUPER y MASTER desde Usuarios.

### 2.1 Las tres dimensiones de un Miembro

**a) Apps** (`user_apps`) — qué herramientas ve. Catálogo completo, no parcial:

`dashboard · tasks · crm · concierge · casa · events · objectives · finanzas · nomina · aperturas · wellness · pianobar · pr · prcom · revenue · reports · activity · templates · pulso`

**b) Nivel por app** (columna nueva `user_apps.nivel`) — qué puede hacer dentro:

| Nivel | Significa | Reemplaza a |
|---|---|---|
| `ver` | Solo lectura | rol `DEV`, C‑Level en módulos donde solo consulta |
| `operar` | Uso normal del día a día (crear tareas, mover reservas, correr checklists) | `TEAM`, `MARKETING`, `OPS_MANAGER` en casi todo |
| `admin` | Configura el módulo (horarios, precios, catálogos, aprobaciones) | `wellness_admin`, `aprobador`, parte de `OPS_MANAGER` |

Tres niveles bastan. Si un módulo necesita algo más fino (ej. `talento` dentro de Concierge), se modela como **permiso** (abajo), no como cuarto nivel.

**c) Venues** (`user_venues`) — sobre qué datos. Igual que hoy, con dos cambios:
- **Fail‑closed**: sin venues asignados, no ve datos de ningún venue (hoy ve todos).
- Al asignar un venue la UI ofrece "todos los venues actuales y futuros" como opción explícita (flag `all_venues` en `profiles`), para no tener que ir uno por uno con gente corporativa.

**d) Permisos transversales** (`user_permisos`, hoy `user_capabilities`) — lo poco que cruza apps:
`talento` (fees de DJs), `aprobador` (presupuestos), `sobrecupo` (autorizar overbooking). Se conservan; solo se renombra la tabla y el CHECK deja de ser una lista fija (se valida contra una tabla `permisos_catalogo`).

### 2.2 Tipo de cuenta ≠ permiso

`profiles.role` se renombra a `profiles.tipo_cuenta` y solo describe **cómo entra** la persona:

| tipo_cuenta | Entra con | Uso |
|---|---|---|
| `correo` | email + contraseña (invitación) | Oficina, gerentes, marketing |
| `pin` | usuario + PIN (hoy Heart of House) | Piso, tablet de host |
| `externo` | link / código (hoy PR) | Red PR |

Un host de piso es `pin` + app `casa` (operar) + app `concierge` (operar) + venue Apricot. Un PR es `externo` + app `pr` (ver). El PR Manager es `correo` + app `pr` (admin) + app `prcom` (ver). Nada de eso requiere un rol.

### 2.3 Plantillas, no roles

Para no asignar 6 checkboxes a cada persona, Usuarios ofrece **plantillas** (presets que solo rellenan el formulario; no son permisos):

| Plantilla | Apps y nivel | Venues |
|---|---|---|
| Gerente de venue | tasks/crm/concierge/casa/events → operar; reports → ver | Los que elijas |
| Marketing | tasks/events/pulso → operar; crm → ver | Todos |
| Piso / Host | casa/concierge → operar | Uno |
| Finanzas | finanzas/nomina/revenue/reports → admin | Todos |
| Wellness gerente | wellness → admin | Pod |
| Auditoría | todo → ver | Todos |

Si mañana quieres que un gerente vea Finanzas de su venue, le agregas la app; no hay que inventar un rol nuevo ni tocar código.

---

## 3. Una sola fuente de verdad en cada capa

### Base de datos: `hog_can(app, nivel, bu)`

Todas las policies dejan de listar roles y llaman a una sola función:

```sql
-- ¿El usuario actual puede hacer <nivel> en <app> sobre el venue <bu>?
create or replace function public.hog_can(p_app text, p_nivel text, p_bu uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    hog_is_super() or hog_is_master()
    or (
      exists (select 1 from user_apps ua
               where ua.user_id = auth.uid() and ua.app = p_app
                 and nivel_rank(ua.nivel) >= nivel_rank(p_nivel))
      and (p_bu is null or hog_has_venue(p_bu))
    ), false)
$$;
```

Ejemplo de policy después de migrar:

```sql
create policy reservas_write on reservations for all to authenticated
  using (hog_can('concierge','operar', bu_id)) with check (hog_can('concierge','operar', bu_id));
```

Notas:
- `coalesce(..., false)`: un permiso es sí o no, nunca NULL (ya está documentado en `pr_attribution.sql`, aplica igual aquí).
- `hog_has_venue` pasa a fail‑closed: `all_venues or exists(user_venues)`.
- Las 185 comparaciones `hog_role() in (...)` se migran módulo por módulo (Fase 2). Mientras tanto, `hog_role()` sigue existiendo y `hog_can` convive con ella.

### Front: `src/lib/access.ts`

Un solo módulo que expone `can(app, nivel)` y `visibleApps()`, alimentado por `profiles` + `user_apps` + `user_venues`. `App.tsx`, `Sidebar.tsx` y `BottomNav.tsx` dejan de tener listas propias y consumen ese módulo. Las pantallas reciben `access` en vez de `userRole`/`isMaster`/`caps` sueltos.

"Ver como" se convierte en **"Ver como <usuario>"** (solo SUPER): carga las apps/venues de una persona real y muestra exactamente lo que ella ve. Es la forma correcta de probar accesos cuando ya no hay roles.

### Pantalla Usuarios (rediseño)

Por persona, una tarjeta con cuatro bloques: **Cuenta** (tipo, correo/usuario, último acceso), **Apps** (chips con nivel ver/operar/admin), **Venues** (chips o "todos"), **Permisos**. Arriba, el selector de plantilla. MASTER ve y edita a todos los Miembros; no ve el botón de "nombrar Master". SUPER ve todo, incluida una sección "Masters" aparte.

---

## 4. Migración por fases (sin apagar nada)

**Fase 0 — Ya en este branch** (`supabase/seeds/super_user.sql`)
1. Columna `profiles.is_super` + función `hog_is_super()`.
2. Te deja como `MASTER` + `is_super = true` (correo `neto@swells.mx`). Se usa `MASTER` como rol para que las 50 policies que hoy dicen `hog_role() = 'MASTER'` te sigan dejando pasar sin tocarlas.
3. Trigger que cierra la auto‑promoción: solo SUPER puede cambiar `is_super` o nombrar/quitar MASTERs; un MASTER solo puede cambiar el rol de Miembros; nadie más puede cambiar su propio rol.
4. Policies mínimas para que MASTER lea y edite perfiles ajenos (hoy Usuarios lo asume).

**Fase 1 — Cerrar huecos actuales** (1 seed + 1 PR de front, medio día)
- `hog_has_venue` fail‑closed + flag `all_venues`. Antes de correrlo, asignar `all_venues` a quien hoy depende del default abierto (C‑Level, Marketing, Dev).
- Completar `APP_CATALOG` con las apps que faltan; agregar `wellness_admin` al CHECK.
- Herramientas de plataforma (⚡SQL, Ver como) solo para `is_super`.

**Fase 2 — `user_apps.nivel` + `hog_can`** (1 seed + refactor de front, 1–2 días)
- Columna `nivel` con default `operar` (compatibilidad).
- `src/lib/access.ts`; `App.tsx`/`Sidebar`/`BottomNav` consumen de ahí.
- Script de migración que convierte roles actuales a asignaciones:

| Rol actual | Se convierte en |
|---|---|
| `C_LEVEL` | dashboard/reports/activity/finanzas → ver; tasks/crm/events → operar; all_venues |
| `OPS_MANAGER` | tasks/crm/concierge/casa/events → operar; concierge → admin; sus venues |
| `MARKETING` | tasks/events/pulso → operar; crm → ver; all_venues |
| `TEAM` | tasks/crm/concierge/events → operar; sus venues |
| `HEART_OF_HOUSE` | tipo `pin`; casa/concierge → operar; su venue |
| `DEV` | todo → ver; all_venues |
| `PR` | tipo `externo`; pr → ver |
| `PR_MANAGER` | pr → admin; prcom/concierge → ver |

**Fase 3 — Migrar RLS módulo por módulo** (por PR, cada uno con su seed)
Orden sugerido por riesgo/beneficio: Tareas → Concierge → La Casa → Proyectos → Comercial → Finanzas/Nómina → Wellness → PR. Cada policy pasa de `hog_role() in (...)` a `hog_can(...)`. Cuando el último módulo migra, `hog_role()` queda solo para `MASTER`/`SUPER`.

**Fase 4 — Retirar roles**
`profiles.role` → `tipo_cuenta`; se borran las listas de roles del front; Usuarios queda con plantillas. `user_capabilities` → `user_permisos` con catálogo en tabla.

---

## 5. Decisiones que te toca confirmar

1. **¿MASTER puede invitar a otro MASTER?** Propuesta: no, solo SUPER. Es lo que evita que el número de "dueños" crezca sin que te enteres.
2. **¿Los MASTERs ven Finanzas y Nómina siempre?** Propuesta: sí (ven todo). Si quieres un master "de operación" sin números, ese ya no es MASTER: es Miembro con plantilla Gerente + all_venues.
3. **Venues fail‑closed desde Fase 1.** Implica revisar a los usuarios actuales sin venues asignados antes de correr el seed (la lista sale de `select email from profiles p where not exists (select 1 from user_venues where user_id=p.id)`).
4. **Tres niveles (ver/operar/admin).** Si prefieres solo dos (ver/operar) y dejar lo "admin" como permisos, también funciona; tres es más fácil de explicar a un master.
