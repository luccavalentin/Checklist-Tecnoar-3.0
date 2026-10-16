import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Building2, FastForward, Handshake, LifeBuoy, Plus, Power, Radio, Settings2, ShieldCheck, Timer, Waves } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { Aviso } from '@/componentes/ui/Aviso'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import { Selo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosDespachar, sosSalvarOnda } from '@/sos/api'
import {
  NIVEIS_PRESTADOR,
  PRIORIDADES,
  SITUACOES_MECANICO,
  TIPOS_PRESTADOR,
  descreverOnda,
  esperaDaOnda,
  faixaDaOnda,
  horaCurta,
} from '@/sos/rotulos'
import type { ChamadoSOS, NivelPrestador, OndaDespacho, PrioridadeSOS, SituacaoMecanico, TipoPrestador } from '@/sos/tipos'
import {
  CHAVE_ONDAS,
  ErroSOS,
  LinhaAlternador,
  aguardando,
  cronometro,
  invalidarSOS,
  lerNumero,
  useAgora,
  useConfigSOS,
  useOndasSOS,
  usePrestadoresSOS,
} from './comum'

/**
 * As ondas do despacho, em ordem — a política de `sos_politica_despacho`
 * escrita em português.
 *
 * Cada linha diz a quem o chamado é oferecido, em que faixa de distância, com
 * que situação de mecânico e quanto se espera antes de abrir a seguinte. As
 * faixas são dados, não código: mudar os 60 km da Tecnoar para 80 é editar um
 * campo aqui, sem publicar o sistema de novo.
 *
 * Duas ondas têm papel especial e ficam marcadas na tela: a **primeira**, que
 * é a janela exclusiva da Tecnoar, e a **última com espera 0**, a rede de
 * segurança — ela fica aberta até alguém aceitar e repete o comportamento
 * antigo do SOS (qualquer mecânico da casa vê o chamado).
 */
