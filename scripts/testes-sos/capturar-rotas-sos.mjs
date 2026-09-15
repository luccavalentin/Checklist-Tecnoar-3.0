import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.SOS_URL || 'http://localhost:5174'
const OUT = path.resolve('output/playwright/rotas-sos')
const AGORA = new Date('2026-09-13T09:30:00-03:00')
const iso = (min = 0) => new Date(AGORA.getTime() + min * 60_000).toISOString()

const IDS = {
  cliente: '11111111-1111-4111-8111-111111111111',
  mecanico: '22222222-2222-4222-8222-222222222222',
  equipe: '33333333-3333-4333-8333-333333333333',
  clienteCadastro: '44444444-4444-4444-8444-444444444444',
  veiculo: '55555555-5555-4555-8555-555555555555',
  chamado: '66666666-6666-4666-8666-666666666666',
  chamadoFinalizado: '77777777-7777-4777-8777-777777777777',
}

const veiculo = {
  id: IDS.veiculo,
  placa: 'RTA8J42',
  marca: 'Volvo',
  modelo: 'FH 540',
  ano: 2022,
  km_atual: 184230,
  descricao: 'Cavalo mecânico',
  tipo: 'caminhao',
  cor: 'Prata',
}

function chamado(overrides = {}) {
  return {
    id: IDS.chamado,
    numero: 1284,
    protocolo: 'SOS-2026-1284',
    cliente_id: IDS.clienteCadastro,
    veiculo_id: IDS.veiculo,
    conta_usuario_id: IDS.cliente,
    aberto_por_equipe: null,
    origem: 'app_cliente',
    tipo_ocorrencia: 'freios',
    descricao: 'Pedal endureceu e a pressão de ar caiu na rodovia.',
    prioridade: 'emergencia',
    status: 'a_caminho',
    latitude: -23.55052,
    longitude: -46.63331,
    precisao_m: 12,
    endereco: 'Marginal Tietê, sentido Castelo Branco',
    ponto_ajustado: false,
    telefone_contato: '1197557540',
    mecanico_id: IDS.mecanico,
    atribuido_em: iso(-22),
    atribuido_por: null,
    os_id: null,
    diagnostico: null,
    servico_realizado: null,
    observacoes_finais: null,
    pecas_utilizadas: null,
    distancia_km: 8.4,
    eta_min: 16,
    recebido_em: iso(-28),
    aceito_em: iso(-22),
    a_caminho_em: iso(-18),
    chegou_em: null,
    iniciado_em: null,
    finalizado_em: null,
    concluido_em: null,
    cancelado_em: null,
    cancelado_por: null,
    cancelado_por_papel: null,
    motivo_cancelamento: null,
    tempo_aceite_seg: 355,
    tempo_deslocamento_seg: null,
    tempo_servico_seg: null,
    tempo_total_seg: null,
    avaliacao_nota: null,
    avaliacao_comentario: null,
    avaliado_em: null,
    contexto_ia: null,
    espera_desde: iso(-28),
    alerta_nivel: 0,
    alerta_em: null,
    eta_inicial_min: 19,
    atraso_avisado_em: null,
    sinal_avisado_em: null,
    distancia_inicial_km: 8.7,
    orcamento_status: null,
    orcamento_valor: null,
    orcamento_enviado_em: null,
    orcamento_respondido_em: null,
    orcamento_assinatura: null,
    orcamento_observacao: null,
    orcamento_desatualizado: false,
    contrato_id: null,
    sla_chegada_min: 40,
    sla_avisado_em: null,
    ia_kit: null,
    ia_resumo: null,
    created_at: iso(-28),
    updated_at: iso(-2),
    ...overrides,
  }
}

const chamadoAtivo = chamado()
const chamadoFinalizado = chamado({
  id: IDS.chamadoFinalizado,
  numero: 1260,
  protocolo: 'SOS-2026-1260',
  tipo_ocorrencia: 'pneu',
  descricao: 'Pneu estourou próximo ao posto.',
  prioridade: 'alta',
  status: 'concluido',
  recebido_em: iso(-60 * 24 * 7),
  aceito_em: iso(-60 * 24 * 7 + 8),
  a_caminho_em: iso(-60 * 24 * 7 + 12),
  chegou_em: iso(-60 * 24 * 7 + 34),
  iniciado_em: iso(-60 * 24 * 7 + 40),
  finalizado_em: iso(-60 * 24 * 7 + 92),
  concluido_em: iso(-60 * 24 * 7 + 110),
  avaliacao_nota: 5,
  avaliado_em: iso(-60 * 24 * 7 + 130),
  eta_min: null,
})

