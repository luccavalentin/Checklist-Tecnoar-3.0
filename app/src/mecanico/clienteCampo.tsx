import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CarFront,
  ChevronRight,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  UserRound,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraDocumento, mascaraPlaca, mascaraTelefone, somenteDigitos } from '@/lib/formatos'
import { sosBuscarClienteCampo } from '@/sos/api'
import type { ClienteCampo } from '@/sos/tipos'
import { useAlturaTeclado, useOnline } from './dados'
import { Placa } from './pecas'
import { BotaoM, CampoM, CartaoM, EsqueletoM, RodapeAcao, RotuloM, SecaoM, SeloM, TelaM, VazioM } from './ui'

/**
 * CLIENTE EM CAMPO — quem é o cliente, e com qual veículo.
 *
 * Um só componente para o chamado aberto pelo mecânico e para a OS aberta no
 * app: o mesmo campo busca por placa, nome, celular ou CPF/CNPJ no cadastro
 * de clientes do sistema Tecnoar (a tabela `clientes` do Checklist), e o
 * cliente novo, quando não existe, é cadastrado nessa mesma tabela pelo banco
 * — que reaproveita quem já tem o celular ou o documento em vez de duplicar.
 */

/** `id` nulo = cliente novo (o banco reaproveita pelo celular ou cadastra). */
export interface ClienteEscolhido {
  id: string | null
  nome: string
  telefone: string | null
  /** CPF/CNPJ informado no cadastro na hora (só quando a tela pede). */
  documento?: string | null
}

/** `id` nulo = veículo informado pela placa (o banco acha ou cadastra). */
export interface VeiculoEscolhido {
  id: string | null
  placa: string | null
  descricao: string | null
  osAberta: { id: string; numero: number } | null
}

export const PLACA_VALIDA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
export const normalizarPlaca = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function useAtrasado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return v
}

/* ── 1. cliente ─────────────────────────────────────────────────────────── */

interface FormCliente {
  /** Cliente já cadastrado (só falta o veículo) ou nulo para cliente novo. */
  cliente: ClienteEscolhido | null
  nome: string
  telefone: string
  placa: string
  modelo: string
}

/** O que foi digitado na busca já preenche o cadastro do cliente novo. */
function formDoTermo(termo: string): FormCliente {
  const t = termo.trim()
  const form: FormCliente = { cliente: null, nome: '', telefone: '', placa: '', modelo: '' }
  const alnum = normalizarPlaca(t)
  const dig = somenteDigitos(t)
  if (PLACA_VALIDA.test(alnum)) form.placa = alnum
  else if (dig.length >= 8 && dig.length === t.replace(/[\s().+-]/g, '').length) form.telefone = dig
  else if (t && !/\d/.test(t)) form.nome = t
  return form
}

