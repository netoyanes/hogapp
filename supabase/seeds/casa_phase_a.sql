-- ═════════════════════════════════════════════════════════════════════════════
-- HOG APP · LA CASA — Fase A (operación de piso / Heart of House)
-- · Rol nuevo HEART_OF_HOUSE (personal operativo de piso)
-- · Puestas a punto: plantillas de checklist por venue + ejecuciones diarias
--   con evidencia fotográfica y revisión del Ops Manager
-- · Inventario de mobiliario y hardware con bitácora de movimientos
-- · Incidencias con foto (el HoH reporta; Ops la convierte en tarea)
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Rol nuevo en profiles ───────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('MASTER','C_LEVEL','OPS_MANAGER','MARKETING','TEAM','HEART_OF_HOUSE'));

-- ─── Puestas a punto: plantillas ─────────────────────────────────────────────
create table if not exists public.venue_checklists (
  id          uuid primary key default gen_random_uuid(),
  bu_id       uuid not null references business_units(id) on delete cascade,
  name        text not null,                      -- "Apertura barra", "Cierre cocina"
  frequency   text not null default 'daily'
              check (frequency in ('daily','opening','closing','weekly')),
  active      boolean not null default true,
  sort        int not null default 0,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_vchk_bu on venue_checklists (bu_id, active);

create table if not exists public.venue_checklist_items (
  id             uuid primary key default gen_random_uuid(),
  checklist_id   uuid not null references venue_checklists(id) on delete cascade,
  label          text not null,                   -- "Barra limpia y montada"
  area           text,                            -- Barra, Cocina, Baños, Terraza…
  requires_photo boolean not null default false,
  sort           int not null default 0
);
create index if not exists idx_vchki_list on venue_checklist_items (checklist_id, sort);

-- ─── Puestas a punto: ejecuciones (una por checklist por día) ────────────────
create table if not exists public.checklist_runs (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references venue_checklists(id) on delete cascade,
  bu_id         uuid not null references business_units(id) on delete cascade,
  date          date not null default current_date,
  status        text not null default 'in_progress'
                check (status in ('in_progress','submitted','approved','returned')),
  started_by    uuid references profiles(id) on delete set null,
  submitted_at  timestamptz,
  reviewed_by   uuid references profiles(id) on delete set null,
  review_note   text,                             -- comentario al aprobar/regresar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (checklist_id, date)                     -- una ejecución por checklist por día
);
create index if not exists idx_crun_board on checklist_runs (bu_id, date);

create table if not exists public.checklist_run_items (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references checklist_runs(id) on delete cascade,
  item_id    uuid not null references venue_checklist_items(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','done','issue')),
  photo_url  text,
  note       text,                                -- obligatoria en la UI cuando status='issue'
  done_by    uuid references profiles(id) on delete set null,
  done_at    timestamptz,
  unique (run_id, item_id)
);
create index if not exists idx_crunitem_run on checklist_run_items (run_id);

-- ─── Inventario: mobiliario y hardware ───────────────────────────────────────
create table if not exists public.venue_assets (
  id            uuid primary key default gen_random_uuid(),
  bu_id         uuid not null references business_units(id) on delete cascade,
  folio         text,                             -- etiqueta física opcional
  name          text not null,                    -- "Bocina QSC K12", "Sillón terraza"
  category      text not null default 'MOBILIARIO'
                check (category in ('MOBILIARIO','HARDWARE_AV','COCINA','REFRIGERACION','COMPUTO','DECORACION','OTRO')),
  area          text,
  brand         text,
  model         text,
  serial        text,
  purchase_date date,
  cost          numeric,                          -- MXN
  condition     text not null default 'GOOD'
                check (condition in ('GOOD','FAIR','DAMAGED','REPAIR','RETIRED')),
  photo_url     text,
  notes         text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_vassets_bu on venue_assets (bu_id, category, condition);

-- Bitácora: cada cambio de estado / traslado / nota queda con autor y fecha
create table if not exists public.asset_events (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references venue_assets(id) on delete cascade,
  type        text not null check (type in ('created','condition','transfer','note')),
  from_value  text,
  to_value    text,
  note        text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_assetev on asset_events (asset_id, created_at desc);

-- ─── Incidencias (el pegamento con Tareas) ───────────────────────────────────
create table if not exists public.ops_incidents (
  id           uuid primary key default gen_random_uuid(),
  bu_id        uuid not null references business_units(id) on delete cascade,
  area         text,
  description  text not null,
  photo_url    text,
  status       text not null default 'open'
               check (status in ('open','task_created','resolved')),
  task_id      uuid references tasks(id) on delete set null,
  run_item_id  uuid references checklist_run_items(id) on delete set null, -- si nació de una puesta a punto
  reported_by  uuid references profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_incidents_board on ops_incidents (bu_id, status, created_at desc);

-- ─── Triggers updated_at ─────────────────────────────────────────────────────
drop trigger if exists trg_vchk_touch on venue_checklists;
create trigger trg_vchk_touch before update on venue_checklists
  for each row execute function touch_updated_at();
drop trigger if exists trg_crun_touch on checklist_runs;
create trigger trg_crun_touch before update on checklist_runs
  for each row execute function touch_updated_at();
drop trigger if exists trg_vassets_touch on venue_assets;
create trigger trg_vassets_touch before update on venue_assets
  for each row execute function touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Lectura: todos los roles de operación en SUS venues (Marketing fuera).
-- Escritura de plantillas e inventario: Ops/Master. Ejecuciones e incidencias:
-- también HEART_OF_HOUSE (es su trabajo diario). C_LEVEL: solo lectura.
alter table venue_checklists enable row level security;
alter table venue_checklist_items enable row level security;
alter table checklist_runs enable row level security;
alter table checklist_run_items enable row level security;
alter table venue_assets enable row level security;
alter table asset_events enable row level security;
alter table ops_incidents enable row level security;

drop policy if exists vchk_select on venue_checklists;
create policy vchk_select on venue_checklists for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));
drop policy if exists vchk_write on venue_checklists;
create policy vchk_write on venue_checklists for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists vchki_select on venue_checklist_items;
create policy vchki_select on venue_checklist_items for select to authenticated
  using (exists (select 1 from venue_checklists c where c.id = checklist_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(c.bu_id)));
drop policy if exists vchki_write on venue_checklist_items;
create policy vchki_write on venue_checklist_items for all to authenticated
  using (exists (select 1 from venue_checklists c where c.id = checklist_id
                 and hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(c.bu_id)))
  with check (exists (select 1 from venue_checklists c where c.id = checklist_id
                 and hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(c.bu_id)));

drop policy if exists crun_select on checklist_runs;
create policy crun_select on checklist_runs for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));
drop policy if exists crun_write on checklist_runs;
create policy crun_write on checklist_runs for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));