function papel(persona) {
  if (persona === 'cliente') {
    return {
      papel: 'cliente',
      usuario_id: IDS.cliente,
      nome: 'Lucca Santana',
      telefone: '1197557540',
      email: 'cliente@sos.local',
      cliente_id: IDS.clienteCadastro,
      veiculo_principal_id: IDS.veiculo,
      aceite_termos_em: iso(-5000),
      aceite_localizacao_em: iso(-5000),
    }
  }
  if (persona === 'mecanico') {
    return {
      papel: 'mecanico',
      central: false,
      usuario_id: IDS.mecanico,
      nome: 'Rafael Almeida',
      avatar_url: null,
      telefone: '11980000000',
      mecanico: fichaMecanico(),
    }
  }
  return {
    papel: 'equipe',
    central: true,
    usuario_id: IDS.equipe,
    nome: 'Lucca Santana',
    avatar_url: null,
    telefone: '1197557540',
    mecanico: null,
  }
}

function fichaMecanico(overrides = {}) {
  return {
    usuario_id: IDS.mecanico,
    aceita_sos: true,
    situacao: 'disponivel',
    disponivel: true,
    latitude: -23.565,
    longitude: -46.656,
    precisao_m: 9,
    posicao_em: iso(-3),
    veiculo_apoio: 'Master Oficina Móvel',
    telefone_contato: '11980000000',
    mostrar_telefone: true,
    chamado_atual_id: null,
    situacao_em: iso(-90),
    updated_at: iso(-3),
    ...overrides,
  }
}

const infoPublica = {
  empresa: 'Tecnoar Freios',
  telefone: '1997557540',
  whatsapp: '1997557540',
  politica_privacidade_url: null,
  mensagem_espera: 'Estamos acionando o mecânico mais próximo.',
  cancelamento_cliente_ate: 'a_caminho',
}

const notificacoes = [
  { id: 'n1', titulo: 'Mecânico a caminho', mensagem: 'Chegada estimada em 16 minutos.', link: `/app/chamado/${IDS.chamado}`, lida_em: null, created_at: iso(-10) },
  { id: 'n2', titulo: 'Revisão próxima', mensagem: 'Seu veículo está perto da quilometragem recomendada.', link: '/app/revisoes', lida_em: iso(-60), created_at: iso(-180) },
]

const agendamentos = [
  {
    id: 'ag1',
    cliente_id: IDS.clienteCadastro,
    veiculo_id: IDS.veiculo,
    conta_usuario_id: IDS.cliente,
    tipo: 'revisao',
    descricao: 'Revisão preventiva do sistema de freios',
    data_preferida: '2026-09-18',
    periodo: 'manha',
    status: 'solicitado',
    data_confirmada: null,
    observacoes_equipe: null,
    os_id: null,
    atendido_por: null,
    created_at: iso(-240),
    updated_at: iso(-240),
  },
]

const lembretes = [
  {
    id: 'l1',
    cliente_id: IDS.clienteCadastro,
    veiculo_id: IDS.veiculo,
    chave: 'freios-185000',
    tipo: 'km',
    titulo: 'Revisão de freios',
    mensagem: 'Faltam poucos quilômetros para a revisão preventiva.',
    vence_em: null,
    vence_km: 185000,
    origem_os_id: null,
    lido_em: null,
    dispensado_em: null,
    created_at: iso(-300),
  },
]

