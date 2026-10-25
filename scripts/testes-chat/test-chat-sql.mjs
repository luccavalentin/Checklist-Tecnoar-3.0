import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('../../', import.meta.url)))
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage; create schema realtime;
create table auth.users(id uuid primary key);
create table public.usuarios(id uuid primary key,nome text,equipe boolean);
create type public.sos_papel as enum('cliente','mecanico','central','sistema');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
create function public.sos_eh_equipe() returns boolean language sql stable security definer as $$ select coalesce((select equipe from public.usuarios where id=auth.uid()),false) $$;
create function public.sos_nome_conta(p uuid) returns text language sql stable security definer as $$ select nome from public.usuarios where id=p $$;
create function realtime.topic() returns text language sql stable as $$select current_setting('app.topic',true)$$;
create table realtime.messages(id uuid,extension text);
alter table realtime.messages enable row level security;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema public,auth,realtime,storage to authenticated;
grant select,insert on realtime.messages,storage.objects to authenticated;
`)
let sql = await readFile('supabase/migrations/20261024_chat_equipe_tecnoar.sql','utf8')
// PGlite não fornece replicação lógica; as políticas/tabelas/RPCs são reais.
sql = sql.replace(/do \$\$ begin[\s\S]*?end \$\$;/,'')
await db.exec(sql)
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333'
await db.query(`insert into auth.users values($1),($2),($3)`,[alice,bob,staff])
await db.query(`insert into usuarios values($1,'Alice',false),($2,'Bob',false),($3,'Equipe',true)`,[alice,bob,staff])
async function as(id){ await db.exec('reset role');await db.query(`select set_config('app.uid',$1,false)`,[id]);await db.exec('set role authenticated') }
async function value(sql,args=[]){return (await db.query(sql,args)).rows[0]?.v}
await as(alice)
const a=await value('select tecnoar_chat_abrir() v')
assert.equal(await value('select tecnoar_chat_abrir() v'),a)
const mid='44444444-4444-4444-8444-444444444444'
await db.query('select tecnoar_chat_enviar($1,$2,$3)',[a,mid,'Olá equipe'])
await as(bob)
const b=await value('select tecnoar_chat_abrir() v')
assert.equal(await value('select count(*)::int v from tecnoar_chat_mensagens'),0)
await assert.rejects(()=>db.query('select tecnoar_chat_enviar($1,gen_random_uuid(),$2)',[a,'Invasão']),/Sem acesso/)
await assert.rejects(()=>db.query('select tecnoar_chat_ler($1)',[a]),/Sem acesso/)
await assert.rejects(()=>db.query('select tecnoar_chat_apagar($1)',[mid]),/apagar/)
await assert.rejects(()=>db.query('select tecnoar_chat_enviar($1,gen_random_uuid(),$2,null,null,$3)',[b,'Citação alheia',mid]),/outra conversa/)
await as(staff)
assert.equal(await value('select count(*)::int v from tecnoar_conversas'),2)
await db.query('select tecnoar_chat_ler($1)',[a])
assert.equal(await value('select lida_em is not null v from tecnoar_chat_mensagens where id=$1',[mid]),true)
await db.query('select tecnoar_chat_enviar($1,gen_random_uuid(),$2,null,null,$3)',[a,'Como podemos ajudar?',mid])
await as(alice)
assert.equal(await value('select count(*)::int v from tecnoar_chat_mensagens'),2)
await db.query('select tecnoar_chat_apagar($1)',[mid])
assert.equal(await value('select apagada_em is not null and texto is null v from tecnoar_chat_mensagens where id=$1',[mid]),true)
await db.query(`select set_config('app.topic',$1,false)`,['tecnoar:chat:'+a])
await db.exec("insert into realtime.messages values(gen_random_uuid(),'presence')")
await db.query(`select set_config('app.topic',$1,false)`,['tecnoar:chat:'+b])
await assert.rejects(()=>db.exec("insert into realtime.messages values(gen_random_uuid(),'presence')"),/row-level security/)
await as(bob)
assert.equal(await value('select count(*)::int v from tecnoar_chat_mensagens'),0)
await db.close()
console.log('OK: isolamento entre clientes, acesso equipe, citações, leitura, exclusão, canal privado e abertura idempotente.')
