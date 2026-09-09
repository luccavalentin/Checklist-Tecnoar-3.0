import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardCheck, Filter, Monitor, RefreshCw, Truck, UserPlus, UserX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import type { Mecanico } from '@/tipos/db'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Metrica, type TomMetrica } from '@/componentes/ui/Metrica'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { CLASSE_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import { ModoTV } from './patio/ModoTV'
import {
  INTERVALO_PATIO_SEGUNDOS,
  duracao,
  motivoAlerta,
  tomDoTempo,
  useEstagiosPatio,
  useIndicadoresPatio,
  usePatio,
} from './patio/usePatio'
import type { LinhaPatioVeiculo } from '@/tipos/db'

export function PainelPatio() {
  const { pode } = usePermissoes()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  /*
   * O Modo TV tem rota própria (`/operacao/modo-tv`) para virar item de menu e
   * poder ser aberto direto no telão, sem alguém ter que navegar e clicar.
   * A mesma tela atende as duas rotas.
   */
  const local = useLocation()
  const [modoTV, setModoTV] = useState(local.pathname === '/operacao/modo-tv')
  const [filtro, setFiltro] = useState<'todos' | 'alertas' | 'sem_mecanico'>('todos')
  const [atribuindo, setAtribuindo] = useState<LinhaPatioVeiculo | null>(null)

  const podeVer = pode('patio', 'visualizar')
  /* Atribuir mecânico é edição da OS — o pátio só oferece o atalho a quem já
     poderia fazer isso dentro da própria OS. O RLS barra de qualquer forma. */
  const podeAtribuir = pode('ordens_servico', 'editar')

  const mecanicos = useQuery({
    queryKey: ['mecanicos'],
    enabled: podeAtribuir,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Mecanico[]> => {
      const { data, error } = await supabase.from('vw_mecanicos').select('*').order('nome_completo')
      if (error) throw error
      return (data ?? []) as Mecanico[]
    },
  })

  const atribuir = useMutation({
    mutationFn: async ({ osId, usuarioId }: { osId: string; usuarioId: string }) => {
      const { error } = await supabase.from('os_mecanicos').insert({ os_id: osId, usuario_id: usuarioId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Mecânico atribuído')
      setAtribuindo(null)
      void qc.invalidateQueries({ queryKey: ['patio'] })
      void qc.invalidateQueries({ queryKey: ['minha-operacao'] })
    },
    onError: (e) => toast.erro('Não foi possível atribuir', mensagemErro(e)),
  })

  const patio = usePatio(podeVer && !modoTV)
  const indicadores = useIndicadoresPatio(podeVer && !modoTV)
  const estagios = useEstagiosPatio()

  const veiculos = useMemo(() => {
    const lista = patio.data ?? []
    if (filtro === 'alertas') return lista.filter((v) => motivoAlerta(v) !== null)
    if (filtro === 'sem_mecanico') return lista.filter((v) => v.mecanicos.length === 0)
    return lista
  }, [patio.data, filtro])

  const porEstagio = useMemo(() => {
    const mapa = new Map<string, LinhaPatioVeiculo[]>()
    for (const e of estagios.data ?? []) mapa.set(e.id, [])
    for (const v of veiculos) {
      const lista = mapa.get(v.status_id) ?? []
      lista.push(v)
      mapa.set(v.status_id, lista)
    }
    return mapa
  }, [veiculos, estagios.data])

  const alertas = useMemo(
    () =>
      (patio.data ?? []).flatMap((v) => {
        const motivo = motivoAlerta(v)
        return motivo
          ? [{ chave: v.os_id, placa: v.placa, os: v.os_numero, motivo: motivo.texto, critico: motivo.critico }]
          : []
      }),
    [patio.data],
  )

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Operação" titulo="Painel do Pátio" />
        <EstadoSemPermissao />
      </div>
    )
  }

  /* O Modo TV nunca abre sozinho: só por esta ação explícita. */
  if (modoTV) return <ModoTV aoSair={() => setModoTV(false)} />

  const ind = indicadores.data

  const KPIS: Array<{ rotulo: string; valor?: number; texto?: string; unidade: string; tom: TomMetrica }> = [
    { rotulo: 'No pátio', valor: ind?.no_patio, unidade: 'veículos', tom: 'cyan' },
    { rotulo: 'Entradas hoje', valor: ind?.entradas_hoje, unidade: 'recepções', tom: 'cyan' },
    { rotulo: 'Aguard. triagem', valor: ind?.aguardando_triagem, unidade: 'recebidos', tom: 'atencao' },
    { rotulo: 'Em diagnóstico', valor: ind?.em_diagnostico, unidade: 'OS', tom: 'neutro' },
    { rotulo: 'Aguard. aprovação', valor: ind?.aguardando_aprovacao, unidade: 'OS', tom: 'atencao' },
    { rotulo: 'Aguard. peça', valor: ind?.aguardando_peca, unidade: 'OS', tom: 'accent' },
    { rotulo: 'Em manutenção', valor: ind?.em_manutencao, unidade: 'OS', tom: 'neutro' },
    { rotulo: 'Checklist final', valor: ind?.checklist_final, unidade: 'OS', tom: 'neutro' },
    { rotulo: 'Aguard. faturamento', valor: ind?.aguardando_faturamento, unidade: 'OS', tom: 'neutro' },
    { rotulo: 'Prontos', valor: ind?.prontos, unidade: 'para retirada', tom: 'ok' },
    { rotulo: 'Urgentes', valor: ind?.urgentes, unidade: 'OS', tom: 'critico' },
    { rotulo: 'SLA vencido', valor: ind?.sla_vencido, unidade: 'OS', tom: 'critico' },
    {
      rotulo: 'Tempo médio',
      texto: ind?.tempo_medio_segundos ? duracao(Number(ind.tempo_medio_segundos)) : 'Sem histórico',
      unidade: 'na oficina',
      tom: 'neutro',
    },
  ]

  /* Só realça o que exige ação: contagem de espera, urgência ou SLA estourado. */
  const EXIGE_ACAO = new Set(['atencao', 'accent', 'critico'])

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Operação"
        titulo="Painel do Pátio"
        meta={
          <span className="flex items-center gap-2 rounded-full border border-ok/35 bg-ok-soft px-3 py-1">
            <span aria-hidden className="pulso-ativo size-1.5 rounded-full bg-ok" />
            <span className="lbl text-ok-ink">Ao vivo</span>
            <span className="num text-[11px] text-ink-3">
              {patio.isFetching ? 'atualizando…' : `a cada ${INTERVALO_PATIO_SEGUNDOS}s`}
            </span>
          </span>
        }
        acoes={
          <>
            <Botao variante="neutro" iconeInicio={<RefreshCw />} onClick={() => void patio.refetch()} carregando={patio.isFetching}>
              Atualizar
            </Botao>
            <Botao variante="secundario" iconeInicio={<Monitor />} onClick={() => setModoTV(true)}>
              Modo TV
            </Botao>
          </>
        }
      />

      {indicadores.isError ? (
        <EstadoErro descricao={mensagemErro(indicadores.error)} aoTentarNovamente={() => void indicadores.refetch()} compacto />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {KPIS.map((k) => (
            <Metrica
              key={k.rotulo}
              rotulo={k.rotulo}
              tom={k.tom}
              valor={k.texto ?? k.valor ?? 0}
              glosa={k.unidade}
              alerta={EXIGE_ACAO.has(k.tom) && (k.valor ?? 0) > 0}
              carregando={indicadores.isLoading && !k.texto}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Campo rotulo="Filtro" className="w-56">
          {(p) => (
            <Selecao {...p} value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">Todos os veículos</option>
              <option value="alertas">Somente com alerta</option>
              <option value="sem_mecanico">Sem mecânico atribuído</option>
            </Selecao>
          )}
        </Campo>
        {filtro !== 'todos' && (
          <Botao tamanho="sm" variante="fantasma" iconeInicio={<Filter />} onClick={() => setFiltro('todos')}>
            Limpar filtro
          </Botao>
        )}
      </div>

      {alertas.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-warn/35 bg-warn-soft p-3">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-warn-ink">
            <AlertTriangle aria-hidden className="size-3.5" />
            Alertas
          </span>
          {/* A placa sozinha não basta: o mesmo veículo pode ter mais de uma OS
              aberta, e dois alertas idênticos pareciam repetição. */}
          {alertas.slice(0, 8).map((a, i) => (
            <span key={a.chave} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <span className={cn('num font-semibold', a.critico ? 'text-crit-ink' : 'text-warn-ink')}>{a.placa}</span>
              <span className="num text-[11px] text-ink-3">OS {String(a.os).padStart(5, '0')}</span>
              {a.motivo}
              {i < Math.min(alertas.length, 8) - 1 && <span aria-hidden className="ml-1 text-ink-3">·</span>}
            </span>
          ))}
          {alertas.length > 8 && <span className="text-[12px] text-ink-3">+{alertas.length - 8}</span>}
        </div>
      )}

      {patio.isLoading && <EstadoCarregando rotulo="Carregando pátio…" />}
      {patio.isError && <EstadoErro descricao={mensagemErro(patio.error)} aoTentarNovamente={() => void patio.refetch()} />}

      {patio.isSuccess && veiculos.length === 0 && (
        <EstadoVazio
          icone={<Truck />}
          titulo={filtro === 'todos' ? 'Nenhum veículo no pátio' : 'Nenhum veículo neste filtro'}
          descricao={
            filtro === 'todos'
              ? 'Registre a entrada de um veículo na Recepção e abra a OS para acompanhar o fluxo aqui.'
              : 'Ajuste o filtro para ver o pátio completo.'
          }
          acao={
            filtro === 'todos' ? (
              <Botao tamanho="sm" variante="neutro" onClick={() => navegar('/operacao/recepcao')}>
                Abrir Recepção
              </Botao>
            ) : undefined
          }
        />
      )}

      {patio.isSuccess && veiculos.length > 0 && (
        <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-3.5 pb-2">
            {(estagios.data ?? []).map((e) => {
              const lista = porEstagio.get(e.id) ?? []
              return (
                <section key={e.id} className="flex w-60 shrink-0 flex-col gap-2.5">
                  <header
                    className="flex items-center gap-2 border-b-2 pb-2"
                    style={{ borderColor: 'transparent' }}
                  >
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-sm', CLASSE_COR_STATUS[e.cor] ?? 'bg-ink-3')} />
                    <span className="lbl flex-1 truncate text-ink">{e.nome}</span>
                    <span className="num text-[12px] text-ink-2">{lista.length}</span>
                  </header>
                  <div className={cn('h-0.5 -mt-2.5 rounded-full', CLASSE_COR_STATUS[e.cor] ?? 'bg-ink-3')} />

                  <ul className="flex flex-col gap-2.5">
                    {lista.length === 0 && (
                      <li className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-ink-3">
                        Vazio
                      </li>
                    )}
                    {lista.map((v) => (
                      <li key={v.os_id}>
                        <CartaoPatio
                          veiculo={v}
                          aoAbrir={() => navegar(`/operacao/ordens-de-servico?os=${v.os_id}`)}
                          aoAtribuir={podeAtribuir ? () => setAtribuindo(v) : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      )}

      <Modal
        aberto={Boolean(atribuindo)}
        aoFechar={() => setAtribuindo(null)}
        titulo="Atribuir mecânico"
        descricao={
          atribuindo
            ? `${atribuindo.placa} · OS ${String(atribuindo.os_numero).padStart(5, '0')} — ${atribuindo.cliente_nome}`
            : undefined
        }
      >
        {mecanicos.isLoading && <EstadoCarregando rotulo="Carregando mecânicos…" className="min-h-32" />}
        {mecanicos.isError && (
          <EstadoErro
            descricao={mensagemErro(mecanicos.error)}
            aoTentarNovamente={() => void mecanicos.refetch()}
            compacto
          />
        )}
        {mecanicos.isSuccess && mecanicos.data.length === 0 && (
          <EstadoVazio
            titulo="Nenhum mecânico disponível"
            descricao="Marque a função como mecânica em Cadastros › Funções e Cargos e atribua-a a um usuário."
            compacto
          />
        )}
        {mecanicos.isSuccess && mecanicos.data.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {mecanicos.data.map((m) => {
              const jaNaOS = atribuindo?.mecanicos.some((x) => x.id === m.id) ?? false
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={jaNaOS || atribuir.isPending}
                    onClick={() => atribuindo && atribuir.mutate({ osId: atribuindo.os_id, usuarioId: m.id })}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                      jaNaOS
                        ? 'cursor-not-allowed border-ok/40 bg-ok-soft'
                        : 'border-line-strong hover:border-cyan hover:bg-cyan-soft',
                      atribuir.isPending && 'opacity-60',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">{m.nome_completo}</span>
                      <span className="truncate text-[11.5px] text-ink-3">{m.funcao}</span>
                    </span>
                    {jaNaOS && (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-ok-ink">
                        <Check aria-hidden className="size-3.5" />
                        Já atribuído
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </div>
  )
}

export function CartaoPatio({
  veiculo: v,
  aoAbrir,
  aoAtribuir,
}: {
  veiculo: LinhaPatioVeiculo
  aoAbrir: () => void
  /** Atalho de atribuição direto do pátio, quando o usuário pode editar a OS. */
  aoAtribuir?: () => void
}) {
  const tom = tomDoTempo(v.segundos_no_estagio)
  const alerta = motivoAlerta(v)

  /* O corpo é um botão e o rodapé fica fora dele: botão dentro de botão é
     HTML inválido, e o rodapé precisa abrigar a ação de atribuir. */
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          v.sla_vencido ? 'bg-crit' : v.prioridade > 0 ? 'bg-accent' : CLASSE_COR_STATUS[v.status_cor] ?? 'bg-ink-3',
        )}
      />

      <button
        type="button"
        onClick={aoAbrir}
        className="flex w-full flex-col gap-2 p-3 pl-3.5 text-left"
      >
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[15px] font-semibold tracking-wide text-ink">{v.placa}</span>
        <span
          className={cn(
            'num text-[11.5px]',
            tom === 'critico' ? 'text-crit-ink' : tom === 'atencao' ? 'text-warn-ink' : 'text-ink-3',
          )}
        >
          {duracao(v.segundos_no_estagio)}
        </span>
      </div>

      <span className="truncate text-[12px] text-ink-2">{v.cliente_nome}</span>

      <div className="flex items-center gap-2">
        <span className="num text-[11px] text-ink-3">OS {String(v.os_numero).padStart(5, '0')}</span>
        {v.prioridade > 0 && <Selo tom="destaque">Urgente</Selo>}
      </div>
      </button>

      <div className="mx-3 mb-3 ml-3.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {v.mecanicos.length === 0 ? (
            aoAtribuir ? (
              <button
                type="button"
                onClick={aoAtribuir}
                className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11.5px] font-medium text-cyan-ink transition-colors hover:bg-cyan-soft"
              >
                <UserPlus aria-hidden className="size-3 shrink-0" />
                Atribuir mecânico
              </button>
            ) : (
              <>
                <UserX aria-hidden className="size-3 shrink-0 text-ink-3" />
                <span className="truncate text-[11.5px] text-ink-3">Não atribuído</span>
              </>
            )
          ) : (
            <span className="truncate text-[11.5px] text-ink-3">
              {v.mecanicos.map((m) => m.nome.split(' ')[0]).join(', ')}
            </span>
          )}
        </span>

        {alerta && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 text-[10.5px] font-semibold',
              alerta.critico ? 'text-crit-ink' : 'text-warn-ink',
            )}
          >
            {v.checklists_abertos > 0 ? (
              <ClipboardCheck aria-hidden className="size-3" />
            ) : (
              <AlertTriangle aria-hidden className="size-3" />
            )}
            {alerta.texto}
          </span>
        )}
      </div>
    </div>
  )
}
