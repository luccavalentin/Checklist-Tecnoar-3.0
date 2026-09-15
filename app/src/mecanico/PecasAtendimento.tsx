import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, MapPin, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { vibrarAlerta } from '@/sos/alerta'
import { GaleriaAnexos } from '@/sos/componentes'
import { enderecoDoPonto, formatarCoordenadas, linkVerNoMapa, pontoDe, posicaoAtual, type LeituraGPS, type Ponto } from '@/sos/geo'
import { OCORRENCIAS, ROTULO_TIPO_VEICULO, linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import type { DetalheChamado, StatusSOS } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { ConversaCampo } from './ConversaCampo'
import { primeiroNome } from './dados'
import { enviarAcao, type ResultadoFila } from './filaOffline'
import { IconeOcorrencia, Placa } from './pecas'
import { CartaoM, FolhaM, RotuloM } from './ui'

/**
 * Peças da tela de atendimento, usadas no deslocamento e no serviço.
 */

/**
 * Avança a etapa do chamado com a posição do momento. O "cheguei" com GPS é
 * o que a central usa para conferir a chegada; sem GPS vai a última leitura.
 *
 * Passa pela fila do aparelho: sem sinal, a etapa fica guardada, a tela já
 * segue para a próxima e o envio acontece sozinho quando a internet voltar.
 * Erro de verdade (ex.: orçamento não aprovado) volta na hora para a tela.
 */
export function useAvancar(chamadoId: string) {
  const toast = useToast()
  const [isPending, setPendente] = useState(false)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => void (vivo.current = false)
  }, [])

  const mutate = useCallback(
    async (
      p: { status: StatusSOS; reserva?: LeituraGPS | null; dados?: Record<string, unknown> },
      cb: { onSuccess?: (r: ResultadoFila) => void; onError?: (e: Error) => void; onSettled?: () => void } = {},
    ) => {
      setPendente(true)
      let ponto: Ponto | null = p.reserva ? { lat: p.reserva.lat, lng: p.reserva.lng } : null
      try {
        // Sem internet o GPS ainda funciona (só demora mais para achar).
        const l = await posicaoAtual({ timeoutMs: 5000, maxIdadeMs: 15_000 })
        ponto = { lat: l.lat, lng: l.lng }
      } catch {
        /* segue com a última leitura do rastreio */
      }
      try {
        const r = await enviarAcao({ tipo: 'avancar', chamadoId, status: p.status, lat: ponto?.lat ?? null, lng: ponto?.lng ?? null, dados: p.dados })
        vibrarAlerta('aviso')
        if (r === 'na_fila') toast.atencao('Sem sinal agora', 'Ficou guardado no aparelho e envia sozinho quando a internet voltar.')
        cb.onSuccess?.(r)
      } catch (e) {
        const erro = e instanceof Error ? e : new Error(String(e))
        if (cb.onError) cb.onError(erro)
        else toast.erro('Não foi possível avançar', erro.message)
      } finally {
        if (vivo.current) setPendente(false)
        cb.onSettled?.()
      }
    },
    [chamadoId, toast],
  )

  return { mutate, isPending }
}

export function telefoneCliente(d: DetalheChamado): string | null {
  return d.cliente?.telefone ?? d.chamado.telefone_contato ?? null
}

export function mensagensNaoLidas(d: DetalheChamado, meuId: string | null): number {
  return d.mensagens.filter((m) => m.autor_id !== meuId && m.autor_papel !== 'mecanico' && !m.lida_em).length
}

