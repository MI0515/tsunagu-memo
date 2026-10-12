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

for (const f of readdirSync(dir).sort()) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')) }
  catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1) }
  console.log('applied', f)
}

const U = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b',
  C: '00000000-0000-0000-0000-00000000000c', A2: '00000000-0000-0000-0000-0000000000a2' }
await db.exec(`insert into auth.users (id) values ${Object.values(U).map(u => `('${u}')`).join(',')};
  update public.app_settings set creation_code_hash = extensions.crypt('secret-code', extensions.gen_salt('bf'));`)

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

// --- Supabase上で使う確認用SQLが「すべてOK」になるか
const verify = (await db.query(readFileSync(new URL('../checks/verify_setup.sql', import.meta.url), 'utf8'))).rows
check('確認用SQLがすべてOK', verify.length === 1 && verify[0].problem === 'すべてOK', verify)
// わざと危ない権限を付けると、確認用SQLが見つけられるか
await db.exec('grant select on public.restore_tokens to authenticated')
const bad = (await db.query(readFileSync(new URL('../checks/verify_setup.sql', import.meta.url), 'utf8'))).rows
check('確認用SQLが危ない権限を見つける', bad.some(x => x.problem === 'ログイン済みの人が秘密の表に触れる'), bad)
await db.exec('revoke select on public.restore_tokens from authenticated')

// --- ルーム作成と作成用コード
let r = await rpc(U.A, 'create_room', `'テスト', 'みー', 'wrong'`)
check('間違ったコードは作れない', r.error === 'bad_code', r)
r = await rpc(U.A, 'create_room', `'テスト', 'みー', 'secret-code'`)
check('正しいコードで作れる', r.ok, r)
const room = r.room_id
const token = (await db.query(`select token from public.invites where room_id = $1`, [room])).rows[0].token
check('初期テンプレ5件', (await db.query(`select count(*)::int c from public.template_items where room_id=$1`, [room])).rows[0].c === 5)
check('初期定型文3件', (await db.query(`select count(*)::int c from public.phrases where room_id=$1`, [room])).rows[0].c === 3)

// --- 招待参加とロック
check('ログイン前でも招待の中身を見られる', (await rpc(null, 'get_invite_info', `'${token}'`)).room_name === 'テスト')
await expectErr('ログイン前は表を読めない', as(null, 'select * from public.rooms'))
for (let i = 0; i < 5; i++) await rpc(U.C, 'join_room', `'bad${i}', 'x'`)
r = await rpc(U.C, 'join_room', `'${token}', 'しー'`)
check('5回失敗したらロック', r.error === 'locked', r)
r = await rpc(U.B, 'join_room', `'${token}', 'びー'`)
check('Bは参加できる', r.ok, r)

// --- RLS：他ルームは見えない
check('Cはルームを見られない', (await as(U.C, 'select * from public.rooms')).length === 0)
check('Bはルームを見られる', (await as(U.B, 'select * from public.rooms')).length === 1)
await expectErr('Cは他ルームに項目を追加できない',
  as(U.C, `insert into public.items (room_id, title, kind, date, created_by) values ($1,'x','once',public.jst_today(),$2)`, [room, U.C]))
await expectErr('Bは設定表を読めない', as(U.B, 'select * from public.app_settings'))
await expectErr('Bは自分をオーナーにできない', as(U.B, `update public.room_members set role='owner' where user_id=$1`, [U.B]))
await expectErr('Bは自分でメンバー追加できない', as(U.B, `insert into public.room_members (room_id,user_id,display_name) values ($1,$2,'x')`, [room, U.C]))

// --- 権限（GRANT）：許した操作だけができる
await expectErr('ログイン前はルームを作れない', rpc(null, 'create_room', `'x', 'x', 'secret-code'`))
for (const t of ['restore_tokens', 'handoff_codes', 'attempt_logs', 'heartbeats'])
  await expectErr(`${t} は直接読めない`, as(U.B, `select * from public.${t}`))
await expectErr('内部用の関数は呼べない', as(U.B, `select public._random_token(8)`))
await expectErr('サーバー用の一覧関数は呼べない', as(U.B, `select * from public.list_orphan_anonymous_users(1)`))
await expectErr('メンバーはオーナー専用の招待を直接作れない',
  as(U.B, `insert into public.invites (room_id, token) values ($1, 'x')`, [room]))
