import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing, CalendarPlus, Check, Gauge, History, Plus, Star, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraPlaca } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosAtualizarConta, sosAtualizarKm, sosCadastrarVeiculo } from '@/sos/api'
import { ROTULO_TIPO_VEICULO } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { LembreteSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { BotaoApp, CampoApp, Esqueleto, Faixa, Folha, LogoSOS } from '../comum/ui'
import { dataNumerica, kmTexto, nomeVeiculo, useLembretes, useMeusVeiculos, venceu, type EstadoAgendar, type VeiculoCliente } from './dados'
import { ErroCarga, PlacaVeiculo, Rotulo } from './pecas'
import './veiculos.css'

const TIPOS = ['cavalo', 'truck', 'toco', 'carreta', 'onibus', 'utilitario']

/**
 * A frota do cliente — um veículo ou vinte — com a manutenção preventiva de
 * cada um: km atual, próximas revisões (lembretes que o Checklist gera a
 * partir das OS) e o atalho para agendar. O "principal" é o que já vem
 * escolhido no pedido de socorro; trocar é um toque.
 */
export function MeusVeiculos() {
  const { conta } = useCliente()
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useSearchParams()
  const veiculos = useMeusVeiculos()
  const lembretes = useLembretes()
  const [novo, setNovo] = useState(busca.get('novo') === '1')
  const [editandoKm, setEditandoKm] = useState<VeiculoCliente | null>(null)

  // `?novo=1` vem da Home; limpa a URL para o voltar do celular não reabrir a folha.
  useEffect(() => {
    if (busca.get('novo')) setBusca({}, { replace: true })
  }, [busca, setBusca])

  const lista = veiculos.data ?? []
  const principalId = conta.veiculo_principal_id ?? lista[0]?.id ?? null

  const tornarPrincipal = useMutation({
    mutationFn: (id: string) => sosAtualizarConta({ veiculoPrincipal: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      toast.ok('Veículo principal alterado', 'Ele já vem escolhido no pedido de socorro.')
    },
    onError: (e) => toast.erro('Não foi possível alterar', (e as Error).message),
  })

  const ordenados = [...lista].sort((a, b) => Number(b.id === principalId) - Number(a.id === principalId))

  return (
    <div className="vei">
      <header className="vei-topo pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))]">
        <div aria-hidden className="vei-foto" />
        <div className="vei-barra">
          <span className="hidden dark:block">
            <LogoSOS negativo altura={44} />
          </span>
          <span className="dark:hidden">
            <LogoSOS altura={44} />
          </span>
          <button type="button" onClick={() => setNovo(true)} className="vei-adicionar">
            <Plus className="size-5 text-[#ff6a00]" strokeWidth={2.4} /> Adicionar
          </button>
        </div>
        <h1 className="vei-titulo">
          Meus <span className="text-[#ff6a00]">veículos</span>
        </h1>
        <p className="vei-sub">
          {lista.length
            ? `${lista.length} veículo${lista.length > 1 ? 's' : ''} cadastrado${lista.length > 1 ? 's' : ''} na sua conta, com a manutenção preventiva de cada um.`
            : 'Gerencie os veículos cadastrados na sua conta.'}
        </p>
      </header>
      <main className="vei-conteudo entrada-suave">
        {veiculos.isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Esqueleto key={i} className="h-60" />
            ))}
          </div>
        ) : veiculos.isError ? (
          <ErroCarga erro={veiculos.error} aoTentar={() => void veiculos.refetch()} />
        ) : lista.length === 0 ? (
          <section className="vei-vazio">
            <span className="vei-vazio-icone">
              <Truck className="size-10" strokeWidth={1.6} />
              <span aria-hidden className="vei-vazio-mais">
                <Plus className="size-4" strokeWidth={3} />
              </span>
            </span>
            <h2 className="vei-vazio-titulo">Nenhum veículo cadastrado</h2>
            <p className="vei-vazio-texto">
              Cadastre a placa: o pedido de socorro sai mais rápido e o histórico de manutenções do veículo passa a aparecer aqui.
            </p>
            <button type="button" onClick={() => setNovo(true)} className="vei-botao">
              <Plus className="size-5" strokeWidth={2.6} /> Cadastrar veículo
            </button>
          </section>
        ) : (
          <ul className="flex flex-col gap-4">
            {ordenados.map((v) => (
              <CartaoVeiculo
                key={v.id}
                veiculo={v}
                principal={v.id === principalId}
                lembretes={(lembretes.data ?? []).filter((l) => l.veiculo_id === v.id)}
                carregandoLembretes={lembretes.isLoading}
                aoAtualizarKm={() => setEditandoKm(v)}
                aoTornarPrincipal={() => tornarPrincipal.mutate(v.id)}
                ocupado={tornarPrincipal.isPending}
              />
            ))}
          </ul>
        )}
      </main>

      <FolhaNovoVeiculo aberta={novo} aoFechar={() => setNovo(false)} />
      <FolhaKm veiculo={editandoKm} aoFechar={() => setEditandoKm(null)} />
    </div>
  )
}