export function ListaOndas({ ondasLigadas }: { ondasLigadas: boolean }) {
  const consulta = useOndasSOS()
  const prestadores = usePrestadoresSOS()
  const [editando, setEditando] = useState<OndaDespacho | 'nova' | null>(null)

  const ondas = useMemo(() => [...(consulta.data ?? [])].sort((a, b) => a.ordem - b.ordem), [consulta.data])
  const ativas = ondas.filter((o) => o.ativo)
  // A rede de segurança é a última onda ativa que não tem prazo para vencer.
  const redeDeSeguranca = ativas.length && ativas[ativas.length - 1].espera_seg === 0 ? ativas[ativas.length - 1].id : null
  const temParceira = (prestadores.data ?? []).some((p) => p.tipo === 'parceiro' && p.situacao === 'ativo')

  if (consulta.isLoading) return <EstadoCarregando rotulo="Carregando as ondas…" className="min-h-40" />
  if (consulta.isError) return <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} compacto />

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!ondasLigadas && (
        <Aviso tom="atencao" titulo="As ondas estão desligadas">
          Com o despacho em ondas desligado, nada disto vale: o chamado vai de uma vez para todo mecânico disponível, sem raio. A política continua
          guardada e volta a valer quando você ligar a chave acima.
        </Aviso>
      )}

      {!temParceira && ativas.some((o) => o.tipo_prestador === 'parceiro') && (
        <Aviso tom="info" titulo="Nenhuma oficina parceira cadastrada">
          As ondas de parceiro não têm ninguém para oferecer hoje — o despacho pula cada uma delas na hora, sem fazer o cliente esperar o prazo, e
          cai na rede de segurança. Cadastre as parceiras em SOS › Prestadores.
        </Aviso>
      )}

      <ol className="flex min-w-0 flex-col">
        {ondas.map((o, i) => (
          <li key={o.id} className="flex min-w-0 flex-col">
            <CartaoOnda
              o={o}
              exclusivaTecnoar={o.ordem === 1 && o.tipo_prestador === 'proprio'}
              redeDeSeguranca={o.id === redeDeSeguranca}
              semCandidato={o.tipo_prestador === 'parceiro' && !temParceira}
              aoEditar={() => setEditando(o)}
            />
            {/* A seta diz o que a tabela não diz: uma onda leva à outra. */}
            {i < ondas.length - 1 && (
              <span aria-hidden className="flex items-center gap-2 py-1 pl-6 text-[11.5px] text-ink-3">
                <ArrowDown className="size-3.5" />
                {o.ativo ? (o.espera_seg ? `se ninguém aceitar em ${esperaDaOnda(o.espera_seg).replace('espera ', '')}` : 'onda final') : 'onda desligada'}
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] leading-relaxed text-ink-3">
          Onda sem ninguém elegível não faz o cliente esperar: o despacho segue para a seguinte na mesma hora.
        </p>
        <Botao variante="neutro" iconeInicio={<Plus />} onClick={() => setEditando('nova')} className="max-lg:h-11">
          Nova onda
        </Botao>
      </div>

      <ModalOnda onda={editando === 'nova' ? null : editando} aberto={editando !== null} aoFechar={() => setEditando(null)} ondas={ondas} />
    </div>
  )
}

function IconeDaOnda({ tipo }: { tipo: TipoPrestador | null }) {
  if (tipo === 'proprio') return <Building2 aria-hidden className="size-4" />
  if (tipo === 'parceiro') return <Handshake aria-hidden className="size-4" />
  return <Radio aria-hidden className="size-4" />
}

function CartaoOnda({
  o,
  exclusivaTecnoar,
  redeDeSeguranca,
  semCandidato,
  aoEditar,
}: {
  o: OndaDespacho
  exclusivaTecnoar: boolean
  redeDeSeguranca: boolean
  semCandidato: boolean
  aoEditar: () => void
}) {
  return (
    <article
      className={cn(
        'aresta relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border bg-surface p-3.5 shadow-e1',
        !o.ativo && 'border-dashed border-line opacity-70',
        o.ativo && exclusivaTecnoar && 'border-accent/45',
        o.ativo && redeDeSeguranca && 'border-ok/40',
        o.ativo && !exclusivaTecnoar && !redeDeSeguranca && 'border-line',
      )}
    >
      {o.ativo && <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', exclusivaTecnoar ? 'bg-accent' : redeDeSeguranca ? 'bg-ok' : 'bg-line-strong')} />}
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-[13px] font-bold',
            exclusivaTecnoar ? 'bg-accent text-on-accent' : redeDeSeguranca ? 'bg-ok-soft text-ok-ink' : 'bg-surface-2 text-ink-2 ring-1 ring-line',
          )}
        >
          {o.ordem}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-semibold text-ink">
              <span className={cn('shrink-0', o.tipo_prestador === 'proprio' ? 'text-accent' : o.tipo_prestador === 'parceiro' ? 'text-cyan' : 'text-ink-3')}>
                <IconeDaOnda tipo={o.tipo_prestador} />
              </span>
              <span className="truncate">{o.nome}</span>
            </span>
            {!o.ativo && <Selo tom="neutro">Desligada</Selo>}
            {exclusivaTecnoar && (
              <Selo tom="destaque" ponto>
                Janela exclusiva da Tecnoar
              </Selo>
            )}
            {redeDeSeguranca && (
              <Selo tom="ok" ponto>
                Rede de segurança
              </Selo>
            )}
          </p>
          {/* A política em uma frase: é assim que a central confere a regra. */}
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{descreverOnda(o)}</p>
          {o.observacoes && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{o.observacoes}</p>}
          {exclusivaTecnoar && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-accent-ink">
              <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Os primeiros {faixaDaOnda(o).replace('até ', '')} são da casa: nenhum parceiro recebe oferta enquanto esta onda está aberta.
            </p>
          )}
          {redeDeSeguranca && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-ok-ink">
              <LifeBuoy aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Sem prazo para vencer: fica aberta até alguém aceitar ou a central assumir. É o comportamento antigo do SOS — melhor um mecânico longe
              do que caminhoneiro sozinho na pista.
            </p>
          )}
          {semCandidato && o.ativo && <p className="mt-1.5 text-[12px] text-warn-ink">Sem parceira ativa cadastrada, esta onda é pulada na hora.</p>}
        </div>
        <Botao tamanho="sm" variante="neutro" iconeInicio={<Settings2 />} onClick={aoEditar} className="shrink-0 max-lg:h-11">
          Editar
        </Botao>
      </div>
    </article>
  )
}

/* ── cadastro da onda ───────────────────────────────────────────────────── */

type EscolhaPrestador = TipoPrestador | 'qualquer'

