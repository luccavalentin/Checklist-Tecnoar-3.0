import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Gauge, History, Plus, Star, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Arte } from '../comum/Arte'
import { ARTE_MOBILE, VEICULO_MOBILE } from '../comum/kit3d'
import { ARTE3D } from '../comum/kit3d'
import { AcaoAgendar3D } from '../comum/AcaoAgendar3D'
import { mascaraPlaca } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosAtualizarConta, sosAtualizarKm, sosCadastrarVeiculo } from '@/sos/api'
import { ROTULO_TIPO_VEICULO } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { LembreteSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { BotaoApp, CampoApp, Esqueleto, Faixa, Folha, LogoSOS } from '../comum/ui'
import { dataNumerica, kmTexto, nomeVeiculo, useLembretes, useMeusVeiculos, venceu, type EstadoAgendar, type VeiculoCliente } from './dados'
import { ErroCarga, PlacaVeiculo } from './pecas'
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
        {/* Uma cor só. Título bicolor divide a leitura em duas e não
            acrescenta informação: "veículos" não é mais importante que
            "Meus". O destaque desta tela é o botão de adicionar. */}
        <h1 className="vei-titulo">Meus veículos</h1>
        {/* Sem lista, uma frase que CONVIDA. Com lista, nada: a pessoa está
            olhando os próprios veículos e não precisa que a tela conte
            quantos são nem explique para que serve a página. */}
        {!lista.length && <p className="vei-sub">Cadastre seu veículo e o socorro já sai com a placa certa.</p>}
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
              <Arte src={ARTE_MOBILE.caminhao} alt="" recuo={<Truck className="size-10" strokeWidth={1.6} />} classeImagem="size-20 object-contain" />
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

/**
 * O veículo, como PLACA DE IDENTIFICAÇÃO.
 *
 * O cartão era cinco retângulos arredondados aninhados: a borda do cartão, a
 * caixa da quilometragem, a caixa da manutenção, e dois botões cheios. Cinco
 * molduras para quatro dados. Isso não é hierarquia — é empacotar cada
 * informação numa caixinha porque não se decidiu qual importa mais, e o
 * resultado lê como formulário, não como veículo.
 *
 * Agora é UMA superfície, com campos estampados e fios de aço separando —
 * que é exatamente a placa rebitada que todo caminhão carrega. A forma vem
 * do objeto, não de um padrão de dashboard.
 *
 * E some a contradição mais grosseira da tela antiga: ela dizia "Em dia,
 * avisamos quando chegar a hora" e logo embaixo plantava um botão enorme de
 * "Agendar revisão". A tela mandava descansar e gritava para agir ao mesmo
 * tempo. Agora o peso do botão SEGUE o estado: sem nada vencendo, agendar é
 * um link discreto; com revisão vencida, vira o botão cheio que ele merece
 * ser — e aí não compete com nada, porque é a única coisa a fazer ali.
 */
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

  const vencidos = lembretes.filter((l) => venceu(l.vence_em))
  const proximo = vencidos[0] ?? lembretes[0] ?? null
  const urgente = vencidos.length > 0

  return (
    <li className={cn('vei-ficha', principal && 'vei-ficha-principal', urgente && 'vei-ficha-urgente')}>
      {/* O caminhão. É ELE o assunto desta tela — uma lista de registros com
          um ícone de linha é cara de sistema; o veículo em volume é cara de
          app. Sem a arte gerada ainda, não entra nada: um ícone genérico
          grande ali só pareceria espaço reservado esperando a imagem. */}
      <Arte
        src={VEICULO_MOBILE[v.tipo ?? 'cavalo'] ?? ARTE_MOBILE.caminhao}
        alt=""
        recuo={null}
        classeImagem="vei-ficha-arte"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="vei-ficha-nome">{nomeVeiculo(v)}</p>
          <p className="vei-ficha-detalhe">
            {principal && (
              <span className="vei-ficha-principal-marca">
                <Star className="size-3 fill-current" /> Principal no SOS
              </span>
            )}
            {detalhes || 'Dados completos na próxima visita à Tecnoar'}
          </p>
        </div>
        <PlacaVeiculo placa={v.placa} tamanho="lg" />
      </div>

      {/* Campos estampados: rótulo pequeno em caixa alta, valor em tipo de
          largura fixa. Separados por fio, não por caixa. */}
      <dl className="vei-campos">
        <button type="button" onClick={aoAtualizarKm} className="vei-campo vei-campo-toca">
          <dt className="vei-campo-rotulo">Quilometragem</dt>
          <dd className="vei-campo-valor num">{kmTexto(v.km_atual) ?? '—'}</dd>
          <span className="vei-campo-acao">Atualizar</span>
        </button>
        <div className="vei-campo">
          <dt className="vei-campo-rotulo">Manutenção</dt>
          <dd className={cn('vei-campo-valor', urgente && 'vei-campo-valor-crit')}>
            {carregandoLembretes ? '…' : urgente ? `${vencidos.length} vencida${vencidos.length > 1 ? 's' : ''}` : proximo ? 'A vencer' : 'Em dia'}
          </dd>
          {proximo && (
            <span className="vei-campo-nota">
              {proximo.titulo}
              {proximo.vence_em ? ` · ${venceu(proximo.vence_em) ? 'venceu' : 'até'} ${dataNumerica(proximo.vence_em)}` : ''}
            </span>
          )}
        </div>
      </dl>

      <div className="vei-ficha-acoes">
        {urgente ? (
          <BotaoApp icone={CalendarPlus} onClick={() => agendar(proximo?.titulo)} className="flex-1">
            Agendar revisão
          </BotaoApp>
        ) : (
          <button type="button" onClick={() => agendar()} className="vei-ficha-link sos-agendar-render">
            <AcaoAgendar3D />
          </button>
        )}
        <button type="button" onClick={() => navegar(`/historico?veiculo=${v.id}`)} className="vei-ficha-link">
          <Arte src={ARTE3D.historico} alt="" recuo={<History className="size-4" />} classeImagem="size-8 shrink-0 object-contain" /> Histórico
        </button>
        {!principal && (
          <button type="button" disabled={ocupado} onClick={aoTornarPrincipal} className="vei-ficha-link disabled:opacity-50">
            <Star className="size-4" /> Usar no SOS
          </button>
        )}
      </div>
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
                  'flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[13px] font-semibold transition-colors',
                  tipo === t ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2',
                )}
              >
                <Arte src={VEICULO_MOBILE[t]} alt="" recuo={<Truck className="size-7" />} classeImagem="h-12 w-16 object-contain" />
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
