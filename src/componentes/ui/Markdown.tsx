import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Renderizador de Markdown técnico.
 *
 * Escrito à mão de propósito: nada de `dangerouslySetInnerHTML`, então texto
 * colado de qualquer lugar nunca vira HTML executável. Cobre o que a
 * documentação da oficina precisa — títulos, listas, tabelas, código, citação,
 * negrito, itálico e `código curto`.
 */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const linhas = (texto ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocos: ReactNode[] = []

  let i = 0
  let chave = 0

  const paragrafo: string[] = []
  function fecharParagrafo() {
    if (paragrafo.length === 0) return
    blocos.push(
      <p key={`p${chave++}`} className="text-[14px] leading-[1.75] text-ink-2">
        {inline(paragrafo.join(' '))}
      </p>,
    )
    paragrafo.length = 0
  }

  while (i < linhas.length) {
    const linha = linhas[i]

    /* código cercado */
    if (/^```/.test(linha)) {
      fecharParagrafo()
      const idioma = linha.slice(3).trim()
      const corpo: string[] = []
      i++
      while (i < linhas.length && !/^```/.test(linhas[i])) {
        corpo.push(linhas[i])
        i++
      }
      i++
      blocos.push(
        <pre
          key={`c${chave++}`}
          className="overflow-x-auto rounded-lg border border-line bg-inset p-4 text-[12.5px] leading-relaxed"
        >
          {idioma && <span className="lbl mb-2 block">{idioma}</span>}
          <code className="num text-ink-2">{corpo.join('\n')}</code>
        </pre>,
      )
      continue
    }

    /* títulos */
    const titulo = linha.match(/^(#{1,4})\s+(.*)$/)
    if (titulo) {
      fecharParagrafo()
      const nivel = titulo[1].length
      const texto = titulo[2].trim()
      const classes = [
        'font-display text-2xl font-semibold tracking-tight text-ink',
        'font-display text-xl font-semibold tracking-tight text-ink',
        'font-display text-[16px] font-semibold text-ink',
        'font-display text-[14px] font-semibold text-ink',
      ][nivel - 1]
      blocos.push(
        <h2 key={`h${chave++}`} className={cn(classes, 'mt-2 scroll-mt-24')}>
          {inline(texto)}
        </h2>,
      )
      i++
      continue
    }

    /* separador */
    if (/^(-{3,}|\*{3,})$/.test(linha.trim())) {
      fecharParagrafo()
      blocos.push(<hr key={`hr${chave++}`} className="border-line" />)
      i++
      continue
    }

    /* citação */
    if (/^>\s?/.test(linha)) {
      fecharParagrafo()
      const corpo: string[] = []
      while (i < linhas.length && /^>\s?/.test(linhas[i])) {
        corpo.push(linhas[i].replace(/^>\s?/, ''))
        i++
      }
      blocos.push(
        <blockquote key={`q${chave++}`} className="border-l-2 border-cyan pl-4 text-[13.5px] leading-relaxed text-ink-2 italic">
          {inline(corpo.join(' '))}
        </blockquote>,
      )
      continue
    }

    /* tabela */
    if (/\|/.test(linha) && i + 1 < linhas.length && /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(linhas[i + 1])) {
      fecharParagrafo()
      const celulas = (l: string) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
      const cabecalho = celulas(linha)
      i += 2
      const corpo: string[][] = []
      while (i < linhas.length && /\|/.test(linhas[i]) && linhas[i].trim() !== '') {
        corpo.push(celulas(linhas[i]))
        i++
      }
      blocos.push(
        <div key={`t${chave++}`} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {cabecalho.map((c, n) => (
                  <th key={n} className="px-3 py-2 text-left font-display text-[12px] font-semibold text-ink">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((linhaTabela, n) => (
                <tr key={n} className="border-b border-line last:border-0">
                  {linhaTabela.map((c, m) => (
                    <td key={m} className="px-3 py-2 align-top text-ink-2">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    /* listas */
    if (/^\s*([-*+]|\d+\.)\s+/.test(linha)) {
      fecharParagrafo()
      const ordenada = /^\s*\d+\./.test(linha)
      const itens: string[] = []
      while (i < linhas.length && /^\s*([-*+]|\d+\.)\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))
        i++
      }
      const conteudo = itens.map((it, n) => (
        <li key={n} className="text-[14px] leading-[1.7] text-ink-2">{inline(it)}</li>
      ))
      blocos.push(
        ordenada ? (
          <ol key={`l${chave++}`} className="flex list-decimal flex-col gap-1.5 pl-6">{conteudo}</ol>
        ) : (
          <ul key={`l${chave++}`} className="flex list-disc flex-col gap-1.5 pl-6">{conteudo}</ul>
        ),
      )
      continue
    }

    if (linha.trim() === '') {
      fecharParagrafo()
      i++
      continue
    }

    paragrafo.push(linha.trim())
    i++
  }
  fecharParagrafo()

  if (blocos.length === 0) {
    return <p className={cn('text-[13px] text-ink-3', className)}>Este artigo ainda não tem conteúdo.</p>
  }

  return <div className={cn('flex flex-col gap-4', className)}>{blocos}</div>
}

/** Negrito, itálico e código curto — sem HTML bruto. */
function inline(texto: string): ReactNode[] {
  const partes: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let n = 0

  while ((m = regex.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const t = m[0]
    if (t.startsWith('**')) {
      partes.push(<strong key={n++} className="font-semibold text-ink">{t.slice(2, -2)}</strong>)
    } else if (t.startsWith('`')) {
      partes.push(
        <code key={n++} className="num rounded border border-line bg-inset px-1 py-0.5 text-[12.5px] text-ink">
          {t.slice(1, -1)}
        </code>,
      )
    } else {
      partes.push(<em key={n++}>{t.slice(1, -1)}</em>)
    }
    ultimo = m.index + t.length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}
