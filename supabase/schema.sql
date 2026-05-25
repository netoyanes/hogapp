-- HOG OPS · Supabase Schema · v0.1.0
-- Run these in order inside the Supabase SQL editor

-- ─── PROFILES ────────────────────────────────────────────────
create table if not exists profiles (
  id                   uuid references auth.users primary key,
  full_name            text,
  last_name            text,
  email                text unique,
  role                 text check (role in ('MASTER','OPS_MANAGER','MARKETING','TEAM')),
  address              text,
  birth_date           date,
  avatar_url           text,
  onboarding_completed boolean default false,
  created_at           timestamptz default now()
);

-- Auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, onboarding_completed)
  values (new.id, new.email, 'TEAM', false);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── BUSINESS UNITS ──────────────────────────────────────────
create table if not exists business_units (
  id                       uuid primary key default gen_random_uuid(),
  code                     text unique not null,
  name                     text not null,
  category                 text,
  location                 text,
  brief                    text,
  tone_of_voice            text,
  content_strategy         text,
  project_phase            text,
  revenue_health           text,
  communication_objective  text,
  figma_link               text,
  drive_link               text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ─── MARKETING HEALTH SCORES ─────────────────────────────────
create table if not exists marketing_scores (
  id            uuid primary key default gen_random_uuid(),
  bu_id         uuid references business_units(id),
  week_start    date not null,
  week_end      date not null,
  score_a       int check (score_a between 0 and 25),
  score_b       int check (score_b between 0 and 20),
  score_c       int check (score_c between 0 and 15),
  score_d       int check (score_d between 0 and 30),
  score_e       int check (score_e between 0 and 10),
  total_score   int generated always as
                  (score_a + score_b + score_c + score_d + score_e) stored,
  health_status text generated always as (
    case
      when (score_a+score_b+score_c+score_d+score_e) >= 80 then 'HEALTHY'
      when (score_a+score_b+score_c+score_d+score_e) >= 60 then 'ATTENTION'
      when (score_a+score_b+score_c+score_d+score_e) >  0  then 'AT_RISK'
      else 'NO_DATA'
    end
  ) stored,
  notes         text,
  scored_by     uuid references profiles(id),
  created_at    timestamptz default now()
);

-- ─── REVENUE CSV UPLOADS ─────────────────────────────────────
create table if not exists revenue_entries (
  id           uuid primary key default gen_random_uuid(),
  bu_code      text references business_units(code),
  week_start   date not null,
  week_end     date not null,
  revenue      numeric,
  currency     text default 'MXN',
  notes        text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz default now()
);

-- ─── TASKS ───────────────────────────────────────────────────
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  type             text check (type in ('MAINTENANCE','HARDWARE','REPORT','CONTENT','PROJECT')),
  bu_id            uuid references business_units(id),
  priority         text check (priority in ('HIGH','MEDIUM','LOW')),
  status           text check (status in ('OPEN','IN_PROGRESS','PROOF_SUBMITTED','APPROVED','REVISION'))
                   default 'OPEN',
  assigned_to      uuid references profiles(id),
  created_by       uuid references profiles(id),
  due_date         date,
  proof_required   boolean default false,
  deadline_type    text check (deadline_type in ('HARD','SOFT')) default 'SOFT',
  estimated_hours  numeric,
  completed_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─── TASK PROOFS ─────────────────────────────────────────────
create table if not exists task_proofs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references tasks(id),
  file_url     text,
  file_type    text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz default now()
);

-- ─── TASK COMMENTS ───────────────────────────────────────────
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks(id),
  author_id  uuid references profiles(id),
  content    text not null,
  created_at timestamptz default now()
);

-- ─── BU ONBOARDING SCORING ───────────────────────────────────
create table if not exists bu_onboarding (
  id                           uuid primary key default gen_random_uuid(),
  bu_id                        uuid references business_units(id) unique,
  publishes_per_week           int,
  content_is_on_strategy       text check (content_is_on_strategy in ('YES','PARTIALLY','NO')),
  has_brand_brief              boolean,
  has_content_pillars          boolean,
  has_moodboard                boolean,
  has_communication_objective  boolean,
  has_active_assets            boolean,
  has_overdue_assets           boolean,
  revenue_trend                text check (revenue_trend in ('GROWING','STABLE','DECLINING','FREEFALL','NO_DATA')),
  engagement_level             text check (engagement_level in ('HIGH','MEDIUM','LOW','NO_DATA')),
  instagram_handle             text,
  facebook_page                text,
  whatsapp_number              text,
  meta_pixel_id                text,
  primary_channel              text,
  monthly_content_budget       numeric,
  notes                        text,
  completed_by                 uuid references profiles(id),
  completed_at                 timestamptz default now()
);

-- ─── APP CHANGELOG ───────────────────────────────────────────
create table if not exists changelog (
  id           uuid primary key default gen_random_uuid(),
  version      text not null,
  release_date date not null,
  type         text check (type in ('MAJOR','MINOR','PATCH')),
  changes      text[] not null,
  created_at   timestamptz default now()
);

