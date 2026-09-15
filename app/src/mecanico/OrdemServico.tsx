import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, FilePlus2, FileText, Gauge, Link2, ListChecks, RefreshCw, Smartphone } from 'lucide-react'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosGerarOS, sosOSParaVincular, sosRegistrarKm, sosVincularOS } from '@/sos/api'
import { URL_CHECKLIST } from '@/sos/endereco'
import { formatarPlacaExibicao } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { DetalheChamado, OSParaVincular } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { totaisItens, useAgora, useOnline } from './dados'
import { modeloVeiculo } from './PecasAtendimento'
import { BotaoM, OpcaoM, RodapeAcao, RotuloM, SeloM } from './ui'

const chaveParaVincular = (chamadoId: string) => ['sos', 'os-para-vincular', chamadoId] as const

/**
 * OS abertas do mesmo cliente/veículo do chamado — para lançar o atendimento
 * nela em vez de abrir outra (OS duplicada é retrabalho no escritório).
 */
export function useOSParaVincular(chamadoId: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveParaVincular(chamadoId),
    queryFn: () => sosOSParaVincular(chamadoId),
    enabled: ativo,
    staleTime: 30_000,
    retry: 1,
  })
}

function dataCurtaOS(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** "Aberta em 12/09 · Em execução · troca de óleo". */
export function resumoOSAberta(o: OSParaVincular): string {
  return [`Aberta em ${dataCurtaOS(o.aberta_em)}`, o.status, o.problema].filter(Boolean).join(' · ')
}

/** Endereço da OS no sistema Tecnoar (Checklist) — abre direto a OS. */
export function linkOS(osId: string): string {
  return `${URL_CHECKLIST}/operacao/ordens-de-servico?os=${osId}`
}

/** Checklists (entrada/saída) daquela OS, no Checklist. */
export function linkChecklistOS(osId: string): string {
  return `${URL_CHECKLIST}/operacao/checklists?os=${osId}`
}

/**
 * ORDEM DE SERVIÇO — o mecânico não cria cadastro nenhum dentro do SOS.
 * Toca em GERAR OS e o sistema Tecnoar abre a OS real com o que o chamado já
 * tem (cliente, veículo, placa, SOS, mecânico, data, horário e a descrição
 * original). Produtos e serviços lançados depois entram direto nela.
 */
export function OrdemServico({ d, podeGerar = true }: { d: DetalheChamado; podeGerar?: boolean }) {
  const { perfil } = useMecanico()
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const navegar = useNavigate()
  const agora = useAgora(30_000)
  const c = d.chamado
  const os = d.os
  const { nProdutos, nServicos, total } = totaisItens(d.itens)
  const semVeiculo = !c.veiculo_id

  // Antes de abrir OS nova: o veículo (ou o cliente) já tem OS aberta?
  const decidir = !os && podeGerar
  const abertas = useOSParaVincular(c.id, decidir && online)
  const lista = abertas.data ?? []
  const [escolha, setEscolha] = useState<string | null>(null)
  const selecionada: string = escolha && (escolha === 'nova' || lista.some((o) => o.id === escolha)) ? escolha : (lista[0]?.id ?? 'nova')
  const osEscolhida = lista.find((o) => o.id === selecionada) ?? null

  function atualizar() {
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(c.id) })
    void qc.invalidateQueries({ queryKey: chaveParaVincular(c.id) })
    void qc.invalidateQueries({ queryKey: ['sos', 'os'] })
  }

  const gerar = useMutation({
    mutationFn: () => sosGerarOS(c.id),
    onSuccess: () => {
      atualizar()
      toast.ok('OS gerada no sistema Tecnoar', 'Produtos e serviços do atendimento já estão nela.')
    },
    onError: (e) => toast.erro('Não foi possível gerar a OS', (e as Error).message),
  })

  const vincular = useMutation({
    mutationFn: (o: OSParaVincular) => sosVincularOS(c.id, o.id),
    onSuccess: (_, o) => {
      atualizar()
      toast.ok(`Atendimento lançado na OS nº ${o.numero}`, 'Produtos e serviços do chamado foram para a OS (peças reservadas até a OS ser efetivada).')
    },
    onError: (e) => {
      toast.erro('Não foi possível lançar na OS', (e as Error).message)
      void qc.invalidateQueries({ queryKey: chaveParaVincular(c.id) })
    },
  })

  const ocupado = gerar.isPending || vincular.isPending
  function confirmar() {
    if (ocupado) return
    if (osEscolhida) vincular.mutate(osEscolhida)
    else gerar.mutate()
  }

  // A OS nasce com a data e a hora do toque em GERAR OS.
  const data = new Date(agora)
  const descricao = [c.ocorrencia_rotulo, c.descricao].filter(Boolean).join(' — ')

  return (
    <>
      {os ? (
        <section className="rounded-[1.25rem] border-2 border-ok/50 bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <RotuloM className="text-ok-ink">OS no sistema Tecnoar</RotuloM>
            {os.status && <SeloM tom="ok">{os.status}</SeloM>}
          </div>
          <p className="mt-1 font-display text-[32px] leading-none font-black tracking-tight text-ink">
            OS nº <span className="num">{os.numero}</span>
          </p>
          <p className="num mt-2 text-[14px] text-ink-2">Valor na OS: {moeda(os.valor_total)}</p>
          <p className="mt-2 text-[13.5px] leading-snug text-ink-3">Produtos e serviços que você lançar entram direto nesta OS.</p>
          <BotaoM variante="escuro" tamanho="lg" largo icone={Smartphone} className="mt-4" onClick={() => navegar(`/os/${os.id}`)}>
            Ver a OS no app
          </BotaoM>
          <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <a
              href={linkOS(os.id)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 font-display text-[14.5px] font-extrabold text-ink"
            >
              <ExternalLink className="size-4" /> Abrir a OS
            </a>
            <a
              href={linkChecklistOS(os.id)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 font-display text-[14.5px] font-extrabold text-ink"
            >
              <ListChecks className="size-4" /> Checklist da OS
            </a>
          </div>
          <p className="mt-2 text-center text-[12px] text-ink-3">Abre no sistema Tecnoar (Checklist), com o seu login de lá.</p>
        </section>
      ) : lista.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-start gap-3 rounded-[1.25rem] border border-cyan/40 bg-cyan-soft p-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-cyan-ink">
              <Link2 className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[18px] leading-tight font-extrabold text-ink">{lista.length === 1 ? 'Já existe OS aberta' : `${lista.length} OS abertas deste cliente`}</p>
              <p className="mt-1 text-[14px] leading-snug text-ink-2">Lance o atendimento nela: produtos e serviços do chamado vão junto, sem OS duplicada.</p>
            </div>
          </div>
          <div role="radiogroup" aria-label="Em qual OS lançar o atendimento" className="flex flex-col gap-2">
            {lista.map((o) => (
              <OpcaoM
                key={o.id}
                marcada={selecionada === o.id}
                aoMarcar={() => setEscolha(o.id)}
                icone={Link2}
                titulo={
                  <>
                    Lançar na OS nº <span className="num">{o.numero}</span>
                  </>
                }
                sub={resumoOSAberta(o)}
                selo={
                  <>
                    {o.placa && <SeloM>{formatarPlacaExibicao(o.placa)}</SeloM>}
                    {o.valor_total != null && <SeloM>{moeda(o.valor_total)}</SeloM>}
                  </>
                }
              />
            ))}
            <OpcaoM
              marcada={selecionada === 'nova'}
              aoMarcar={() => setEscolha('nova')}
              icone={FilePlus2}
              titulo="Abrir OS nova"
              sub={semVeiculo ? 'Precisa do veículo no chamado.' : 'Só se for um serviço separado da OS aberta.'}
            />
          </div>
        </section>
      ) : (
        <section className="flex items-start gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
            <FileText className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[18px] leading-tight font-extrabold text-ink">A OS nasce deste SOS</p>
            <p className="mt-1 text-[14px] leading-snug text-ink-2">Toque em GERAR OS: o sistema Tecnoar abre a ordem de serviço real, já preenchida com os dados abaixo.</p>
            {decidir && abertas.isError && (
              <button type="button" onClick={() => void abertas.refetch()} className="mt-2 flex min-h-10 items-center gap-1.5 text-left text-[13px] font-semibold text-warn-ink">
                <RefreshCw className="size-3.5 shrink-0" /> Não foi possível conferir se já há OS aberta. Tocar para tentar de novo.
              </button>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <RotuloM className="px-1">{os ? 'Veio do chamado' : 'O sistema preenche sozinho'}</RotuloM>
        <dl className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
          <Dado rotulo="Cliente" valor={d.cliente?.nome ?? '—'} />
          <Dado rotulo="Veículo" valor={modeloVeiculo(d) ?? (semVeiculo ? 'Sem veículo no chamado' : '—')} />
          <Dado rotulo="Placa" valor={<span className="num">{d.veiculo?.placa ? formatarPlacaExibicao(d.veiculo.placa) : '—'}</span>} />
          <Dado rotulo="SOS" valor={<span className="num">{c.protocolo}</span>} />
          <Dado rotulo="Mecânico" valor={perfil.nome} />
          {!os && (
            <>
              <Dado rotulo="Data" valor={<span className="num">{data.toLocaleDateString('pt-BR')}</span>} />
              <Dado rotulo="Horário" valor={<span className="num">{data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (ao gerar)</span>} />
            </>
          )}
          <Dado rotulo="Descrição original" valor={descricao || '—'} />
          {d.veiculo?.km_atual ? <Dado rotulo="KM do cadastro" valor={<span className="num">{d.veiculo.km_atual.toLocaleString('pt-BR')} km</span>} /> : null}
        </dl>
      </section>

      {!semVeiculo && <Quilometragem chamadoId={c.id} kmCadastro={d.veiculo?.km_atual ?? null} />}

      <section className="flex flex-col gap-2">
        <RotuloM className="px-1">Você completa no atendimento</RotuloM>
        <p className="px-1 text-[14px] leading-relaxed text-ink-2">
          Diagnóstico, produtos ({nProdutos}), serviços ({nServicos}), observações e fotos — pelas tarefas do atendimento. Total lançado agora:{' '}
          <span className="num font-semibold text-ink">{moeda(total)}</span>.
        </p>
      </section>

      {!os && podeGerar && (
        <RodapeAcao>
          {semVeiculo && !osEscolhida && (
            <p className="flex items-start gap-2 text-[13px] leading-snug font-medium text-warn-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> O chamado está sem veículo. Peça à central para informar o veículo antes de gerar a OS.
            </p>
          )}
          {!online && <p className="text-center text-[13px] font-medium text-warn-ink">A OS precisa de internet para ser gerada.</p>}
          {osEscolhida ? (
            <BotaoM variante="laranja" tamanho="xxl" largo icone={Link2} carregando={vincular.isPending} disabled={!online || gerar.isPending} onClick={confirmar}>
              Lançar na OS nº {osEscolhida.numero}
            </BotaoM>
          ) : (
            <BotaoM
              variante="laranja"
              tamanho="xxl"
              largo
              icone={FilePlus2}
              // Enquanto confere se há OS aberta, não abre outra por engano.
              carregando={gerar.isPending || (online && abertas.isLoading)}
              disabled={!online || semVeiculo || vincular.isPending}
              onClick={confirmar}
            >
              {lista.length ? 'Abrir OS nova' : 'Gerar OS'}
            </BotaoM>
          )}
        </RodapeAcao>
      )}
    </>
  )
}

/** KM lido no painel: atualiza o veículo e a OS (quando já existe). */
function Quilometragem({ chamadoId, kmCadastro }: { chamadoId: string; kmCadastro: number | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const [valor, setValor] = useState('')
  const km = Number(valor.replace(/\D/g, ''))

  const salvar = useMutation({
    mutationFn: () => sosRegistrarKm(chamadoId, km),
    onSuccess: () => {
      setValor('')
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
      toast.ok('Quilometragem registrada', 'Veículo e OS atualizados.')
    },
    onError: (e) => toast.erro('Não foi possível registrar', (e as Error).message),
  })

  return (
    <section className="flex flex-col gap-2">
      <RotuloM className="px-1">Quilometragem</RotuloM>
      <div className="flex items-stretch gap-2 rounded-[1.25rem] border border-line bg-surface p-2">
        <label className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5">
          <Gauge aria-hidden className="size-5 shrink-0 text-ink-3" />
          <input
            inputMode="numeric"
            enterKeyHint="done"
            aria-label="Quilometragem do painel"
            placeholder={kmCadastro ? `${kmCadastro.toLocaleString('pt-BR')} no cadastro` : 'KM do painel'}
            value={valor ? km.toLocaleString('pt-BR') : ''}
            onChange={(e) => setValor(e.target.value)}
            className="num min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:text-[14px] placeholder:font-normal placeholder:text-ink-3"
          />
          <span className="text-[14px] text-ink-3">km</span>
        </label>
        <BotaoM variante="laranja" carregando={salvar.isPending} disabled={!online || !km} onClick={() => salvar.mutate()}>
          Salvar
        </BotaoM>
      </div>
    </section>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[13.5px] text-ink-3">{rotulo}</dt>
      <dd className="min-w-0 text-right text-[15px] leading-snug font-semibold break-words text-ink">{valor}</dd>
    </div>
  )
}
