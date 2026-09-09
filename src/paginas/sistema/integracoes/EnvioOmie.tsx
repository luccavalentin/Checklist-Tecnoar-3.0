import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CloudUpload, Loader2, Package, TriangleAlert, User, Users, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo } from '@/componentes/ui/Selo'
import { Aviso } from '@/componentes/ui/Aviso'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'

type Entidade = 'clientes' | 'fornecedores' | 'produtos' | 'servicos'

const ENTIDADES: Array<{ id: Entidade; rotulo: string; icone: typeof User }> = [
  { id: 'clientes', rotulo: 'Clientes', icone: User },
  { id: 'fornecedores', rotulo: 'Fornecedores', icone: Users },
  { id: 'produtos', rotulo: 'Produtos', icone: Package },
  { id: 'servicos', rotulo: 'Serviços', icone: Wrench },
]

interface Pendente {
  entidade: string
  total: number
  com_erro: number
}

interface Detalhe {
  id: string
  nome: string
  ok: boolean
  erro?: string
  omie_id?: string
}

/**
 * Envio de cadastros para a Omie.
 *
 * A sincronização traz dados do ERP; isto leva. O cliente que a recepção
 * cadastrou de manhã precisa existir no financeiro antes de virar nota — e
 * enquanto não existir, aparece aqui como pendência.
 *
 * O envio usa o identificador do Tecnoar como código de integração, então
 * reenviar não duplica: a Omie atualiza o mesmo cadastro.
 */
export function EnvioOmie({
  podeEnviar,
  configurada,
}: {
  podeEnviar: boolean
  configurada: boolean
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmando, setConfirmando] = useState<Entidade | null>(null)
  const [resultado, setResultado] = useState<{ entidade: Entidade; detalhes: Detalhe[] } | null>(null)

  const pendentes = useQuery({
    queryKey: ['omie-pendentes'],
    queryFn: async (): Promise<Pendente[]> => {
      const { data, error } = await supabase.rpc('omie_pendentes_de_envio')
      if (error) throw error
      return (data ?? []) as unknown as Pendente[]
    },
  })

  const enviar = useMutation({
    mutationFn: async (entidade: Entidade) => {
      const { data, error } = await supabase.functions.invoke<{
        enviados?: number
        recusados?: number
        detalhes?: Detalhe[]
        erro?: string
      }>('omie-envio', { body: { entidade } })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      return { entidade, ...data }
    },
    onSuccess: (r) => {
      setConfirmando(null)
      setResultado({ entidade: r.entidade, detalhes: r.detalhes ?? [] })
      if (r.enviados) toast.ok(`${r.enviados} cadastro(s) enviado(s) para a Omie`)
      if (r.recusados) toast.erro(`${r.recusados} recusado(s)`, 'Veja o detalhe abaixo.')
      if (!r.enviados && !r.recusados) toast.ok('Nada pendente de envio')
      void qc.invalidateQueries({ queryKey: ['omie-pendentes'] })
      void qc.invalidateQueries({ queryKey: ['clientes'] })
      void qc.invalidateQueries({ queryKey: ['produtos'] })
    },
    onError: (e) => {
      setConfirmando(null)
      toast.erro('Não foi possível enviar', mensagemErro(e))
    },
  })

  const totalPendente = (pendentes.data ?? []).reduce((s, p) => s + Number(p.total), 0)

  return (
    <Painel semPadding>
      <CabecalhoPainel
        titulo="Enviar cadastros para a Omie"
        descricao="Registros criados aqui que ainda não existem no ERP. Reenviar não duplica: a Omie atualiza pelo código de integração."
        acao={
          totalPendente > 0 ? (
            <Selo tom="atencao" ponto>{totalPendente} pendente(s)</Selo>
          ) : (
            <Selo tom="ok" ponto>Tudo no ERP</Selo>
          )
        }
      />

      <div className="flex flex-col gap-4 p-5">
        {!configurada && (
          <Aviso tom="atencao" titulo="Integração não configurada">
            Informe as credenciais da Omie acima para poder enviar cadastros.
          </Aviso>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ENTIDADES.map((e) => {
            const p = pendentes.data?.find((x) => x.entidade === e.id)
            const total = Number(p?.total ?? 0)
            const comErro = Number(p?.com_erro ?? 0)
            const ocupado = enviar.isPending && confirmando === e.id

            return (
              <div
                key={e.id}
                className={cn(
                  'aresta flex flex-col gap-2.5 rounded-lg border p-4',
                  total > 0 ? 'border-accent/40 bg-accent-soft/25' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-center gap-2">
                  <e.icone aria-hidden className="size-4 text-ink-3" />
                  <span className="text-[13px] font-medium text-ink">{e.rotulo}</span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="num text-2xl leading-none font-semibold text-ink">{total}</span>
                  <span className="text-[12px] text-ink-2">
                    {total === 1 ? 'aguardando envio' : 'aguardando envio'}
                  </span>
                </div>

                {comErro > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-crit-ink">
                    <TriangleAlert aria-hidden className="size-3.5" />
                    {comErro} com recusa anterior
                  </span>
                )}

                <Botao
                  tamanho="sm"
                  variante={total > 0 ? 'secundario' : 'neutro'}
                  iconeInicio={ocupado ? <Loader2 className="animate-spin" /> : <CloudUpload />}
                  disabled={!podeEnviar || !configurada || total === 0 || enviar.isPending}
                  onClick={() => setConfirmando(e.id)}
                  className="mt-auto"
                >
                  Enviar
                </Botao>
              </div>
            )
          })}
        </div>

        {resultado && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-4">
            <span className="lbl">Resultado do último envio · {resultado.entidade}</span>
            {resultado.detalhes.length === 0 ? (
              <p className="text-[12.5px] text-ink-2">Nada pendente nesta entidade.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {resultado.detalhes.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-2 text-[12.5px]">
                    {d.ok ? (
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ok" />
                    ) : (
                      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-crit" />
                    )}
                    <span className="font-medium text-ink">{d.nome}</span>
                    {d.ok ? (
                      <span className="num text-ink-3">código Omie {d.omie_id}</span>
                    ) : (
                      <span className="min-w-0 flex-1 text-crit-ink">{d.erro}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Confirmacao
        aberto={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        aoConfirmar={() => confirmando && enviar.mutate(confirmando)}
        carregando={enviar.isPending}
        titulo="Enviar cadastros para a Omie"
        rotuloConfirmar="Enviar"
        descricao={
          <>
            Os cadastros de <strong>{ENTIDADES.find((e) => e.id === confirmando)?.rotulo.toLowerCase()}</strong> criados
            no Tecnoar serão criados na Omie, no ambiente de produção do ERP. Registros recusados por falta de dado
            obrigatório ficam marcados aqui com o motivo.
          </>
        }
      />
    </Painel>
  )
}
