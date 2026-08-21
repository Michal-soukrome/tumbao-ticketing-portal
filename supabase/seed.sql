-- Placeholder geometry for the interactive SVG plan. Replace row counts/pricing only after
-- the venue and organizer approve the authoritative inventory spreadsheet.

insert into public.events(id, name, event_date, venue, timezone, sales_open_at, sales_close_at)
values (
  '00000000-0000-4000-8000-000000000001',
  'Galavečer Tumbao 2027',
  '2027-05-29 19:00:00+02',
  'GoJa Music Hall, Prague',
  'Europe/Prague',
  '2026-01-01 00:00:00+01',
  '2027-05-29 18:30:00+02'
);

insert into public.price_categories(id, event_id, name, price_minor, currency, sort_order) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '1st category', 99000, 'CZK', 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', '2nd category', 79000, 'CZK', 2),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', '3rd category', 59000, 'CZK', 3);

with layouts(
  section, row_counts, row_x_offsets, x, y, direction, number_start,
  seat_dx, seat_dy, row_dx, row_dy, rotation, category_id
) as (
  values
    ('D', array[10,10,10,10,10,10,10], null::integer[], 205,  50, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000102'::uuid),
    ('C', array[10,10,10,10,10,10,10], null::integer[], 339,  50, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000101'::uuid),
    ('B', array[10,10,10,10,10,10,10], null::integer[], 459,  50, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000101'::uuid),
    ('A', array[10,10,10,10,10,10,10], null::integer[], 590,  50, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000102'::uuid),
    ('H', array[10,10,10,10,10,10,10], null::integer[], 205, 160, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000102'::uuid),
    ('G', array[10,10,10,10,10,10,10], null::integer[], 339, 160, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000101'::uuid),
    ('F', array[10,10,10,10,10,10,10], null::integer[], 459, 160, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000101'::uuid),
    ('E', array[10,10,10,10,10,10,10], null::integer[], 590, 160, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000102'::uuid),
    ('L', array[9,8,6,5], array[0,11,33,44], 215, 270, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000103'::uuid),
    ('K', array[10,10,10,10,10,10], null::integer[], 339, 270, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000103'::uuid),
    ('J', array[10,10,10,10,10,10], null::integer[], 459, 270, 'rtl', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000103'::uuid),
    ('I', array[9,8,6,5], null::integer[], 590, 270, 'ltr', 1, 11,  0,  0, 13,   0, '00000000-0000-4000-8000-000000000103'::uuid),
    ('M-left',  array[10,10,10,10,10,12], null::integer[],  61, 124, 'ltr', 1, 10,  3, -5, 13,  17, '00000000-0000-4000-8000-000000000103'::uuid),
    ('M-right', array[10,10,10,10,10,12], null::integer[], 748, 158, 'rtl', 1, 10, -3,  5, 13, -17, '00000000-0000-4000-8000-000000000103'::uuid)
), expanded as (
  select l.*, row_no, seat_index,
         case
           when direction = 'rtl' then number_start + row_counts[row_no] - seat_index
           else number_start + seat_index - 1
         end as display_number
    from layouts l
    cross join lateral generate_subscripts(l.row_counts, 1) rows(row_no)
    cross join lateral generate_series(1, l.row_counts[row_no]) seats(seat_index)
)
insert into public.seats(event_id, section, row_label, seat_number, price_category_id, pos_x, pos_y, rotation)
select '00000000-0000-4000-8000-000000000001', section, row_no::text, display_number::text,
       category_id,
       x + coalesce(row_x_offsets[row_no], (row_no - 1) * row_dx) + (seat_index - 1) * seat_dx,
       y + (row_no - 1) * row_dy + (seat_index - 1) * seat_dy,
       rotation
  from expanded;