drop policy if exists cruni_select on checklist_run_items;
create policy cruni_select on checklist_run_items for select to authenticated
  using (exists (select 1 from checklist_runs r where r.id = run_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(r.bu_id)));
drop policy if exists cruni_write on checklist_run_items;
create policy cruni_write on checklist_run_items for all to authenticated
  using (exists (select 1 from checklist_runs r where r.id = run_id
                 and hog_role() in ('MASTER','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(r.bu_id)))
  with check (exists (select 1 from checklist_runs r where r.id = run_id
                 and hog_role() in ('MASTER','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(r.bu_id)));

drop policy if exists vassets_select on venue_assets;
create policy vassets_select on venue_assets for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));
drop policy if exists vassets_write on venue_assets;
create policy vassets_write on venue_assets for all to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));

drop policy if exists assetev_select on asset_events;
create policy assetev_select on asset_events for select to authenticated
  using (exists (select 1 from venue_assets a where a.id = asset_id
                 and hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(a.bu_id)));
drop policy if exists assetev_insert on asset_events;
create policy assetev_insert on asset_events for insert to authenticated
  with check (exists (select 1 from venue_assets a where a.id = asset_id
                 and hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(a.bu_id)));

drop policy if exists incid_select on ops_incidents;
create policy incid_select on ops_incidents for select to authenticated
  using (hog_role() in ('MASTER','C_LEVEL','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));
drop policy if exists incid_insert on ops_incidents;
create policy incid_insert on ops_incidents for insert to authenticated
  with check (hog_role() in ('MASTER','OPS_MANAGER','HEART_OF_HOUSE') and hog_has_venue(bu_id));
drop policy if exists incid_update on ops_incidents;
create policy incid_update on ops_incidents for update to authenticated
  using (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id))
  with check (hog_role() in ('MASTER','OPS_MANAGER') and hog_has_venue(bu_id));
