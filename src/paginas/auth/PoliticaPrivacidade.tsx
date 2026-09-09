import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/componentes/marca/Logo'
import { Aviso } from '@/componentes/ui/Aviso'
import { Botao } from '@/componentes/ui/Botao'

/**
 * A política é um documento jurídico da empresa: o sistema não redige um por
 * conta própria. Se houver URL cadastrada em Dados da Empresa, encaminha para
 * ela; caso contrário, informa honestamente que ainda não foi publicada.
 */
export function PoliticaPrivacidade() {
  const [url, setUrl] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    supabase
      .from('dados_empresa')
      .select('politica_privacidade_url')
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        setUrl(data?.politica_privacidade_url ?? null)
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas px-5 py-12">
      <Logo altura={56} />

      <div className="flex w-full max-w-xl flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="lbl">Documento</span>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Política de Privacidade</h1>
        </div>

        {carregando ? (
          <p className="text-[13px] text-ink-3">Carregando…</p>
        ) : url ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-2">
              A Política de Privacidade da Tecnoar está publicada no endereço abaixo.
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Botao variante="primario" iconeFim={<ExternalLink />}>
                Abrir política
              </Botao>
            </a>
          </div>
        ) : (
          <Aviso tom="atencao" titulo="Documento ainda não publicado">
            Nenhum endereço de Política de Privacidade foi cadastrado. Um administrador pode informá-lo em{' '}
            <strong className="font-semibold text-ink">Sistema › Dados da Empresa</strong>.
          </Aviso>
        )}

        <Link
          to="/entrar"
          className="flex items-center gap-2 pt-2 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Voltar ao login
        </Link>
      </div>
    </div>
  )
}
