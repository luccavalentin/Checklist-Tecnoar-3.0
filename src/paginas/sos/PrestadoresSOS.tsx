import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CircleDollarSign,
  Crosshair,
  HardHat,
  Handshake,
  MapPin,
  MapPinOff,
  Percent,
  Plus,
  Radius,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import { cn, iniciais, mensagemErro } from '@/lib/utils'
import { mascaraDocumento, mascaraTelefone } from '@/lib/formatos'
import { Aviso } from '@/componentes/ui/Aviso'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { Selo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosSalvarPrestador } from '@/sos/api'
import { MapaSOS, type MarcadorMapa } from '@/sos/Mapa'
import { buscarLugar, enderecoDoPonto, formatarCoordenadas, type Ponto } from '@/sos/geo'
import {
  NIVEIS_PRESTADOR,
  OCORRENCIAS,
  ORDEM_OCORRENCIAS,
  SITUACOES_PRESTADOR,
  TIPOS_PRESTADOR,
  formatarDistancia,
} from '@/sos/rotulos'
import type { NivelPrestador, OcorrenciaSOS, PrestadorListado, PrestadorSOS, SituacaoPrestador } from '@/sos/tipos'
import { CHAVE_PRESTADORES, ContatoRapido, ErroSOS, lerNumero, usePrestadoresSOS } from './comum'
import { extrairCoordenadas } from './NovoChamadoCentral'

/**
 * Quem atende o socorro: a Tecnoar e as oficinas parceiras.
 *
 * A Tecnoar fica sempre no topo — é o prestador `tipo: 'proprio'`, único por
 * índice no banco, que não se duplica nem vira parceira. Abaixo dela, as
 * parceiras com nível, situação, equipe e o desempenho do mês.
 *
 * O campo que mais pesa aqui é a **base de operação**: é dela que sai a
 * distância do mecânico quando ele está com o app fechado (o PWA não manda
 * GPS em segundo plano). Parceira sem base só entra nas ondas de reforço.
 */
