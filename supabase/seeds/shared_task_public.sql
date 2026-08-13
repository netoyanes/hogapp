-- ─────────────────────────────────────────────────────────────────────────────
-- Tarea compartida PÚBLICA (?share=<id>): cualquiera con el link ve el
-- contenido de la tarea, con o sin sesión. El UUID de la tarea es la llave
-- (no adivinable). Reglas:
--   · Las tareas PRIVADAS (is_private) nunca se exponen — devuelve {private}.
--   · El chat interno NO se incluye a propósito (conversación del equipo);
--     solo el CONTEO de mensajes, para invitar a entrar a HOG APP.
--   · Cada vista queda en activity_log (usuario logueado o "anónimo").
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_shared_task(p_task uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tasks%rowtype;
  v jsonb;
begin
  select * into t from tasks where id = p_task;
  if not found then return null; end if;
  if t.is_private then return jsonb_build_object('private', true); end if;

  v := jsonb_build_object(
    'task', jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'area', t.area,
      'status', t.status, 'priority', t.priority, 'due_date', t.due_date,
      'estimated_hours', t.estimated_hours, 'deadline_type', t.deadline_type,
      'proof_required', t.proof_required, 'bu_id', t.bu_id, 'assigned_to', t.assigned_to
    ),
    'bu', (select jsonb_build_object('code', b.code, 'name', b.name)
           from business_units b where b.id = t.bu_id),
    'assignee', (select coalesce(p.full_name, p.email)
                 from profiles p where p.id = t.assigned_to),
    'proofs', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'file_url', pr.file_url,
                                          'file_type', pr.file_type, 'created_at', pr.created_at)
                       order by pr.created_at)
      from task_proofs pr where pr.task_id = t.id and coalesce(pr.archived, false) = false
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'title', l.title)
                       order by l.created_at)
      from task_links l where l.task_id = t.id and coalesce(l.archived, false) = false
    ), '[]'::jsonb),
    -- Solo el conteo: el contenido del chat es interno del equipo
    'comment_count', (select count(*) from task_comments c where c.task_id = t.id)
  );

  insert into activity_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'task_viewed_externally', 'task', p_task,
          jsonb_build_object('title', t.title,
            'viewer', coalesce((select pf.email from profiles pf where pf.id = auth.uid()), 'anónimo')));

  return v;
end
$$;

revoke all on function public.fn_shared_task(uuid) from public;
grant execute on function public.fn_shared_task(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
