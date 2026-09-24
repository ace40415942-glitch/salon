-- ============================================================
--  صالون حسام | Supabase schema
--  نفّذ الملف كاملاً مرة وحدة من: Supabase > SQL Editor > New query > Run
--  يمكن إعادة تنفيذه بأمان (idempotent) بدون ما يمسح الحجوزات.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

set search_path = public, extensions;

-- ---------- الجداول ----------

create table if not exists public.settings (
  id    int primary key default 1 check (id = 1),
  data  jsonb not null
);

create table if not exists public.admin_secret (
  id         int primary key default 1 check (id = 1),
  pin_hash   text not null,
  fails      int not null default 0,
  last_fail  timestamptz
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 60),
  description   text not null default '' check (char_length(description) <= 160),
  price         numeric(8,2) not null check (price >= 0),
  duration_min  int not null check (duration_min between 10 and 240),
  sort          int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  image       text not null,               -- data:image/jpeg;base64,... (مضغوطة من المتصفح)
  caption     text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- الحجز = يوم + دقيقة البداية + دقيقة النهاية (من منتصف الليل، بتوقيت الصالون).
-- القيد no_overlap يمنع على مستوى القاعدة أي حجزين متداخلين بنفس اليوم،
-- حتى لو ضغط زبونين «احجز» بنفس اللحظة بالضبط.
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  day            date not null,
  start_min      int  not null check (start_min between 0 and 1439),
  end_min        int  not null check (end_min between 1 and 1440),
  service_id     uuid references public.services(id) on delete set null,
  service_name   text not null default '',
  price          numeric(8,2) not null default 0,
  customer_name  text not null default '',
  phone          text not null default '',
  note           text not null default '',
  status         text not null default 'confirmed'
                 check (status in ('confirmed','done','no_show','cancelled','blocked')),
  created_at     timestamptz not null default now(),
  check (end_min > start_min),
  constraint no_overlap exclude using gist (
    day with =,
    int4range(start_min, end_min) with &&
  ) where (status <> 'cancelled')
);

create index if not exists bookings_day_idx on public.bookings (day);
create index if not exists bookings_phone_idx on public.bookings (phone);

-- ---------- بيانات أولية ----------

insert into public.settings (id, data) values (1, jsonb_build_object(
  'salon_name',     'صالون حسام',
  'tagline',        'قصّات شبابية بإيد وحدة ثابتة',
  'phone',          '',
  'whatsapp',       '',
  'instagram',      '',
  'tiktok',         '',
  'address',        '',
  'maps_url',       '',
  'tz',             'Asia/Jerusalem',
  'slot_step',      30,
  'horizon_days',   14,
  'min_notice_min', 30,
  'max_active_per_phone', 2,
  'days_off',       '[]'::jsonb,
  'hours', jsonb_build_object(
    '0', jsonb_build_object('open','10:00','close','21:00','closed',false),
    '1', jsonb_build_object('open','10:00','close','21:00','closed',false),
    '2', jsonb_build_object('open','10:00','close','21:00','closed',false),
    '3', jsonb_build_object('open','10:00','close','21:00','closed',false),
    '4', jsonb_build_object('open','10:00','close','22:00','closed',false),
    '5', jsonb_build_object('open','13:00','close','22:00','closed',false),
    '6', jsonb_build_object('open','10:00','close','21:00','closed',false)
  )
)) on conflict (id) do nothing;

-- الرمز الأولي 4040 (غيّره أول ما تفوت على لوحة الإدارة > الإعدادات)
insert into public.admin_secret (id, pin_hash)
values (1, crypt('4040', gen_salt('bf')))
on conflict (id) do nothing;

insert into public.services (name, description, price, duration_min, sort)
select * from (values
  ('قصّة شعر',          'قص وتنسيق حسب شكل الوجه وتصفيف بالآخر', 50::numeric, 30, 1),
  ('قصّة + دقن',        'قصّة كاملة مع تحديد وتهذيب الدقن',       70::numeric, 45, 2),
  ('فيد (Skin Fade)',   'تدريج على الناعم من الصفر، شغل دقيق',     60::numeric, 45, 3),
  ('تحديد دقن',         'حلاقة وتحديد بالموس مع منشفة سخنة',      30::numeric, 20, 4),
  ('قصّة ولاد (تحت 12)', 'قصّة مرتبة للصغار',                      40::numeric, 30, 5),
  ('باكيج عريس',        'قصّة، دقن، تنظيف بشرة، واستشوار',        200::numeric, 90, 6)
) as v(name, description, price, duration_min, sort)
where not exists (select 1 from public.services);