await as(U.B, `update public.room_members set display_name = 'びーちゃん' where user_id = $1`, [U.B])
check('自分の表示名は変えられる',
  (await as(U.B, `select display_name from public.room_members where user_id = $1`, [U.B]))[0].display_name === 'びーちゃん')
await as(U.B, `update public.room_members set display_name = 'のっとり' where user_id = $1`, [U.A])
check('他人の表示名は変えられない',
  (await as(U.B, `select display_name from public.room_members where user_id = $1`, [U.A]))[0].display_name === 'みー')
check('Bは招待リンクを見られない（オーナーだけ）', (await as(U.B, 'select * from public.invites')).length === 0)
check('オーナーは招待リンクを見られる', (await as(U.A, 'select * from public.invites')).length === 1)

// --- 項目とスタンプ
const [item] = await as(U.A, `insert into public.items (room_id, title, kind, date, created_by) values ($1,'今日の項目','once',public.jst_today(),$2) returning id`, [room, U.A])
await as(U.A, `insert into public.items (room_id, title, kind, weekdays, created_by) values ($1,'月木','weekly','{1,4}',$2)`, [room, U.A])
await as(U.A, `insert into public.items (room_id, title, kind, month_day, starts_on, created_by) values ($1,'31日','monthly',31,'2026-01-01',$2)`, [room, U.A])
const titlesOn = async d => (await as(U.B, `select title from public.items_on($1, $2)`, [room, d])).map(x => x.title)
check('月曜は月木が出る', (await titlesOn('2026-10-12')).includes('月木'))
check('火曜は月木が出ない', !(await titlesOn('2026-10-13')).includes('月木'))
check('31日指定は2月は月末に出る', (await titlesOn('2027-02-28')).includes('31日'))
check('31日指定は2月27日には出ない', !(await titlesOn('2027-02-27')).includes('31日'))
await as(U.B, `insert into public.stamps (item_id, date, user_id, kind, room_id) values ($1, public.jst_today(), $2, 'check', $3)`, [item.id, U.B, room])
await as(U.B, `insert into public.stamps (item_id, date, user_id, kind, room_id) values ($1, public.jst_today(), $2, 'eyes', $3)`, [item.id, U.B, room])
await as(U.B, `update public.items set title = '今日の項目（編集）' where id = $1`, [item.id])
check('メンバーは項目名を編集できる',
  (await as(U.B, `select title from public.items where id = $1`, [item.id]))[0].title === '今日の項目（編集）')
await expectErr('項目を別ルームに移せない', as(U.B, `update public.items set room_id = gen_random_uuid() where id = $1`, [item.id]))
await expectErr('項目は直接削除できない（remove_item経由）', as(U.B, `delete from public.items where id = $1`, [item.id]))
check('Bは2種類押せる', (await as(U.A, 'select * from public.stamps')).length === 2)
await as(U.A, `delete from public.stamps where user_id = $1`, [U.B])
check('AはBのスタンプを消せない', (await as(U.A, 'select * from public.stamps')).length === 2)
await expectErr('他人名義のスタンプは押せない',
  as(U.A, `insert into public.stamps (item_id, date, user_id, kind, room_id) values ($1, public.jst_today(), $2, 'heart', $3)`, [item.id, U.B, room]))

// --- テンプレ展開
const tpl = (await db.query(`select id from public.templates where room_id=$1`, [room])).rows[0].id
r = await rpc(U.B, 'expand_template', `'${tpl}', public.jst_today() + 1`)
check('明日に展開できる', r.ok && !r.already, r)
r = await rpc(U.A, 'expand_template', `'${tpl}', public.jst_today() + 1`)
check('同じ日は2回目が展開済み', r.already === true, r)
r = await rpc(U.A, 'expand_template', `'${tpl}', public.jst_today() + 2`)
check('明後日は展開できない', r.error === 'bad_date', r)

// --- 退出とオーナー
r = await rpc(U.A, 'leave_room', `'${room}'`)
check('オーナーは譲る前に退出できない', r.error === 'transfer_first', r)

