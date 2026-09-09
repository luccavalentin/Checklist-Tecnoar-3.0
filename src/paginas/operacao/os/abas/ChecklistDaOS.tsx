import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Minus,
  Plus,
  TriangleAlert,
  Truck,
  UserRound,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Selecao } from '@/componentes/ui/Campo'
import { Selo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { MapaAvarias } from './MapaAvarias'
import type {
  ChecklistListado,
  ChecklistModelo,
  ChecklistResposta,
  Criticidade,
  Mecanico,
  RespostaChecklist,
} from '@/tipos/db'
import type { OSCompleta } from '../useOS'

/** Os dois pares de resposta que o sistema usa, com o mesmo desenho de botão. */
const RESPOSTAS: Record<
  'estado' | 'conformidade',
  Array<{ valor: RespostaChecklist; rotulo: string; tom: 'ok' | 'critico' | 'neutro' }>
> = {
  estado: [
    { valor: 'ok', rotulo: 'OK', tom: 'ok' },
    { valor: 'nao_ok', rotulo: 'Não OK', tom: 'critico' },
    { valor: 'nao_se_aplica', rotulo: 'N/A', tom: 'neutro' },
  ],
  conformidade: [
    { valor: 'conforme', rotulo: 'Conforme', tom: 'ok' },
    { valor: 'nao_conforme', rotulo: 'Não conforme', tom: 'critico' },
    { valor: 'nao_se_aplica', rotulo: 'N/A', tom: 'neutro' },
  ],
}

const NEGATIVAS: RespostaChecklist[] = ['nao_ok', 'nao_conforme']

/**
 * Checklist dentro da ordem de serviço.
 *
 * A ideia é não tirar o mecânico da OS para responder: grupos que abrem e
 * fecham, contador de respondidos por grupo e resposta em um toque. Item
 * negativo abre observação, foto e virada em defeito — porque negativo sem
 * registro do que houve não serve para nada depois.
 */
export function AbaChecklist({
  ordem,
  podeEditar,
}: {
  ordem: OSCompleta
  podeEditar: boolean
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { usuario } = useAuth()

  const [ativo, setAtivo] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [modeloEscolhido, setModeloEscolhido] = useState('')
  const [responsavelEscolhido, setResponsavelEscolhido] = useState('')
  const [detalhando, setDetalhando] = useState<ChecklistResposta | null>(null)

  const checklists = useQuery({
    queryKey: ['os-checklists', ordem.id],
    queryFn: async (): Promise<ChecklistListado[]> => {
      const { data, error } = await supabase
        .from('checklists')
        .select('*, responsavel:usuarios ( id, nome_completo )')
        .eq('os_id', ordem.id)
        .order('iniciado_em', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ChecklistListado[]
    },
  })

  /* Modelos oferecidos: os que servem a este tipo de veículo, mais os gerais. */
  const modelos = useQuery({
    queryKey: ['modelos-checklist', ordem.veiculo?.id],
    enabled: iniciando,
    queryFn: async (): Promise<ChecklistModelo[]> => {
      const { data, error } = await supabase
        .from('checklist_modelos')
        .select('*')
        .eq('situacao', 'ativo')
        .order('descricao')
      if (error) throw error
      return (data ?? []).filter((m) => !m.tipo_veiculo || m.tipo_veiculo === ordem.veiculo?.tipo)
    },
  })

  const mecanicos = useQuery({
    queryKey: ['mecanicos'],
    enabled: iniciando,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Mecanico[]> => {
      const { data, error } = await supabase.from('vw_mecanicos').select('*').order('nome_completo')
      if (error) throw error
      return (data ?? []) as Mecanico[]
    },
  })

  const selecionado = ativo ?? checklists.data?.[0]?.id ?? null

  const respostas = useQuery({
    queryKey: ['checklist-respostas', selecionado],
    enabled: Boolean(selecionado),
    queryFn: async (): Promise<ChecklistResposta[]> => {
      const { data, error } = await supabase
        .from('checklist_respostas')
        .select('*')
        .eq('checklist_id', selecionado!)
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const responder = useMutation({
    mutationFn: async ({ id, resposta }: { id: string; resposta: RespostaChecklist }) => {
      const { error } = await supabase
        .from('checklist_respostas')
        .update({ resposta, respondido_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checklist-respostas', selecionado] })
    },
    onError: (e) => toast.erro('Não foi possível responder', mensagemErro(e)),
  })

  const iniciar = useMutation({
    mutationFn: async () => {
      if (!modeloEscolhido) throw new Error('Escolha o modelo de checklist.')
      const { data, error } = await supabase.rpc('iniciar_checklist', {
        p_modelo: modeloEscolhido,
        p_os: ordem.id,
        p_veiculo: ordem.veiculo?.id ?? null,
        p_cliente: ordem.cliente?.id ?? null,
        p_km: ordem.km,
      })
      if (error) throw error
      const id = data as unknown as string
      const responsavelId = responsavelEscolhido || usuario?.id || null
      if (responsavelId) {
        const { error: erroResp } = await supabase
          .from('checklists')
          .update({ responsavel_id: responsavelId })
          .eq('id', id)
        if (erroResp) throw erroResp
      }
      return id
    },
    onSuccess: (id) => {
      toast.ok('Checklist iniciado')
      setIniciando(false)
      setModeloEscolhido('')
      setResponsavelEscolhido('')
      setAtivo(id)
      void qc.invalidateQueries({ queryKey: ['os-checklists', ordem.id] })
    },
    onError: (e) => toast.erro('Não foi possível iniciar', mensagemErro(e)),
  })

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('concluir_checklist', { p_checklist: selecionado! })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Checklist concluído')
      void qc.invalidateQueries({ queryKey: ['os-checklists', ordem.id] })
      void qc.invalidateQueries({ queryKey: ['checklist-respostas', selecionado] })
    },
    onError: (e) => toast.erro('Não foi possível concluir', mensagemErro(e)),
  })

  /* Agrupa por seção mantendo a ordem original dos itens. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ChecklistResposta[]>()
    for (const r of respostas.data ?? []) {
      const lista = mapa.get(r.secao) ?? []
      lista.push(r)
      mapa.set(r.secao, lista)
    }
    return [...mapa.entries()].map(([secao, itens]) => ({
      secao,
      itens,
      total: itens.length,
      respondidos: itens.filter((i) => i.resposta !== null).length,
      negativos: itens.filter((i) => i.resposta && NEGATIVAS.includes(i.resposta)).length,
    }))
  }, [respostas.data])

  /**
   * Abre sozinho o primeiro grupo que ainda tem item por responder.
   *
   * O mecânico trabalha de cima para baixo; chegar na aba com tudo fechado
   * significa um toque a mais antes de qualquer trabalho útil. Depois que ele
   * abre ou fecha algo, a escolha dele manda.
   */
  const [abertos, setAbertos] = useState<string[] | null>(null)
  const primeiroIncompleto = grupos.find((g) => g.respondidos < g.total)?.secao
  const visiveis = abertos ?? (primeiroIncompleto ? [primeiroIncompleto] : [])
  const alternar = (secao: string) =>
    setAbertos(visiveis.includes(secao) ? visiveis.filter((x) => x !== secao) : [...visiveis, secao])

  const checklistAtual = checklists.data?.find((c) => c.id === selecionado)
  const editavel = podeEditar && checklistAtual?.situacao === 'em_andamento'
  const totalItens = grupos.reduce((s, g) => s + g.total, 0)
  const totalRespondidos = grupos.reduce((s, g) => s + g.respondidos, 0)
  const totalNegativos = grupos.reduce((s, g) => s + g.negativos, 0)

  if (checklists.isLoading) return <EstadoCarregando rotulo="Carregando checklists…" />
  if (checklists.isError) {
    return (
      <EstadoErro descricao={mensagemErro(checklists.error)} aoTentarNovamente={() => void checklists.refetch()} />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* seletor de checklist da OS */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(checklists.data ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAtivo(c.id)}
            className={cn(
              'aresta flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-3 text-left transition-colors',
              selecionado === c.id ? 'border-cyan shadow-e2' : 'border-line hover:border-line-strong',
            )}
          >
            <span className="flex items-start gap-2">
              <ClipboardCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{c.modelo_descricao}</span>
                <span className="num mt-0.5 block text-[11px] text-ink-3">
                  #{String(c.numero).padStart(5, '0')} · versão {c.versao}
                </span>
              </span>
              <Selo tom={c.situacao === 'concluido' ? 'ok' : 'atencao'}>
                {c.situacao === 'concluido' ? 'Concluído' : 'Aberto'}
              </Selo>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                <UserRound aria-hidden className="size-3.5" />
                {c.responsavel?.nome_completo ?? 'Sem responsável'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Truck aria-hidden className="size-3.5" />
                {ordem.veiculo?.tipo ?? 'Veículo geral'}
              </span>
            </span>
          </button>
        ))}
      </div>

      {podeEditar && (
        <div>
          <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={() => setIniciando(true)}>
            Iniciar checklist
          </Botao>
        </div>
      )}

      {(checklists.data?.length ?? 0) === 0 && (
        <EstadoVazio
          titulo="Nenhum checklist nesta OS"
          descricao="Inicie o checklist do modelo que se aplica a este veículo. Ele fica aqui dentro, junto da ordem."
          acao={
            podeEditar ? (
              <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={() => setIniciando(true)}>
                Iniciar checklist
              </Botao>
            ) : undefined
          }
        />
      )}

      {selecionado && (
        <>
          {/* barra de progresso do checklist inteiro */}
          <div className="aresta grid gap-3 rounded-lg border border-line bg-surface p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13.5px] font-medium text-ink">{checklistAtual?.modelo_descricao}</span>
                <span className="num text-[11.5px] text-ink-3">
                  versão {checklistAtual?.versao}
                  {checklistAtual?.concluido_em ? ` · concluído em ${dataHora(checklistAtual.concluido_em)}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-cyan transition-[width] duration-300"
                    style={{ width: `${totalItens ? (totalRespondidos / totalItens) * 100 : 0}%` }}
                  />
                </div>
                <span className="num shrink-0 text-[12.5px] text-ink-2">
                  {totalRespondidos}/{totalItens}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ResumoChecklist rotulo="Grupos" valor={grupos.length} />
              <ResumoChecklist rotulo="Pendentes" valor={Math.max(totalItens - totalRespondidos, 0)} />
              <ResumoChecklist rotulo="Negativos" valor={totalNegativos} critico={totalNegativos > 0} />
              {editavel && totalRespondidos === totalItens && totalItens > 0 && (
                <Botao variante="primario" carregando={concluir.isPending} onClick={() => concluir.mutate()}>
                  Concluir
                </Botao>
              )}
            </div>
          </div>

          {checklistAtual?.situacao === 'concluido' && (
            <Aviso tom="ok" titulo="Checklist concluído">
              As respostas ficam congeladas na versão {checklistAtual.versao} do modelo. Editar o modelo daqui em
              diante não muda este registro.
            </Aviso>
          )}

          {respostas.isLoading ? (
            <EstadoCarregando rotulo="Carregando itens…" />
          ) : (
            <div className="flex flex-col gap-2.5">
              {grupos.map((g) => {
                const aberto = visiveis.includes(g.secao) || grupos.length === 1
                const completo = g.respondidos === g.total
                return (
                  <section key={g.secao} className="aresta overflow-hidden rounded-lg border border-line bg-surface">
                    <button
                      type="button"
                      onClick={() => alternar(g.secao)}
                      aria-expanded={aberto}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
                    >
                      <ChevronDown
                        aria-hidden
                        className={cn('size-4 shrink-0 text-ink-3 transition-transform', aberto && 'rotate-180')}
                      />
                      <span className="min-w-0 flex-1 truncate font-display text-[13.5px] font-semibold text-ink">
                        {g.secao}
                      </span>
                      {g.negativos > 0 && <Selo tom="critico">{g.negativos}</Selo>}
                      <span
                        className={cn(
                          'num shrink-0 rounded-full px-2 py-0.5 text-[11.5px]',
                          completo ? 'bg-ok-soft text-ok-ink' : 'bg-surface-2 text-ink-3',
                        )}
                      >
                        {g.respondidos}/{g.total}
                      </span>
                    </button>

                    {/*
                      As divisórias vêm de borda em cada item, não de um fundo
                      atrás da grade: com número ímpar de itens o fundo ficava
                      exposto na célula que sobra e parecia uma caixa quebrada.
                    */}
                    {aberto && (
                      <ul className="grid border-t border-line bg-surface md:grid-cols-2 2xl:grid-cols-3">
                        {g.itens.map((item) => (
                          <ItemChecklist
                            key={item.id}
                            item={item}
                            editavel={editavel}
                            aoResponder={(resposta) => responder.mutate({ id: item.id, resposta })}
                            aoDetalhar={() => setDetalhando(item)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          {/* mapa de avarias, quando o modelo pede entrada visual */}
          <MapaAvarias
            checklistId={selecionado}
            veiculoId={ordem.veiculo?.id ?? null}
            tipoVeiculo={ordem.veiculo?.tipo ?? null}
            editavel={editavel}
          />
        </>
      )}

      {/* iniciar */}
      <Modal
        aberto={iniciando}
        aoFechar={() => setIniciando(false)}
        titulo="Iniciar checklist nesta OS"
        descricao="O checklist congela a versão do modelo no momento em que começa."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setIniciando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={iniciar.isPending} onClick={() => iniciar.mutate()}>
              Iniciar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Modelo" obrigatorio>
          {(p) => (
            <Selecao {...p} value={modeloEscolhido} onChange={(e) => setModeloEscolhido(e.target.value)}>
              <option value="">Selecione</option>
              {(modelos.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.descricao}
                  {m.tipo_veiculo ? ` · ${m.tipo_veiculo}` : ''}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Mecânico responsável">
            {(p) => (
              <Selecao
                {...p}
                value={responsavelEscolhido}
                onChange={(e) => setResponsavelEscolhido(e.target.value)}
              >
                <option value="">Responsável atual</option>
                {(mecanicos.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome_completo}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Tipo de veículo">
            {(p) => (
              <input
                {...p}
                value={ordem.veiculo?.tipo ?? 'Geral'}
                readOnly
                className="h-10 w-full rounded-md border border-line-strong bg-inset px-3 text-[13px] text-ink-2"
              />
            )}
          </Campo>
        </div>
      </Modal>

      {detalhando && (
        <DetalheItem
          item={detalhando}
          checklistId={selecionado!}
          editavel={editavel}
          aoFechar={() => setDetalhando(null)}
          aoSalvar={() => {
            void qc.invalidateQueries({ queryKey: ['checklist-respostas', selecionado] })
            setDetalhando(null)
          }}
        />
      )}
    </div>
  )
}

function ResumoChecklist({ rotulo, valor, critico }: { rotulo: string; valor: number; critico?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-9 min-w-[86px] flex-col justify-center rounded-md border px-2.5',
        critico ? 'border-crit/35 bg-crit-soft text-crit-ink' : 'border-line bg-surface-2 text-ink-2',
      )}
    >
      <span className="lbl text-[8.5px]">{rotulo}</span>
      <span className="num text-[13px] font-semibold">{valor}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ item */

function ItemChecklist({
  item,
  editavel,
  aoResponder,
  aoDetalhar,
}: {
  item: ChecklistResposta
  editavel: boolean
  aoResponder: (r: RespostaChecklist) => void
  aoDetalhar: () => void
}) {
  const opcoes = RESPOSTAS[item.tipo_resposta === 'conformidade' ? 'conformidade' : 'estado']
  const negativo = item.resposta ? NEGATIVAS.includes(item.resposta) : false

  return (
    <li className={cn('flex min-h-[118px] flex-col gap-2 bg-surface p-3', negativo && 'bg-crit-soft/40')}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{item.texto}</span>
        {item.obrigatorio && !item.resposta && (
          <span className="lbl shrink-0 text-[9px] text-accent-ink">Obrigatório</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {opcoes.map((o) => {
          const marcado = item.resposta === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              disabled={!editavel}
              aria-pressed={marcado}
              onClick={() => aoResponder(o.valor)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-display text-[11px] font-bold tracking-[0.04em] uppercase transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                marcado && o.tom === 'ok' && 'border-ok bg-ok-soft text-ok-ink',
                marcado && o.tom === 'critico' && 'border-crit bg-crit-soft text-crit-ink',
                marcado && o.tom === 'neutro' && 'border-line-strong bg-surface-2 text-ink-2',
                !marcado && 'border-line-strong text-ink-3 hover:text-ink',
              )}
            >
              {o.tom === 'ok' && <CheckCircle2 aria-hidden className="size-3.5" />}
              {o.tom === 'critico' && <XCircle aria-hidden className="size-3.5" />}
              {o.tom === 'neutro' && <Minus aria-hidden className="size-3.5" />}
              {o.rotulo}
            </button>
          )
        })}

        {(negativo || item.observacao || item.exige_evidencia) && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            iconeInicio={negativo ? <TriangleAlert /> : <Camera />}
            onClick={aoDetalhar}
            className="ml-auto"
          >
            {negativo ? 'Registrar' : 'Anexar'}
          </Botao>
        )}
      </div>

      {item.observacao && (
        <p className="text-[11.5px] leading-snug text-ink-2 italic">{item.observacao}</p>
      )}
    </li>
  )
}

/* -------------------------------------------------- detalhe do item negativo */

function DetalheItem({
  item,
  checklistId,
  editavel,
  aoFechar,
  aoSalvar,
}: {
  item: ChecklistResposta
  checklistId: string
  editavel: boolean
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { usuario } = useAuth()
  const toast = useToast()
  const [observacao, setObservacao] = useState(item.observacao ?? '')
  const [defeito, setDefeito] = useState('')
  const [recomendacao, setRecomendacao] = useState('')
  const [criticidade, setCriticidade] = useState<Criticidade>('media')
  const [erro, setErro] = useState<string | null>(null)

  const negativo = item.resposta ? NEGATIVAS.includes(item.resposta) : false

  const salvar = useMutation({
    mutationFn: async () => {
      setErro(null)
      const { error } = await supabase
        .from('checklist_respostas')
        .update({ observacao: observacao.trim() || null })
        .eq('id', item.id)
      if (error) throw error

      /* Só vira defeito se alguém escreveu qual é. Item negativo sem descrição
         não gera recomendação fantasma. */
      if (defeito.trim()) {
        const { error: erroDefeito } = await supabase.from('checklist_defeitos').insert({
          resposta_id: item.id,
          checklist_id: checklistId,
          defeito: defeito.trim(),
          recomendacao: recomendacao.trim() || null,
          criticidade,
          descricao: observacao.trim() || null,
        })
        if (erroDefeito) throw erroDefeito
      }
    },
    onSuccess: () => {
      toast.ok(defeito.trim() ? 'Observação e defeito registrados' : 'Observação registrada')
      aoSalvar()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo={item.texto}
      descricao={negativo ? 'Item não conforme — descreva o que foi encontrado.' : 'Observação e evidências do item.'}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Fechar</Botao>
          {editavel && (
            <Botao variante="primario" carregando={salvar.isPending} onClick={() => salvar.mutate()}>
              Salvar
            </Botao>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <Campo rotulo="Observação">
          {(p) => (
            <AreaTexto
              {...p}
              rows={3}
              disabled={!editavel}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="O que foi encontrado, onde, em que condição."
            />
          )}
        </Campo>

        {negativo && editavel && (
          <div className="flex flex-col gap-4 rounded-lg border border-crit/30 bg-crit-soft/30 p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert aria-hidden className="size-4 text-crit" />
              <span className="lbl text-crit-ink">Gerar defeito e recomendação</span>
            </div>
            <p className="text-[12.5px] text-ink-2">
              Opcional. Preencha para que este item vire uma recomendação técnica ligada à OS.
            </p>

            <Campo rotulo="Defeito encontrado">
              {(p) => (
                <AreaTexto {...p} rows={2} value={defeito} onChange={(e) => setDefeito(e.target.value)} />
              )}
            </Campo>
            <Campo rotulo="Recomendação">
              {(p) => (
                <AreaTexto {...p} rows={2} value={recomendacao} onChange={(e) => setRecomendacao(e.target.value)} />
              )}
            </Campo>
            <Campo rotulo="Criticidade">
              {(p) => (
                <Selecao {...p} value={criticidade} onChange={(e) => setCriticidade(e.target.value as Criticidade)}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Selecao>
              )}
            </Campo>
          </div>
        )}

        <Evidencias
          entidade="checklist_respostas"
          entidadeId={item.id}
          categorias={['Antes', 'Detalhe', 'Medição', 'Depois']}
          somenteLeitura={!editavel}
          titulo="Fotos deste item"
          descricao="A foto fica ligada a este item, não solta na OS."
          contexto={{ checklist_id: checklistId, item: item.texto, registrado_por: usuario?.nome_completo }}
        />
      </div>
    </Modal>
  )
}