export function PrestadoresSOS({ podeConfigurar }: { podeConfigurar: boolean }) {
  const consulta = usePrestadoresSOS(podeConfigurar)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<PrestadorListado | 'novo' | null>(null)

  const todos = useMemo(() => consulta.data ?? [], [consulta.data])
  // `sos_listar_prestadores` ordena pelo texto do tipo, e "parceiro" vem
  // antes de "proprio" no alfabeto: a Tecnoar é trazida para o topo aqui.
  const proprio = useMemo(() => todos.find((p) => p.tipo === 'proprio') ?? null, [todos])
  const parceiros = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR')
    return todos
      .filter((p) => p.tipo === 'parceiro')
      .filter(
        (p) =>
          !t ||
          p.nome.toLocaleLowerCase('pt-BR').includes(t) ||
          (p.base_municipio ?? '').toLocaleLowerCase('pt-BR').includes(t) ||
          (p.responsavel ?? '').toLocaleLowerCase('pt-BR').includes(t),
      )
  }, [todos, busca])

  const resumo = useMemo(() => {
    const ativos = todos.filter((p) => p.tipo === 'parceiro' && p.situacao === 'ativo')
    return {
      parceirosAtivos: ativos.length,
      mecanicos: todos.reduce((s, p) => s + Number(p.mecanicos ?? 0), 0),
      disponiveis: todos.reduce((s, p) => s + Number(p.disponiveis ?? 0), 0),
      mes: todos.reduce((s, p) => s + Number(p.atendimentos_mes ?? 0), 0),
    }
  }, [todos])

  if (!podeConfigurar) {
    return <EstadoSemPermissao descricao="Somente quem tem a permissão “Configurar” do SOS cadastra prestadores." />
  }
  if (consulta.isLoading) return <EstadoCarregando rotulo="Carregando prestadores…" />
  if (consulta.isError) return <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GradeMetricas colunas={4}>
        <Metrica rotulo="Parceiras ativas" valor={resumo.parceirosAtivos} glosa={`${parceiros.length} cadastrada${parceiros.length === 1 ? '' : 's'}`} tom="accent" icone={<Handshake />} />
        <Metrica rotulo="Mecânicos no socorro" valor={resumo.mecanicos} glosa="somando a Tecnoar e as parceiras" icone={<HardHat />} />
        <Metrica rotulo="Disponíveis agora" valor={resumo.disponiveis} tom={resumo.disponiveis > 0 ? 'ok' : 'atencao'} alerta={resumo.disponiveis === 0} icone={<Users />} />
        <Metrica rotulo="Atendimentos no mês" valor={resumo.mes} glosa="desde o dia 1º" tom="cyan" />
      </GradeMetricas>

      {/* A base de operação é o que dá distância a quem está com o app
          fechado: sem ela o parceiro só existe no mapa com o app aberto. */}
      <Aviso tom="info" titulo="A base de operação é o endereço que vale no despacho">
        O mecânico só aparece pela posição ao vivo enquanto está com o app aberto. Fechado, a distância do despacho é medida da{' '}
        <strong className="font-semibold text-ink">base de operação do prestador</strong> — por isso vale marcar o ponto da oficina no mapa. Parceira
        sem base só entra nas ondas de reforço, que aceitam mecânico sem posição.
      </Aviso>

      {proprio && <CartaoProprio p={proprio} aoEditar={() => setEditando(proprio)} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Entrada
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Oficina, município ou responsável"
            aria-label="Buscar oficina parceira"
            iconeInicio={<Search />}
            acaoFim={
              busca ? (
                <BotaoIcone rotulo="Limpar busca" tamanho="sm" onClick={() => setBusca('')}>
                  <X />
                </BotaoIcone>
              ) : undefined
            }
          />
        </div>
        <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setEditando('novo')} className="shrink-0 max-lg:h-11 sm:ml-auto">
          <span className="hidden min-[400px]:inline">Nova oficina parceira</span>
          <span className="min-[400px]:hidden">Nova parceira</span>
        </Botao>
      </div>

      {parceiros.length === 0 ? (
        <EstadoVazio
          icone={<Handshake />}
          titulo={busca ? 'Nenhuma parceira nesta busca' : 'Nenhuma oficina parceira cadastrada'}
          descricao={
            busca
              ? 'Troque a busca para ver as demais.'
              : 'Sem parceiras, todo chamado é atendido pela Tecnoar: as ondas de parceiro ficam vazias e o despacho segue direto para a onda seguinte. Cadastre as oficinas que você aciona quando a Tecnoar não alcança o veículo.'
          }
          acao={
            !busca ? (
              <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setEditando('novo')}>
                Nova oficina parceira
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {parceiros.map((p) => (
            <li key={p.id}>
              <CartaoParceiro p={p} aoEditar={() => setEditando(p)} />
            </li>
          ))}
        </ul>
      )}

      <ModalPrestador
        prestador={editando === 'novo' ? null : editando}
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        prestadores={todos}
      />
    </div>
  )
}

/* ── cartões ────────────────────────────────────────────────────────────── */

function textoBase(p: PrestadorSOS): string | null {
  const lugar = [p.base_municipio, p.base_uf].filter(Boolean).join('/')
  if (lugar) return lugar
  if (p.base_latitude != null && p.base_longitude != null) return formatarCoordenadas({ lat: p.base_latitude, lng: p.base_longitude })
  return null
}

function temBase(p: PrestadorSOS): boolean {
  return p.base_latitude != null && p.base_longitude != null
}

