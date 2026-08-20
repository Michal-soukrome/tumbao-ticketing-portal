begin;
select plan(8);

select has_table('public', 'seat_allocations', 'seat allocation authority exists');
select col_is_pk('public', 'seat_allocations', 'seat_id', 'one current allocation per seat is enforced by the primary key');
select has_function('public', 'reserve_seats', array['uuid', 'uuid[]', 'text', 'text'], 'reservation transaction exists');
select has_function('public', 'expire_stale_orders', array[]::text[], 'expiry transaction exists');
select has_function('public', 'get_public_seat_map', array['uuid'], 'sanitized read function exists');
select row_security_active('public', 'orders', 'orders RLS is enabled');
select row_security_active('public', 'tickets', 'tickets RLS is enabled');
select row_security_active('public', 'seat_allocations', 'allocations RLS is enabled');

select * from finish();
rollback;
