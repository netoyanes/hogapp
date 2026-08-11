-- MI RESERVA · token único por reserva para el mini-link del cliente
-- (?mireserva=<token>): avisar retraso o cancelar. Idempotente. YA APLICADO.
alter table reservations add column if not exists manage_token uuid default gen_random_uuid();
update reservations set manage_token = gen_random_uuid() where manage_token is null;
create unique index if not exists idx_reservations_manage_token on reservations (manage_token);
