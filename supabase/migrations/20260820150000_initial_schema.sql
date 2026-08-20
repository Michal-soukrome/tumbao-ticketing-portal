-- Galavečer Tumbao 2027 production schema.
-- Mutable seat ownership lives only in seat_allocations.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema extensions;

create sequence public.order_seq;

create type public.order_status as enum ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'RECONCILIATION_REQUIRED');
create type public.allocation_status as enum ('HELD', 'SOLD');
create type public.payment_status as enum ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'RECONCILIATION_REQUIRED');
create type public.refund_status as enum ('REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED');
create type public.ticket_status as enum ('VALID', 'CHECKED_IN', 'VOID');
create type public.admin_role as enum ('ADMIN', 'SCANNER');
create type public.outbox_status as enum ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date timestamptz not null,
  venue text not null,
  timezone text not null default 'Europe/Prague',
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  created_at timestamptz not null default now(),
  check (sales_close_at is null or sales_open_at is null or sales_close_at > sales_open_at)
);

create table public.price_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'CZK',
  sort_order integer not null default 0,
  unique (event_id, name)
);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  section text not null,
  row_label text not null,
  seat_number text not null,
  price_category_id uuid not null references public.price_categories(id),
  pos_x numeric not null,
  pos_y numeric not null,
  rotation numeric not null default 0,
  is_accessible boolean not null default false,
  is_active boolean not null default true,
  unique (event_id, section, row_label, seat_number)
);

create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.admin_role not null default 'ADMIN',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  order_number text not null unique,
  session_id_hash text not null,
  access_token_hash text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  billing_company text,
  billing_address jsonb,
  billing_tax_id text,
  total_minor bigint not null default 0 check (total_minor >= 0),
  currency char(3) not null,
  status public.order_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  check (expires_at > created_at)
);

create table public.order_seats (
  order_id uuid not null references public.orders(id) on delete cascade,
  seat_id uuid not null references public.seats(id),
  price_category_name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null,
  primary key (order_id, seat_id)
);

create table public.seat_allocations (
  seat_id uuid primary key references public.seats(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.allocation_status not null,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'HELD' and hold_expires_at is not null) or (status = 'SOLD' and hold_expires_at is null))
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('gopay', 'comgate')),
  status public.payment_status not null default 'CREATED',
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  idempotency_key uuid not null default gen_random_uuid() unique,
  provider_ref text,
  provider_status text,
  redirect_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  failure_code text,
  failure_message text
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payment_attempt_id uuid references public.payment_attempts(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_event_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  seat_id uuid not null references public.seats(id),
  ticket_code text not null unique,
  qr_token text not null unique,
  status public.ticket_status not null default 'VALID',
  checked_in_at timestamptz,
  checked_in_by uuid references public.admin_users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'CHECKED_IN' and checked_in_at is not null) or status <> 'CHECKED_IN'),
  check ((status = 'VOID' and voided_at is not null) or status <> 'VOID')
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_attempt_id uuid references public.payment_attempts(id),
  provider text not null,
  provider_ref text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  status public.refund_status not null default 'REQUESTED',
  reason text,
  requested_by uuid references public.admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null unique,
  order_id uuid references public.orders(id),
  recipient text not null,
  payload jsonb not null,
  status public.outbox_status not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid references public.admin_users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_seats_event on public.seats(event_id);
create index idx_seats_price_category on public.seats(price_category_id);
create index idx_orders_status_expiry on public.orders(status, expires_at);
create index idx_orders_customer_email on public.orders(lower(customer_email));
create index idx_order_seats_seat on public.order_seats(seat_id);
create index idx_allocations_order on public.seat_allocations(order_id);
create index idx_allocations_expiry on public.seat_allocations(hold_expires_at) where status = 'HELD';
create index idx_payment_attempts_order on public.payment_attempts(order_id);
create unique index uq_payment_provider_ref on public.payment_attempts(provider, provider_ref) where provider_ref is not null;
create unique index uq_active_ticket_per_seat on public.tickets(seat_id) where status in ('VALID', 'CHECKED_IN');
create index idx_tickets_order on public.tickets(order_id);
create index idx_refunds_order on public.refunds(order_id);
create index idx_outbox_ready on public.email_outbox(status, next_attempt_at) where status in ('PENDING', 'FAILED');
create index idx_audit_entity on public.admin_audit_log(entity_type, entity_id, created_at desc);

comment on table public.seat_allocations is 'Sole authority for current seat ownership: no row=AVAILABLE, HELD=temporary, SOLD=purchased.';
comment on table public.order_seats is 'Immutable price/history snapshot; rows do not imply current ownership.';
comment on column public.orders.access_token_hash is 'SHA-256 or stronger one-way hash; raw public token is never stored.';
comment on column public.tickets.qr_token is 'High-entropy bearer token protected by RLS and purpose-specific APIs.';

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'events','price_categories','seats','admin_users','orders','order_seats','seat_allocations',
    'payment_attempts','payment_events','tickets','refunds','email_outbox','admin_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- No anon/authenticated core-table policies are intentional. All access is through
-- purpose-specific Edge Functions using the server-side service role.
revoke all on all tables in schema public from anon, authenticated;
revoke all on sequence public.order_seq from anon, authenticated;

