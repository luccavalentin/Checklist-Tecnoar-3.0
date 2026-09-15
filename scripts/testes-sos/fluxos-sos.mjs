/**
 * Teste de fluxos do app SOS — toca na tela como o usuário e confere o que
 * vai para o banco.
 *
 * Roda contra o app local (SOS_URL, padrão http://localhost:5174) com o
 * Supabase simulado de mock-sos.mjs: nada chega à produção. Cada fluxo abre
 * um contexto limpo, anota as chamadas às funções do banco e falha com print
 * da tela no passo que não funcionou.
 *
 * Uso:  node scripts/testes-sos/fluxos-sos.mjs           (todos)
 *       SOS_FLUXO=nova-os node scripts/testes-sos/fluxos-sos.mjs
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { BASE, IDS, configurar, rpcResposta } from './mock-sos.mjs'

const OUT = path.resolve('output/playwright/fluxos-sos')

function rpcJson(data) {
  return { status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(data) }
}

/** Abre um contexto de celular com a persona, anotando cada chamada ao banco. */
async function abrir(browser, persona, caminho, respostas = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    colorScheme: 'light',
  })
  await configurar(context, persona, 'claro')
  const chamadas = []
  // Respostas específicas do fluxo: rota registrada depois vence a do mock.
  await context.route('**/rest/v1/rpc/**', async (route) => {
    const req = route.request()
    const nome = decodeURIComponent(new URL(req.url()).pathname.split('/rest/v1/rpc/')[1] || '')
    let corpo = null
    try {
      corpo = req.postDataJSON()
    } catch {
      corpo = req.postData()
    }
    chamadas.push({ nome, corpo })
    if (nome in respostas) return route.fulfill(rpcJson(typeof respostas[nome] === 'function' ? respostas[nome](corpo) : respostas[nome]))
    return route.fallback()
  })
  // Trava de produção: toda chamada ao Supabase que a simulação não cobre
  // (login, funções de borda, storage) é barrada e anotada. Registrada por
  // último, roda primeiro: o que é banco ou sessão segue para a simulação.
  const bloqueadas = []
  await context.route(/supabase\.co/, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.startsWith('/rest/v1/') || u.pathname.startsWith('/auth/v1/user') || u.pathname.startsWith('/functions/v1/omie-produto')) return route.fallback()
    bloqueadas.push(`${route.request().method()} ${u.pathname}`)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto(`${BASE}${caminho}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
  return { context, page, chamadas, erros, bloqueadas, chamou: (n) => chamadas.filter((c) => c.nome === n) }
}

function esperar(cond, msg) {
  if (!cond) throw new Error(msg)
}

const fluxos = []
const fluxo = (id, nome, fn) => fluxos.push({ id, nome, fn })

/* ── mecânico: OS ─────────────────────────────────────────────────────── */

fluxo('nova-os-cliente-existente', 'Mecânico abre OS escolhendo cliente e veículo da busca', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/os')
  await t.page.getByRole('button', { name: /nova os/i }).click()
  await t.page.waitForURL(/\/os\/nova$/)
  await t.page.getByLabel(/buscar cliente/i).fill('Nova Rota')
  await t.page.getByRole('button', { name: /EIX-?4A10/i }).first().click()
  await t.page.getByLabel(/problema relatado/i).fill('Freio travando na roda traseira esquerda')
  await t.page.getByLabel(/quilometragem/i).fill('412300')
  await t.page.getByRole('button', { name: /^continuar$/i }).click()
  await t.page.getByText('Conferir e abrir').waitFor()
  await t.page.getByRole('button', { name: /abrir os/i }).click()
  await t.page.waitForURL(new RegExp(`/os/${IDS.osNova}\\?adicionar=produto`))
  const p = t.chamou('sos_os_abrir')[0]?.corpo?.p
  esperar(p, 'sos_os_abrir não foi chamada')
  esperar(p.cliente_id === IDS.clienteCadastro && p.veiculo_id === IDS.veiculo, `cliente/veículo errados: ${JSON.stringify(p)}`)
  esperar(!p.cliente_nome && !p.placa, 'mandou cadastro novo junto do escolhido')
  esperar(p.km === '412300' && /travando/.test(p.problema), `km/problema: ${JSON.stringify(p)}`)
  return t
})

fluxo('nova-os-cliente-novo', 'Mecânico abre OS cadastrando cliente novo com CPF e placa', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/os/nova', {
    sos_buscar_cliente_campo: [],
    sos_os_abrir: { id: IDS.osNova, numero: 4823, cliente_id: 'novo', veiculo_id: 'novo', cliente_novo: true },
  })
  await t.page.getByLabel(/buscar cliente/i).fill('Frota Rio Verde')
  await t.page.getByRole('button', { name: /cadastrar cliente novo/i }).click()
  await t.page.getByLabel(/nome do cliente/i).fill('Frota Rio Verde')
  await t.page.getByLabel(/celular com ddd/i).fill('19988887777')
  await t.page.getByLabel(/cpf ou cnpj/i).fill('12345678909')
  await t.page.getByLabel(/^placa/i).fill('RIO4V56')
  await t.page.getByRole('button', { name: /^continuar$/i }).click()
  await t.page.getByLabel(/problema relatado/i).fill('Revisão completa do freio')
  await t.page.getByRole('button', { name: /^continuar$/i }).click()
  await t.page.getByText(/cliente novo/i).first().waitFor()
  await t.page.getByRole('button', { name: /abrir os/i }).click()
  await t.page.waitForURL(/\/os\/.+\?adicionar=produto/)
  const p = t.chamou('sos_os_abrir')[0]?.corpo?.p
  esperar(p, 'sos_os_abrir não foi chamada')
  esperar(!p.cliente_id && p.cliente_nome === 'Frota Rio Verde', `cliente: ${JSON.stringify(p)}`)
  esperar(p.telefone.replace(/\D/g, '') === '19988887777', `telefone: ${p.telefone}`)
  esperar(p.documento === '12345678909', `documento: ${p.documento}`)
  esperar(p.placa === 'RIO4V56' && !p.veiculo_id, `placa: ${JSON.stringify(p)}`)
  return t
})

fluxo('nova-os-exige-placa', 'Nova OS não deixa seguir sem placa', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/os/nova', { sos_buscar_cliente_campo: [] })
  await t.page.getByLabel(/buscar cliente/i).fill('Sem Placa Ltda')
  await t.page.getByRole('button', { name: /cadastrar cliente novo/i }).click()
  await t.page.getByLabel(/nome do cliente/i).fill('Sem Placa Ltda')
  await t.page.getByLabel(/celular com ddd/i).fill('11977776666')
  await t.page.getByRole('button', { name: /^continuar$/i }).click()
  await t.page.getByText(/a os precisa do veículo/i).waitFor()
  esperar(!(await t.page.getByLabel(/problema relatado/i).count()), 'avançou sem placa')
  return t
})

/* ── mecânico: status e painel ────────────────────────────────────────── */

fluxo('status-mecanico', 'Mecânico desliga o recebimento de SOS pelo interruptor', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/', { sos_definir_situacao: {} })
  const chave = t.page.getByRole('switch')
  await chave.waitFor()
  await chave.click()
  await t.page.waitForTimeout(400)
  const c = t.chamou('sos_definir_situacao')
  esperar(c.length >= 1, 'o interruptor não chamou sos_definir_situacao')
  return t
})

/* ── cliente ──────────────────────────────────────────────────────────── */

fluxo('cliente-home-para-sos', 'Cliente toca em "Preciso de ajuda" e cai no pedido de socorro', async (browser) => {
  const t = await abrir(browser, 'cliente', '/')
  await t.page.getByRole('button', { name: /preciso de ajuda/i }).click()
  await t.page.waitForURL(/\/sos$/)
  return t
})

fluxo('cliente-pede-socorro', 'Cliente pede socorro: problema, localização e segurar para enviar', async (browser) => {
  const t = await abrir(browser, 'cliente', '/sos', {
    sos_abrir_chamado: (c) => ({
      id: IDS.chamado, numero: 1290, protocolo: 'SOS-2026-1290', status: 'recebido', prioridade: 'emergencia',
      tipo_ocorrencia: c?.p?.tipo_ocorrencia ?? 'freios', descricao: c?.p?.descricao ?? '', eta_min: null,
      latitude: c?.p?.latitude, longitude: c?.p?.longitude, created_at: new Date().toISOString(),
    }),
  })
  // 1. o que aconteceu
  await t.page.getByRole('button', { name: /problema nos freios/i }).click()
  // 2. localização (GPS simulado em São Paulo)
  const aqui = t.page.getByRole('button', { name: /sim, estou aqui/i })
  await aqui.waitFor()
  await t.page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sim, estou aqui/i.test(x.textContent || ''))
    return b && !b.disabled
  }, null, { timeout: 8000 })
  await aqui.click()
  // 3. confirmar segurando o botão por mais de um segundo
  const segurar = t.page.getByRole('button', { name: /segure para pedir sos/i })
  await segurar.waitFor()
  await segurar.hover()
  await t.page.mouse.down()
  await t.page.waitForTimeout(1300)
  await t.page.mouse.up()
  await t.page.getByText(/SOS-2026-1290/).first().waitFor({ timeout: 8000 })
  const p = t.chamou('sos_abrir_chamado')[0]?.corpo?.p
  esperar(p, 'sos_abrir_chamado não foi chamada')
  esperar(p.tipo_ocorrencia === 'freios', `ocorrência: ${p.tipo_ocorrencia}`)
  esperar(Math.abs(p.latitude - -23.55052) < 0.01 && Math.abs(p.longitude - -46.63331) < 0.01, `local: ${p.latitude},${p.longitude}`)
  return t
})

fluxo('segurar-nao-envia-toque-rapido', 'Toque rápido no "Segure para pedir SOS" não envia (evita pedido acidental)', async (browser) => {
  const t = await abrir(browser, 'cliente', '/sos', { sos_abrir_chamado: { id: IDS.chamado, protocolo: 'X' } })
  await t.page.getByRole('button', { name: /problema nos freios/i }).click()
  await t.page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sim, estou aqui/i.test(x.textContent || ''))
    return b && !b.disabled
  }, null, { timeout: 8000 })
  await t.page.getByRole('button', { name: /sim, estou aqui/i }).click()
  const segurar = t.page.getByRole('button', { name: /segure para pedir sos/i })
  await segurar.hover()
  await t.page.mouse.down()
  await t.page.waitForTimeout(250)
  await t.page.mouse.up()
  await t.page.waitForTimeout(900)
  esperar(!t.chamou('sos_abrir_chamado').length, 'toque rápido enviou o SOS')
  return t
})

/* ── mecânico: chamado aberto em campo ────────────────────────────────── */

fluxo('mecanico-abre-chamado', 'Mecânico abre chamado com cliente da busca, no local, e cai no atendimento', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/novo-chamado', {
    sos_mecanico_abrir_chamado: (c) => ({ id: IDS.chamado, protocolo: 'SOS-2026-1291', status: 'no_local', origem: 'mecanico', cliente_id: c?.p?.cliente_id }),
  })
  // 1. cliente
  await t.page.getByLabel(/buscar cliente/i).fill('Nova Rota')
  await t.page.getByRole('button', { name: /EIX-?4A10/i }).first().click()
  // 2. problema
  await t.page.getByRole('button', { name: /freio/i }).first().click()
  await t.page.getByRole('button', { name: /^continuar$/i }).click()
  // 3. local: estou com o cliente, usando o GPS
  await t.page.getByRole('radio', { name: /estou com o cliente/i }).click()
  const usar = t.page.getByRole('button', { name: /usar minha posição/i })
  await usar.waitFor({ timeout: 10000 })
  await usar.click()
  // 4. conferir e abrir
  await t.page.getByRole('button', { name: /^abrir chamado$/i }).click()
  await t.page.waitForURL(new RegExp(`/chamado/${IDS.chamado}`), { timeout: 8000 })
  const p = t.chamou('sos_mecanico_abrir_chamado')[0]?.corpo?.p
  esperar(p, 'sos_mecanico_abrir_chamado não foi chamada')
  esperar(p.cliente_id === IDS.clienteCadastro && p.veiculo_id === IDS.veiculo, `cliente/veículo: ${JSON.stringify(p)}`)
  esperar(p.ja_no_local === true && Math.abs(p.latitude - -23.55052) < 0.01, `local: ${JSON.stringify(p)}`)
  return t
})

/* ── mecânico: aceitar, chegar, lançar peça ───────────────────────────── */

fluxo('mecanico-aceita-sos', 'Mecânico abre um SOS livre da fila, aceita e entra no atendimento', async (browser) => {
  // Um SOS de verdade livre: sem mecânico, procurando. (O chamado padrão da
  // simulação já é deste mecânico, e aí o app mostra "você já está nele".)
  const livre = () => {
    const d = rpcResposta('sos_detalhe_chamado', 'mecanico')
    d.chamado = { ...d.chamado, status: 'procurando_mecanico', mecanico_id: null, atribuido_em: null }
    return d
  }
  const t = await abrir(browser, 'mecanico', '/', { sos_detalhe_chamado: livre, sos_aceitar: { id: IDS.chamado, status: 'a_caminho' } })
  await t.page.getByRole('button', { name: /freios/i }).first().click()
  const aceitar = t.page.getByRole('button', { name: /^aceitar$/i })
  await aceitar.waitFor()
  await aceitar.click()
  await t.page.waitForTimeout(800)
  const c = t.chamou('sos_aceitar')[0]?.corpo
  esperar(c?.p_chamado, 'sos_aceitar não foi chamada')
  return t
})

fluxo('mecanico-confirma-chegada', 'Mecânico a caminho confirma a chegada ao local (no ponto do cliente, sem pergunta extra)', async (browser) => {
  // Fila sem o próprio chamado: na simulação padrão ele aparece como "aguardando".
  const semFila = () => ({ ...rpcResposta('sos_home_mecanico', 'mecanico'), aguardando: [] })
  // O chamado já é deste mecânico: papel "mecanico", não "candidato" (a simulação
  // padrão devolve candidato, e aí o app mostra — corretamente — a tela de aceite).
  const doMecanico = () => ({ ...rpcResposta('sos_detalhe_chamado', 'mecanico'), papel: 'mecanico' })
  const t = await abrir(browser, 'mecanico', `/chamado/${IDS.chamado}`, {
    sos_detalhe_chamado: doMecanico,
    sos_home_mecanico: semFila,
    sos_avancar: (c) => ({ id: IDS.chamado, status: c?.p_status }),
  })
  await t.page.getByRole('button', { name: /cheguei ao local/i }).first().click()
  // Perto do cliente o app confirma direto; longe, pergunta antes ("Confirmar chegada?").
  const confirmar = t.page.getByRole('dialog').getByRole('button', { name: /cheguei ao local/i })
  if (await confirmar.waitFor({ timeout: 1500 }).then(() => true).catch(() => false)) await confirmar.click()
  await t.page.waitForTimeout(600)
  const c = t.chamou('sos_avancar').map((x) => x.corpo?.p_status)
  esperar(c.includes('no_local'), `sos_avancar: ${JSON.stringify(c)}`)
  return t
})

fluxo('os-lanca-peca', 'Mecânico lança peça do estoque na OS', async (browser) => {
  const t = await abrir(browser, 'mecanico', `/os/${IDS.os}?adicionar=produto`, {
    sos_os_adicionar_item: { id: 'op-novo', estoque: { faltou: false, disponivel_antes: 4 } },
  })
  await t.page.getByText('Válvula relé Wabco').last().click()
  await t.page.getByRole('button', { name: /^lançar \d+ un/i }).click()
  await t.page.waitForTimeout(700)
  const c = t.chamou('sos_os_adicionar_item')[0]?.corpo
  esperar(c, 'sos_os_adicionar_item não foi chamada')
  esperar(c.p_os === IDS.os && c.p_tipo === 'produto' && c.p_ref === 'p1', `item: ${JSON.stringify(c)}`)
  return t
})

fluxo('catalogo-ficha-produto', 'Mecânico toca no produto e vê a ficha real, conferida com a Omie', async (browser) => {
  const t = await abrir(browser, 'mecanico', '/catalogo/produtos')
  await t.page.getByRole('button', { name: /ver ficha de válvula relé wabco/i }).click()
  const folha = t.page.getByRole('dialog')
  await folha.getByText(/sincronizado com a omie/i).waitFor()
  await folha.getByText('Distribuidora Freios SP').waitFor()
  await folha.getByText('8708.30.90').waitFor()
  const c = t.chamou('sos_produto_detalhe')[0]?.corpo
  esperar(c?.p_id === 'p1', `ficha: ${JSON.stringify(c)}`)
  return t
})

/* ── cliente: cancelar, veículo ───────────────────────────────────────── */

fluxo('cliente-cancela-socorro', 'Cliente cancela o socorro escolhendo o motivo', async (browser) => {
  // Ainda procurando mecânico: dentro do prazo em que o cliente cancela sozinho.
  const procurando = () => {
    const d = rpcResposta('sos_detalhe_chamado', 'cliente')
    d.chamado = { ...d.chamado, status: 'procurando_mecanico', mecanico_id: null }
    return d
  }
  const t = await abrir(browser, 'cliente', `/chamado/${IDS.chamado}`, {
    sos_detalhe_chamado: procurando,
    sos_cancelar: { id: IDS.chamado, status: 'cancelado' },
  })
  await t.page.getByRole('button', { name: /cancelar o socorro/i }).first().click()
  const folha = t.page.getByRole('dialog')
  await folha.getByText('Pedi por engano').click()
  await folha.getByRole('button', { name: /cancelar o socorro/i }).click()
  await t.page.waitForTimeout(600)
  const c = t.chamou('sos_cancelar')[0]?.corpo
  esperar(c, 'sos_cancelar não foi chamada')
  esperar(/engano/i.test(c.p_motivo), `motivo: ${c.p_motivo}`)
  return t
})

fluxo('cliente-cancelamento-bloqueado', 'Com o mecânico a caminho (fora do prazo da central), o texto não diz que o serviço começou', async (browser) => {
  const t = await abrir(browser, 'cliente', `/chamado/${IDS.chamado}`)
  const aviso = t.page.getByText(/para cancelar/i).first()
  await aviso.waitFor()
  const texto = await aviso.textContent()
  esperar(!/serviço já começou/i.test(texto ?? ''), `texto enganoso: ${texto}`)
  esperar(!(await t.page.getByRole('button', { name: /cancelar o socorro/i }).count()), 'ofereceu cancelar fora do prazo')
  return t
})

fluxo('cliente-cadastra-veiculo', 'Cliente cadastra um veículo pela placa', async (browser) => {
  const t = await abrir(browser, 'cliente', '/veiculos', { sos_cadastrar_veiculo: 'novo-veiculo' })
  await t.page.getByRole('button', { name: /adicionar/i }).first().click()
  await t.page.getByRole('textbox', { name: /^placa/i }).fill('QWE1R23')
  await t.page.getByLabel(/marca e modelo/i).fill('Mercedes Actros 2651')
  await t.page.getByRole('button', { name: /salvar veículo/i }).click()
  await t.page.waitForTimeout(600)
  const c = t.chamou('sos_cadastrar_veiculo')[0]?.corpo
  esperar(c, 'sos_cadastrar_veiculo não foi chamada')
  esperar(c.p_placa.replace(/\W/g, '').toUpperCase() === 'QWE1R23' && /Actros/.test(c.p_descricao ?? ''), `veículo: ${JSON.stringify(c)}`)
  return t
})

fluxo('login-email-invalido', 'Login com e-mail inválido não chega a pedir acesso ao servidor', async (browser) => {
  const t = await abrir(browser, 'anonimo', '/entrar')
  await t.page.getByLabel(/e-mail/i).fill('isso-nao-e-email')
  await t.page.getByLabel(/^senha/i).fill('qualquer')
  await t.page.getByRole('button', { name: /^entrar$/i }).click()
  await t.page.waitForTimeout(500)
  esperar(/\/entrar/.test(t.page.url()), 'saiu da tela de login')
  esperar(!t.bloqueadas.some((b) => b.includes('/auth/v1/token')), 'tentou autenticar com e-mail inválido')
  return t
})

/* ── execução ─────────────────────────────────────────────────────────── */

await mkdir(OUT, { recursive: true })
const escolhido = process.env.SOS_FLUXO
const browser = await chromium.launch()
let falhas = 0
for (const f of fluxos.filter((x) => !escolhido || x.id.includes(escolhido))) {
  let t = null
  try {
    t = await f.fn(browser)
    esperar(!t.erros.length, `erro de JavaScript: ${t.erros[0]}`)
    console.log(`  ok     ${f.nome}`)
    if (t.bloqueadas.length) console.log(`         (barrado antes de chegar à produção: ${[...new Set(t.bloqueadas)].join(', ')})`)
  } catch (e) {
    falhas++
    console.log(`  FALHOU ${f.nome}\n         ${String(e.message).split('\n')[0]}`)
    const pagina = t?.page ?? (await browser.contexts().at(-1)?.pages().at(-1))
    if (pagina) await pagina.screenshot({ path: path.join(OUT, `${f.id}.png`) }).catch(() => {})
  } finally {
    for (const c of browser.contexts()) await c.close().catch(() => {})
  }
}
await browser.close()
console.log(falhas ? `\n${falhas} fluxo(s) falharam — prints em ${OUT}` : '\nTodos os fluxos passaram.')
process.exitCode = falhas ? 1 : 0
