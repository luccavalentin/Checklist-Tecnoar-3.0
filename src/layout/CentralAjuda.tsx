import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, LifeBuoy, Mail, Phone, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import type { ArtigoAjuda, DadosEmpresa } from '@/tipos/db'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Entrada } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'

export function CentralAjuda({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [termo, setTermo] = useState('')
  const [artigo, setArtigo] = useState<ArtigoAjuda | null>(null)

  const artigos = useQuery({
    queryKey: ['ajuda-artigos', termo.trim()],
    enabled: aberto,
    queryFn: async (): Promise<ArtigoAjuda[]> => {
      let q = supabase.from('artigos_ajuda').select('*').eq('publicado', true).order('titulo').limit(40)
      const t = termo.trim()
      if (t.length >= 2) q = q.or(`titulo.ilike.%${t}%,resumo.ilike.%${t}%,categoria.ilike.%${t}%`)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const empresa = useQuery({
    queryKey: ['dados-empresa-suporte'],
    enabled: aberto,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const suporte = empresa.data
  const temSuporte = Boolean(suporte?.suporte_email || suporte?.suporte_telefone || suporte?.suporte_nome)

  if (artigo) {
    return (
      <PainelLateral
        aberto={aberto}
        aoFechar={() => setArtigo(null)}
        titulo={artigo.titulo}
        descricao={artigo.categoria ?? undefined}
        largura="lg"
      >
        <article className="flex flex-col gap-4">
          {artigo.resumo && <p className="text-[13.5px] leading-relaxed text-ink-2">{artigo.resumo}</p>}
          {artigo.conteudo ? (
            <div className="text-[13.5px] leading-[1.75] whitespace-pre-wrap text-ink-2">{artigo.conteudo}</div>
          ) : (
            <p className="text-[13px] text-ink-3">Este artigo ainda não tem conteúdo.</p>
          )}
        </article>
      </PainelLateral>
    )
  }

  return (
    <PainelLateral aberto={aberto} aoFechar={aoFechar} titulo="Central de Ajuda" largura="md">
      <div className="flex flex-col gap-5">
        <Entrada
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar artigo, tema ou dúvida"
          aria-label="Buscar na Central de Ajuda"
          iconeInicio={<Search />}
        />

        <section className="flex flex-col gap-3">
          <span className="lbl">Artigos</span>

          {artigos.isLoading && <EstadoCarregando rotulo="Carregando artigos…" className="min-h-40" />}

          {artigos.isError && (
            <EstadoErro
              descricao={mensagemErro(artigos.error)}
              aoTentarNovamente={() => void artigos.refetch()}
              compacto
            />
          )}

          {artigos.isSuccess && artigos.data.length === 0 && (
            <EstadoVazio
              icone={<BookOpen />}
              titulo={termo.trim() ? 'Nenhum artigo encontrado' : 'Nenhum artigo publicado'}
              descricao={
                termo.trim()
                  ? 'Tente outra palavra ou fale com o suporte.'
                  : 'A base de ajuda ainda não tem conteúdo publicado.'
              }
              compacto
            />
          )}

          {artigos.isSuccess && artigos.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {artigos.data.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setArtigo(a)}
                    className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="text-[13.5px] font-semibold text-ink">{a.titulo}</span>
                    {a.resumo && <span className="line-clamp-2 text-[12.5px] text-ink-2">{a.resumo}</span>}
                    {a.categoria && <span className="lbl mt-0.5">{a.categoria}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <span className="lbl">Suporte</span>
          {temSuporte ? (
            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
              {suporte?.suporte_nome && (
                <p className="flex items-center gap-2.5 text-[13.5px] text-ink">
                  <LifeBuoy aria-hidden className="size-4 text-cyan" />
                  {suporte.suporte_nome}
                </p>
              )}
              {suporte?.suporte_email && (
                <a
                  href={`mailto:${suporte.suporte_email}`}
                  className="flex items-center gap-2.5 text-[13.5px] text-cyan-ink hover:underline"
                >
                  <Mail aria-hidden className="size-4" />
                  {suporte.suporte_email}
                </a>
              )}
              {suporte?.suporte_telefone && (
                <a
                  href={`tel:${suporte.suporte_telefone.replace(/\D/g, '')}`}
                  className="flex items-center gap-2.5 text-[13.5px] text-cyan-ink hover:underline"
                >
                  <Phone aria-hidden className="size-4" />
                  {suporte.suporte_telefone}
                </a>
              )}
            </div>
          ) : (
            <Aviso tom="info">
              Nenhum contato de suporte foi configurado ainda. Um administrador pode preencher isso em{' '}
              <strong className="font-semibold text-ink">Sistema › Dados da Empresa</strong>.
            </Aviso>
          )}
        </section>
      </div>
    </PainelLateral>
  )
}
