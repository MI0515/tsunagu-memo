import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'

const dir = process.argv[2]
// AUTO_EXPOSE=off で「新しいテーブルを自動的に公開する」がOFFのプロジェクトを再現する
const autoExpose = process.env.AUTO_EXPOSE !== 'off'
console.log(`Supabase設定の再現：自動公開=${autoExpose ? 'ON' : 'OFF'}、自動RLS=ON`)
const db = new PGlite({ extensions: { pgcrypto } })

// Supabase に似せた最小限の土台
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, is_anonymous boolean default true, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create publication supabase_realtime;

  -- 自動RLS：public に表ができたら RLS をONにする
  create function public._auto_rls() returns event_trigger language plpgsql as $$
  declare r record;
  begin
    for r in select * from pg_event_trigger_ddl_commands()
             where command_tag = 'CREATE TABLE' and schema_name = 'public' loop
      execute format('alter table %s enable row level security', r.object_identity);
    end loop;
  end $$;
  create event trigger auto_rls on ddl_command_end execute function public._auto_rls();
`)
if (autoExpose) {
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
}

// --- テスト用の人と、便利な関数
const U = {}
for (const [i, k] of ['A', 'B', 'C', 'A2', 'D', 'E', 'F', 'G', 'H', 'L1', 'L2'].entries())
  U[k] = `00000000-0000-0000-0000-${(i + 1).toString(16).padStart(12, '0')}`
await db.exec(`insert into auth.users (id) values ${Object.values(U).map(u => `('${u}')`).join(',')};`)

let fails = 0
const as = async (user, sql, params = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows }
  finally { await db.exec('reset role') }
}
const check = (name, cond, extra) => {
  console.log(cond ? '  ok  ' : '  NG  ', name, cond ? '' : JSON.stringify(extra))
  if (!cond) fails++
}
const rpc = async (user, fn, args) => (await as(user, `select public.${fn}(${args}) as r`))[0].r
const expectErr = async (name, p) => { try { await p; check(name, false, 'no error') } catch { check(name, true) } }
const admin = async (sql, params = []) => (await db.query(sql, params)).rows
const count = async (sql, params = []) => (await admin(`select count(*)::int c from (${sql}) x`, params))[0].c

// --- 設計図を順に入れる。古い設計図の段階で、demo と同じように既存のルームを作っておく
let legacyRoom
for (const f of readdirSync(dir).sort()) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')) }
  catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1) }
  console.log('applied', f)
  if (f.startsWith('20261012000003')) {
    await db.exec(`update public.app_settings set creation_code_hash = extensions.crypt('secret-code', extensions.gen_salt('bf'))`)
    legacyRoom = (await rpc(U.L1, 'create_room', `'前からあるルーム', 'える1', 'secret-code'`)).room_id
    const tok = (await admin(`select token from public.invites where room_id = $1`, [legacyRoom]))[0].token
    await rpc(U.L2, 'join_room', `'${tok}', 'える2'`)
    await as(U.L1, `insert into public.items (room_id, title, kind, date, created_by) values ($1,'古い項目','once',public.jst_today(),$2)`, [legacyRoom, U.L1])
  }
}

// --- 既存のルームが新しい仕組みに引き継がれたか
console.log('[既存データの引き継ぎ]')
check('古い表は消えている', await count(`select 1 from pg_tables where schemaname='public' and tablename in ('items','stamps','templates','template_items','template_expansions','phrases')`) === 0)
check('既存のルームに初期メモが2つ入る', await count(`select 1 from public.memos where room_id = $1`, [legacyRoom]) === 2)
check('既存のメンバーに参加順で色と絵文字', JSON.stringify(await admin(`select color, emoji from public.room_members where room_id = $1 order by joined_at`, [legacyRoom]))
  === JSON.stringify([{ color: 1, emoji: '🐻' }, { color: 2, emoji: '🐰' }]))
check('既存のルームの上限は6人', (await admin(`select member_limit from public.rooms where id = $1`, [legacyRoom]))[0].member_limit === 6)

// --- Supabase上で使う確認用SQLが「すべてOK」になるか
console.log('[確認用SQL]')
const verifySql = readFileSync(new URL('../checks/verify_setup.sql', import.meta.url), 'utf8')
const verify = await admin(verifySql)
check('確認用SQLがすべてOK', verify.length === 1 && verify[0].problem === 'すべてOK', verify)
await db.exec('grant select on public.restore_tokens to authenticated')
const bad = await admin(verifySql)
check('確認用SQLが危ない権限を見つける', bad.some(x => x.problem === 'ログイン済みの人が秘密の表に触れる'), bad)
await db.exec('revoke select on public.restore_tokens from authenticated')

// --- ルーム作成と作成用コード
console.log('[ルーム作成・参加]')
let r = await rpc(U.A, 'create_room', `'テスト', 'みー', 'wrong'`)
check('間違ったコードは作れない', r.error === 'bad_code', r)
r = await rpc(U.A, 'create_room', `'テスト', 'みー', 'secret-code'`)
check('正しいコードで作れる', r.ok, r)
const room = r.room_id
const token = (await admin(`select token from public.invites where room_id = $1`, [room]))[0].token
const seeded = await admin(
  `select m.title, m.description is not null and m.description <> '' as has_desc, count(i.*)::int n
   from public.memos m join public.memo_items i on i.memo_id = m.id where m.room_id = $1
   group by m.title, m.description, m.position order by m.position`, [room])
check('初期メモ3つが正しい順番（5項目・5項目・3項目）', JSON.stringify(seeded) === JSON.stringify([
  { title: '日々、大切にしたいこと', has_desc: true, n: 5 },
  { title: '普段と違う予定の日', has_desc: true, n: 5 },
  { title: '送る言葉', has_desc: true, n: 3 },
]), seeded)
check('各メモの1つ目の項目が正しい', JSON.stringify((await admin(
  `select i.body from public.memos m join public.memo_items i on i.memo_id = m.id where m.room_id = $1 and i.position = 1 order by m.position`, [room])).map((x) => x.body))
  === JSON.stringify([
    '不平不満を感じたときは、当たり前になっている感謝を忘れていないか振り返る',
    '予定が分かった時点で、連絡が難しくなりそうな時間帯と、連絡できそうなタイミングを共有する',
    '無事です。今は○○にいます。',
  ]))
check('古い初期メモの項目は入らない', await count(
  `select 1 from public.memo_items where room_id = $1 and (body like '%メモを確認%' or body like '%できたか振り返る%')`, [room]) === 0)
check('既存のルームのメモは変わらない（2つのまま）', await count(`select 1 from public.memos where room_id = $1`, [legacyRoom]) === 2)
check('作成者は色1・🐻', JSON.stringify(await as(U.A, `select color, emoji, role from public.room_members where user_id = $1 and room_id = $2`, [U.A, room]))
  === JSON.stringify([{ color: 1, emoji: '🐻', role: 'owner' }]))

check('ログイン前でも招待の中身を見られる', (await rpc(null, 'get_invite_info', `'${token}'`)).room_name === 'テスト')
await expectErr('ログイン前は表を読めない', as(null, 'select * from public.rooms'))
for (let i = 0; i < 5; i++) await rpc(U.C, 'join_room', `'bad${i}', 'x'`)
r = await rpc(U.C, 'join_room', `'${token}', 'しー'`)
check('5回失敗したらロック', r.error === 'locked', r)
r = await rpc(U.B, 'join_room', `'${token}', 'びー'`)
check('Bは参加できる', r.ok, r)
check('Bは色2・🐰', JSON.stringify(await as(U.B, `select color, emoji from public.room_members where user_id = $1`, [U.B]))
  === JSON.stringify([{ color: 2, emoji: '🐰' }]))

// --- 鍵と権限
console.log('[鍵と権限]')
check('Cはルームを見られない', (await as(U.C, 'select * from public.rooms')).length === 0)
check('Cはメモを見られない', (await as(U.C, 'select * from public.memos')).length === 0)
await expectErr('Cは他ルームにメモを作れない', as(U.C, `insert into public.memos (room_id, title) values ($1, 'x')`, [room]))
await expectErr('Bは設定表を読めない', as(U.B, 'select * from public.app_settings'))
await expectErr('Bは自分をオーナーにできない', as(U.B, `update public.room_members set role='owner' where user_id=$1`, [U.B]))
await expectErr('Bは自分の色を直接変えられない（関数経由）', as(U.B, `update public.room_members set color = 1 where user_id=$1`, [U.B]))
await expectErr('Bは自分でメンバー追加できない', as(U.B, `insert into public.room_members (room_id,user_id,display_name) values ($1,$2,'x')`, [room, U.C]))
await expectErr('ログイン前はルームを作れない', rpc(null, 'create_room', `'x', 'x', 'secret-code'`))
for (const t of ['restore_tokens', 'handoff_codes', 'attempt_logs', 'heartbeats'])
  await expectErr(`${t} は直接読めない`, as(U.B, `select * from public.${t}`))
await expectErr('内部用の関数は呼べない', as(U.B, `select public._random_token(8)`))
await expectErr('サーバー用の一覧関数は呼べない', as(U.B, `select * from public.list_orphan_anonymous_users(1)`))
await expectErr('メンバーは招待を直接作れない', as(U.B, `insert into public.invites (room_id, token) values ($1, 'x')`, [room]))
await as(U.B, `update public.room_members set display_name = 'びーちゃん' where user_id = $1`, [U.B])
check('自分の表示名は変えられる', (await as(U.B, `select display_name from public.room_members where user_id = $1`, [U.B]))[0].display_name === 'びーちゃん')
await as(U.B, `update public.room_members set display_name = 'のっとり' where user_id = $1`, [U.A])
check('他人の表示名は変えられない', (await as(U.B, `select display_name from public.room_members where user_id = $1`, [U.A]))[0].display_name === 'みー')
check('Bは招待リンクを見られない（オーナーだけ）', (await as(U.B, 'select * from public.invites')).length === 0)
check('オーナーは招待リンクを見られる', (await as(U.A, 'select * from public.invites')).length === 1)

// --- メモ
console.log('[メモ]')
const [memo] = await as(U.B, `insert into public.memos (room_id, title) values ($1, '二人で大切にしたいこと') returning id`, [room])
const [mi1] = await as(U.B, `insert into public.memo_items (memo_id, room_id, body, position) values ($1, $2, '相手を思いやる', 1) returning id`, [memo.id, room])
const [mi2] = await as(U.B, `insert into public.memo_items (memo_id, room_id, body, position) values ($1, $2, '短く先に連絡する', 2) returning id`, [memo.id, room])
const [mi3] = await as(U.B, `insert into public.memo_items (memo_id, room_id, body, position) values ($1, $2, '推測だけで結論を出さない', 3) returning id`, [memo.id, room])
check('メンバーはメモと項目を作れる', (await as(U.A, `select * from public.memo_items where memo_id = $1`, [memo.id])).length === 3)
await as(U.A, `update public.memo_items set body = '相手を思いやり、本音も伝える' where id = $1`, [mi1.id])
check('ほかのメンバーも項目を直せる', (await as(U.B, `select body from public.memo_items where id = $1`, [mi1.id]))[0].body === '相手を思いやり、本音も伝える')
await as(U.B, `update public.memos set description = 'みんなで直した説明' where id = $1`, [memo.id])
check('メンバーはメモの説明を直せる', (await as(U.A, `select description from public.memos where id = $1`, [memo.id]))[0].description === 'みんなで直した説明')
await expectErr('説明は200文字まで', as(U.B, `update public.memos set description = repeat('あ', 201) where id = $1`, [memo.id]))
await expectErr('メモを別ルームに移せない', as(U.B, `update public.memos set room_id = $1 where id = $2`, [legacyRoom, memo.id]))
await expectErr('項目は80文字まで', as(U.B, `insert into public.memo_items (memo_id, room_id, body) values ($1, $2, repeat('あ', 81))`, [memo.id, room]))
const [other] = await as(U.L1, `select id from public.memos where room_id = $1 limit 1`, [legacyRoom])
await expectErr('別ルームのメモに項目を入れられない', as(U.B, `insert into public.memo_items (memo_id, room_id, body) values ($1, $2, 'x')`, [other.id, room]))
const [big] = await as(U.B, `insert into public.memos (room_id, title) values ($1, '上限') returning id`, [room])
for (let i = 0; i < 30; i++) await as(U.B, `insert into public.memo_items (memo_id, room_id, body) values ($1, $2, $3)`, [big.id, room, `項目${i}`])
await expectErr('1メモ30項目まで', as(U.B, `insert into public.memo_items (memo_id, room_id, body) values ($1, $2, '31個目')`, [big.id, room]))
for (let i = 0; i < 5; i++) await as(U.B, `insert into public.memos (room_id, title) values ($1, $2)`, [room, `メモ${i}`])
await expectErr('1ルームのメモは10個まで', as(U.B, `insert into public.memos (room_id, title) values ($1, '11個目')`, [room]))

// --- 選んで今日・明日に追加
console.log('[選んで追加]')
r = await rpc(U.A, 'add_to_day', `'${room}', public.jst_today(), array['${mi1.id}','${mi2.id}']::uuid[]`)
check('2つ選んで今日に追加', r.ok && r.added === 2, r)
r = await rpc(U.B, 'add_to_day', `'${room}', public.jst_today(), array['${mi1.id}','${mi2.id}','${mi3.id}']::uuid[]`)
check('同じ日に同じ項目は1回だけ（新しい1つだけ入る）', r.added === 1 && r.skipped === 2, r)
r = await rpc(U.A, 'add_to_day', `'${room}', public.jst_today() + 2, array['${mi1.id}']::uuid[]`)
check('明後日には追加できない', r.error === 'bad_date', r)
r = await rpc(U.C, 'add_to_day', `'${room}', public.jst_today(), array['${mi1.id}']::uuid[]`)
check('メンバー以外は追加できない', r.error === 'not_member', r)
r = await rpc(U.A, 'add_to_day', `'${room}', public.jst_today(), array['${other.id}']::uuid[]`)
check('別ルームの項目は入らない', r.added === 0, r)
check('確認リストに3つ、メモの順', JSON.stringify((await as(U.B, `select body from public.day_entries where room_id = $1 and date = public.jst_today() order by position`, [room])).map(x => x.body))
  === JSON.stringify(['相手を思いやり、本音も伝える', '短く先に連絡する', '推測だけで結論を出さない']))
const last = (await as(U.B, `select public.last_selection($1) ids`, [room]))[0].ids
check('前回と同じ：今日選んだ3つ', last.length === 3 && last.includes(mi3.id), last)

const [adhoc] = await as(U.B, `insert into public.day_entries (room_id, date, body, created_by) values ($1, public.jst_today(), '19時に連絡する', $2) returning id`, [room, U.B])
check('その日だけの項目を足せる', !!adhoc)
await expectErr('その日だけの項目は今日・明日だけ', as(U.B, `insert into public.day_entries (room_id, date, body, created_by) values ($1, public.jst_today() + 5, 'x', $2)`, [room, U.B]))
await expectErr('メモ項目つきは直接入れられない（add_to_day経由）', as(U.B, `insert into public.day_entries (room_id, date, body, memo_item_id, created_by) values ($1, public.jst_today() + 1, 'x', $2, $3)`, [room, mi1.id, U.B]))

// --- 名前を付けて保存したセット
console.log('[保存したセット]')
const [set1] = await as(U.B, `insert into public.selection_sets (room_id, name, created_by) values ($1, '出張の日', $2) returning id`, [room, U.B])
await as(U.B, `insert into public.selection_set_items (set_id, memo_item_id, room_id) values ($1, $2, $3), ($1, $4, $3)`, [set1.id, mi2.id, room, mi3.id])
check('メンバーはセットを保存できる', (await as(U.A, `select memo_item_id from public.selection_set_items where set_id = $1`, [set1.id])).length === 2)
check('ほかのルームの人はセットを見られない', (await as(U.C, `select * from public.selection_sets`)).length === 0)
await expectErr('他人名義ではセットを作れない', as(U.B, `insert into public.selection_sets (room_id, name, created_by) values ($1, 'x', $2)`, [room, U.A]))
await expectErr('別ルームのメモ項目はセットに入れられない',
  as(U.B, `insert into public.selection_set_items (set_id, memo_item_id, room_id) values ($1, (select id from public.memo_items where room_id = $2 limit 1), $3)`, [set1.id, legacyRoom, room]))
await expectErr('セット名は20文字まで', as(U.B, `insert into public.selection_sets (room_id, name, created_by) values ($1, repeat('あ', 21), $2)`, [room, U.B]))
for (let i = 0; i < 9; i++) await as(U.B, `insert into public.selection_sets (room_id, name, created_by) values ($1, $2, $3)`, [room, `セット${i}`, U.B])
await expectErr('1ルームのセットは10個まで', as(U.B, `insert into public.selection_sets (room_id, name, created_by) values ($1, '11個目', $2)`, [room, U.B]))
await as(U.A, `delete from public.selection_sets where room_id = $1 and name like 'セット%'`, [room])
check('メンバーはセットを削除できる', await count(`select 1 from public.selection_sets where room_id = $1`, [room]) === 1)
const [mi4] = await as(U.B, `insert into public.memo_items (memo_id, room_id, body) values ($1, $2, 'あとで消す項目') returning id`, [memo.id, room])
await as(U.B, `insert into public.selection_set_items (set_id, memo_item_id, room_id) values ($1, $2, $3)`, [set1.id, mi4.id, room])
await as(U.B, `delete from public.memo_items where id = $1`, [mi4.id])
check('メモの項目を消すと、セットからも外れる', (await as(U.A, `select 1 from public.selection_set_items where set_id = $1`, [set1.id])).length === 2)

// --- ☀️🌙チェック
console.log('[チェック]')
const entries = await as(U.A, `select id, memo_item_id from public.day_entries where room_id = $1 and date = public.jst_today() order by position`, [room])
const e1 = entries.find((e) => e.memo_item_id === mi1.id).id
check('その日だけの項目は一番下に入る', entries.at(-1).memo_item_id === null, entries)
await as(U.B, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'morning', $2, $3, public.jst_today())`, [e1, U.B, room])
await as(U.A, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'morning', $2, $3, public.jst_today())`, [e1, U.A, room])
await as(U.B, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'night', $2, $3, public.jst_today())`, [e1, U.B, room])
check('朝は2人、夜は1人', JSON.stringify(await as(U.A, `select slot, count(*)::int n from public.checks where entry_id = $1 group by slot order by slot`, [e1]))
  === JSON.stringify([{ slot: 'morning', n: 2 }, { slot: 'night', n: 1 }]))
