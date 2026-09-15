// Impressão digital das funções do SOS depois de aplicar a migração num
// Postgres local (PGlite). Rodar a mesma consulta no banco real e comparar:
// se bater, o banco tem exatamente o código testado aqui.
//   node impressao.mjs            → impressão geral
//   node impressao.mjs --lista    → uma linha por função (para achar a diferença)
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { gerarEsqueleto } from './esqueleto.mjs'

const PROJETO = fileURLToPath(new URL('../..', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(gerarEsqueleto(`${PROJETO}/src/tipos/supabase.ts`).sql)
// Todas as migrações do SOS, na ordem (20260912 em diante).
let migracao = fs
  .readdirSync(`${PROJETO}/supabase/migrations`)
  .filter((a) => a >= '20260912')
  .sort()
  .map((a) => fs.readFileSync(`${PROJETO}/supabase/migrations/${a}`, 'utf8'))
  .join('\n\n')
await db.exec(`create publication supabase_realtime;`).catch(() => {
  migracao = migracao.replace(/-- =+ realtime[\s\S]*?replica identity full;\n/, '')
})
await db.exec(migracao)

const r = await db.query(`
  select count(*)::int as n,
    md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(replace(p.prosrc, E'\\r', '')), ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) as impressao
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\\_%'`)
console.log(JSON.stringify(r.rows[0]))
if (process.argv.includes('--lista')) {
  const l = await db.query(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f, md5(replace(p.prosrc, E'\\r', '')) as h
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\\_%'
    order by p.proname, pg_get_function_identity_arguments(p.oid)`)
  for (const x of l.rows) console.log(x.h, x.f)
}