create or replace function public.reserve_seats(
  p_event_id uuid,
  p_seat_ids uuid[],
  p_session_id_hash text,
  p_access_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.events%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_expires_at timestamptz := statement_timestamp() + interval '10 minutes';
  v_seat_count integer;
  v_total_minor bigint;
  v_currency char(3);
  v_unavailable uuid[];
  v_seats jsonb;
begin
  if p_event_id is null or p_seat_ids is null or cardinality(p_seat_ids) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if nullif(p_session_id_hash, '') is null or nullif(p_access_token_hash, '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if cardinality(p_seat_ids) <> (select count(distinct value) from unnest(p_seat_ids) as ids(value)) then
    raise exception using errcode = '22023', message = 'DUPLICATE_SEAT_IDS';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or (v_event.sales_open_at is not null and v_event.sales_open_at > statement_timestamp())
    or (v_event.sales_close_at is not null and v_event.sales_close_at <= statement_timestamp()) then
    raise exception using errcode = 'P0001', message = 'EVENT_NOT_ON_SALE';
  end if;

  -- Stable row order makes overlapping multi-seat requests serialize without deadlocks.
  perform 1 from public.seats
   where id = any(p_seat_ids) and event_id = p_event_id and is_active
   order by id for update;

  select count(*) into v_seat_count from public.seats
   where id = any(p_seat_ids) and event_id = p_event_id and is_active;
  if v_seat_count <> cardinality(p_seat_ids) then
    raise exception using errcode = '22023', message = 'INVALID_SEAT';
  end if;

  delete from public.seat_allocations
   where seat_id = any(p_seat_ids) and status = 'HELD' and hold_expires_at <= statement_timestamp();

  select array_agg(seat_id order by seat_id) into v_unavailable
    from public.seat_allocations where seat_id = any(p_seat_ids);
  if cardinality(v_unavailable) > 0 then
    raise exception using errcode = 'P0001', message = 'SEAT_UNAVAILABLE', detail = array_to_string(v_unavailable, ',');
  end if;

  select sum(pc.price_minor), min(pc.currency),
         jsonb_agg(jsonb_build_object(
           'seat_id', s.id,
           'section', s.section,
           'row_label', s.row_label,
           'seat_number', s.seat_number,
           'price_category_name', pc.name,
           'price_minor', pc.price_minor,
           'currency', pc.currency
         ) order by s.section, s.row_label, s.seat_number)
    into v_total_minor, v_currency, v_seats
    from public.seats s join public.price_categories pc on pc.id = s.price_category_id
   where s.id = any(p_seat_ids);

  if (select count(distinct pc.currency) from public.seats s join public.price_categories pc on pc.id = s.price_category_id where s.id = any(p_seat_ids)) <> 1 then
    raise exception using errcode = 'P0001', message = 'MIXED_CURRENCY';
  end if;

  v_order_number := 'TUM-' || to_char(statement_timestamp(), 'YYYY') || '-' || lpad(nextval('public.order_seq')::text, 5, '0');
  insert into public.orders(id, event_id, order_number, session_id_hash, access_token_hash, total_minor, currency, expires_at)
  values (v_order_id, p_event_id, v_order_number, p_session_id_hash, p_access_token_hash, v_total_minor, v_currency, v_expires_at);

  insert into public.order_seats(order_id, seat_id, price_category_name, price_minor, currency)
  select v_order_id, s.id, pc.name, pc.price_minor, pc.currency
    from public.seats s join public.price_categories pc on pc.id = s.price_category_id
   where s.id = any(p_seat_ids);

  insert into public.seat_allocations(seat_id, order_id, status, hold_expires_at)
  select seat_id, v_order_id, 'HELD', v_expires_at from unnest(p_seat_ids) seat_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'expires_at', v_expires_at,
    'total_minor', v_total_minor,
    'currency', v_currency,
    'seats', v_seats
  );
end;
$$;

create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  with expired as (
    update public.orders
       set status = 'EXPIRED'
     where status = 'PENDING' and expires_at <= statement_timestamp()
     returning id
  ), released as (
    delete from public.seat_allocations a using expired e
     where a.order_id = e.id and a.status = 'HELD'
     returning a.seat_id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

create or replace function public.get_public_seat_map(p_event_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with selected_event as (
    select e.* from public.events e
     where e.id = coalesce(p_event_id, (select id from public.events order by event_date limit 1))
     limit 1
  ), seat_data as (
    select s.id, s.section, s.row_label, s.seat_number, pc.name as price_category,
           pc.price_minor, pc.currency, s.pos_x, s.pos_y, s.rotation, s.is_accessible,
           coalesce(a.status::text, 'AVAILABLE') as status,
           case when a.status = 'HELD' then a.hold_expires_at end as hold_expires_at
      from public.seats s
      join selected_event e on e.id = s.event_id
      join public.price_categories pc on pc.id = s.price_category_id
      left join public.seat_allocations a on a.seat_id = s.id
       and (a.status = 'SOLD' or a.hold_expires_at > statement_timestamp())
     where s.is_active
  )
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'event_date', e.event_date, 'venue', e.venue,
      'timezone', e.timezone, 'currency', coalesce((select currency from seat_data limit 1), 'CZK')
    ),
    'seats', coalesce((select jsonb_agg(to_jsonb(seat_data) order by section, row_label, seat_number) from seat_data), '[]'::jsonb),
    'server_time', statement_timestamp()
  ) from selected_event e;
$$;

revoke execute on function public.reserve_seats(uuid, uuid[], text, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders() from public, anon, authenticated;
revoke execute on function public.get_public_seat_map(uuid) from public, anon, authenticated;
grant execute on function public.reserve_seats(uuid, uuid[], text, text) to service_role;
grant execute on function public.expire_stale_orders() to service_role, postgres;
grant execute on function public.get_public_seat_map(uuid) to service_role;

select cron.schedule(
  'expire-stale-ticket-orders',
  '30 seconds',
  $$select public.expire_stale_orders()$$
);