await expectErr('同じ人が同じ枠に2回は入れられない', as(U.B, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'morning', $2, $3, public.jst_today())`, [e1, U.B, room]))
await expectErr('他人名義のチェックは入れられない', as(U.A, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'night', $2, $3, public.jst_today())`, [e1, U.D, room]))
await expectErr('日付がずれたチェックは入れられない', as(U.A, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'night', $2, $3, public.jst_today() - 1)`, [e1, U.A, room]))
await as(U.A, `delete from public.checks where user_id = $1`, [U.B])
check('他人のチェックは取り消せない', (await as(U.A, `select * from public.checks where user_id = $1`, [U.B])).length === 2)
await as(U.B, `delete from public.checks where entry_id = $1 and slot = 'night' and user_id = $2`, [e1, U.B])
check('自分のチェックは取り消せる', (await as(U.B, `select * from public.checks where user_id = $1`, [U.B])).length === 1)

await as(U.A, `delete from public.memo_items where id = $1`, [mi1.id])
const kept = await as(U.A, `select body, memo_item_id from public.day_entries where id = $1`, [e1])
check('メモの項目を消しても、確認リストの記録は残る', kept[0]?.body === '相手を思いやり、本音も伝える' && kept[0].memo_item_id === null, kept)

// --- 振り返りと追記
console.log('[振り返り]')
const [refA] = await as(U.A, `insert into public.reflections (room_id, date, author_id, body) values ($1, public.jst_today(), $2, '大事にしたかったこと：連絡') returning id, updated_at`, [room, U.A])
await expectErr('1日1人1つまで', as(U.A, `insert into public.reflections (room_id, date, author_id, body) values ($1, public.jst_today(), $2, '2つ目')`, [room, U.A]))
await expectErr('他人名義では書けない', as(U.B, `insert into public.reflections (room_id, date, author_id, body) values ($1, public.jst_today() - 1, $2, 'x')`, [room, U.A]))
await as(U.B, `update public.reflections set body = 'のっとり' where id = $1`, [refA.id])
await as(U.B, `delete from public.reflections where id = $1`, [refA.id])
check('他人の振り返りは直せない・消せない', (await as(U.A, `select body from public.reflections where id = $1`, [refA.id]))[0]?.body === '大事にしたかったこと：連絡')
await as(U.A, `update public.reflections set body = '大事にしたかったこと：連絡を先に' where id = $1`, [refA.id])
const refA2 = (await as(U.A, `select body, updated_at from public.reflections where id = $1`, [refA.id]))[0]
check('自分の振り返りは直せて、更新日時が変わる', refA2.body === '大事にしたかったこと：連絡を先に' && refA2.updated_at > refA.updated_at)
const [noteB] = await as(U.B, `insert into public.reflection_notes (reflection_id, room_id, author_id, body) values ($1, $2, $3, '読んだよ、うれしかった') returning id`, [refA.id, room, U.B])
await as(U.A, `insert into public.reflection_notes (reflection_id, room_id, author_id, body) values ($1, $2, $3, '本人も追記')`, [refA.id, room, U.A])
check('ほかのメンバーも本人も追記できる', (await as(U.A, `select * from public.reflection_notes where reflection_id = $1`, [refA.id])).length === 2)
await as(U.A, `delete from public.reflection_notes where id = $1`, [noteB.id])
check('他人の追記は消せない', (await as(U.B, `select * from public.reflection_notes where id = $1`, [noteB.id])).length === 1)
await expectErr('追記は1000文字まで', as(U.B, `insert into public.reflection_notes (reflection_id, room_id, author_id, body) values ($1, $2, $3, repeat('あ', 1001))`, [refA.id, room, U.B]))
check('Cは振り返りを読めない', (await as(U.C, 'select * from public.reflections')).length === 0)

// --- ⭐と日ごとのまとめ
console.log('[⭐と一覧]')
await as(U.B, `insert into public.day_stars (room_id, date, starred_by) values ($1, public.jst_today(), $2)`, [room, U.B])
const sums = await as(U.B, `select * from public.day_summaries($1, null, null, true)`, [room])
check('⭐だけの一覧に今日が出る', sums.length === 1 && sums[0].starred && sums[0].entry_count === 4 && sums[0].check_count === 2
  && sums[0].reflection_authors.length === 1, sums)
check('Cは一覧を見られない', (await as(U.C, `select * from public.day_summaries($1, null, null, false)`, [room])).length === 0)

// --- 色と絵文字
console.log('[色と人数]')
r = await rpc(U.B, 'set_member_look', `'${room}', 1::smallint, '🐧'`)
check('ほかの人の色は選べない', r.error === 'color_taken', r)
r = await rpc(U.B, 'set_member_look', `'${room}', 3::smallint, '🐧'`)
check('空いている色と好きな絵文字に変えられる', r.ok, r)
await rpc(U.D, 'join_room', `'${token}', 'でぃー'`)
check('次の人は空いている一番小さい色（2）', (await as(U.D, `select color from public.room_members where user_id = $1`, [U.D]))[0].color === 2)
for (const u of ['E', 'F', 'G']) await rpc(U[u], 'join_room', `'${token}', '${u}'`)
r = await rpc(U.H, 'join_room', `'${token}', 'えいち'`)
check('6人を超えると参加できない', r.error === 'room_full', r)
check('6人の色はすべて違う', await count(`select distinct color from public.room_members where room_id = $1 and left_at is null`, [room]) === 6)

// --- 退出の2択とメンバーを外す
console.log('[退出・メンバーを外す]')
const ef = await as(U.F, `select id from public.day_entries where room_id = $1 and date = public.jst_today() limit 1`, [room])
await as(U.F, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'night', $2, $3, public.jst_today())`, [ef[0].id, U.F, room])
await as(U.G, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'night', $2, $3, public.jst_today())`, [ef[0].id, U.G, room])
await as(U.G, `insert into public.reflections (room_id, date, author_id, body) values ($1, public.jst_today(), $2, 'じーの振り返り')`, [room, U.G])
r = await rpc(U.F, 'leave_room', `'${room}', 'keep'`)
check('「記録を残す」で退出できる', r.ok, r)
check('記録は残り、名前は「退出したメンバー」', JSON.stringify(await as(U.A, `select m.display_name, m.color, count(c.*)::int n from public.room_members m left join public.checks c on c.user_id = m.user_id where m.user_id = $1 group by m.display_name, m.color`, [U.F]))
  === JSON.stringify([{ display_name: '退出したメンバー', color: null, n: 1 }]))
check('退出した人はルームを見られない', (await as(U.F, 'select * from public.rooms where id = $1', [room])).length === 0)
await expectErr('退出した人はチェックできない', as(U.F, `insert into public.checks (entry_id, slot, user_id, room_id, date) values ($1, 'morning', $2, $3, public.jst_today())`, [ef[0].id, U.F, room]))
r = await rpc(U.G, 'leave_room', `'${room}', 'erase'`)
check('「全部削除」で退出できる', r.ok, r)
check('自分のチェック・振り返り・メンバー情報が消える',
  await count(`select 1 from public.checks where user_id = $1 union all select 1 from public.reflections where author_id = $1 union all select 1 from public.room_members where user_id = $1`, [U.G]) === 0)
r = await rpc(U.B, 'remove_member', `'${room}', '${U.E}'`)
check('オーナー以外はメンバーを外せない', r.error === 'not_owner', r)
r = await rpc(U.A, 'remove_member', `'${room}', '${U.E}'`)
check('オーナーはメンバーを外せる（記録は残す）', r.ok && (await as(U.A, `select display_name from public.room_members where user_id = $1`, [U.E]))[0]?.display_name === '退出したメンバー', r)
r = await rpc(U.F, 'join_room', `'${token}', 'えふ（再）'`)
check('退出した人は招待リンクで戻れる', r.ok && (await as(U.F, `select left_at, color from public.room_members where user_id = $1`, [U.F]))[0]?.color > 0, r)

// --- 引き継ぎコードと復元リンク
console.log('[引き継ぎ]')
r = await rpc(U.A, 'leave_room', `'${room}', 'keep'`)
check('オーナーは譲る前に退出できない', r.error === 'transfer_first', r)
const code = (await rpc(U.A, 'issue_handoff_code', '')).code
check('引き継ぎコードの形', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code)
r = await rpc(U.A2, 'redeem_identity', `'${code.toLowerCase()}'`)
check('A2がAとして引き継げる', r.ok, r)
check('A2がオーナーで、色・チェック・振り返りも移る', JSON.stringify(await as(U.A2,
  `select m.role, m.color, (select count(*)::int from public.checks where user_id = $1) c, (select count(*)::int from public.reflections where author_id = $1) f from public.room_members m where m.user_id = $1 and m.room_id = $2`, [U.A2, room]))
  === JSON.stringify([{ role: 'owner', color: 1, c: 1, f: 1 }]))
check('古いAはもう見られない', (await as(U.A, 'select * from public.rooms')).length === 0)
r = await rpc(U.C, 'redeem_identity', `'${code}'`)
check('コードは1回だけ', r.ok === false, r)
const rt = (await rpc(U.A2, 'issue_restore_token', '')).token
r = await rpc(U.A, 'redeem_identity', `'${rt}'`)
check('復元リンクでAに戻れる', r.ok && (await as(U.A, 'select * from public.rooms where id = $1', [room])).length === 1, r)

// --- ルーム作成の上限とルーム削除
console.log('[上限・ルーム削除]')
r = await rpc(U.B, 'create_room', `'2', 'b', 'secret-code'`); const room2 = r.room_id
r = await rpc(U.B, 'create_room', `'3', 'b', 'secret-code'`); r = await rpc(U.B, 'create_room', `'4', 'b', 'secret-code'`)
check('1人2ルームまで', r.error === 'too_many_rooms', r)
r = await rpc(U.A, 'delete_room', `'${room2}', '2'`)
check('オーナー以外はルームを削除できない', r.error === 'not_owner', r)
r = await rpc(U.B, 'delete_room', `'${room2}', 'ちがう名前'`)
check('名前が違うと削除できない', r.error === 'name_mismatch', r)
r = await rpc(U.B, 'delete_room', `'${room2}', '2'`)
check('名前が一致すれば削除できる（メモも消える）', r.ok && await count(`select 1 from public.memos where room_id = $1`, [room2]) === 0, r)

// --- サーバー用関数
await expectErr('一般ユーザーは整理処理を呼べない', rpc(U.B, 'run_daily_maintenance', `'x'`))

// --- 使われないルームの整理（⭐の日だけ残る）
console.log('[整理]')
const [old] = await as(U.B, `insert into public.day_entries (room_id, date, body, created_by) values ($1, public.jst_today(), '⭐なしの日にする', $2) returning id`, [room, U.B])
await admin(`update public.day_entries set date = public.jst_today() - 3 where id = $1`, [old.id])
await admin(`update public.rooms set last_activity_at = now() - interval '200 days'`)
await db.exec(`set role service_role`)
r = (await db.query(`select public.run_daily_maintenance('test') r`)).rows[0].r
await db.exec('reset role')
check('⭐のないルームは削除', r.deleted_rooms === 2, r)
check('⭐のあるルームは残る', r.cleaned_rooms === 1, r)
check('⭐の日の記録だけ残る', await count(`select 1 from public.day_entries where room_id = $1 and date <> public.jst_today()`, [room]) === 0
  && await count(`select 1 from public.day_entries where room_id = $1`, [room]) > 0)

console.log(fails ? `\n${fails} 件失敗` : '\nすべて成功')
process.exit(fails ? 1 : 0)
