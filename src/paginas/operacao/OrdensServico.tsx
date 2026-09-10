import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { FileText, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData, moeda } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useExclusao, DialogoExclusao } from '@/dados/exclusao'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao } from '@/componentes/ui/Botao'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Selo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { REF_CLIENTE, REF_VEICULO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { TOM_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import { EditorOS } from './os/EditorOS'
import { useStatusOS } from './os/useOS'
import type { TipoOS } from '@/tipos/db'

type OSListada = {
  id: string
  numero: number
  tipo: TipoOS
  aberta_em: string
  encerrada_em: string | null
  valor_total: number
  cliente: { nome_razao: string } | null
  veiculo: { placa: string; descricao: string | null } | null
  status: { nome: string; cor: string | null } | null
}

/**
 * O `select` muda conforme a busca — e isso não é gosto.
 *
 * No PostgREST, filtrar uma tabela embutida sem `!inner` não descarta a linha
 * pai: a OS continua na lista, só vem com o cliente nulo. Buscar "SILVA"
 * devolveria todas as ordens. O `!inner` entra só na relação que está sendo
 * filtrada, porque ele também descartaria OS cujo veículo foi apagado.
 */
function selectLista(alvo: 'nenhum' | 'cliente' | 'veiculo') {
  const cliente = alvo === 'cliente' ? 'cliente:clientes!inner' : 'cliente:clientes'
  const veiculo = alvo === 'veiculo' ? 'veiculo:veiculos!inner' : 'veiculo:veiculos'
  return (
    'id, numero, tipo, aberta_em, encerrada_em, valor_total, ' +
    `${cliente} ( nome_razao ), ${veiculo} ( placa, descricao ), status:status_os ( nome, cor )`
  )
}

/** Placa Mercosul (ABC1D23) ou antiga (ABC1234), com ou sem hífen. */
const PLACA = /^[A-Za-z]{3}-?[0-9][A-Za-z0-9][0-9]{2}$/

/** Decide o que o operador quis buscar: número da OS, placa ou nome. */
function alvoDaBusca(t: string): 'nenhum' | 'numero' | 'cliente' | 'veiculo' {
  if (!t) return 'nenhum'
  if (/^\d+$/.test(t)) return 'numero'
  if (PLACA.test(t.replace(/\s/g, ''))) return 'veiculo'
  return t.length >= 2 ? 'cliente' : 'nenhum'
}

const ROTULO_TIPO: Record<TipoOS, string> = { os: 'OS', orcamento: 'Orçamento', garantia: 'Garantia' }

const TOM_TIPO: Record<TipoOS, 'info' | 'neutro' | 'atencao'> = {
  os: 'info',
  orcamento: 'neutro',
  garantia: 'atencao',
}

/** Número exibido da OS. A Omie e o balcão falam em "OS 00042", não em UUID. */
const nº = (n: number) => String(n).padStart(5, '0')

/* ═══════════════════════════════════════════════════════════ lista */

function ListaOrdensServico({
  onNova,
  onAbrir,
}: {
  onNova: () => void
  onAbrir: (osId: string) => void
}) {
  const { pode } = usePermissoes()
  const ctrl = useControleListagem(20)
  const [fSituacao, setFSituacao] = useState<'abertas' | 'encerradas' | 'todas'>('abertas')
  const [fTipo, setFTipo] = useState<'' | TipoOS>('')

  const podeVer = pode('ordens_servico', 'visualizar')
  const podeCriar = pode('ordens_servico', 'criar')
  /* `inativar` nao existe para este recurso: a tabela `recursos` define
     ordens_servico como visualizar/criar/editar/aprovar/cancelar/exportar.
     Preso nela, o botao nunca renderizava — nem para administrador, que
     recebe todas as acoes que existem. `cancelar` e a autoridade destrutiva
     sobre a OS, e quem a tem pode apaga-la. A regra real continua no banco:
     previa_exclusao e excluir_registro decidem, e negam quem nao pode. */
  const podeExcluir = pode('ordens_servico', 'cancelar')

  /* Excluir OS arrasta serviços, produtos, apontamentos, eventos e faturas —
     a confirmação mostra a conta antes de apagar. */
  const exclusao = useExclusao({
    /* A lista usa ['ordens_servico', 'lista', ...] e o quadro do patio usa
       ['patio']. Invalidar ['os'] nao acertava chave nenhuma: o registro
       sumia do banco e continuava na tela ate alguem recarregar. */
    tabela: 'ordens_servico',
    invalidar: [['ordens_servico'], ['patio']],
  })

  const termo = termoBusca(ctrl.busca)
  const alvo = alvoDaBusca(termo)

  const filtrar = useMemo(
    () => (q: Consulta) => {
      let r = q.eq('situacao', 'ativo')
      if (alvo === 'numero') r = r.eq('numero', Number(termo))
      if (alvo === 'cliente') r = r.ilike('clientes.nome_razao', `%${termo}%`)
      if (alvo === 'veiculo') {
        r = r.ilike('veiculos.placa_normalizada', `%${termo.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}%`)
      }
      if (fSituacao === 'abertas') r = r.is('encerrada_em', null)
      if (fSituacao === 'encerradas') r = r.not('encerrada_em', 'is', null)
      if (fTipo) r = r.eq('tipo', fTipo)
      return r
    },
    [termo, alvo, fSituacao, fTipo],
  )

  const lista = useListagem<OSListada>({
    chave: ['ordens_servico', 'lista', termo, alvo, fSituacao, fTipo, ctrl.pagina, ctrl.porPagina],
    tabela: 'ordens_servico',
    select: selectLista(alvo === 'cliente' || alvo === 'veiculo' ? alvo : 'nenhum'),
    filtrar,
    ordenacao: { coluna: 'numero', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <Cabecalho total={null} />
        <EstadoSemPermissao />
      </div>
    )
  }

  const chips = [
    fSituacao !== 'abertas' && {
      id: 's',
      rotulo: `Situação: ${fSituacao === 'todas' ? 'Todas' : 'Encerradas'}`,
      aoRemover: () => setFSituacao('abertas'),
    },
    fTipo && { id: 't', rotulo: `Tipo: ${ROTULO_TIPO[fTipo]}`, aoRemover: () => setFTipo('') },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const colunas: Array<Coluna<OSListada>> = [
    {
      chave: 'numero',
      cabecalho: 'Número',
      largura: '110px',
      celula: (o) => <span className="num font-semibold text-ink">{nº(o.numero)}</span>,
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      largura: '100px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (o) => (
        <Selo tom={TOM_TIPO[o.tipo]}>{ROTULO_TIPO[o.tipo]}</Selo>
      ),
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (o) => <span className="truncate text-ink">{o.cliente?.nome_razao ?? '—'}</span>,
    },
    {
      chave: 'veiculo',
      cabecalho: 'Veículo',
      largura: '180px',
      classeResponsiva: 'hidden md:table-cell',
      celula: (o) =>
        o.veiculo ? (
          <div className="flex min-w-0 flex-col">
            <span className="num truncate text-ink-2">{o.veiculo.placa}</span>
            {o.veiculo.descricao && (
              <span className="truncate text-[12px] text-ink-3">{o.veiculo.descricao}</span>
            )}
          </div>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: 'status',
      cabecalho: 'Status',
      largura: '160px',
      celula: (o) =>
        o.status ? (
          <Selo tom={TOM_COR_STATUS[o.status.cor ?? 'neutro'] ?? 'neutro'} ponto>
            {o.status.nome}
          </Selo>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: 'aberta_em',
      cabecalho: 'Abertura',
      largura: '110px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (o) => <span className="num text-ink-3">{fmtData(o.aberta_em)}</span>,
    },
    {
      chave: 'valor_total',
      cabecalho: 'Total',
      largura: '120px',
      alinhamento: 'direita',
      celula: (o) => <span className="num">{moeda(Number(o.valor_total || 0))}</span>,
    },
    ...(podeExcluir
      ? [
          {
            chave: 'acoes',
            cabecalho: '',
            largura: '96px',
            alinhamento: 'direita' as const,
            celula: (o: OSListada) => (
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={(e) => {
                  /* A linha inteira abre a OS; sem isto o clique em excluir
                     abriria o editor por baixo da confirmação. */
                  e.stopPropagation()
                  exclusao.pedir(o.id)
                }}
              >
                Excluir
              </Botao>
            ),
          } satisfies Coluna<OSListada>,
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        total={lista.total}
        acao={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={onNova}>
              Nova OS
            </Botao>
          ) : undefined
        }
      />

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar pelo número da OS, pela placa ou pelo cliente"
          chips={chips}
          aoLimpar={chips.length ? () => { setFSituacao('abertas'); setFTipo(''); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fSituacao}
                    onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}
                  >
                    <option value="abertas">Em aberto</option>
                    <option value="encerradas">Encerradas</option>
                    <option value="todas">Todas</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Tipo">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fTipo}
                    onChange={(e) => { setFTipo(e.target.value as typeof fTipo); ctrl.reiniciar() }}
                  >
                    <option value="">Todos</option>
                    <option value="os">Ordem de serviço</option>
                    <option value="orcamento">Orçamento</option>
                    <option value="garantia">Garantia</option>
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          densidade="compacta"
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(o) => o.id}
          estado={lista.estado}
          aoClicarLinha={(o) => onAbrir(o.id)}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhuma ordem de serviço',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'As ordens abertas na recepção e no balcão aparecem aqui.',
            acao:
              podeCriar && !ctrl.busca && !chips.length ? (
                <Botao tamanho="sm" variante="neutro" iconeInicio={<FileText />} onClick={onNova}>
                  Abrir a primeira
                </Botao>
              ) : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />

        {lista.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0 py-2"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={lista.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      <DialogoExclusao ctrl={exclusao} />
    </div>
  )
}

function Cabecalho({ total, acao }: { total: number | null; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Ordens de Serviço</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {total !== null && (
          <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
            {total.toLocaleString('pt-BR')} registros
          </span>
        )}
        {acao}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════ nova OS */

interface FormNovaOS {
  tipo: TipoOS
  cliente_id: string
  veiculo_id: string
  status_id: string
  km: string
  problema_alegado: string
}

const NOVA_VAZIA: FormNovaOS = {
  tipo: 'os',
  cliente_id: '',
  veiculo_id: '',
  status_id: '',
  km: '',
  problema_alegado: '',
}

/**
 * Abertura de OS.
 *
 * Cliente e veículo são obrigatórios no banco — uma OS sem os dois não é
 * rascunho, é registro inválido. Por isso o modal pergunta antes de gravar em
 * vez de criar um esqueleto vazio e deixar o erro estourar depois.
 *
 * O número **não** é enviado: a coluna é `generated always as identity` e o
 * Postgres recusa qualquer valor vindo daqui. Quem numera é o banco, o que
 * também elimina a corrida entre dois atendentes abrindo OS ao mesmo tempo.
 */
function ModalNovaOS({
  aberto,
  aoFechar,
  aoCriar,
  entradaId,
}: {
  aberto: boolean
  aoFechar: () => void
  aoCriar: (osId: string) => void
  entradaId: string | null
}) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const status = useStatusOS()
  const [erro, setErro] = useState<string | null>(null)

  const form = useForm<FormNovaOS>({ defaultValues: NOVA_VAZIA })
  const clienteId = form.watch('cliente_id')
  const veiculoId = form.watch('veiculo_id')

  /* Veio da recepção: a entrada já sabe cliente, veículo e KM. Repetir a
     digitação seria pedir ao atendente que confirmasse o que ele acabou de
     informar — e é onde nascem as divergências de cadastro. */
  const entrada = useQuery({
    queryKey: ['entrada-para-os', entradaId],
    enabled: aberto && Boolean(entradaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entradas_patio')
        .select('id, numero, km, cliente_id, veiculo_id, observacoes, cliente:clientes ( nome_razao ), veiculo:veiculos ( placa )')
        .eq('id', entradaId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    form.reset({
      ...NOVA_VAZIA,
      cliente_id: entrada.data?.cliente_id ?? '',
      veiculo_id: entrada.data?.veiculo_id ?? '',
      km: entrada.data?.km != null ? String(entrada.data.km) : '',
      status_id: status.data?.[0]?.id ?? '',
    })
  }, [aberto, entrada.data, status.data, form])

  const criar = useMutation({
    mutationFn: async (d: FormNovaOS) => {
      if (!d.cliente_id) throw new Error('Selecione o cliente.')
      if (!d.veiculo_id) throw new Error('Selecione o veículo.')

      const km = d.km.replace(/\D/g, '')
      const { data, error } = await supabase
        .from('ordens_servico')
        .insert({
          tipo: d.tipo,
          cliente_id: d.cliente_id,
          veiculo_id: d.veiculo_id,
          entrada_id: entradaId,
          status_id: d.status_id || null,
          km: km ? Number(km) : null,
          problema_alegado: d.problema_alegado.trim() || null,
          aberta_por: usuario?.id ?? null,
        })
        .select('id, numero')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (nova) => {
      toast.ok(`OS ${nº(nova.numero)} aberta`)
      void qc.invalidateQueries({ queryKey: ['ordens_servico'] })
      void qc.invalidateQueries({ queryKey: ['patio'] })
      aoCriar(nova.id)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="lg"
      titulo="Nova ordem de serviço"
      descricao="Cliente e veículo identificam a OS e não podem ficar em branco."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={criar.isPending}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={criar.isPending}
            disabled={!clienteId || !veiculoId}
            iconeInicio={<Plus />}
            onClick={form.handleSubmit((d) => criar.mutate(d))}
          >
            Abrir OS
          </Botao>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => criar.mutate(d))}>
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        {entradaId && entrada.data && (
          <Aviso tom="info" titulo={`Entrada ${nº(Number(entrada.data.numero))}`}>
            Cliente e veículo vieram da recepção. A OS fica vinculada a esta entrada.
          </Aviso>
        )}

        <Grade>
          <Campo className="sm:col-span-4" rotulo="Tipo">
            {(p) => (
              <Selecao {...p} {...form.register('tipo')}>
                <option value="os">Ordem de serviço</option>
                <option value="orcamento">Orçamento</option>
                <option value="garantia">Garantia</option>
              </Selecao>
            )}
          </Campo>

          <Campo className="sm:col-span-8" rotulo="Status inicial">
            {(p) => (
              <Selecao {...p} {...form.register('status_id')}>
                <option value="">Sem status</option>
                {(status.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </Selecao>
            )}
          </Campo>

          <Campo className="sm:col-span-6" rotulo="Cliente" obrigatorio>
            {(p) => (
              <SeletorRef
                {...p}
                config={REF_CLIENTE}
                valor={clienteId || null}
                aoSelecionar={(o) => form.setValue('cliente_id', o?.id ?? '', { shouldDirty: true })}
                placeholder="Buscar por nome ou documento"
                desabilitado={Boolean(entradaId && entrada.data)}
              />
            )}
          </Campo>

          <Campo className="sm:col-span-6" rotulo="Veículo" obrigatorio>
            {(p) => (
              <SeletorRef
                {...p}
                config={REF_VEICULO}
                valor={veiculoId || null}
                aoSelecionar={(o) => form.setValue('veiculo_id', o?.id ?? '', { shouldDirty: true })}
                placeholder="Buscar pela placa"
                desabilitado={Boolean(entradaId && entrada.data)}
              />
            )}
          </Campo>

          <Campo className="sm:col-span-4" rotulo="KM de entrada">
            {(p) => <Entrada {...p} mono inputMode="numeric" {...form.register('km')} placeholder="0" />}
          </Campo>

          <Campo
            className="sm:col-span-8"
            rotulo="Problema alegado"
            dica="O que o cliente relatou. Pode ser completado depois."
          >
            {(p) => <AreaTexto {...p} rows={2} {...form.register('problema_alegado')} />}
          </Campo>
        </Grade>
      </form>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════ tela */

export function OrdensServico() {
  const [params, setParams] = useSearchParams()
  const [osAberta, setOsAberta] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  /**
   * Dois caminhos chegam aqui por link, e os dois precisavam ser atendidos:
   *
   * - `?entrada=…` vem da Recepção logo depois de registrar a entrada no
   *   pátio, para abrir a OS já com cliente, veículo e KM daquela entrada.
   * - `?os=…` vem do Pátio e da Minha Operação, para abrir uma OS existente.
   *
   * O parâmetro sai da URL assim que é consumido: senão, voltar para a lista
   * reabriria a mesma OS e o operador ficaria preso na tela.
   */
  const entradaId = params.get('entrada')
  const osPorLink = params.get('os')

  useEffect(() => {
    if (entradaId) setCriando(true)
  }, [entradaId])

  useEffect(() => {
    if (osPorLink) setOsAberta(osPorLink)
  }, [osPorLink])

  function limparParametro(nome: 'entrada' | 'os') {
    if (!params.get(nome)) return
    const p = new URLSearchParams(params)
    p.delete(nome)
    setParams(p, { replace: true })
  }

  if (osAberta) {
    return (
      <EditorOS
        osId={osAberta}
        aoVoltar={() => { setOsAberta(null); limparParametro('os') }}
      />
    )
  }

  return (
    <>
      <ListaOrdensServico onNova={() => setCriando(true)} onAbrir={setOsAberta} />
      <ModalNovaOS
        aberto={criando}
        entradaId={entradaId}
        aoFechar={() => { setCriando(false); limparParametro('entrada') }}
        aoCriar={(id) => { setCriando(false); limparParametro('entrada'); setOsAberta(id) }}
      />
    </>
  )
}