export function descricaoVeiculo(d: DetalheChamado): string | null {
  const v = d.veiculo
  if (!v) return null
  return [[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao, v.ano ? String(v.ano) : null].filter(Boolean).join(' · ') || null
}

/** Só marca e modelo ("Scania R450") — o título do veículo nas telas. */
export function modeloVeiculo(d: DetalheChamado): string | null {
  const v = d.veiculo
  if (!v) return null
  return [v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || null
}

/** Ligar · WhatsApp · Chat — três alvos grandes, lado a lado. */
export function AtalhosContato({ d, aoConversa }: { d: DetalheChamado; aoConversa: () => void }) {
  const { usuarioId, perfil } = useMecanico()
  const tel = telefoneCliente(d)
  const naoLidas = mensagensNaoLidas(d, usuarioId)
  const texto = `Olá! Aqui é ${primeiroNome(perfil.nome)}, mecânico da Tecnoar, sobre o seu SOS ${d.chamado.protocolo}.`
  return (
    <div className="grid grid-cols-3 gap-2">
      <Atalho icone={Phone} rotulo="Ligar" href={linkTelefone(tel)} />
      <Atalho icone={MessageCircle} rotulo="Chat" onClick={aoConversa} contador={naoLidas} />
      <Atalho icone={WhatsIcone} rotulo="WhatsApp" href={linkWhatsApp(tel, texto)} />
    </div>
  )
}

function Atalho({
  icone: Icone,
  rotulo,
  href,
  onClick,
  contador,
}: {
  icone: LucideIcon | typeof WhatsIcone
  rotulo: string
  href?: string | null
  onClick?: () => void
  contador?: number
}) {
  const cls = cn(
    'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface-2 px-1 text-[12.5px] font-bold text-ink transition-transform active:scale-[0.97] min-[420px]:min-h-12 min-[420px]:flex-row min-[420px]:gap-2 min-[420px]:text-[13.5px]',
    !href && !onClick && 'pointer-events-none opacity-40',
  )
  const conteudo = (
    <>
      <Icone className={cn('size-5 shrink-0', rotulo === 'WhatsApp' ? 'text-[#25d366]' : 'text-accent-ink')} />
      <span className="truncate">{rotulo}</span>
      {!!contador && (
        <span className="num absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-[#ff6600] px-1 text-[11px] leading-5 font-bold text-white ring-2 ring-surface">
          {contador}
        </span>
      )}
    </>
  )
  if (href)
    return (
      <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" aria-label={rotulo === 'Ligar' ? 'Ligar para o cliente' : `${rotulo} do cliente`}>
        {conteudo}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={contador ? `Chat, ${contador} mensagens novas` : 'Chat com o cliente'}>
      {conteudo}
    </button>
  )
}

/** O ícone do WhatsApp não existe no lucide; um balão simples resolve. */
function WhatsIcone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" />
    </svg>
  )
}

/** Conversa com o cliente numa folha — sobe por cima do mapa ou do serviço. */
export function FolhaConversa({ aberta, aoFechar, d }: { aberta: boolean; aoFechar: () => void; d: DetalheChamado }) {
  return (
    <FolhaM aberta={aberta} aoFechar={aoFechar} titulo={`Chat com ${primeiroNome(d.cliente?.nome ?? 'o cliente')}`} descricao="O cliente recebe um aviso a cada mensagem.">
      <ConversaCampo d={d} />
    </FolhaM>
  )
}

/** Cabeçalho do chamado: problema, cliente, placa e veículo. */
export function ResumoChamado({ d, children }: { d: DetalheChamado; children?: ReactNode }) {
  const c = d.chamado
  const veiculo = modeloVeiculo(d)
  return (
    <div className="flex items-center gap-3">
      <IconeOcorrencia tipo={c.tipo_ocorrencia} prioridade={c.prioridade} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-[17px] leading-tight font-bold text-ink">{d.cliente?.nome ?? 'Cliente'}</p>
        <p className="truncate text-[13.5px] text-ink-2">
          {c.ocorrencia_rotulo ?? OCORRENCIAS[c.tipo_ocorrencia]?.rotulo}
          {veiculo ? ` · ${veiculo}` : ''}
        </p>
      </div>
      <Placa placa={d.veiculo?.placa} />
      {children}
    </div>
  )
}

