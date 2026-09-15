import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, ChevronDown, Hourglass, PhoneForwarded, Sparkles, Star, UserCheck } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Esqueleto, EstadoVazio } from '@/componentes/ui/Estados'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { useToast } from '@/componentes/ui/Toast'
import { sosAtribuir, sosSugerirMecanicos } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { SITUACOES_MECANICO, formatarDistancia, formatarEta, haQuanto } from '@/sos/rotulos'
import type { ChamadoSOS, SugestaoMecanico } from '@/sos/tipos'
import { Avatar, ErroSOS, aguardando, invalidarSOS } from './comum'

/**
 * Despacho do chamado: a sugestão ranqueada pelo banco (disponibilidade,
 * distância, especialidade, carga do dia, nota e recusas) vem em destaque;
 * a lista completa fica logo abaixo para a escolha manual.
 *
 * Duas formas de mandar: "Atribuir" espera o mecânico aceitar no app;
 * "Escalar direto" é para quando a central já combinou por telefone — o
 * chamado vai direto para "a caminho".
 */
export function Despacho({
  chamado,
  modo,
  nomeMecanicoAtual,
  aoDespachar,
}: {
  chamado: ChamadoSOS
  modo: 'manual' | 'inteligente' | undefined
  nomeMecanicoAtual?: string | null
  /** Depois de atribuir ou escalar com sucesso (ex.: fechar o atalho de despacho do mapa). */
  aoDespachar?: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [verTodos, setVerTodos] = useState(false)
  const [escalando, setEscalando] = useState<SugestaoMecanico | null>(null)

  const sugestoes = useQuery({
    queryKey: CHAVES_SOS.sugestoes(chamado.id),
    staleTime: 20_000,
    queryFn: () => sosSugerirMecanicos(chamado.id),
  })

  const atribuir = useMutation({
    mutationFn: (p: { mecanico: SugestaoMecanico; confirmar: boolean }) => sosAtribuir(chamado.id, p.mecanico.usuario_id, p.confirmar),
    onSuccess: (_r, p) => {
      setEscalando(null)
      const nome = p.mecanico.nome.split(' ')[0]
      if (p.confirmar) toast.ok(`${nome} está a caminho`, 'O cliente já vê o mecânico no app.')
      else toast.ok(`Chamado enviado para ${nome}`, 'Aguardando o aceite no app do mecânico.')
      invalidarSOS(qc, chamado.id)
      aoDespachar?.()
    },
    onError: (e) => toast.erro('Não foi possível despachar', mensagemErro(e)),
  })

  const lista = sugestoes.data ?? []
  const recomendado = lista.find((s) => s.disponivel && s.aceita_sos && !s.recusou && s.usuario_id !== chamado.mecanico_id) ?? null
  const demais = lista.filter((s) => s.usuario_id !== recomendado?.usuario_id)
  const visiveis = verTodos ? demais : demais.slice(0, 4)
  const esperandoAceite = aguardando(chamado.status) && !!chamado.mecanico_id

  return (
    <div className="flex flex-col gap-3">
      {esperandoAceite && (
        <div className="flex items-start gap-3 rounded-lg border border-warn/35 bg-warn-soft px-3.5 py-3">
          <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[13px] leading-relaxed text-ink-2">
            Aguardando o aceite de <strong className="text-ink">{nomeMecanicoAtual ?? 'mecânico'}</strong>
            {chamado.atribuido_em ? ` · enviado ${haQuanto(chamado.atribuido_em)}` : ''}. Se ele confirmou por telefone, escale direto; se não
            responde, envie a outro.
          </p>
        </div>
      )}

      {!esperandoAceite && aguardando(chamado.status) && (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {modo === 'inteligente'
            ? 'Distribuição inteligente: os mecânicos disponíveis já foram avisados. Atribua para direcionar a um só.'
            : 'Distribuição manual: escolha quem vai atender.'}
        </p>
      )}

      {sugestoes.isLoading && (
        <div className="flex flex-col gap-2" role="status" aria-label="Calculando sugestões">
          <Esqueleto className="h-[132px] rounded-xl" />
          <Esqueleto className="h-14 rounded-lg" />
          <Esqueleto className="h-14 rounded-lg" />
        </div>
      )}

      {sugestoes.isError && <ErroSOS erro={sugestoes.error} aoTentarNovamente={() => void sugestoes.refetch()} compacto />}

      {sugestoes.isSuccess && lista.length === 0 && (
        <EstadoVazio
          compacto
          titulo="Nenhum mecânico no SOS"
          descricao="Marque a função como mecânica em Cadastros › Funções e peça aos mecânicos para entrar no app do SOS."
        />
      )}

      {sugestoes.isSuccess && lista.length > 0 && !recomendado && (
        <p className="rounded-lg border border-dashed border-crit/40 bg-crit-soft/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-crit-ink">
          Nenhum mecânico disponível agora. Escolha abaixo quem pode sair — em pausa ou terminando outro atendimento.
        </p>
      )}

      {recomendado && (
        <div className="relative overflow-hidden rounded-xl border border-accent/45 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 shadow-e1">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
          <p className="flex items-center gap-1.5 font-display text-[10.5px] font-semibold tracking-[0.14em] text-accent-ink uppercase">
            <Sparkles aria-hidden className="size-3.5" /> Mecânico recomendado
          </p>
          <div className="mt-2.5 flex min-w-0 items-start gap-3">
            <Avatar nome={recomendado.nome} url={recomendado.avatar_url} tamanho="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate font-display text-[17px] leading-tight font-semibold text-ink">{recomendado.nome}</p>
              <p className="text-[13px] text-ink-2">
                <DistanciaEta s={recomendado} />
                {recomendado.especialidades && (
                  <>
                    {' · '}
                    <span className={cn(recomendado.afinidade && 'font-semibold text-ink')}>Especialidade: {recomendado.especialidades}</span>
                  </>
                )}
              </p>
              <Etiquetas s={recomendado} />
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Botao
              variante="primario"
              iconeInicio={<UserCheck />}
              carregando={atribuir.isPending && atribuir.variables?.mecanico.usuario_id === recomendado.usuario_id && !atribuir.variables.confirmar}
              disabled={atribuir.isPending}
              onClick={() => atribuir.mutate({ mecanico: recomendado, confirmar: false })}
              className="h-11 whitespace-normal"
            >
              Atribuir (aguardar aceite)
            </Botao>
            <Botao variante="secundario" iconeInicio={<PhoneForwarded />} disabled={atribuir.isPending} onClick={() => setEscalando(recomendado)} className="h-11 whitespace-normal">
              Escalar direto
            </Botao>
          </div>
        </div>
      )}

      {demais.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="lbl px-0.5">{recomendado ? 'Outros mecânicos' : 'Mecânicos'}</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {visiveis.map((s) => {
              const atual = s.usuario_id === chamado.mecanico_id
              return (
                <li key={s.usuario_id} className={cn('flex flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center', atual && 'bg-cyan-soft/40')}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative">
                      <Avatar nome={s.nome} url={s.avatar_url} tamanho="sm" />
                      <span
                        aria-hidden
                        className={cn('absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface', SITUACOES_MECANICO[s.situacao].ponto)}
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{s.nome}</span>
                        {atual && <Selo tom="info">Atual</Selo>}
                      </span>
                      <span className="truncate text-[12px] text-ink-3">
                        {SITUACOES_MECANICO[s.situacao].rotulo} · <DistanciaEta s={s} />
                        {s.especialidades ? ` · ${s.especialidades}` : ''}
                      </span>
                      <Etiquetas s={s} discreto />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
                    {!atual && (
                      <Botao
                        tamanho="sm"
                        variante="neutro"
                        carregando={atribuir.isPending && atribuir.variables?.mecanico.usuario_id === s.usuario_id && !atribuir.variables.confirmar}
                        disabled={atribuir.isPending}
                        onClick={() => atribuir.mutate({ mecanico: s, confirmar: false })}
                        className="h-11 flex-1 sm:h-9 sm:flex-none"
                      >
                        Atribuir
                      </Botao>
                    )}
                    <Botao tamanho="sm" variante="secundario" disabled={atribuir.isPending} onClick={() => setEscalando(s)} className="h-11 flex-1 sm:h-9 sm:flex-none">
                      Escalar
                    </Botao>
                  </div>
                </li>
              )
            })}
          </ul>
          {demais.length > 4 && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {verTodos ? 'Mostrar menos' : `Ver todos os ${demais.length} mecânicos`}
              <ChevronDown aria-hidden className={cn('size-4 transition-transform', verTodos && 'rotate-180')} />
            </button>
          )}
        </div>
      )}

      <Confirmacao
        aberto={!!escalando}
        aoFechar={() => setEscalando(null)}
        aoConfirmar={() => escalando && atribuir.mutate({ mecanico: escalando, confirmar: true })}
        carregando={atribuir.isPending}
        titulo={`Escalar ${escalando?.nome.split(' ')[0] ?? 'mecânico'} direto?`}
        rotuloConfirmar="Escalar agora"
        descricao={
          <>
            Use quando você <strong>já avisou o mecânico por telefone</strong>. O chamado pula o aceite e vai direto para “a caminho” — o
            cliente passa a ver o mecânico no app imediatamente.
          </>
        }
      />
    </div>
  )
}

