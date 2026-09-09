import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare, Settings2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Abas } from '@/componentes/ui/Abas'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { CanalIA } from './ia/CanalIA'
import { ConfiguracaoIA } from './ia/ConfiguracaoIA'

interface Situacao {
  provedor: string
  modelo: string
  configurada: boolean
  status: string
  transcricao_configurada: boolean
}

/**
 * Tecnoar IA.
 *
 * Duas faces do mesmo módulo: o canal onde a oficina conversa com a perita e
 * a configuração de quem administra. Ficam juntos porque quem descobre que a
 * IA não está configurada é justamente quem tentou usá-la.
 */
export function TecnoarIA() {
  const { pode } = usePermissoes()
  const [aba, setAba] = useState<'canal' | 'configuracao'>('canal')

  const podeVer = pode('tecnoar_ia', 'visualizar')
  const podeConfigurar = pode('tecnoar_ia', 'configurar')

  const situacao = useQuery({
    queryKey: ['ia-situacao'],
    enabled: podeVer,
    queryFn: async (): Promise<Situacao | null> => {
      const { data, error } = await supabase.rpc('ia_situacao')
      if (error) throw error
      return (data as unknown as Situacao[])?.[0] ?? null
    },
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Inteligência" titulo="Tecnoar IA" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const s = situacao.data
  const configurada = Boolean(s?.configurada)

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Inteligência"
        titulo="Tecnoar IA"
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Selo tom={configurada ? (s?.status === 'erro' ? 'critico' : 'ok') : 'neutro'} ponto>
              {configurada ? (s?.status === 'erro' ? 'Com erro' : 'Ativa') : 'Não configurada'}
            </Selo>
            <span className="text-[13px] text-ink-3">
              Perita em freio a ar, ABS, EBS, pneumática e diagnóstico eletrônico de pesados
            </span>
          </div>
        }
      />

      {podeConfigurar ? (
        <>
          <Abas
            ativa={aba}
            aoMudar={setAba}
            abas={[
              { valor: 'canal', rotulo: 'Canal de atendimento', icone: <MessagesSquare /> },
              { valor: 'configuracao', rotulo: 'Configuração', icone: <Settings2 /> },
            ]}
          />
          {aba === 'canal' ? <CanalIA configurada={configurada} /> : <ConfiguracaoIA />}
        </>
      ) : (
        <CanalIA configurada={configurada} />
      )}
    </div>
  )
}