/** Ficha do veículo: modelo grande, placa, tipo, ano e km. */
export function FichaVeiculo({ d }: { d: DetalheChamado }) {
  const v = d.veiculo
  if (!v) return null
  const linha = [v.tipo ? ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo : null, v.ano ? String(v.ano) : null, v.km_atual ? `${v.km_atual.toLocaleString('pt-BR')} km` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-display text-[20px] leading-tight font-extrabold text-ink">{modeloVeiculo(d) ?? 'Veículo'}</p>
        <Placa placa={v.placa} tamanho="lg" />
      </div>
      {linha && <p className="num text-[13px] text-ink-3">{linha}</p>}
    </div>
  )
}

/** Local do cliente, com copiar e abrir no mapa. */
export function LocalCliente({ d }: { d: DetalheChamado }) {
  const toast = useToast()
  const c = d.chamado
  const ponto = pontoDe(c)
  const endereco = useQuery({
    queryKey: ['sos', 'endereco', ponto?.lat.toFixed(4), ponto?.lng.toFixed(4)],
    enabled: !!ponto && !c.endereco,
    staleTime: Infinity,
    retry: false,
    queryFn: () => enderecoDoPonto(ponto as Ponto),
  })
  const local = c.endereco ?? endereco.data ?? null

  async function copiar() {
    if (!ponto) return
    try {
      await navigator.clipboard.writeText(`${ponto.lat},${ponto.lng}`)
      toast.ok('Coordenadas copiadas')
    } catch {
      toast.atencao('Não foi possível copiar', formatarCoordenadas(ponto))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-ink">{local ?? (ponto ? 'Buscando o endereço…' : 'Sem localização informada')}</p>
          {ponto && (
            <p className="num mt-1 text-[12px] text-ink-3">
              {formatarCoordenadas(ponto)}
              {c.precisao_m ? ` · ±${Math.round(c.precisao_m)} m` : ''}
              {c.ponto_ajustado ? ' · marcado no mapa' : ''}
            </p>
          )}
        </div>
      </div>
      {ponto && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copiar()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 text-[14px] font-semibold text-ink">
            <Copy className="size-4" /> Copiar
          </button>
          <a href={linkVerNoMapa(ponto)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 text-[14px] font-semibold text-ink">
            <MapPin className="size-4" /> Ver no mapa
          </a>
        </div>
      )}
    </div>
  )
}

/** Fotos, áudios e vídeos que o cliente mandou ao pedir o SOS. */
export function fotosDoCliente(d: DetalheChamado) {
  return d.anexos.filter((a) => a.autor_papel === 'cliente' || a.etapa === 'abertura')
}

/** Problema relatado pelo cliente, com as fotos e áudios que ele mandou. */
export function ProblemaRelatado({ d, fotos = true }: { d: DetalheChamado; fotos?: boolean }) {
  const c = d.chamado
  const doCliente = fotos ? fotosDoCliente(d) : []
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[18px] leading-tight font-bold text-ink">{c.ocorrencia_rotulo}</p>
      {c.descricao ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">“{c.descricao}”</p>
      ) : (
        <p className="text-[13.5px] text-ink-3">O cliente não escreveu uma descrição.</p>
      )}
      {doCliente.length > 0 && (
        <div className="mt-1">
          <GaleriaAnexos anexos={doCliente} chamadoId={c.id} />
        </div>
      )}
    </div>
  )
}

/** Detalhes que o mecânico consulta parado: relato, veículo, local. */
export function DetalhesChamado({ d }: { d: DetalheChamado }) {
  return (
    <div className="flex flex-col gap-3">
      <CartaoM>
        <RotuloM className="mb-2">Problema informado</RotuloM>
        <ProblemaRelatado d={d} />
      </CartaoM>
      {d.veiculo && (
        <CartaoM>
          <RotuloM className="mb-2">Veículo</RotuloM>
          <FichaVeiculo d={d} />
        </CartaoM>
      )}
      <CartaoM>
        <RotuloM className="mb-2">Local do cliente</RotuloM>
        <LocalCliente d={d} />
      </CartaoM>
    </div>
  )
}
