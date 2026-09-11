import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData, mascaraDocumento } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando, EstadoErro } from '@/componentes/ui/Estados'
import { Markdown } from '@/componentes/ui/Markdown'
import type { DadosEmpresa, Ebook, EbookCapituloDetalhe } from '@/tipos/db'

/**
 * E-book montado a partir dos artigos publicados: capa com a identidade
 * Tecnoar, índice, capítulos e referências. Capítulos cujo artigo saiu do ar
 * ficam de fora e são declarados — o documento nunca inventa conteúdo.
 */
export function DocumentoEbook({ ebook, aoFechar }: { ebook: Ebook; aoFechar: () => void }) {
  const empresa = useQuery({
    queryKey: ['dados-empresa-documento'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const capitulos = useQuery({
    queryKey: ['ebook-documento', ebook.id],
    queryFn: async (): Promise<EbookCapituloDetalhe[]> => {
      const { data, error } = await supabase
        .from('vw_ebook_capitulos')
        .select('*')
        .eq('ebook_id', ebook.id)
        .order('ordem')
      if (error) throw error
      return (data ?? []) as unknown as EbookCapituloDetalhe[]
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

  const todos = capitulos.data ?? []
  const incluidos = todos.filter((c) => c.situacao === 'publicado')
  const fora = todos.filter((c) => c.situacao !== 'publicado')
  const empresaNome = empresa.data?.nome_fantasia || empresa.data?.razao_social || 'Tecnoar Freios'

  return createPortal(
    <div className="fixed inset-0 top-[env(safe-area-inset-top)] z-70 overflow-y-auto bg-canvas">
      <style>{`@media print {
        .sem-impressao { display:none !important }
        .quebra { break-before: page }
        .capa { min-height: 100vh }
      }`}</style>

      <div className="sem-impressao sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <span className="truncate font-display text-[15px] font-semibold text-ink">{ebook.titulo}</span>
        <div className="flex shrink-0 gap-2">
          <Botao variante="primario" iconeInicio={<Printer />} onClick={() => window.print()}>Imprimir / PDF</Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-6">
        {capitulos.isLoading ? (
          <EstadoCarregando />
        ) : capitulos.isError ? (
          <EstadoErro descricao={mensagemErro(capitulos.error)} aoTentarNovamente={() => void capitulos.refetch()} />
        ) : (
          <>
            {fora.length > 0 && (
              <div className="sem-impressao mb-5">
                <Aviso tom="atencao" titulo={`${fora.length} capítulo(s) fora do documento`}>
                  {fora.map((c) => c.titulo).join(' · ')} — o artigo não está publicado.
                </Aviso>
              </div>
            )}

            <article className="flex flex-col gap-10 rounded-lg border border-line bg-surface p-10 text-ink print:rounded-none print:border-0 print:p-0">
              {/* capa */}
              <header className="capa flex flex-col justify-between gap-10 border-b border-line pb-10">
                <img src="/brand/tecnoar-positivo.svg" alt={empresaNome} className="h-16 w-auto" />
                <div className="flex flex-col gap-4">
                  <span className="lbl text-cyan">Base Técnica Tecnoar</span>
                  <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">{ebook.titulo}</h1>
                  {ebook.subtitulo && <p className="text-lg text-ink-2">{ebook.subtitulo}</p>}
                  {ebook.descricao && <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-3">{ebook.descricao}</p>}
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-1 text-[12px] text-ink-3">
                  <span className="num">Versão {ebook.versao}</span>
                  <span className="num">
                    {ebook.publicado_em ? `Publicado em ${fmtData(ebook.publicado_em)}` : 'Documento em rascunho'}
                  </span>
                  <span>{empresaNome}</span>
                  {empresa.data?.cnpj && <span className="num">CNPJ {mascaraDocumento(empresa.data.cnpj)}</span>}
                </div>
              </header>

              {/* índice */}
              <section className="flex flex-col gap-4">
                <h2 className="font-display text-xl font-semibold tracking-tight">Índice</h2>
                {incluidos.length === 0 ? (
                  <p className="text-[13px] text-ink-3">Nenhum capítulo publicado neste e-book.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {incluidos.map((c, i) => (
                      <li key={c.id} className="flex items-baseline gap-3 border-b border-line pb-2 text-[13.5px]">
                        <span className="num w-6 shrink-0 text-ink-3">{i + 1}</span>
                        <span className="min-w-0 flex-1">{c.titulo}</span>
                        <span className="num shrink-0 text-[11.5px] text-ink-3">v{c.versao}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* capítulos */}
              {incluidos.map((c, i) => (
                <section key={c.id} className="quebra flex flex-col gap-5">
                  <header className="flex flex-col gap-2 border-b border-line pb-4">
                    <span className="lbl text-cyan">Capítulo {i + 1}</span>
                    <h2 className="font-display text-2xl leading-tight font-semibold tracking-tight">{c.titulo}</h2>
                    {c.resumo && <p className="text-[14px] leading-relaxed text-ink-2">{c.resumo}</p>}
                    <div className="flex flex-wrap gap-x-6 text-[11.5px] text-ink-3">
                      <span className="num">ART-{String(c.numero).padStart(4, '0')}</span>
                      <span className="num">v{c.versao}</span>
                      {c.categoria && <span>{c.categoria}</span>}
                      {c.fabricante && <span>{c.fabricante}</span>}
                    </div>
                  </header>
                  <Markdown texto={c.conteudo} />
                </section>
              ))}

              {/* referências */}
              {incluidos.length > 0 && (
                <section className="quebra flex flex-col gap-4">
                  <h2 className="font-display text-xl font-semibold tracking-tight">Referências</h2>
                  <p className="text-[13px] leading-relaxed text-ink-2">
                    Este documento reúne artigos publicados na Base Técnica Tecnoar, na versão vigente na data de
                    geração. Valores de torque, pressão e números de peça devem ser confirmados no manual do
                    fabricante antes da aplicação.
                  </p>
                  <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">
                    {incluidos.map((c) => (
                      <li key={c.id} className="num">
                        ART-{String(c.numero).padStart(4, '0')} · {c.titulo} · v{c.versao}
                        {c.publicado_em ? ` · publicado em ${fmtData(c.publicado_em)}` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <footer className="num border-t border-line pt-4 text-center text-[10.5px] text-ink-3">
                {empresaNome} · {ebook.titulo} · versão {ebook.versao} · gerado pelo Sistema Operacional Tecnoar em{' '}
                {fmtData(new Date().toISOString())}
              </footer>
            </article>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