function detalhe(papelDetalhe = 'cliente') {
  return {
    chamado: { ...chamadoAtivo, status_rotulo: 'Mecânico a caminho', ocorrencia_rotulo: 'Freios' },
    papel: papelDetalhe,
    cliente: { id: IDS.clienteCadastro, nome: 'Lucca Santana', telefone: '1197557540' },
    veiculo,
    mecanico: {
      id: IDS.mecanico,
      nome: 'Rafael Almeida',
      avatar_url: null,
      telefone: '11980000000',
      veiculo_apoio: 'Master Oficina Móvel',
      latitude: -23.565,
      longitude: -46.656,
      posicao_em: iso(-3),
      nota: 4.9,
      atendimentos: 218,
    },
    os: null,
    eventos: [
      { id: 'ev1', chamado_id: IDS.chamado, tipo: 'status', titulo: 'SOS recebido', mensagem: 'Pedido aberto pelo app.', dados: {}, autor_id: IDS.cliente, autor_papel: 'cliente', autor_nome: 'Lucca', created_at: iso(-28) },
      { id: 'ev2', chamado_id: IDS.chamado, tipo: 'status', titulo: 'Mecânico acionado', mensagem: 'Rafael aceitou o chamado.', dados: {}, autor_id: IDS.mecanico, autor_papel: 'mecanico', autor_nome: 'Rafael', created_at: iso(-22) },
      { id: 'ev3', chamado_id: IDS.chamado, tipo: 'status', titulo: 'A caminho', mensagem: 'Deslocamento iniciado.', dados: {}, autor_id: IDS.mecanico, autor_papel: 'mecanico', autor_nome: 'Rafael', created_at: iso(-18) },
    ],
    itens: [],
    anexos: [],
    mensagens: [
      { id: 'm1', chamado_id: IDS.chamado, autor_id: IDS.mecanico, autor_papel: 'mecanico', autor_nome: 'Rafael', texto: 'Estou a caminho. Fique em local seguro.', midia_caminho: null, midia_tipo: null, rapida: false, lida_em: null, created_at: iso(-15) },
    ],
    ultima_posicao_mecanico: { id: 'pm1', chamado_id: IDS.chamado, papel: 'mecanico', latitude: -23.565, longitude: -46.656, precisao_m: 9, velocidade_m_s: null, rumo_graus: null, registrado_em: iso(-3) },
    ultima_posicao_cliente: { id: 'pc1', chamado_id: IDS.chamado, papel: 'cliente', latitude: -23.55052, longitude: -46.63331, precisao_m: 12, velocidade_m_s: null, rumo_graus: null, registrado_em: iso(-28) },
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  }
}

