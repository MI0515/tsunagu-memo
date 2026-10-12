-- つなぐメモ：表の定義
-- 日付はすべて「日本時間の日付」で扱う。

create extension if not exists pgcrypto with schema extensions;

-- 日本時間の今日
create or replace function public.jst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

-- ---------------------------------------------------------------
-- アプリ全体の設定（1行だけ）。公開範囲の段階や上限をここで切り替える
-- ---------------------------------------------------------------
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  is_demo boolean not null default false,
  -- ルーム作成に必要な「作成用コード」（ハッシュで保存。null なら誰も作成できない）
  creation_code_hash text,
  max_rooms_per_user int not null default 2,
  max_rooms_total int not null default 100,
  max_members_per_room int not null default 10,
  max_items_per_room_per_day int not null default 50,
  inactive_warn_days int not null default 150,
  inactive_cleanup_days int not null default 180,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------
-- ルームとメンバー
-- ---------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  created_by uuid references auth.users (id) on delete set null,
  member_limit int not null default 10 check (member_limit between 2 and 10),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index on public.room_members (user_id);
-- オーナーは1ルームに1人だけ
create unique index room_members_one_owner on public.room_members (room_id) where role = 'owner';

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.invites (room_id);

-- ---------------------------------------------------------------
-- チェック項目
--   once    : date の日だけ
--   daily   : 毎日
--   weekly  : weekdays（0=日〜6=土）の曜日
--   monthly : 毎月 month_day 日（その月にない日は月末）
-- 繰り返し項目を消すときは ends_on を入れて、過去の記録を残す
-- ---------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  kind text not null check (kind in ('once', 'daily', 'weekly', 'monthly')),
  date date,
  weekdays smallint[],
  month_day smallint check (month_day between 1 and 31),
  starts_on date not null default public.jst_today(),
  ends_on date,
  position int not null default 0,
  template_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'once' or date is not null),
  check (kind <> 'weekly' or (weekdays is not null and cardinality(weekdays) between 1 and 7
                              and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  check (kind <> 'monthly' or month_day is not null)
);
create index on public.items (room_id, kind, date);

-- スタンプは「項目 × 日付 × 人 × 種類」で1つ
create table public.stamps (
  item_id uuid not null references public.items (id) on delete cascade,
  date date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('check', 'eyes', 'pray', 'heart')),
  room_id uuid not null references public.rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, date, user_id, kind)
);
create index on public.stamps (room_id, date);

-- ふりかえりの⭐（ルーム × 日付）
create table public.day_stars (
  room_id uuid not null references public.rooms (id) on delete cascade,
  date date not null,
  starred_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, date)
);

-- ---------------------------------------------------------------
-- テンプレートと定型文
-- ---------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.templates (room_id);

alter table public.items
  add constraint items_template_id_fkey
  foreign key (template_id) references public.templates (id) on delete set null;

create table public.template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  position int not null default 0
);
create index on public.template_items (template_id);

-- 同じ日付には1回だけ展開する
create table public.template_expansions (
  room_id uuid not null references public.rooms (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  date date not null,
  expanded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (template_id, date)
);

create table public.phrases (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.phrases (room_id);

-- ---------------------------------------------------------------
-- 本人の引き継ぎ（ハッシュだけを保存する）
-- ---------------------------------------------------------------
create table public.restore_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table public.handoff_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);

-- 失敗回数の記録（総当たり対策）
create table public.attempt_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index on public.attempt_logs (actor, kind, created_at);

-- keep-alive の生存記録
create table public.heartbeats (
  id bigint generated always as identity primary key,
  source text not null,
  created_at timestamptz not null default now()
);