export function PassoCliente({
  atual,
  aoEscolher,
  exigirVeiculo = false,
  pedirDocumento = false,
}: {
  atual: { cliente: ClienteEscolhido; veiculo: VeiculoEscolhido | null } | null
  aoEscolher: (c: ClienteEscolhido, v: VeiculoEscolhido | null) => void
  /** A OS exige veículo: sem ele, escolher o cliente leva ao cadastro da placa. */
  exigirVeiculo?: boolean
  /** Cadastro na hora pede CPF/CNPJ (opcional), que também evita duplicar cliente. */
  pedirDocumento?: boolean
}) {
  const online = useOnline()
  const [termo, setTermo] = useState('')
  const [form, setForm] = useState<FormCliente | null>(null)
  const busca = useAtrasado(termo.trim(), 350)
  const ativa = termo.trim().length >= 3 && busca.length >= 3

  const consulta = useQuery({
    queryKey: ['sos', 'cliente-campo', busca],
    queryFn: () => sosBuscarClienteCampo(busca),
    enabled: online && busca.length >= 3,
    staleTime: 30_000,
    retry: false,
    placeholderData: (anterior) => anterior,
  })

  if (form) {
    return (
      <FormularioCliente
        inicial={form}
        exigirVeiculo={exigirVeiculo}
        pedirDocumento={pedirDocumento}
        aoVoltar={() => setForm(null)}
        aoContinuar={(c, v) => {
          setForm(null)
          aoEscolher(c, v)
        }}
      />
    )
  }

  const resultados = ativa ? (consulta.data ?? []) : []
  const alnum = normalizarPlaca(busca)
  const procurando = ativa && (consulta.isFetching || termo.trim() !== busca)

  function escolherVeiculo(c: ClienteCampo, v: ClienteCampo['veiculos'][number]) {
    aoEscolher(
      { id: c.id, nome: c.nome, telefone: c.telefone },
      { id: v.id, placa: v.placa, descricao: v.veiculo, osAberta: v.os_aberta },
    )
  }

  const botaoNovo = (
    <BotaoM variante="contorno" tamanho="lg" largo icone={UserPlus} onClick={() => setForm(formDoTermo(termo))}>
      Cliente novo
    </BotaoM>
  )

  return (
    <TelaM comBarra={false} className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {atual && (
        <CartaoM className="flex flex-col gap-3 border-2 border-accent/50">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <UserCheck className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <RotuloM className="text-accent-ink">Escolhido</RotuloM>
              <p className="truncate font-display text-[17px] leading-tight font-extrabold text-ink">{atual.cliente.nome}</p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {atual.veiculo?.placa ? <Placa placa={atual.veiculo.placa} tamanho="sm" /> : <span className="text-[13px] text-ink-3">{atual.veiculo ? 'Veículo sem placa' : 'Sem veículo'}</span>}
              </div>
            </div>
          </div>
          <BotaoM
            variante="laranja"
            tamanho="lg"
            largo
            onClick={() =>
              exigirVeiculo && !atual.veiculo
                ? setForm({ cliente: atual.cliente, nome: atual.cliente.nome, telefone: atual.cliente.telefone ?? '', placa: '', modelo: '' })
                : aoEscolher(atual.cliente, atual.veiculo)
            }
          >
            Seguir com este cliente
          </BotaoM>
        </CartaoM>
      )}

      <label className="flex min-h-[3.9rem] items-center gap-3 rounded-2xl border-2 border-line bg-inset px-4 focus-within:border-accent">
        <Search aria-hidden className="size-6 shrink-0 text-ink-3" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Placa, nome ou telefone"
          aria-label="Buscar cliente por placa, nome ou telefone"
          autoFocus={!atual}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-3 text-[18px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
        />
        {procurando ? (
          <Loader2 aria-label="Buscando" className="size-5 shrink-0 animate-spin text-accent" />
        ) : termo ? (
          <button type="button" aria-label="Limpar busca" onClick={() => setTermo('')} className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2">
            <X className="size-5" />
          </button>
        ) : null}
      </label>

      {!online ? (
        <AvisoLinha icone={WifiOff} tom="ambar">
          Sem internet agora. A busca e o cadastro precisam de conexão — tente de novo quando o sinal voltar.
        </AvisoLinha>
      ) : !ativa ? (
        <>
          <p className="px-1 text-[14px] leading-relaxed text-ink-2">
            Digite pelo menos 3 letras ou números. Vale placa (<span className="num">ABC1D23</span>), nome, celular ou CPF/CNPJ.
          </p>
          {botaoNovo}
        </>
      ) : consulta.isError && !consulta.data ? (
        <ErroCarregar mensagem={(consulta.error as Error).message} tentando={consulta.isFetching} aoTentar={() => void consulta.refetch()} />
      ) : !consulta.data ? (
        <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Buscando clientes">
          <EsqueletoM className="h-32 rounded-[1.25rem]" />
          <EsqueletoM className="h-24 rounded-[1.25rem]" />
        </div>
      ) : resultados.length === 0 ? (
        <VazioM
          icone={Search}
          titulo="Nenhum cliente encontrado"
          texto="Confira a placa ou o telefone. Se for a primeira vez, cadastre como cliente novo — ele entra no cadastro de clientes do sistema Tecnoar."
          acao={
            <BotaoM variante="laranja" tamanho="lg" icone={UserPlus} onClick={() => setForm(formDoTermo(termo))}>
              Cadastrar cliente novo
            </BotaoM>
          }
        />
      ) : (
        <>
          {consulta.isError && (
            <AvisoLinha icone={AlertTriangle} tom="ambar">
              Não foi possível atualizar a busca. Mostrando o último resultado.
            </AvisoLinha>
          )}
          <ul className="flex flex-col gap-2.5">
            {resultados.map((c) => (
              <CartaoClienteCampo
                key={c.id}
                cliente={c}
                alnum={alnum}
                aoVeiculo={(v) => escolherVeiculo(c, v)}
                aoOutroVeiculo={() =>
                  setForm({ cliente: { id: c.id, nome: c.nome, telefone: c.telefone }, nome: c.nome, telefone: c.telefone ?? '', placa: PLACA_VALIDA.test(alnum) ? alnum : '', modelo: '' })
                }
              />
            ))}
          </ul>
          <p className="px-1 pt-1 text-center text-[13px] text-ink-3">Não é nenhum destes?</p>
          {botaoNovo}
        </>
      )}
    </TelaM>
  )
}

function CartaoClienteCampo({
  cliente: c,
  alnum,
  aoVeiculo,
  aoOutroVeiculo,
}: {
  cliente: ClienteCampo
  alnum: string
  aoVeiculo: (v: ClienteCampo['veiculos'][number]) => void
  aoOutroVeiculo: () => void
}) {
  // A placa buscada vem primeiro (e em destaque).
  const bate = (placa: string) => alnum.length >= 3 && normalizarPlaca(placa).startsWith(alnum)
  const veiculos = [...c.veiculos].sort((a, b) => Number(bate(b.placa)) - Number(bate(a.placa)))
  return (
    <li className="overflow-hidden rounded-[1.25rem] border border-line bg-surface mec-sombra">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] leading-tight font-extrabold text-ink">{c.nome}</p>
          {c.telefone && <p className="num truncate text-[13px] text-ink-3">{mascaraTelefone(c.telefone)}</p>}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-line border-t border-line">
        {veiculos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => aoVeiculo(v)}
            className={cn('flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2', bate(v.placa) && 'bg-accent-soft/45')}
          >
            <Placa placa={v.placa} tamanho="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-tight font-semibold text-ink">{v.veiculo ?? 'Modelo não informado'}</span>
              {(v.os_aberta || v.km_atual) && (
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                  {v.os_aberta && <SeloM tom="ciano">OS nº {v.os_aberta.numero} aberta</SeloM>}
                  {v.km_atual ? <span className="num">{v.km_atual.toLocaleString('pt-BR')} km</span> : null}
                </span>
              )}
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-3" />
          </button>
        ))}
        <button type="button" onClick={aoOutroVeiculo} className="flex min-h-12 w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-bold text-accent-ink active:bg-surface-2">
          <Plus className="size-4 shrink-0" />
          {veiculos.length ? 'Outro veículo ou sem placa' : 'Escolher este cliente'}
        </button>
      </div>
    </li>
  )
}