function DistanciaEta({ s }: { s: SugestaoMecanico }) {
  if (s.distancia_km == null) return <span className="text-ink-3">sem posição recente</span>
  return (
    <span className="num">
      {formatarDistancia(Number(s.distancia_km))} · ~{formatarEta(s.eta_min)}
    </span>
  )
}

function Etiquetas({ s, discreto }: { s: SugestaoMecanico; discreto?: boolean }) {
  const itens: Array<{ rotulo: string; tom: 'ok' | 'atencao' | 'critico' | 'info' | 'neutro'; icone?: 'selo' | 'estrela' }> = []
  if (s.afinidade) itens.push({ rotulo: 'Especialista no problema', tom: 'ok', icone: 'selo' })
  if (s.nota_media != null) itens.push({ rotulo: Number(s.nota_media).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), tom: 'neutro', icone: 'estrela' })
  if (!discreto || s.atendimentos_hoje > 0) itens.push({ rotulo: `${s.atendimentos_hoje} hoje`, tom: 'neutro' })
  if (s.em_atendimento) itens.push({ rotulo: 'Em outro atendimento', tom: 'info' })
  if (s.recusou) itens.push({ rotulo: 'Recusou este chamado', tom: 'critico' })
  if (!s.aceita_sos) itens.push({ rotulo: 'Não recebe SOS', tom: 'atencao' })
  if (!itens.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {itens.map((i) => (
        <Selo key={i.rotulo} tom={i.tom} className="gap-1 px-2 py-0 text-[10.5px]">
          {i.icone === 'selo' && <BadgeCheck aria-hidden className="size-3" />}
          {i.icone === 'estrela' && <Star aria-hidden className="size-3 fill-[#f5a524] text-[#f5a524]" />}
          {i.rotulo}
        </Selo>
      ))}
    </div>
  )
}
