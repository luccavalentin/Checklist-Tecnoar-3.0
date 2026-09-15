// Aplica a migração do SOS num Postgres real (PGlite) com esqueleto do banco
// da Tecnoar e simula o ciclo inteiro de um chamado. Falha = exceção com a
// etapa que quebrou.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { gerarEsqueleto } from './esqueleto.mjs'

const PROJETO = fileURLToPath(new URL('../..', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })

let passos = 0
async function etapa(nome, fn) {
  try {
    const r = await fn()
    passos++
    console.log('✔', nome, r === undefined ? '' : typeof r === 'string' ? r : JSON.stringify(r).slice(0, 220))
    return r
  } catch (e) {
    console.log('✘', nome, '→', e.message)
    if (e.where) console.log('   onde:', e.where.split('\n')[0])
    process.exit(1)
  }
}

async function como(uid, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  const r = await db.query(sql, params)
  return r.rows
}
async function um(uid, sql, params) {
  const rows = await como(uid, sql, params)
  const v = rows[0]
  return v ? Object.values(v)[0] : undefined
}

// ── esqueleto + dados base (antes da migração, como no banco real)
const { sql } = gerarEsqueleto(`${PROJETO}/src/tipos/supabase.ts`)
await etapa('esqueleto do banco', () => db.exec(sql))

const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  mec1: '00000000-0000-0000-0000-0000000000b1',
  mec2: '00000000-0000-0000-0000-0000000000b2',
  atendente: '00000000-0000-0000-0000-0000000000c1',
  cliente: '00000000-0000-0000-0000-0000000000d1',
  cliente2: '00000000-0000-0000-0000-0000000000d2',
}

await etapa('dados base', () =>
  db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ids.admin}', 'admin@t.com', '{}'), ('${ids.mec1}', 'mec1@t.com', '{}'), ('${ids.mec2}', 'mec2@t.com', '{}'),
    ('${ids.atendente}', 'at@t.com', '{}'),
    ('${ids.cliente}', 'joao@cliente.com', '{"tipo_conta":"sos_cliente","nome_completo":"João da Silva"}'),
    ('${ids.cliente2}', 'maria@cliente.com', '{"tipo_conta":"sos_cliente","nome_completo":"Maria Souza"}');
  insert into public.perfis_acesso (id, nome, is_system) values
    ('10000000-0000-0000-0000-000000000001', 'Administrador', true),
    ('10000000-0000-0000-0000-000000000002', 'Oficina', false),
    ('10000000-0000-0000-0000-000000000003', 'Central de atendimento', false);
  insert into public.perfil_permissoes (perfil_id, recurso, acao) values
    ('10000000-0000-0000-0000-000000000002', 'ordens_servico', 'visualizar'),
    ('10000000-0000-0000-0000-000000000002', 'ordens_servico', 'editar'),
    ('10000000-0000-0000-0000-000000000003', 'ordens_servico', 'criar'),
    ('10000000-0000-0000-0000-000000000003', 'sos', 'visualizar'),
    ('10000000-0000-0000-0000-000000000003', 'sos', 'editar'),
    ('10000000-0000-0000-0000-000000000003', 'sos', 'cancelar');
  insert into public.funcoes (id, nome, atua_como_mecanico) values
    ('20000000-0000-0000-0000-000000000001', 'Mecânico', true),
    ('20000000-0000-0000-0000-000000000002', 'Atendente', false);
  insert into public.usuarios (id, nome_completo, email, situacao, is_admin, perfil_id, funcao_id, telefone) values
    ('${ids.admin}', 'Admin Tecnoar', 'admin@t.com', 'ativo', true, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', null),
    ('${ids.mec1}', 'Carlos Silva', 'mec1@t.com', 'ativo', false, '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '11988887777'),
    ('${ids.mec2}', 'Pedro Rocha', 'mec2@t.com', 'ativo', false, '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '11977776666'),
    ('${ids.atendente}', 'Ana Atendente', 'at@t.com', 'ativo', false, '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', null);
  insert into public.especialidades (id, nome) values ('30000000-0000-0000-0000-000000000001', 'Freios pneumáticos pesados');
  insert into public.usuario_especialidades (usuario_id, especialidade_id) values ('${ids.mec1}', '30000000-0000-0000-0000-000000000001');
  insert into public.clientes (id, tipo_pessoa, nome_razao, celular, email, situacao) values
    ('40000000-0000-0000-0000-000000000001', 'fisica', 'João da Silva Transportes', '(11) 99999-1234', 'Joao@Cliente.com', 'ativo');
  -- E-mails confirmados pelo link (o vínculo com cadastro existente depende disso).
  update auth.users set confirmation_sent_at = now() - interval '1 minute', email_confirmed_at = now();
  insert into public.veiculos (id, cliente_id, placa, descricao, marca, modelo, km_atual, tipo, situacao) values
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'ABC1D23', 'Volvo FH', 'Volvo', 'FH 540', 250000, 'cavalo', 'ativo');
  insert into public.status_os (id, nome, cor, categoria, ordem, situacao) values
    ('60000000-0000-0000-0000-000000000001', 'Entrada', 'azul', 'entrada', 1, 'ativo');
  insert into public.produtos (id, codigo, descricao, unidade, preco_venda, saldo, situacao) values
    ('70000000-0000-0000-0000-000000000001', 'PST-01', 'Pastilha de freio Knorr', 'UN', 480.50, 12, 'ativo');
  insert into public.servicos (id, codigo, descricao, valor_padrao, situacao) values
    ('80000000-0000-0000-0000-000000000001', 'SRV-SOS', 'Atendimento de socorro em estrada', 350, 'ativo');
  insert into public.dados_empresa (singleton, nome_fantasia, telefone) values (true, 'Tecnoar Freios', '1133334444');
  insert into public.recursos (chave, nome, grupo, ordem, acoes) values ('ordens_servico', 'OS', 'operacao', 10, array['visualizar']::public.acao_permissao[]);
`),
)

// ── a migração
// Todas as migrações do SOS, na ordem (20260912 em diante).
let migracao = fs
  .readdirSync(`${PROJETO}/supabase/migrations`)
  .filter((a) => a >= '20260912')
  .sort()
  .map((a) => fs.readFileSync(`${PROJETO}/supabase/migrations/${a}`, 'utf8'))
  .join('\n\n')
// Publicação do Realtime não existe no PGlite: cria antes para o bloco rodar.
await db.exec(`create publication supabase_realtime;`).catch(() => {
  migracao = migracao.replace(/-- =+ realtime[\s\S]*?replica identity full;\n/, '-- (realtime omitido no teste)\n')
})
await etapa('MIGRAÇÃO aplicada', () => db.exec(migracao))
await etapa('migração é idempotente (2ª execução)', () => db.exec(migracao))

// ── contas
await etapa('conta do app NÃO vira usuário pendente', async () => {
  await db.exec(`insert into public.usuarios (id, nome_completo, email, situacao) values ('${ids.cliente}', 'João', 'joao@cliente.com', 'pendente')`)
  const n = await um(null, `select count(*)::int from public.usuarios where id = '${ids.cliente}'`)
  if (n !== 0) throw new Error('linha pendente foi criada')
  return 'descartada'
})
await etapa('papel antes do cadastro = novo', async () => {
  const p = await um(ids.cliente, `select public.sos_meu_papel()`)
  if (p.papel !== 'novo') throw new Error(JSON.stringify(p))
  return p
})
await etapa('conta com celular e e-mail de um cliente, sem confirmar pelo link, NÃO herda o cadastro', async () => {
  // Confirmação desligada no Auth: e-mail "confirmado" na hora, sem link enviado.
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
    ('00000000-0000-0000-0000-0000000000e1', 'joao@cliente.com', '{"tipo_conta":"sos_cliente"}', now())`)
  const p = await um('00000000-0000-0000-0000-0000000000e1', `select public.sos_registrar_conta('Falso João', '11 99999-1234', null, null, true)`)
  if (p.papel !== 'cliente' || !p.cliente_id || p.cliente_id === '40000000-0000-0000-0000-000000000001') throw new Error(JSON.stringify(p))
  const aviso = await um(null, `select count(*)::int from public.notificacoes where usuario_id = '${ids.admin}' and titulo = 'Conta do app para conferir'`)
  if (aviso < 1) throw new Error('central não foi avisada')
  // Some do resto do teste (não conta como cliente nos números seguintes).
  await db.exec(`delete from public.sos_contas_cliente where usuario_id = '00000000-0000-0000-0000-0000000000e1';
    delete from public.clientes where id = '${p.cliente_id}'; delete from public.notificacoes where titulo = 'Conta do app para conferir';
    delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1'`)
  return 'cadastro novo + aviso à central'
})
await etapa('registrar conta acha o cliente existente pelo e-mail confirmado', async () => {
  const p = await um(ids.cliente, `select public.sos_registrar_conta('João da Silva', '11 99999-1234', null, null, true)`)
  if (p.papel !== 'cliente' || p.cliente_id !== '40000000-0000-0000-0000-000000000001') throw new Error(JSON.stringify(p))
  return p
})
await etapa('segundo cliente, sem cadastro, é criado', async () => {
  const p = await um(ids.cliente2, `select public.sos_registrar_conta('Maria Souza', '21988880000', '529.982.247-25', null, true)`)
  if (p.papel !== 'cliente' || !p.cliente_id) throw new Error(JSON.stringify(p))
  return p.cliente_id
})
await etapa('cadastrar veículo pela placa existente não duplica', async () => {
  const v = await um(ids.cliente, `select public.sos_cadastrar_veiculo('ABC-1D23', null, 'cavalo')`)
  if (v !== '50000000-0000-0000-0000-000000000001') throw new Error(v)
  return v
})
await etapa('toda conta ativa do Checklist entra no app (sem aparecer no despacho antes de ativar)', async () => {
  const m = await um(ids.mec1, `select public.sos_meu_papel()`)
  const a = await um(ids.admin, `select public.sos_meu_papel()`)
  const t = await um(ids.atendente, `select public.sos_meu_papel()`)
  const noMapa = await como(ids.admin, `select count(*)::int as n from public.sos_mecanicos_mapa() where usuario_id = '${ids.atendente}'`)
  if (m.papel !== 'mecanico' || a.papel !== 'mecanico' || !a.central || t.papel !== 'mecanico' || noMapa[0].n !== 0) {
    throw new Error(JSON.stringify({ m, a, t, noMapa }))
  }
  return { mec: m.papel, admin: a.papel, central: a.central, atendente: t.papel }
})
await etapa('home do cliente', () => um(ids.cliente, `select public.sos_home_cliente()`))