function rpcResposta(nome, persona) {
  switch (nome) {
    case 'sos_meu_papel':
      return papel(persona)
    case 'sos_info_publica':
      return infoPublica
    case 'sos_ia_publico':
      return { ativa: true, atendimento: true, foto: true, kit: true, resumo: true }
    case 'sos_home_cliente':
      return {
        ok: true,
        nome: 'Lucca Santana',
        veiculo,
        total_veiculos: 2,
        ultimo_servico: { os_id: 'os1', numero: 4812, em: iso(-60 * 24 * 21), km: 179800, servicos: 'Revisão completa de freios', status: 'Finalizada', encerrada: true },
        veiculo_na_oficina: false,
        proxima_revisao: { id: 'rev1', titulo: 'Revisão preventiva', mensagem: 'Faltam poucos quilômetros.', vence_em: null, vence_km: 185000 },
        chamado_ativo: null,
        pendente_avaliacao: null,
        agendamentos_abertos: 1,
        lembretes: 1,
      }
    case 'sos_meus_chamados':
      return [
        { ...chamadoAtivo, placa: veiculo.placa, veiculo: `${veiculo.marca} ${veiculo.modelo}`, status_rotulo: 'Mecânico a caminho', ocorrencia_rotulo: 'Freios' },
        { ...chamadoFinalizado, placa: veiculo.placa, veiculo: `${veiculo.marca} ${veiculo.modelo}`, status_rotulo: 'Concluído', ocorrencia_rotulo: 'Pneu', mecanico_nome: 'Rafael Almeida' },
      ]
    case 'sos_historico_cliente':
      return [
        { tipo: 'sos', id: IDS.chamadoFinalizado, protocolo: chamadoFinalizado.protocolo, em: chamadoFinalizado.recebido_em, status: 'concluido', status_rotulo: 'Concluído', veiculo_id: IDS.veiculo, placa: veiculo.placa, veiculo: `${veiculo.marca} ${veiculo.modelo}`, ocorrencia: 'pneu', ocorrencia_rotulo: 'Pneu', diagnostico: 'Substituição emergencial', servico: 'Troca e calibração', mecanico: 'Rafael Almeida', os_id: null, nota: 5 },
        { tipo: 'os', id: 'os1', numero: 4812, em: iso(-60 * 24 * 21), veiculo_id: IDS.veiculo, placa: veiculo.placa, veiculo: `${veiculo.marca} ${veiculo.modelo}`, km: 179800, problema: 'Preventiva', diagnostico: 'Sistema em boas condições', status: 'Finalizada', status_cor: 'ok', encerrada: true, valor_total: 1480, servicos: [{ descricao: 'Revisão de freios', quantidade: 1, valor: 780 }], produtos: [{ descricao: 'Kit reparo válvula', quantidade: 1, valor: 700 }], mecanicos: 'Rafael Almeida', sos_protocolo: null, sos_id: null },
      ]
    case 'sos_home_mecanico':
      return {
        ok: true,
        nome: 'Rafael Almeida',
        ficha: fichaMecanico(),
        chamado_atual: null,
        aguardando: [
          { ...chamadoAtivo, status: 'procurando_mecanico', mecanico_id: null, ocorrencia_rotulo: 'Freios', cliente_nome: 'Lucca Santana', placa: veiculo.placa, veiculo: `${veiculo.marca} ${veiculo.modelo}`, distancia_km: 8.4, para_mim: true, recusei: false },
          { ...chamado({ id: '88888888-8888-4888-8888-888888888888', protocolo: 'SOS-2026-1285', tipo_ocorrencia: 'eletrica', prioridade: 'alta', endereco: 'Rodovia Anhanguera, km 98' }), status: 'recebido', mecanico_id: null, ocorrencia_rotulo: 'Elétrica', cliente_nome: 'Transportes Nova Rota', placa: 'EIX4A10', veiculo: 'Scania R450', distancia_km: 14.2, para_mim: false, recusei: false },
        ],
        hoje: { atendimentos: 4, concluidos: 3, nota_media: 4.9 },
        historico: [
          { id: IDS.chamadoFinalizado, protocolo: chamadoFinalizado.protocolo, status: 'concluido', status_rotulo: 'Concluído', ocorrencia_rotulo: 'Pneu', cliente_nome: 'Lucca Santana', placa: veiculo.placa, recebido_em: chamadoFinalizado.recebido_em, finalizado_em: chamadoFinalizado.finalizado_em, nota: 5 },
        ],
      }
    case 'sos_detalhe_chamado':
      return detalhe(persona === 'mecanico' ? 'mecanico_candidato' : 'cliente')
    case 'sos_acompanhar':
      return {
        ok: true,
        protocolo: chamadoAtivo.protocolo,
        status: 'a_caminho',
        status_rotulo: 'Mecânico a caminho',
        eta_min: 16,
        distancia_km: 8.4,
        mecanico: 'Rafael Almeida',
        veiculo: `${veiculo.marca} ${veiculo.modelo}`,
        cliente_lat: chamadoAtivo.latitude,
        cliente_lng: chamadoAtivo.longitude,
        mecanico_lat: -23.565,
        mecanico_lng: -46.656,
        posicao_em: iso(-3),
        recebido_em: iso(-28),
        aceito_em: iso(-22),
        chegou_em: null,
        finalizado_em: null,
        concluido_em: null,
        cancelado_em: null,
        expira_em: iso(60 * 10),
      }
    case 'sos_pulso':
    case 'sos_atualizar_posicao_mecanico':
      return null
    default:
      return {}
  }
}

function tabelaResposta(tabela, method) {
  if (method === 'HEAD') {
    const total = tabela === 'notificacoes' ? notificacoes.filter((n) => !n.lida_em).length : 0
    return { status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `0-0/${total}` }, body: '' }
  }
  switch (tabela) {
    case 'veiculos':
      return json([veiculo, { ...veiculo, id: 'v2', placa: 'ABC1D23', marca: 'Mercedes-Benz', modelo: 'Actros', ano: 2021, km_atual: 221000, cor: 'Branco' }])
    case 'sos_agendamentos':
      return json(agendamentos)
    case 'sos_lembretes':
      return json(lembretes)
    case 'notificacoes':
      return json(notificacoes)
    case 'sos_posicoes':
      return json([
        { id: 'pc1', chamado_id: IDS.chamado, papel: 'cliente', latitude: chamadoAtivo.latitude, longitude: chamadoAtivo.longitude, registrado_em: iso(-28) },
        { id: 'pm1', chamado_id: IDS.chamado, papel: 'mecanico', latitude: -23.565, longitude: -46.656, registrado_em: iso(-3) },
      ])
    default:
      return json([])
  }
}

