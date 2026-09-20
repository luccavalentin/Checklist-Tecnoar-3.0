import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, ExternalLink, Gauge, LifeBuoy, Lock, Package, Phone, RefreshCw, Trash2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosOSAlterarItem, sosOSAtualizar } from '@/sos/api'
import { quantidadeBR, textoDisponivel } from '@/sos/estoque'
import { STATUS_SOS, dataHoraCurta, formatarPlacaExibicao, linkTelefone } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { DetalheOSApp, EstadoPecaOS, ItemCatalogo, ProdutoOSApp, ServicoOSApp } from '@/sos/tipos'
import { Catalogo, Contador, classeDisponivel } from '../Catalogo'
import { useOnline } from '../dados'
import { Placa } from '../pecas'
import { AreaM, BotaoM, CampoM, CartaoM, EsqueletoM, FolhaM, RotuloM, SecaoM, SeloM, TelaM, TopoM, type TomSelo } from '../ui'
import { CHAVES_OS, invalidarDepoisDeLancar, linkOSNoSistema, rotuloProtocolo, tomStatusOS, useDetalheOS, type DestinoLancamento } from './dados'
import { FolhaLancar } from './FolhaLancar'

type TipoItem = 'produto' | 'servico'

/**
 * Uma OS do sistema Tecnoar no app: a mesma do Checklist. Peças com o estado
 * do estoque (reservada, sem estoque, utilizada), serviços, totais, km,
 * diagnóstico e observações. Tudo o que muda aqui muda lá.
 */
export function DetalheOS() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const local = useLocation()
  const detalhe = useDetalheOS(id)
  const d = detalhe.data

  const bruto = params.get('adicionar')
  const adicionando: TipoItem | null = bruto === 'produto' || bruto === 'servico' ? bruto : null
  const empilhada = !!(local.state as { sub?: boolean } | null)?.sub

  const abrirAdicionar = useCallback((t: TipoItem) => navegar({ search: `?adicionar=${t}` }, { state: { sub: true } }), [navegar])
  const fecharAdicionar = useCallback(() => {
    // Aberta por toque aqui dentro: volta no histórico (o "voltar" do aparelho faz o mesmo).
    if (empilhada) navegar(-1)
    else {
      const p = new URLSearchParams(params)
      p.delete('adicionar')
      setParams(p, { replace: true })
    }
  }, [empilhada, navegar, params, setParams])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [adicionando])

  if (adicionando && d?.pode_editar) return <TelaAdicionar d={d} tipo={adicionando} aoFechar={fecharAdicionar} />

  return (
    <>
      <TopoM
        voltar
        sobretitulo="Ordem de serviço"
        titulo={d ? `OS nº ${d.os.numero}` : 'OS'}
        sub={d?.cliente?.nome ?? undefined}
        acao={
          <button
            type="button"
            aria-label="Atualizar"
            onClick={() => void detalhe.refetch()}
            disabled={detalhe.isFetching}
            className="sos-icon-button flex size-12 items-center justify-center rounded-full text-ink-2 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-5', detalhe.isFetching && 'animate-spin')} />
          </button>
        }
      />
      <TelaM>
        {detalhe.isError && !d ? (
          <div className="sos-native-card flex flex-col items-center gap-3 rounded-[1.55rem] px-5 py-8 text-center">
            <span className="sos-subtle-chip flex size-14 items-center justify-center rounded-2xl text-crit-ink">
              <AlertTriangle className="size-7" />
            </span>
            <p className="font-display text-[17px] font-bold text-ink">Não foi possível abrir a OS</p>
            <p className="max-w-xs text-[14px] leading-relaxed text-ink-2">{(detalhe.error as Error).message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <BotaoM variante="escuro" icone={RefreshCw} carregando={detalhe.isFetching} onClick={() => void detalhe.refetch()}>
                Tentar de novo
              </BotaoM>
              <BotaoM variante="neutro" onClick={() => navegar('/os')}>
                Minhas OS
              </BotaoM>
            </div>
          </div>
        ) : !d ? (
          <div className="flex flex-col gap-3">
            <EsqueletoM className="h-44 rounded-[1.25rem]" />
            <EsqueletoM className="h-28 rounded-[1.25rem]" />
            <EsqueletoM className="h-28 rounded-[1.25rem]" />
          </div>
        ) : (
          <ConteudoOS d={d} aoAdicionar={abrirAdicionar} />
        )}
      </TelaM>
    </>
  )
}