// ── disponibilidade
await etapa('mecânico 1 fica disponível', () => um(ids.mec1, `select public.sos_definir_situacao('disponivel', -23.55, -46.63)`))
await etapa('mecânico 2 em pausa', () => um(ids.mec2, `select public.sos_definir_situacao('pausa', -23.40, -46.40)`))

// ── abrir chamado
const ch = await etapa('cliente abre SOS (freios)', async () => {
  const c = await um(ids.cliente, `select public.sos_abrir_chamado($1::jsonb)`, [
    JSON.stringify({ veiculo_id: '50000000-0000-0000-0000-000000000001', tipo_ocorrencia: 'freios', descricao: 'Luz de ar acesa, pedal duro', latitude: -23.5, longitude: -46.6, precisao_m: 12 }),
  ])
  if (!/^SOS-\d{4}-\d{6}$/.test(c.protocolo)) throw new Error('protocolo ' + c.protocolo)
  if (c.status !== 'procurando_mecanico' || c.prioridade !== 'emergencia') throw new Error(c.status + ' ' + c.prioridade)
  return c
})
await etapa('toque duplo devolve o mesmo chamado', async () => {
  const c = await um(ids.cliente, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"freios"}'::jsonb)`)
  if (!c.ja_existia || c.id !== ch.id) throw new Error(JSON.stringify(c).slice(0, 200))
  return 'ja_existia'
})
await etapa('notificações: central + só mecânico DISPONÍVEL', async () => {
  const rows = await como(null, `select usuario_id, titulo, link from public.notificacoes order by created_at`)
  const para = rows.map((r) => r.usuario_id)
  if (!para.includes(ids.admin) || !para.includes(ids.atendente)) throw new Error('central não avisada ' + JSON.stringify(rows))
  if (!para.includes(ids.mec1)) throw new Error('mec1 disponível não avisado')
  if (para.includes(ids.mec2)) throw new Error('mec2 em pausa foi avisado')
  if (!rows.find((r) => r.link?.startsWith('/app/chamado/'))) throw new Error('link do app errado')
  return rows.length + ' avisos'
})
await etapa('evento no histórico do veículo', () => um(null, `select count(*)::int from public.eventos_veiculo where referencia_id = '${ch.id}'`))

// ── central
await etapa('despacho inteligente põe o mecânico de freios em 1º', async () => {
  const r = await como(ids.admin, `select nome, situacao, afinidade, distancia_km, eta_min, pontuacao from public.sos_sugerir_mecanicos('${ch.id}')`)
  if (r[0].nome !== 'Carlos Silva' || !r[0].afinidade) throw new Error(JSON.stringify(r))
  return r
})
await etapa('lista da central', async () => {
  const l = await um(ids.admin, `select public.sos_listar_chamados('{"ativos": true}'::jsonb)`)
  if (l.length !== 1 || !l[0].cliente_nome) throw new Error(JSON.stringify(l).slice(0, 200))
  return l[0].status_rotulo
})
await etapa('lista com busca por placa', async () => {
  const l = await um(ids.admin, `select public.sos_listar_chamados('{"busca": "abc1"}'::jsonb)`)
  if (l.length !== 1) throw new Error('não achou pela placa')
  return 'ok'
})
await etapa('indicadores', () => um(ids.admin, `select public.sos_indicadores()`))
await etapa('mapa de mecânicos', () => como(ids.admin, `select nome, situacao from public.sos_mecanicos_mapa()`))
await etapa('detalhe (central)', async () => {
  const d = await um(ids.admin, `select public.sos_detalhe_chamado('${ch.id}')`)
  if (d.papel !== 'central' || !d.cliente.telefone) throw new Error(JSON.stringify(d).slice(0, 200))
  return d.papel
})
await etapa('mecânico candidato vê o chamado na fila', async () => {
  const h = await um(ids.mec1, `select public.sos_home_mecanico()`)
  if (h.aguardando.length !== 1) throw new Error(JSON.stringify(h).slice(0, 300))
  return h.aguardando[0].distancia_km + ' km'
})

