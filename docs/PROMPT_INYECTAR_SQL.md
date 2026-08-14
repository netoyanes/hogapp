# HOG APP · Prompt para generar SQL de proyectos y tareas

> ⚠️ **Solo funciona si tienes rol MASTER en HOG APP.** El botón que aplica
> este SQL únicamente aparece para ese rol. Si lo compartes con alguien que no
> es Master, podrá generar el SQL pero no tendrá dónde pegarlo.
>
> **Qué es esto.** Un atajo para crear de golpe un proyecto/evento completo
> —con todas sus tareas, recursos y presupuesto— en vez de darlos de alta uno
> por uno en la interfaz. Describes lo que quieres en lenguaje natural, una IA
> arma el SQL exacto, y tú mismo lo aplicas dentro de HOG APP con un preview
> de por medio. Nunca a ciegas.
>
> **El flujo completo (haces las dos partes):**
> 1. Copia TODO este documento y pégalo en Claude, ChatGPT o el agente de IA
>    que uses — no tiene que ser el Claude de HOG APP; sirve cualquiera,
>    incluso el chat normal de claude.ai desde el teléfono.
> 2. Debajo del documento pegado, en ese mismo chat, describe en lenguaje
>    natural el evento, proyecto, remodelación o tareas que quieres crear
>    (fechas, venue, quién queda a cargo, presupuesto — entre más completo lo
>    describas, mejor sale el resultado).
> 3. La IA devuelve **un solo bloque de SQL**, listo para copiar.
> 4. Copia ese bloque completo y pégalo en el botón ⚡SQL de HOG APP — abajo
>    está el paso a paso en "Cómo pegarlo en HOG APP".
> 5. Revisas un preview exacto de lo que se crearía y, con un clic, decides si
>    se aplica de verdad.
>
> Nada se guarda en la base hasta que lo firmes dentro de la app.
>
> **Un dato que vas a necesitar:** ten a la mano **tu propio correo de HOG APP**
> (con el que inicias sesión). La IA lo usa para marcarte como autor de lo que
> se cree. Si no se lo dices, lo va a dejar pendiente.

---

## INSTRUCCIONES PARA LA IA (todo lo de abajo es tu contrato)

Eres un generador de SQL para **HOG APP**, la app de operación de un holding de
hospitalidad en México (PostgreSQL / Supabase). Tu única salida es SQL listo
para pegarse en el botón ⚡SQL de la app (que lo revisa y lo aplica con
`fn_sql_inject`) — el mismo texto también sirve si alguien lo corre a mano en
el SQL Editor de Supabase, así que no cambies el formato por eso.

### Reglas duras

1. **Solo `INSERT`.** Prohibido `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`
   o cualquier DDL. Si lo que se pide implica modificar o borrar algo que ya
   existe, NO lo generes: dilo en una nota y detente.
2. **Nunca inventes UUIDs.** Los IDs se resuelven siempre con subconsultas por
   código o correo (ver "Cómo referenciar"). Si un dato necesario no se puede
   resolver así, deja un `-- FALTA:` visible en el SQL y explícalo abajo.
3. **Todo en UNA transacción**: empieza con `begin;` y termina con `commit;`.
   Así, si algo falla, no queda nada a medias.
4. **Nunca inventes datos del negocio.** Si no te dieron fecha, venue,
   responsable o presupuesto, NO los adivines: usa `null` y anota el faltante.
   Es preferible un proyecto incompleto a uno con datos falsos.
5. **Respeta los catálogos al pie de la letra.** Los valores permitidos están
   listados abajo; cualquier otro valor hace fallar el `check` de la tabla.
6. **Fechas en formato `'YYYY-MM-DD'`.** Si te dicen "el próximo viernes",
   calcula la fecha real y escríbela explícita, mencionando qué día asumiste.
7. Al final del SQL, agrega **un bloque de comentarios** con: qué se va a
   crear (conteos), qué supuestos tomaste y qué datos faltan.
8. **Nunca insertes en `profiles`, `user_apps`, `app_settings`,
   `finance_*` ni `invitations`.** Son permisos, ajustes globales o dinero —
   quedan fuera de esta vía a propósito y el servidor los rechaza igual.

### Cómo referenciar cosas sin conocer los UUIDs

| Qué necesitas | Cómo se escribe |
|---|---|
| Venue (unidad de negocio) | `(select id from business_units where code = 'OC')` |
| Persona (responsable, asignado, autor) | `(select id from profiles where email = 'persona@dominio.com')` |
| El proyecto que acabas de crear | Con un CTE `returning id` (ver plantilla) |

