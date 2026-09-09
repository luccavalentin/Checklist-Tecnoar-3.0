import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Camera, Check, Keyboard, Loader2, ScanLine, Server, Upload, X } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { formatarPlaca, normalizarPlaca, placaValida, padraoDaPlaca } from '@/dados/placa'
import { useReconhecimentoPlaca, type ResultadoLeitura, type VeiculoEncontrado } from '@/dados/ReconhecimentoPlaca'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Aviso } from '@/componentes/ui/Aviso'

/**
 * Leitura de placa por foto.
 *
 * O fluxo é sempre o mesmo: foto → prévia → sugestão com confiança →
 * confirmação do operador → busca do veículo. Em nenhum momento a leitura
 * decide sozinha: o operador confirma ou corrige, e pode digitar direto se a
 * câmera não ajudar. Falha de leitura nunca trava a abertura da OS.
 */
export function LeitorPlaca({
  aberto,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  /** Recebe a placa normalizada e o que foi encontrado no cadastro (ou null). */
  aoConfirmar: (placa: string, encontrado: VeiculoEncontrado | null) => void
}) {
  const { provedor, ler, buscarPorPlaca } = useReconhecimentoPlaca()
  const camera = useRef<HTMLInputElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const [previa, setPrevia] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null)
  const [placa, setPlaca] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const analisar = useMutation({
    mutationFn: async (f: File) => {
      setErro(null)
      setPrevia(URL.createObjectURL(f))
      const r = await ler(f)
      setLeitura(r)
      if (r.estado === 'lida') setPlaca(formatarPlaca(r.placa))
      return r
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const confirmar = useMutation({
    mutationFn: async () => {
      setErro(null)
      const normalizada = normalizarPlaca(placa)
      if (!placaValida(normalizada)) {
        throw new Error('Placa fora dos padrões ABC-1234 ou ABC1D23.')
      }
      const encontrado = await buscarPorPlaca(normalizada)
      return { normalizada, encontrado }
    },
    onSuccess: ({ normalizada, encontrado }) => {
      aoConfirmar(normalizada, encontrado)
      limpar()
      aoFechar()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  function limpar() {
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(null)
    setLeitura(null)
    setPlaca('')
    setErro(null)
  }

  const padrao = padraoDaPlaca(placa)
  const confianca = leitura?.estado === 'lida' ? leitura.confianca : null

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => { limpar(); aoFechar() }}
      largura="md"
      titulo="Identificar pela placa"
      descricao="Foto, sugestão, confiança e confirmação manual antes de buscar o veículo."
      rodape={
        <>
          <Botao variante="neutro" onClick={() => { limpar(); aoFechar() }}>Cancelar</Botao>
          <Botao
            variante="primario"
            iconeInicio={<Check />}
            disabled={!placaValida(placa)}
            carregando={confirmar.isPending}
            onClick={() => confirmar.mutate()}
          >
            Confirmar placa
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
          <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
            <Server aria-hidden className="size-4 text-cyan" />
            Provider: <strong className="font-semibold text-ink">{provedor.nome}</strong>
          </span>
          <Selo tom={provedor.disponivel ? 'info' : 'neutro'}>
            {provedor.disponivel ? 'Mock/manual' : 'Manual'}
          </Selo>
        </div>

        {!provedor.disponivel && (
          <Aviso tom="info" titulo="Leitura automática não configurada">
            Nenhum serviço de OCR de placa está ligado neste ambiente. Você pode digitar a placa normalmente —
            a busca do veículo funciona igual.
          </Aviso>
        )}

        {/* prévia da foto */}
        {previa && (
          <div className="relative overflow-hidden rounded-lg border border-line">
            <img src={previa} alt="Foto da placa" className="max-h-56 w-full object-contain bg-inset" />
            <button
              type="button"
              onClick={limpar}
              className="absolute top-2 right-2 rounded-md bg-overlay p-1.5 text-white"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Descartar foto</span>
            </button>
            {analisar.isPending && (
              <span className="absolute inset-0 flex items-center justify-center gap-2 bg-overlay text-white">
                <Loader2 aria-hidden className="size-5 animate-spin" />
                <span className="text-[13px]">Lendo a placa…</span>
              </span>
            )}
          </div>
        )}

        {/* resultado da leitura */}
        {leitura && leitura.estado === 'lida' && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan/40 bg-cyan-soft p-3.5">
            <ScanLine aria-hidden className="size-4 shrink-0 text-cyan" />
            <div className="flex min-w-0 flex-col">
              <span className="lbl">Sugestão da leitura</span>
              <span className="num text-lg leading-none font-semibold text-ink">{formatarPlaca(leitura.placa)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Selo tom={confiancaTom(leitura.confianca)}>
                {Math.round(leitura.confianca * 100)}% de confiança
              </Selo>
            </div>
          </div>
        )}

        {leitura && leitura.estado !== 'lida' && (
          <Aviso tom="atencao" titulo="Sem leitura automática">{leitura.motivo}</Aviso>
        )}

        {(confianca !== null && confianca < 0.8) && (
          <Aviso tom="atencao">
            Confiança baixa. Confira caractere por caractere antes de confirmar.
          </Aviso>
        )}

        {/* captura */}
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) analisar.mutate(f)
              e.target.value = ''
            }}
          />
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) analisar.mutate(f)
              e.target.value = ''
            }}
          />
          <Botao variante="secundario" tamanho="lg" iconeInicio={<Camera />} onClick={() => camera.current?.click()}>
            Fotografar placa
          </Botao>
          <Botao variante="neutro" tamanho="lg" iconeInicio={<Upload />} onClick={() => arquivo.current?.click()}>
            Enviar imagem
          </Botao>
        </div>

        {/* confirmação / digitação */}
        <Campo
          rotulo="Placa"
          obrigatorio
          dica="Aceita ABC-1234 e ABC1D23."
          erro={placa && !placaValida(placa) ? 'Formato inválido.' : undefined}
        >
          {(p) => (
            <Entrada
              {...p}
              mono
              autoCapitalize="characters"
              autoComplete="off"
              value={placa}
              maxLength={8}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC-1234"
              iconeInicio={<Keyboard />}
              className={cn(padrao && 'border-ok')}
            />
          )}
        </Campo>

        {padrao && (
          <span className="text-[12px] text-ink-3">
            Padrão reconhecido: {padrao === 'antigo' ? 'placa antiga' : 'Mercosul'}.
          </span>
        )}
      </div>
    </Modal>
  )
}

function confiancaTom(c: number): 'ok' | 'atencao' | 'critico' {
  if (c >= 0.9) return 'ok'
  if (c >= 0.7) return 'atencao'
  return 'critico'
}
