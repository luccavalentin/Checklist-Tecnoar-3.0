import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, FilePlus2, FileText, Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosOSBuscarVeiculo, sosOSCriar } from '@/sos/api'
import { formatarPlacaExibicao } from '@/sos/rotulos'
import type { OSResumoApp, VeiculoParaOS } from '@/sos/tipos'
import { useOnline } from '../dados'
import { Placa } from '../pecas'
import { AreaM, BotaoM, CampoM, EsqueletoM, FolhaM, NumeroM, SeloM, TelaM, TopoM, VazioM } from '../ui'
import { CHAVES_OS, rotuloProtocolo, tomStatusOS, useMinhasOS, type SituacaoOS } from './dados'

const ABAS: Array<{ id: SituacaoOS; rotulo: string }> = [
  { id: 'abertas', rotulo: 'Abertas' },
  { id: 'encerradas', rotulo: 'Encerradas' },
]

/**
 * As OS do sistema Tecnoar com o mecânico: as que a oficina o escalou e as
 * dos socorros que ele atendeu. Mesmas OS do Checklist — o que ele lança
 * aqui aparece lá na hora. Encerradas: últimos 90 dias.
 */
export function ListaOS() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba: SituacaoOS = params.get('aba') === 'encerradas' ? 'encerradas' : 'abertas'
  const consulta = useMinhasOS(aba)
  const [novaAberta, setNovaAberta] = useState(false)

  const dados = consulta.data
  const lista = dados?.lista ?? []
  const faltando = lista.reduce((s, o) => s + Number(o.faltando || 0), 0)

  function trocarAba(a: SituacaoOS) {
    const p = new URLSearchParams(params)
    if (a === 'abertas') p.delete('aba')
    else p.set('aba', a)
    setParams(p, { replace: true })
  }

  return (
    <>
      <TopoM
        voltar="/"
        titulo="Minhas OS"
        sub="Do sistema Tecnoar"
        acao={
          <button
            type="button"
            aria-label="Atualizar"
            onClick={() => void consulta.refetch()}
            disabled={consulta.isFetching}
            className="flex size-12 items-center justify-center rounded-2xl text-ink-2 active:bg-surface-2 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-5', consulta.isFetching && 'animate-spin')} />
          </button>
        }
      />
      <TelaM>
        {dados?.pode_criar && (
          <BotaoM variante="laranja" tamanho="lg" largo icone={FilePlus2} onClick={() => setNovaAberta(true)}>
            Nova OS
          </BotaoM>
        )}

        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1" role="tablist" aria-label="Situação das OS">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => trocarAba(a.id)}
              className={cn(
                'min-h-12 min-w-0 truncate rounded-xl px-2 text-[14.5px] font-bold transition-colors',
                aba === a.id ? 'bg-accent text-white' : 'text-ink-2 active:bg-surface-2',
              )}
            >
              {a.rotulo}
              {aba === a.id && dados ? <span className="num ml-1.5 opacity-85">{lista.length}</span> : null}
            </button>
          ))}
        </div>

        {consulta.isError && !dados ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-5 py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-crit-soft text-crit-ink">
              <AlertTriangle className="size-7" />
            </span>
            <p className="font-display text-[17px] font-bold text-ink">Não foi possível carregar as OS</p>
            <p className="max-w-xs text-[14px] leading-relaxed text-ink-2">{(consulta.error as Error).message}</p>
            <BotaoM variante="escuro" icone={RefreshCw} carregando={consulta.isFetching} onClick={() => void consulta.refetch()}>
              Tentar de novo
            </BotaoM>
          </div>
        ) : !dados ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <EsqueletoM key={i} className="h-40 rounded-[1.25rem]" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <VazioM
            icone={FileText}
            titulo={aba === 'abertas' ? 'Nenhuma OS aberta com você' : 'Nenhuma OS encerrada nos últimos 90 dias'}
            texto={aba === 'abertas' ? 'Aparecem aqui as OS em que a oficina escalou você e as dos socorros que você atendeu.' : undefined}
          />
        ) : (
          <>
            {aba === 'abertas' && (
              <div className="grid grid-cols-2 gap-2">
                <NumeroM rotulo="OS abertas" valor={lista.length} />
                <NumeroM rotulo="Peças sem estoque" valor={faltando} tom={faltando ? 'ambar' : 'ok'} icone={faltando ? AlertTriangle : undefined} />
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {lista.map((o) => (
                <li key={o.id}>
                  <CartaoOS os={o} aoAbrir={() => navegar(`/os/${o.id}`)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </TelaM>

      <FolhaNovaOS aberta={novaAberta} aoFechar={() => setNovaAberta(false)} abertas={aba === 'abertas' ? lista : []} />
    </>
  )
}

function CartaoOS({ os: o, aoAbrir }: { os: OSResumoApp; aoAbrir: () => void }) {
  const encerrada = !!o.encerrada_em
  const faltando = Number(o.faltando || 0)
  const itens = Number(o.itens || 0)
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'flex w-full flex-col gap-2.5 rounded-[1.25rem] border bg-surface p-3.5 text-left mec-sombra transition-transform active:scale-[0.99]',
        faltando > 0 && !encerrada ? 'border-crit/45' : 'border-line',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-display text-[21px] leading-none font-black tracking-tight text-ink">
          OS <span className="num">{o.numero}</span>
        </span>
        <span className="flex-1" />
        {o.status && (
          <SeloM tom={tomStatusOS(o.status_cor)} ponto className="max-w-[62%] min-w-0 shrink">
            <span className="min-w-0 truncate">{o.status}</span>
          </SeloM>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16.5px] font-bold text-ink">{o.cliente}</p>
          <p className="truncate text-[14px] text-ink-2">{o.veiculo ?? 'Veículo'}</p>
        </div>
        <Placa placa={o.placa} />
      </div>

      {o.problema && <p className="line-clamp-2 text-[13.5px] leading-snug text-ink-3">{o.problema}</p>}

      {(faltando > 0 || o.protocolo) && (
        <div className="flex flex-wrap gap-1.5">
          {faltando > 0 && (
            <SeloM tom="vermelho">
              <AlertTriangle className="size-3.5" />
              {faltando} {faltando === 1 ? 'peça sem estoque' : 'peças sem estoque'}
            </SeloM>
          )}
          {o.protocolo && <SeloM tom="ciano">{rotuloProtocolo(o.protocolo)}</SeloM>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="flex min-w-0 flex-col">
          <span className="num truncate text-[13px] font-semibold text-ink-2">
            {itens} {itens === 1 ? 'item' : 'itens'}
          </span>
          <span className="num truncate text-[12px] text-ink-3">
            {encerrada ? 'Encerrada' : 'Aberta'} {diaMes(o.encerrada_em ?? o.aberta_em)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="num text-[18px] font-bold text-ink">{moeda(o.valor_total != null ? Number(o.valor_total) : 0)}</span>
          <ChevronRight className="size-5 text-ink-3" />
        </span>
      </div>
    </button>
  )
}

/** "13/09" — cabe ao lado do valor até em 320 px. */
function diaMes(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/* ── nova OS ────────────────────────────────────────────────────────────── */

const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Abrir OS pelo app: só para quem tem a permissão de criar OS no Checklist.
 * Veículo pela placa (o cliente vem junto) e o problema relatado; o
 * mecânico entra escalado e a OS já nasce no sistema Tecnoar.
 */
function FolhaNovaOS({ aberta, aoFechar, abertas }: { aberta: boolean; aoFechar: () => void; abertas: OSResumoApp[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const online = useOnline()
  const [placa, setPlaca] = useState('')
  const [termo, setTermo] = useState('')
  const [veiculo, setVeiculo] = useState<VeiculoParaOS | null>(null)
  const [problema, setProblema] = useState('')

  useEffect(() => {
    if (aberta) return
    setPlaca('')
    setTermo('')
    setVeiculo(null)
    setProblema('')
  }, [aberta])

  useEffect(() => {
    const id = window.setTimeout(() => setTermo(normalizarPlaca(placa)), 300)
    return () => window.clearTimeout(id)
  }, [placa])

  const busca = useQuery({
    queryKey: ['sos', 'os-veiculo', termo],
    queryFn: () => sosOSBuscarVeiculo(termo),
    enabled: aberta && termo.length >= 3,
    staleTime: 30_000,
  })

  const criar = useMutation({
    mutationFn: (p: { veiculo: VeiculoParaOS; problema: string }) => sosOSCriar(p.veiculo.id, p.problema),
    onSuccess: (id, p) => {
      void qc.invalidateQueries({ queryKey: CHAVES_OS.raiz })
      toast.ok('OS aberta no sistema Tecnoar', `${formatarPlacaExibicao(p.veiculo.placa)} · ${p.veiculo.cliente}`)
      aoFechar()
      navegar(`/os/${id}`)
    },
    onError: (e) => toast.erro('Não foi possível abrir a OS', (e as Error).message),
  })

  const resultados = busca.data ?? []
  const osExistente = veiculo?.os_aberta != null ? (abertas.find((o) => o.numero === veiculo.os_aberta) ?? null) : null
  const pronto = !!veiculo && problema.trim().length >= 3

  return (
    <FolhaM
      aberta={aberta}
      aoFechar={criar.isPending ? () => {} : aoFechar}
      titulo="Nova OS"
      descricao="Busque o veículo pela placa e diga o problema."
      rodape={
        <>
          {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem internet: abrir OS precisa de sinal.</p>}
          <BotaoM
            variante="laranja"
            tamanho="xl"
            largo
            icone={Plus}
            carregando={criar.isPending}
            disabled={!online || !pronto}
            onClick={() => veiculo && criar.mutate({ veiculo, problema: problema.trim() })}
          >
            {veiculo?.os_aberta != null ? 'Abrir outra OS' : 'Abrir OS'}
          </BotaoM>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <CampoM
          rotulo="Placa"
          icone={Search}
          value={placa}
          onChange={(e) => {
            setPlaca(e.target.value.toUpperCase().slice(0, 8))
            setVeiculo(null)
          }}
          placeholder="ABC1D23"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          dica={termo.length < 3 ? 'Digite ao menos 3 caracteres.' : undefined}
        />

        {termo.length >= 3 && (
          <div className="flex flex-col gap-2" aria-live="polite">
            {busca.isError ? (
              <div className="flex flex-col items-start gap-2 rounded-2xl bg-crit-soft px-3.5 py-3">
                <p className="text-[13.5px] leading-snug text-crit-ink">{(busca.error as Error).message}</p>
                <BotaoM variante="escuro" tamanho="md" icone={RefreshCw} onClick={() => void busca.refetch()}>
                  Tentar de novo
                </BotaoM>
              </div>
            ) : busca.isPending ? (
              <p className="flex items-center gap-2 px-1 text-[13.5px] text-ink-3">
                <Loader2 className="size-4 animate-spin" /> Buscando no cadastro…
              </p>
            ) : resultados.length === 0 ? (
              <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
                Nenhum veículo com essa placa no cadastro da Tecnoar. Cadastre o veículo no sistema e volte aqui.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Veículo" className="flex flex-col gap-2">
                {resultados.map((v) => {
                  const marcado = veiculo?.id === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={marcado}
                      onClick={() => setVeiculo(v)}
                      className={cn(
                        'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors',
                        marcado ? 'border-accent bg-accent-soft' : 'border-line bg-surface active:bg-surface-2',
                      )}
                    >
                      <Placa placa={v.placa} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-ink">{v.cliente}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">{v.veiculo ?? 'Veículo sem modelo'}</span>
                        {v.os_aberta != null && <span className="block text-[12.5px] font-bold text-warn-ink">Já tem OS nº {v.os_aberta} aberta</span>}
                      </span>
                      <span
                        aria-hidden
                        className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2', marcado ? 'border-accent bg-accent text-white' : 'border-line-strong')}
                      >
                        {marcado && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {veiculo?.os_aberta != null && (
          <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft px-3.5 py-3">
            <p className="flex items-start gap-2 text-[13.5px] leading-snug font-medium text-warn-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Este veículo já tem a OS nº {veiculo.os_aberta} aberta. Prefira lançar nela em vez de abrir outra.
            </p>
            {osExistente && (
              <BotaoM
                variante="neutro"
                tamanho="md"
                onClick={() => {
                  aoFechar()
                  navegar(`/os/${osExistente.id}`)
                }}
              >
                Ir para a OS nº {osExistente.numero}
              </BotaoM>
            )}
          </div>
        )}

        {veiculo && (
          <AreaM
            rotulo="Problema relatado"
            placeholder="O que o cliente relatou ou o que você encontrou."
            value={problema}
            onChange={(e) => setProblema(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        )}
      </div>
    </FolhaM>
  )
}
