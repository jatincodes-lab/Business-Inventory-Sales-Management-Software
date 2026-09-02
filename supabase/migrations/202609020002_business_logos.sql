alter table public.businesses
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do update set public = true;