/** A Tecnoar: sempre no topo, sem nível nem repasse — a casa não é parceira. */
function CartaoProprio({ p, aoEditar }: { p: PrestadorListado; aoEditar: () => void }) {
  return (
    <article className="aresta relative overflow-hidden rounded-lg border border-accent/45 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 shadow-e1 sm:p-5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="lbl text-accent-ink">{TIPOS_PRESTADOR.proprio.rotulo}</p>
          <p className="truncate font-display text-[18px] leading-tight font-semibold text-ink">{p.nome}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
            Tem a primeira janela de todo chamado: as ondas 1 a 3 são só dela. Não pode ser duplicada nem virar parceira.
          </p>
        </div>
        <Botao variante="neutro" iconeInicio={<Settings2 />} onClick={aoEditar} className="shrink-0 max-sm:h-11">
          Editar
        </Botao>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-accent/25 pt-3.5 sm:grid-cols-4">
        <Dado rotulo="Mecânicos" valor={p.mecanicos} />
        <Dado rotulo="Disponíveis agora" valor={p.disponiveis} tom={p.disponiveis > 0 ? 'ok' : 'atencao'} />
        <Dado rotulo="Atendimentos no mês" valor={p.atendimentos_mes} />
        <Dado rotulo="Nota média" valor={p.nota_media != null ? Number(p.nota_media).toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '—'} />
      </dl>

      <div className="mt-3 flex min-w-0 items-start gap-2 text-[12.5px]">
        {temBase(p) ? (
          <>
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <p className="min-w-0 text-ink-2">
              Base de operação: <span className="font-medium text-ink">{textoBase(p)}</span> — é a distância que vale para o mecânico da casa com o
              app fechado.
            </p>
          </>
        ) : (
          <>
            <MapPinOff aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
            <p className="min-w-0 text-warn-ink">
              <strong className="font-semibold">Sem base de operação.</strong> O mecânico da casa com o app fechado fica sem distância e só entra nas
              ondas de reforço. Marque o ponto da oficina em Editar.
            </p>
          </>
        )}
      </div>
    </article>
  )
}

