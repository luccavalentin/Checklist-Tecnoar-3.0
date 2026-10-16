// Confere o arquivo único de supabase/aplicar-no-banco/ antes de alguém colar
// no SQL Editor de produção: aplica o banco COMO ELE ESTÁ HOJE (esqueleto +
// migrações até 20260927, sem as quatro novas) e só então roda o arquivo
// único — duas vezes, porque no SQL Editor é fácil clicar em Run de novo.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { gerarEsqueleto } from './esqueleto.mjs'

const PROJETO = fileURLToPath(new URL('../..', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })
const ok = (t, v) => console.log('✔', t, v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))

const { sql } = gerarEsqueleto(`${PROJETO}/src/tipos/supabase.ts`)
await db.exec(sql)
ok('esqueleto do banco')

// O banco de hoje: tudo do SOS, menos as quatro migrações novas.
const antigas = fs
  .readdirSync(`${PROJETO}/supabase/migrations`)
  .filter((a) => a >= '20260912' && a < '20260928')
  .sort()
let base = antigas.map((a) => fs.readFileSync(`${PROJETO}/supabase/migrations/${a}`, 'utf8')).join('\n\n')
await db.exec(`create publication supabase_realtime;`).catch(() => {
  base = base.replace(/-- =+ realtime[\s\S]*?replica identity full;\n/, '-- (realtime omitido)\n')
})
await db.exec(base)
ok('banco como está hoje', `${antigas.length} migrações até 20260927`)

const antes = await db.query(`select count(*)::int as n from pg_proc
  where pronamespace = 'public'::regnamespace and proname like 'sos\\_%'`)
ok('funções sos_ antes', antes.rows[0].n)

const unico = fs.readFileSync(`${PROJETO}/supabase/aplicar-no-banco/sos-despacho-em-ondas.sql`, 'utf8')

await db.exec(unico)
ok('arquivo único aplicado (1ª vez)')
await db.exec(unico)
ok('arquivo único aplicado de novo (idempotente)')

const conf = await db.query(`
  select (select nome from public.sos_prestadores where tipo = 'proprio') as proprio,
         (select count(*)::int from public.sos_prestadores) as prestadores,
         (select count(*)::int from public.sos_politica_despacho where ativo) as ondas,
         (select despacho_em_ondas from public.sos_config where singleton) as ligado,
         (select count(*)::int from public.sos_mecanicos where prestador_id is null) as orfaos,
         (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
            and proname like 'sos\\_%') as funcoes`)
const c = conf.rows[0]
ok('estado final', c)

const problemas = []
if (!c.proprio) problemas.push('prestador próprio não nasceu')
if (c.prestadores !== 1) problemas.push(`${c.prestadores} prestadores (rodar 2× duplicou?)`)
if (c.ondas !== 6) problemas.push(`${c.ondas} ondas, esperado 6`)
if (c.ligado !== true) problemas.push('despacho em ondas não ficou ligado')
if (c.orfaos !== 0) problemas.push(`${c.orfaos} mecânicos sem prestador`)

const ondas = await db.query(`select ordem, nome, tipo_prestador, raio_min_km, raio_max_km, espera_seg
  from public.sos_politica_despacho where ativo order by ordem`)
console.log('\nAs ondas, na ordem:')
for (const o of ondas.rows) {
  console.log(`  ${o.ordem}. ${o.nome} — ${o.tipo_prestador ?? 'qualquer'}, ${o.raio_min_km}–${o.raio_max_km} km, ` +
    (Number(o.espera_seg) === 0 ? 'fica aberta' : `${o.espera_seg} s`))
}

if (problemas.length) {
  console.log('\n✘ PROBLEMAS:', problemas.join(' · '))
  process.exit(1)
}
console.log('\nARQUIVO ÚNICO CONFERIDO — pode colar no SQL Editor.')
