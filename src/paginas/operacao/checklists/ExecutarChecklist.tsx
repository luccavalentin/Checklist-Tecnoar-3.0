import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleSlash,
  Download,
  Eye,
  HelpCircle,
  Minus,
  Paperclip,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { mascaraDocumento } from '@/lib/formatos'
import { ROTULO_TIPO_CHECKLIST } from './rotulos'
import { useAuth } from '@/auth/AuthProvider'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Selo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { REF_PRODUTO, REF_SERVICO, SeletorRef } from '@/componentes/ui/SeletorRef'
import type {
  Checklist,
  ChecklistDefeito,
  ChecklistResposta,
  Criticidade,
  RespostaChecklist,
} from '@/tipos/db'

const OPCOES_ESTADO: Array<{ valor: RespostaChecklist; rotulo: string; icone: typeof Check; tom: string }> = [
  { valor: 'ok', rotulo: 'OK', icone: Check, tom: 'ok' },
  { valor: 'nao_ok', rotulo: 'Não OK', icone: X, tom: 'crit' },
  { valor: 'nao_se_aplica', rotulo: 'Não se aplica', icone: Minus, tom: 'neutro' },
  { valor: 'nao_verificado', rotulo: 'Não verificado', icone: HelpCircle, tom: 'warn' },
]

const OPCOES_CONFORMIDADE: Array<{ valor: RespostaChecklist; rotulo: string; icone: typeof Check; tom: string }> = [
  { valor: 'conforme', rotulo: 'Conforme', icone: CheckCircle2, tom: 'ok' },
  { valor: 'nao_conforme', rotulo: 'Não conforme', icone: CircleSlash, tom: 'crit' },
  { valor: 'nao_se_aplica', rotulo: 'Não se aplica', icone: Minus, tom: 'neutro' },
]

export const ROTULO_RESPOSTA: Record<RespostaChecklist, string> = {
  ok: 'OK',
  nao_ok: 'Não OK',
  nao_se_aplica: 'Não se aplica',
  nao_verificado: 'Não verificado',
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
}

const CLASSES_TOM: Record<string, { ativo: string; inativo: string }> = {
  ok: { ativo: 'border-ok bg-ok-soft text-ok-ink', inativo: 'border-line-strong text-ink-3 hover:text-ok-ink' },
  crit: { ativo: 'border-crit bg-crit-soft text-crit-ink', inativo: 'border-line-strong text-ink-3 hover:text-crit-ink' },
  warn: { ativo: 'border-warn bg-warn-soft text-warn-ink', inativo: 'border-line-strong text-ink-3 hover:text-warn-ink' },
  neutro: { ativo: 'border-ink-3 bg-ink-3/10 text-ink-2', inativo: 'border-line-strong text-ink-3 hover:text-ink-2' },
}

const CRITICIDADES: Array<{ valor: Criticidade; rotulo: string }> = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'critica', rotulo: 'Crítica' },
]

export const TOM_CRITICIDADE: Record<Criticidade, 'neutro' | 'atencao' | 'destaque' | 'critico'> = {
  baixa: 'neutro',
  media: 'atencao',
  alta: 'destaque',
  critica: 'critico',
}

/** Um item respondido negativamente exige registro de defeito. */
const NEGATIVAS: RespostaChecklist[] = ['nao_ok', 'nao_conforme']

