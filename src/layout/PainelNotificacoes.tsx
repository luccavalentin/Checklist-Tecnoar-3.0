import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Check, Settings2, Sparkles, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro, tempoRelativo } from '@/lib/utils'
import type { Notificacao, TabelasUpdate, TipoNotificacao } from '@/tipos/db'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Abas } from '@/componentes/ui/Abas'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'

type Filtro = 'todos' | TipoNotificacao

export function PainelNotificacoes({
  aberto,
  aoFechar,
  usuarioId,
}: {
  aberto: boolean
  aoFechar: () => void
  usuarioId: string
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const navegar = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const consulta = useQuery({
    queryKey: ['notificacoes', usuarioId],
    enabled: aberto,
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', usuarioId)
        .is('dispensada_em', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })

  const lista = consulta.data ?? []
  const filtradas = useMemo(
    () => (filtro === 'todos' ? lista : lista.filter((n) => n.tipo === filtro)),
    [lista, filtro],
  )

  const marcar = useMutation({
    mutationFn: async ({ ids, campo }: { ids: string[]; campo: 'lida_em' | 'dispensada_em' }) => {
      const agora = new Date().toISOString()
      const alteracao: TabelasUpdate<'notificacoes'> =
        campo === 'lida_em' ? { lida_em: agora } : { dispensada_em: agora }
      const { error } = await supabase.from('notificacoes').update(alteracao).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificacoes', usuarioId] }),
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const naoLidas = lista.filter((n) => !n.lida_em)

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Notificações"
      descricao={naoLidas.length > 0 ? `${naoLidas.length} não lida(s)` : undefined}
      rodape={
        <div className="flex w-full items-center justify-between gap-2">
          <Botao
            variante="fantasma"
            tamanho="sm"
            iconeInicio={<Check />}
            disabled={naoLidas.length === 0 || marcar.isPending}
            onClick={() => marcar.mutate({ ids: naoLidas.map((n) => n.id), campo: 'lida_em' })}
          >
            Marcar todas como lidas
          </Botao>
          <Botao
            variante="fantasma"
            tamanho="sm"
            iconeInicio={<Settings2 />}
            onClick={() => {
              aoFechar()
              navegar('/sistema/configuracoes')
            }}
          >
            Configurar
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Abas
          ativa={filtro}
          aoMudar={setFiltro}
          abas={[
            { valor: 'todos', rotulo: 'Todos', contador: lista.length },
            {
              valor: 'alerta_inteligente',
              rotulo: 'Alerta Inteligente',
              icone: <Sparkles />,
              contador: lista.filter((n) => n.tipo === 'alerta_inteligente').length,
            },
            {
              valor: 'sistema',
              rotulo: 'Sistema',
              contador: lista.filter((n) => n.tipo === 'sistema').length,
            },
          ]}
        />

        {consulta.isLoading && <EstadoCarregando rotulo="Carregando notificações…" />}

        {consulta.isError && (
          <EstadoErro
            descricao={mensagemErro(consulta.error)}
            aoTentarNovamente={() => void consulta.refetch()}
            compacto
          />
        )}

        {consulta.isSuccess && filtradas.length === 0 && (
          <EstadoVazio
            icone={<BellOff />}
            titulo="Nenhuma notificação"
            descricao={
              filtro === 'todos'
                ? 'Você será avisado aqui sobre alertas operacionais e eventos do sistema.'
                : 'Nada neste filtro.'
            }
            compacto
          />
        )}

        {filtradas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {filtradas.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-lg border border-line p-3.5 ${
                  n.lida_em ? 'bg-surface' : 'bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4 ${
                    n.tipo === 'alerta_inteligente'
                      ? 'bg-cyan-soft text-cyan'
                      : 'bg-ink-3/10 text-ink-3'
                  }`}
                >
                  {n.tipo === 'alerta_inteligente' ? <Sparkles /> : <Bell />}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-[13.5px] font-semibold text-ink">{n.titulo}</p>
                  {n.mensagem && <p className="text-[12.5px] leading-relaxed text-ink-2">{n.mensagem}</p>}
                  <div className="flex items-center gap-2.5">
                    <span className="num text-[11px] text-ink-3">{tempoRelativo(n.created_at)}</span>
                    {!n.lida_em && (
                      <button
                        type="button"
                        onClick={() => marcar.mutate({ ids: [n.id], campo: 'lida_em' })}
                        className="text-[11.5px] text-cyan-ink hover:underline"
                      >
                        Marcar como lida
                      </button>
                    )}
                  </div>
                </div>

                <BotaoIcone
                  rotulo="Dispensar"
                  tamanho="sm"
                  onClick={() => marcar.mutate({ ids: [n.id], campo: 'dispensada_em' })}
                >
                  <X />
                </BotaoIcone>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PainelLateral>
  )
}

/** Contador de não lidas usado no sino da barra superior. */
export function useNaoLidas(usuarioId: string | undefined) {
  return useQuery({
    queryKey: ['notificacoes-nao-lidas', usuarioId],
    enabled: Boolean(usuarioId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId!)
        .is('lida_em', null)
        .is('dispensada_em', null)
      if (error) throw error
      return count ?? 0
    },
  })
}
