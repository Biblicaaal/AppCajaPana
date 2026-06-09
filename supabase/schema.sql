create table if not exists public.mp_sales (
  external_reference text primary key,
  local_sale_id text,
  amount numeric not null default 0,
  status text not null default 'pending',
  payment_id text,
  preference_id text,
  items jsonb not null default '[]'::jsonb,
  business_date text,
  shift_type text,
  approved_at timestamptz,
  raw_payment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_sales enable row level security;

drop policy if exists "mp_sales_read_anon" on public.mp_sales;
create policy "mp_sales_read_anon"
on public.mp_sales for select
to anon
using (true);
