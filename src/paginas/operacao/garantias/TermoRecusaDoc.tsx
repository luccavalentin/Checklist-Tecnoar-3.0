import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { PenLine, Printer, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora } from '@/lib/utils'
import { mascaraDocumento, numeroBR } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Aviso } from '@/componentes/ui/Aviso'
import type { Assinatura, DadosEmpresa, TermoRecusa } from '@/tipos/db'

/**
 * Termo de Ciência e Responsabilidade.
 *
 * Depois de assinado, o documento é montado a partir do snapshot gravado —
 * a versão apresentada ao cliente nunca muda, mesmo que os cadastros mudem.
 */
export function TermoRecusaDoc({
  termo,
  aoFechar,
  aoAssinar,
}: {
  termo: TermoRecusa
  aoFechar: () => void
  aoAssinar?: () => void
}) {
  const empresa = useQuery({
    queryKey: ['dados-empresa-documento'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const contexto = useQuery({
    queryKey: ['termo-contexto', termo.id],
    queryFn: async () => {
      if (termo.snapshot) return termo.snapshot as Record<string, unknown>
      const { data, error } = await supabase
        .from('termos_recusa')
        .select('*, cliente:clientes ( nome_razao, documento ), veiculo:veiculos ( placa, descricao )')
        .eq('id', termo.id)
        .single()
      if (error) throw error
      return data as unknown as Record<string, unknown>
    },
  })

  const assinaturas = useQuery({
    queryKey: ['assinaturas', 'termos_recusa', termo.id],
    queryFn: async (): Promise<Assinatura[]> => {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('*')
        .eq('entidade', 'termos_recusa')
        .eq('entidade_id', termo.id)
      if (error) throw error
      return data ?? []
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  const ctx = (contexto.data ?? {}) as {
    cliente?: { nome_razao?: string; documento?: string }
    veiculo?: { placa?: string; descricao?: string }
  }
  const empresaNome = empresa.data?.nome_fantasia || empresa.data?.razao_social || 'Tecnoar Freios'
  const assinatura = assinaturas.data?.[0]

  return createPortal(
    <div className="fixed inset-0 top-[env(safe-area-inset-top)] z-70 overflow-y-auto bg-canvas">
      <style>{`@media print { .sem-impressao { display:none !important } .area-impressao { padding:0 !important } }`}</style>

      <div className="sem-impressao sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <span className="font-display text-[15px] font-semibold text-ink">
          Termo {String(termo.numero).padStart(4, '0')}
        </span>
        <div className="flex gap-2">
          {aoAssinar && (
            <Botao variante="secundario" iconeInicio={<PenLine />} onClick={aoAssinar}>
              Assinar
            </Botao>
          )}
          <Botao variante="primario" iconeInicio={<Printer />} onClick={() => window.print()}>
            Imprimir / PDF
          </Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>

      <div className="area-impressao mx-auto max-w-3xl p-6">
        {!termo.assinado_em && (
          <div className="sem-impressao mb-4">
            <Aviso tom="atencao" titulo="Ainda não assinado">
              O termo só tem valor depois de assinado pelo cliente. Após a assinatura ele se torna imutável.
            </Aviso>
          </div>
        )}

        <article className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-8 text-ink print:rounded-none print:border-0 print:p-0">
          <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
            <div className="flex items-center gap-4">
              <img src="/brand/tecnoar-positivo.svg" alt="Tecnoar Freios" className="h-14 w-auto" />
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[15px] font-bold">{empresaNome}</span>
                {empresa.data?.cnpj && <span className="num text-[11px] text-ink-2">CNPJ {mascaraDocumento(empresa.data.cnpj)}</span>}
                {empresa.data?.telefone && <span className="text-[11px] text-ink-2">{empresa.data.telefone}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-display text-[11px] font-bold tracking-[0.14em] text-ink-2 uppercase">
                Termo de ciência e responsabilidade
              </span>
              <span className="num text-2xl font-bold">{String(termo.numero).padStart(4, '0')}</span>
              <span className="num text-[11px] text-ink-2">Emitido em {dataHora(termo.created_at)}</span>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-6">
            <Bloco titulo="Cliente">
              <Linha rotulo="Nome" valor={ctx.cliente?.nome_razao} />
              <Linha rotulo="Documento" valor={ctx.cliente?.documento ? mascaraDocumento(ctx.cliente.documento) : null} mono />
            </Bloco>
            <Bloco titulo="Veículo">
              <Linha rotulo="Placa" valor={ctx.veiculo?.placa} mono destaque />
              <Linha rotulo="Descrição" valor={ctx.veiculo?.descricao} />
              <Linha rotulo="KM" valor={termo.km !== null ? `${numeroBR(termo.km, 0)} km` : null} mono />
            </Bloco>
          </section>

          <section className="flex flex-col gap-4 rounded border border-ink p-5">
            <p className="text-[12.5px] leading-relaxed">
              Declaro, para os devidos fins, que fui informado(a) pela equipe técnica da{' '}
              <strong className="font-semibold">{empresaNome}</strong> sobre o problema abaixo identificado no
              veículo, bem como sobre os riscos de não executar o reparo recomendado, e que{' '}
              <strong className="font-semibold">optei por não autorizar o serviço neste momento</strong>, assumindo
              integral responsabilidade pelas consequências decorrentes desta decisão.
            </p>

            <Bloco titulo="Defeito identificado">
              <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{termo.defeito}</p>
            </Bloco>

            {termo.risco && (
              <Bloco titulo="Risco de não executar">
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{termo.risco}</p>
              </Bloco>
            )}

            {termo.recomendacao && (
              <Bloco titulo="Recomendação técnica">
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{termo.recomendacao}</p>
              </Bloco>
            )}

            {termo.item_recusado && (
              <Bloco titulo="Item recusado">
                <p className="text-[12.5px]">{termo.item_recusado}</p>
              </Bloco>
            )}
          </section>

          <section className="mt-4 grid grid-cols-2 gap-10 pt-6">
            <div className="flex flex-col gap-1">
              <div className="h-10 border-b border-ink" />
              <span className="text-[11px] font-semibold">{assinatura?.nome || 'Cliente'}</span>
              <span className="text-[10px] text-ink-2">
                {assinatura ? `${assinatura.documento ?? ''} · ${dataHora(assinatura.assinado_em)}`.trim() : 'Assinatura do cliente'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="h-10 border-b border-ink" />
              <span className="text-[11px] font-semibold">Responsável Tecnoar</span>
              <span className="text-[10px] text-ink-2">Assinatura</span>
            </div>
          </section>

          <footer className="num border-t border-line pt-3 text-center text-[10px] text-ink-2">
            {termo.assinado_em
              ? `Documento assinado em ${dataHora(termo.assinado_em)} — versão preservada e imutável.`
              : 'Documento ainda não assinado.'}
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-display text-[10px] font-bold tracking-[0.16em] text-ink-2 uppercase">{titulo}</h3>
      <div className="flex flex-col gap-0.5 rounded border border-line p-3">{children}</div>
    </div>
  )
}

function Linha({ rotulo, valor, mono, destaque }: { rotulo: string; valor?: string | null; mono?: boolean; destaque?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-28 shrink-0 text-ink-2">{rotulo}</span>
      <span className={[mono ? 'num' : '', destaque ? 'font-bold' : '', 'flex-1'].filter(Boolean).join(' ')}>
        {valor || '—'}
      </span>
    </div>
  )
}
