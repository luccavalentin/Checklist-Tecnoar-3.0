import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Mic, Pause, Phone, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGravadorAudio } from '@/sos/componentes'
import { OCORRENCIAS } from '@/sos/rotulos'
import type { OcorrenciaSOS } from '@/sos/tipos'
import { PECA_OCORRENCIA, PECA_SINTOMA, sumirSeFalhar } from '../../comum/kit3d'
import { Arte } from '../../comum/Arte'
import { BotaoApp } from '../../comum/ui'
import type { AnexoPendente } from './AnexosPendentes'
import './passoProblema.css'

/**
 * Passo 1 do socorro: o que aconteceu.
 *
 * A LÓGICA ANTIGA, E POR QUE ELA ESTAVA ERRADA
 *
 * A tela abria com uma grade de DEZ quadradinhos e não deixava seguir sem
 * escolher um. Quatro problemas, todos graves:
 *
 * 1. PEDIA O DIAGNÓSTICO A QUEM NÃO PODE DAR. Classificar a pane é o
 *    trabalho de quem atende. A pessoa está parada no acostamento, muitas
 *    vezes no escuro e com pressa, e a primeira coisa que o app exigia dela
 *    era um laudo. Pior: "Não sei o que é" era a NONA opção da lista. Se a
 *    resposta honesta mais provável é "não sei", ela não pode estar em
 *    nono lugar — ela é o padrão.
 *
 * 2. A TAXONOMIA SE SOBREPUNHA, E ISSO REBAIXAVA EMERGÊNCIA. "Caminhão
 *    parado" é uma CONDIÇÃO, não uma causa, e convivia na mesma grade com
 *    "Problema nos freios". Quem parou por causa do freio podia marcar
 *    qualquer uma das duas — só que uma vale prioridade `alta` e a outra
 *    `emergencia`. Uma escolha de leigo mudava o despacho para pior.
 *
 * 3. ACIDENTE ERA UM QUADRADINHO. Ficava entre "Vazamento" e "Não sei o que
 *    é". Acidente com gente ferida não é chamado especialista: é 193. Oferecer
 *    isso como oitavo item de uma grade é falha de segurança, não de
 *    desenho.
 *
 * 4. A FALA VINHA DEPOIS. O gravador de áudio já existia no projeto — no
 *    PASSO 3. Ou seja: a pessoa só podia dizer "o ar acabou e travou o
 *    freio" depois de ter sido obrigada a encaixar isso numa caixinha. A
 *    ordem estava invertida, e no meio do caminho se perdia exatamente a
 *    informação que o especialista usaria.
 *
 * A LÓGICA NOVA
 *
 * Falar primeiro, classificar depois — e classificar é OPCIONAL. Sem
 * escolha, o chamado sai como `desconhecido`, cujo próprio texto já diz a
 * verdade: "O especialista descobre para você". Um áudio de oito segundos
 * dizendo o que houve vale mais para o despacho do que um palpite errado
 * numa grade, e custa menos para quem está pedindo socorro.
 *
 * Acidente sai da grade e vira a primeira coisa da tela, com o 193 ao lado.
 */