interface FormOnda {
  nome: string
  ordem: string
  tipo: EscolhaPrestador
  niveis: NivelPrestador[]
  raio_min_km: string
  raio_max_km: string
  situacoes: SituacaoMecanico[]
  espera_seg: string
  prioridades: PrioridadeSOS[]
  max_ofertas: string
  aceita_sem_posicao: boolean
  ativo: boolean
  observacoes: string
}

const VAZIA: FormOnda = {
  nome: '',
  ordem: '',
  tipo: 'proprio',
  niveis: [],
  raio_min_km: '0',
  raio_max_km: '60',
  situacoes: ['disponivel'],
  espera_seg: '90',
  prioridades: [],
  max_ofertas: '0',
  aceita_sem_posicao: false,
  ativo: true,
  observacoes: '',
}

const ORDEM_SITUACOES: SituacaoMecanico[] = ['disponivel', 'pausa', 'em_atendimento', 'indisponivel', 'offline']
const ORDEM_NIVEIS: NivelPrestador[] = ['ouro', 'prata', 'bronze']
const ORDEM_PRIORIDADES: PrioridadeSOS[] = ['emergencia', 'alta', 'normal']

function ModalOnda({ onda, aberto, aoFechar, ondas }: { onda: OndaDespacho | null; aberto: boolean; aoFechar: () => void; ondas: OndaDespacho[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState<FormOnda>(VAZIA)
  const [tentou, setTentou] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTentou(false)
    setF(
      onda
        ? {
            nome: onda.nome,
            ordem: String(onda.ordem),
            tipo: onda.tipo_prestador ?? 'qualquer',
            niveis: onda.niveis ?? [],
            raio_min_km: String(Number(onda.raio_min_km)),
            raio_max_km: String(Number(onda.raio_max_km)),
            situacoes: onda.situacoes ?? ['disponivel'],
            espera_seg: String(onda.espera_seg),
            prioridades: onda.prioridades ?? [],
            max_ofertas: String(onda.max_ofertas),
            aceita_sem_posicao: onda.aceita_sem_posicao,
            ativo: onda.ativo,
            observacoes: onda.observacoes ?? '',
          }
        : { ...VAZIA, ordem: String(Math.max(0, ...ondas.map((o) => o.ordem)) + 1) },
    )
  }, [aberto, onda, ondas])

  const mudar = <K extends keyof FormOnda>(k: K, v: FormOnda[K]) => setF((x) => ({ ...x, [k]: v }))

  // Só uma onda ativa por número (índice único no banco): o aviso vem antes
  // do erro, com o nome de quem já está naquele lugar.
  const conflito = useMemo(() => {
    const n = Number(f.ordem)
    if (!f.ativo || !Number.isInteger(n)) return undefined
    return ondas.find((o) => o.ativo && o.ordem === n && o.id !== onda?.id)
  }, [f.ordem, f.ativo, ondas, onda?.id])

  const erros = useMemo(() => {
    const e: Partial<Record<keyof FormOnda, string>> = {}
    if (!f.nome.trim()) e.nome = 'Dê um nome à onda.'
    const ordem = Number(f.ordem)
    if (!Number.isInteger(ordem) || ordem < 1 || ordem > 99) e.ordem = 'Número inteiro, de 1 a 99.'
    else if (conflito) e.ordem = `A onda “${conflito.nome}” já é a número ${ordem}. Desligue-a ou escolha outro número.`
    const min = lerNumero(f.raio_min_km)
    if (min == null || min < 0 || min > 3000) e.raio_min_km = 'De 0 a 3000 km.'
    const max = lerNumero(f.raio_max_km)
    if (max == null || max <= 0 || max > 3000) e.raio_max_km = 'De 1 a 3000 km.'
    else if (min != null && max <= min) e.raio_max_km = 'O raio final tem que ser maior que o inicial.'
    const espera = Number(f.espera_seg)
    if (!Number.isInteger(espera) || espera < 0 || espera > 3600) e.espera_seg = 'Segundos inteiros, de 0 a 3600 (0 = fica aberta).'
    const max_of = Number(f.max_ofertas)
    if (!Number.isInteger(max_of) || max_of < 0 || max_of > 99) e.max_ofertas = 'De 0 a 99 (0 = todos os elegíveis).'
    if (f.situacoes.length === 0) e.situacoes = 'Escolha pelo menos uma situação de mecânico.'
    return e
  }, [f, conflito])
  const valido = Object.keys(erros).length === 0
  const mostrar = (k: keyof FormOnda) => (tentou || (k === 'ordem' && !!conflito) ? erros[k] : undefined)

  const salvar = useMutation({
    mutationFn: () =>
      sosSalvarOnda({
        ...(onda ? { id: onda.id } : {}),
        ordem: Number(f.ordem),
        nome: f.nome.trim(),
        tipo_prestador: f.tipo === 'qualquer' ? null : f.tipo,
        niveis: f.niveis,
        raio_min_km: lerNumero(f.raio_min_km) ?? 0,
        raio_max_km: lerNumero(f.raio_max_km) ?? 60,
        situacoes: f.situacoes,
        espera_seg: Number(f.espera_seg),
        prioridades: f.prioridades,
        max_ofertas: Number(f.max_ofertas),
        aceita_sem_posicao: f.aceita_sem_posicao,
        ativo: f.ativo,
        observacoes: f.observacoes.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_ONDAS })
      toast.ok(onda ? 'Onda atualizada' : 'Onda criada', 'Vale para os chamados abertos daqui em diante.')
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar a onda', mensagemErro(e)),
  })

  // A frase da tela, montada com o que está no formulário: a central confere
  // a regra antes de salvar, sem precisar ler os campos um por um.
  const previa = descreverOnda({
    id: '',
    ordem: Number(f.ordem) || 1,
    nome: f.nome,
    tipo_prestador: f.tipo === 'qualquer' ? null : f.tipo,
    niveis: f.niveis,
    raio_min_km: lerNumero(f.raio_min_km) ?? 0,
    raio_max_km: lerNumero(f.raio_max_km) ?? 60,
    situacoes: f.situacoes.length ? f.situacoes : ['disponivel'],
    espera_seg: Number(f.espera_seg) || 0,
    prioridades: f.prioridades,
    max_ofertas: Number(f.max_ofertas) || 0,
    aceita_sem_posicao: f.aceita_sem_posicao,
    ativo: f.ativo,
    observacoes: null,
    created_at: '',
    updated_at: '',
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="lg"
      titulo={onda ? `Editar a onda ${onda.ordem}` : 'Nova onda de despacho'}
      descricao="A quem o chamado é oferecido, em que faixa de distância e quanto se espera antes de abrir a onda seguinte."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={salvar.isPending}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={salvar.isPending}
            onClick={() => {
              setTentou(true)
              if (valido) salvar.mutate()
            }}
          >
            {onda ? 'Salvar' : 'Criar onda'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-cyan/35 bg-cyan-soft/50 px-3.5 py-3">
          <p className="lbl text-cyan-ink">Como esta onda vai ficar</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{previa}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
          <Campo rotulo="Nome da onda" obrigatorio erro={mostrar('nome')} dica="Como a central reconhece a regra. Ex.: Tecnoar perto.">
            {(p) => <Entrada {...p} value={f.nome} maxLength={80} onChange={(e) => mudar('nome', e.target.value)} placeholder="Tecnoar perto" />}
          </Campo>
          <Campo rotulo="Número" obrigatorio erro={mostrar('ordem')} dica="A ordem em que abre.">
            {(p) => <Entrada {...p} inputMode="numeric" value={f.ordem} onChange={(e) => mudar('ordem', e.target.value.replace(/\D/g, '').slice(0, 2))} mono />}
          </Campo>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="lbl">A quem oferecer</span>
          <Segmentado<EscolhaPrestador>
            rotuloGrupo="A quem oferecer"
            valor={f.tipo}
            onChange={(v) => mudar('tipo', v)}
            className="[&>button]:min-h-11 lg:[&>button]:min-h-9"
            opcoes={[
              { valor: 'proprio', rotulo: TIPOS_PRESTADOR.proprio.curto },
              { valor: 'parceiro', rotulo: TIPOS_PRESTADOR.parceiro.curto },
              { valor: 'qualquer', rotulo: 'Qualquer um' },
            ]}
          />
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            {f.tipo === 'proprio'
              ? TIPOS_PRESTADOR.proprio.descricao
              : f.tipo === 'parceiro'
                ? TIPOS_PRESTADOR.parceiro.descricao
                : 'A Tecnoar e as parceiras juntas, sem prioridade entre elas.'}
          </p>
        </div>

        {f.tipo !== 'proprio' && (
          <Chips<NivelPrestador>
            rotulo="Níveis de parceiro"
            dica="Nada marcado = qualquer nível. É aqui que as ouro e prata vêm antes das bronze."
            opcoes={ORDEM_NIVEIS.map((n) => ({ valor: n, rotulo: NIVEIS_PRESTADOR[n].rotulo }))}
            valor={f.niveis}
            aoMudar={(v) => mudar('niveis', v)}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Do raio (km)" obrigatorio erro={mostrar('raio_min_km')} dica="0 = desde o lado do veículo.">
            {(p) => <Entrada {...p} inputMode="decimal" value={f.raio_min_km} onChange={(e) => mudar('raio_min_km', e.target.value)} mono />}
          </Campo>
          <Campo rotulo="Até o raio (km)" obrigatorio erro={mostrar('raio_max_km')} dica="Distância em linha reta, não de estrada.">
            {(p) => <Entrada {...p} inputMode="decimal" value={f.raio_max_km} onChange={(e) => mudar('raio_max_km', e.target.value)} mono />}
          </Campo>
        </div>

        <Chips<SituacaoMecanico>
          rotulo="Situação do mecânico"
          obrigatorio
          erro={mostrar('situacoes')}
          dica="A onda exclusiva chama só quem está disponível; as de reforço alargam para quem está em pausa ou terminando outro atendimento."
          opcoes={ORDEM_SITUACOES.map((s) => ({ valor: s, rotulo: SITUACOES_MECANICO[s].rotulo }))}
          valor={f.situacoes}
          aoMudar={(v) => mudar('situacoes', v)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Espera antes da onda seguinte (s)"
            obrigatorio
            erro={mostrar('espera_seg')}
            dica="0 = onda final: fica aberta até alguém aceitar ou a central assumir."
          >
            {(p) => <Entrada {...p} inputMode="numeric" value={f.espera_seg} onChange={(e) => mudar('espera_seg', e.target.value.replace(/\D/g, '').slice(0, 4))} iconeInicio={<Timer />} mono />}
          </Campo>
          <Campo rotulo="Máximo de ofertas por vez" erro={mostrar('max_ofertas')} dica="0 = oferece a todos os elegíveis.">
            {(p) => <Entrada {...p} inputMode="numeric" value={f.max_ofertas} onChange={(e) => mudar('max_ofertas', e.target.value.replace(/\D/g, '').slice(0, 2))} mono />}
          </Campo>
        </div>

        <Chips<PrioridadeSOS>
          rotulo="Só para estas prioridades"
          dica="Nada marcado = vale para qualquer prioridade. Emergência já espera menos por conta da configuração geral."
          opcoes={ORDEM_PRIORIDADES.map((p) => ({ valor: p, rotulo: PRIORIDADES[p].rotulo }))}
          valor={f.prioridades}
          aoMudar={(v) => mudar('prioridades', v)}
        />

        <LinhaAlternador
          rotulo="Aceitar quem está com o app fechado"
          texto="Sem posição recente, a distância vem da base do prestador; sem base, não se sabe onde a pessoa está. Ligado, ela entra nesta onda de qualquer forma — é o que impede alguém de ficar sem socorro por causa da tela apagada. Nas ondas de raio apertado, deixe desligado."
          ativo={f.aceita_sem_posicao}
          onChange={(v) => mudar('aceita_sem_posicao', v)}
          icone={<Radio />}
        />

        <LinhaAlternador
          rotulo="Onda ativa"
          texto="Desligada, a onda fica guardada e o despacho passa direto por ela."
          ativo={f.ativo}
          onChange={(v) => mudar('ativo', v)}
          icone={<Power />}
        />

        <Campo rotulo="Observações" dica="Por que esta onda existe — quem vier depois precisa entender a decisão.">
          {(p) => <AreaTexto {...p} rows={2} maxLength={1000} value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}

/** Lista de marcar/desmarcar em pastilhas: vazio tem significado próprio. */
function Chips<T extends string>({
  rotulo,
  dica,
  erro,
  obrigatorio,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string
  dica?: string
  erro?: string
  obrigatorio?: boolean
  opcoes: Array<{ valor: T; rotulo: string }>
  valor: T[]
  aoMudar: (v: T[]) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="lbl flex items-center gap-1">
        {rotulo}
        {obrigatorio && (
          <span className="text-accent" aria-hidden>
            *
          </span>
        )}
      </span>
      {dica && <p className="text-[11.5px] leading-relaxed text-ink-3">{dica}</p>}
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const marcado = valor.includes(o.valor)
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={marcado}
              onClick={() => aoMudar(marcado ? valor.filter((x) => x !== o.valor) : [...valor, o.valor])}
              className={cn(
                'flex min-h-11 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors lg:min-h-9',
                marcado ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
              )}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
      {erro && (
        <p className="text-[11.5px] font-medium text-crit-ink" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

/* ── a onda deste chamado ───────────────────────────────────────────────── */

/** Segundos que faltam para a onda vencer (null = onda sem prazo). */
function faltam(ate: string | null | undefined, agora: number): number | null {
  if (!ate) return null
  return Math.max(0, Math.round((Date.parse(ate) - agora) / 1000))
}

/**
 * A onda em que o chamado está, para o cartão da fila: "Onda 3 · Tecnoar
 * longe · 1:12". Chamado que não passou pelo despacho (modo manual) e chamado
 * já atendido não mostram nada — não há onda correndo.
 */
export function SeloOnda({ chamado: c, className }: { chamado: ChamadoSOS; className?: string }) {
  const ondas = useOndasSOS()
  const onda = c.onda_atual ?? 0
  if (!aguardando(c.status) || onda < 1) return null
  const info = (ondas.data ?? []).find((o) => o.ordem === onda)
  // O relógio de segundo em segundo só existe quando há prazo correndo: a
  // lista de chamados desenha até 200 cartões, e nenhum deles pode custar um
  // temporizador à toa.
  return c.onda_expira_em ? (
    <SeloOndaContando chamado={c} nome={info?.nome} detalhe={info && descreverOnda(info)} className={className} />
  ) : (
    <PastilhaOnda onda={onda} nome={info?.nome} detalhe={info && descreverOnda(info)} resta={null} className={className} />
  )
}

function SeloOndaContando({
  chamado: c,
  nome,
  detalhe,
  className,
}: {
  chamado: ChamadoSOS
  nome?: string
  detalhe?: string
  className?: string
}) {
  const agora = useAgora(1000)
  return <PastilhaOnda onda={c.onda_atual ?? 0} nome={nome} detalhe={detalhe} resta={faltam(c.onda_expira_em, agora)} className={className} />
}

function PastilhaOnda({
  onda,
  nome,
  detalhe,
  resta,
  className,
}: {
  onda: number
  nome?: string
  detalhe?: string
  resta: number | null
  className?: string
}) {
  const vencendo = resta != null && resta <= 15
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 ring-1 ring-inset ring-line',
        className,
      )}
      title={detalhe ?? `Onda ${onda} do despacho`}
    >
      <Waves aria-hidden className="size-3 shrink-0 text-cyan" />
      <span className="truncate">
        Onda {onda}
        {nome ? ` · ${nome}` : ''}
      </span>
      {resta != null ? (
        <span className={cn('num shrink-0', vencendo ? 'text-crit-ink' : 'text-ink-3')}>{cronometro(resta)}</span>
      ) : (
        <span className="shrink-0 text-ink-3">última</span>
      )}
    </span>
  )
}

/**
 * O despacho em ondas no painel do chamado: em que onda está, quanto falta
 * para a seguinte abrir, e o botão de empurrar na mão quando a central não
 * quer esperar o cronômetro.
 *
 * Quando as ondas terminaram sem ninguém (`sem_prestador_em`), o aviso é
 * forte de propósito: ninguém mais vai ser chamado sozinho, e o chamado
 * continua na fila esperando a central assumir.
 */
export function PainelOndaDoChamado({ chamado: c, podeDespachar }: { chamado: ChamadoSOS; podeDespachar: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ondas = useOndasSOS()
  const config = useConfigSOS()
  const agora = useAgora(1000)

  const lista = useMemo(() => [...(ondas.data ?? [])].filter((o) => o.ativo).sort((a, b) => a.ordem - b.ordem), [ondas.data])
  const onda = c.onda_atual ?? 0
  const atual = lista.find((o) => o.ordem === onda) ?? null
  const proxima = lista.find((o) => o.ordem > onda) ?? null
  const resta = faltam(c.onda_expira_em, agora)
  const ligado = config.data?.despacho_em_ondas !== false
  const semPrestador = !!c.sem_prestador_em

  const despachar = useMutation({
    mutationFn: () => sosDespachar(c.id),
    onSuccess: (r) => {
      invalidarSOS(qc, c.id)
      if (r.ok) {
        toast.ok(
          `Onda ${r.onda} aberta · ${r.nome ?? ''}`.trim(),
          `${r.ofertas ?? 0} mecânico(s) avisado(s)${r.ondas_vazias ? `. ${r.ondas_vazias} onda(s) sem ninguém elegível foram puladas.` : '.'}`,
        )
        return
      }
      if (r.motivo === 'sem_ondas') {
        toast.atencao('Não há mais onda para abrir', 'Todas terminaram sem ninguém elegível. Escolha o mecânico na mão, aqui embaixo.')
      } else if (r.motivo === 'despacho_em_ondas_desligado') {
        toast.atencao('O despacho em ondas está desligado', 'Em Configurações › Ondas de despacho a chave volta a ligar.')
      } else if (r.motivo === 'fora_da_fila') {
        toast.info('Este chamado já saiu da fila', 'Alguém aceitou ou a central já o atribuiu.')
      } else {
        toast.erro('O despacho não avançou', 'Confira a política em Configurações › Ondas de despacho.')
      }
    },
    onError: (e) => toast.erro('Não foi possível empurrar a onda', mensagemErro(e)),
  })

  if (!aguardando(c.status)) return null

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {semPrestador ? (
        // O chamado não foi cancelado: ele ficou sem ninguém para oferecer.
        <Aviso tom="critico" titulo="Nenhuma onda achou mecânico — assuma na mão">
          O despacho passou por todas as ondas e ninguém aceitou{c.sem_prestador_em ? ` (desde ${horaCurta(c.sem_prestador_em)})` : ''}. Nenhum
          mecânico vai mais ser chamado sozinho: ligue para quem pode sair e escolha abaixo, ou acione uma oficina parceira por telefone.
        </Aviso>
      ) : onda < 1 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface-2/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          {ligado
            ? 'Este chamado não passou pelo despacho em ondas — a fila é da central. Escolha o mecânico abaixo, ou empurre a primeira onda para o sistema oferecer.'
            : 'O despacho em ondas está desligado: o chamado foi para todo mecânico disponível, sem raio. Escolha o mecânico abaixo se ninguém aceitar.'}
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-cyan/35 bg-cyan-soft/45 px-3.5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <Waves aria-hidden className="size-4 shrink-0 text-cyan" />
              Onda {onda}
              {atual ? ` · ${atual.nome}` : ''}
            </span>
            {resta != null ? (
              <span className={cn('num rounded-md px-1.5 py-0.5 text-[12px] font-semibold', resta <= 15 ? 'bg-crit text-white' : 'bg-surface text-ink-2')}>
                {cronometro(resta)}
              </span>
            ) : (
              <Selo tom="ok">Fica aberta até alguém aceitar</Selo>
            )}
          </div>
          {atual && <p className="text-[12.5px] leading-relaxed text-ink-2">{descreverOnda(atual)}</p>}
          <p className="text-[12px] leading-relaxed text-ink-3">
            {proxima
              ? `A seguir, a onda ${proxima.ordem} · ${proxima.nome}: ${descreverOnda(proxima)}.`
              : 'É a última onda da política: ninguém mais será chamado automaticamente depois dela.'}
          </p>
        </div>
      )}

      {podeDespachar && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao
            variante="secundario"
            iconeInicio={<FastForward />}
            carregando={despachar.isPending}
            disabled={!ligado}
            title={ligado ? 'Abre agora a próxima onda, sem esperar o prazo' : 'O despacho em ondas está desligado'}
            onClick={() => despachar.mutate()}
            className="max-sm:h-11"
          >
            Empurrar próxima onda
          </Botao>
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-3">
            {proxima
              ? `Oferece o chamado à onda ${proxima.ordem} agora, sem esperar o cronômetro. Quem já recebeu oferta continua com ela.`
              : 'Não há onda seguinte: o sistema vai avisar a central de que ninguém foi encontrado.'}
          </p>
        </div>
      )}
    </div>
  )
}
