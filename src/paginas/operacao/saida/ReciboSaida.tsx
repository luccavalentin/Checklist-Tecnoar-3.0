import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { mascaraDocumento, mascaraTelefone } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { baixarPdf, nomeArquivo } from '@/documentos/pdf'
import { pdfRecibo } from '@/documentos/pdfRecibo'

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  faturado: 'Faturado',
  outro: 'Outro',
}

/**
 * Recibo da saída.
 *
 * Abre logo depois de liberar o veículo, porque é nesse minuto que o cliente
 * está no balcão esperando o papel. Junta OS, itens, parcelas e garantias num
 * PDF de duas vias.
 */
export function ReciboSaida({ osId, aoFechar }: { osId: string; aoFechar: () => void }) {
  const toast = useToast()
  const [baixando, setBaixando] = useState(false)

  const dados = useQuery({
    queryKey: ['recibo', osId],
    queryFn: async () => {
      const [os, empresa, servicos, produtos, faturas, garantias] = await Promise.all([
        supabase
          .from('ordens_servico')
          .select(
            '*, cliente:clientes ( * ), veiculo:veiculos ( * )',
          )
          .eq('id', osId)
          .single(),
        supabase.from('dados_empresa').select('*').maybeSingle(),
        supabase.from('os_servicos').select('*').eq('os_id', osId).eq('situacao', 'ativo'),
        supabase.from('os_produtos').select('*').eq('os_id', osId).eq('situacao', 'ativo'),
        supabase.from('faturas').select('id').eq('os_id', osId).order('emitida_em', { ascending: false }).limit(1),
        supabase.from('garantias').select('descricao_item, fim, km_limite').eq('os_id', osId),
      ])
      if (os.error) throw os.error

      let parcelas: Array<{ numero: number; vencimento: string; valor: number }> = []
      const faturaId = faturas.data?.[0]?.id
      if (faturaId) {
        const { data } = await supabase
          .from('fatura_parcelas')
          .select('numero, vencimento, valor')
          .eq('fatura_id', faturaId)
          .order('numero')
        parcelas = (data ?? []) as typeof parcelas
      }

      return {
        os: os.data as unknown as Record<string, unknown>,
        empresa: empresa.data,
        servicos: servicos.data ?? [],
        produtos: produtos.data ?? [],
        parcelas,
        garantias: garantias.data ?? [],
      }
    },
  })

  async function baixar() {
    const d = dados.data
    if (!d) return
    setBaixando(true)
    try {
      const o = d.os as Record<string, any>
      const e = d.empresa
      const c = o.cliente
      const v = o.veiculo

      const itens = [
        ...d.servicos
          .filter((s: Record<string, any>) => s.aprovacao !== 'recusado')
          .map((s: Record<string, any>) => ({
            descricao: s.descricao,
            quantidade: Number(s.quantidade),
            valor_unitario: Number(s.valor_unitario),
            valor_total: Number(s.valor_total),
            tipo: 'servico',
          })),
        ...d.produtos
          .filter((p: Record<string, any>) => p.aprovacao !== 'recusado')
          .map((p: Record<string, any>) => ({
            descricao: p.descricao,
            quantidade: Number(p.quantidade),
            valor_unitario: Number(p.valor_unitario),
            valor_total: Number(p.valor_total),
            tipo: 'produto',
          })),
      ]

      const definicao = await pdfRecibo({
        empresa: {
          nome: e?.nome_fantasia || e?.razao_social || 'Tecnoar Freios',
          razaoSocial: e?.razao_social ?? null,
          cnpj: e?.cnpj ? mascaraDocumento(e.cnpj) : null,
          inscricaoEstadual: e?.inscricao_estadual ?? null,
          telefone: e?.telefone ?? null,
          endereco: e?.endereco ?? null,
          email: e?.email ?? null,
        },
        recibo: Number(o.recibo_numero ?? 0),
        os: {
          numero: o.numero,
          aberta_em: o.aberta_em,
          saida_em: o.saida_em,
          km: o.km,
          diagnostico: o.diagnostico,
        },
        cliente: {
          nome: c?.nome_razao ?? null,
          documento: c?.documento ? mascaraDocumento(c.documento) : null,
          contato: c?.celular ? mascaraTelefone(c.celular) : (c?.telefone ?? null),
          endereco: [c?.logradouro, c?.numero, c?.bairro, c?.municipio].filter(Boolean).join(', ') || null,
        },
        veiculo: {
          placa: v?.placa ?? null,
          modelo: v?.descricao || [v?.marca, v?.modelo].filter(Boolean).join(' ') || null,
          ano: v?.ano ?? null,
        },
        itens,
        totais: {
          servicos: Number(o.valor_servicos),
          produtos: Number(o.valor_produtos),
          desconto: Number(o.desconto),
          acrescimo: Number(o.acrescimo),
          total: Number(o.valor_total),
          pago: Number(o.valor_pago ?? 0),
        },
        pagamento: {
          forma: o.forma_pagamento ? (ROTULO_FORMA[o.forma_pagamento] ?? o.forma_pagamento) : null,
          condicao: o.condicao_pagamento ?? null,
          observacao: o.observacao_pagamento ?? null,
        },
        parcelas: d.parcelas.map((p) => ({
          numero: p.numero,
          vencimento: String(p.vencimento),
          valor: Number(p.valor),
        })),
        garantias: (d.garantias as Array<Record<string, any>>).map((g) => ({
          descricao: g.descricao_item,
          ate: String(g.fim),
          km_limite: g.km_limite ?? null,
        })),
      })

      await baixarPdf(
        definicao,
        nomeArquivo(['recibo', String(o.recibo_numero ?? 0).padStart(5, '0'), v?.placa]),
      )
    } catch (err) {
      toast.erro('Não foi possível gerar o recibo', mensagemErro(err))
    } finally {
      setBaixando(false)
    }
  }

  const o = dados.data?.os as Record<string, any> | undefined
  const saldo = o ? Number(o.valor_total) - Number(o.valor_pago ?? 0) : 0

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="md"
      titulo="Veículo liberado"
      descricao={o ? `Recibo ${String(o.recibo_numero ?? 0).padStart(5, '0')} · OS ${String(o.numero).padStart(5, '0')}` : undefined}
      rodape={
        <>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
          <Botao
            variante="primario"
            iconeInicio={baixando ? <Loader2 className="animate-spin" /> : <Download />}
            disabled={baixando || !dados.data}
            onClick={() => void baixar()}
          >
            Baixar recibo
          </Botao>
        </>
      }
    >
      {dados.isLoading ? (
        <EstadoCarregando rotulo="Montando o recibo…" />
      ) : (
        <div className="flex flex-col gap-3">
          <Aviso tom={saldo <= 0.005 ? 'ok' : 'atencao'} titulo={saldo <= 0.005 ? 'Quitado' : 'Saldo faturado'}>
            {saldo <= 0.005
              ? 'O recibo sai marcado como PAGO, em duas vias: cliente e financeiro.'
              : `Saldo de ${saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} parcelado. As parcelas saem impressas no recibo.`}
          </Aviso>
          {(dados.data?.garantias.length ?? 0) > 0 && (
            <Aviso tom="info" titulo={`${dados.data?.garantias.length} garantia(s) aberta(s)`}>
              Já aparecem em Garantias e Retornos e no cadastro do cliente.
            </Aviso>
          )}
        </div>
      )}
    </Modal>
  )
}
