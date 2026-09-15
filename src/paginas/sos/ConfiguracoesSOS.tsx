import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlarmClock,
  BellRing,
  Bot,
  Brain,
  Camera,
  CheckCircle2,
  ClipboardPen,
  FilePlus2,
  Hand,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  PackageSearch,
  Plug,
  Receipt,
  RefreshCw,
  Repeat,
  RotateCcw,
  Route,
  Save,
  Search,
  Settings2,
  Siren,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { mascaraTelefone, moeda } from '@/lib/formatos'
import { Aviso } from '@/componentes/ui/Aviso'
import { Botao } from '@/componentes/ui/Botao'
import { Alternador, AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoSemPermissao } from '@/componentes/ui/Estados'
import { CabecalhoPainel, Painel } from '@/componentes/ui/Painel'
import { Selo } from '@/componentes/ui/Selo'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { ErroIa, sosCatalogo, sosGerarLembretes, sosIaTestar, sosSalvarConfig } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { STATUS_SOS } from '@/sos/rotulos'
import type { ConfigSOS, ProvedorIa, StatusSOS } from '@/sos/tipos'
import { ALVO_ALTERNADOR, CHAVE_IA_PUBLICO, ErroSOS, LinhaAlternador, haQuantoSegundos, lerNumero, saudeVigia, useAgora, useConfigSOS, useVigiaSOS } from './comum'

/** Etapas em que faz sentido travar o cancelamento pelo cliente. */
const ETAPAS_CANCELAMENTO: StatusSOS[] = ['procurando_mecanico', 'aceito', 'a_caminho', 'no_local', 'servico_iniciado', 'servico_finalizado']

/**
 * Provedores da IA do SOS. Os modelos são atalhos, não trava: o campo aceita
 * qualquer identificador — modelo novo sai toda semana e não pode depender de
 * publicar o sistema de novo.
 */
