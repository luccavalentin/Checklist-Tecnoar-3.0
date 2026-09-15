import { useMemo, useState } from 'react'
import { Car, MapPin, RotateCw, Search, Settings2, Siren, Smartphone, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Entrada } from '@/componentes/ui/Campo'
import { Esqueleto, EstadoVazio } from '@/componentes/ui/Estados'
import { Selo } from '@/componentes/ui/Selo'
import { SITUACOES_MECANICO, haQuanto } from '@/sos/rotulos'
import type { MecanicoMapa, SituacaoMecanico } from '@/sos/tipos'
import { Avatar, ContatoRapido, ErroSOS, posicaoRecente, useChamadosAtivos, useMecanicosSOS } from './comum'
import { GerirMecanico, IncluirMecanico } from './GerirMecanico'

const ORDEM: SituacaoMecanico[] = ['disponivel', 'em_atendimento', 'pausa', 'indisponivel', 'offline']

/**
 * Quem está no SOS agora: situação, onde foi visto por último, o que sabe
 * fazer e em qual chamado está. A posição velha aparece esmaecida — o
 * despacho não conta posição com mais de 2 horas, e a tela também não finge.
 */
export function MecanicosSOS({ aoAbrirChamado }: { aoAbrirChamado: (id: string) => void }) {
  const consulta = useMecanicosSOS()
  const chamados = useChamadosAtivos()
  const [filtro, setFiltro] = useState<SituacaoMecanico | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [gerindo, setGerindo] = useState<MecanicoMapa | null>(null)
  const [incluindo, setIncluindo] = useState(false)
  const podeEditar = usePermissoes().pode('sos', 'editar')

  const lista = consulta.data ?? []
  const contagem = useMemo(() => {
    const c: Record<SituacaoMecanico, number> = { disponivel: 0, em_atendimento: 0, pausa: 0, indisponivel: 0, offline: 0 }
    for (const m of lista) c[m.situacao] += 1
    return c
  }, [lista])

  const protocolos = useMemo(() => new Map((chamados.data ?? []).map((c) => [c.id, c])), [chamados.data])

  const termo = busca.trim().toLowerCase()
  const visiveis = lista.filter(
    (m) =>
      (filtro === 'todos' || m.situacao === filtro) &&
      (!termo || m.nome.toLowerCase().includes(termo) || (m.especialidades ?? '').toLowerCase().includes(termo)),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Situação" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <Pilula ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} rotulo="Todos" n={lista.length} />
          {ORDEM.map((s) => (
            <Pilula key={s} ativo={filtro === s} onClick={() => setFiltro(s)} rotulo={SITUACOES_MECANICO[s].rotulo} n={contagem[s]} ponto={SITUACOES_MECANICO[s].ponto} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Entrada
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou especialidade"
              aria-label="Buscar mecânico"
              iconeInicio={<Search />}
              acaoFim={
                busca ? (
                  <BotaoIcone rotulo="Limpar busca" tamanho="sm" onClick={() => setBusca('')}>
                    <X />
                  </BotaoIcone>
                ) : undefined
              }
            />
          </div>
          <BotaoIcone rotulo="Atualizar" variante="neutro" onClick={() => void consulta.refetch()} disabled={consulta.isFetching} className="shrink-0 max-sm:size-11">
            <RotateCw className={consulta.isFetching ? 'animate-spin' : undefined} />
          </BotaoIcone>
          {podeEditar && (
            <Botao variante="neutro" iconeInicio={<UserPlus />} onClick={() => setIncluindo(true)} className="shrink-0 max-sm:h-11">
              <span className="hidden sm:inline">Incluir no SOS</span>
              <span className="sm:hidden">Incluir</span>
            </Botao>
          )}
        </div>
      </div>

      {consulta.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Esqueleto key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : consulta.isError ? (
        <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          icone={<Users />}
          titulo={lista.length ? 'Nenhum mecânico neste filtro' : 'Nenhum mecânico no SOS'}
          descricao={
            lista.length
              ? 'Troque a situação ou a busca.'
              : 'Marque a função como mecânica em Cadastros › Funções e Cargos. Quem entra no app do SOS aparece aqui com a situação e a posição.'
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((m) => (
            <li key={m.usuario_id}>
              <CartaoMecanico
                m={m}
                chamado={m.chamado_atual_id ? protocolos.get(m.chamado_atual_id) : undefined}
                aoAbrirChamado={aoAbrirChamado}
                aoGerir={podeEditar ? () => setGerindo(m) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <GerirMecanico mecanico={gerindo} aoFechar={() => setGerindo(null)} />
      <IncluirMecanico aberto={incluindo} aoFechar={() => setIncluindo(false)} jaNoSos={new Set(lista.map((m) => m.usuario_id))} />
    </div>
  )
}

function Pilula({ ativo, onClick, rotulo, n, ponto }: { ativo: boolean; onClick: () => void; rotulo: string; n: number; ponto?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
        ativo ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
      )}
    >
      {ponto && <span aria-hidden className={cn('size-2 rounded-full', ponto)} />}
      {rotulo}
      <span className={cn('num rounded-full px-1.5 text-[11px]', ativo ? 'bg-surface/20' : 'bg-surface-2')}>{n}</span>
    </button>
  )
}

function CartaoMecanico({
  m,
  chamado,
  aoAbrirChamado,
  aoGerir,
}: {
  m: MecanicoMapa
  chamado: { id: string; protocolo: string; cliente_nome: string; status_rotulo: string } | undefined
  aoAbrirChamado: (id: string) => void
  aoGerir?: () => void
}) {
  const s = SITUACOES_MECANICO[m.situacao]
  const recente = posicaoRecente(m)
  // O app aberto pulsa a cada minuto; 3 min de folga para rede lenta.
  const appAberto = !!m.visto_em && Date.now() - Date.parse(m.visto_em) < 3 * 60_000
  return (
    <article className="aresta flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-e1">
      <header className="flex items-start gap-3">
        <span className="relative">
          <Avatar nome={m.nome} url={m.avatar_url} />
          <span aria-hidden className={cn('absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface', s.ponto)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-ink">{m.nome}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Selo tom={s.tom} ponto>
              {s.rotulo}
            </Selo>
            {!m.aceita_sos && <Selo tom="atencao">Não recebe SOS</Selo>}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex items-start gap-2">
          <MapPin aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', recente ? 'text-cyan' : 'text-ink-3')} />
          <p className={recente ? 'text-ink-2' : 'text-ink-3'}>
            {m.posicao_em ? `Posição ${haQuanto(m.posicao_em)}` : 'Sem posição registrada'}
            {m.posicao_em && !recente ? ' · antiga, fora do despacho' : ''}
          </p>
        </div>
        {/* Pulso do app: aberto agora, ou há quanto tempo foi fechado. Fechado,
            o mecânico ainda recebe o push — mas demora mais para responder. */}
        <div className="flex items-start gap-2">
          <Smartphone aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', appAberto ? 'text-ok' : 'text-ink-3')} />
          <p className={appAberto ? 'text-ok-ink' : 'text-ink-3'}>
            {appAberto ? 'App aberto agora' : m.visto_em ? `App visto ${haQuanto(m.visto_em)}` : 'App ainda não aberto'}
          </p>
        </div>
        {m.veiculo_apoio && (
          <div className="flex items-start gap-2">
            <Car aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            <p className="text-ink-2">{m.veiculo_apoio}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {(m.especialidades ?? '')
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
            .map((e) => (
              <span key={e} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
                {e}
              </span>
            ))}
          {!m.especialidades && <span className="text-[11.5px] text-ink-3">Sem especialidades cadastradas</span>}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 border-t border-line pt-3">
        {m.chamado_atual_id && (
          <button
            type="button"
            onClick={() => aoAbrirChamado(m.chamado_atual_id!)}
            className="flex min-h-10 items-center gap-2 rounded-md border border-cyan/40 bg-cyan-soft px-3 text-left text-[12.5px] text-ink transition-colors hover:border-cyan"
          >
            <Siren aria-hidden className="size-4 shrink-0 text-cyan-ink" />
            <span className="min-w-0 flex-1 truncate">
              {chamado ? (
                <>
                  <span className="num font-semibold">{chamado.protocolo}</span> · {chamado.cliente_nome}
                </>
              ) : (
                'Chamado em andamento'
              )}
            </span>
            {chamado && <span className="shrink-0 text-[11px] text-ink-3">{chamado.status_rotulo}</span>}
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <ContatoRapido telefone={m.telefone} compacto />
          {aoGerir && (
            <Botao tamanho="sm" variante="neutro" iconeInicio={<Settings2 />} onClick={aoGerir} className="max-sm:h-11">
              Gerenciar
            </Botao>
          )}
        </div>
      </div>
    </article>
  )
}