// --- 引き継ぎコード（A → A2）
const code = (await rpc(U.A, 'issue_handoff_code', '')).code
check('引き継ぎコードの形', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code)
r = await rpc(U.A2, 'redeem_identity', `'${code.toLowerCase()}'`)
check('A2がAとして引き継げる', r.ok, r)
check('A2がオーナーになっている', (await as(U.A2, `select role from public.room_members where user_id=$1`, [U.A2]))[0]?.role === 'owner')
check('古いAはもう見られない', (await as(U.A, 'select * from public.rooms')).length === 0)
r = await rpc(U.C, 'redeem_identity', `'${code}'`)
check('コードは1回だけ', r.ok === false, r)

// --- 復元リンク
const rt = (await rpc(U.A2, 'issue_restore_token', '')).token
r = await rpc(U.A, 'redeem_identity', `'${rt}'`)
check('復元リンクでAに戻れる', r.ok && (await as(U.A, 'select * from public.rooms')).length === 1, r)

// --- オーナー譲渡と退出
r = await rpc(U.A, 'transfer_owner', `'${room}', '${U.B}'`)
check('Bに譲れる', r.ok, r)
r = await rpc(U.A, 'leave_room', `'${room}'`)
check('譲った後は退出できる', r.ok && !r.room_deleted, r)
check('Aの過去のスタンプ記録は残る(Bの分)', (await as(U.B, 'select * from public.stamps')).length === 2)

// --- 項目削除（繰り返しは記録を残す）
const [daily] = await as(U.B, `insert into public.items (room_id, title, kind, starts_on, created_by) values ($1,'毎日','daily',public.jst_today()-10,$2) returning id`, [room, U.B])
await as(U.B, `insert into public.stamps (item_id, date, user_id, kind, room_id) values ($1, public.jst_today()-3, $2, 'check', $3)`, [daily.id, U.B, room])
r = await rpc(U.B, 'remove_item', `'${daily.id}'`)
check('毎日項目を消すと昨日で終了', (await as(U.B, `select ends_on = public.jst_today()-1 as e from public.items where id=$1`, [daily.id]))[0]?.e === true, r)
check('過去の日には残っている', (await as(U.B, `select title from public.items_on($1, public.jst_today()-3)`, [room])).some(x => x.title === '毎日'))
check('今日には出ない', !(await titlesOn((await db.query('select public.jst_today()::text d')).rows[0].d)).includes('毎日'))

// --- 上限
await db.exec(`update public.app_settings set max_items_per_room_per_day = 1`)
await expectErr('1日の項目上限', as(U.B, `insert into public.items (room_id, title, kind, date, created_by) values ($1,'x','once',public.jst_today(),$2)`, [room, U.B]))
await db.exec(`update public.app_settings set max_items_per_room_per_day = 50`)
r = await rpc(U.B, 'create_room', `'2', 'b', 'secret-code'`); r = await rpc(U.B, 'create_room', `'3', 'b', 'secret-code'`); r = await rpc(U.B, 'create_room', `'4', 'b', 'secret-code'`)
check('1人2ルームまで', r.error === 'too_many_rooms', r)

// --- サーバー用関数は一般ユーザーから呼べない
await expectErr('一般ユーザーは整理処理を呼べない', rpc(U.B, 'run_daily_maintenance', `'x'`))

// --- 使われないルームの整理（⭐の日だけ残る）
// 準備は管理者として行い、整理処理だけをサーバー（service_role）として呼ぶ
await db.exec(`insert into public.day_stars (room_id, date) values ('${room}', public.jst_today()-3)`)
await db.exec(`update public.rooms set last_activity_at = now() - interval '200 days'`)
await db.exec(`set role service_role`)
r = (await db.query(`select public.run_daily_maintenance('test') r`)).rows[0].r
await db.exec('reset role')
check('⭐なしの新ルームは削除', r.deleted_rooms === 2, r)
check('⭐ありのルームは残る', r.cleaned_rooms === 1, r)
const left = (await db.query(`select date from public.stamps`)).rows
check('⭐の日のスタンプだけ残る', left.length === 1, left)

console.log(fails ? `\n${fails} 件失敗` : '\nすべて成功')
process.exit(fails ? 1 : 0)