async function configurar(context, persona = 'anonimo', tema = 'escuro') {
  if (persona !== 'anonimo') {
    const p = papel(persona)
    await context.addInitScript(({ p, expiresAt, tema }) => {
      localStorage.setItem('tecnoar.auth', JSON.stringify({
        access_token: `qa-${p.papel}-token`,
        refresh_token: `qa-${p.papel}-refresh`,
        token_type: 'bearer',
        expires_in: 31536000,
        expires_at: expiresAt,
        user: {
          id: p.usuario_id,
          aud: 'authenticated',
          role: 'authenticated',
          email: p.email || `${p.papel}@sos.local`,
          email_confirmed_at: new Date().toISOString(),
          phone: p.telefone || '',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { name: p.nome },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }))
      localStorage.setItem('sos.tema', tema)
      document.documentElement.classList.toggle('dark', tema === 'escuro')
    }, { p, expiresAt: Math.floor(Date.now() / 1000) + 31536000, tema })
  } else {
    await context.addInitScript(({ tema }) => {
      localStorage.setItem('sos.tema', tema)
      document.documentElement.classList.toggle('dark', tema === 'escuro')
    }, { tema })
  }

  await context.grantPermissions(['geolocation'], { origin: BASE })
  await context.setGeolocation({ latitude: -23.55052, longitude: -46.63331, accuracy: 12 })

  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill(json({}))
    if (url.hostname.includes('nominatim.openstreetmap.org')) {
      if (url.pathname.includes('/reverse')) return route.fulfill(json({ address: { road: 'Marginal Tietê', city: 'São Paulo', 'ISO3166-2-lvl4': 'BR-SP' }, display_name: 'Marginal Tietê, São Paulo/SP' }))
      return route.fulfill(json([{ lat: '-23.55052', lon: '-46.63331', display_name: 'Marginal Tietê, São Paulo/SP' }]))
    }
    if (url.hostname.includes('router.project-osrm.org')) return route.fulfill(json({ routes: [] }))
    if (url.pathname.includes('/auth/v1/user')) {
      const p = persona === 'anonimo' ? null : papel(persona)
      return route.fulfill(json(p ? { id: p.usuario_id, email: p.email || `${p.papel}@sos.local`, role: 'authenticated', aud: 'authenticated' } : null, p ? 200 : 401))
    }
    if (url.pathname.includes('/rest/v1/rpc/')) {
      const nome = decodeURIComponent(url.pathname.split('/rest/v1/rpc/')[1] || '')
      return route.fulfill(json(rpcResposta(nome, persona)))
    }
    if (url.pathname.includes('/rest/v1/')) {
      const tabela = decodeURIComponent(url.pathname.split('/rest/v1/')[1].split('/')[0])
      return route.fulfill(tabelaResposta(tabela, req.method()))
    }
    return route.continue()
  })
}

