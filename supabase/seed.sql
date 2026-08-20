-- Placeholder geometry derived from map.jpg. Replace row counts/pricing only after
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

with layouts(section, row_count, seats_per_row, x, y, direction, category_id) as (
  values
    ('D', 5, 8, 145, 105, 'rtl', '00000000-0000-4000-8000-000000000102'::uuid),
    ('C', 5, 8, 335, 105, 'ltr', '00000000-0000-4000-8000-000000000101'::uuid),
    ('B', 5, 8, 525, 105, 'rtl', '00000000-0000-4000-8000-000000000101'::uuid),
    ('A', 5, 8, 715, 105, 'ltr', '00000000-0000-4000-8000-000000000102'::uuid),
    ('H', 4, 8, 145, 265, 'rtl', '00000000-0000-4000-8000-000000000102'::uuid),
    ('G', 4, 8, 335, 265, 'ltr', '00000000-0000-4000-8000-000000000101'::uuid),
    ('F', 4, 8, 525, 265, 'rtl', '00000000-0000-4000-8000-000000000101'::uuid),
    ('E', 4, 8, 715, 265, 'ltr', '00000000-0000-4000-8000-000000000102'::uuid),
    ('L', 3, 7, 165, 405, 'rtl', '00000000-0000-4000-8000-000000000103'::uuid),
    ('K', 3, 8, 335, 405, 'ltr', '00000000-0000-4000-8000-000000000103'::uuid),
    ('J', 3, 8, 525, 405, 'rtl', '00000000-0000-4000-8000-000000000103'::uuid),
    ('I', 3, 7, 715, 405, 'ltr', '00000000-0000-4000-8000-000000000103'::uuid)
), expanded as (
  select l.*, row_no, seat_index,
         case when direction = 'rtl' then seats_per_row - seat_index + 1 else seat_index end as display_number
    from layouts l
    cross join lateral generate_series(1, l.row_count) row_no
    cross join lateral generate_series(1, l.seats_per_row) seat_index
)
insert into public.seats(event_id, section, row_label, seat_number, price_category_id, pos_x, pos_y)
select '00000000-0000-4000-8000-000000000001', section, row_no::text, display_number::text,
       category_id, x + (seat_index - 1) * 20, y + (row_no - 1) * 24
  from expanded;