export function PassoProblema({
  seletorVeiculo,
  ocorrencia,
  aoEscolher,
  descricao,
  aoDescrever,
  anexos,
  aoMudarAnexos,
  aoContinuar,
}: {
  /** O bloco de escolha do veículo, montado pelo fluxo. */
  seletorVeiculo: ReactNode
  ocorrencia: OcorrenciaSOS | null
  aoEscolher: (o: OcorrenciaSOS | null) => void
  descricao: string
  aoDescrever: (t: string) => void
  anexos: AnexoPendente[]
  aoMudarAnexos: (a: AnexoPendente[]) => void
  aoContinuar: () => void
}) {
  const gravador = useGravadorAudio()
  const [erro, setErro] = useState<string | null>(null)
  const audio = anexos.find((a) => a.tipo === 'audio') ?? null

  async function alternarGravacao() {
    setErro(null)
    if (gravador.gravando) {
      const blob = await gravador.parar()
      if (!blob) return
      aoMudarAnexos([
        ...anexos.filter((a) => a.tipo !== 'audio'),
        { id: Math.random().toString(36).slice(2), blob, tipo: 'audio', url: URL.createObjectURL(blob), segundos: gravador.segundos },
      ])
      return
    }
    try {
      await gravador.iniciar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  function apagarAudio() {
    if (audio) URL.revokeObjectURL(audio.url)
    aoMudarAnexos(anexos.filter((a) => a.tipo !== 'audio'))
  }

  /* Acidente sai da grade: ele não é "mais um tipo de pane". */
  const lista = OPCOES.filter((o) => o !== 'acidente' && o !== 'desconhecido')

  return (
    <>
      {seletorVeiculo}

      {/* Primeira coisa da tela, antes de qualquer classificação. */}
      <a href="tel:193" className="pp-emergencia" onClick={() => aoEscolher('acidente')}>
        <span className="pp-emergencia-icone">
          <Arte src={PECA_SINTOMA.painel} alt="" classeImagem="size-11 object-contain" recuo={<TriangleAlert className="size-[19px]" strokeWidth={2.2} />} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="pp-emergencia-titulo">Acidente ou alguém ferido?</span>
          <span className="pp-emergencia-sub">Ligue 193 primeiro. O socorro da Tecnoar continua depois.</span>
        </span>
        <Phone className="size-5 shrink-0" />
      </a>

      <section aria-label="Conte o que aconteceu" className="pp-voz">
        <button
          type="button"
          onClick={() => void alternarGravacao()}
          disabled={!gravador.suportado}
          aria-label={gravador.gravando ? 'Parar a gravação' : 'Gravar um áudio contando o que aconteceu'}
          className={cn('pp-microfone', gravador.gravando && 'pp-microfone-gravando')}
        >
          {gravador.gravando ? <Square className="size-7" fill="currentColor" /> : <Mic className="size-8" strokeWidth={1.8} />}
        </button>
        <p className="pp-voz-titulo">
          {gravador.gravando ? 'Ouvindo…' : audio ? 'Gravado' : 'Conte com a sua voz'}
        </p>
        <p className="pp-voz-sub">
          {gravador.gravando
            ? 'Fale o que houve e toque para parar.'
            : audio
              ? 'O especialista ouve antes de sair.'
              : gravador.suportado
                ? 'É mais rápido que escrever, e o especialista entende melhor.'
                : 'Seu navegador não grava áudio. Escreva abaixo.'}
        </p>
        {gravador.gravando && <p className="pp-cronometro num">{relogio(gravador.segundos)}</p>}
      </section>

      {erro && <p className="pp-erro">{erro}</p>}
      {audio && !gravador.gravando && <ClipeAudio anexo={audio} aoApagar={apagarAudio} />}

      <label className="pp-escrever">
        <span className="pp-rotulo">Ou escreva, se preferir</span>
        <textarea
          value={descricao}
          onChange={(e) => aoDescrever(e.target.value.slice(0, 600))}
          rows={2}
          placeholder="Ex.: perdi o ar e o freio travou no km 243"
          className="pp-campo"
        />
      </label>

      <section aria-label="Tipo do problema" className="pp-tipos">
        <p className="pp-rotulo">
          O que mais parece? <span className="pp-opcional">opcional</span>
        </p>
        <div className="pp-tipos-lista">
          {lista.map((o) => {
            const d = OCORRENCIAS[o]
            const Icone = d.icone
            const peca = PECA_OCORRENCIA[o]
            const sel = ocorrencia === o
            return (
              <button
                key={o}
                type="button"
                aria-pressed={sel}
                /* Tocar de novo desmarca: escolheu errado e percebeu, volta
                   ao padrão em vez de ficar preso numa opção ruim. */
                onClick={() => aoEscolher(sel ? null : o)}
                className={cn('pp-tipo', sel && 'pp-tipo-sel')}
              >
                {peca ? (
                  <img src={peca} alt="" aria-hidden="true" width={320} height={320} loading="lazy" decoding="async" draggable={false} onError={sumirSeFalhar} className="pp-tipo-peca" />
                ) : (
                  <Icone className="size-[18px] shrink-0" strokeWidth={1.9} />
                )}
                <span className="min-w-0 flex-1 text-left">{d.rotulo}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="pp-seguir">
        <BotaoApp variante="sos" tamanho="lg" largo icone={ChevronRight} onClick={aoContinuar}>
          Continuar
        </BotaoApp>
        {!ocorrencia && (
          <p className="pp-seguir-nota">
            Sem escolher o tipo, o chamado sai como <strong>não sei o que é</strong> — e o especialista descobre no local.
          </p>
        )}
      </div>
    </>
  )
}

/** A ordem em que as opções aparecem, da mais grave para a mais comum. */
const OPCOES: OcorrenciaSOS[] = ['freios', 'nao_liga', 'parado', 'mecanico', 'pane_eletrica', 'roda_pneu', 'vazamento', 'acidente', 'desconhecido', 'outro']

function relogio(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** O áudio gravado, com ouvir e apagar. Quem grava precisa poder conferir. */
function ClipeAudio({ anexo, aoApagar }: { anexo: AnexoPendente; aoApagar: () => void }) {
  const som = useRef<HTMLAudioElement | null>(null)
  const [tocando, setTocando] = useState(false)
  return (
    <div className="pp-clipe">
      <button
        type="button"
        onClick={() => {
          const a = som.current
          if (!a) return
          if (a.paused) void a.play()
          else a.pause()
        }}
        aria-label={tocando ? 'Pausar' : 'Ouvir o que eu gravei'}
        className="pp-clipe-tocar"
      >
        {tocando ? <Pause className="size-[18px]" fill="currentColor" /> : <Play className="size-[18px]" fill="currentColor" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="pp-clipe-titulo">Seu áudio</span>
        <span className="pp-clipe-sub num">{relogio(anexo.segundos ?? 0)}</span>
      </span>
      <button type="button" onClick={aoApagar} aria-label="Apagar o áudio e gravar de novo" className="pp-clipe-apagar">
        <Trash2 className="size-[18px]" />
      </button>
      <audio
        ref={som}
        src={anexo.url}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
        className="hidden"
      />
    </div>
  )
}