async function shot(browser, item) {
  const tema = item.tema || 'escuro'
  const context = await browser.newContext({
    viewport: item.viewport || { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    colorScheme: tema === 'escuro' ? 'dark' : 'light',
  })
  await configurar(context, item.persona, tema)
  const page = await context.newPage()
  page.setDefaultTimeout(9000)
  await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
  await page.waitForTimeout(item.delay ?? 900)
  if (item.after) await item.after(page)
  const file = `${item.id}.png`
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' })
  const finalUrl = page.url().replace(BASE, '')
  const title = await page.title().catch(() => '')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.close()
  return { ...item, tema, file, finalUrl, title, errors }
}

const itens = [
  { id: '01-publico-login', nome: 'Login', persona: 'anonimo', path: '/entrar' },
  { id: '02-publico-cadastro', nome: 'Cadastro', persona: 'anonimo', path: '/cadastro' },
  { id: '03-publico-recuperar-senha', nome: 'Recuperar senha', persona: 'anonimo', path: '/esqueci-senha' },
  { id: '04-publico-termos', nome: 'Termos de uso', persona: 'anonimo', path: '/termos' },
  { id: '05-publico-privacidade', nome: 'Privacidade', persona: 'anonimo', path: '/privacidade' },
  { id: '06-publico-conta-excluida', nome: 'Conta excluída', persona: 'anonimo', path: '/conta-excluida' },
  { id: '07-publico-acompanhamento', nome: 'Acompanhamento público', persona: 'anonimo', path: '/acompanhar/token-demo' },
  { id: '08-equipe-operacao', nome: 'Operação/equipe', persona: 'equipe', path: '/' },
  { id: '09-cliente-home-claro', nome: 'Cliente · Início claro', persona: 'cliente', path: '/', tema: 'claro' },
  { id: '09b-cliente-home-escuro', nome: 'Cliente · Início escuro', persona: 'cliente', path: '/', tema: 'escuro' },
  { id: '10-cliente-sos-localizacao-claro', nome: 'Cliente · SOS claro', persona: 'cliente', path: '/sos', delay: 1800, tema: 'claro' },
  { id: '10b-cliente-sos-localizacao-escuro', nome: 'Cliente · SOS escuro', persona: 'cliente', path: '/sos', delay: 1800, tema: 'escuro' },
  { id: '11-cliente-chamados', nome: 'Cliente · Chamados', persona: 'cliente', path: '/chamados' },
  { id: '12-cliente-chamado-detalhe', nome: 'Cliente · Chamado ao vivo', persona: 'cliente', path: `/chamado/${IDS.chamado}` },
  { id: '13-cliente-veiculos', nome: 'Cliente · Veículos', persona: 'cliente', path: '/veiculos' },
  { id: '14-cliente-historico', nome: 'Cliente · Histórico', persona: 'cliente', path: '/historico' },
  { id: '15-cliente-revisoes', nome: 'Cliente · Revisões', persona: 'cliente', path: '/revisoes' },
  { id: '16-cliente-contato', nome: 'Cliente · Contato', persona: 'cliente', path: '/contato' },
  { id: '17-cliente-tecno-ia', nome: 'Cliente · TECNO IA', persona: 'cliente', path: '/tecno-ia', delay: 1400 },
  { id: '18-cliente-notificacoes', nome: 'Cliente · Notificações', persona: 'cliente', path: '/notificacoes' },
  { id: '19-cliente-perfil', nome: 'Cliente · Perfil', persona: 'cliente', path: '/perfil' },
  { id: '20-mecanico-painel-claro', nome: 'Mecânico · Painel claro', persona: 'mecanico', path: '/', tema: 'claro' },
  { id: '20b-mecanico-painel-escuro', nome: 'Mecânico · Painel escuro', persona: 'mecanico', path: '/', tema: 'escuro' },
  { id: '21-mecanico-chamados', nome: 'Mecânico · Chamados', persona: 'mecanico', path: '/chamados' },
  { id: '22-mecanico-atendimento', nome: 'Mecânico · Atendimento', persona: 'mecanico', path: `/chamado/${IDS.chamado}` },
  { id: '23-mecanico-notificacoes', nome: 'Mecânico · Notificações', persona: 'mecanico', path: '/notificacoes' },
  { id: '24-mecanico-perfil-claro', nome: 'Mecânico · Perfil claro', persona: 'mecanico', path: '/perfil', tema: 'claro' },
  { id: '24b-mecanico-perfil-escuro', nome: 'Mecânico · Perfil escuro', persona: 'mecanico', path: '/perfil', tema: 'escuro' },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const resultados = []
for (const item of itens) {
  console.log(`capturando ${item.id} ${item.path}`)
  resultados.push(await shot(browser, item))
}
await browser.close()

const cards = resultados.map((r) => `
  <article>
    <h2>${r.nome}</h2>
    <p>${r.persona} · ${r.tema} · ${r.path} → ${r.finalUrl}</p>
    <a href="./${r.file}"><img src="./${r.file}" alt="${r.nome}"></a>
  </article>
`).join('\n')

await writeFile(path.join(OUT, 'rotas.json'), JSON.stringify(resultados, null, 2))
await writeFile(path.join(OUT, 'galeria.html'), `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Galeria SOS Tecnoar</title>
<style>
  body{margin:0;background:#061326;color:#fff;font:14px Inter,system-ui,sans-serif}
  header{position:sticky;top:0;z-index:2;background:rgba(6,19,38,.88);backdrop-filter:blur(20px);padding:24px}
  h1{margin:0;font-size:28px} p{color:rgba(255,255,255,.62)}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px;padding:24px}
  article{border:1px solid rgba(255,255,255,.14);border-radius:24px;background:rgba(255,255,255,.06);padding:14px;box-shadow:0 24px 70px -45px #000}
  h2{font-size:15px;margin:0 0 4px}
  article p{font-size:12px;margin:0 0 12px}
  img{width:100%;display:block;border-radius:18px;background:#020814}
</style>
<header><h1>Galeria de rotas SOS</h1><p>${resultados.length} prints capturados em viewport mobile 390x844.</p></header>
<main>${cards}</main>
</html>`)

console.log(path.join(OUT, 'galeria.html'))