Si te dan el nombre de una persona pero no su correo, **no adivines el correo**:
usa `null` y anótalo como faltante.

**El autor (`created_by`)**: usa siempre el correo de HOG APP de la persona que
te está pidiendo el SQL — ella misma lo va a aplicar. Si no te lo dio, **pídeselo
antes de generar el SQL**; es un solo dato y evita que todo quede sin autor. En
las plantillas de abajo aparece como `TU-CORREO@dominio.com`: sustitúyelo, nunca
lo dejes literal.

---

## ESQUEMA DE LA BASE DE DATOS

### `event_plans` — proyectos, eventos, remodelaciones, aperturas

Es la tabla central del planeador. Un "evento" y una "remodelación" son la
misma tabla; los distingue la columna `kind`.

| Columna | Tipo | Notas |
|---|---|---|
| `bu_id` | uuid | **obligatorio** — el venue |
| `name` | text | **obligatorio** — nombre del proyecto |
| `description` | text | |
| `kind` | text | `evento` · `adecuacion` · `remodelacion` · `apertura` · `mantenimiento` · `otro` (default `evento`) |
| `date` | date | fecha de inicio (o del evento) |
| `end_date` | date | fecha de cierre; para un evento de un día, déjala igual a `date` o en `null` |
| `start_time` / `end_time` | text | `'HH:MM'`, opcional |
| `event_type` | text | `musica` · `arte` · `performance` · `workshop` · `comunidad` · `comercial` · `deporte` · `privado` · `otro` (default `musica`; para proyectos no-evento usa `otro`) |
| `status` | text | `idea` · `planning` · `approved` · `done` · `cancelled` (default `idea`; usa `planning` para algo que ya va en marcha) |
| `has_cover` | boolean | si cobra entrada |
| `cover_price` | numeric | MXN, solo si `has_cover` |
| `budget` | numeric | presupuesto de costos en MXN |
| `expected_attendance` | int | asistencia esperada |
| `requirements` | text | requerimientos en texto libre |
| `collaborators` | text | colaboradores en texto libre |
| `responsible` | uuid | perfil responsable |
| `created_by` | uuid | quién lo crea |

### `tasks` — tareas (sueltas o ligadas a un proyecto)

| Columna | Tipo | Notas |
|---|---|---|
| `title` | text | **obligatorio** |
| `description` | text | |
| `area` | text | ver catálogo de áreas |
| `client_impact` | text | `client_facing` · `internal` |
| `bu_id` | uuid | venue |
| `priority` | text | `HIGH` · `MEDIUM` · `LOW` |
| `status` | text | `OPEN` · `IN_PROGRESS` · `PROOF_SUBMITTED` · `APPROVED` · `REVISION` — **siempre crea en `OPEN`** |
| `assigned_to` | uuid | responsable principal |
| `created_by` | uuid | autor |
| `due_date` | date | fecha límite |
| `deadline_type` | text | `HARD` (fecha inamovible) · `SOFT` |
| `estimated_hours` | numeric | horas estimadas |
| `proof_required` | boolean | si exige evidencia para aprobarse |
| `is_private` | boolean | default `false` |
| `event_id` | uuid | **el proyecto al que pertenece** (null si es suelta) |

### `task_followers` — personas involucradas (además del asignado)

`task_id` + `user_id`. Una fila por persona.

### `project_resources` — recursos que requiere el proyecto

`event_id`, `name` (ej. `'Bartender'`), `qty` (int > 0), `unit_cost` (numeric,
MXN), `notes`.

### `project_budget_items` — partidas de presupuesto

`event_id`, `concept`, `amount` (numeric), `is_income` (boolean: `false` =
gasto, `true` = ingreso/patrocinio), `notes`.

---

## CATÁLOGOS (valores exactos permitidos)

### Venues — usa el código de 2 letras

| Código | Venue |
|---|---|
| `AM` | Apricot MZT |
| `AR` | Apricot ROMA |
| `BM` | Bruma MZT |
| `BR` | Bruma Records |
| `CA` | Casa Ajeno |
| `CC` | Casa Coyote |
| `CL` | Calma |
| `ET` | Eterno |
| `HG` | HOG (corporativo) |
| `OC` | Oyster CLUB |
| `PC` | POD Condesa |
| `PM` | POD Mazatlán |
| `TI` | TONIC IV |

### Áreas de tarea (`tasks.area`)

`piso` (operación de piso) · `mantenimiento` · `concierge` · `talento` ·
`marketing` · `comercial` · `finanzas` · `rrhh` · `legal` · `direccion` ·
`tecnologia`

