/**
 * Simulação do Supabase para testar o app SOS sem tocar em produção.
 *
 * Sessão falsa por persona (cliente, mecânico, equipe), respostas de exemplo
 * para as funções do banco e para os serviços de mapa. Usado pela captura de
 * telas (capturar-rotas-sos.mjs) e pelo teste de fluxos (fluxos-sos.mjs).
 */

export const BASE = process.env.SOS_URL || 'http://localhost:5174'
const AGORA = new Date('2026-09-13T09:30:00-03:00')
const iso = (min = 0) => new Date(AGORA.getTime() + min * 60_000).toISOString()

export const IDS = {
  cliente: '11111111-1111-4111-8111-111111111111',
  mecanico: '22222222-2222-4222-8222-222222222222',
  equipe: '33333333-3333-4333-8333-333333333333',
  clienteCadastro: '44444444-4444-4444-8444-444444444444',
  veiculo: '55555555-5555-4555-8555-555555555555',
  chamado: '66666666-6666-4666-8666-666666666666',
  chamadoFinalizado: '77777777-7777-4777-8777-777777777777',
  os: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  osNova: '99999999-9999-4999-8999-999999999999',
}

const veiculo = {
  id: IDS.veiculo,
  placa: 'RTA8J42',
  marca: 'Volvo',
  modelo: 'FH 540',
  ano: 2022,
  km_atual: 184230,
  descricao: 'Cavalo mecânico',
  tipo: 'cavalo',
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

export function rpcResposta(nome, persona) {
  switch (nome) {
    case 'sos_minhas_os':
      return {
        pode_criar: true,
        lista: [
          {
            id: IDS.os, numero: 4821, aberta_em: iso(-180), encerrada_em: null, status: 'Em manutenção', status_cor: 'azul',
            cliente: 'Transportes Nova Rota', placa: 'EIX4A10', veiculo: 'Scania R450', valor_total: 1840.5,
            problema: 'Válvula relé travando', itens: 3, faltando: 1,
          },
        ],
      }
    case 'sos_os_detalhe':
      return {
        os: {
          id: IDS.os, numero: 4821, aberta_em: iso(-180), encerrada_em: null, km: 412300, problema: 'Válvula relé travando',
          diagnostico: null, observacoes: null, valor_produtos: 1240.5, valor_servicos: 600, desconto: null, acrescimo: null,
          valor_total: 1840.5, status: { nome: 'Em manutenção', cor: 'azul' },
        },
        cliente: { id: IDS.clienteCadastro, nome: 'Transportes Nova Rota', telefone: '(19) 98888-7777' },
        veiculo: { id: IDS.veiculo, placa: 'EIX4A10', marca: 'Scania', modelo: 'R450', ano: 2019, km_atual: 412300 },
        produtos: [
          { id: 'op1', produto_id: 'p1', codigo: 'WAB-9730', descricao: 'Válvula relé Wabco', unidade: 'UN', quantidade: 1, valor_unitario: 890.5, valor_total: 890.5, estado: 'reservado', aprovacao: null, disponivel: 4, do_socorro: false },
          { id: 'op2', produto_id: 'p2', codigo: 'KNR-1120', descricao: 'Reparo de pinça', unidade: 'JG', quantidade: 2, valor_unitario: 175, valor_total: 350, estado: 'necessario', aprovacao: null, disponivel: 0, do_socorro: false },
        ],
        servicos: [
          { id: 'os1', servico_id: 's1', codigo: 'SRV001', descricao: 'Revisão do sistema de freio a ar', quantidade: 1, valor_unitario: 600, valor_total: 600, aprovacao: null, do_socorro: false },
        ],
        chamado: null,
        pode_editar: true,
      }
    case 'sos_catalogo':
      return [
        { tipo: 'produto', id: 'p1', codigo: 'WAB-9730', descricao: 'Válvula relé Wabco', unidade: 'UN', preco: 890.5, saldo: 6, reservado: 1, comprometido: 1, disponivel: 4, estoque_em: iso(-600) },
        { tipo: 'produto', id: 'p2', codigo: 'KNR-1120', descricao: 'Reparo de pinça Knorr', unidade: 'JG', preco: 175, saldo: 0, reservado: 0, comprometido: 0, disponivel: 0, estoque_em: iso(-600) },
        { tipo: 'servico', id: 's1', codigo: 'SRV001', descricao: 'Revisão do sistema de freio a ar', unidade: null, preco: 600, saldo: null, reservado: null, comprometido: null, disponivel: null, estoque_em: null },
      ]
    case 'sos_buscar_cliente_campo':
      return [
        {
          id: IDS.clienteCadastro, nome: 'Transportes Nova Rota', telefone: '(19) 98888-7777',
          veiculos: [
            { id: IDS.veiculo, placa: 'EIX4A10', veiculo: 'Scania R450 2019', km_atual: 412300, os_aberta: null },
          ],
        },
      ]
    case 'sos_os_abrir':
      return { id: IDS.osNova, numero: 4822, cliente_id: IDS.clienteCadastro, veiculo_id: IDS.veiculo, cliente_novo: false }
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

export async function configurar(context, persona = 'anonimo', tema = 'escuro') {
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
      // O script roda antes de existir <html>; o tema vem do localStorage, que o app lê.
      document.documentElement?.classList.toggle('dark', tema === 'escuro')
    }, { p, expiresAt: Math.floor(Date.now() / 1000) + 31536000, tema })
  } else {
    await context.addInitScript(({ tema }) => {
      localStorage.setItem('sos.tema', tema)
      // O script roda antes de existir <html>; o tema vem do localStorage, que o app lê.
      document.documentElement?.classList.toggle('dark', tema === 'escuro')
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