-- ---------- الأمان (RLS) ----------
-- القراءة المباشرة مسموحة فقط للخدمات الفعّالة، المعرض، والإعدادات العامة.
-- الحجوزات والرمز السرّي مقفولين تماماً؛ كل شي يمر عبر الدوال تحت.

alter table public.settings     enable row level security;
alter table public.admin_secret enable row level security;
alter table public.services     enable row level security;
alter table public.gallery      enable row level security;
alter table public.bookings     enable row level security;

drop policy if exists "public read settings" on public.settings;
create policy "public read settings" on public.settings for select using (true);

drop policy if exists "public read services" on public.services;
create policy "public read services" on public.services for select using (active);

drop policy if exists "public read gallery" on public.gallery;
create policy "public read gallery" on public.gallery for select using (true);

revoke all on public.admin_secret from anon, authenticated;
revoke all on public.bookings     from anon, authenticated;

-- ---------- دوال مساعدة ----------

create or replace function public._now_local()
returns timestamp language sql stable
set search_path = public, extensions as $$
  select now() at time zone coalesce((select data->>'tz' from public.settings where id = 1), 'Asia/Jerusalem');
$$;

create or replace function public._hm(t text)
returns int language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int;
$$;

-- يتحقق من الرمز ويسجّل المحاولات الفاشلة (قفل 15 دقيقة بعد 8 محاولات غلط).
-- ما بيرمي exception عشان عدّاد المحاولات يضل محفوظ.
create or replace function public._pin_ok(p_pin text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare s public.admin_secret;
begin
  select * into s from public.admin_secret where id = 1 for update;
  if s is null then return false; end if;
  if s.fails >= 8 and s.last_fail > now() - interval '15 minutes' then
    return false;
  end if;
  if p_pin is not null and s.pin_hash = crypt(p_pin, s.pin_hash) then
    if s.fails > 0 then update public.admin_secret set fails = 0 where id = 1; end if;
    return true;
  end if;
  update public.admin_secret
     set fails = case when last_fail < now() - interval '15 minutes' then 1 else fails + 1 end,
         last_fail = now()
   where id = 1;
  return false;
end $$;

create or replace function public._new_code()
returns text language plpgsql volatile
set search_path = public, extensions as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where code = c);
  end loop;
  return c;
end $$;

create or replace function public._booking_json(b public.bookings)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'day', b.day, 'start_min', b.start_min, 'end_min', b.end_min,
    'service_id', b.service_id, 'service_name', b.service_name, 'price', b.price,
    'customer_name', b.customer_name, 'phone', b.phone, 'note', b.note,
    'status', b.status, 'created_at', b.created_at);
$$;

-- ---------- دوال عامة (الزبون) ----------

-- الأوقات المشغولة فقط، بدون أسماء أو أرقام.
create or replace function public.get_busy(p_from date, p_to date)
returns table (day date, start_min int, end_min int)
language sql stable security definer
set search_path = public, extensions as $$
  select b.day, b.start_min, b.end_min
    from public.bookings b
   where b.status <> 'cancelled'
     and b.day between p_from and least(p_to, p_from + 62)
   order by b.day, b.start_min;
$$;

create or replace function public.create_booking(
  p_service uuid, p_day date, p_start int, p_name text, p_phone text, p_note text default ''
) returns jsonb
language plpgsql security definer
set search_path = public, extensions as $$
declare
  st      jsonb;
  svc     public.services;
  h       jsonb;
  now_l   timestamp := public._now_local();
  today   date := now_l::date;
  now_min int := extract(hour from now_l)::int * 60 + extract(minute from now_l)::int;
  v_end   int;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_name  text := btrim(coalesce(p_name, ''));
  active_count int;
  b       public.bookings;