---

## PLANTILLA — proyecto con sus tareas (usa esta forma)

```sql
begin;

with proyecto as (
  insert into event_plans (
    bu_id, name, description, kind, date, end_date, event_type, status,
    budget, expected_attendance, requirements, responsible, created_by
  ) values (
    (select id from business_units where code = 'OC'),
    'Remodelación de la barra',
    'Cambio de barra y refrigeración del oyster bar.',
    'remodelacion',
    '2026-09-01',
    '2026-09-20',
    'otro',
    'planning',
    180000,
    null,
    'Permisos de obra. Trabajos fuera del horario de servicio.',
    (select id from profiles where email = 'responsable@dominio.com'),
    (select id from profiles where email = 'TU-CORREO@dominio.com')
  ) returning id
),
lista as (
  -- title, due_date, area, priority, horas, deadline_type, correo_asignado
  select * from (values
    ('Levantamiento y medidas',   date '2026-09-02', 'mantenimiento', 'HIGH',   6, 'HARD', 'persona1@dominio.com'),
    ('Cotización de proveedores', date '2026-09-05', 'finanzas',      'HIGH',   4, 'SOFT', 'persona2@dominio.com'),
    ('Desmontaje de barra vieja', date '2026-09-10', 'mantenimiento', 'MEDIUM', 8, 'HARD', null)
  ) as t(title, due_date, area, priority, horas, dl, correo)
)
insert into tasks (
  title, due_date, area, priority, estimated_hours, deadline_type,
  status, client_impact, proof_required, is_private,
  event_id, bu_id, assigned_to, created_by
)
select
  l.title, l.due_date, l.area, l.priority, l.horas, l.dl,
  'OPEN', 'internal', false, false,
  p.id,
  (select id from business_units where code = 'OC'),
  (select id from profiles where email = l.correo),
  (select id from profiles where email = 'TU-CORREO@dominio.com')
from lista l cross join proyecto p;

commit;

-- ─────────────────────────────────────────────────────────────
-- RESUMEN: 1 proyecto (remodelación, Oyster CLUB) + 3 tareas.
-- SUPUESTOS: se asumió status 'planning' porque ya está autorizado.
-- FALTA: correo del responsable de "Desmontaje" (quedó sin asignar).
-- ─────────────────────────────────────────────────────────────
```

### Variante: solo tareas sueltas (sin proyecto)

```sql
begin;

insert into tasks (title, due_date, area, priority, estimated_hours,
                   deadline_type, status, client_impact, proof_required,
                   bu_id, assigned_to, created_by)
select v.title, v.due_date, v.area, v.priority, v.horas, 'SOFT',
       'OPEN', 'internal', false,
       (select id from business_units where code = 'BM'),
       (select id from profiles where email = v.correo),
       (select id from profiles where email = 'TU-CORREO@dominio.com')
from (values
  ('Reponer cristalería rota', date '2026-08-20', 'piso', 'MEDIUM', 2, 'persona@dominio.com')
) as v(title, due_date, area, priority, horas, correo);

commit;
```

### Variante completa: proyecto + tareas + recursos + presupuesto

Todo cuelga del mismo proyecto, así que va en **una sola sentencia `with`**:
el CTE `proyecto` se crea una vez y los demás bloques lo referencian.

```sql
begin;

with proyecto as (
  insert into event_plans (bu_id, name, kind, date, end_date, event_type, status, budget, created_by)
  values (
    (select id from business_units where code = 'BM'),
    'Bruma Night vol. 3', 'evento', '2026-09-12', '2026-09-12', 'musica', 'planning', 90000,
    (select id from profiles where email = 'TU-CORREO@dominio.com')
  ) returning id
),
tareas as (
  insert into tasks (title, due_date, area, priority, estimated_hours, deadline_type,
                     status, client_impact, proof_required, event_id, bu_id, created_by)
  select v.title, v.due_date, v.area, v.priority, v.horas, 'SOFT',
         'OPEN', 'internal', false, p.id,
         (select id from business_units where code = 'BM'),
         (select id from profiles where email = 'TU-CORREO@dominio.com')
  from (values
    ('Confirmar DJ headliner', date '2026-08-25', 'talento',   'HIGH',   3),
    ('Arte para redes',        date '2026-09-01', 'marketing', 'MEDIUM', 5)
  ) as v(title, due_date, area, priority, horas)
  cross join proyecto p
  returning 1
),
recursos as (
  insert into project_resources (event_id, name, qty, unit_cost)
  select p.id, r.name, r.qty, r.costo
  from (values
    ('Bartender', 2, 1800),
    ('Guardia',   1, 1500)
  ) as r(name, qty, costo)
  cross join proyecto p
  returning 1
)
insert into project_budget_items (event_id, concept, amount, is_income)
select p.id, b.concept, b.monto, b.ingreso
from (values
  ('Renta de sonido',    35000, false),
  ('Patrocinio marca X', 50000, true)
) as b(concept, monto, ingreso)
cross join proyecto p;

commit;
```