/* ── conteúdo ───────────────────────────────────────────────────────────── */

function ConteudoOS({ d, aoAdicionar }: { d: DetalheOSApp; aoAdicionar: (t: TipoItem) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const online = useOnline()
  const [emVoo, setEmVoo] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState<{ id: string; descricao: string } | null>(null)
  const os = d.os
  const editavel = d.pode_editar && online
  const semEstoque = d.produtos.filter((p) => p.estado === 'necessario').length
  const telefone = linkTelefone(d.cliente?.telefone)
  const socorroAberto = !!d.chamado && d.chamado.status !== 'concluido' && d.chamado.status !== 'cancelado'

  const alterar = useMutation({
    mutationFn: (p: { itemId: string; quantidade: number }) => sosOSAlterarItem(os.id, p.itemId, p.quantidade),
    onMutate: (p) => setEmVoo(p.itemId),
    onSuccess: (_r, p) => {
      if (p.quantidade <= 0) toast.ok('Item removido da OS')
      invalidarDepoisDeLancar(qc, { osId: os.id, chamadoId: d.chamado?.id ?? null })
    },
    onError: (e) => toast.erro('Não foi possível alterar', (e as Error).message),
    onSettled: () => {
      setEmVoo(null)
      setRemovendo(null)
    },
  })

  function mudarQuantidade(item: { id: string; descricao: string }, q: number) {
    if (q <= 0) setRemovendo(item)
    else alterar.mutate({ itemId: item.id, quantidade: Math.round(q * 1000) / 1000 })
  }

  const somaProdutos = d.produtos.reduce((s, p) => s + Number(p.valor_total ?? Number(p.quantidade) * Number(p.valor_unitario)), 0)
  const somaServicos = d.servicos.reduce((s, p) => s + Number(p.valor_total ?? Number(p.quantidade) * Number(p.valor_unitario)), 0)
  const valorProdutos = os.valor_produtos != null ? Number(os.valor_produtos) : somaProdutos
  const valorServicos = os.valor_servicos != null ? Number(os.valor_servicos) : somaServicos
  const desconto = Number(os.desconto ?? 0)
  const acrescimo = Number(os.acrescimo ?? 0)
  const total = os.valor_total != null ? Number(os.valor_total) : valorProdutos + valorServicos - desconto + acrescimo
  const veiculoNome = d.veiculo ? [d.veiculo.marca, d.veiculo.modelo, d.veiculo.ano].filter(Boolean).join(' ') : null
  const km = os.km ?? d.veiculo?.km_atual ?? null

  return (
    <>
      {/* cabeçalho: status, cliente, veículo */}
      <CartaoM className="flex flex-col gap-3.5 rounded-[1.75rem] p-[1.1rem]">
        <div className="flex flex-wrap items-center gap-2">
          {os.status && (
            <SeloM tom={tomStatusOS(os.status.cor)} ponto className="max-w-full min-w-0">
              <span className="min-w-0 truncate">{os.status.nome}</span>
            </SeloM>
          )}
          <span className="num text-[12.5px] text-ink-3">
            {os.encerrada_em ? `Encerrada ${dataHoraCurta(os.encerrada_em)}` : `Aberta ${dataHoraCurta(os.aberta_em)}`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <RotuloM>Cliente</RotuloM>
            <p className="mt-0.5 font-display text-[19px] leading-tight font-extrabold break-words text-ink">{d.cliente?.nome ?? '—'}</p>
            {d.cliente?.telefone && <p className="num mt-0.5 text-[13.5px] text-ink-2">{d.cliente.telefone}</p>}
          </div>
          {telefone && (
            <a
              href={telefone}
              aria-label={`Ligar para ${d.cliente?.nome ?? 'o cliente'}`}
              className="sos-operator-action flex size-14 shrink-0 items-center justify-center rounded-2xl text-[#0D1C33] active:bg-[#009bd6]"
            >
              <Phone className="size-6" />
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3.5">
          <Placa placa={d.veiculo?.placa} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">{veiculoNome || 'Veículo'}</p>
            <p className="num flex items-center gap-1 text-[13px] text-ink-3">
              <Gauge className="size-3.5" /> {km != null ? `${Number(km).toLocaleString('pt-BR')} km` : 'km não informado'}
            </p>
          </div>
        </div>

        {os.problema && (
          <div className="border-t border-line pt-3.5">
            <RotuloM>Problema relatado</RotuloM>
            <p className="mt-1 text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{os.problema}</p>
          </div>
        )}
      </CartaoM>

      {d.chamado && (
        <button
          type="button"
          onClick={() => navegar(`/chamado/${d.chamado?.id}`)}
          className="sos-premium-row sos-native-card flex min-h-16 w-full items-center gap-3 rounded-[1.55rem] px-4 py-3 text-left"
        >
          <span className="sos-subtle-chip flex size-11 shrink-0 items-center justify-center rounded-2xl text-cyan-ink">
            <LifeBuoy className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[16px] font-extrabold text-ink">Abrir atendimento</span>
            <span className="num block truncate text-[13px] text-ink-2">{rotuloProtocolo(d.chamado.protocolo)}</span>
            <span className="block truncate text-[12.5px] text-ink-3">Socorro · {STATUS_SOS[d.chamado.status]?.curto ?? d.chamado.status}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" />
        </button>
      )}

      {!d.pode_editar && (
        <p className="sos-native-card flex items-start gap-2 rounded-2xl px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {os.encerrada_em ? 'OS encerrada: só consulta.' : 'Você pode consultar esta OS, mas não alterar.'}
        </p>
      )}
      {d.pode_editar && !online && (
        <p className="sos-native-card rounded-2xl px-3.5 py-2.5 text-[13.5px] font-medium text-warn-ink">Sem internet: para alterar a OS, espere o sinal voltar.</p>
      )}

      {semEstoque > 0 && (
        <p className="sos-native-card flex items-start gap-2 rounded-2xl px-3.5 py-3 text-[13.5px] leading-snug font-semibold text-crit-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {semEstoque} {semEstoque === 1 ? 'peça sem estoque' : 'peças sem estoque'} — a central foi avisada.
        </p>
      )}

      {/* peças */}
      <SecaoM titulo={`Peças · ${d.produtos.length}`} acao={<span className="num text-[15px] font-bold text-ink">{moeda(valorProdutos)}</span>}>
        {d.produtos.length === 0 ? (
          <p className="sos-native-card rounded-[1.55rem] border-dashed px-4 py-4 text-center text-[14px] text-ink-3">Nenhuma peça lançada.</p>
        ) : (
          <ul className="sos-premium-list flex flex-col divide-y divide-line">
            {d.produtos.map((p) => (
              <LinhaItem
                key={p.id}
                item={p}
                tipo="produto"
                editavel={editavel}
                carregando={emVoo === p.id}
                ocupado={alterar.isPending}
                aoMudar={(q) => mudarQuantidade(p, q)}
                aoRemover={() => setRemovendo(p)}
              />
            ))}
          </ul>
        )}
        {d.pode_editar && (
          <BotaoM variante="neutro" tamanho="lg" largo icone={Package} disabled={!online} onClick={() => aoAdicionar('produto')}>
            Adicionar peça
          </BotaoM>
        )}
      </SecaoM>

      {/* serviços */}
      <SecaoM titulo={`Serviços · ${d.servicos.length}`} acao={<span className="num text-[15px] font-bold text-ink">{moeda(valorServicos)}</span>}>
        {d.servicos.length === 0 ? (
          <p className="sos-native-card rounded-[1.55rem] border-dashed px-4 py-4 text-center text-[14px] text-ink-3">Nenhum serviço lançado.</p>
        ) : (
          <ul className="sos-premium-list flex flex-col divide-y divide-line">
            {d.servicos.map((s) => (
              <LinhaItem
                key={s.id}
                item={s}
                tipo="servico"
                editavel={editavel}
                carregando={emVoo === s.id}
                ocupado={alterar.isPending}
                aoMudar={(q) => mudarQuantidade(s, q)}
                aoRemover={() => setRemovendo(s)}
              />
            ))}
          </ul>
        )}
        {d.pode_editar && (
          <BotaoM variante="neutro" tamanho="lg" largo icone={Wrench} disabled={!online} onClick={() => aoAdicionar('servico')}>
            Adicionar serviço
          </BotaoM>
        )}
      </SecaoM>

      {/* totais */}
      <CartaoM className="flex flex-col gap-1.5 rounded-[1.55rem]">
        <LinhaTotal rotulo="Peças" valor={moeda(valorProdutos)} />
        <LinhaTotal rotulo="Serviços" valor={moeda(valorServicos)} />
        {desconto > 0 && <LinhaTotal rotulo="Desconto" valor={`− ${moeda(desconto)}`} />}
        {acrescimo > 0 && <LinhaTotal rotulo="Acréscimo" valor={`+ ${moeda(acrescimo)}`} />}
        <div className="mt-1.5 flex items-end justify-between gap-3 border-t border-line pt-3">
          <RotuloM>Total da OS</RotuloM>
          <span className="num text-[28px] leading-none font-semibold tracking-tight text-ink">{moeda(total)}</span>
        </div>
      </CartaoM>

      {/* km, diagnóstico e observações */}
      {d.pode_editar ? (
        <DadosOS key={os.id} d={d} socorroAberto={socorroAberto} />
      ) : (
        (os.diagnostico || os.observacoes) && (
          <SecaoM titulo="Registro">
            <CartaoM className="flex flex-col gap-3">
              {os.diagnostico && <TextoLido rotulo="Diagnóstico" texto={os.diagnostico} />}
              {os.observacoes && <TextoLido rotulo="Observações" texto={os.observacoes} />}
            </CartaoM>
          </SecaoM>
        )
      )}

      <a
        href={linkOSNoSistema(os.id)}
        target="_blank"
        rel="noreferrer"
        className="sos-action-link flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 font-display text-[15px] font-semibold text-ink active:bg-line"
      >
        <ExternalLink className="size-4" /> Abrir no sistema Tecnoar
      </a>

      <FolhaM
        aberta={!!removendo}
        aoFechar={() => !alterar.isPending && setRemovendo(null)}
        titulo="Remover da OS?"
        descricao={removendo?.descricao}
        rodape={
          <>
            <BotaoM
              variante="vermelho"
              tamanho="xl"
              largo
              icone={Trash2}
              carregando={alterar.isPending}
              disabled={!online}
              onClick={() => removendo && alterar.mutate({ itemId: removendo.id, quantidade: 0 })}
            >
              Remover
            </BotaoM>
            <BotaoM variante="neutro" tamanho="lg" largo disabled={alterar.isPending} onClick={() => setRemovendo(null)}>
              Cancelar
            </BotaoM>
          </>
        }
      />
    </>
  )
}

/* ── itens ──────────────────────────────────────────────────────────────── */

const ESTADO_PECA: Record<string, { tom: TomSelo; texto: string }> = {
  reservado: { tom: 'ok', texto: 'Reservada no estoque' },
  necessario: { tom: 'vermelho', texto: 'Sem estoque — central avisada' },
  utilizado: { tom: 'neutro', texto: 'Utilizada' },
  solicitado: { tom: 'ambar', texto: 'Solicitada' },
}

function seloEstado(estado: EstadoPecaOS | null | undefined) {
  if (!estado) return null
  return ESTADO_PECA[estado] ?? { tom: 'neutro' as TomSelo, texto: String(estado) }
}

function LinhaItem({
  item,
  tipo,
  editavel,
  carregando,
  ocupado,
  aoMudar,
  aoRemover,
}: {
  item: ProdutoOSApp | ServicoOSApp
  tipo: TipoItem
  editavel: boolean
  carregando: boolean
  ocupado: boolean
  aoMudar: (q: number) => void
  aoRemover: () => void
}) {
  const produto = tipo === 'produto' ? (item as ProdutoOSApp) : null
  const selo = produto ? seloEstado(produto.estado) : null
  const disponivel = produto?.disponivel != null ? Number(produto.disponivel) : null
  // Necessária sem estoque já diz tudo no selo; se a peça chegou, o disponível avisa.
  const mostraDisponivel = !!produto && produto.estado !== 'utilizado' && disponivel != null && !(produto.estado === 'necessario' && disponivel <= 0)
  const quantidade = Number(item.quantidade)
  const valorLinha = item.valor_total != null ? Number(item.valor_total) : quantidade * Number(item.valor_unitario)
  const unidade = produto?.unidade ? `/${produto.unidade.toLowerCase()}` : ''
  const recusado = item.aprovacao === 'recusado'

  return (
    <li className={cn('sos-premium-row flex flex-col gap-2 px-3.5 py-3', recusado && 'opacity-70')}>
      <div className="min-w-0">
        <p className="text-[15.5px] leading-snug font-bold text-ink">{item.descricao}</p>
        <p className="num mt-0.5 truncate text-[12.5px] text-ink-3">
          {[item.codigo, `${moeda(Number(item.valor_unitario))}${unidade}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      {(selo || mostraDisponivel || item.do_socorro || recusado) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {selo && <SeloM tom={selo.tom}>{selo.texto}</SeloM>}
          {recusado && <SeloM tom="neutro">Recusada pelo cliente</SeloM>}
          {item.do_socorro && <SeloM tom="ciano">Do socorro</SeloM>}
          {mostraDisponivel && (
            <span className={cn('num text-[12.5px] font-bold', classeDisponivel(disponivel))}>
              {(textoDisponivel(disponivel, produto?.unidade) ?? '').replace('Disponível', 'Disponível agora')}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        {editavel ? (
          <div className="flex items-center gap-1">
            <Contador quantidade={quantidade} carregando={carregando} ocupado={ocupado} aoMudar={aoMudar} />
            <button
              type="button"
              aria-label={`Remover ${item.descricao}`}
              disabled={ocupado}
              onClick={aoRemover}
              className="sos-icon-button flex size-12 items-center justify-center rounded-xl text-ink-3 active:text-crit-ink disabled:opacity-40"
            >
              <Trash2 className="size-5" />
            </button>
          </div>
        ) : (
          <span className="num text-[14px] text-ink-2">× {quantidadeBR(quantidade)}</span>
        )}
        <span className="num shrink-0 text-right text-[16px] font-bold text-ink">{moeda(valorLinha)}</span>
      </div>
    </li>
  )
}

function LinhaTotal({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[14.5px]">
      <span className="text-ink-2">{rotulo}</span>
      <span className="num font-semibold text-ink">{valor}</span>
    </div>
  )
}

function TextoLido({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div>
      <RotuloM>{rotulo}</RotuloM>
      <p className="mt-1 text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{texto}</p>
    </div>
  )
}

/* ── km, diagnóstico e observações ──────────────────────────────────────── */

/**
 * `null` = o mecânico não mexeu: o campo mostra o que está na OS (e segue o
 * banco se outra pessoa mudar). Só vai para o banco o que mudou.
 */
function DadosOS({ d, socorroAberto }: { d: DetalheOSApp; socorroAberto: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const os = d.os
  const [km, setKm] = useState('')
  const [diag, setDiag] = useState<string | null>(null)
  const [obs, setObs] = useState<string | null>(null)

  const kmNum = Number(km.replace(/\D/g, ''))
  const kmAtual = os.km ?? d.veiculo?.km_atual ?? null
  const diagBanco = os.diagnostico ?? ''
  const obsBanco = os.observacoes ?? ''
  const mudouKm = kmNum > 0 && kmNum !== kmAtual
  const mudouDiag = diag != null && diag.trim() !== '' && diag.trim() !== diagBanco.trim()
  const mudouObs = obs != null && obs.trim() !== '' && obs.trim() !== obsBanco.trim()
  const mudou = mudouKm || mudouDiag || mudouObs

  const salvar = useMutation({
    mutationFn: () =>
      sosOSAtualizar(os.id, {
        km: mudouKm ? kmNum : null,
        diagnostico: mudouDiag ? (diag ?? '').trim() : null,
        observacoes: mudouObs ? (obs ?? '').trim() : null,
      }),
    onSuccess: (novo) => {
      qc.setQueryData(CHAVES_OS.detalhe(os.id), novo)
      setKm('')
      setDiag(null)
      setObs(null)
      toast.ok('OS atualizada', 'Salvo no sistema Tecnoar.')
      void qc.invalidateQueries({ queryKey: CHAVES_OS.raiz })
      if (d.chamado) void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(d.chamado.id) })
    },
    onError: (e) => toast.erro('Não foi possível salvar', (e as Error).message),
  })

  const avisoApagar = 'Vazio não apaga o texto da OS — para apagar, use o sistema Tecnoar.'

  return (
    <SecaoM titulo="Dados da OS">
      <CartaoM className="flex flex-col gap-4 rounded-[1.55rem]">
        <CampoM
          rotulo="Quilometragem do painel"
          icone={Gauge}
          inputMode="numeric"
          enterKeyHint="done"
          placeholder={kmAtual != null ? `${Number(kmAtual).toLocaleString('pt-BR')} km agora` : 'km do painel'}
          value={km ? kmNum.toLocaleString('pt-BR') : ''}
          onChange={(e) => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))}
          dica={kmAtual != null ? 'Não pode ser menor que a do cadastro.' : undefined}
        />
        <AreaM
          rotulo="Diagnóstico"
          placeholder="O que você encontrou."
          value={diag ?? diagBanco}
          onChange={(e) => setDiag(e.target.value)}
          maxLength={4000}
          rows={4}
          dica={diag != null && diag.trim() === '' && diagBanco ? avisoApagar : undefined}
        />
        <AreaM
          rotulo="Observações"
          placeholder="Recomendações, pendências, algo para a oficina."
          value={obs ?? obsBanco}
          onChange={(e) => setObs(e.target.value)}
          maxLength={4000}
          rows={4}
          dica={
            obs != null && obs.trim() === '' && obsBanco
              ? avisoApagar
              : socorroAberto
                ? `Com o socorro aberto, o texto vai para o atendimento ${d.chamado ? rotuloProtocolo(d.chamado.protocolo) : ''} e de lá para a OS.`
                : undefined
          }
        />
        <BotaoM variante="laranja" tamanho="lg" largo carregando={salvar.isPending} disabled={!online || !mudou} onClick={() => salvar.mutate()}>
          {mudou ? 'Salvar na OS' : 'Nada para salvar'}
        </BotaoM>
      </CartaoM>
    </SecaoM>
  )
}

/* ── adicionar do catálogo ──────────────────────────────────────────────── */

/** Catálogo do sistema com destino fixo: esta OS. Fica aberto para lançar vários seguidos. */
function TelaAdicionar({ d, tipo, aoFechar }: { d: DetalheOSApp; tipo: TipoItem; aoFechar: () => void }) {
  const [escolhido, setEscolhido] = useState<ItemCatalogo | null>(null)
  const fechar = useCallback(() => setEscolhido(null), [])

  const lancados = useMemo(() => {
    const m = new Map<string, number>()
    const lista: Array<{ ref: string | null; quantidade: number }> =
      tipo === 'produto'
        ? d.produtos.map((p) => ({ ref: p.produto_id, quantidade: Number(p.quantidade) }))
        : d.servicos.map((s) => ({ ref: s.servico_id, quantidade: Number(s.quantidade) }))
    for (const i of lista) if (i.ref) m.set(i.ref, (m.get(i.ref) ?? 0) + i.quantidade)
    return m
  }, [d.produtos, d.servicos, tipo])

  const destinos = useMemo<DestinoLancamento[]>(
    () => [
      {
        tipo: 'os',
        id: d.os.id,
        titulo: `OS nº ${d.os.numero}`,
        sub: [d.cliente?.nome, d.veiculo?.placa ? formatarPlacaExibicao(d.veiculo.placa) : null].filter(Boolean).join(' · '),
        chamadoId: d.chamado?.id ?? null,
      },
    ],
    [d.os.id, d.os.numero, d.cliente?.nome, d.veiculo?.placa, d.chamado?.id],
  )

  return (
    <div className="mec-entra">
      <TopoM
        voltar={aoFechar}
        sobretitulo={`OS nº ${d.os.numero}`}
        titulo={tipo === 'produto' ? 'Adicionar peça' : 'Adicionar serviço'}
        sub="Toque no item para lançar na OS"
      />
      <TelaM>
        <Catalogo tipo={tipo} podeAdicionar={false} aoEscolher={setEscolhido} lancados={lancados} toqueLanca />
      </TelaM>
      <FolhaLancar item={escolhido} aoFechar={fechar} destinos={destinos} />
    </div>
  )
}