function CartaoVeiculo({
  veiculo: v,
  principal,
  lembretes,
  carregandoLembretes,
  aoAtualizarKm,
  aoTornarPrincipal,
  ocupado,
}: {
  veiculo: VeiculoCliente
  principal: boolean
  lembretes: LembreteSOS[]
  carregandoLembretes: boolean
  aoAtualizarKm: () => void
  aoTornarPrincipal: () => void
  ocupado: boolean
}) {
  const navegar = useNavigate()
  const detalhes = [v.tipo ? (ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo) : null, v.ano, v.cor].filter(Boolean).join(' · ')
  const agendar = (descricao?: string) =>
    navegar('/revisoes?agendar=1', { state: { veiculoId: v.id, tipo: 'revisao', descricao } satisfies EstadoAgendar })

  return (
    <li className={cn('overflow-hidden rounded-[1.25rem] border bg-surface', principal ? 'border-accent/40' : 'border-line')}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {principal ? (
              <p className="inline-flex items-center gap-1 text-[12px] font-bold text-accent-ink">
                <Star className="size-3.5 fill-current" /> Principal · já vem no SOS
              </p>
            ) : (
              <Rotulo>Veículo</Rotulo>
            )}
            <p className="mt-0.5 font-display text-[20px] leading-tight font-bold break-words text-ink">{nomeVeiculo(v)}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">{detalhes || 'Dados completos na próxima visita à Tecnoar'}</p>
          </div>
          <PlacaVeiculo placa={v.placa} className="mt-1" />
        </div>

        <button type="button" onClick={aoAtualizarKm} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-2 px-3.5 text-left active:scale-[0.99]">
          <Gauge className="size-5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-ink-3">Quilometragem</span>
            <span className="num block text-[15.5px] font-semibold text-ink">{kmTexto(v.km_atual) ?? 'Não informada'}</span>
          </span>
          <span className="text-[13.5px] font-semibold text-accent-ink">Atualizar</span>
        </button>

        <section aria-label="Manutenção preventiva" className="flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold text-ink">Manutenção preventiva</p>
          {carregandoLembretes ? (
            <Esqueleto className="h-12" />
          ) : lembretes.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-line px-3.5 py-3 text-[13.5px] text-ink-2">
              <Check className="size-4 shrink-0 text-ok" /> Em dia. Avisamos quando chegar a hora da revisão.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {lembretes.slice(0, 3).map((l) => {
                const vencida = venceu(l.vence_em)
                return (
                  <li key={l.id}>
                    <button type="button" onClick={() => agendar(l.titulo)} className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-2">
                      <BellRing className={cn('size-[18px] shrink-0', vencida ? 'text-crit' : 'text-warn')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] leading-snug font-semibold text-ink">{l.titulo}</span>
                        <span className={cn('block text-[12.5px]', vencida ? 'font-semibold text-crit-ink' : 'text-ink-3')}>
                          {[l.vence_em ? `${vencida ? 'Venceu em' : 'Até'} ${dataNumerica(l.vence_em)}` : null, l.vence_km != null ? `aos ${kmTexto(l.vence_km)}` : null]
                            .filter(Boolean)
                            .join(' · ') || 'Pendente'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-accent-ink">Agendar</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-2 min-[380px]:flex-row">
          <BotaoApp icone={CalendarPlus} onClick={() => agendar()} className="min-[380px]:flex-1">
            Agendar revisão
          </BotaoApp>
          <BotaoApp variante="neutro" icone={History} onClick={() => navegar(`/historico?veiculo=${v.id}`)} className="min-[380px]:shrink-0 min-[380px]:px-4">
            Histórico
          </BotaoApp>
        </div>
      </div>
      {!principal && (
        <button
          type="button"
          disabled={ocupado}
          onClick={aoTornarPrincipal}
          className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-line text-[13.5px] font-semibold text-ink-2 active:bg-surface-2 disabled:opacity-50"
        >
          <Star className="size-4" /> Usar como principal no SOS
        </button>
      )}
    </li>
  )
}

function FolhaNovoVeiculo({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [placa, setPlaca] = useState('')
  const [tipo, setTipo] = useState('cavalo')
  const [modelo, setModelo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: () => sosCadastrarVeiculo(placa.replace(/[^A-Za-z0-9]/g, ''), modelo.trim() || null, tipo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.veiculos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      toast.ok('Veículo cadastrado', `${placa.toUpperCase()} já aparece no pedido de socorro.`)
      setPlaca('')
      setModelo('')
      aoFechar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (placa.replace(/[^A-Za-z0-9]/g, '').length !== 7) return setErro('A placa tem 7 caracteres (ex.: ABC1D23).')
    salvar.mutate()
  }

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Adicionar veículo" descricao="Se a placa já estiver na Tecnoar, ligamos ao cadastro e ao histórico que já existem — sem duplicar.">
      <form id="form-veiculo" onSubmit={enviar} className="flex flex-col gap-4 pb-2">
        <CampoApp rotulo="Placa" autoCapitalize="characters" icone={Truck} value={placa} onChange={(e) => setPlaca(mascaraPlaca(e.target.value))} placeholder="ABC1D23" />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink-2">Tipo</span>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tipo === t}
                onClick={() => setTipo(t)}
                className={cn(
                  'min-h-12 rounded-xl border px-1 text-[13px] font-semibold transition-colors',
                  tipo === t ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2',
                )}
              >
                {ROTULO_TIPO_VEICULO[t]}
              </button>
            ))}
          </div>
        </div>
        <CampoApp rotulo="Marca e modelo (opcional)" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: Volvo FH 540" />
        {erro && <Faixa tom="critico">{erro}</Faixa>}
        <BotaoApp type="submit" tamanho="lg" largo carregando={salvar.isPending}>
          Salvar veículo
        </BotaoApp>
      </form>
    </Folha>
  )
}

function FolhaKm({ veiculo, aoFechar }: { veiculo: VeiculoCliente | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [km, setKm] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setKm(veiculo?.km_atual != null ? String(veiculo.km_atual) : '')
    setErro(null)
  }, [veiculo])

  const salvar = useMutation({
    mutationFn: (valor: number) => sosAtualizarKm(veiculo!.id, valor),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.veiculos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      toast.ok('Quilometragem atualizada', 'Ela ajuda a Tecnoar a avisar a hora certa da revisão.')
      aoFechar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const valor = Number(km.replace(/\D/g, ''))
    if (!valor) return setErro('Informe a quilometragem do painel.')
    if (veiculo?.km_atual != null && valor < veiculo.km_atual) return setErro(`O valor é menor que o registrado (${kmTexto(veiculo.km_atual)}). Confira o painel.`)
    salvar.mutate(valor)
  }

  return (
    <Folha aberta={!!veiculo} aoFechar={aoFechar} titulo="Atualizar quilometragem" descricao={veiculo ? `${nomeVeiculo(veiculo)} · ${veiculo.placa}` : undefined}>
      <form onSubmit={enviar} className="flex flex-col gap-4 pb-2">
        <CampoApp
          rotulo="Km atual do painel"
          inputMode="numeric"
          icone={Gauge}
          value={km ? Number(km.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
          onChange={(e) => setKm(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="Ex.: 452.300"
          direita={<span className="text-[14px] text-ink-3">km</span>}
          autoFocus
        />
        {erro && <Faixa tom="critico">{erro}</Faixa>}
        <BotaoApp type="submit" tamanho="lg" largo carregando={salvar.isPending}>
          Salvar
        </BotaoApp>
      </form>
    </Folha>
  )
}
