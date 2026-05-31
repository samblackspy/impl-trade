-- impl.trade indexer schema. Idempotent: safe to run on every startup.
-- Chain-sourced rows are keyed by (signature, log_index) so re-ingesting is a no-op.

create table if not exists trades (
  signature     text    not null,
  log_index     int     not null,
  market_index  int     not null,
  trader        text    not null,
  is_long       boolean not null,
  is_close      boolean not null,
  base_amount   bigint  not null,  -- BASE_PRECISION
  quote_amount  bigint  not null,  -- QUOTE_PRECISION
  price         bigint  not null,  -- PRICE_PRECISION
  fee           bigint  not null,  -- QUOTE_PRECISION
  ts            bigint  not null,
  primary key (signature, log_index)
);
create index if not exists trades_market_ts on trades (market_index, ts);
create index if not exists trades_trader on trades (trader);

create table if not exists funding_rates (
  signature     text    not null,
  log_index     int     not null,
  market_index  int     not null,
  rate          numeric not null,  -- FUNDING_RATE_PRECISION (i128)
  cumulative    numeric not null,  -- i128
  mark_twap     bigint  not null,
  oracle_twap   bigint  not null,
  ts            bigint  not null,
  primary key (signature, log_index)
);
create index if not exists funding_market_ts on funding_rates (market_index, ts);

create table if not exists liquidations (
  signature     text    not null,
  log_index     int     not null,
  market_index  int     not null,
  trader        text    not null,
  liquidator    text    not null,
  base_closed   bigint  not null,
  liq_fee       bigint  not null,
  ts            bigint  not null,
  primary key (signature, log_index)
);
create index if not exists liquidations_market_ts on liquidations (market_index, ts);
