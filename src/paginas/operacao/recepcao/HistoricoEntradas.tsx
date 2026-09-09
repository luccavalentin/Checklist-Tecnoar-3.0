import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { dataHora, tempoRelativo } from '@/lib/utils'
import { numeroBR } from '@/lib/formatos'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { BarraFiltros, type ChipFiltro } from '@/componentes/ui/BarraFiltros'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { termoBusca, useControleListagem, useListagem } from '@/dados/useListagem'
import type { EntradaPatioListada, SituacaoEntrada } from '@/tipos/db'

const SELECT_ENTRADA =
  'id, numero, entrada_em, saida_em, km, km_anterior, km_inconsistente, situacao, ' +
  'cliente_id, veiculo_id, observacoes, condicao_entrada, motorista_nome, ' +
  'cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa, descricao, alerta_operador ), ' +
  'recebido:usuarios!entradas_patio_recebido_por_fkey ( id, nome_completo )'

const ROTULO_SITUACAO: Record<SituacaoEntrada, string> = {
  no_patio: 'No pátio',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

const TOM_SITUACAO: Record<SituacaoEntrada, TomSelo> = {
  no_patio: 'info',
  encerrada: 'ok',
  cancelada: 'neutro',
}

/**
 * Permanência do veículo.
 *
 * Enquanto está no pátio conta a partir de agora; depois de encerrada conta até
 * a saída registrada. Sem isto uma entrada de três meses atrás apareceria como
 * "há 3 meses" mesmo tendo sido encerrada no mesmo dia.
 */
function permanencia(entrada: string, saida: string | null): string {
  const inicio = new Date(entrada).getTime()
  const fim = saida ? new Date(saida).getTime() : Date.now()
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return '—'

  const minutos = Math.max(0, Math.round((fim - inicio) / 60_000))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas}h ${minutos % 60}min`
  const dias = Math.floor(horas / 24)
  return `${dias}d ${horas % 24}h`
}

/**
 * Histórico de entradas no pátio.
 *
 * A Recepção só mostrava o que está no pátio agora. Sem esta consulta não havia
 * como responder "quando este caminhão passou por aqui a última vez?" — a
 * informação existia no banco e não tinha caminho na interface.
 */
export function HistoricoEntradas({ podeVer }: { podeVer: boolean }) {
  const ctrl = useControleListagem(25)
  const [situacao, setSituacao] = useState<'' | SituacaoEntrada>('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const lista = useListagem<EntradaPatioListada>({
    chave: ['entradas', 'historico', ctrl.busca, situacao, de, ate, ctrl.pagina, ctrl.porPagina],
    tabela: 'entradas_patio',
    select: SELECT_ENTRADA,
    habilitado: podeVer,
    ordenacao: { coluna: 'entrada_em', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    filtrar: (q) => {
      let consulta = q
      const termo = termoBusca(ctrl.busca)
      if (termo) {
        /* Número da entrada é inteiro: só entra no `or` quando o termo é
           numérico, senão o PostgREST rejeita a comparação. */
        const partes = [`veiculos.placa.ilike.%${termo}%`, `clientes.nome_razao.ilike.%${termo}%`]
        const soDigitos = termo.replace(/\D/g, '')
        if (soDigitos) partes.push(`numero.eq.${soDigitos}`)
        consulta = consulta.or(partes.join(','))
      }
      if (situacao) consulta = consulta.eq('situacao', situacao)
      if (de) consulta = consulta.gte('entrada_em', new Date(`${de}T00:00:00`).toISOString())
      if (ate) consulta = consulta.lte('entrada_em', new Date(`${ate}T23:59:59`).toISOString())
      return consulta
    },
  })

  const chips = useMemo<ChipFiltro[]>(() => {
    const lista: ChipFiltro[] = []
    if (situacao)
      lista.push({
        id: 'situacao',
        rotulo: ROTULO_SITUACAO[situacao],
        aoRemover: () => {
          setSituacao('')
          ctrl.reiniciar()
        },
      })
    if (de)
      lista.push({
        id: 'de',
        rotulo: `A partir de ${de.split('-').reverse().join('/')}`,
        aoRemover: () => {
          setDe('')
          ctrl.reiniciar()
        },
      })
    if (ate)
      lista.push({
        id: 'ate',
        rotulo: `Até ${ate.split('-').reverse().join('/')}`,
        aoRemover: () => {
          setAte('')
          ctrl.reiniciar()
        },
      })
    return lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao, de, ate])

  /*
   * Prioridade das colunas por largura.
   *
   * Identificação (nº, data, placa, cliente, situação) fica sempre visível; o
   * resto entra conforme sobra espaço. Sem esse escalonamento a tabela passava
   * de 1.180px e rolava na horizontal já em 1024, escondendo justamente a
   * coluna de permanência.
   */
  const colunas: Array<Coluna<EntradaPatioListada>> = [
    {
      chave: 'numero',
      cabecalho: 'Nº',
      largura: '72px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (e) => <span className="num text-ink-2">{String(e.numero).padStart(5, '0')}</span>,
    },
    {
      chave: 'entrada',
      cabecalho: 'Entrada',
      largura: '140px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (e) => (
        <div className="flex flex-col">
          <span className="num text-[12.5px] text-ink">{dataHora(e.entrada_em)}</span>
          <span className="text-[11.5px] text-ink-3">{tempoRelativo(e.entrada_em)}</span>
        </div>
      ),
    },
    {
      chave: 'placa',
      cabecalho: 'Placa',
      largura: '104px',
      celula: (e) => (
        <div className="flex items-center gap-1.5">
          <span className="num font-semibold whitespace-nowrap text-ink">{e.veiculo?.placa ?? '—'}</span>
          {e.veiculo?.alerta_operador && (
            <span title={e.veiculo.alerta_operador} className="text-warn">
              <AlertTriangle aria-hidden className="size-3.5" />
            </span>
          )}
        </div>
      ),
    },
    {
      chave: 'veiculo',
      cabecalho: 'Veículo',
      classeResponsiva: 'hidden 2xl:table-cell',
      /* Uma linha por registro: numa lista operacional o texto longo trunca e
         fica no `title`, em vez de esticar a altura de toda a linha. */
      celula: (e) => (
        <span title={e.veiculo?.descricao ?? undefined} className="block max-w-48 truncate text-ink-2">
          {e.veiculo?.descricao ?? '—'}
        </span>
      ),
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (e) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span title={e.cliente?.nome_razao ?? undefined} className="max-w-[188px] truncate text-ink-2 sm:max-w-xs">
            {e.cliente?.nome_razao ?? '—'}
          </span>
          {/* Em 360px as colunas Nº, Entrada e Situação não cabem lado a lado.
              Em vez de empurrar a linha para rolagem lateral, elas descem para
              a segunda linha desta célula — a placa continua sendo a âncora. */}
          <span className="flex items-center gap-1.5 sm:hidden">
            <Selo tom={TOM_SITUACAO[e.situacao]} ponto>
              {ROTULO_SITUACAO[e.situacao]}
            </Selo>
            <span className="num text-[11px] whitespace-nowrap text-ink-3">
              {String(e.numero).padStart(5, '0')} · {tempoRelativo(e.entrada_em)}
            </span>
          </span>
        </div>
      ),
    },
    {
      chave: 'km',
      cabecalho: 'KM',
      largura: '100px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (e) => (
        <span className="num text-ink-2">
          {e.km !== null ? numeroBR(e.km, 0) : '—'}
          {e.km_inconsistente && (
            <span title="Quilometragem inconsistente registrada nesta entrada" className="ml-1 text-warn">
              !
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'permanencia',
      cabecalho: 'Permanência',
      largura: '110px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (e) => <span className="num text-ink-2">{permanencia(e.entrada_em, e.saida_em)}</span>,
    },
    {
      chave: 'recebido',
      cabecalho: 'Recebido por',
      classeResponsiva: 'hidden 2xl:table-cell',
      celula: (e) => (
        <span title={e.recebido?.nome_completo ?? undefined} className="block max-w-40 truncate text-ink-2">
          {e.recebido?.nome_completo ?? '—'}
        </span>
      ),
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '116px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (e) => (
        <Selo tom={TOM_SITUACAO[e.situacao]} ponto>
          {ROTULO_SITUACAO[e.situacao]}
        </Selo>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      <BarraFiltros
        busca={ctrl.busca}
        aoBuscar={ctrl.setBusca}
        placeholder="Buscar por placa, cliente ou número da entrada"
        chips={chips}
        aoLimpar={
          chips.length > 0
            ? () => {
                setSituacao('')
                setDe('')
                setAte('')
                ctrl.reiniciar()
              }
            : undefined
        }
        aoAtualizar={lista.recarregar}
        atualizando={lista.buscando}
        filtros={
          <>
            <Campo rotulo="Situação">
              {(p) => (
                <Selecao
                  {...p}
                  value={situacao}
                  onChange={(ev) => {
                    setSituacao(ev.target.value as '' | SituacaoEntrada)
                    ctrl.reiniciar()
                  }}
                >
                  <option value="">Todas</option>
                  <option value="no_patio">No pátio</option>
                  <option value="encerrada">Encerrada</option>
                  <option value="cancelada">Cancelada</option>
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Entrada a partir de">
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  value={de}
                  onChange={(ev) => {
                    setDe(ev.target.value)
                    ctrl.reiniciar()
                  }}
                />
              )}
            </Campo>
            <Campo rotulo="Entrada até">
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  value={ate}
                  onChange={(ev) => {
                    setAte(ev.target.value)
                    ctrl.reiniciar()
                  }}
                />
              )}
            </Campo>
          </>
        }
      />

      <Tabela
        colunas={colunas}
        linhas={lista.linhas}
        chaveDe={(e) => e.id}
        estado={lista.estado}
        className="rounded-t-none"
        mensagemVazio={{
          titulo: chips.length > 0 || ctrl.busca ? 'Nenhuma entrada encontrada' : 'Nenhuma entrada registrada',
          descricao:
            chips.length > 0 || ctrl.busca
              ? 'Ajuste a busca ou os filtros para ampliar o período.'
              : 'As entradas registradas na recepção aparecem aqui.',
        }}
        mensagemErro={{ aoTentarNovamente: lista.recarregar }}
      />

      <Paginacao
        className="mt-3"
        pagina={ctrl.pagina}
        porPagina={ctrl.porPagina}
        total={lista.total}
        aoMudarPagina={ctrl.setPagina}
      />
    </div>
  )
}
