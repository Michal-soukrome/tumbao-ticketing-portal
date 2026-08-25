create or replace function public.cancel_pending_order(
  p_order_id uuid,
  p_access_token_hash text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
    from public.orders
   where id = p_order_id
     and access_token_hash = p_access_token_hash
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'PENDING' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
  end if;

  update public.orders
     set status = 'CANCELLED', cancelled_at = statement_timestamp()
   where id = v_order.id;

  delete from public.seat_allocations
   where order_id = v_order.id and status = 'HELD';
end;
$$;