function FormularioCliente({
  inicial,
  exigirVeiculo,
  pedirDocumento,
  aoVoltar,
  aoContinuar,
}: {
  inicial: FormCliente
  exigirVeiculo: boolean
  pedirDocumento: boolean
  aoVoltar: () => void
  aoContinuar: (c: ClienteEscolhido, v: VeiculoEscolhido | null) => void
}) {
  const teclado = useAlturaTeclado()
  const existente = inicial.cliente
  const [nome, setNome] = useState(inicial.nome)
  const [telefone, setTelefone] = useState(mascaraTelefone(inicial.telefone))
  const [placa, setPlaca] = useState(mascaraPlaca(inicial.placa))
  const [modelo, setModelo] = useState(inicial.modelo)
  const [documento, setDocumento] = useState('')
  const [tentou, setTentou] = useState(false)

  const placaN = normalizarPlaca(placa)
  const dig = somenteDigitos(telefone)
  const erroNome = !existente && nome.trim().length < 3 ? 'Informe o nome do cliente.' : null
  const erroTel = !existente && (dig.length < 10 || dig.length > 11) ? 'Celular com DDD: 10 ou 11 números.' : null
  const docDig = somenteDigitos(documento)
  const erroDoc = !existente && docDig && docDig.length !== 11 && docDig.length !== 14 ? 'CPF com 11 números ou CNPJ com 14.' : null
  const erroPlaca = !placaN
    ? exigirVeiculo
      ? 'Informe a placa: a OS precisa do veículo.'
      : null
    : !PLACA_VALIDA.test(placaN)
      ? 'Placa inválida. Ex.: ABC1D23 (Mercosul) ou ABC1234.'
      : null
  const temVeiculo = !!placaN || !!modelo.trim()

  function continuar() {
    setTentou(true)
    if (erroNome || erroTel || erroPlaca || erroDoc) return
    const c: ClienteEscolhido = existente ?? { id: null, nome: nome.trim(), telefone: mascaraTelefone(dig), documento: docDig || null }
    const v: VeiculoEscolhido | null = temVeiculo ? { id: null, placa: placaN || null, descricao: modelo.trim() || null, osAberta: null } : null
    aoContinuar(c, v)
  }

  return (
    <>
      <TelaM comBarra={false} className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
        {existente ? (
          <CartaoM className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <UserCheck className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] leading-tight font-extrabold text-ink">{existente.nome}</p>
              {existente.telefone && <p className="num truncate text-[13px] text-ink-3">{mascaraTelefone(existente.telefone)}</p>}
            </div>
            <BotaoM variante="neutro" tamanho="md" onClick={aoVoltar}>
              Trocar
            </BotaoM>
          </CartaoM>
        ) : (
          <>
            <button type="button" onClick={aoVoltar} className="-mb-1 flex min-h-11 items-center gap-1 self-start px-1 text-[14px] font-bold text-accent-ink">
              <Search className="size-4" /> Voltar para a busca
            </button>
            <AvisoLinha icone={UserPlus} tom="ciano">
              Cliente novo entra no cadastro de clientes do sistema Tecnoar, e a central recebe um aviso para completar. Se o celular{pedirDocumento ? ' ou o CPF/CNPJ' : ''} já existir, o sistema usa o cadastro que já tem.
            </AvisoLinha>
            <CampoM
              rotulo="Nome do cliente *"
              icone={UserRound}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              autoFocus={!nome}
              maxLength={120}
              erro={tentou ? erroNome : null}
            />
            <CampoM
              rotulo="Celular com DDD *"
              icone={Phone}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="(11) 98765-4321"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              erro={tentou ? erroTel : null}
              dica="A central e o cliente usam este número para falar sobre o atendimento."
            />
            {pedirDocumento && (
              <CampoM
                rotulo="CPF ou CNPJ (opcional)"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Só números"
                value={documento}
                onChange={(e) => setDocumento(mascaraDocumento(e.target.value))}
                erro={tentou || docDig.length >= 11 ? erroDoc : null}
                dica="Com o documento o cadastro já fica pronto para faturar."
              />
            )}
          </>
        )}

        <SecaoM titulo="Veículo">
          <CampoM
            rotulo={exigirVeiculo ? 'Placa *' : 'Placa'}
            icone={CarFront}
            value={placa}
            onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
            placeholder="ABC-1D23"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="[&_input]:font-semibold [&_input]:tracking-[0.08em]"
            erro={tentou || placaN.length >= 7 ? erroPlaca : null}
            dica={exigirVeiculo ? 'Mercosul ou modelo antigo. Se a placa já existir, o sistema usa o veículo cadastrado.' : 'Mercosul ou modelo antigo. Com a placa, a OS já pode sair junto.'}
          />
          <CampoM
            rotulo="Modelo (opcional)"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Ex.: Scania R450 2019"
            autoComplete="off"
            maxLength={120}
            dica={!exigirVeiculo && !placaN && modelo.trim() ? 'Sem placa, o modelo vai na descrição do chamado.' : undefined}
          />
        </SecaoM>
      </TelaM>
      <RodapeAcao teclado={teclado}>
        <BotaoM variante="laranja" tamanho={teclado ? 'lg' : 'xl'} largo onClick={continuar}>
          {temVeiculo || exigirVeiculo ? 'Continuar' : 'Continuar sem veículo'}
        </BotaoM>
      </RodapeAcao>
    </>
  )
}

export function ErroCarregar({ mensagem, tentando, aoTentar }: { mensagem: string; tentando: boolean; aoTentar: () => void }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-5 py-7 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-crit-soft text-crit-ink">
        <AlertTriangle className="size-7" />
      </span>
      <p className="font-display text-[17px] font-bold text-ink">Não foi possível buscar</p>
      <p className="max-w-xs text-[14px] leading-relaxed text-ink-2">{mensagem}</p>
      <BotaoM variante="escuro" icone={RefreshCw} carregando={tentando} onClick={aoTentar}>
        Tentar de novo
      </BotaoM>
    </section>
  )
}

export function AvisoLinha({ icone: Icone, tom, children }: { icone: LucideIcon; tom: 'ambar' | 'ciano'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[13.5px] leading-snug font-medium',
        tom === 'ambar' ? 'bg-warn-soft text-warn-ink' : 'bg-cyan-soft text-cyan-ink',
      )}
    >
      <Icone className="mt-0.5 size-[18px] shrink-0" />
      <span>{children}</span>
    </p>
  )
}
