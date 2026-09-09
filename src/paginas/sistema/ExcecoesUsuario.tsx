import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando, EstadoErro } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { MatrizPermissoes } from './MatrizPermissoes'
import type { AcaoPermissao } from '@/tipos/db'

type Excecao = 'herdar' | 'permitir' | 'bloquear'

/**
 * Exceções individuais de permissão.
 *
 * A regra do usuário sempre vence a do perfil — inclusive para revogar algo
 * que o perfil concede.
 */
export function ExcecoesUsuario({ usuarioId, perfilNome }: { usuarioId: string; perfilNome: string | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = usePermissoes()
  const podeConfigurar = pode('perfis_permissoes', 'configurar')

  const excecoes = useQuery({
    queryKey: ['usuario_permissoes', usuarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuario_permissoes')
        .select('recurso, acao, concedida')
        .eq('usuario_id', usuarioId)
      if (error) throw error
      const mapa = new Map<string, boolean>()
      for (const e of data ?? []) mapa.set(`${e.recurso}:${e.acao}`, e.concedida)
      return mapa
    },
  })

  const definir = useMutation({
    mutationFn: async ({ recurso, acao, valor }: { recurso: string; acao: AcaoPermissao; valor: Excecao }) => {
      if (valor === 'herdar') {
        const { error } = await supabase
          .from('usuario_permissoes')
          .delete()
          .eq('usuario_id', usuarioId)
          .eq('recurso', recurso)
          .eq('acao', acao)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('usuario_permissoes')
        .upsert({ usuario_id: usuarioId, recurso, acao, concedida: valor === 'permitir' })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['usuario_permissoes', usuarioId] })
      void qc.invalidateQueries({ queryKey: ['minhas-permissoes'] })
    },
    onError: (e) => toast.erro('Não foi possível salvar a exceção', mensagemErro(e)),
  })

  if (excecoes.isLoading) return <EstadoCarregando rotulo="Carregando exceções…" />
  if (excecoes.isError)
    return <EstadoErro descricao={mensagemErro(excecoes.error)} aoTentarNovamente={() => void excecoes.refetch()} />

  const mapa = excecoes.data!

  return (
    <div className="flex flex-col gap-4">
      <Aviso tom="info" titulo="Como funciona">
        Por padrão a pessoa herda tudo do perfil{' '}
        <strong className="font-semibold text-ink">{perfilNome ?? 'não atribuído'}</strong>. Uma exceção sobrepõe o
        perfil — para conceder algo a mais ou para bloquear algo que o perfil libera.
      </Aviso>

      <MatrizPermissoes
        somenteLeitura={!podeConfigurar}
        aoRenderizarCelula={(recurso, acao) => {
          const chave = `${recurso.chave}:${acao}`
          const atual: Excecao = mapa.has(chave) ? (mapa.get(chave) ? 'permitir' : 'bloquear') : 'herdar'
          return (
            <select
              aria-label={`${recurso.nome} — ${acao}`}
              value={atual}
              disabled={!podeConfigurar || definir.isPending}
              onChange={(e) =>
                definir.mutate({ recurso: recurso.chave, acao, valor: e.target.value as Excecao })
              }
              className={
                'w-full cursor-pointer rounded border bg-inset px-1 py-1 text-[11px] ' +
                (atual === 'permitir'
                  ? 'border-ok/50 text-ok-ink'
                  : atual === 'bloquear'
                    ? 'border-crit/50 text-crit-ink'
                    : 'border-line text-ink-3')
              }
            >
              <option value="herdar">Herdar</option>
              <option value="permitir">Permitir</option>
              <option value="bloquear">Bloquear</option>
            </select>
          )
        }}
      />
    </div>
  )
}
