import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora } from '@/lib/utils'
import { mascaraDocumento } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Abas } from '@/componentes/ui/Abas'
import type { DadosEmpresa, PecaTesteListada } from '@/tipos/db'

type Documento = 'protocolo' | 'etiqueta' | 'comprovante'

/**
 * Documentos do laboratório: protocolo de recebimento, etiqueta da peça e
 * comprovante de entrega. Impressão e PDF pelo próprio navegador.
 */
export function DocumentoProtocolo({ peca, aoFechar }: { peca: PecaTesteListada; aoFechar: () => void }) {
  const [doc, setDoc] = useState<Documento>('protocolo')

  const empresa = useQuery({
    queryKey: ['dados-empresa-documento'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
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

  const empresaNome = empresa.data?.nome_fantasia || empresa.data?.razao_social || 'Tecnoar Freios'

  return createPortal(
    <div className="fixed inset-0 z-70 overflow-y-auto bg-canvas">
      <style>{`@media print { .sem-impressao { display:none !important } .area-impressao { padding:0 !important } }`}</style>

      <div className="sem-impressao sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <Abas
          ativa={doc}
          aoMudar={setDoc}
          abas={[
            { valor: 'protocolo', rotulo: 'Protocolo' },
            { valor: 'etiqueta', rotulo: 'Etiqueta' },
            { valor: 'comprovante', rotulo: 'Comprovante de entrega' },
          ]}
        />
        <div className="flex gap-2">
          <Botao variante="primario" iconeInicio={<Printer />} onClick={() => window.print()}>
            Imprimir / PDF
          </Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>

      <div className="area-impressao mx-auto max-w-3xl p-6">
        <article className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-8 text-ink print:rounded-none print:border-0 print:p-0">
          <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
            <div className="flex items-center gap-4">
              <img src="/brand/tecnoar-positivo.svg" alt="Tecnoar Freios" className="h-14 w-auto" />
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[15px] font-bold">{empresaNome}</span>
                {empresa.data?.cnpj && (
                  <span className="num text-[11px] text-ink-2">CNPJ {mascaraDocumento(empresa.data.cnpj)}</span>
                )}
                {empresa.data?.telefone && <span className="text-[11px] text-ink-2">{empresa.data.telefone}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-display text-[11px] font-bold tracking-[0.16em] text-ink-2 uppercase">
                {doc === 'protocolo' ? 'Protocolo de recebimento' : doc === 'etiqueta' ? 'Etiqueta' : 'Comprovante de entrega'}
              </span>
              <span className="num text-2xl font-bold">{peca.protocolo}</span>
            </div>
          </header>

          {doc === 'etiqueta' ? (
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-ink p-8">
              <span className="num text-4xl font-bold tracking-wider">{peca.protocolo}</span>
              <span className="text-center font-display text-lg font-semibold">{peca.peca}</span>
              <span className="text-center text-[13px] text-ink-2">{peca.cliente?.nome_razao}</span>
              {peca.numero_serie && <span className="num text-[13px]">Série {peca.numero_serie}</span>}
              <span className="num text-[12px] text-ink-2">Entrada {dataHora(peca.entrada_em)}</span>
              <span className="num text-[12px] text-ink-2">Prazo {dataHora(peca.prazo_em)}</span>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-6">
                <Bloco titulo="Cliente">
                  <Linha rotulo="Nome" valor={peca.cliente?.nome_razao} />
                </Bloco>
                <Bloco titulo="Recebimento">
                  <Linha rotulo="Entrada" valor={dataHora(peca.entrada_em)} mono />
                  <Linha rotulo="Prazo (SLA)" valor={`${peca.sla_horas}h — ${dataHora(peca.prazo_em)}`} mono />
                  <Linha rotulo="Responsável" valor={peca.mecanico?.nome_completo} />
                  <Linha rotulo="Especialidade" valor={peca.especialidade?.nome} />
                </Bloco>
              </section>

              <Bloco titulo="Peça recebida">
                <Linha rotulo="Descrição" valor={peca.peca} destaque />
                <Linha rotulo="Fabricante" valor={peca.fabricante} />
                <Linha rotulo="Número de série" valor={peca.numero_serie} mono />
                <Linha rotulo="Quantidade" valor={String(peca.quantidade)} mono />
                <Linha rotulo="Problema relatado" valor={peca.descricao} />
              </Bloco>

              {doc === 'comprovante' && (
                <Bloco titulo="Laudo e entrega">
                  <Linha rotulo="Situação final" valor={peca.status} />
                  <Linha rotulo="Entregue em" valor={peca.entregue_em ? dataHora(peca.entregue_em) : 'Ainda não entregue'} mono />
                  {peca.laudo && (
                    <p className="mt-1 text-[12px] leading-relaxed whitespace-pre-wrap">{peca.laudo}</p>
                  )}
                </Bloco>
              )}

              <section className="mt-4 grid grid-cols-2 gap-10 pt-6">
                {['Cliente', 'Responsável Tecnoar'].map((r) => (
                  <div key={r} className="flex flex-col gap-1">
                    <div className="h-10 border-b border-ink" />
                    <span className="text-[11px] font-semibold">{r}</span>
                    <span className="text-[10px] text-ink-2">Assinatura</span>
                  </div>
                ))}
              </section>
            </>
          )}

          <footer className="num border-t border-line pt-3 text-center text-[10px] text-ink-2">
            Documento gerado pelo Sistema Operacional Tecnoar em {dataHora(new Date().toISOString())}
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
      <span className="w-36 shrink-0 text-ink-2">{rotulo}</span>
      <span className={[mono ? 'num' : '', destaque ? 'font-bold' : '', 'flex-1'].filter(Boolean).join(' ')}>
        {valor || '—'}
      </span>
    </div>
  )
}