begin
  select data into st from public.settings where id = 1;
  select * into svc from public.services where id = p_service and active;
  if svc is null then return jsonb_build_object('error', 'BAD_SERVICE'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    return jsonb_build_object('error', 'BAD_NAME');
  end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 9 and 15 then
    return jsonb_build_object('error', 'BAD_PHONE');
  end if;
  if p_day < today or p_day > today + coalesce((st->>'horizon_days')::int, 14) then
    return jsonb_build_object('error', 'BAD_DAY');
  end if;
  if coalesce(st->'days_off', '[]'::jsonb) ? p_day::text then
    return jsonb_build_object('error', 'DAY_OFF');
  end if;
  h := st->'hours'->(extract(dow from p_day)::int::text);
  if h is null or coalesce((h->>'closed')::boolean, false) then
    return jsonb_build_object('error', 'DAY_OFF');
  end if;
  v_end := p_start + svc.duration_min;
  if p_start < public._hm(h->>'open') or v_end > public._hm(h->>'close') then
    return jsonb_build_object('error', 'OUT_OF_HOURS');
  end if;
  if p_day = today and p_start < now_min + coalesce((st->>'min_notice_min')::int, 0) then
    return jsonb_build_object('error', 'TOO_LATE');
  end if;

  select count(*) into active_count
    from public.bookings
   where phone = v_phone and status = 'confirmed'
     and (day > today or (day = today and end_min > now_min));
  if active_count >= coalesce((st->>'max_active_per_phone')::int, 2) then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;

  begin
    insert into public.bookings (code, day, start_min, end_min, service_id, service_name, price,
                                 customer_name, phone, note)
    values (public._new_code(), p_day, p_start, v_end, svc.id, svc.name, svc.price,
            v_name, v_phone, left(btrim(coalesce(p_note, '')), 200))
    returning * into b;
  exception when exclusion_violation then
    return jsonb_build_object('error', 'SLOT_TAKEN');
  end;

  return jsonb_build_object('ok', true, 'booking', jsonb_build_object(
    'code', b.code, 'day', b.day, 'start_min', b.start_min, 'end_min', b.end_min,
    'service_name', b.service_name, 'price', b.price, 'customer_name', b.customer_name));
end $$;

-- الزبون يلغي حجزه بالكود + رقم التلفون اللي حجز فيه.
create or replace function public.cancel_booking(p_code text, p_phone text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  now_l timestamp := public._now_local();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  n int;
begin
  update public.bookings
     set status = 'cancelled'
   where code = upper(btrim(p_code)) and phone = v_phone and status = 'confirmed'
     and (day > now_l::date or (day = now_l::date and start_min > extract(hour from now_l) * 60 + extract(minute from now_l)));
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- دوال الإدارة (كلها بتتحقق من الرمز داخل القاعدة) ----------

create or replace function public.admin_check_pin(p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if public._pin_ok(p_pin) then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('error', 'BAD_PIN');
end $$;

create or replace function public.admin_list_bookings(p_pin text, p_from date, p_to date)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  return jsonb_build_object('ok', true, 'bookings', coalesce((
    select jsonb_agg(public._booking_json(b) order by b.day, b.start_min)
      from public.bookings b
     where b.day between p_from and least(p_to, p_from + 400)), '[]'::jsonb));
end $$;

create or replace function public.admin_add_booking(p_pin text, p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare svc public.services; b public.bookings; v_status text := coalesce(p->>'status', 'confirmed');
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  if v_status not in ('confirmed', 'blocked') then v_status := 'confirmed'; end if;
  if nullif(p->>'service_id', '') is not null then
    select * into svc from public.services where id = (p->>'service_id')::uuid;
  end if;
  begin
    insert into public.bookings (code, day, start_min, end_min, service_id, service_name, price,
                                 customer_name, phone, note, status)
    values (public._new_code(), (p->>'day')::date, (p->>'start_min')::int, (p->>'end_min')::int,
            svc.id, coalesce(svc.name, ''), coalesce(svc.price, 0),
            left(coalesce(p->>'customer_name', ''), 60),
            regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'),
            left(coalesce(p->>'note', ''), 200), v_status)
    returning * into b;
  exception when exclusion_violation then
    return jsonb_build_object('error', 'SLOT_TAKEN');
  end;
  return jsonb_build_object('ok', true, 'booking', public._booking_json(b));
end $$;

create or replace function public.admin_set_status(p_pin text, p_id uuid, p_status text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  if p_status not in ('confirmed','done','no_show','cancelled') then
    return jsonb_build_object('error', 'BAD_STATUS');
  end if;
  begin
    update public.bookings set status = p_status where id = p_id;
  exception when exclusion_violation then
    return jsonb_build_object('error', 'SLOT_TAKEN');
  end;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_booking(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  delete from public.bookings where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_list_services(p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  return jsonb_build_object('ok', true, 'services', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sort, s.created_at) from public.services s), '[]'::jsonb));
end $$;

create or replace function public.admin_save_service(p_pin text, p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s public.services;
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  if nullif(p->>'id', '') is null then
    insert into public.services (name, description, price, duration_min, sort, active)
    values (btrim(p->>'name'), coalesce(btrim(p->>'description'), ''), (p->>'price')::numeric,
            (p->>'duration_min')::int,
            coalesce((p->>'sort')::int, (select coalesce(max(sort), 0) + 1 from public.services)),
            coalesce((p->>'active')::boolean, true))
    returning * into s;
  else
    update public.services set
      name = btrim(p->>'name'),
      description = coalesce(btrim(p->>'description'), ''),
      price = (p->>'price')::numeric,
      duration_min = (p->>'duration_min')::int,
      sort = coalesce((p->>'sort')::int, sort),
      active = coalesce((p->>'active')::boolean, active)
    where id = (p->>'id')::uuid
    returning * into s;
  end if;
  return jsonb_build_object('ok', true, 'service', to_jsonb(s));
exception when check_violation or not_null_violation or invalid_text_representation then
  return jsonb_build_object('error', 'BAD_INPUT');
end $$;

create or replace function public.admin_delete_service(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  delete from public.services where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_save_settings(p_pin text, p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare d jsonb;
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  update public.settings set data = data || p where id = 1 returning data into d;
  return jsonb_build_object('ok', true, 'settings', d);
end $$;

create or replace function public.admin_change_pin(p_pin text, p_new text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  if char_length(coalesce(p_new, '')) < 4 then return jsonb_build_object('error', 'PIN_SHORT'); end if;
  update public.admin_secret set pin_hash = crypt(p_new, gen_salt('bf')), fails = 0 where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_add_photo(p_pin text, p_image text, p_caption text default '')
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare g public.gallery;
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  if p_image not like 'data:image/%' or char_length(p_image) > 700000 then
    return jsonb_build_object('error', 'BAD_IMAGE');
  end if;
  insert into public.gallery (image, caption, sort)
  values (p_image, left(coalesce(p_caption, ''), 80), (select coalesce(max(sort), 0) + 1 from public.gallery))
  returning * into g;
  return jsonb_build_object('ok', true, 'photo', jsonb_build_object('id', g.id, 'image', g.image, 'caption', g.caption));
end $$;

create or replace function public.admin_delete_photo(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return jsonb_build_object('error', 'BAD_PIN'); end if;
  delete from public.gallery where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- الدوال الداخلية ممنوعة من الـ API
revoke execute on function public._pin_ok(text)          from public, anon, authenticated;
revoke execute on function public._new_code()            from public, anon, authenticated;
revoke execute on function public._booking_json(public.bookings) from public, anon, authenticated;

-- الدوال المسموحة من المتصفح
grant execute on function public.get_busy(date, date)                               to anon, authenticated;
grant execute on function public.create_booking(uuid, date, int, text, text, text)  to anon, authenticated;
grant execute on function public.cancel_booking(text, text)                         to anon, authenticated;
grant execute on function public.admin_check_pin(text)                              to anon, authenticated;
grant execute on function public.admin_list_bookings(text, date, date)              to anon, authenticated;
grant execute on function public.admin_add_booking(text, jsonb)                     to anon, authenticated;
grant execute on function public.admin_set_status(text, uuid, text)                 to anon, authenticated;
grant execute on function public.admin_delete_booking(text, uuid)                   to anon, authenticated;
grant execute on function public.admin_list_services(text)                          to anon, authenticated;
grant execute on function public.admin_save_service(text, jsonb)                    to anon, authenticated;
grant execute on function public.admin_delete_service(text, uuid)                   to anon, authenticated;
grant execute on function public.admin_save_settings(text, jsonb)                   to anon, authenticated;
grant execute on function public.admin_change_pin(text, text)                       to anon, authenticated;
grant execute on function public.admin_add_photo(text, text, text)                  to anon, authenticated;
grant execute on function public.admin_delete_photo(text, uuid)                     to anon, authenticated;