// ── aceite e deslocamento
await etapa('mecânico 1 aceita', async () => {
  const c = await um(ids.mec1, `select public.sos_aceitar('${ch.id}', -23.55, -46.63)`)
  if (c.status !== 'a_caminho' || c.mecanico_id !== ids.mec1 || !c.eta_min) throw new Error(JSON.stringify(c).slice(0, 200))
  return { eta: c.eta_min, km: c.distancia_km }
})
await etapa('mecânico 2 não consegue aceitar o mesmo', async () => {
  try {
    await um(ids.mec2, `select public.sos_aceitar('${ch.id}', null, null)`)
  } catch (e) {
    return e.message
  }
  throw new Error('aceitou em dobro')
})
await etapa('situação do mecânico 1 = em atendimento', () => um(null, `select situacao from public.sos_mecanicos where usuario_id = '${ids.mec1}'`))
await etapa('mecânico não fica disponível no meio do chamado', async () => {
  try {
    await um(ids.mec1, `select public.sos_definir_situacao('disponivel', null, null)`)
  } catch (e) {
    return e.message
  }
  throw new Error('deixou mudar')
})
await etapa('posição do mecânico recalcula ETA', () => um(ids.mec1, `select public.sos_registrar_posicao('${ch.id}', -23.52, -46.61, 8, 15, 90)`))
await etapa('posição do cliente', () => um(ids.cliente, `select public.sos_registrar_posicao('${ch.id}', -23.5001, -46.6001, 10)`))
await etapa('outro cliente não registra posição', async () => {
  try {
    await um(ids.cliente2, `select public.sos_registrar_posicao('${ch.id}', 1, 1)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('chat', async () => {
  await um(ids.mec1, `select public.sos_enviar_mensagem('${ch.id}', 'Estou a caminho.', null, null, true)`)
  await um(ids.cliente, `select public.sos_enviar_mensagem('${ch.id}', 'Estou no acostamento.', null, null, false)`)
  await um(ids.cliente, `select public.sos_marcar_mensagens_lidas('${ch.id}')`)
  return um(null, `select count(*)::int from public.sos_mensagens where lida_em is not null`)
})
await etapa('cliente não consegue pular etapa', async () => {
  try {
    await um(ids.cliente, `select public.sos_avancar('${ch.id}', 'no_local')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('mecânico não pula etapa', async () => {
  try {
    await um(ids.mec1, `select public.sos_avancar('${ch.id}', 'servico_finalizado')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('cheguei (GPS longe registra aviso)', async () => {
  const c = await um(ids.mec1, `select public.sos_avancar('${ch.id}', 'no_local', -23.60, -46.70, '{}'::jsonb)`)
  const ev = await um(null, `select descricao from public.sos_eventos where chamado_id = '${ch.id}' and titulo = 'Mecânico chegou'`)
  return c.status + ' · ' + ev
})
await etapa('iniciar serviço', async () => (await um(ids.mec1, `select public.sos_avancar('${ch.id}', 'servico_iniciado')`)).status)

// ── atendimento: catálogo do Checklist
const cat = await etapa('catálogo (produto e serviço)', async () => {
  const r = await como(ids.mec1, `select * from public.sos_catalogo('pastilha', null, 30)`)
  const s = await como(ids.mec1, `select * from public.sos_catalogo('socorro', 'servico', 30)`)
  if (!r.length || !s.length) throw new Error('catálogo vazio')
  return { produto: r[0], servico: s[0] }
})
const item = await etapa('lançar produto', () => um(ids.mec1, `select public.sos_adicionar_item('${ch.id}', 'produto', '${cat.produto.id}', 2)`))
await etapa('lançar serviço', () => um(ids.mec1, `select public.sos_adicionar_item('${ch.id}', 'servico', '${cat.servico.id}', 1)`))
await etapa('alterar quantidade', () => um(ids.mec1, `select public.sos_alterar_item('${item.id}', 4)`))
await etapa('valor total calculado', async () => {
  const t = await um(null, `select sum(valor_total)::numeric from public.sos_itens where chamado_id = '${ch.id}'`)
  if (Number(t) !== 480.5 * 4 + 350) throw new Error('total ' + t)
  return t
})
await etapa('cliente não lança item', async () => {
  try {
    await um(ids.cliente, `select public.sos_adicionar_item('${ch.id}', 'produto', '${cat.produto.id}', 1)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('anexo registrado na pasta do chamado', () => um(ids.mec1, `select public.sos_registrar_anexo('${ch.id}', '${ch.id}/foto-1.jpg', 'foto', 'antes', 'Lona gasta', 1000)`))
await etapa('anexo fora da pasta é recusado', async () => {
  try {
    await um(ids.mec1, `select public.sos_registrar_anexo('${ch.id}', 'outra/foto.jpg', 'foto')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('salvar diagnóstico', () => um(ids.mec1, `select public.sos_salvar_atendimento('${ch.id}', '{"diagnostico":"Pastilhas no fim, válvula relé ok"}'::jsonb)`))
await etapa('finalizar sem serviço realizado é recusado', async () => {
  try {
    await um(ids.mec1, `select public.sos_avancar('${ch.id}', 'servico_finalizado')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
const fim = await etapa('FINALIZAR → OS gerada com os itens', async () => {
  const c = await um(ids.mec1, `select public.sos_avancar('${ch.id}', 'servico_finalizado', -23.5, -46.6, '{"servico_realizado":"Troca de pastilhas no local"}'::jsonb)`)
  if (c.status !== 'servico_finalizado' || !c.os_id) throw new Error('sem OS: ' + JSON.stringify(c).slice(0, 300))
  const prods = await como(null, `select descricao, quantidade, valor_unitario, produto_id from public.os_produtos where os_id = '${c.os_id}'`)
  const servs = await como(null, `select descricao, quantidade, servico_id from public.os_servicos where os_id = '${c.os_id}'`)
  const mecs = await como(null, `select usuario_id from public.os_mecanicos where os_id = '${c.os_id}'`)
  const evs = await como(null, `select titulo from public.os_eventos where os_id = '${c.os_id}'`)
  if (prods.length !== 1 || Number(prods[0].quantidade) !== 4 || servs.length !== 1 || mecs.length !== 1 || !evs.length) {
    throw new Error(JSON.stringify({ prods, servs, mecs, evs }))
  }
  return { os: c.os_id, prods, servs: servs.length }
})
await etapa('item lançado depois da OS vai para a OS', async () => {
  // Central lança um item a mais depois de finalizado (ajuste de faturamento).
  await um(ids.admin, `select public.sos_adicionar_item('${ch.id}', 'produto', '${cat.produto.id}', 1)`)
  return um(null, `select count(*)::int from public.os_produtos where os_id = '${fim.os}'`)
})
await etapa('remover item cancela na OS', async () => {
  await um(ids.mec1, `select public.sos_remover_item('${item.id}')`)
  return um(null, `select situacao from public.os_produtos where os_id = '${fim.os}' order by ordem limit 1`)
})
await etapa('mecânico volta a disponível', () => um(null, `select situacao from public.sos_mecanicos where usuario_id = '${ids.mec1}'`))
await etapa('cliente avalia → concluído', async () => (await um(ids.cliente, `select public.sos_avaliar('${ch.id}', 5::smallint, 'Rápido!')`)).status)
await etapa('histórico do cliente', async () => {
  const h = await um(ids.cliente, `select public.sos_historico_cliente(null, 50)`)
  return h.map((x) => x.tipo + ':' + (x.numero ?? x.protocolo))
})
await etapa('meus chamados', async () => (await um(ids.cliente, `select public.sos_meus_chamados(50)`)).length)
await etapa('home do mecânico (hoje)', async () => (await um(ids.mec1, `select public.sos_home_mecanico()`)).hoje)
await etapa('detalhe (cliente) esconde telefone do mecânico sem permissão', async () => {
  const d = await um(ids.cliente, `select public.sos_detalhe_chamado('${ch.id}')`)
  if (d.papel !== 'cliente' || d.mecanico.telefone) throw new Error(JSON.stringify(d.mecanico))
  return d.mecanico.nome
})

// ── segundo chamado: atribuição, recusa, cancelamento
const ch2 = await etapa('segundo SOS (cliente 2, placa nova)', async () => {
  const c = await um(ids.cliente2, `select public.sos_abrir_chamado('{"placa":"XYZ9A88","tipo_ocorrencia":"nao_liga","latitude":-22.9,"longitude":-43.2}'::jsonb)`)
  if (!c.veiculo_id) throw new Error('veículo não criado')
  return c
})
await etapa('central atribui ao mecânico 2', async () => (await um(ids.admin, `select public.sos_atribuir('${ch2.id}', '${ids.mec2}', false)`)).mecanico_id === ids.mec2)
await etapa('mecânico 2 recusa → volta para a fila', async () => {
  await um(ids.mec2, `select public.sos_recusar('${ch2.id}', 'Longe demais')`)
  const c = await como(null, `select status, mecanico_id from public.sos_chamados where id = '${ch2.id}'`)
  if (c[0].mecanico_id) throw new Error('continuou atribuído')
  return c[0].status
})
await etapa('sugestão rebaixa quem recusou', async () => {
  const r = await como(ids.admin, `select nome, recusou, pontuacao from public.sos_sugerir_mecanicos('${ch2.id}')`)
  return r
})
await etapa('central escala direto (já avisou por telefone)', async () => (await um(ids.admin, `select public.sos_atribuir('${ch2.id}', '${ids.mec1}', true)`)).status)
await etapa('mecânico não cancela', async () => {
  try {
    await um(ids.mec1, `select public.sos_cancelar('${ch2.id}', 'x')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('cliente cancela antes do serviço', async () => (await um(ids.cliente2, `select public.sos_cancelar('${ch2.id}', 'Consegui resolver')`)).status)
await etapa('cancelamento libera o mecânico', () => um(null, `select situacao from public.sos_mecanicos where usuario_id = '${ids.mec1}'`))

// ── vigia: nenhum SOS fica esquecido
const vigiar = () => um(null, `select public.sos_vigiar()`)
const notifs = (uid, trecho) => um(null, `select count(*)::int from public.notificacoes where usuario_id = '${uid}' and titulo like '%${trecho}%'`)
await etapa('vigia sem nada vencido não avisa ninguém', async () => {
  const r = await vigiar()
  if (r.espera || r.devolvidos || r.atrasos || r.sem_sinal) throw new Error(JSON.stringify(r))
  return r
})
const ch3 = await etapa('terceiro SOS (para o vigia)', () =>
  um(ids.cliente2, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"parado","latitude":-22.9,"longitude":-43.2}'::jsonb)`),
)
await etapa('vigia: prazo de aceite vencido → nível 1, mecânicos e central avisados de novo', async () => {
  await um(null, `update public.sos_chamados set espera_desde = now() - interval '130 seconds' where id = '${ch3.id}'`)
  const r = await vigiar()
  const c = await como(null, `select alerta_nivel from public.sos_chamados where id = '${ch3.id}'`)
  const mec = await notifs(ids.mec1, 'SOS esperando há')
  const central = await notifs(ids.admin, 'SOS sem mecânico há')
  if (r.espera !== 1 || c[0].alerta_nivel !== 1 || !mec || !central) throw new Error(JSON.stringify({ r, c, mec, central }))
  return { nivel: 1, mec, central }
})
await etapa('vigia não repete o mesmo aviso', async () => {
  const r = await vigiar()
  if (r.espera) throw new Error('repetiu')
  return r.espera
})
await etapa('vigia: 3× o prazo → central acionada e cliente tranquilizado', async () => {
  await um(null, `update public.sos_chamados set espera_desde = now() - interval '400 seconds' where id = '${ch3.id}'`)
  await vigiar()
  const nivel = await um(null, `select alerta_nivel from public.sos_chamados where id = '${ch3.id}'`)
  const cli = await notifs(ids.cliente2, 'continua em andamento')
  if (nivel !== 2 || !cli) throw new Error(JSON.stringify({ nivel, cli }))
  return { nivel, cli }
})
await etapa('atribuição direta zera a espera', async () => {
  await um(ids.admin, `select public.sos_atribuir('${ch3.id}', '${ids.mec2}', false)`)
  const c = await como(null, `select alerta_nivel, espera_desde > now() - interval '5 seconds' as recente from public.sos_chamados where id = '${ch3.id}'`)
  if (c[0].alerta_nivel !== 0 || !c[0].recente) throw new Error(JSON.stringify(c))
  return c[0]
})
await etapa('vigia: mecânico atribuído não respondeu → volta para todos', async () => {
  await um(null, `update public.sos_chamados set espera_desde = now() - interval '130 seconds' where id = '${ch3.id}'`)
  const r = await vigiar()
  const c = await como(null, `select mecanico_id, status from public.sos_chamados where id = '${ch3.id}'`)
  if (r.devolvidos !== 1 || c[0].mecanico_id) throw new Error(JSON.stringify({ r, c }))
  return c[0].status
})
await etapa('mecânico 1 aceita; previsão inicial guardada', async () => {
  await um(ids.mec1, `select public.sos_aceitar('${ch3.id}', -22.95, -43.25)`)
  return um(null, `select eta_inicial_min from public.sos_chamados where id = '${ch3.id}'`)
})
await etapa('vigia: deslocamento atrasado e sem posição → central e mecânico avisados', async () => {
  await um(null, `update public.sos_chamados set a_caminho_em = now() - interval '3 hours', atribuido_em = now() - interval '3 hours' where id = '${ch3.id}'`)
  await um(null, `update public.sos_mecanicos set posicao_em = now() - interval '20 minutes' where usuario_id = '${ids.mec1}'`)
  const r = await vigiar()
  const mec = await notifs(ids.mec1, 'Abra o SOS Tecnoar')
  const central = await notifs(ids.admin, 'atrasado')
  if (r.atrasos !== 1 || r.sem_sinal !== 1 || !mec || !central) throw new Error(JSON.stringify({ r, mec, central }))
  return r
})
await etapa('posição voltou → "sem sinal" pode ser avisado de novo', async () => {
  await um(ids.mec1, `select public.sos_registrar_posicao('${ch3.id}', -22.93, -43.22, 10)`)
  return um(null, `select sinal_avisado_em is null from public.sos_chamados where id = '${ch3.id}'`)
})
await etapa('etapa guardada sem sinal vale na hora do aparelho (com limites)', async () => {
  const ha40 = await um(null, `select (now() - interval '40 minutes')::text`)
  await um(ids.mec1, `select public.sos_avancar('${ch3.id}', 'no_local', null, null, jsonb_build_object('registrado_no_aparelho_em', '${ha40}'))`)
  // Antes da chegada não pode: fica colado na etapa anterior.
  await um(ids.mec1, `select public.sos_avancar('${ch3.id}', 'servico_iniciado', null, null, jsonb_build_object('registrado_no_aparelho_em', (now() - interval '5 hours')::text))`)
  const r = await um(null, `select jsonb_build_object(
      'chegou_ha_min', round(extract(epoch from now() - chegou_em) / 60),
      'deslocamento_min', round(tempo_deslocamento_seg / 60.0),
      'iniciou_igual_chegou', iniciado_em = chegou_em,
      'evento', (select dados ? 'hora_da_etapa' from public.sos_eventos e where e.chamado_id = c.id and e.dados->>'status' = 'no_local' limit 1))
    from public.sos_chamados c where id = '${ch3.id}'`)
  if (r.chegou_ha_min !== 40 || r.deslocamento_min !== 140 || !r.iniciou_igual_chegou || !r.evento) throw new Error(JSON.stringify(r))
  // Relógio do aparelho adiantado (hora no futuro) não vale: fica a do servidor.
  await um(ids.mec1, `select public.sos_avancar('${ch3.id}', 'servico_finalizado', null, null, jsonb_build_object('diagnostico', 'Bateria', 'servico_realizado', 'Chupeta e troca de terminal', 'registrado_no_aparelho_em', (now() + interval '1 hour')::text))`)
  const fut = await um(null, `select finalizado_em <= now() and finalizado_em > now() - interval '1 minute' from public.sos_chamados where id = '${ch3.id}'`)
  if (!fut) throw new Error('hora futura do aparelho foi aceita')
  return r
})
await etapa('vigia: finalizado sem avaliação por 24 h → concluído', async () => {
  await um(null, `update public.sos_chamados set finalizado_em = now() - interval '25 hours' where id = '${ch3.id}'`)
  const r = await vigiar()
  const s = await um(null, `select status from public.sos_chamados where id = '${ch3.id}'`)
  if (r.concluidos !== 1 || s !== 'concluido') throw new Error(JSON.stringify({ r, s }))
  return s
})
await etapa('pulso do app do mecânico', async () => {
  await um(ids.mec1, `select public.sos_pulso()`)
  const m = await como(ids.admin, `select visto_em is not null as visto from public.sos_mecanicos_mapa() where usuario_id = '${ids.mec1}'`)
  if (!m[0]?.visto) throw new Error('sem pulso no mapa')
  return true
})
await etapa('vigia: "disponível" com o app fechado há horas → offline', async () => {
  await um(ids.mec2, `select public.sos_definir_situacao('disponivel')`)
  await um(null, `update public.sos_mecanicos set situacao_em = now() - interval '5 hours', posicao_em = now() - interval '5 hours' where usuario_id = '${ids.mec2}'`)
  await um(null, `update public.sos_presenca set visto_em = now() - interval '5 hours' where usuario_id = '${ids.mec2}'`)
  const r = await vigiar()
  const s = await um(null, `select situacao from public.sos_mecanicos where usuario_id = '${ids.mec2}'`)
  const aviso = await notifs(ids.mec2, 'ficou offline')
  if (r.offline !== 1 || s !== 'offline' || !aviso) throw new Error(JSON.stringify({ r, s, aviso }))
  return s
})
await etapa('mecânico com app aberto continua disponível', () => um(null, `select situacao from public.sos_mecanicos where usuario_id = '${ids.mec1}'`))
await etapa('cliente não roda o vigia', async () => {
  await db.exec(`set role authenticated`)
  try {
    await como(ids.cliente, `select public.sos_vigiar()`)
  } catch (e) {
    return e.message
  } finally {
    await db.exec(`reset role`)
  }
  throw new Error('permitiu')
})

// ── premium: contrato, deslocamento e orçamento
const CLIENTE1 = '40000000-0000-0000-0000-000000000001'
await etapa('contrato do frotista (60 min, emergência, R$ 5/km, mínimo R$ 100)', async () => {
  const c = await um(ids.admin, `select public.sos_salvar_contrato('{"cliente_id":"${CLIENTE1}","nome":"Frota João","prazo_chegada_min":60,"prioridade":"emergencia","valor_km":5,"taxa_minima":100}'::jsonb)`)
  return c.nome
})
await etapa('segundo contrato ativo para o mesmo cliente é recusado', async () => {
  try {
    await um(ids.admin, `select public.sos_salvar_contrato('{"cliente_id":"${CLIENTE1}","nome":"Duplicado"}'::jsonb)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('config: deslocamento ligado e orçamento obrigatório', async () => {
  const c = await um(ids.admin, `select public.sos_salvar_config('{"modo_distribuicao":"inteligente","deslocamento_ativo":true,"deslocamento_valor_km":3,"deslocamento_taxa_minima":80,"exigir_aprovacao_orcamento":true}'::jsonb)`)
  if (!c.deslocamento_ativo || !c.exigir_aprovacao_orcamento) throw new Error(JSON.stringify(c))
  return 'ok'
})
const ch4 = await etapa('SOS de cliente com contrato herda prazo e prioridade', async () => {
  const c = await um(ids.cliente, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"outro","latitude":-23.5,"longitude":-46.6}'::jsonb)`)
  if (c.sla_chegada_min !== 60 || c.prioridade !== 'emergencia' || !c.contrato_id || !c.veiculo_id) throw new Error(JSON.stringify(c))
  return c
})
await etapa('aceite guarda a distância inicial', async () => {
  const c = await um(ids.mec1, `select public.sos_aceitar('${ch4.id}', -23.55, -46.63)`)
  return um(null, `select distancia_inicial_km from public.sos_chamados where id = '${c.id}'`)
})
await etapa('chegada lança a taxa de deslocamento do contrato (mínimo R$ 100)', async () => {
  await um(ids.mec1, `select public.sos_avancar('${ch4.id}', 'no_local', -23.5, -46.6)`)
  const i = await como(null, `select descricao, valor_total from public.sos_itens where chamado_id = '${ch4.id}' and origem = 'deslocamento'`)
  if (i.length !== 1 || Number(i[0].valor_total) !== 100) throw new Error(JSON.stringify(i))
  return i[0].descricao
})
await etapa('sem orçamento aprovado o serviço não começa', async () => {
  try {
    await um(ids.mec1, `select public.sos_avancar('${ch4.id}', 'servico_iniciado')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('mecânico envia o orçamento', async () => {
  await um(ids.mec1, `select public.sos_adicionar_item('${ch4.id}', 'produto', '70000000-0000-0000-0000-000000000001', 1)`)
  const c = await um(ids.mec1, `select public.sos_enviar_orcamento('${ch4.id}', 'Troca da pastilha')`)
  const n = await um(null, `select count(*)::int from public.notificacoes where usuario_id = '${ids.cliente}' and titulo like '%Orçamento para aprovar%'`)
  if (c.orcamento_status !== 'pendente' || Number(c.orcamento_valor) !== 580.5 || !n) throw new Error(JSON.stringify({ c, n }))
  return { valor: c.orcamento_valor, aviso_cliente: n }
})
await etapa('aprovar sem assinatura é recusado', async () => {
  try {
    await um(ids.cliente, `select public.sos_responder_orcamento('${ch4.id}', true, null, null)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('cliente aprova assinando; serviço liberado', async () => {
  const c = await um(ids.cliente, `select public.sos_responder_orcamento('${ch4.id}', true, '${ch4.id}/assinatura-1.png', null)`)
  const s = await um(ids.mec1, `select public.sos_avancar('${ch4.id}', 'servico_iniciado')`)
  if (c.orcamento_status !== 'aprovado' || s.status !== 'servico_iniciado') throw new Error(JSON.stringify({ c, s }))
  return s.status
})
await etapa('item novo depois de aprovado marca o orçamento como desatualizado', async () => {
  await um(ids.mec1, `select public.sos_adicionar_item('${ch4.id}', 'servico', '80000000-0000-0000-0000-000000000001', 1)`)
  return um(null, `select orcamento_desatualizado from public.sos_chamados where id = '${ch4.id}'`)
})
await etapa('finaliza → OS com deslocamento, peça e serviço', async () => {
  const c = await um(ids.mec1, `select public.sos_avancar('${ch4.id}', 'servico_finalizado', null, null, '{"diagnostico":"Pastilha gasta","servico_realizado":"Troca"}'::jsonb)`)
  const n = await um(null, `select (select count(*) from public.os_produtos where os_id = '${c.os_id}') + (select count(*) from public.os_servicos where os_id = '${c.os_id}')`)
  if (!c.os_id || Number(n) !== 3) throw new Error(JSON.stringify({ os: c.os_id, n }))
  return { itens_na_os: Number(n) }
})
const ch5 = await etapa('SOS de contrato parado além do prazo', async () => {
  const c = await um(ids.cliente, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"parado","latitude":-23.51,"longitude":-46.61}'::jsonb)`)
  await um(null, `update public.sos_chamados set recebido_em = now() - interval '2 hours', espera_desde = now() - interval '2 hours' where id = '${c.id}'`)
  return c
})
await etapa('vigia avisa prazo de contrato estourado (uma vez)', async () => {
  const r = await vigiar()
  const r2 = await vigiar()
  const n = await notifs(ids.admin, 'Prazo de contrato estourado')
  if (r.sla !== 1 || r2.sla !== 0 || !n) throw new Error(JSON.stringify({ r, r2, n }))
  return { sla: r.sla, aviso_central: n }
})
await etapa('cliente cancela o SOS parado', async () => (await um(ids.cliente, `select public.sos_cancelar('${ch5.id}', 'Resolvi')`)).status)
await etapa('contratos com números do mês', async () => {
  const l = await um(ids.admin, `select public.sos_listar_contratos()`)
  if (!l.length || l[0].chamados_30d < 2 || l[0].no_prazo_30d !== 1) throw new Error(JSON.stringify(l))
  return { chamados: l[0].chamados_30d, no_prazo: l[0].no_prazo_30d }
})
await etapa('relatório com mapa de calor, prazo, orçamento e deslocamento', async () => {
  const r = await um(ids.admin, `select public.sos_relatorio(now() - interval '1 day', now() + interval '1 day')`)
  if (!r.pontos.length || r.sla.com_prazo !== 1 || r.orcamentos.aprovados !== 1 || Number(r.valor_deslocamento) !== 100) throw new Error(JSON.stringify({ p: r.pontos, s: r.sla, o: r.orcamentos, d: r.valor_deslocamento }))
  return { pontos: r.pontos.length, sla: r.sla, orcamentos: r.orcamentos }
})
await etapa('monitor do vigia (sem pg_cron aqui)', () => um(ids.admin, `select public.sos_vigia_status()`))
await etapa('config volta: sem orçamento obrigatório', () => um(ids.admin, `select public.sos_salvar_config('{"exigir_aprovacao_orcamento":false,"deslocamento_ativo":false}'::jsonb)`).then((c) => c.exigir_aprovacao_orcamento))

// ── IA: configuração na Gestão SOS
await etapa('IA desligada por padrão', async () => (await um(ids.cliente, `select public.sos_ia_publico()`)).ativa)
await etapa('central liga a IA com chave própria (a chave não volta)', async () => {
  const c = await um(ids.admin, `select public.sos_salvar_config('{"ia_ativa":true,"ia_provedor":"anthropic","ia_modelo":"claude-sonnet-5","ia_apikey":"sk-teste"}'::jsonb)`)
  if (!c.ia_apikey_definida || JSON.stringify(c).includes('sk-teste')) throw new Error('chave vazou ou não salvou')
  const p = await um(ids.cliente, `select public.sos_ia_publico()`)
  if (!p.ativa) throw new Error('não ativou')
  return p
})
await etapa('credencial da IA negada para conta logada', async () => {
  try {
    await comoPapel(ids.admin, `select public.sos_ia_credencial()`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('credencial da IA para a função do servidor', async () => (await um(null, `select public.sos_ia_credencial()`)).chave === 'sk-teste')
await etapa('remover a chave desliga a IA para o app', async () => {
  await um(ids.admin, `select public.sos_salvar_config('{"ia_remover_chave":true}'::jsonb)`)
  return (await um(ids.cliente, `select public.sos_ia_publico()`)).ativa
})

// ── compartilhar, agendamento, lembretes, config
await etapa('link público de acompanhamento', async () => {
  const token = await um(ids.cliente, `select public.sos_compartilhar('${ch.id}', 12)`)
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  const r = await db.query(`select public.sos_acompanhar($1) as a`, [token])
  return r.rows[0].a.status_rotulo
})
await etapa('agendamento pelo cliente e confirmação da central', async () => {
  const id = await um(ids.cliente, `select public.sos_solicitar_agendamento('{"tipo":"revisao","veiculo_id":"50000000-0000-0000-0000-000000000001","periodo":"manha"}'::jsonb)`)
  await um(ids.admin, `select public.sos_atualizar_agendamento('${id}', 'confirmado', now() + interval '2 days', 'Traga o caminhão às 8h', null)`)
  return um(null, `select status from public.sos_agendamentos where id = '${id}'`)
})
await etapa('gerar lembretes', () => um(ids.admin, `select public.sos_gerar_lembretes()`))
await etapa('salvar config (e chave do WhatsApp não volta)', async () => {
  const c = await um(ids.admin, `select public.sos_salvar_config('{"modo_distribuicao":"manual","whatsapp_ativo":true,"whatsapp_url":"https://evo.x","whatsapp_instancia":"tecnoar","whatsapp_destinos":["11999990000"],"whatsapp_apikey":"segredo"}'::jsonb)`)
  if (c.whatsapp_apikey || !c.whatsapp_apikey_definida) throw new Error('chave vazou ou não salvou')
  return c.modo_distribuicao
})
await etapa('WhatsApp disparado no próximo SOS (depois do chamado existir)', async () => {
  await um(ids.cliente2, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"roda_pneu","latitude":-22.9,"longitude":-43.2}'::jsonb)`)
  const r = await como(null, `select url, body from net.chamadas order by id desc limit 1`)
  if (!r.length) throw new Error('nada disparado')
  return r[0].body.text.split('\n').slice(0, 3).join(' | ')
})
await etapa('modo manual: chamado nasce "recebido"', () => um(null, `select status from public.sos_chamados order by numero desc limit 1`))
await etapa('info pública', () => um(null, `select public.sos_info_publica()`))
await etapa('buscar cliente pela placa', async () => (await como(ids.admin, `select nome from public.sos_buscar_cliente('ABC1')`)).map((x) => x.nome))
await etapa('contas do app', async () => (await um(ids.admin, `select public.sos_contas_app(null)`)).length)
await etapa('limpar rastro antigo', () => um(null, `select public.sos_limpar_posicoes()`))
await etapa('relatório gerencial do período', async () => {
  const r = await um(ids.admin, `select public.sos_relatorio(now() - interval '1 day', now() + interval '1 day')`)
  if (!r.ok || r.total < 3 || !r.itens.length || !r.por_mecanico.length) throw new Error(JSON.stringify(r).slice(0, 300))
  return { total: r.total, valor_itens: r.valor_itens, itens: r.itens.length, mecanicos: r.por_mecanico.map((m) => m.nome) }
})
await etapa('relatório negado a cliente', async () => (await um(ids.cliente, `select public.sos_relatorio(now() - interval '1 day', now())`)).ok)
await etapa('central põe mecânico 2 offline e registra viatura', async () => {
  const m = await um(ids.admin, `select public.sos_central_mecanico('${ids.mec2}', '{"situacao":"offline","veiculo_apoio":"Strada branca ABC1D23"}'::jsonb)`)
  if (m.situacao !== 'offline' || m.veiculo_apoio !== 'Strada branca ABC1D23') throw new Error(JSON.stringify(m))
  return m.situacao
})
await etapa('central inclui no SOS um usuário que não é mecânico', async () => {
  await um(ids.admin, `select public.sos_central_mecanico('${ids.atendente}', '{"situacao":"offline"}'::jsonb)`)
  return (await um(ids.atendente, `select public.sos_meu_papel()`)).papel
})
await etapa('mecânico não gere a ficha dos outros', async () => {
  try {
    await um(ids.mec1, `select public.sos_central_mecanico('${ids.mec2}', '{"situacao":"disponivel"}'::jsonb)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})

// ── RLS: cada um vê só o que é seu
async function comoPapel(uid, sqlTxt) {
  await db.exec(`set role authenticated`)
  try {
    return await como(uid, sqlTxt)
  } finally {
    await db.exec(`reset role`)
  }
}
await etapa('RLS: cliente 1 vê só os próprios chamados', async () => {
  const r = await comoPapel(ids.cliente, `select count(*)::int as n, count(*) filter (where cliente_id <> '${CLIENTE1}')::int as alheios from public.sos_chamados`)
  if (!r[0].n || r[0].alheios !== 0) throw new Error(JSON.stringify(r[0]))
  return r[0].n
})
await etapa('RLS: cliente 1 vê só o próprio cadastro de cliente', async () => {
  const r = await comoPapel(ids.cliente, `select count(*)::int as n from public.clientes`)
  if (r[0].n !== 1) throw new Error('viu ' + r[0].n)
  return r[0].n
})
await etapa('RLS: cliente 2 não vê posições do chamado do cliente 1', async () => {
  const r = await comoPapel(ids.cliente2, `select count(*)::int as n from public.sos_posicoes where chamado_id = '${ch.id}'`)
  if (r[0].n !== 0) throw new Error('viu ' + r[0].n)
  return 0
})
await etapa('RLS: central vê todos', async () => (await comoPapel(ids.admin, `select count(*)::int as n from public.sos_chamados`))[0].n)
await etapa('RLS: cliente não altera chamado direto', async () => {
  await comoPapel(ids.cliente, `update public.sos_chamados set status = 'concluido' where id = '${ch2.id}'`)
  return um(null, `select status from public.sos_chamados where id = '${ch2.id}'`)
})
await etapa('RLS (pior caso): cliente não lê a tabela de usuários', async () => {
  const r = await comoPapel(ids.cliente, `select count(*)::int as n from public.usuarios`)
  if (r[0].n !== 0) throw new Error('viu ' + r[0].n)
  return 0
})
await etapa('RLS (pior caso): cliente não lê produtos nem perfis', async () => {
  const a = await comoPapel(ids.cliente, `select count(*)::int as n from public.produtos`)
  const b = await comoPapel(ids.cliente, `select count(*)::int as n from public.perfil_permissoes`)
  if (a[0].n || b[0].n) throw new Error('viu ' + a[0].n + '/' + b[0].n)
  return 0
})
await etapa('RLS (pior caso): cliente 2 não vê a OS nem o veículo do cliente 1', async () => {
  const a = await comoPapel(ids.cliente2, `select count(*)::int as n from public.ordens_servico`)
  const b = await comoPapel(ids.cliente2, `select count(*)::int as n from public.veiculos where placa = 'ABC1D23'`)
  if (a[0].n || b[0].n) throw new Error('viu ' + a[0].n + '/' + b[0].n)
  return 0
})
await etapa('RLS (pior caso): cliente 1 vê a própria OS gerada pelo SOS', async () => {
  const r = await comoPapel(ids.cliente, `select count(*)::int as n, count(*) filter (where cliente_id <> '${CLIENTE1}')::int as alheias from public.ordens_servico`)
  if (!r[0].n || r[0].alheias !== 0) throw new Error(JSON.stringify(r[0]))
  return r[0].n
})
await etapa('RLS (pior caso): cliente não altera cadastro de cliente direto', async () => {
  await comoPapel(ids.cliente, `update public.clientes set nome_razao = 'hack' where id = '40000000-0000-0000-0000-000000000001'`).catch(() => {})
  const n = await um(null, `select nome_razao from public.clientes where id = '40000000-0000-0000-0000-000000000001'`)
  if (n === 'hack') throw new Error('alterou')
  return n
})
await etapa('RLS (pior caso): cliente atualiza km do próprio veículo', async () => {
  await comoPapel(ids.cliente, `update public.veiculos set km_atual = 250500 where id = '50000000-0000-0000-0000-000000000001'`)
  return um(null, `select km_atual from public.veiculos where id = '50000000-0000-0000-0000-000000000001'`)
})
await etapa('RLS (pior caso): cliente não lê notificação alheia', async () => {
  const r = await comoPapel(ids.cliente, `select count(*)::int as n from public.notificacoes where usuario_id <> '${ids.cliente}'`)
  if (r[0].n !== 0) throw new Error('viu ' + r[0].n)
  return 0
})
await etapa('RLS (pior caso): equipe continua vendo tudo', async () => (await comoPapel(ids.atendente, `select count(*)::int as n from public.clientes`))[0].n)
await etapa('RLS: cliente lê as próprias notificações', async () => (await comoPapel(ids.cliente, `select count(*)::int as n from public.notificacoes`))[0].n)

// ── LGPD: o cliente exclui a própria conta
await etapa('excluir conta com SOS em andamento é recusado', async () => {
  try {
    await um(ids.cliente2, `select public.sos_excluir_minha_conta('EXCLUIR')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('mecânico não exclui conta pelo app', async () => {
  try {
    await um(ids.mec1, `select public.sos_excluir_minha_conta('EXCLUIR')`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('cliente 2 encerra o SOS e exclui a conta', async () => {
  const ativos = await como(null, `select id from public.sos_chamados where conta_usuario_id = '${ids.cliente2}' and status not in ('servico_finalizado','concluido','cancelado')`)
  for (const a of ativos) await um(ids.cliente2, `select public.sos_cancelar('${a.id}', 'Encerrando conta')`)
  await um(ids.cliente2, `select public.sos_excluir_minha_conta('excluir')`)
  const conta = await um(null, `select count(*)::int from public.sos_contas_cliente where usuario_id = '${ids.cliente2}'`)
  const auth = await um(null, `select count(*)::int from auth.users where id = '${ids.cliente2}'`)
  const hist = await um(null, `select count(*)::int from public.sos_chamados c join public.clientes cl on cl.id = c.cliente_id where cl.nome_razao = 'Maria Souza'`)
  if (conta || auth || !hist) throw new Error(JSON.stringify({ conta, auth, hist }))
  return { conta_apagada: true, historico_da_empresa_mantido: hist }
})

// ── Conta da equipe também como cliente (modo cliente do app)
await etapa('funcionário ativo cria o perfil de cliente e continua mecânico', async () => {
  const r = await um(ids.admin, `select public.sos_registrar_conta('Admin Teste', '(11) 97777-0001')`)
  if (r.papel !== 'mecanico' || !r.central || !r.cliente?.cliente_id) throw new Error(JSON.stringify(r))
  return { papel: r.papel, cliente: Boolean(r.cliente) }
})
const chEquipe = await etapa('no modo cliente, a equipe pede SOS para si (sem informar cliente)', async () => {
  const c = await um(ids.admin, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"roda_pneu","descricao":"Teste do modo cliente","latitude":-23.5,"longitude":-46.6}'::jsonb)`)
  if (c.conta_usuario_id !== ids.admin || c.origem !== 'app' || c.aberto_por_equipe) throw new Error(JSON.stringify(c))
  const ev = await um(null, `select autor_papel from public.sos_eventos where chamado_id = '${c.id}' order by ocorrido_em limit 1`)
  if (ev !== 'cliente') throw new Error('evento como ' + ev)
  return c
})
await etapa('central sem cliente informado e sem perfil de cliente continua barrada', async () => {
  try {
    await um(ids.atendente, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"roda_pneu"}'::jsonb)`)
  } catch (e) {
    return e.message
  }
  throw new Error('permitiu')
})
await etapa('o dono do pedido cancela como cliente', async () => {
  const c = await um(ids.admin, `select public.sos_cancelar('${chEquipe.id}', 'Era só um teste')`)
  if (c.cancelado_por_papel !== 'cliente') throw new Error(c.cancelado_por_papel)
  return c.cancelado_por_papel
})

// ── OS em campo: gerada na chegada, texto e km chegam depois
const chCampo = await etapa('OS em campo: pedido, aceite e chegada', async () => {
  const c = await um(ids.admin, `select public.sos_abrir_chamado('{"tipo_ocorrencia":"freios","descricao":"Teste OS em campo","latitude":-23.5,"longitude":-46.6,"placa":"TST1A23"}'::jsonb)`)
  await um(ids.mec1, `select public.sos_aceitar('${c.id}', -23.52, -46.62)`)
  await um(ids.mec1, `select public.sos_avancar('${c.id}', 'no_local')`)
  return c
})
const osCampo = await etapa('mecânico gera a OS na chegada', async () => {
  const os = await um(ids.mec1, `select public.sos_gerar_os('${chCampo.id}')`)
  if (!os) throw new Error('sem OS')
  return os
})
await etapa('diagnóstico salvo depois chega à OS', async () => {
  await um(ids.mec1, `select public.sos_salvar_atendimento('${chCampo.id}', '{"diagnostico":"Pastilha no fim","servico_realizado":"Troca de pastilhas"}'::jsonb)`)
  const o = (await como(null, `select diagnostico, observacoes from public.ordens_servico where id = '${osCampo}'`))[0]
  if (o.diagnostico !== 'Pastilha no fim' || !o.observacoes.includes('Troca de pastilhas')) throw new Error(JSON.stringify(o))
  return o.diagnostico
})
await etapa('km informado em campo vai para o veículo e a OS', async () => {
  await um(ids.mec1, `select public.sos_registrar_km('${chCampo.id}', 123456)`)
  const r = (await como(null, `select v.km_atual, o.km from public.sos_chamados c join public.veiculos v on v.id = c.veiculo_id join public.ordens_servico o on o.id = c.os_id where c.id = '${chCampo.id}'`))[0]
  if (r.km_atual !== 123456 || r.km !== 123456) throw new Error(JSON.stringify(r))
  return r
})
await etapa('km menor que o do cadastro é recusado', async () => {
  try {
    await um(ids.mec1, `select public.sos_registrar_km('${chCampo.id}', 1000)`)
  } catch (e) {
    return e.message
  }
  throw new Error('aceitou')
})
await etapa('o que a oficina editou na OS não é atropelado', async () => {
  await um(null, `update public.ordens_servico set diagnostico = 'Revisado pela oficina' where id = '${osCampo}'`)
  await um(ids.mec1, `select public.sos_salvar_atendimento('${chCampo.id}', '{"diagnostico":"Outro texto do campo"}'::jsonb)`)
  const d = await um(null, `select diagnostico from public.ordens_servico where id = '${osCampo}'`)
  if (d !== 'Revisado pela oficina') throw new Error(d)
  return d
})
await etapa('finalizar sem serviço do catálogo põe o serviço descrito na OS', async () => {
  await um(ids.mec1, `select public.sos_avancar('${chCampo.id}', 'servico_iniciado')`)
  await um(ids.mec1, `select public.sos_avancar('${chCampo.id}', 'servico_finalizado')`)
  const n = await um(null, `select count(*)::int from public.os_servicos where os_id = '${osCampo}' and descricao like 'Socorro: %'`)
  if (n !== 1) throw new Error('linhas: ' + n)
  return n
})

// ── OS e estoque no app (estoque da Omie − comprometido no Tecnoar)
const PST = '70000000-0000-0000-0000-000000000001'
await etapa('catálogo mostra o disponível real (saldo − reservado − comprometido)', async () => {
  const r = (await como(ids.mec1, `select * from public.sos_catalogo('Pastilha', 'produto')`))[0]
  const esperado = Math.max(Number(r.saldo) - Number(r.reservado ?? 0) - Number(r.comprometido), 0)
  if (Number(r.disponivel) !== esperado || Number(r.comprometido) < 0) throw new Error(JSON.stringify(r))
  return { saldo: r.saldo, comprometido: r.comprometido, disponivel: r.disponivel }
})
await etapa('peças do socorro finalizado ficam "utilizado" na OS', async () => {
  const r = await como(null, `select op.estado from public.os_produtos op
    join public.sos_itens i on i.os_item_id = op.id join public.sos_chamados c on c.id = i.chamado_id
    where i.tipo = 'produto' and c.status in ('servico_finalizado', 'concluido')`)
  if (!r.length || r.some((x) => x.estado !== 'utilizado')) throw new Error(JSON.stringify(r))
  return r.length + ' peça(s)'
})
await etapa('minhas OS: o mecânico vê a OS do socorro que atendeu', async () => {
  const r = await um(ids.mec1, `select public.sos_minhas_os('abertas')`)
  if (!r.lista.some((o) => o.id === osCampo)) throw new Error(JSON.stringify(r).slice(0, 300))
  return { total: r.lista.length, pode_criar: r.pode_criar }
})
await etapa('mecânico sem permissão não abre OS pelo app', async () => {
  try {
    await um(ids.mec1, `select public.sos_os_criar('50000000-0000-0000-0000-000000000001', 'Teste')`)
  } catch (e) {
    return e.message
  }
  throw new Error('abriu')
})
const osApp = await etapa('quem tem permissão acha o veículo pela placa e abre a OS pelo app', async () => {
  const achados = await um(ids.admin, `select public.sos_os_buscar_veiculo('abc1')`)
  if (!achados.length) throw new Error('placa não encontrada')
  const nada = await um(ids.mec1, `select public.sos_os_buscar_veiculo('abc1')`)
  if (nada.length) throw new Error('mecânico sem permissão buscou')
  return um(ids.admin, `select public.sos_os_criar('${achados[0].id}', 'Revisão de freios em campo')`)
})
await etapa('peça além do disponível entra como "necessário" e avisa a central', async () => {
  await um(null, `update public.produtos set saldo = 3, reservado = 1 where id = '${PST}'`)
  const r = await um(ids.admin, `select public.sos_os_adicionar_item('${osApp}', 'produto', '${PST}', 50)`)
  const e = await um(null, `select estado from public.os_produtos where id = '${r.id}'`)
  const aviso = await um(null, `select count(*)::int from public.notificacoes where titulo like 'Peça sem estoque%'`)
  if (!r.estoque.faltou || e !== 'necessario' || aviso < 1) throw new Error(JSON.stringify({ r, e, aviso }))
  return { estado: e, disponivel_antes: r.estoque.disponivel_antes }
})
await etapa('serviço, quantidade, remoção, km e diagnóstico pela OS no app', async () => {
  const sv = await um(ids.admin, `select public.sos_os_adicionar_item('${osApp}', 'servico', '80000000-0000-0000-0000-000000000001', 1)`)
  const d1 = await um(ids.admin, `select public.sos_os_detalhe('${osApp}')`)
  const peca = d1.produtos[0]
  await um(ids.admin, `select public.sos_os_alterar_item('${osApp}', '${peca.id}', 2)`)
  await um(ids.admin, `select public.sos_os_alterar_item('${osApp}', '${sv.id}', 0)`)
  const d2 = await um(ids.admin, `select public.sos_os_atualizar('${osApp}', 999999, 'Lona traseira no limite', null)`)
  const km = await um(null, `select km_atual from public.veiculos where id = '50000000-0000-0000-0000-000000000001'`)
  // (Os totais da OS vêm do gatilho do Checklist, que o esqueleto de teste não tem.)
  if (d2.produtos[0].quantidade != 2 || d2.servicos.length !== 0 || d2.os.diagnostico !== 'Lona traseira no limite' || km !== 999999) {
    throw new Error(JSON.stringify(d2).slice(0, 400))
  }
  return { quantidade: d2.produtos[0].quantidade, km, editar: d2.pode_editar }
})
await etapa('peça comprometida em OS aberta sai do disponível', async () => {
  const r = (await como(ids.admin, `select * from public.sos_catalogo('Pastilha', 'produto')`))[0]
  if (Number(r.comprometido) < 2 || Number(r.disponivel) !== 0) throw new Error(JSON.stringify(r))
  return { comprometido: r.comprometido, disponivel: r.disponivel }
})

// ── Chamado aberto pelo mecânico em campo, ligado à OS aberta do veículo
await etapa('catálogo sem termo lista o cadastro inteiro do sistema', async () => {
  const r = await como(ids.mec1, `select * from public.sos_catalogo('', null, 60, 0)`)
  if (!r.some((x) => x.tipo === 'produto') || !r.some((x) => x.tipo === 'servico')) throw new Error(JSON.stringify(r).slice(0, 300))
  return r.length + ' itens'
})
await etapa('mecânico acha o cliente pela placa, com a OS aberta do veículo', async () => {
  const r = await um(ids.mec1, `select public.sos_buscar_cliente_campo('abc1')`)
  const v = r[0]?.veiculos?.find((x) => x.id === '50000000-0000-0000-0000-000000000001')
  if (!v?.os_aberta?.id) throw new Error(JSON.stringify(r).slice(0, 300))
  return { cliente: r[0].nome, os_aberta: v.os_aberta.numero }
})
const chMec = await etapa('mecânico abre chamado no local e liga à OS aberta', async () => {
  const c = await um(ids.mec1, `select public.sos_mecanico_abrir_chamado($1::jsonb)`, [JSON.stringify({
    veiculo_id: '50000000-0000-0000-0000-000000000001', tipo_ocorrencia: 'freios', descricao: 'Cliente parou na oficina móvel',
    latitude: -23.55, longitude: -46.63, precisao_m: 6, ja_no_local: true, os_id: osApp,
  })])
  const m = await um(null, `select count(*)::int from public.os_mecanicos where os_id = '${osApp}' and usuario_id = '${ids.mec1}'`)
  if (c.status !== 'no_local' || c.origem !== 'mecanico' || c.mecanico_id !== ids.mec1 || c.os_id !== osApp || m !== 1) {
    throw new Error(JSON.stringify(c).slice(0, 300))
  }
  return c
})
await etapa('com um atendimento aberto, não abre outro', async () => {
  try {
    await um(ids.mec1, `select public.sos_mecanico_abrir_chamado('{"cliente_nome":"Outro","descricao":"x"}'::jsonb)`)
  } catch (e) {
    return e.message
  }
  throw new Error('abriu')
})
await etapa('peça lançada no chamado entra reservada na OS vinculada', async () => {
  await um(null, `update public.produtos set saldo = 100, reservado = 0 where id = '${PST}'`)
  const it = await um(ids.mec1, `select public.sos_adicionar_item('${chMec.id}', 'produto', '${PST}', 1)`)
  const e = await um(null, `select estado from public.os_produtos where id = (select os_item_id from public.sos_itens where id = '${it.id}')`)
  if (e !== 'reservado') throw new Error(String(e))
  return e
})
await etapa('mecânico finaliza e abre outro, a caminho, com cliente novo', async () => {
  await um(ids.mec1, `select public.sos_avancar('${chMec.id}', 'servico_iniciado')`)
  await um(ids.mec1, `select public.sos_salvar_atendimento('${chMec.id}', '{"diagnostico":"Pastilha gasta","servico_realizado":"Troca"}'::jsonb)`)
  await um(ids.mec1, `select public.sos_avancar('${chMec.id}', 'servico_finalizado')`)
  const c = await um(ids.mec1, `select public.sos_mecanico_abrir_chamado($1::jsonb)`, [JSON.stringify({
    cliente_nome: 'Transportes Estrada', telefone: '(11) 95555-4444', placa: 'NOV2B34', tipo_ocorrencia: 'nao_liga',
    descricao: 'Caminhão não liga no pátio do cliente', latitude: -23.6, longitude: -46.7, ja_no_local: false,
    mecanico_lat: -23.55, mecanico_lng: -46.63,
  })])
  const aviso = await um(null, `select count(*)::int from public.notificacoes where titulo = 'Cliente cadastrado em campo'`)
  const livres = await um(ids.mec1, `select public.sos_os_para_vincular('${c.id}')`)
  if (c.status !== 'a_caminho' || !c.veiculo_id || !(Number(c.distancia_km) > 0) || aviso < 1 || livres.length !== 0) {
    throw new Error(JSON.stringify({ c, aviso, livres }).slice(0, 400))
  }
  return { status: c.status, distancia_km: c.distancia_km, eta_min: c.eta_min }
})

console.log(`\nTUDO CERTO — ${passos} etapas.`)
