alter table public.businesses
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists tax_id text,
  add column if not exists currency_code text not null default 'INR' check (currency_code in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  add column if not exists tax_enabled boolean not null default true,
  add column if not exists default_tax_rate numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  add column if not exists prices_include_tax boolean not null default false,
  add column if not exists invoice_prefix text not null default 'INV-' check (char_length(trim(invoice_prefix)) between 1 and 12),
  add column if not exists invoice_footer text,
  add column if not exists payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 3650);