const PROVEDORES_IA: Record<ProvedorIa, { nome: string; modelos: string[]; prefixo: string; onde: string }> = {
  anthropic: { nome: 'Anthropic (Claude)', modelos: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'], prefixo: 'sk-ant-', onde: 'console.anthropic.com › API Keys' },
  openai: { nome: 'OpenAI (GPT)', modelos: ['gpt-5'], prefixo: 'sk-', onde: 'platform.openai.com › API keys' },
  gemini: { nome: 'Google (Gemini)', modelos: ['gemini-flash-latest', 'gemini-pro-latest'], prefixo: 'AIza', onde: 'aistudio.google.com › API keys' },
}
const ORDEM_PROVEDORES: ProvedorIa[] = ['anthropic', 'openai', 'gemini']

interface Formulario {
  modo_distribuicao: 'manual' | 'inteligente'
  raio_busca_km: string
  velocidade_media_kmh: string
  tempo_aceite_min: string
  telefone_central: string
  gerar_os_ao_finalizar: boolean
  cancelamento_cliente_ate: StatusSOS
  mensagem_espera: string
  lembrete_meses: string
  lembrete_km: string
  offline_apos_horas: string
  concluir_apos_horas: string
  whatsapp_ativo: boolean
  whatsapp_url: string
  whatsapp_instancia: string
  whatsapp_destinos: string
  whatsapp_apikey: string
  exigir_aprovacao_orcamento: boolean
  deslocamento_ativo: boolean
  deslocamento_valor_km: string
  deslocamento_taxa_minima: string
  deslocamento_ida_volta: boolean
  deslocamento_servico_id: string
  ia_ativa: boolean
  /** De onde vem a chave: a mesma da Tecnoar IA ou uma só do SOS. */
  ia_fonte: 'tecnoar' | 'propria'
  ia_provedor: ProvedorIa
  ia_modelo: string
  ia_apikey: string
  ia_remover_chave: boolean
  ia_atendimento: boolean
  ia_foto: boolean
  ia_kit: boolean
  ia_resumo: boolean
  ia_limite_cliente_dia: string
  ia_instrucoes: string
}

/** Valor para o campo: zero fica vazio (o placeholder "0,00" já diz). */
function reais(n: number | null | undefined): string {
  return !n ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
}

function doConfig(c: ConfigSOS): Formulario {
  return {
    modo_distribuicao: c.modo_distribuicao,
    raio_busca_km: String(c.raio_busca_km ?? ''),
    velocidade_media_kmh: String(c.velocidade_media_kmh ?? ''),
    // A central pensa em minutos; o banco guarda segundos.
    tempo_aceite_min: String(Math.round(((c.tempo_aceite_seg ?? 120) / 60) * 10) / 10),
    telefone_central: c.telefone_central ? mascaraTelefone(c.telefone_central) : '',
    gerar_os_ao_finalizar: c.gerar_os_ao_finalizar,
    cancelamento_cliente_ate: c.cancelamento_cliente_ate,
    mensagem_espera: c.mensagem_espera ?? '',
    lembrete_meses: String(c.lembrete_meses ?? ''),
    lembrete_km: String(c.lembrete_km ?? ''),
    // A central pensa em horas; o banco guarda minutos (0 = nunca).
    offline_apos_horas: String(Math.round(((c.offline_apos_min ?? 240) / 60) * 10) / 10),
    concluir_apos_horas: String(c.concluir_apos_horas ?? 24),
    whatsapp_ativo: c.whatsapp_ativo,
    whatsapp_url: c.whatsapp_url ?? '',
    whatsapp_instancia: c.whatsapp_instancia ?? '',
    whatsapp_destinos: (c.whatsapp_destinos ?? []).join('\n'),
    whatsapp_apikey: '',
    exigir_aprovacao_orcamento: c.exigir_aprovacao_orcamento ?? false,
    deslocamento_ativo: c.deslocamento_ativo ?? false,
    deslocamento_valor_km: reais(c.deslocamento_valor_km ?? 0),
    deslocamento_taxa_minima: reais(c.deslocamento_taxa_minima ?? 0),
    deslocamento_ida_volta: c.deslocamento_ida_volta ?? true,
    deslocamento_servico_id: c.deslocamento_servico_id ?? '',
    ia_ativa: c.ia_ativa ?? false,
    ia_fonte: c.ia_usar_chave_tecnoar_ia ? 'tecnoar' : 'propria',
    ia_provedor: c.ia_provedor ?? 'anthropic',
    ia_modelo: c.ia_modelo ?? '',
    ia_apikey: '',
    ia_remover_chave: false,
    ia_atendimento: c.ia_atendimento ?? true,
    ia_foto: c.ia_foto ?? true,
    ia_kit: c.ia_kit ?? true,
    ia_resumo: c.ia_resumo ?? true,
    ia_limite_cliente_dia: String(c.ia_limite_cliente_dia ?? 30),
    ia_instrucoes: c.ia_instrucoes ?? '',
  }
}

function numero(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Mesma conta do banco (`sos_lancar_deslocamento`), para o exemplo da tela. */
function taxaDeslocamento(kmIda: number, valorKm: number, minimo: number, idaVolta: boolean) {
  const km = Math.round(kmIda * (idaVolta ? 2 : 1) * 10) / 10
  if (valorKm <= 0 && minimo <= 0) return { km, valor: 0, minima: false }
  const porKm = km * valorKm
  return valorKm > 0 && porKm >= minimo ? { km, valor: porKm, minima: false } : { km, valor: minimo, minima: true }
}

function milhares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (n >= 10_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return n.toLocaleString('pt-BR')
}

/** Painéis da tela — o atalho do topo leva direto a cada um. */
const SECOES = [
  ['cfg-distribuicao', 'Distribuição'],
  ['cfg-vigia', 'Vigia'],
  ['cfg-atendimento', 'Atendimento'],
  ['cfg-orcamento', 'Orçamento'],
  ['cfg-deslocamento', 'Deslocamento'],
  ['cfg-lembretes', 'Lembretes'],
  ['cfg-whatsapp', 'WhatsApp'],
  ['cfg-ia', 'Inteligência artificial'],
] as const

/**
 * Regras do SOS que valem para os três aplicativos. Tudo é salvo de uma vez
 * e só o que mudou precisa de atenção — o botão Salvar só acende quando há
 * alteração. A IA do SOS também é configurada aqui (e só aqui): provedor,
 * modelo e chave — própria ou a mesma da Tecnoar IA.
 */
export function ConfiguracoesSOS({ podeConfigurar }: { podeConfigurar: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const config = useConfigSOS(podeConfigurar)
  const [form, setForm] = useState<Formulario | null>(null)
  const [gerandoLembretes, setGerandoLembretes] = useState(false)

  useEffect(() => {
    if (config.data) setForm(doConfig(config.data))
  }, [config.data])

  const original = useMemo(() => (config.data ? doConfig(config.data) : null), [config.data])
  const alterado = !!form && !!original && JSON.stringify(form) !== JSON.stringify(original)
  // O teste de conexão usa a configuração salva: com a IA alterada, salvar antes.
  const iaAlterada =
    !!form && !!original && (Object.keys(form) as Array<keyof Formulario>).some((k) => k.startsWith('ia_') && form[k] !== original[k])

  const provedoresTecnoar = useMemo(() => config.data?.tecnoar_ia_provedores ?? [], [config.data?.tecnoar_ia_provedores])

  const erros = useMemo(() => {
    if (!form) return {}
    const e: Partial<Record<keyof Formulario, string>> = {}
    const raio = numero(form.raio_busca_km)
    if (raio == null || raio <= 0 || raio > 1000) e.raio_busca_km = 'Entre 1 e 1000 km.'
    const vel = numero(form.velocidade_media_kmh)
    if (vel == null || vel < 5 || vel > 150) e.velocidade_media_kmh = 'Entre 5 e 150 km/h.'
    const aceite = numero(form.tempo_aceite_min)
    if (aceite == null || aceite < 0.5 || aceite > 60) e.tempo_aceite_min = 'Entre 0,5 e 60 minutos.'
    const meses = numero(form.lembrete_meses)
    if (meses == null || meses < 1 || meses > 36 || !Number.isInteger(meses)) e.lembrete_meses = 'Meses inteiros, de 1 a 36.'
    const km = numero(form.lembrete_km)
    if (km == null || km < 1000 || !Number.isInteger(km)) e.lembrete_km = 'A partir de 1.000 km.'
    const off = numero(form.offline_apos_horas)
    if (off == null || off < 0 || off > 72 || (off > 0 && off < 0.25)) e.offline_apos_horas = 'De 0,25 a 72 h (0 = nunca).'
    const concl = numero(form.concluir_apos_horas)
    if (concl == null || concl < 1 || concl > 720 || !Number.isInteger(concl)) e.concluir_apos_horas = 'Horas inteiras, de 1 a 720.'
    if (form.whatsapp_ativo) {
      if (!/^https?:\/\/\S+$/i.test(form.whatsapp_url.trim())) e.whatsapp_url = 'Informe a URL da Evolution API (https://…).'
      if (!form.whatsapp_instancia.trim()) e.whatsapp_instancia = 'Informe a instância.'
      if (!form.whatsapp_destinos.trim()) e.whatsapp_destinos = 'Pelo menos um número.'
      if (!config.data?.whatsapp_apikey_definida && !form.whatsapp_apikey.trim()) e.whatsapp_apikey = 'Informe a API key.'
    }
    const valorKm = form.deslocamento_valor_km.trim() ? lerNumero(form.deslocamento_valor_km) : 0
    if (valorKm == null || valorKm < 0 || valorKm > 1000) e.deslocamento_valor_km = 'De R$ 0 a R$ 1.000 por km.'
    const minima = form.deslocamento_taxa_minima.trim() ? lerNumero(form.deslocamento_taxa_minima) : 0
    if (minima == null || minima < 0 || minima > 100_000) e.deslocamento_taxa_minima = 'Valor inválido.'
    if (form.deslocamento_ativo && !e.deslocamento_valor_km && !e.deslocamento_taxa_minima && !valorKm && !minima) {
      e.deslocamento_valor_km = 'Informe o valor por km ou a taxa mínima.'
    }
    const limite = numero(form.ia_limite_cliente_dia)
    if (limite == null || limite < 0 || limite > 1000 || !Number.isInteger(limite)) e.ia_limite_cliente_dia = 'De 0 a 1000 (0 = sem limite).'
    if (form.ia_ativa) {
      if (!form.ia_modelo.trim()) e.ia_modelo = 'Informe o modelo.'
      if (form.ia_fonte === 'tecnoar' && !provedoresTecnoar.some((p) => p.provedor === form.ia_provedor)) {
        e.ia_provedor = 'Escolha uma das chaves da Tecnoar IA.'
      }
      if (form.ia_fonte === 'propria' && !form.ia_apikey.trim() && (!config.data?.ia_apikey_definida || form.ia_remover_chave)) {
        e.ia_apikey = 'Cole a chave da API do provedor.'
      }
    }
    return e
  }, [form, config.data?.whatsapp_apikey_definida, config.data?.ia_apikey_definida, provedoresTecnoar])
  const valido = Object.keys(erros).length === 0

  const salvar = useMutation({
    mutationFn: (f: Formulario) =>
      sosSalvarConfig({
        modo_distribuicao: f.modo_distribuicao,
        raio_busca_km: numero(f.raio_busca_km)!,
        velocidade_media_kmh: numero(f.velocidade_media_kmh)!,
        tempo_aceite_seg: Math.round(numero(f.tempo_aceite_min)! * 60),
        telefone_central: f.telefone_central.replace(/\D/g, '') || null,
        gerar_os_ao_finalizar: f.gerar_os_ao_finalizar,
        cancelamento_cliente_ate: f.cancelamento_cliente_ate,
        mensagem_espera: f.mensagem_espera.trim(),
        lembrete_meses: numero(f.lembrete_meses)!,
        lembrete_km: numero(f.lembrete_km)!,
        offline_apos_min: Math.round(numero(f.offline_apos_horas)! * 60),
        concluir_apos_horas: numero(f.concluir_apos_horas)!,
        whatsapp_ativo: f.whatsapp_ativo,
        whatsapp_url: f.whatsapp_url.trim() || null,
        whatsapp_instancia: f.whatsapp_instancia.trim() || null,
        whatsapp_destinos: f.whatsapp_destinos
          .split(/\n+/)
          .map((l) => l.replace(/\D/g, ''))
          .filter((l) => l.length >= 10),
        // Chave em branco = manter a atual. Ela nunca volta do banco.
        ...(f.whatsapp_apikey.trim() ? { whatsapp_apikey: f.whatsapp_apikey.trim() } : {}),
        exigir_aprovacao_orcamento: f.exigir_aprovacao_orcamento,
        deslocamento_ativo: f.deslocamento_ativo,
        deslocamento_valor_km: lerNumero(f.deslocamento_valor_km) ?? 0,
        deslocamento_taxa_minima: lerNumero(f.deslocamento_taxa_minima) ?? 0,
        deslocamento_ida_volta: f.deslocamento_ida_volta,
        deslocamento_servico_id: f.deslocamento_servico_id || null,
        ia_ativa: f.ia_ativa,
        ia_provedor: f.ia_provedor,
        ia_modelo: f.ia_modelo.trim(),
        ia_usar_chave_tecnoar_ia: f.ia_fonte === 'tecnoar',
        ia_instrucoes: f.ia_instrucoes.trim(),
        ia_atendimento: f.ia_atendimento,
        ia_foto: f.ia_foto,
        ia_kit: f.ia_kit,
        ia_resumo: f.ia_resumo,
        ia_limite_cliente_dia: numero(f.ia_limite_cliente_dia)!,
        // A chave própria só entra; digitada, substitui a atual. Remover e
        // colar outra ao mesmo tempo seria apagar a nova — a tela não deixa.
        ...(f.ia_fonte === 'propria' && f.ia_apikey.trim() ? { ia_apikey: f.ia_apikey.trim() } : f.ia_remover_chave ? { ia_remover_chave: true } : {}),
      }),
    onSuccess: (c) => {
      qc.setQueryData(CHAVES_SOS.config, c)
      // App e central decidem pelos cartões de IA com esta consulta.
      void qc.invalidateQueries({ queryKey: CHAVE_IA_PUBLICO })
      toast.ok('Configurações do SOS salvas', 'Valem na hora para a central, os mecânicos e os clientes.')
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const lembretes = useMutation({
    mutationFn: sosGerarLembretes,
    onSuccess: (n) => {
      setGerandoLembretes(false)
      toast.ok(n ? `${n} lembrete${n > 1 ? 's' : ''} gerado${n > 1 ? 's' : ''}` : 'Nenhum lembrete novo', n ? 'Os clientes foram avisados no app.' : 'Todos os clientes já estão com os lembretes em dia.')
    },
    onError: (e) => {
      setGerandoLembretes(false)
      toast.erro('Não foi possível gerar os lembretes', mensagemErro(e))
    },
  })

  if (!podeConfigurar) return <EstadoSemPermissao descricao="Somente quem tem a permissão “Configurar” do SOS altera estas regras." />
  if (config.isLoading || (config.data && !form)) return <EstadoCarregando rotulo="Carregando configurações…" />
  if (config.isError) return <ErroSOS erro={config.error} aoTentarNovamente={() => void config.refetch()} />
  if (!config.data || !form) return <EstadoSemPermissao descricao="Seu usuário não faz parte da equipe do SOS." />

  const mudar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const mudarVarios = (p: Partial<Formulario>) => setForm((f) => (f ? { ...f, ...p } : f))

  return (
    <form
      className="flex flex-col gap-4 pb-24 lg:pb-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (valido && alterado) salvar.mutate(form)
      }}
    >
      {/* Atalhos: o formulário é longo, principalmente no celular. */}
      <nav aria-label="Seções das configurações" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {SECOES.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex min-h-11 shrink-0 items-center rounded-full border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:border-accent hover:text-ink lg:min-h-8"
          >
            {rotulo}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {/* Duas colunas independentes no desktop (painéis de alturas diferentes
            não deixam buracos); abaixo de `xl` as colunas somem e a ordem
            segue a leitura: distribuição, vigia, atendimento… */}
        <div className="flex min-w-0 flex-col gap-4 max-xl:contents">
          <Secao id="cfg-distribuicao" className="max-xl:order-1">
            <Painel semPadding>
              <CabecalhoPainel titulo="Distribuição dos chamados" descricao="Como o SOS chega aos mecânicos." />
              <div className="flex flex-col gap-4 p-5">
                <div role="radiogroup" aria-label="Modo de distribuição" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <OpcaoModo
                    ativo={form.modo_distribuicao === 'inteligente'}
                    onClick={() => mudar('modo_distribuicao', 'inteligente')}
                    icone={<Brain />}
                    titulo="Inteligente"
                    texto="O SOS vai direto para todos os mecânicos disponíveis; o primeiro que aceitar atende. Se ninguém aceitar no prazo, o vigia avisa de novo e aciona a central."
                  />
                  <OpcaoModo
                    ativo={form.modo_distribuicao === 'manual'}
                    onClick={() => mudar('modo_distribuicao', 'manual')}
                    icone={<Hand />}
                    titulo="Manual"
                    texto="O SOS para na central, que escolhe o mecânico — com a sugestão ranqueada ao lado."
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Campo rotulo="Raio de busca (km)" erro={erros.raio_busca_km} obrigatorio>
                    {(p) => <Entrada {...p} inputMode="decimal" value={form.raio_busca_km} onChange={(e) => mudar('raio_busca_km', e.target.value)} mono />}
                  </Campo>
                  <Campo rotulo="Velocidade média (km/h)" erro={erros.velocidade_media_kmh} dica="Para a previsão de chegada." obrigatorio>
                    {(p) => <Entrada {...p} inputMode="decimal" value={form.velocidade_media_kmh} onChange={(e) => mudar('velocidade_media_kmh', e.target.value)} mono />}
                  </Campo>
                  <Campo rotulo="Tempo de aceite (min)" erro={erros.tempo_aceite_min} dica="Passou disso, o vigia avisa de novo e escala." obrigatorio>
                    {(p) => <Entrada {...p} inputMode="decimal" value={form.tempo_aceite_min} onChange={(e) => mudar('tempo_aceite_min', e.target.value)} mono />}
                  </Campo>
                </div>
              </div>
            </Painel>
          </Secao>

          <Secao id="cfg-atendimento" className="max-xl:order-3">
            <Painel semPadding>
              <CabecalhoPainel titulo="Atendimento" descricao="O que o cliente vê e o que acontece ao finalizar." />
              <div className="flex flex-col gap-4 p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo rotulo="Telefone da central" dica="Aparece no app para o cliente ligar.">
                    {(p) => (
                      <Entrada
                        {...p}
                        type="tel"
                        inputMode="tel"
                        value={form.telefone_central}
                        onChange={(e) => mudar('telefone_central', mascaraTelefone(e.target.value))}
                        placeholder="(11) 0000-0000"
                        mono
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Cliente pode cancelar até" dica="A partir desta etapa, só a central cancela.">
                    {(p) => (
                      <Selecao {...p} value={form.cancelamento_cliente_ate} onChange={(e) => mudar('cancelamento_cliente_ate', e.target.value as StatusSOS)}>
                        {ETAPAS_CANCELAMENTO.map((s) => (
                          <option key={s} value={s}>
                            Antes de: {STATUS_SOS[s].rotulo.toLowerCase()}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </Campo>
                </div>
                <Campo rotulo="Mensagem de espera" dica="O cliente lê enquanto aguarda o mecânico aceitar.">
                  {(p) => <AreaTexto {...p} rows={3} value={form.mensagem_espera} maxLength={500} onChange={(e) => mudar('mensagem_espera', e.target.value)} />}
                </Campo>
                <LinhaAlternador
                  rotulo="Gerar OS ao finalizar"
                  texto="Quando o mecânico finaliza o serviço, a OS nasce sozinha no Checklist com cliente, veículo, mecânico e itens."
                  ativo={form.gerar_os_ao_finalizar}
                  onChange={(v) => mudar('gerar_os_ao_finalizar', v)}
                  icone={<FilePlus2 />}
                />
              </div>
            </Painel>
          </Secao>

          <Secao id="cfg-orcamento" className="max-xl:order-4">
            <Painel semPadding>
              <CabecalhoPainel titulo="Orçamento pelo app" descricao="O cliente aprova os itens assinando na tela do celular." />
              <div className="flex flex-col gap-3 p-5">
                <ol className="grid grid-cols-1 gap-2 text-[12.5px] leading-snug text-ink-2 sm:grid-cols-3">
                  {[
                    ['1', 'No local, o mecânico lança peças e serviços e envia o orçamento.'],
                    ['2', 'O cliente vê os itens e o total no app e aprova assinando — ou recusa.'],
                    ['3', 'Resposta por telefone? A central registra, com a observação de como foi.'],
                  ].map(([n, t]) => (
                    <li key={n} className="flex gap-2 rounded-lg bg-surface-2/70 px-3 py-2.5">
                      <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{n}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
                <LinhaAlternador
                  rotulo="Exigir aprovação antes do serviço"
                  texto={
                    form.exigir_aprovacao_orcamento
                      ? 'Ligado: o mecânico só consegue marcar “serviço iniciado” com o orçamento aprovado pelo cliente (ou registrado pela central).'
                      : 'Desligado: o orçamento é opcional — o mecânico pode começar o serviço antes da resposta do cliente.'
                  }
                  ativo={form.exigir_aprovacao_orcamento}
                  onChange={(v) => mudar('exigir_aprovacao_orcamento', v)}
                  icone={<Receipt />}
                />
              </div>
            </Painel>
          </Secao>

          <Secao id="cfg-whatsapp" className="max-xl:order-7">
            <PainelWhatsApp form={form} erros={erros} mudar={mudar} chaveDefinida={config.data.whatsapp_apikey_definida} />
          </Secao>
        </div>

        <div className="flex min-w-0 flex-col gap-4 max-xl:contents">
          <Secao id="cfg-vigia" className="max-xl:order-2">
            <Painel semPadding>
              <CabecalhoPainel titulo="Vigia automático" descricao="Roda no servidor a cada 30 segundos, mesmo com todas as telas fechadas." />
              <div className="flex flex-col gap-4 p-5">
                <StatusVigia />
                <ul className="flex flex-col gap-2 text-[13px] leading-snug text-ink-2">
                  <li className="flex gap-2">
                    <Siren aria-hidden className="mt-0.5 size-4 shrink-0 text-crit" />
                    <span>
                      <b className="text-ink">Ninguém aceitou no prazo:</b> avisa de novo os mecânicos e a central; com 3× o prazo aciona a central (e o WhatsApp), com 6×
                      dá o alerta máximo. Mecânico escolhido que não responde devolve o SOS para todos.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
                    <span>
                      <b className="text-ink">Deslocamento:</b> mecânico muito além da previsão, ou sem posição por 8 minutos, gera aviso para a central — e o mecânico
                      recebe um push para reabrir o app.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Route aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
                    <span>
                      <b className="text-ink">Prazo de contrato:</b> SOS de frotista que passa do prazo de chegada combinado avisa a central na hora.
                    </span>
                  </li>
                </ul>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Offline por inatividade (h)"
                    erro={erros.offline_apos_horas}
                    dica="“Disponível” com o app fechado por este tempo sai do despacho. 0 = nunca."
                    obrigatorio
                  >
                    {(p) => <Entrada {...p} inputMode="decimal" value={form.offline_apos_horas} onChange={(e) => mudar('offline_apos_horas', e.target.value)} mono />}
                  </Campo>
                  <Campo rotulo="Concluir sem avaliação após (h)" erro={erros.concluir_apos_horas} dica="Serviço finalizado que o cliente não avaliou." obrigatorio>
                    {(p) => (
                      <Entrada
                        {...p}
                        inputMode="numeric"
                        value={form.concluir_apos_horas}
                        onChange={(e) => mudar('concluir_apos_horas', e.target.value.replace(/\D/g, ''))}
                        mono
                      />
                    )}
                  </Campo>
                </div>
              </div>
            </Painel>
          </Secao>

          <Secao id="cfg-deslocamento" className="max-xl:order-5">
            <PainelDeslocamento form={form} erros={erros} mudar={mudar} />
          </Secao>

          <Secao id="cfg-lembretes" className="max-xl:order-6">
            <Painel semPadding>
              <CabecalhoPainel
                titulo="Lembretes de manutenção"
                descricao="Avisos no app para quem está há tempo ou km demais sem passar na oficina."
                acao={
                  <Botao tamanho="sm" variante="neutro" iconeInicio={<BellRing />} onClick={() => setGerandoLembretes(true)} disabled={lembretes.isPending} className="max-lg:h-11">
                    Gerar lembretes agora
                  </Botao>
                }
              />
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                <Campo rotulo="Depois de (meses)" erro={erros.lembrete_meses} dica="Desde a última OS encerrada." obrigatorio>
                  {(p) => <Entrada {...p} inputMode="numeric" value={form.lembrete_meses} onChange={(e) => mudar('lembrete_meses', e.target.value.replace(/\D/g, ''))} mono />}
                </Campo>
                <Campo rotulo="Ou depois de (km)" erro={erros.lembrete_km} dica="Rodados desde a última OS." obrigatorio>
                  {(p) => <Entrada {...p} inputMode="numeric" value={form.lembrete_km} onChange={(e) => mudar('lembrete_km', e.target.value.replace(/\D/g, ''))} mono />}
                </Campo>
              </div>
            </Painel>
          </Secao>
        </div>
      </div>

      <Secao id="cfg-ia">
        <PainelIA
          form={form}
          erros={erros}
          mudar={mudar}
          mudarVarios={mudarVarios}
          config={config.data}
          iaAlterada={iaAlterada}
        />
      </Secao>

      {/* Barra de salvar: presa ao rodapé no celular, onde o formulário é longo. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur-sm area-segura',
          'lg:static lg:rounded-lg lg:border lg:bg-surface lg:px-5 lg:py-3 lg:shadow-e1',
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-3">
          <Settings2 aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {alterado
              ? valido
                ? 'Há alterações não salvas.'
                : 'Corrija os campos destacados.'
              : `Salvo ${config.data.updated_at ? new Date(config.data.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}`}
          </span>
        </span>
        <div className="flex shrink-0 gap-2">
          {alterado && (
            <Botao variante="fantasma" iconeInicio={<RotateCcw />} onClick={() => original && setForm(original)} disabled={salvar.isPending} className="max-lg:h-11" aria-label="Desfazer alterações">
              <span className="hidden sm:inline">Desfazer</span>
            </Botao>
          )}
          <Botao type="submit" variante="primario" iconeInicio={<Save />} carregando={salvar.isPending} disabled={!alterado || !valido} className="max-lg:h-11">
            Salvar
          </Botao>
        </div>
      </div>

      <Confirmacao
        aberto={gerandoLembretes}
        aoFechar={() => setGerandoLembretes(false)}
        aoConfirmar={() => lembretes.mutate()}
        carregando={lembretes.isPending}
        titulo="Gerar lembretes agora?"
        rotuloConfirmar="Gerar e avisar"
        descricao="O sistema confere todos os veículos de clientes com conta no app e avisa quem passou do prazo ou da quilometragem. Quem já recebeu o mesmo lembrete não é avisado de novo. A rotina também roda sozinha todo dia."
      />
    </form>
  )
}

type PropsPainel = {
  form: Formulario
  erros: Partial<Record<keyof Formulario, string>>
  mudar: <K extends keyof Formulario>(k: K, v: Formulario[K]) => void
}

/** Âncora do atalho do topo; a margem deixa o título fora da barra fixa. */
function Secao({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div id={id} className={cn('min-w-0 scroll-mt-24', className)}>
      {children}
    </div>
  )
}

/* ── vigia ──────────────────────────────────────────────────────────────── */

const STATUS_EXECUCAO: Record<string, string> = {
  succeeded: 'Concluída',
  failed: 'Falhou',
  running: 'Em andamento',
  starting: 'Iniciando',
  sending: 'Enviando',
  connecting: 'Conectando',
}

function textoAgenda(agenda: string | null | undefined): string {
  if (!agenda) return '—'
  const s = /^(\d+)\s*seconds?$/i.exec(agenda.trim())
  if (s) return `a cada ${s[1]} s`
  if (agenda.trim() === '* * * * *') return 'a cada minuto'
  return agenda
}

/** Saúde do vigia ao vivo: última execução, resultado e falhas da última hora. */
function StatusVigia() {
  const vigia = useVigiaSOS()
  const agora = useAgora(1000)
  const { saude, segundos } = saudeVigia(vigia.data, agora)
  const v = vigia.data
  const falhas = v?.falhas_1h ?? 0

  if (vigia.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-[12.5px] text-ink-3">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Consultando o vigia…
      </div>
    )
  }

  const ativo = saude === 'ativo'
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-3.5 py-3',
        vigia.isError ? 'border-warn/40 bg-warn-soft/60' : ativo ? 'border-ok/35 bg-ok-soft/60' : 'border-crit/40 bg-crit-soft/60',
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Activity aria-hidden className={cn('size-4', vigia.isError ? 'text-warn' : ativo ? 'text-ok' : 'text-crit')} />
          <span className="text-[13.5px] font-semibold text-ink">
            {vigia.isError ? 'Sem resposta do servidor' : ativo ? 'Vigia funcionando' : v?.agendado === false ? 'Vigia não agendado' : 'Vigia parado'}
          </span>
        </span>
        <Selo tom={vigia.isError ? 'atencao' : ativo ? 'ok' : 'critico'} ponto>
          {vigia.isError ? 'Sem status' : ativo ? 'Saudável' : 'Atenção'}
        </Selo>
      </div>
      {vigia.isError ? (
        <p className="text-[12.5px] leading-snug text-ink-2">{mensagemErro(vigia.error)}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-[11px] text-ink-3">Última execução</dt>
            <dd className="num text-[13px] font-semibold text-ink">{haQuantoSegundos(segundos)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-ink-3">Resultado</dt>
            <dd className={cn('text-[13px] font-semibold', v?.ultima?.status === 'failed' ? 'text-crit-ink' : 'text-ink')}>
              {v?.ultima ? (STATUS_EXECUCAO[v.ultima.status] ?? v.ultima.status) : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-ink-3">Falhas (1 h)</dt>
            <dd className={cn('num text-[13px] font-semibold', falhas > 0 ? 'text-crit-ink' : 'text-ink')}>{falhas}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-ink-3">Agenda</dt>
            <dd className="num truncate text-[13px] font-semibold text-ink">{v?.agendado === false ? 'não agendado' : textoAgenda(v?.agenda)}</dd>
          </div>
        </dl>
      )}
      {!ativo && !vigia.isError && (
        <p className="text-[12px] leading-snug text-ink-2">
          {v?.ultima?.status === 'failed' && v.ultima.mensagem ? (
            <>
              <b className="text-crit-ink">Erro:</b> <span className="break-words">{v.ultima.mensagem}</span>
            </>
          ) : (
            'Sem o vigia, SOS sem aceite não escala e ninguém é avisado de atraso. Confira o agendamento (pg_cron) no servidor.'
          )}
        </p>
      )}
    </div>
  )
}

/* ── deslocamento ───────────────────────────────────────────────────────── */

function PainelDeslocamento({ form, erros, mudar }: PropsPainel) {
  const valorKm = lerNumero(form.deslocamento_valor_km) ?? 0
  const minimo = lerNumero(form.deslocamento_taxa_minima) ?? 0
  const exemplos = [3, 12, 30].map((km) => ({ ida: km, ...taxaDeslocamento(km, valorKm, minimo, form.deslocamento_ida_volta) }))
  const semCobranca = valorKm <= 0 && minimo <= 0

  return (
    <Painel semPadding>
      <CabecalhoPainel titulo="Taxa de deslocamento" descricao="Lançada sozinha como item quando o mecânico chega ao local." />
      <div className="flex flex-col gap-4 p-5">
        <LinhaAlternador
          rotulo="Cobrar deslocamento"
          texto="Na chegada, o chamado ganha a linha de deslocamento (km × valor, com a taxa mínima), que segue para a OS como qualquer item. Contratos de frotistas podem ter valores próprios."
          ativo={form.deslocamento_ativo}
          onChange={(v) => mudar('deslocamento_ativo', v)}
          icone={<Route />}
        />
        <fieldset disabled={!form.deslocamento_ativo} className={cn('flex min-w-0 flex-col gap-4 transition-opacity', !form.deslocamento_ativo && 'opacity-55')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor por km (R$)" erro={erros.deslocamento_valor_km}>
              {(p) => (
                <Entrada {...p} inputMode="decimal" value={form.deslocamento_valor_km} onChange={(e) => mudar('deslocamento_valor_km', e.target.value)} placeholder="0,00" mono />
              )}
            </Campo>
            <Campo rotulo="Taxa mínima (R$)" erro={erros.deslocamento_taxa_minima} dica="Cobrada quando o km dá menos que isso.">
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={form.deslocamento_taxa_minima}
                  onChange={(e) => mudar('deslocamento_taxa_minima', e.target.value)}
                  placeholder="0,00"
                  mono
                />
              )}
            </Campo>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-3.5 py-2.5">
            <span className="flex min-w-0 items-start gap-3">
              <Repeat aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">Ida e volta</span>
                <span className="block text-[12.5px] leading-snug text-ink-3">Dobra a distância do mecânico até o cliente.</span>
              </span>
            </span>
            <span className={cn('flex min-h-10 items-center', ALVO_ALTERNADOR)}>
              <Alternador ativo={form.deslocamento_ida_volta} onChange={(v) => mudar('deslocamento_ida_volta', v)} rotulo="Ida e volta" />
            </span>
          </div>

          {/* Exemplo ao vivo: a mesma conta do banco com os valores digitados. */}
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-3.5">
            <p className="lbl mb-2">Exemplo com estes valores</p>
            {semCobranca ? (
              <p className="text-[12.5px] text-ink-3">Informe o valor por km ou a taxa mínima para ver quanto seria cobrado.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {exemplos.map((x) => (
                  <li key={x.ida} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12.5px]">
                    <span className="text-ink-2">
                      Mecânico a <b className="font-semibold text-ink tabular-nums">{x.ida} km</b>
                      {form.deslocamento_ida_volta && <span className="text-ink-3 tabular-nums"> · {x.km.toLocaleString('pt-BR')} km ida e volta</span>}
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      {x.minima && <span className="text-[11px] font-medium text-warn-ink">taxa mínima</span>}
                      <span className="num font-semibold text-ink">{moeda(x.valor)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SeletorServico valor={form.deslocamento_servico_id} aoMudar={(id) => mudar('deslocamento_servico_id', id)} />
        </fieldset>
      </div>
    </Painel>
  )
}

/**
 * Serviço do cadastro usado na linha de deslocamento — o código e o nome que
 * aparecem na OS. Sem vínculo, a linha vai só com a descrição "Deslocamento".
 */
function SeletorServico({ valor, aoMudar }: { valor: string; aoMudar: (id: string) => void }) {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const atual = useQuery({
    queryKey: ['sos', 'servico', valor],
    enabled: !!valor,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('servicos').select('id, codigo, descricao').eq('id', valor).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const catalogo = useQuery({
    queryKey: ['sos', 'catalogo', termo, 'servico'],
    enabled: !valor && termo.length >= 2,
    staleTime: 60_000,
    queryFn: () => sosCatalogo(termo, 'servico'),
  })

  if (valor) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="lbl">Serviço do catálogo na OS</span>
        <div className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-surface-2/60 px-3.5 py-2">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-soft text-cyan-ink">
            <Wrench className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {atual.data?.descricao ?? (atual.isLoading ? 'Carregando…' : 'Serviço vinculado')}
            </span>
            {atual.data?.codigo && <span className="num block truncate text-[11.5px] text-ink-3">{atual.data.codigo}</span>}
          </span>
          <Botao tamanho="sm" variante="fantasma" onClick={() => aoMudar('')} className="shrink-0 max-lg:h-11">
            Trocar
          </Botao>
        </div>
      </div>
    )
  }

  return (
    <Campo rotulo="Serviço do catálogo na OS" dica="Opcional. Dá código e nome do cadastro à linha de deslocamento.">
      {(p) => (
        <div className="flex flex-col gap-2">
          <Entrada {...p} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço (ex.: deslocamento)" iconeInicio={<Search />} autoComplete="off" />
          {termo.length >= 2 && (
            <ul className="max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface">
              {catalogo.isFetching && !catalogo.data && (
                <li className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-ink-3">
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </li>
              )}
              {catalogo.isError && <li className="px-3.5 py-3 text-[13px] text-crit-ink">{mensagemErro(catalogo.error)}</li>}
              {catalogo.isSuccess && catalogo.data.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">Nenhum serviço para “{termo}”.</li>}
              {(catalogo.data ?? []).map((s) => (
                <li key={s.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      qc.setQueryData(['sos', 'servico', s.id], { id: s.id, codigo: s.codigo ?? '', descricao: s.descricao })
                      setBusca('')
                      aoMudar(s.id)
                    }}
                    className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Wrench aria-hidden className="size-4 shrink-0 text-cyan-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{s.descricao}</span>
                      {s.codigo && <span className="num block truncate text-[11.5px] text-ink-3">{s.codigo}</span>}
                    </span>
                    {s.preco != null && <span className="num shrink-0 text-[12.5px] text-ink-2">{moeda(s.preco)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Campo>
  )
}

/* ── inteligência artificial ────────────────────────────────────────────── */

type ResultadoTeste = { ok: true; provedor: string; modelo: string; em: string } | { ok: false; erro: string; em: string }

function PainelIA({
  form,
  erros,
  mudar,
  mudarVarios,
  config,
  iaAlterada,
}: PropsPainel & { mudarVarios: (p: Partial<Formulario>) => void; config: ConfigSOS; iaAlterada: boolean }) {
  const [teste, setTeste] = useState<ResultadoTeste | null>(null)
  const provedoresTecnoar = config.tecnoar_ia_provedores ?? []
  const info = PROVEDORES_IA[form.ia_provedor]
  const chaveSalva = !!config.ia_apikey_definida
  const uso = config.ia_uso_30d

  const testar = useMutation({
    mutationFn: sosIaTestar,
    onSuccess: (r) => setTeste({ ok: true, provedor: r.provedor, modelo: r.modelo, em: new Date().toISOString() }),
    onError: (e) => setTeste({ ok: false, erro: e instanceof ErroIa ? e.message : mensagemErro(e), em: new Date().toISOString() }),
  })

  function escolherFonte(fonte: Formulario['ia_fonte']) {
    if (fonte === 'tecnoar') {
      const atual = provedoresTecnoar.find((p) => p.provedor === form.ia_provedor) ?? provedoresTecnoar.find((p) => p.conectada) ?? provedoresTecnoar[0]
      mudarVarios({
        ia_fonte: 'tecnoar',
        ia_apikey: '',
        ...(atual ? { ia_provedor: atual.provedor, ia_modelo: atual.provedor === form.ia_provedor && form.ia_modelo ? form.ia_modelo : atual.modelo || PROVEDORES_IA[atual.provedor].modelos[0] } : {}),
      })
    } else {
      mudarVarios({ ia_fonte: 'propria' })
    }
  }

  return (
    <Painel semPadding>
      <CabecalhoPainel
        titulo="Inteligência artificial"
        descricao="TECNO IA no app do cliente, leitura de fotos, kit sugerido e resumo para a OS. A chave fica no servidor e nunca volta para a tela."
        acao={
          <Selo tom={config.ia_ativa ? 'ok' : 'neutro'} ponto>
            {config.ia_ativa ? `Ligada · ${PROVEDORES_IA[config.ia_provedor ?? 'anthropic']?.nome.split(' ')[0] ?? config.ia_provedor}` : 'Desligada'}
          </Selo>
        }
      />
      <div className="flex flex-col gap-5 p-5">
        <LinhaAlternador
          rotulo="IA do SOS ligada"
          texto="Desligada, nenhuma função de IA aparece no app nem na central — e nenhuma chamada ao provedor é feita."
          ativo={form.ia_ativa}
          onChange={(v) => mudar('ia_ativa', v)}
          icone={<Bot />}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-6">
          {/* ── chave e modelo ── */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="lbl">Chave de acesso</span>
              <div role="radiogroup" aria-label="Origem da chave da IA" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <OpcaoModo
                  ativo={form.ia_fonte === 'tecnoar'}
                  onClick={() => escolherFonte('tecnoar')}
                  icone={<Link2 />}
                  titulo="Usar a chave da Tecnoar IA"
                  texto="Aproveita a chave já cadastrada para os colaboradores. Um cadastro só para manter."
                />
                <OpcaoModo
                  ativo={form.ia_fonte === 'propria'}
                  onClick={() => escolherFonte('propria')}
                  icone={<KeyRound />}
                  titulo="Chave própria"
                  texto="Uma chave só do SOS — o consumo do app fica separado do uso interno."
                />
              </div>
            </div>

            {form.ia_fonte === 'tecnoar' ? (
              <div className="flex flex-col gap-2">
                <span className="lbl">Chave da Tecnoar IA</span>
                {provedoresTecnoar.length === 0 ? (
                  <Aviso tom="atencao" titulo="A Tecnoar IA ainda não tem chave cadastrada">
                    Cadastre em Inteligência → Tecnoar IA → Configuração, ou use uma chave própria aqui.
                  </Aviso>
                ) : (
                  <div role="radiogroup" aria-label="Chave da Tecnoar IA" className="flex flex-col gap-2">
                    {provedoresTecnoar.map((p) => {
                      const ativo = form.ia_provedor === p.provedor
                      return (
                        <button
                          key={p.provedor}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => mudarVarios({ ia_provedor: p.provedor, ia_modelo: p.modelo || PROVEDORES_IA[p.provedor].modelos[0] })}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                            ativo ? 'border-accent bg-accent-soft ring-1 ring-accent/30' : 'border-line-strong hover:border-ink-3',
                          )}
                        >
                          <span aria-hidden className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', ativo ? 'border-accent' : 'border-line-strong')}>
                            {ativo && <span className="size-1.5 rounded-full bg-accent" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-ink">{PROVEDORES_IA[p.provedor]?.nome ?? p.provedor}</span>
                            <span className="num block truncate text-[11.5px] text-ink-3">{p.modelo || 'modelo não definido na Tecnoar IA'}</span>
                            {/* No celular a situação desce para baixo do nome, que precisa da largura. */}
                            <span className={cn('block text-[11.5px] font-semibold sm:hidden', p.conectada ? 'text-ok-ink' : 'text-warn-ink')}>
                              {p.conectada ? 'Conectada' : 'Não testada'}
                            </span>
                          </span>
                          <Selo tom={p.conectada ? 'ok' : 'atencao'} ponto className="hidden shrink-0 sm:inline-flex">
                            {p.conectada ? 'Conectada' : 'Não testada'}
                          </Selo>
                        </button>
                      )
                    })}
                  </div>
                )}
                {erros.ia_provedor && <p className="text-[11.5px] font-medium text-crit-ink" role="alert">{erros.ia_provedor}</p>}
                {chaveSalva && !form.ia_remover_chave && (
                  <Aviso
                    tom="atencao"
                    titulo="Há uma chave própria salva"
                    acao={
                      <Botao tamanho="sm" variante="destrutivo" iconeInicio={<Trash2 />} onClick={() => mudar('ia_remover_chave', true)} className="max-lg:h-11">
                        Remover
                      </Botao>
                    }
                  >
                    Enquanto ela existir, o servidor usa a chave própria em vez da Tecnoar IA.
                  </Aviso>
                )}
                {chaveSalva && form.ia_remover_chave && <ChaveSeraRemovida aoDesfazer={() => mudar('ia_remover_chave', false)} />}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo rotulo="Provedor" erro={erros.ia_provedor}>
                  {(p) => (
                    <Selecao
                      {...p}
                      value={form.ia_provedor}
                      onChange={(e) => {
                        const novo = e.target.value as ProvedorIa
                        mudarVarios({ ia_provedor: novo, ia_modelo: PROVEDORES_IA[novo].modelos[0] })
                      }}
                    >
                      {ORDEM_PROVEDORES.map((id) => (
                        <option key={id} value={id}>
                          {PROVEDORES_IA[id].nome}
                        </option>
                      ))}
                    </Selecao>
                  )}
                </Campo>
                <div className="sm:col-span-2">
                  {form.ia_remover_chave ? (
                    <ChaveSeraRemovida aoDesfazer={() => mudar('ia_remover_chave', false)} />
                  ) : (
                    <Campo
                      rotulo="Chave da API"
                      erro={erros.ia_apikey}
                      dica={chaveSalva ? 'Chave salva. Deixe em branco para manter; cole outra para substituir.' : `Em ${info.onde} · começa com ${info.prefixo}`}
                    >
                      {(p) => (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <div className="min-w-0 flex-1">
                            <Entrada
                              {...p}
                              type="password"
                              value={form.ia_apikey}
                              onChange={(e) => mudar('ia_apikey', e.target.value)}
                              placeholder={chaveSalva ? '•••••••• (chave salva)' : `${info.prefixo}…`}
                              autoComplete="new-password"
                              spellCheck={false}
                              iconeInicio={<KeyRound />}
                              mono
                            />
                          </div>
                          {chaveSalva && (
                            <Botao
                              variante="destrutivo"
                              iconeInicio={<Trash2 />}
                              onClick={() => mudarVarios({ ia_remover_chave: true, ia_apikey: '' })}
                              className="shrink-0 max-lg:h-11"
                            >
                              Remover chave
                            </Botao>
                          )}
                        </div>
                      )}
                    </Campo>
                  )}
                  {chaveSalva && !form.ia_remover_chave && !form.ia_apikey && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-ok-ink">
                      <CheckCircle2 aria-hidden className="size-3.5" /> Chave salva no servidor
                    </p>
                  )}
                </div>
              </div>
            )}

            <Campo rotulo="Modelo" erro={erros.ia_modelo} dica="Qualquer identificador do provedor vale; os botões são atalhos.">
              {(p) => (
                <div className="flex flex-col gap-2">
                  <Entrada {...p} value={form.ia_modelo} onChange={(e) => mudar('ia_modelo', e.target.value)} placeholder={info.modelos[0]} spellCheck={false} autoComplete="off" mono />
                  <div className="flex flex-wrap gap-1.5">
                    {info.modelos.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => mudar('ia_modelo', m)}
                        aria-pressed={form.ia_modelo === m}
                        className={cn(
                          'num min-h-11 rounded-full border px-3 text-[12px] transition-colors lg:min-h-8',
                          form.ia_modelo === m ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Campo>

            {/* Teste: chama o provedor com a configuração salva. */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">Testar conexão</p>
                  <p className="text-[12px] leading-snug text-ink-3">
                    {iaAlterada ? 'Salve as alterações da IA primeiro — o teste usa a configuração salva.' : 'Faz uma pergunta curta ao provedor com a chave e o modelo salvos.'}
                  </p>
                </div>
                <Botao
                  variante="secundario"
                  iconeInicio={<Plug />}
                  carregando={testar.isPending}
                  disabled={iaAlterada}
                  onClick={() => testar.mutate()}
                  className="shrink-0 max-lg:h-11 max-sm:w-full"
                >
                  {teste ? 'Testar de novo' : 'Testar conexão'}
                </Botao>
              </div>
              {testar.isPending && (
                <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" /> Aguardando o provedor…
                </p>
              )}
              {teste && !testar.isPending && (
                <div
                  role="status"
                  className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-snug', teste.ok ? 'bg-ok-soft text-ok-ink' : 'bg-crit-soft text-crit-ink')}
                >
                  {teste.ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
                  <span className="min-w-0 break-words">
                    {teste.ok ? (
                      <>
                        <b>Conectada.</b> {PROVEDORES_IA[teste.provedor as ProvedorIa]?.nome ?? teste.provedor} respondeu com <span className="num">{teste.modelo}</span>.
                      </>
                    ) : (
                      <>
                        <b>Falhou.</b> {teste.erro}
                      </>
                    )}
                    <span className="num ml-1 opacity-70">({new Date(teste.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── o que a IA faz ── */}
          <div className="flex min-w-0 flex-col gap-4">
            <fieldset disabled={!form.ia_ativa} className={cn('flex min-w-0 flex-col gap-2 transition-opacity', !form.ia_ativa && 'opacity-55')}>
              <legend className="lbl mb-2">Onde a IA ajuda</legend>
              <LinhaAlternador
                rotulo="Atendimento no app (TECNO IA)"
                texto="O cliente conversa antes de pedir socorro; a IA orienta e sugere abrir o SOS ou agendar."
                ativo={form.ia_atendimento}
                onChange={(v) => mudar('ia_atendimento', v)}
                icone={<MessageCircle />}
                disabled={!form.ia_ativa}
                className="py-2.5"
              />
              <LinhaAlternador
                rotulo="Análise de fotos"
                texto="Mecânico e central pedem uma leitura técnica das fotos do chamado."
                ativo={form.ia_foto}
                onChange={(v) => mudar('ia_foto', v)}
                icone={<Camera />}
                disabled={!form.ia_ativa}
                className="py-2.5"
              />
              <LinhaAlternador
                rotulo="Kit sugerido"
                texto="Hipóteses, ferramentas e peças do catálogo (com preço e estoque) para o mecânico levar."
                ativo={form.ia_kit}
                onChange={(v) => mudar('ia_kit', v)}
                icone={<PackageSearch />}
                disabled={!form.ia_ativa}
                className="py-2.5"
              />
              <LinhaAlternador
                rotulo="Resumo para a OS"
                texto="Diagnóstico, serviço e observações escritos a partir da conversa, da linha do tempo e dos itens."
                ativo={form.ia_resumo}
                onChange={(v) => mudar('ia_resumo', v)}
                icone={<ClipboardPen />}
                disabled={!form.ia_ativa}
                className="py-2.5"
              />
            </fieldset>

            <Campo rotulo="Limite por cliente (conversas por dia)" erro={erros.ia_limite_cliente_dia} dica="Protege o custo da TECNO IA no app. 0 = sem limite.">
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="numeric"
                  value={form.ia_limite_cliente_dia}
                  onChange={(e) => mudar('ia_limite_cliente_dia', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="sm:max-w-40"
                  mono
                />
              )}
            </Campo>
            <Campo rotulo="Instruções da casa" dica="Somadas às instruções da IA. Ex.: sempre lembrar do calço antes de entrar sob o caminhão.">
              {(p) => <AreaTexto {...p} rows={3} maxLength={2000} value={form.ia_instrucoes} onChange={(e) => mudar('ia_instrucoes', e.target.value)} />}
            </Campo>

            <div className="flex flex-col gap-2">
              <span className="lbl">Uso nos últimos 30 dias</span>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                {[
                  ['Respostas', uso ? milhares(uso.respostas) : '—', false],
                  ['Erros', uso ? milhares(uso.erros) : '—', !!uso && uso.erros > 0],
                  ['Tokens de entrada', uso ? milhares(uso.tokens_entrada) : '—', false],
                  ['Tokens de saída', uso ? milhares(uso.tokens_saida) : '—', false],
                ].map(([rotulo, valor, alerta]) => (
                  <div key={rotulo as string} className="min-w-0 bg-surface px-3 py-2.5">
                    <dt className="truncate text-[11px] text-ink-3">{rotulo}</dt>
                    <dd className={cn('num text-[16px] font-semibold', alerta ? 'text-crit-ink' : 'text-ink')}>{valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </Painel>
  )
}

function ChaveSeraRemovida({ aoDesfazer }: { aoDesfazer: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crit/35 bg-crit-soft px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-crit-ink">
        <Trash2 aria-hidden className="size-4" /> A chave própria será apagada ao salvar.
      </span>
      <Botao tamanho="sm" variante="fantasma" iconeInicio={<RefreshCw />} onClick={aoDesfazer} className="max-lg:h-11">
        Manter chave
      </Botao>
    </div>
  )
}

/* ── WhatsApp ───────────────────────────────────────────────────────────── */

function PainelWhatsApp({ form, erros, mudar, chaveDefinida }: PropsPainel & { chaveDefinida: boolean }) {
  return (
    <Painel semPadding>
      <CabecalhoPainel titulo="WhatsApp da central" descricao="Canal extra: cada SOS novo também chega no WhatsApp (Evolution API)." />
      <div className="flex flex-col gap-4 p-5">
        <LinhaAlternador
          rotulo="Avisar novos SOS no WhatsApp"
          texto="Complementa o alerta do sistema — útil fora do horário, quando ninguém está com o Checklist aberto."
          ativo={form.whatsapp_ativo}
          onChange={(v) => mudar('whatsapp_ativo', v)}
          icone={<MessageCircle />}
        />
        <fieldset disabled={!form.whatsapp_ativo} className={cn('flex flex-col gap-3 transition-opacity', !form.whatsapp_ativo && 'opacity-55')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="URL da Evolution API" erro={erros.whatsapp_url}>
              {(p) => <Entrada {...p} value={form.whatsapp_url} onChange={(e) => mudar('whatsapp_url', e.target.value)} placeholder="https://evolution.suaempresa.com.br" autoComplete="off" />}
            </Campo>
            <Campo rotulo="Instância" erro={erros.whatsapp_instancia}>
              {(p) => <Entrada {...p} value={form.whatsapp_instancia} onChange={(e) => mudar('whatsapp_instancia', e.target.value)} placeholder="tecnoar" autoComplete="off" />}
            </Campo>
          </div>
          <Campo rotulo="Números que recebem o aviso" erro={erros.whatsapp_destinos} dica="Um por linha, com DDD. Ex.: 11999990000">
            {(p) => <AreaTexto {...p} rows={3} value={form.whatsapp_destinos} onChange={(e) => mudar('whatsapp_destinos', e.target.value)} className="num" />}
          </Campo>
          <Campo
            rotulo="API key"
            erro={erros.whatsapp_apikey}
            dica={chaveDefinida ? 'Chave definida. Deixe em branco para manter a atual.' : 'A chave é guardada no servidor e nunca volta para a tela.'}
          >
            {(p) => (
              <Entrada
                {...p}
                type="password"
                value={form.whatsapp_apikey}
                onChange={(e) => mudar('whatsapp_apikey', e.target.value)}
                placeholder={chaveDefinida ? '•••••••• (chave definida)' : 'Cole a API key'}
                autoComplete="new-password"
                iconeInicio={<KeyRound />}
              />
            )}
          </Campo>
        </fieldset>
      </div>
    </Painel>
  )
}

function OpcaoModo({ ativo, onClick, icone, titulo, texto }: { ativo: boolean; onClick: () => void; icone: ReactNode; titulo: string; texto: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors',
        ativo ? 'border-accent bg-accent-soft ring-1 ring-accent/30' : 'border-line-strong hover:border-ink-3',
      )}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4', ativo ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2')}>
          {icone}
        </span>
        <span className="min-w-0 font-display text-[14px] leading-tight font-semibold text-ink">{titulo}</span>
        {ativo && <span className="ml-auto shrink-0 text-[11px] font-semibold text-accent-ink">Em uso</span>}
      </span>
      <span className="text-[12.5px] leading-relaxed text-ink-2">{texto}</span>
    </button>
  )
}
