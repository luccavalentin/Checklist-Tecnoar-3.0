import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Camera, Check, Keyboard, Loader2, ScanLine, Server, Upload, X } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { mascaraDocumento } from '@/lib/formatos'
import { formatarPlaca, normalizarPlaca, placaValida, padraoDaPlaca } from '@/dados/placa'
import {
  useReconhecimentoPlaca,
  type CamposVeiculoLidos,
  type ClienteEncontrado,
  type ProprietarioLido,
  type ResultadoLeitura,
  type VeiculoEncontrado,
} from '@/dados/ReconhecimentoPlaca'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Aviso } from '@/componentes/ui/Aviso'

/**
 * Leitura de placa e do documento do veículo por foto.
 *
 * O fluxo é sempre o mesmo: foto → prévia → campos lidos com confiança →
 * confirmação do operador → busca do veículo. Em nenhum momento a leitura
 * decide sozinha: o operador confere o que foi lido, corrige o que estiver
 * errado e pode digitar direto se a câmera não ajudar. Falha de leitura nunca
 * trava a abertura da OS.
 *
 * Foto da placa preenche a placa. Foto do CRLV preenche também marca, modelo,
 * ano, cor, renavam e chassi — e identifica o proprietário pelo CPF/CNPJ.
 */
/** O que a foto leu, já conferido pelo operador, a caminho do cadastro. */
export interface LeituraConfirmada {
  tipo: 'placa' | 'crlv'
  campos: CamposVeiculoLidos
  proprietario: ProprietarioLido
  /** Cliente já cadastrado com o CPF/CNPJ do documento, quando existe. */
  cliente: ClienteEncontrado | null
}

export function LeitorPlaca({
  aberto,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  /** Recebe a placa normalizada, o que foi encontrado no cadastro e o que a foto leu. */
  aoConfirmar: (placa: string, encontrado: VeiculoEncontrado | null, lido: LeituraConfirmada | null) => void
}) {
  const { provedor, ler, buscarPorPlaca, buscarClientePorDocumento } = useReconhecimentoPlaca()
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

      let lido: LeituraConfirmada | null = null
      if (leitura?.estado === 'lida') {
        /* O documento do proprietário só serve para achar quem já é cliente.
           Não achou: a tela de cliente decide o que fazer com o nome lido. */
        const doc = leitura.proprietario.documento
        const cliente = doc ? await buscarClientePorDocumento(doc).catch(() => null) : null
        lido = {
          tipo: leitura.tipo,
          /* Vale a placa que o operador confirmou, não a que a foto sugeriu. */
          campos: { ...leitura.campos, placa: normalizada },
          proprietario: leitura.proprietario,
          cliente,
        }
      }
      return { normalizada, encontrado, lido }
    },
    onSuccess: ({ normalizada, encontrado, lido }) => {
      aoConfirmar(normalizada, encontrado, lido)
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
      titulo="Identificar por foto"
      descricao="Fotografe a placa ou o documento do veículo. Você confere o que foi lido antes de qualquer coisa ser gravada."
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
            Leitura por: <strong className="font-semibold text-ink">{provedor.nome}</strong>
          </span>
          <Selo tom={provedor.disponivel ? 'info' : 'neutro'}>
            {provedor.disponivel ? 'Automática' : 'Manual'}
          </Selo>
        </div>

        {!provedor.disponivel && (
          <Aviso tom="info" titulo="Leitura automática não configurada">
            Nenhum serviço de leitura está ligado neste ambiente. Você pode digitar a placa normalmente —
            a busca do veículo funciona igual.
          </Aviso>
        )}

        {/* prévia da foto */}
        {previa && (
          <div className="relative overflow-hidden rounded-lg border border-line">
            <img src={previa} alt="Foto enviada para leitura" className="max-h-56 w-full object-contain bg-inset" />
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
                <span className="text-[13px]">Lendo a foto…</span>
              </span>
            )}
          </div>
        )}

        {/* resultado da leitura */}
        {leitura && leitura.estado === 'lida' && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan/40 bg-cyan-soft p-3.5">
            <ScanLine aria-hidden className="size-4 shrink-0 text-cyan" />
            <div className="flex min-w-0 flex-col">
              <span className="lbl">{leitura.tipo === 'crlv' ? 'Placa no documento' : 'Placa lida na foto'}</span>
              <span className="num text-lg leading-none font-semibold text-ink">{formatarPlaca(leitura.placa)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Selo tom={confiancaTom(leitura.confianca)}>
                {Math.round(leitura.confianca * 100)}% de confiança
              </Selo>
            </div>
          </div>
        )}

        {/* campos do documento: o que vai entrar no cadastro, à vista */}
        {leitura?.estado === 'lida' && leitura.tipo === 'crlv' && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3.5">
            <span className="lbl">Lido no documento</span>
            <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {CAMPOS_VISIVEIS.map(([chave, rotulo]) => (
                <div key={chave} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="text-ink-3">{rotulo}</dt>
                  <dd className={cn('truncate text-right', leitura.campos[chave] ? 'text-ink' : 'text-ink-3')}>
                    {leitura.campos[chave] ?? 'não lido'}
                  </dd>
                </div>
              ))}
            </dl>
            {leitura.proprietario.nome && (
              <p className="border-t border-line pt-2 text-[12.5px] text-ink-2">
                Proprietário no documento: <strong className="font-semibold text-ink">{leitura.proprietario.nome}</strong>
                {leitura.proprietario.documento && ` · ${mascaraDocumento(leitura.proprietario.documento)}`}
              </p>
            )}
            <p className="text-[12px] text-ink-3">
              Confira antes de confirmar: o cadastro nasce com estes dados e você ainda pode corrigir cada campo.
            </p>
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
            Fotografar
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

/** O que a tela mostra do documento, na ordem em que se confere no papel. */
const CAMPOS_VISIVEIS: Array<[keyof CamposVeiculoLidos, string]> = [
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['ano', 'Ano'],
  ['cor', 'Cor'],
  ['renavam', 'Renavam'],
  ['chassi', 'Chassi'],
  ['municipio', 'Município'],
  ['uf', 'UF'],
]

function confiancaTom(c: number): 'ok' | 'atencao' | 'critico' {
  if (c >= 0.9) return 'ok'
  if (c >= 0.7) return 'atencao'
  return 'critico'
}