export function ExecutarChecklist({
  checklistId,
  somenteLeitura,
  aoConcluir,
}: {
  checklistId: string
  somenteLeitura?: boolean
  aoConcluir?: () => void
}) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [defeitoDe, setDefeitoDe] = useState<ChecklistResposta | null>(null)
  const [evidenciaDe, setEvidenciaDe] = useState<ChecklistResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [garantia, setGarantia] = useState({ dias: '90', km: '', observacao: '' })
  const [gerando, setGerando] = useState<'ver' | 'baixar' | null>(null)

  const checklist = useQuery({
    queryKey: ['checklist', checklistId],
    queryFn: async (): Promise<Checklist | null> => {
      const { data, error } = await supabase.from('checklists').select('*').eq('id', checklistId).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const respostas = useQuery({
    queryKey: ['checklist-respostas', checklistId],
    queryFn: async (): Promise<ChecklistResposta[]> => {
      const { data, error } = await supabase
        .from('checklist_respostas')
        .select('*')
        .eq('checklist_id', checklistId)
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const defeitos = useQuery({
    queryKey: ['checklist-defeitos', checklistId],
    queryFn: async (): Promise<ChecklistDefeito[]> => {
      const { data, error } = await supabase
        .from('checklist_defeitos')
        .select('*')
        .eq('checklist_id', checklistId)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })

  const responder = useMutation({
    mutationFn: async ({
      id,
      resposta,
      observacao,
      medicao,
    }: {
      id: string
      resposta?: RespostaChecklist | null
      observacao?: string | null
      medicao?: number | null
    }) => {
      const alteracao: Record<string, unknown> = {}
      if (resposta !== undefined) {
        alteracao.resposta = resposta
        alteracao.respondido_em = resposta ? new Date().toISOString() : null
        alteracao.respondido_por = resposta ? (usuario?.id ?? null) : null
      }
      if (observacao !== undefined) alteracao.observacao = observacao
      if (medicao !== undefined) alteracao.medicao = medicao

      const { error } = await supabase
        .from('checklist_respostas')
        .update(alteracao as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checklist-respostas', checklistId] }),
    onError: (e) => toast.erro('Não foi possível salvar a resposta', mensagemErro(e)),
  })

  const salvarDefeito = useMutation({
    mutationFn: async (d: {
      resposta_id: string
      sistema: string
      componente: string
      defeito: string
      descricao: string
      criticidade: Criticidade
      recomendacao: string
      produto_id: string | null
      servico_id: string | null
    }) => {
      if (!d.defeito.trim()) throw new Error('Descreva o defeito encontrado.')
      const { error } = await supabase.from('checklist_defeitos').insert({
        resposta_id: d.resposta_id,
        checklist_id: checklistId,
        sistema: d.sistema.trim() || null,
        componente: d.componente.trim() || null,
        defeito: d.defeito.trim(),
        descricao: d.descricao.trim() || null,
        criticidade: d.criticidade,
        recomendacao: d.recomendacao.trim() || null,
        produto_id: d.produto_id,
        servico_id: d.servico_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Defeito registrado')
      setDefeitoDe(null)
      void qc.invalidateQueries({ queryKey: ['checklist-defeitos', checklistId] })
    },
    onError: (e) => toast.erro('Não foi possível registrar', mensagemErro(e)),
  })

  /**
   * Garantia do serviço, definida no checklist de saída.
   *
   * Quem sabe quanto tempo a peça aguenta é o mecânico que acabou de montá-la,
   * e o momento em que ele sabe disso é ao conferir o serviço pronto. O prazo
   * gravado aqui vira registro em Garantias quando o veículo sai do pátio.
   */
  const concluir = useMutation({
    mutationFn: async () => {
      setErro(null)

      if (ehSaida) {
        const dias = Number(garantia.dias)
        const km = garantia.km.trim() === '' ? null : Number(garantia.km.replace(/\D/g, ''))
        if (!Number.isFinite(dias) || dias < 0 || dias > 3650) {
          throw new Error('O prazo de garantia precisa ficar entre 0 e 3650 dias.')
        }
        const { error: erroGarantia } = await supabase
          .from('checklists')
          .update({
            garantia_dias: dias || null,
            garantia_km: km,
            garantia_observacao: garantia.observacao.trim() || null,
          })
          .eq('id', checklistId)
        if (erroGarantia) throw erroGarantia
      }

      const { error } = await supabase.rpc('concluir_checklist', { p_checklist: checklistId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Checklist concluído')
      void qc.invalidateQueries({ queryKey: ['checklist', checklistId] })
      void qc.invalidateQueries({ queryKey: ['checklists'] })
      aoConcluir?.()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const porSecao = useMemo(() => {
    const mapa = new Map<string, ChecklistResposta[]>()
    for (const r of respostas.data ?? []) {
      const lista = mapa.get(r.secao) ?? []
      lista.push(r)
      mapa.set(r.secao, lista)
    }
    return [...mapa.entries()]
  }, [respostas.data])

  /**
   * Documento do checklist.
   *
   * Os dados de contexto (empresa, responsável, veículo, cliente, OS) só são
   * buscados na hora de gerar: são leituras que não interessam a quem está
   * apenas respondendo os itens na bancada.
   */
  async function gerarPdf(acao: 'ver' | 'baixar') {
    const c = checklist.data
    if (!c) return
    setGerando(acao)
    try {
      const [{ pdfChecklist }, { abrirPdf, baixarPdf, nomeArquivo }] = await Promise.all([
        import('@/documentos/pdfChecklist'),
        import('@/documentos/pdf'),
      ])

      const [emp, resp, veic, cli, os] = await Promise.all([
        supabase.from('dados_empresa').select('*').maybeSingle(),
        c.responsavel_id
          ? supabase.from('usuarios').select('nome_completo').eq('id', c.responsavel_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        c.veiculo_id
          ? supabase.from('veiculos').select('placa, descricao').eq('id', c.veiculo_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        c.cliente_id
          ? supabase.from('clientes').select('nome_razao').eq('id', c.cliente_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        c.os_id
          ? supabase.from('ordens_servico').select('numero').eq('id', c.os_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      const e = emp.data
      const porSecaoPdf = new Map<string, typeof respostas.data>()
      for (const r of respostas.data ?? []) {
        const lista = porSecaoPdf.get(r.secao) ?? []
        lista.push(r)
        porSecaoPdf.set(r.secao, lista)
      }

      const definicao = await pdfChecklist({
        empresa: {
          nome: e?.nome_fantasia || e?.razao_social || 'Tecnoar Freios',
          razaoSocial: e?.razao_social ?? null,
          cnpj: e?.cnpj ? mascaraDocumento(e.cnpj) : null,
          inscricaoEstadual: e?.inscricao_estadual ?? null,
          inscricaoMunicipal: e?.inscricao_municipal ?? null,
          telefone: e?.telefone ?? null,
          endereco: e?.endereco ?? null,
          email: e?.email ?? null,
        },
        checklist: {
          numero: c.numero,
          modelo: c.modelo_descricao,
          tipo: ROTULO_TIPO_CHECKLIST[c.tipo],
          versao: c.versao,
          situacao:
            c.situacao === 'concluido' ? 'Concluído' : c.situacao === 'cancelado' ? 'Cancelado' : 'Em andamento',
          iniciado_em: c.iniciado_em,
          concluido_em: c.concluido_em,
          observacoes: c.observacoes,
          setor: c.setor,
          data_referencia: c.data_referencia,
          km: c.km,
        },
        responsavel: resp.data?.nome_completo ?? null,
        cliente: cli.data?.nome_razao ?? null,
        veiculo: veic.data ? { placa: veic.data.placa, descricao: veic.data.descricao } : null,
        os: os.data?.numero ?? null,
        secoes: [...porSecaoPdf.entries()].map(([secao, itens]) => ({
          secao,
          itens: (itens ?? []).map((i) => ({
            texto: i.texto,
            resposta: i.resposta,
            observacao: i.observacao,
            medicao: i.medicao,
            unidade: i.unidade_medicao,
            obrigatorio: i.obrigatorio,
            exigeEvidencia: i.exige_evidencia,
          })),
        })),
        defeitos: (defeitos.data ?? []).map((f) => ({
          defeito: f.defeito,
          descricao: f.descricao,
          sistema: f.sistema,
          componente: f.componente,
          criticidade: CRITICIDADES.find((x) => x.valor === f.criticidade)?.rotulo ?? f.criticidade,
          recomendacao: f.recomendacao,
        })),
        rotuloResposta: ROTULO_RESPOSTA,
      })

      const arquivo = nomeArquivo(['checklist', String(c.numero).padStart(5, '0'), c.modelo_descricao])
      if (acao === 'baixar') await baixarPdf(definicao, `${arquivo}.pdf`)
      else await abrirPdf(definicao)
    } catch (e) {
      toast.erro('Não foi possível gerar o PDF', mensagemErro(e))
    } finally {
      setGerando(null)
    }
  }

  const total = respostas.data?.length ?? 0
  const respondidos = (respostas.data ?? []).filter((r) => r.resposta !== null).length
  const pendentesObrigatorios = (respostas.data ?? []).filter((r) => r.obrigatorio && r.resposta === null).length
  const negativos = (respostas.data ?? []).filter((r) => r.resposta && NEGATIVAS.includes(r.resposta)).length
  const concluido = checklist.data?.situacao === 'concluido'
  const bloqueado = somenteLeitura || concluido

  if (checklist.isLoading || respostas.isLoading) return <EstadoCarregando rotulo="Carregando checklist…" />
  if (checklist.isError)
    return <EstadoErro descricao={mensagemErro(checklist.error)} aoTentarNovamente={() => void checklist.refetch()} />
  if (!checklist.data) return <EstadoVazio titulo="Checklist não encontrado" />

  const c = checklist.data
  /* Só o checklist de saída define garantia — é ele que atesta o serviço pronto. */
  const ehSaida = c.tipo === 'final_os'

  return (
    <div className="flex flex-col gap-4">
      {/* progresso */}
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="lbl">
              {c.modelo_descricao} · versão {c.versao}
            </span>
            <span className="text-[13px] text-ink-2">
              {respondidos} de {total} itens respondidos
              {negativos > 0 && ` · ${negativos} apontamento(s)`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {concluido ? (
              <Selo tom="ok" ponto>Concluído em {dataHora(c.concluido_em)}</Selo>
            ) : (
              <Selo tom="info" ponto>Em andamento</Selo>
            )}
            <Botao
              tamanho="sm"
              variante="neutro"
              iconeInicio={<Eye />}
              carregando={gerando === 'ver'}
              onClick={() => void gerarPdf('ver')}
            >
              Ver PDF
            </Botao>
            <Botao
              tamanho="sm"
              variante="neutro"
              iconeInicio={<Download />}
              carregando={gerando === 'baixar'}
              onClick={() => void gerarPdf('baixar')}
            >
              Baixar PDF
            </Botao>
          </div>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-cyan transition-[width] duration-300"
            style={{ width: `${total ? Math.round((respondidos / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {erro && <Aviso tom="critico">{erro}</Aviso>}

      {porSecao.length === 0 && (
        <EstadoVazio titulo="Modelo sem itens" descricao="Este modelo de checklist não tem itens cadastrados." />
      )}

      {porSecao.map(([secao, itens]) => (
        <Painel key={secao} semPadding>
          <CabecalhoPainel
            titulo={secao}
            acao={
              <span className="num text-[11.5px] text-ink-3">
                {itens.filter((i) => i.resposta !== null).length}/{itens.length}
              </span>
            }
          />
          <ul className="flex flex-col divide-y divide-[var(--c-line)]">
            {itens.map((item) => {
              const opcoes = item.tipo_resposta === 'conformidade' ? OPCOES_CONFORMIDADE : OPCOES_ESTADO
              const negativo = item.resposta && NEGATIVAS.includes(item.resposta)
              const defeitosDoItem = (defeitos.data ?? []).filter((d) => d.resposta_id === item.id)

              return (
                <li key={item.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="num mt-0.5 w-6 shrink-0 text-[11px] text-ink-3">
                        {String(item.ordem).padStart(2, '0')}
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13.5px] text-ink">
                          {item.texto}
                          {item.obrigatorio && <span className="ml-1 text-accent">*</span>}
                        </span>
                        {item.observacao && (
                          <span className="text-[12px] text-ink-3">Observação: {item.observacao}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {opcoes.map((o) => {
                        const ativo = item.resposta === o.valor
                        const classes = CLASSES_TOM[o.tom]!
                        return (
                          <button
                            key={o.valor}
                            type="button"
                            aria-pressed={ativo}
                            disabled={bloqueado || responder.isPending}
                            onClick={() =>
                              responder.mutate({ id: item.id, resposta: ativo ? null : o.valor })
                            }
                            className={cn(
                              'flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors',
                              'disabled:cursor-not-allowed disabled:opacity-60',
                              ativo ? classes.ativo : classes.inativo,
                            )}
                          >
                            <o.icone aria-hidden className="size-3.5" />
                            <span className="hidden sm:inline">{o.rotulo}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {(item.exige_medicao || negativo || item.resposta) && !bloqueado && (
                    <div className="flex flex-wrap items-end gap-3 pl-8">
                      {item.exige_medicao && (
                        <Campo rotulo={`Medição${item.unidade_medicao ? ` (${item.unidade_medicao})` : ''}`}>
                          {(p) => (
                            <Entrada
                              {...p}
                              mono
                              type="number"
                              step="0.001"
                              className="w-32"
                              defaultValue={item.medicao ?? ''}
                              onBlur={(e) =>
                                responder.mutate({ id: item.id, medicao: e.target.value ? Number(e.target.value) : null })
                              }
                            />
                          )}
                        </Campo>
                      )}

                      <Campo rotulo="Observação" className="min-w-52 flex-1">
                        {(p) => (
                          <Entrada
                            {...p}
                            defaultValue={item.observacao ?? ''}
                            placeholder="Opcional"
                            onBlur={(e) => responder.mutate({ id: item.id, observacao: e.target.value.trim() || null })}
                          />
                        )}
                      </Campo>

                      <Botao tamanho="sm" variante="neutro" iconeInicio={<Paperclip />} onClick={() => setEvidenciaDe(item)}>
                        Evidência
                      </Botao>

                      {negativo && (
                        <Botao tamanho="sm" variante="destrutivo" iconeInicio={<AlertTriangle />} onClick={() => setDefeitoDe(item)}>
                          Registrar defeito
                        </Botao>
                      )}
                    </div>
                  )}

                  {defeitosDoItem.length > 0 && (
                    <ul className="flex flex-col gap-2 pl-8">
                      {defeitosDoItem.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border border-crit/30 bg-crit-soft/40 p-2.5">
                          <Selo tom={TOM_CRITICIDADE[d.criticidade]}>{d.criticidade}</Selo>
                          <span className="text-[12.5px] font-medium text-ink">{d.defeito}</span>
                          {d.componente && <span className="text-[12px] text-ink-3">{d.componente}</span>}
                          {d.recomendacao && <span className="text-[12px] text-ink-2">→ {d.recomendacao}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Painel>
      ))}

      {!bloqueado && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-e2">
          <span className="text-[13px] text-ink-2">
            {pendentesObrigatorios > 0
              ? `${pendentesObrigatorios} item(ns) obrigatório(s) ainda sem resposta.`
              : 'Todos os itens obrigatórios foram respondidos.'}
          </span>
          <Botao
            variante="primario"
            iconeInicio={<CheckCircle2 />}
            disabled={pendentesObrigatorios > 0}
            carregando={concluir.isPending}
            onClick={() => concluir.mutate()}
          >
            Concluir checklist
          </Botao>
        </div>
      )}

      {ehSaida && !bloqueado && (
        <Secao
          numero="99"
          titulo="Garantia do serviço"
          descricao="Definida por quem conferiu. Vira registro em Garantias quando o veículo sair do pátio."
        >
          <Grade>
            <Campo
              className="sm:col-span-3"
              rotulo="Prazo (dias)"
              dica="Zero significa sem garantia."
            >
              {(p) => (
                <Entrada
                  {...p}
                  mono
                  type="number"
                  min="0"
                  max="3650"
                  value={garantia.dias}
                  onChange={(e) => setGarantia({ ...garantia, dias: e.target.value })}
                />
              )}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="Limite de KM" dica="Opcional. Somado ao KM de saída.">
              {(p) => (
                <Entrada
                  {...p}
                  mono
                  inputMode="numeric"
                  value={garantia.km}
                  onChange={(e) => setGarantia({ ...garantia, km: e.target.value.replace(/\D/g, '') })}
                  placeholder="Sem limite"
                />
              )}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Condição da garantia">
              {(p) => (
                <Entrada
                  {...p}
                  value={garantia.observacao}
                  onChange={(e) => setGarantia({ ...garantia, observacao: e.target.value })}
                  placeholder="Ex.: não cobre desgaste por uso indevido do freio motor."
                />
              )}
            </Campo>
          </Grade>
          {Number(garantia.dias) > 0 && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              Vale até{' '}
              <strong className="num">
                {new Date(Date.now() + Number(garantia.dias) * 86400000).toLocaleDateString('pt-BR')}
              </strong>
              {garantia.km ? ` ou ${Number(garantia.km).toLocaleString('pt-BR')} km rodados` : ''}.
            </p>
          )}
        </Secao>
      )}

      <ModalDefeito
        item={defeitoDe}
        aoFechar={() => setDefeitoDe(null)}
        aoSalvar={(d) => defeitoDe && salvarDefeito.mutate({ ...d, resposta_id: defeitoDe.id })}
        carregando={salvarDefeito.isPending}
      />

      <Modal
        aberto={Boolean(evidenciaDe)}
        aoFechar={() => setEvidenciaDe(null)}
        titulo="Evidências do item"
        descricao={evidenciaDe?.texto}
        largura="lg"
      >
        {evidenciaDe && (
          <Evidencias
            entidade="checklist_respostas"
            entidadeId={evidenciaDe.id}
            categorias={['Foto', 'Vídeo', 'Áudio', 'Documento']}
            somenteLeitura={bloqueado}
            titulo="Arquivos"
            contexto={{ checklist_id: checklistId, item: evidenciaDe.texto }}
          />
        )}
      </Modal>
    </div>
  )
}

function ModalDefeito({
  item,
  aoFechar,
  aoSalvar,
  carregando,
}: {
  item: ChecklistResposta | null
  aoFechar: () => void
  aoSalvar: (d: {
    sistema: string
    componente: string
    defeito: string
    descricao: string
    criticidade: Criticidade
    recomendacao: string
    produto_id: string | null
    servico_id: string | null
  }) => void
  carregando: boolean
}) {
  const [sistema, setSistema] = useState('')
  const [componente, setComponente] = useState('')
  const [defeito, setDefeito] = useState('')
  const [descricao, setDescricao] = useState('')
  const [criticidade, setCriticidade] = useState<Criticidade>('media')
  const [recomendacao, setRecomendacao] = useState('')
  const [produto, setProduto] = useState<string | null>(null)
  const [servico, setServico] = useState<string | null>(null)

  return (
    <Modal
      aberto={Boolean(item)}
      aoFechar={aoFechar}
      titulo="Registrar defeito"
      descricao={item?.texto}
      largura="lg"
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={carregando}
            onClick={() =>
              aoSalvar({ sistema, componente, defeito, descricao, criticidade, recomendacao, produto_id: produto, servico_id: servico })
            }
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Sistema">{(p) => <Entrada {...p} value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="Ex.: Freio pneumático" />}</Campo>
        <Campo rotulo="Componente">{(p) => <Entrada {...p} value={componente} onChange={(e) => setComponente(e.target.value)} placeholder="Ex.: Válvula relé" />}</Campo>
        <Campo className="sm:col-span-2" rotulo="Defeito" obrigatorio>
          {(p) => <Entrada {...p} value={defeito} onChange={(e) => setDefeito(e.target.value)} autoFocus />}
        </Campo>
        <Campo className="sm:col-span-2" rotulo="Descrição">
          {(p) => <AreaTexto {...p} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        <Campo rotulo="Criticidade">
          {(p) => (
            <Selecao {...p} value={criticidade} onChange={(e) => setCriticidade(e.target.value as Criticidade)}>
              {CRITICIDADES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Recomendação">
          {(p) => <Entrada {...p} value={recomendacao} onChange={(e) => setRecomendacao(e.target.value)} />}
        </Campo>
        <Campo rotulo="Produto necessário">
          {(p) => <SeletorRef {...p} config={REF_PRODUTO} valor={produto} aoSelecionar={(o) => setProduto(o?.id ?? null)} placeholder="Opcional" />}
        </Campo>
        <Campo rotulo="Serviço necessário">
          {(p) => <SeletorRef {...p} config={REF_SERVICO} valor={servico} aoSelecionar={(o) => setServico(o?.id ?? null)} placeholder="Opcional" />}
        </Campo>
      </div>
    </Modal>
  )
}