-- ─── SEED — 14 BUSINESS UNITS ────────────────────────────────
insert into business_units (code, name, category, location, project_phase, revenue_health, communication_objective, tone_of_voice, figma_link) values
  ('AJ',    'Ajeno',          'Bar / Restaurante',        'Roma, CDMX',             'Madurez / Mantenimiento', 'Estable',       'Engagement / Comunidad', 'Creativo, amigable, audaz, excéntrico, groovie', 'https://www.figma.com/board/D5oHMrJ4WfLW3Fx0d2y7hX/HOG---Marketing?node-id=20-523'),
  ('CT',    'Calmabytonic',   'Wellness · Float',         'CDMX',                   'Crecimiento Activo',      'Sin datos',     'Conversión / Ventas',    'Calmado, dulce, suave, minimalista, sensorial', null),
  ('BM',    'Bruma MZT',      'Nightlife',                'Mazatlán',               'Crecimiento Activo',      'En Caída Libre', null,                    null, null),
  ('BR',    'Bruma Records',  'Nightlife',                'CDMX',                   'Onboarding',              'Creciendo',     'Engagement / Comunidad', null, null),
  ('PC',    'POD Condesa',    'Hybrid Lifestyle Space',   'Hipódromo Condesa, CDMX','Lanzamiento',             'Sin datos',     null,                    'Sofisticado, aspiracional, sensorial, curado', null),
  ('PM',    'POD Mazatlan',   'Hybrid Space',             'Mazatlán',               'Sin fase',                'Sin datos',     null,                    null, null),
  ('AR',    'Apricot ROMA',   'Restaurante',              'Roma, CDMX',             'Crecimiento Activo',      'Sin datos',     null,                    null, null),
  ('AM',    'Apricot MZT',    'Restaurante',              'Mazatlán',               'Crecimiento Activo',      'Sin datos',     null,                    null, null),
  ('ET',    'Eterno',         'Bar',                      'CDMX',                   'Lanzamiento',             'Sin datos',     null,                    null, null),
  ('AC',    'Amorcafemx',     'Café B2B',                 'CDMX',                   'Diagnóstico',             'Sin datos',     'Posicionamiento',        null, null),
  ('CM',    'Cafesca_mx',     'Café Retail',              'CDMX',                   'Diagnóstico',             'Sin datos',     null,                    null, null),
  ('CC',    'Casa Coyote',    'Hotel Boutique',           'Hermosillo, Sonora',     'Onboarding',              'Creciendo',     'Posicionamiento',        'Auténtico, relajado, creativo, orgulloso del norte, poético', null),
  ('TONIC', 'TONIC IV',       'Wellness IV',              'Mazatlán',               'Sin fase',                'Sin datos',     null,                    null, null),
  ('HG',    'HOG',            'Corporativo',              'CDMX / MZT',             'Interno',                 '—',             null,                    null, null)
on conflict (code) do nothing;

-- ─── SEED — v0.1.0 changelog entry ───────────────────────────
insert into changelog (version, release_date, type, changes) values (
  '0.1.0',
  '2026-05-25',
  'MINOR',
  array[
    'Initial build — Supabase schema, auth, user onboarding',
    '14 Business Units seeded from spec data',
    'Master Dashboard with BU Health Grid (14 cards)',
    'BU Onboarding Scoring Form — all 5 dimensions with live preview',
    'Health Score Engine — A/B/C/D/E dimensions',
    'Version badge + Changelog modal',
    'Role-based auth (MASTER / OPS_MANAGER / MARKETING / TEAM)',
    'Full design system — Geist fonts, green accent, dark base'
  ]
) on conflict do nothing;

-- ─── RLS POLICIES ────────────────────────────────────────────
-- Enable RLS on all tables
alter table profiles enable row level security;
alter table business_units enable row level security;
alter table marketing_scores enable row level security;
alter table revenue_entries enable row level security;
alter table tasks enable row level security;
alter table task_proofs enable row level security;
alter table task_comments enable row level security;
alter table bu_onboarding enable row level security;
alter table changelog enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Business units: all authenticated users can read
create policy "Authenticated users can read BUs" on business_units for select using (auth.role() = 'authenticated');

-- Marketing scores: authenticated read
create policy "Authenticated users can read scores" on marketing_scores for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert scores" on marketing_scores for insert with check (auth.role() = 'authenticated');

-- BU onboarding: authenticated read/write
create policy "Authenticated users can read onboarding" on bu_onboarding for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert onboarding" on bu_onboarding for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update onboarding" on bu_onboarding for update using (auth.role() = 'authenticated');

-- Changelog: all authenticated read
create policy "Authenticated users can read changelog" on changelog for select using (auth.role() = 'authenticated');

-- Tasks: authenticated read
create policy "Authenticated users can read tasks" on tasks for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert tasks" on tasks for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update tasks" on tasks for update using (auth.role() = 'authenticated');

-- Task comments: authenticated read/write
create policy "Authenticated users can read comments" on task_comments for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert comments" on task_comments for insert with check (auth.role() = 'authenticated');

-- Task proofs: authenticated read/write
create policy "Authenticated users can read proofs" on task_proofs for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert proofs" on task_proofs for insert with check (auth.role() = 'authenticated');

-- Revenue entries: authenticated read
create policy "Authenticated users can read revenue" on revenue_entries for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert revenue" on revenue_entries for insert with check (auth.role() = 'authenticated');
