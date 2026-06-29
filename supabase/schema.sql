-- AstraQuant CryptoFX v20 Supabase schema
-- Jalankan file ini di Supabase SQL Editor sebelum deploy.

create extension if not exists pgcrypto;

create table if not exists public.aq_crypto_fx_live_assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  asset_type text,
  display text,
  provider text,
  source text,
  price numeric,
  change_pct numeric,
  volume numeric,
  bid numeric,
  ask numeric,
  spread_pct numeric,
  market_cap numeric,
  rank int,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists aq_crypto_fx_live_assets_type_idx on public.aq_crypto_fx_live_assets(asset_type);
create index if not exists aq_crypto_fx_live_assets_updated_idx on public.aq_crypto_fx_live_assets(updated_at desc);
create index if not exists aq_crypto_fx_live_assets_rank_idx on public.aq_crypto_fx_live_assets(rank);

create table if not exists public.aq_crypto_fx_signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  asset_type text,
  display text,
  provider text,
  source text,
  price numeric,
  change_pct numeric,
  volume numeric,
  ai_score numeric,
  direction text,
  status text,
  entry numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_pct numeric,
  reward_pct numeric,
  horizon text,
  valid_for text,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists aq_crypto_fx_signals_score_idx on public.aq_crypto_fx_signals(ai_score desc);
create index if not exists aq_crypto_fx_signals_status_idx on public.aq_crypto_fx_signals(status);
create index if not exists aq_crypto_fx_signals_updated_idx on public.aq_crypto_fx_signals(updated_at desc);

create table if not exists public.aq_crypto_fx_scan_runs (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz not null default now(),
  mode text,
  signal_count int default 0,
  active_count int default 0,
  watchlist_count int default 0,
  best_symbol text,
  summary jsonb not null default '{}'::jsonb,
  providers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists aq_crypto_fx_scan_runs_scanned_idx on public.aq_crypto_fx_scan_runs(scanned_at desc);
create index if not exists aq_crypto_fx_scan_runs_best_idx on public.aq_crypto_fx_scan_runs(best_symbol);

-- Optional: kalau kamu nanti mau public read langsung dari frontend, buat policy khusus.
-- Versi ini TIDAK butuh public policy karena server membaca/menulis memakai service role key.
