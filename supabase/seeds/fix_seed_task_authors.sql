-- Autoría de tareas/planes sembrados por SQL (Bruma Records + demos):
-- quedaron con created_by NULL y el detalle de tarea no mostraba autor.
-- Asigna como autor a neto. Idempotente: solo toca filas sin autor.

update tasks t
set created_by = p.id
from profiles p
where p.email = 'neto@swells.mx'
  and t.created_by is null
  and t.event_id is not null;

update event_plans e
set created_by = p.id
from profiles p
where p.email = 'neto@swells.mx'
  and e.created_by is null;
