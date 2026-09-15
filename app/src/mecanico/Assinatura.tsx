import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eraser, PenLine } from 'lucide-react'
import { useToast } from '@/componentes/ui/Toast'
import { sosEnviarAnexo } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { useOnline } from './dados'
import { BotaoM, CampoM, FolhaM } from './ui'

/**
 * Aceite do serviço no aparelho do mecânico: o cliente (ou o motorista)
 * assina com o dedo e a assinatura vira um anexo do chamado (tipo
 * "assinatura", etapa "conclusão"), guardado junto das fotos do chamado.
 */
export function FolhaAssinatura({ aberta, aoFechar, chamadoId, nomeSugerido }: { aberta: boolean; aoFechar: () => void; chamadoId: string; nomeSugerido?: string | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const tela = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [temTraco, setTemTraco] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Prepara a tela na densidade do aparelho (traço nítido no iPhone).
  useEffect(() => {
    if (!aberta) return
    setTemTraco(false)
    setNome(nomeSugerido ?? '')
    const id = window.requestAnimationFrame(() => {
      const c = tela.current
      if (!c) return
      const escala = window.devicePixelRatio || 1
      const r = c.getBoundingClientRect()
      c.width = Math.round(r.width * escala)
      c.height = Math.round(r.height * escala)
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.scale(escala, escala)
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0D1C33'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, r.width, r.height)
    })
    return () => window.cancelAnimationFrame(id)
  }, [aberta, nomeSugerido])

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    desenhando.current = true
    const p = ponto(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = ponto(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (!temTraco) setTemTraco(true)
  }

  function fim() {
    desenhando.current = false
  }

  function limpar() {
    const c = tela.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const r = c.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, r.width, r.height)
    setTemTraco(false)
  }

  async function salvar() {
    const c = tela.current
    if (!c || !temTraco) return
    setSalvando(true)
    try {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
      if (!blob) throw new Error('Não foi possível gerar a imagem da assinatura.')
      const legenda = ['Aceite do serviço', nome.trim()].filter(Boolean).join(' — ')
      await sosEnviarAnexo(chamadoId, blob, { tipo: 'assinatura', etapa: 'conclusao', legenda, nome: 'assinatura.png' })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
      toast.ok('Assinatura registrada', 'Ficou guardada no chamado, junto das fotos.')
      aoFechar()
    } catch (e) {
      toast.erro('Assinatura não enviada', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FolhaM
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Aceite do cliente"
      descricao="Peça ao cliente para conferir o serviço e assinar com o dedo."
      rodape={
        <>
          {!online && <p className="text-center text-[13px] font-medium text-warn-ink">A assinatura precisa de internet para ser enviada.</p>}
          <BotaoM variante="verde" tamanho="xl" largo icone={PenLine} carregando={salvando} disabled={!temTraco || !online} onClick={() => void salvar()}>
            Salvar assinatura
          </BotaoM>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <CampoM rotulo="Nome de quem assina (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" />
        <div className="relative">
          <canvas
            ref={tela}
            onPointerDown={inicio}
            onPointerMove={move}
            onPointerUp={fim}
            onPointerCancel={fim}
            onPointerLeave={fim}
            className="h-52 w-full touch-none rounded-2xl border-2 border-dashed border-line-strong bg-white"
            aria-label="Área para assinar"
          />
          {!temTraco && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-slate-400">Assine aqui</span>}
          <button
            type="button"
            onClick={limpar}
            className="absolute top-2 right-2 flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0D1C33]/85 px-3 text-[13px] font-bold text-white"
          >
            <Eraser className="size-4" /> Limpar
          </button>
        </div>
      </div>
    </FolhaM>
  )
}