function CartaoParceiro({ p, aoEditar }: { p: PrestadorListado; aoEditar: () => void }) {
  const nivel = NIVEIS_PRESTADOR[p.nivel]
  const situacao = SITUACOES_PRESTADOR[p.situacao]
  const inativo = p.situacao !== 'ativo'
  return (
    <article className={cn('aresta flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-e1', inativo && 'opacity-80')}>
      <header className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-display text-[12.5px] font-bold text-ink-2 ring-1 ring-line">
          {iniciais(p.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14.5px] leading-snug font-semibold text-ink">{p.nome}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Selo tom={nivel.tom}>{nivel.rotulo}</Selo>
            <Selo tom={situacao.tom} ponto>
              {situacao.rotulo}
            </Selo>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex min-w-0 items-start gap-2">
          {temBase(p) ? (
            <>
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-cyan" />
              <p className="min-w-0 truncate text-ink-2">{textoBase(p)}</p>
            </>
          ) : (
            <>
              <MapPinOff aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
              <p className="min-w-0 text-warn-ink">Sem base: só nas ondas de reforço</p>
            </>
          )}
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <Radius aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <p className="num min-w-0 text-ink-2">Atende até {formatarDistancia(Number(p.raio_atuacao_km))} da base</p>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <Percent aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <p className="num min-w-0 text-ink-2">{Number(p.comissao_pct).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de repasse</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.atende_tipos.length === 0 ? (
            <span className="text-[11.5px] text-ink-3">Atende qualquer ocorrência</span>
          ) : (
            p.atende_tipos.map((t) => (
              <span key={t} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
                {(OCORRENCIAS[t] ?? OCORRENCIAS.outro).rotulo}
              </span>
            ))
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
        <Dado rotulo="Mecânicos" valor={`${p.disponiveis} de ${p.mecanicos}`} glosa="disponíveis" />
        <Dado rotulo="No mês" valor={p.atendimentos_mes} glosa="atendimentos" />
        <Dado rotulo="Nota média" valor={p.nota_media != null ? Number(p.nota_media).toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '—'} />
        <Dado rotulo="Responsável" valor={p.responsavel ?? '—'} />
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <ContatoRapido telefone={p.telefone} compacto />
        <Botao tamanho="sm" variante="neutro" iconeInicio={<Settings2 />} onClick={aoEditar} className="max-sm:h-11">
          Gerenciar
        </Botao>
      </div>
    </article>
  )
}

function Dado({ rotulo, valor, glosa, tom }: { rotulo: string; valor: string | number; glosa?: string; tom?: 'ok' | 'atencao' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{rotulo}</dt>
      <dd className={cn('num truncate text-[13.5px] font-semibold', tom === 'ok' ? 'text-ok-ink' : tom === 'atencao' ? 'text-warn-ink' : 'text-ink')}>
        {valor}
        {glosa && <span className="ml-1 text-[11px] font-normal text-ink-3">{glosa}</span>}
      </dd>
    </div>
  )
}

/* ── cadastro ───────────────────────────────────────────────────────────── */

interface FormPrestador {
  nome: string
  documento: string
  telefone: string
  email: string
  responsavel: string
  nivel: NivelPrestador
  situacao: SituacaoPrestador
  base: Ponto | null
  base_municipio: string
  base_uf: string
  raio_atuacao_km: string
  comissao_pct: string
  atende_tipos: OcorrenciaSOS[]
  observacoes: string
}

const VAZIO: FormPrestador = {
  nome: '',
  documento: '',
  telefone: '',
  email: '',
  responsavel: '',
  nivel: 'bronze',
  situacao: 'ativo',
  base: null,
  base_municipio: '',
  base_uf: '',
  raio_atuacao_km: '60',
  comissao_pct: '0',
  atende_tipos: [],
  observacoes: '',
}

function numeroCampo(n: number | null | undefined): string {
  return n == null ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function ModalPrestador({
  prestador,
  aberto,
  aoFechar,
  prestadores,
}: {
  prestador: PrestadorListado | null
  aberto: boolean
  aoFechar: () => void
  prestadores: PrestadorListado[]
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState<FormPrestador>(VAZIO)
  const [tentou, setTentou] = useState(false)
  // A Tecnoar não tem nível, raio nem repasse: ela vai onde a central mandar.
  const ehProprio = prestador?.tipo === 'proprio'

  useEffect(() => {
    if (!aberto) return
    setTentou(false)
    setF(
      prestador
        ? {
            nome: prestador.nome,
            documento: prestador.documento ? mascaraDocumento(prestador.documento) : '',
            telefone: prestador.telefone ? mascaraTelefone(prestador.telefone) : '',
            email: prestador.email ?? '',
            responsavel: prestador.responsavel ?? '',
            nivel: prestador.nivel,
            situacao: prestador.situacao,
            base:
              prestador.base_latitude != null && prestador.base_longitude != null
                ? { lat: prestador.base_latitude, lng: prestador.base_longitude }
                : null,
            base_municipio: prestador.base_municipio ?? '',
            base_uf: prestador.base_uf ?? '',
            raio_atuacao_km: numeroCampo(prestador.raio_atuacao_km),
            comissao_pct: numeroCampo(prestador.comissao_pct),
            atende_tipos: prestador.atende_tipos ?? [],
            observacoes: prestador.observacoes ?? '',
          }
        : VAZIO,
    )
  }, [aberto, prestador])

  const mudar = <K extends keyof FormPrestador>(k: K, v: FormPrestador[K]) => setF((x) => ({ ...x, [k]: v }))

  const erros = useMemo(() => {
    const e: Partial<Record<keyof FormPrestador, string>> = {}
    if (!f.nome.trim()) e.nome = 'Dê um nome ao prestador.'
    const doc = f.documento.replace(/\D/g, '')
    if (doc && doc.length !== 11 && doc.length !== 14) e.documento = 'CPF (11) ou CNPJ (14 dígitos).'
    else if (doc) {
      // Documento é único no banco; o aviso vem antes do erro de índice, com
      // o nome de quem já o tem.
      const dono = prestadores.find((p) => p.documento_digitos === doc && p.id !== prestador?.id)
      if (dono) e.documento = `Este documento já é de “${dono.nome}”.`
    }
    const tel = f.telefone.replace(/\D/g, '')
    if (tel && (tel.length < 10 || tel.length > 11)) e.telefone = 'DDD + número, como (13) 99999-9999.'
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'E-mail inválido.'
    if (f.base_uf.trim() && f.base_uf.trim().length !== 2) e.base_uf = 'Duas letras (SP, MT…).'
    if (!ehProprio) {
      const raio = lerNumero(f.raio_atuacao_km)
      if (raio == null || raio <= 0 || raio > 3000) e.raio_atuacao_km = 'De 1 a 3000 km.'
      const com = lerNumero(f.comissao_pct)
      if (com == null || com < 0 || com > 100) e.comissao_pct = 'De 0 a 100%.'
    }
    return e
  }, [f, ehProprio, prestadores, prestador?.id])
  const valido = Object.keys(erros).length === 0
  const mostrar = (k: keyof FormPrestador) => (tentou ? erros[k] : undefined)

  const salvar = useMutation({
    mutationFn: () => {
      const comum: Partial<PrestadorSOS> = {
        ...(prestador ? { id: prestador.id } : {}),
        nome: f.nome.trim(),
        documento: f.documento.replace(/\D/g, '') || null,
        telefone: f.telefone.replace(/\D/g, '') || null,
        email: f.email.trim() || null,
        responsavel: f.responsavel.trim() || null,
        base_latitude: f.base?.lat ?? null,
        base_longitude: f.base?.lng ?? null,
        base_municipio: f.base_municipio.trim() || null,
        base_uf: f.base_uf.trim().toUpperCase() || null,
        observacoes: f.observacoes.trim() || null,
      }
      // No próprio, nível, situação, raio, repasse e tipos atendidos não são
      // enviados: o banco mantém o que está, e a Tecnoar continua sem limite.
      if (ehProprio) return sosSalvarPrestador({ ...comum, tipo: 'proprio' })
      return sosSalvarPrestador({
        ...comum,
        tipo: 'parceiro',
        nivel: f.nivel,
        situacao: f.situacao,
        raio_atuacao_km: lerNumero(f.raio_atuacao_km) ?? 60,
        comissao_pct: lerNumero(f.comissao_pct) ?? 0,
        atende_tipos: f.atende_tipos,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_PRESTADORES })
      toast.ok(
        prestador ? 'Prestador atualizado' : 'Oficina parceira cadastrada',
        prestador ? 'Vale no próximo despacho.' : 'Para ela receber chamado, cadastre os mecânicos dela no prestador.',
      )
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar o prestador', mensagemErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="lg"
      titulo={prestador ? (ehProprio ? `Editar ${prestador.nome}` : 'Editar oficina parceira') : 'Nova oficina parceira'}
      descricao={
        ehProprio
          ? 'A Tecnoar. O nível, o raio e o repasse são das parceiras: a casa vai onde a central mandar.'
          : 'A oficina acionada quando a Tecnoar não alcança o veículo parado.'
      }
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
            {prestador ? 'Salvar' : 'Cadastrar prestador'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome" obrigatorio erro={mostrar('nome')} dica="Como a central chama a oficina. Ex.: Oficina do Zé — Santos.">
          {(p) => <Entrada {...p} value={f.nome} maxLength={120} onChange={(e) => mudar('nome', e.target.value)} placeholder="Oficina do Zé — Santos" />}
        </Campo>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="CPF/CNPJ" erro={mostrar('documento')} dica="Para o repasse. Um documento por prestador.">
            {(p) => <Entrada {...p} value={f.documento} onChange={(e) => mudar('documento', mascaraDocumento(e.target.value))} placeholder="00.000.000/0000-00" mono />}
          </Campo>
          <Campo rotulo="Responsável" dica="Quem a central procura quando o chamado é desta oficina.">
            {(p) => <Entrada {...p} value={f.responsavel} maxLength={120} onChange={(e) => mudar('responsavel', e.target.value)} placeholder="Nome de quem atende" />}
          </Campo>
          <Campo rotulo="Telefone" erro={mostrar('telefone')}>
            {(p) => <Entrada {...p} type="tel" inputMode="tel" value={f.telefone} onChange={(e) => mudar('telefone', mascaraTelefone(e.target.value))} placeholder="(13) 99999-9999" mono />}
          </Campo>
          <Campo rotulo="E-mail" erro={mostrar('email')}>
            {(p) => <Entrada {...p} type="email" value={f.email} maxLength={160} onChange={(e) => mudar('email', e.target.value)} placeholder="contato@oficina.com.br" />}
          </Campo>
        </div>

        {!ehProprio && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="lbl">Nível</span>
              <Segmentado<NivelPrestador>
                rotuloGrupo="Nível do parceiro"
                valor={f.nivel}
                onChange={(v) => mudar('nivel', v)}
                className="[&>button]:min-h-11 lg:[&>button]:min-h-9"
                opcoes={(['ouro', 'prata', 'bronze'] as const).map((v) => ({ valor: v, rotulo: NIVEIS_PRESTADOR[v].rotulo }))}
              />
              <p className="text-[11.5px] text-ink-3">{NIVEIS_PRESTADOR[f.nivel].descricao}.</p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="lbl">Situação</span>
              <Segmentado<SituacaoPrestador>
                rotuloGrupo="Situação do parceiro"
                valor={f.situacao}
                onChange={(v) => mudar('situacao', v)}
                className="[&>button]:min-h-11 lg:[&>button]:min-h-9"
                opcoes={(['ativo', 'suspenso', 'inativo'] as const).map((v) => ({ valor: v, rotulo: SITUACOES_PRESTADOR[v].rotulo }))}
              />
              <p className="text-[11.5px] text-ink-3">{SITUACOES_PRESTADOR[f.situacao].descricao}.</p>
            </div>
          </div>
        )}

        <SeletorBase
          ponto={f.base}
          nome={f.nome}
          aoMudarPonto={(p) => mudar('base', p)}
          municipio={f.base_municipio}
          uf={f.base_uf}
          erroUf={mostrar('base_uf')}
          aoMudarMunicipio={(v) => mudar('base_municipio', v)}
          aoMudarUf={(v) => mudar('base_uf', v)}
        />

        {!ehProprio && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                rotulo="Raio de atuação (km)"
                obrigatorio
                erro={mostrar('raio_atuacao_km')}
                dica="Até onde esta oficina se compromete a ir, medido da base. Chamado mais longe que isso não é oferecido a ela."
              >
                {(p) => <Entrada {...p} inputMode="decimal" value={f.raio_atuacao_km} onChange={(e) => mudar('raio_atuacao_km', e.target.value)} iconeInicio={<Radius />} mono />}
              </Campo>
              <Campo rotulo="Repasse (%)" obrigatorio erro={mostrar('comissao_pct')} dica="Quanto do atendimento fica com a parceira.">
                {(p) => <Entrada {...p} inputMode="decimal" value={f.comissao_pct} onChange={(e) => mudar('comissao_pct', e.target.value)} iconeInicio={<CircleDollarSign />} mono />}
              </Campo>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="lbl">Ocorrências que atende</span>
              <p className="text-[11.5px] leading-relaxed text-ink-3">
                Nada marcado = atende qualquer ocorrência. Marcando, a oficina só recebe oferta dos tipos escolhidos — é o que evita mandar pane
                elétrica para uma borracharia.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ORDEM_OCORRENCIAS.map((t) => {
                  const marcado = f.atende_tipos.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() =>
                        mudar('atende_tipos', marcado ? f.atende_tipos.filter((x) => x !== t) : [...f.atende_tipos, t])
                      }
                      className={cn(
                        'flex min-h-11 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors lg:min-h-9',
                        marcado ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
                      )}
                    >
                      {OCORRENCIAS[t].rotulo}
                    </button>
                  )
                })}
              </div>
              {f.atende_tipos.length > 0 && (
                <button
                  type="button"
                  onClick={() => mudar('atende_tipos', [])}
                  className="self-start text-[12px] font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                >
                  Limpar (voltar a atender qualquer ocorrência)
                </button>
              )}
            </div>
          </>
        )}

        <Campo rotulo="Observações" dica="O que a central precisa lembrar: horário de plantão, equipamentos, combinados de preço.">
          {(p) => <AreaTexto {...p} rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} />}
        </Campo>

        {!prestador && (
          <Aviso tom="atencao" titulo="Depois de cadastrar, falta ligar os mecânicos a esta oficina">
            O prestador só recebe oferta quando existe mecânico ligado a ele. As pessoas da oficina entram como usuários do Checklist, e a ligação
            com o prestador ainda é feita direto no banco (campo prestador_id da ficha do mecânico) — todo mecânico que já existe está na Tecnoar.
          </Aviso>
        )}
      </div>
    </Modal>
  )
}

/**
 * Base de operação: busca por endereço, coordenadas coladas do WhatsApp ou um
 * toque no mapa. É o ponto de onde o despacho mede a distância do mecânico
 * desta oficina quando ele está com o app fechado.
 */
function SeletorBase({
  ponto,
  nome,
  aoMudarPonto,
  municipio,
  uf,
  erroUf,
  aoMudarMunicipio,
  aoMudarUf,
}: {
  ponto: Ponto | null
  nome: string
  aoMudarPonto: (p: Ponto | null) => void
  municipio: string
  uf: string
  erroUf?: string
  aoMudarMunicipio: (v: string) => void
  aoMudarUf: (v: string) => void
}) {
  const [texto, setTexto] = useState('')
  const [lugares, setLugares] = useState<Array<Ponto & { nome: string }> | null>(null)
  const [procurando, setProcurando] = useState(false)
  const [centro, setCentro] = useState<Ponto | null>(ponto)

  // Município e UF em branco são preenchidos pelo endereço do ponto marcado:
  // o que a central digitou à mão nunca é sobrescrito.
  function escolher(p: Ponto, recentralizar = false) {
    aoMudarPonto(p)
    if (recentralizar) setCentro(p)
    if (municipio.trim() && uf.trim()) return
    void enderecoDoPonto(p).then((e) => {
      const ultimo = e?.split(' — ').pop() ?? ''
      const [cidade, estado] = ultimo.split('/')
      if (!municipio.trim() && cidade?.trim()) aoMudarMunicipio(cidade.trim())
      if (!uf.trim() && estado?.trim()) aoMudarUf(estado.trim().slice(0, 2).toUpperCase())
    })
  }

  async function procurar() {
    const t = texto.trim()
    if (!t) return
    const coords = extrairCoordenadas(t)
    if (coords) {
      setLugares(null)
      escolher(coords, true)
      return
    }
    setProcurando(true)
    try {
      setLugares(await buscarLugar(t))
    } finally {
      setProcurando(false)
    }
  }

  const marcadores: MarcadorMapa[] = ponto
    ? [{ id: 'base', ponto, tipo: 'mecanico', sigla: iniciais(nome || 'Base'), rotulo: 'Base de operação' }]
    : []

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface-2/50 p-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="lbl">Base de operação</span>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          O endereço da oficina. <strong className="font-semibold text-ink-2">É daqui que sai a distância do mecânico com o app fechado</strong> — o
          app instalado pelo navegador não manda GPS em segundo plano. Sem base, este prestador só entra nas ondas de reforço.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Entrada
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void procurar()
              }
            }}
            placeholder="Endereço, cidade ou coordenadas"
            aria-label="Buscar o endereço da base"
            iconeInicio={<Search />}
          />
        </div>
        <Botao variante="neutro" onClick={() => void procurar()} carregando={procurando} disabled={!texto.trim()} className="shrink-0 max-lg:h-11">
          Buscar
        </Botao>
      </div>

      {lugares && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {lugares.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">Nada encontrado. Tente a cidade ou a rua com o número.</li>}
          {lugares.map((l) => (
            <li key={`${l.lat},${l.lng}`} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  setLugares(null)
                  escolher(l, true)
                }}
                className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink hover:bg-surface-2"
              >
                <Crosshair aria-hidden className="size-4 shrink-0 text-cyan" />
                <span className="line-clamp-2">{l.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative isolate h-56 overflow-hidden rounded-xl border border-line sm:h-64">
        <MapaSOS marcadores={marcadores} centro={centro} zoom={13} tema="claro" aoClicarMapa={(p) => escolher(p)} className="size-full" />
        {!ponto && (
          <span className="pointer-events-none absolute inset-x-0 top-3 z-[600] mx-auto w-fit rounded-full bg-[#081830]/85 px-3 py-1.5 text-[12px] text-white shadow-e2">
            Toque no mapa para marcar a base
          </span>
        )}
      </div>

      {ponto ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <MapPin aria-hidden className="size-3.5 text-cyan" />
          <span className="num">{formatarCoordenadas(ponto)}</span>
          <button type="button" onClick={() => aoMudarPonto(null)} className="flex min-h-11 items-center gap-1 text-crit-ink hover:underline sm:min-h-8">
            <X aria-hidden className="size-3" /> Remover base
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn-ink">
          Sem o ponto no mapa, o mecânico deste prestador só tem distância enquanto está com o app aberto.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
        <Campo rotulo="Município">
          {(p) => <Entrada {...p} value={municipio} maxLength={80} onChange={(e) => aoMudarMunicipio(e.target.value)} placeholder="Santos" />}
        </Campo>
        <Campo rotulo="UF" erro={erroUf}>
          {(p) => <Entrada {...p} value={uf} maxLength={2} onChange={(e) => aoMudarUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="SP" mono />}
        </Campo>
      </div>
    </div>
  )
}
