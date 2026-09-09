import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { moeda, paraNumero } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { useInvalidarOS } from '../useOS'
import type { FormaPagamento, OSListada } from '@/tipos/db'

const FORMAS: Array<{ valor: FormaPagamento; rotulo: string; parcelavel: boolean }> = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', parcelavel: false },
  { valor: 'pix', rotulo: 'PIX', parcelavel: false },
  { valor: 'debito', rotulo: 'Cartão de débito', parcelavel: false },
  { valor: 'credito', rotulo: 'Cartão de crédito', parcelavel: true },
  { valor: 'boleto', rotulo: 'Boleto', parcelavel: true },
  { valor: 'transferencia', rotulo: 'Transferência', parcelavel: false },
  { valor: 'faturado', rotulo: 'Faturado', parcelavel: true },
  { valor: 'outro', rotulo: 'Outro', parcelavel: true },
]

/**
 * Fechamento financeiro da OS.
 *
 * O total vem do recálculo do banco, não daqui. Esta aba registra como o
 * cliente pagou e quanto já entrou — o saldo é a diferença, sempre calculada,
 * nunca digitada.
 */
export function AbaPagamento({
  ordem,
  podeEditar,
}: {
  ordem: OSListada
  podeEditar: boolean
}) {
  const toast = useToast()
  const invalidar = useInvalidarOS()

  const [f, setF] = useState({
    forma_pagamento: '' as '' | FormaPagamento,
    condicao_pagamento: '',
    parcelas: '',
    valor_pago: '',
    observacao_pagamento: '',
  })
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setF({
      forma_pagamento: ordem.forma_pagamento ?? '',
      condicao_pagamento: ordem.condicao_pagamento ?? '',
      parcelas: ordem.parcelas ? String(ordem.parcelas) : '',
      valor_pago: ordem.valor_pago ? String(ordem.valor_pago).replace('.', ',') : '',
      observacao_pagamento: ordem.observacao_pagamento ?? '',
    })
  }, [ordem])

  const total = Number(ordem.valor_total)
  const pagoDigitado = paraNumero(f.valor_pago) ?? 0
  const saldo = total - pagoDigitado
  const formaEscolhida = FORMAS.find((x) => x.valor === f.forma_pagamento)

  const salvar = useMutation({
    mutationFn: async ({ quitar }: { quitar: boolean }) => {
      setErro(null)
      const pago = quitar ? total : pagoDigitado
      if (pago < 0) throw new Error('O valor recebido não pode ser negativo.')
      if (pago > total) {
        throw new Error(`O valor recebido (${moeda(pago)}) passa do total da OS (${moeda(total)}).`)
      }
      const parcelas = f.parcelas ? Number(f.parcelas) : null
      if (parcelas !== null && (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 48)) {
        throw new Error('O número de parcelas precisa estar entre 1 e 48.')
      }

      const { error } = await supabase
        .from('ordens_servico')
        .update({
          forma_pagamento: f.forma_pagamento || null,
          condicao_pagamento: f.condicao_pagamento.trim() || null,
          parcelas,
          valor_pago: pago,
          /* Só carimba a quitação quando o saldo realmente zera. */
          pago_em: pago >= total && total > 0 ? new Date().toISOString() : null,
          observacao_pagamento: f.observacao_pagamento.trim() || null,
        })
        .eq('id', ordem.id)
      if (error) throw error
    },
    onSuccess: (_r, { quitar }) => {
      toast.ok(quitar ? 'Pagamento quitado' : 'Pagamento salvo')
      invalidar(ordem.id)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  return (
    <div className="flex flex-col gap-4">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo rotulo="Total da OS" valor={moeda(total)} />
        <Resumo rotulo="Já recebido" valor={moeda(pagoDigitado)} tom={pagoDigitado > 0 ? 'ok' : undefined} />
        <Resumo
          rotulo={saldo > 0.005 ? 'Saldo a receber' : 'Saldo'}
          valor={moeda(Math.max(saldo, 0))}
          tom={saldo > 0.005 ? 'aberto' : 'ok'}
        />
      </div>

      {ordem.pago_em && (
        <Aviso tom="ok" titulo="Pagamento quitado">
          Registrado em {dataHora(ordem.pago_em)}.
        </Aviso>
      )}

      {total === 0 && (
        <Aviso tom="info" titulo="A OS ainda não tem valor">
          Lance serviços e peças na aba “Serviços / Peças” — o total é calculado a partir dos itens aprovados.
        </Aviso>
      )}

      <Secao numero="01" titulo="Como o cliente vai pagar">
        <Grade>
          <Campo className="sm:col-span-4" rotulo="Forma de pagamento">
            {(p) => (
              <Selecao
                {...p}
                disabled={!podeEditar}
                value={f.forma_pagamento}
                onChange={(e) => setF({ ...f, forma_pagamento: e.target.value as FormaPagamento | '' })}
              >
                <option value="">Não definida</option>
                {FORMAS.map((x) => (
                  <option key={x.valor} value={x.valor}>{x.rotulo}</option>
                ))}
              </Selecao>
            )}
          </Campo>

          <Campo
            className="sm:col-span-3"
            rotulo="Parcelas"
            dica={formaEscolhida && !formaEscolhida.parcelavel ? 'Esta forma costuma ser à vista.' : undefined}
          >
            {(p) => (
              <Entrada
                {...p}
                mono
                type="number"
                min="1"
                max="48"
                disabled={!podeEditar}
                value={f.parcelas}
                onChange={(e) => setF({ ...f, parcelas: e.target.value })}
                placeholder="À vista"
              />
            )}
          </Campo>

          <Campo className="sm:col-span-5" rotulo="Condição" dica="Ex.: 30/60 dias, entrada + 2x.">
            {(p) => (
              <Entrada
                {...p}
                disabled={!podeEditar}
                value={f.condicao_pagamento}
                onChange={(e) => setF({ ...f, condicao_pagamento: e.target.value })}
              />
            )}
          </Campo>

          <Campo className="sm:col-span-4" rotulo="Valor recebido">
            {(p) => (
              <Entrada
                {...p}
                mono
                inputMode="decimal"
                disabled={!podeEditar}
                value={f.valor_pago}
                onChange={(e) => setF({ ...f, valor_pago: e.target.value })}
                placeholder="0,00"
              />
            )}
          </Campo>

          <Campo className="sm:col-span-8" rotulo="Observação do pagamento">
            {(p) => (
              <AreaTexto
                {...p}
                rows={2}
                disabled={!podeEditar}
                value={f.observacao_pagamento}
                onChange={(e) => setF({ ...f, observacao_pagamento: e.target.value })}
                placeholder="Número da nota, autorização do cartão, quem autorizou o faturamento…"
              />
            )}
          </Campo>
        </Grade>
      </Secao>

      {podeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          {total > 0 && saldo > 0.005 && (
            <Botao
              variante="secundario"
              iconeInicio={<CheckCheck />}
              carregando={salvar.isPending}
              onClick={() => salvar.mutate({ quitar: true })}
            >
              Receber o total ({moeda(total)})
            </Botao>
          )}
          <Botao variante="primario" carregando={salvar.isPending} onClick={() => salvar.mutate({ quitar: false })}>
            Salvar pagamento
          </Botao>
        </div>
      )}
    </div>
  )
}

function Resumo({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string
  valor: string
  tom?: 'ok' | 'aberto'
}) {
  return (
    <div
      className={cn(
        'aresta flex flex-col gap-1.5 rounded-lg border bg-surface p-4',
        tom === 'aberto' ? 'border-accent/40' : tom === 'ok' ? 'border-ok/35' : 'border-line',
      )}
    >
      <span className="lbl">{rotulo}</span>
      <span
        className={cn(
          'num text-xl leading-none font-medium',
          tom === 'aberto' ? 'text-accent-ink' : tom === 'ok' ? 'text-ok-ink' : 'text-ink',
        )}
      >
        {valor}
      </span>
    </div>
  )
}
