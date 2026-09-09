import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro } from '@/componentes/ui/Estados'
import { Markdown } from '@/componentes/ui/Markdown'
import { Logo } from '@/componentes/marca/Logo'
import type { ArtigoListado } from '@/tipos/db'

/**
 * Leitura de artigo em tela cheia — a experiência de documentação técnica:
 * cabeçalho com metadados, sumário lateral e o texto em coluna estreita.
 */
export function LeitorArtigo({ artigoId, aoFechar }: { artigoId: string; aoFechar: () => void }) {
  const artigo = useQuery({
    queryKey: ['artigo', artigoId],
    queryFn: async (): Promise<ArtigoListado> => {
      const { data, error } = await supabase
        .from('artigos_tecnicos')
        .select('*, autor:usuarios!artigos_tecnicos_autor_id_fkey ( id, nome_completo ), revisor:usuarios!artigos_tecnicos_revisor_id_fkey ( id, nome_completo )')
        .eq('id', artigoId)
        .single()
      if (error) throw error
      return data as unknown as ArtigoListado
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

  const a = artigo.data
  const secoes = (a?.conteudo ?? '')
    .split('\n')
    .filter((l) => /^#{2,3}\s+/.test(l))
    .map((l) => l.replace(/^#{2,3}\s+/, '').trim())

  return createPortal(
    <div className="fixed inset-0 z-70 overflow-y-auto bg-canvas">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .sem-impressao { display:none !important }
          .artigo-print-shell { max-width: none !important; padding: 0 !important; }
          .artigo-print-grid { display: block !important; }
          .artigo-print-card { border: 0 !important; box-shadow: none !important; }
          .artigo-print-titulo { font-size: 22pt !important; line-height: 1.15 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="sem-impressao sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <span className="truncate font-display text-[15px] font-semibold text-ink">{a?.titulo ?? 'Artigo'}</span>
        <div className="flex shrink-0 gap-2">
          <Botao variante="neutro" iconeInicio={<Printer />} onClick={() => window.print()}>Imprimir / PDF</Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>

      <div className="artigo-print-shell mx-auto max-w-6xl p-6">
        {artigo.isLoading ? (
          <EstadoCarregando />
        ) : artigo.isError ? (
          <EstadoErro descricao={mensagemErro(artigo.error)} aoTentarNovamente={() => void artigo.refetch()} />
        ) : a ? (
          <div className="artigo-print-grid grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
            <article className="artigo-print-card flex flex-col gap-6 rounded-lg border border-line bg-surface p-6 shadow-e1">
              <header className="flex flex-col gap-4 border-b border-line pb-5">
                <div className="hidden items-center justify-between gap-6 border-b border-line pb-4 print:flex">
                  <Logo versao="positivo" altura={42} />
                  <div className="text-right">
                    <span className="lbl block">Base Técnica Tecnoar</span>
                    <span className="num text-[11px] text-ink-3">Impresso em {dataHora(new Date().toISOString())}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[12px] text-ink-3">ART-{String(a.numero).padStart(4, '0')}</span>
                  <Selo tom={a.situacao === 'publicado' ? 'ok' : a.situacao === 'arquivado' ? 'neutro' : 'atencao'}>
                    {a.situacao}
                  </Selo>
                  <span className="num text-[12px] text-ink-3">v{a.versao}</span>
                </div>
                <h1 className="artigo-print-titulo font-display text-3xl leading-tight font-semibold tracking-tight text-ink">{a.titulo}</h1>
                {a.resumo && <p className="text-[15px] leading-relaxed text-ink-2">{a.resumo}</p>}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-3">
                  {a.autor && <span>Autor: {a.autor.nome_completo}</span>}
                  {a.revisor && <span>Revisor: {a.revisor.nome_completo}</span>}
                  {a.publicado_em && <span className="num">Publicado em {dataHora(a.publicado_em)}</span>}
                  <span className="num">Atualizado em {dataHora(a.updated_at)}</span>
                </div>
              </header>

              <Markdown texto={a.conteudo} />
            </article>

            <aside className="sem-impressao flex flex-col gap-5 lg:sticky lg:top-20">
              {secoes.length > 0 && (
                <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
                  <h2 className="lbl">Neste artigo</h2>
                  <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">
                    {secoes.map((s, i) => <li key={i} className="truncate">{s}</li>)}
                  </ul>
                </section>
              )}

              <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                <h2 className="lbl">Classificação</h2>
                <Meta rotulo="Categoria" valor={a.categoria} />
                <Meta rotulo="Fabricante" valor={a.fabricante} />
                <Meta rotulo="Equipamento" valor={a.equipamento} />
                <Meta rotulo="Componente" valor={a.componente} />
                {a.codigos.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] text-ink-3">Códigos</span>
                    <div className="flex flex-wrap gap-1.5">
                      {a.codigos.map((c) => <Selo key={c} tom="info">{c}</Selo>)}
                    </div>
                  </div>
                )}
                {a.sintomas.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] text-ink-3">Sintomas</span>
                    <div className="flex flex-wrap gap-1.5">
                      {a.sintomas.map((c) => <Selo key={c} tom="atencao">{c}</Selo>)}
                    </div>
                  </div>
                )}
                {a.tags.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] text-ink-3">Tags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {a.tags.map((c) => <Selo key={c} tom="neutro">{c}</Selo>)}
                    </div>
                  </div>
                )}
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function Meta({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="flex gap-2 text-[12.5px]">
      <span className="w-24 shrink-0 text-ink-3">{rotulo}</span>
      <span className="min-w-0 flex-1 text-ink">{valor || '—'}</span>
    </div>
  )
}