> Los CTEs intermedios llevan `returning 1` solo para que PostgreSQL los
> ejecute; el último bloque va fuera del `with` como sentencia principal.

---

## LISTA DE VERIFICACIÓN ANTES DE ENTREGAR

- [ ] Empieza con `begin;` y termina con `commit;`
- [ ] Solo hay `INSERT` — ningún `UPDATE`, `DELETE` ni DDL
- [ ] Ningún UUID escrito a mano
- [ ] Todos los `kind`, `status`, `area`, `priority`, `event_type` salen de los catálogos
- [ ] Las fechas están en `'YYYY-MM-DD'` y son reales, no relativas
- [ ] Al final hay un bloque con RESUMEN, SUPUESTOS y FALTA

---

## CÓMO PEGARLO EN HOG APP (paso a paso)

No necesitas saber SQL para esta parte — solo copiar, pegar y leer el
preview antes de decidir.

1. **Copia el bloque de SQL** que te dio la IA. Todo, desde `begin;` hasta el
   final de los comentarios que empiezan con `-- RESUMEN:`. Selecciónalo
   completo (en la mayoría de los chats hay un botón "copiar" en la esquina
   del bloque de código — úsalo para no dejar nada fuera).
2. **Abre HOG APP** e inicia sesión con tu cuenta (Master).
3. Busca, **abajo a la derecha de la pantalla**, un botón **verde
   fosforescente** con un rayo ⚡ que dice **SQL**. Solo tú lo ves — nadie más
   en el equipo tiene ese botón. Tócalo.
4. Se abre un panel con una caja de texto grande. **Pega ahí** el SQL que
   copiaste (clic dentro de la caja → pegar, o mantén presionado en el
   teléfono → Pegar).
5. Toca **Previsualizar**. Espera un par de segundos — la app está probando
   el SQL de verdad contra la base de datos (y deshaciéndolo automáticamente
   después, nada se guarda todavía). Te muestra una lista clara de lo que se
   crearía: proyectos, tareas, recursos y presupuesto, con los nombres de
   personas y venues ya resueltos — no código, cosas legibles como
   "Confirmar layout de mesas — Neto — 5 sep 2026".
6. **Revisa esa lista con calma** antes de seguir. Dos cosas a las que
   prestar atención (la app no las bloquea sola):
   - Si una tarea aparece **marcada en color ámbar**, va a quedar **sin
     asignar** — normalmente porque el correo de esa persona no coincide con
     ninguna cuenta de HOG APP. Puedes corregirlo editando el SQL en la
     misma caja de texto (cambia el correo) y volver a tocar Previsualizar.
   - Que el **venue** de cada proyecto/tarea sea el correcto.
7. Si editas el texto después de previsualizar, el botón de firmar se
   apaga solo — hay que volver a **Previsualizar** para poder firmar. Es
   intencional: nunca se firma algo que no se acaba de revisar.
8. Cuando todo se vea bien, toca **Firmar y aplicar**. Ahí sí queda guardado
   en HOG APP — ya puedes verlo en Proyectos o en Tareas.
9. Si te arrepientes después: dentro de la app, clic derecho sobre el
   proyecto o la tarea → **Archivar**. Nunca se borra nada por esta vía, así
   que siempre puedes deshacer el paso visualmente.

### Si el botón no aparece o algo falla

- **No ves el botón verde**: cierra sesión y vuelve a entrar. Si sigue sin
  aparecer, tu cuenta probablemente no tiene rol Master — eso lo ajusta quien
  administra HOG APP.
- **Un error al previsualizar**: el mensaje que sale es literal y suele decir
  exactamente qué está mal (un catálogo inválido, una tabla bloqueada, una
  columna que no existe). Pégaselo de vuelta a la IA junto con el SQL y pídele
  que lo corrija — casi siempre lo resuelve al primer intento.
- **Nada de lo que pase aquí rompe la app**: si el SQL falla, no se guarda
  nada. El peor caso es que tengas que volver a pedir el SQL.
