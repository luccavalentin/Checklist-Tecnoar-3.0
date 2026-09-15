import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'
import { sosEnviarAnexo } from '@/sos/api'
import { EnviarMidia, GaleriaAnexos, reduzirImagem } from '@/sos/componentes'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { DetalheChamado, EtapaAnexo } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { useOnline } from './dados'
import { FotosIa } from './Ia'
import { fotosDoCliente } from './PecasAtendimento'
import { SecaoM } from './ui'

/**
 * Fotos do veículo: ANTES (como foi encontrado) no local, DEPOIS (fotos
 * finais) em serviço. Um botão grande de câmera — várias fotos de uma vez,
 * reduzidas no aparelho antes de subir (rede de estrada é fraca).
 */
export function FotosAtendimento({ d }: { d: DetalheChamado }) {
  const { usuarioId } = useMecanico()
  const c = d.chamado
  const iniciado = c.status === 'servico_iniciado'
  const etapa: EtapaAnexo = iniciado ? 'depois' : 'antes'
  const doMecanico = d.anexos.filter((a) => a.autor_papel !== 'cliente' && a.etapa !== 'abertura' && a.tipo !== 'assinatura')
  const antes = doMecanico.filter((a) => a.etapa === 'antes')
  const depois = doMecanico.filter((a) => a.etapa === 'depois' || a.etapa === 'conclusao')
  const outras = doMecanico.filter((a) => !['antes', 'depois', 'conclusao'].includes(a.etapa))
  const doCliente = fotosDoCliente(d)

  return (
    <>
      <BotaoFoto chamadoId={c.id} etapa={etapa} rotulo={iniciado ? 'Tirar fotos finais' : 'Tirar fotos do veículo'} />

      <details className="rounded-[1.25rem] border border-line bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center px-4 text-[14.5px] font-semibold text-ink-2">Gravar áudio ou vídeo</summary>
        <div className="px-4 pb-4">
          <EnviarMidia chamadoId={c.id} etapa={etapa} />
        </div>
      </details>

      {iniciado && (
        <SecaoM titulo={`Fotos finais · ${depois.length}`}>
          <GaleriaAnexos anexos={depois} chamadoId={c.id} meuId={usuarioId} vazio="Nenhuma foto final ainda. Registre o serviço pronto." />
        </SecaoM>
      )}
      <SecaoM titulo={`Antes do serviço · ${antes.length}`}>
        <GaleriaAnexos anexos={antes} chamadoId={c.id} meuId={usuarioId} vazio="Nenhuma foto de como o veículo foi encontrado." />
      </SecaoM>
      {outras.length > 0 && (
        <SecaoM titulo={`Durante o serviço · ${outras.length}`}>
          <GaleriaAnexos anexos={outras} chamadoId={c.id} meuId={usuarioId} />
        </SecaoM>
      )}
      {doCliente.length > 0 && (
        <SecaoM titulo={`Enviadas pelo cliente · ${doCliente.length}`}>
          <GaleriaAnexos anexos={doCliente} chamadoId={c.id} />
        </SecaoM>
      )}

      <FotosIa d={d} />
    </>
  )
}

/** Botão grande de câmera (várias fotos de uma vez). */
export function BotaoFoto({ chamadoId, etapa, rotulo }: { chamadoId: string; etapa: EtapaAnexo; rotulo: string }) {
  const qc = useQueryClient()
  const online = useOnline()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function aoEscolher(lista: FileList | null) {
    const arquivos = Array.from(lista ?? [])
    if (!arquivos.length) return
    setErro(null)
    setEnviando({ feitas: 0, total: arquivos.length })
    try {
      for (let i = 0; i < arquivos.length; i++) {
        await sosEnviarAnexo(chamadoId, await reduzirImagem(arquivos[i]), { etapa })
        setEnviando({ feitas: i + 1, total: arquivos.length })
      }
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(null)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!!enviando || !online}
        onClick={() => entrada.current?.click()}
        className="flex min-h-[4.5rem] w-full items-center justify-center gap-3 rounded-[1.35rem] border-2 border-dashed border-accent/70 bg-accent-soft px-4 font-display text-[17px] font-extrabold tracking-[0.04em] text-accent-ink uppercase active:scale-[0.99] disabled:opacity-50"
      >
        {enviando ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" strokeWidth={2.4} />}
        {enviando ? `Enviando ${enviando.feitas + 1} de ${enviando.total}…` : rotulo}
      </button>
      {!online && <p className="text-center text-[13px] font-medium text-warn-ink">As fotos precisam de internet para subir.</p>}
      {erro && <p className="text-center text-[13px] font-semibold text-crit-ink">{erro}</p>}
      <input ref={entrada} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void aoEscolher(e.target.files).finally(() => (e.target.value = ''))} />
    </div>
  )
}
