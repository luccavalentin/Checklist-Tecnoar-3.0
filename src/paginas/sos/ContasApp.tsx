import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Loader2, Search, Smartphone, UserRound, X } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { mascaraTelefone } from '@/lib/formatos'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Entrada } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoVazio } from '@/componentes/ui/Estados'
import { Selo } from '@/componentes/ui/Selo'
import { Confirmacao, Modal } from '@/componentes/ui/Sobreposicoes'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { useToast } from '@/componentes/ui/Toast'
import { sosBuscarCliente, sosContasApp, sosVincularCliente } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { dataCurta, haQuanto } from '@/sos/rotulos'
import type { ClienteBusca, ContaApp } from '@/sos/tipos'
import { ErroSOS } from './comum'

/**
 * Clientes que criaram conta no app. O vínculo com o cadastro do Checklist é
 * o que dá ao cliente o histórico, os veículos e os lembretes — quando o app
 * ligou a conta ao cliente errado (mesmo telefone, empresa com dois CNPJs), a
 * central corrige aqui.
 */
export function ContasApp({ podeEditar }: { podeEditar: boolean }) {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [vinculando, setVinculando] = useState<ContaApp | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 350)
    return () => window.clearTimeout(t)
  }, [busca])

  const consulta = useQuery({
    queryKey: [...CHAVES_SOS.contas, termo],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: () => sosContasApp(termo || null),
  })

  const lista = consulta.data ?? []

  const colunas: Array<Coluna<ContaApp>> = [
    {
      chave: 'nome',
      cabecalho: 'Conta',
      largura: '240px',
      celula: (a) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{a.nome}</span>
          <span className="num truncate text-[11.5px] text-ink-3">{[a.telefone ? mascaraTelefone(a.telefone) : null, a.email].filter(Boolean).join(' · ') || 'Sem contato'}</span>
        </span>
      ),
    },
    {
      chave: 'cliente',
      cabecalho: 'Cadastro vinculado',
      largura: '240px',
      celula: (a) =>
        a.cliente_nome ? (
          <span className="block truncate text-[13px] text-ink-2">{a.cliente_nome}</span>
        ) : (
          <Selo tom="atencao" ponto>
            Sem vínculo
          </Selo>
        ),
    },
    {
      chave: 'uso',
      cabecalho: 'Uso',
      largura: '160px',
      celula: (a) => (
        <span className="num text-[12.5px] text-ink-2">
          {a.chamados} SOS · {a.veiculos} veíc.
        </span>
      ),
    },
    {
      chave: 'acesso',
      cabecalho: 'Último acesso',
      largura: '150px',
      celula: (a) => (
        <span className="flex flex-col text-[12px]">
          <span className="text-ink-2">{a.ultimo_acesso ? haQuanto(a.ultimo_acesso) : 'Nunca'}</span>
          <span className="text-ink-3">desde {dataCurta(a.created_at)}</span>
        </span>
      ),
    },
    ...(podeEditar
      ? [
          {
            chave: 'acoes',
            cabecalho: '',
            largura: '140px',
            alinhamento: 'direita' as const,
            celula: (a: ContaApp) => (
              <Botao
                tamanho="sm"
                variante={a.cliente_id ? 'neutro' : 'secundario'}
                iconeInicio={<Link2 />}
                className="max-lg:h-11"
                onClick={(e) => {
                  e.stopPropagation()
                  setVinculando(a)
                }}
              >
                {a.cliente_id ? 'Revincular' : 'Vincular'}
              </Botao>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Entrada
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, telefone ou e-mail"
            aria-label="Buscar conta do app"
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
        <span className="hidden text-[12.5px] text-ink-3 sm:block">
          {consulta.isFetching ? 'Buscando…' : `${lista.length} conta${lista.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {consulta.isLoading ? (
        <EstadoCarregando rotulo="Carregando contas do app…" />
      ) : consulta.isError ? (
        <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone={<Smartphone />}
          titulo={termo ? 'Nenhuma conta encontrada' : 'Nenhum cliente no app ainda'}
          descricao={termo ? 'Tente outro nome, telefone ou e-mail.' : 'Quando um cliente criar a conta no app SOS Tecnoar, ela aparece aqui para a central conferir o vínculo.'}
        />
      ) : (
        <Tabela colunas={colunas} linhas={lista} chaveDe={(a) => a.usuario_id} className={cn(consulta.isPlaceholderData && 'opacity-60')} />
      )}

      <ModalVincular conta={vinculando} aoFechar={() => setVinculando(null)} />
    </div>
  )
}

function ModalVincular({ conta, aoFechar }: { conta: ContaApp | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [escolhido, setEscolhido] = useState<ClienteBusca | null>(null)

  useEffect(() => {
    if (!conta) return
    // A busca de clientes procura por nome, documento e placa — o nome da conta é o melhor ponto de partida.
    setBusca(conta.nome)
    setEscolhido(null)
  }, [conta])

  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const clientes = useQuery({
    queryKey: ['sos', 'busca-cliente', termo],
    enabled: !!conta && termo.length >= 2,
    staleTime: 30_000,
    queryFn: () => sosBuscarCliente(termo),
  })

  const vincular = useMutation({
    mutationFn: () => sosVincularCliente(conta!.usuario_id, escolhido!.cliente_id),
    onSuccess: () => {
      toast.ok('Conta vinculada', `${conta?.nome} agora vê o histórico de ${escolhido?.nome}.`)
      setEscolhido(null)
      aoFechar()
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.contas })
    },
    onError: (e) => toast.erro('Não foi possível vincular', mensagemErro(e)),
  })

  return (
    <>
      <Modal
        aberto={!!conta && !escolhido}
        aoFechar={aoFechar}
        titulo={conta?.cliente_id ? 'Revincular conta do app' : 'Vincular conta do app'}
        descricao={conta ? `${conta.nome}${conta.cliente_nome ? ` · hoje ligada a ${conta.cliente_nome}` : ''}` : undefined}
      >
        <div className="flex flex-col gap-2">
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF/CNPJ ou placa do cliente" aria-label="Buscar cliente" iconeInicio={<Search />} />
          {termo.length >= 2 && (
            <ul className="max-h-72 overflow-y-auto rounded-xl border border-line bg-surface">
              {clientes.isFetching && !clientes.data && (
                <li className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-ink-3">
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </li>
              )}
              {clientes.isError && <li className="px-3.5 py-3 text-[13px] text-crit-ink">{mensagemErro(clientes.error)}</li>}
              {clientes.isSuccess && clientes.data.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">Nenhum cliente para “{termo}”.</li>}
              {(clientes.data ?? []).map((c) => (
                <li key={c.cliente_id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    disabled={c.cliente_id === conta?.cliente_id}
                    onClick={() => setEscolhido(c)}
                    className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <UserRound aria-hidden className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{c.nome}</span>
                      <span className="num block truncate text-[11.5px] text-ink-3">{[c.documento, c.celular].filter(Boolean).join(' · ')}</span>
                    </span>
                    {c.cliente_id === conta?.cliente_id && <Selo tom="info">Atual</Selo>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Confirmacao
        aberto={!!conta && !!escolhido}
        aoFechar={() => setEscolhido(null)}
        aoConfirmar={() => vincular.mutate()}
        carregando={vincular.isPending}
        titulo="Confirmar vínculo?"
        rotuloConfirmar="Vincular"
        descricao={
          <>
            A conta <strong>{conta?.nome}</strong> passa a ver os veículos, o histórico e os lembretes de <strong>{escolhido?.nome}</strong>
            {conta?.cliente_nome ? <> — e deixa de ver os de {conta.cliente_nome}</> : null}.
          </>
        }
      />
    </>
  )
}
