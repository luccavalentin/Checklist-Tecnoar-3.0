import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock, FileWarning, Plus, Printer, RefreshCw, ShieldCheck, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { data as fmtData, numeroBR } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, REF_VEICULO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { TermoRecusaDoc } from './garantias/TermoRecusaDoc'
import type {
  GarantiaListada,
  RetornoListado,
  SituacaoGarantia,
  TermoRecusa,
  TipoItemGarantia,
} from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   KPI CARD ENTERPRISE — Design Compacto
   ═══════════════════════════════════════════════════════════════ */
function KpiGarantia({ valor, rotulo, cor, icone, indice }: {
  valor: string | number; rotulo: string; cor: string; icone: React.ReactNode; indice: number
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/5',
        'bg-gradient-to-br from-[var(--c-surface)] via-[var(--c-surface-2)] to-[var(--c-surface)]',
        'p-3 transition-all duration-300 ease-out',
        'hover:border-white/10 hover:shadow-xl hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300',
        'hover:before:opacity-100'
      )}
      style={{
        /* `both` segura o estado inicial no atraso e o final depois. Sem opacidade
           fixa no estilo, o cartão nunca fica invisível se a animação falhar. */
        animation: 'tec-surgir 0.4s ease-out both',
        animationDelay: `${indice * 60}ms`,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute -right-4 -top-4 h-14 w-14 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-50"
        style={{ background: cor, opacity: 0.12 }}
      />

      {/* Content */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--c-ink-3)]">{rotulo}</span>
          <span className="truncate font-mono text-lg font-bold tracking-tight text-[var(--c-ink)] transition-transform duration-200 group-hover:scale-105 min-[400px]:text-xl">
            {valor}
          </span>
        </div>

        {/* Icon container */}
        <div
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105 min-[400px]:flex"
          style={{
            background: `linear-gradient(135deg, ${cor}20, ${cor}8)`,
            boxShadow: `0 0 12px ${cor}20`,
          }}
        >
          <div style={{ color: cor }} className="scale-110">
            {icone}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--c-line)]/20">
        <div
          className="h-full rounded-full transition-all duration-500 group-hover:w-full"
          style={{
            width: '30%',
            background: `linear-gradient(90deg, ${cor}, ${cor}60, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

const TOM_GARANTIA: Record<SituacaoGarantia, 'ok' | 'neutro' | 'atencao' | 'critico'> = {
  vigente: 'ok',
  expirada: 'neutro',
  acionada: 'atencao',
  cancelada: 'critico',
}

export function Garantias() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [aba, setAba] = useState<'garantias' | 'retornos' | 'recusas'>('garantias')
  const [criandoGarantia, setCriandoGarantia] = useState(false)
  const [criandoRetorno, setCriandoRetorno] = useState(false)
  const [criandoTermo, setCriandoTermo] = useState(false)
  const [termoAberto, setTermoAberto] = useState<TermoRecusa | null>(null)
  const [assinando, setAssinando] = useState<TermoRecusa | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('garantias', 'visualizar')
  const podeCriar = pode('garantias', 'criar')
  const podeEditar = pode('garantias', 'editar')

  const garantias = useQuery({
    queryKey: ['garantias'],
    enabled: podeVer && aba === 'garantias',
    queryFn: async (): Promise<GarantiaListada[]> => {
      const { data, error } = await supabase
        .from('garantias')
        .select('*, cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa ), ordem:ordens_servico ( id, numero )')
        .order('inicio', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as GarantiaListada[]
    },
  })

  const retornos = useQuery({
    queryKey: ['retornos'],
    enabled: podeVer && aba === 'retornos',
    queryFn: async (): Promise<RetornoListado[]> => {
      const { data, error } = await supabase
        .from('retornos')
        .select('*, cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa )')
        .order('data_retorno', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as RetornoListado[]
    },
  })

  const termos = useQuery({
    queryKey: ['termos-recusa'],
    enabled: podeVer && aba === 'recusas',
    queryFn: async (): Promise<TermoRecusa[]> => {
      const { data, error } = await supabase
        .from('termos_recusa')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  /* --------------------------------------------------------- formulários */
  const [g, setG] = useState({
    cliente_id: null as string | null,
    veiculo_id: null as string | null,
    tipo_item: 'produto' as TipoItemGarantia,
    descricao_item: '',
    inicio: new Date().toISOString().slice(0, 10),
    fim: '',
    km_inicial: '',
    km_limite: '',
    politica: '',
  })

  const salvarGarantia = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!g.cliente_id) throw new Error('Selecione o cliente.')
      if (g.descricao_item.trim().length < 2) throw new Error('Descreva o item coberto.')
      const { error } = await supabase.from('garantias').insert({
        cliente_id: g.cliente_id,
        veiculo_id: g.veiculo_id,
        tipo_item: g.tipo_item,
        descricao_item: g.descricao_item.trim(),
        inicio: g.inicio,
        fim: g.fim || null,
        km_inicial: g.km_inicial ? Number(g.km_inicial) : null,
        km_limite: g.km_limite ? Number(g.km_limite) : null,
        politica: g.politica.trim() || null,
        criada_por: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Garantia registrada')
      setCriandoGarantia(false)
      void qc.invalidateQueries({ queryKey: ['garantias'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const [r, setR] = useState({
    cliente_id: null as string | null,
    veiculo_id: null as string | null,
    data_retorno: new Date().toISOString().slice(0, 10),
    km: '',
    motivo: '',
    descricao: '',
  })

  const salvarRetorno = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!r.cliente_id) throw new Error('Selecione o cliente.')
      if (r.motivo.trim().length < 3) throw new Error('Informe o motivo do retorno.')
      const { error } = await supabase.from('retornos').insert({
        cliente_id: r.cliente_id,
        veiculo_id: r.veiculo_id,
        data_retorno: r.data_retorno,
        km: r.km ? Number(r.km) : null,
        motivo: r.motivo.trim(),
        descricao: r.descricao.trim() || null,
        responsavel_id: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Retorno registrado')
      setCriandoRetorno(false)
      void qc.invalidateQueries({ queryKey: ['retornos'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const [t, setT] = useState({
    cliente_id: null as string | null,
    veiculo_id: null as string | null,
    km: '',
    defeito: '',
    risco: '',
    recomendacao: '',
    item_recusado: '',
  })

  const salvarTermo = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!t.cliente_id) throw new Error('Selecione o cliente.')
      if (t.defeito.trim().length < 3) throw new Error('Descreva o defeito identificado.')
      const { data, error } = await supabase
        .from('termos_recusa')
        .insert({
          cliente_id: t.cliente_id,
          veiculo_id: t.veiculo_id,
          km: t.km ? Number(t.km) : null,
          defeito: t.defeito.trim(),
          risco: t.risco.trim() || null,
          recomendacao: t.recomendacao.trim() || null,
          item_recusado: t.item_recusado.trim() || null,
          responsavel_id: usuario?.id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (novo) => {
      toast.ok(`Termo ${String(novo.numero).padStart(4, '0')} emitido`)
      setCriandoTermo(false)
      setT({ cliente_id: null, veiculo_id: null, km: '', defeito: '', risco: '', recomendacao: '', item_recusado: '' })
      void qc.invalidateQueries({ queryKey: ['termos-recusa'] })
      setTermoAberto(novo)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  /** Ao assinar, o termo vira registro imutável com a versão apresentada. */
  const assinarTermo = useMutation({
    mutationFn: async ({ termo, nome, documento }: { termo: TermoRecusa; nome: string; documento: string }) => {
      if (!nome.trim()) throw new Error('Informe o nome de quem assina.')
      const { data: contexto } = await supabase
        .from('termos_recusa')
        .select('*, cliente:clientes ( nome_razao, documento ), veiculo:veiculos ( placa, descricao )')
        .eq('id', termo.id)
        .single()

      const { error } = await supabase
        .from('termos_recusa')
        .update({ assinado_em: new Date().toISOString(), snapshot: contexto as never })
        .eq('id', termo.id)
      if (error) throw error

      const { error: erroAss } = await supabase.from('assinaturas').insert({
        entidade: 'termos_recusa',
        entidade_id: termo.id,
        momento: 'Ciência e responsabilidade',
        nome: nome.trim(),
        documento: documento.trim() || null,
        registrado_por: usuario?.id ?? null,
      })
      if (erroAss) throw erroAss
    },
    onSuccess: () => {
      toast.ok('Termo assinado', 'A partir de agora o documento é imutável.')
      setAssinando(null)
      void qc.invalidateQueries({ queryKey: ['termos-recusa'] })
    },
    onError: (e) => toast.erro('Não foi possível assinar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Garantias e Retornos</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const stats = {
    garantias: garantias.data ? garantias.data.length : 0,
    vigentes: garantias.data ? garantias.data.filter(g => g.situacao === 'vigente').length : 0,
    expiradas: garantias.data ? garantias.data.filter(g => g.situacao === 'expirada').length : 0,
    retornos: retornos.data ? retornos.data.length : 0,
    termos: termos.data ? termos.data.length : 0,
  }

  const colunasGarantias: Array<Coluna<GarantiaListada>> = [
    { chave: 'numero', cabecalho: 'Nº', largura: '70px', celula: (x) => <span className="num text-ink-3">{String(x.numero).padStart(4, '0')}</span> },
    {
      chave: 'item',
      cabecalho: 'Item coberto',
      celula: (x) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{x.descricao_item}</span>
          <span className="text-[12px] text-ink-3">{x.tipo_item === 'produto' ? 'Produto' : 'Serviço'}</span>
        </div>
      ),
    },
    { chave: 'cliente', cabecalho: 'Cliente', largura: '200px', classeResponsiva: 'hidden lg:table-cell', celula: (x) => x.cliente?.nome_razao ?? '—' },
    { chave: 'placa', cabecalho: 'Placa', largura: '110px', classeResponsiva: 'hidden md:table-cell', celula: (x) => <span className="num">{x.veiculo?.placa ?? '—'}</span> },
    { chave: 'vigencia', cabecalho: 'Vigência', largura: '190px', celula: (x) => <span className="num text-[12.5px]">{fmtData(x.inicio)} → {x.fim ? fmtData(x.fim) : 'sem prazo'}</span> },
    {
      chave: 'km',
      cabecalho: 'KM limite',
      largura: '120px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (x) => <span className="num text-[12.5px]">{x.km_limite ? numeroBR(x.km_limite, 0) : '—'}</span>,
    },
    { chave: 'situacao', cabecalho: 'Situação', largura: '130px', celula: (x) => <Selo tom={TOM_GARANTIA[x.situacao]} ponto>{x.situacao}</Selo> },
  ]

  const colunasRetornos: Array<Coluna<RetornoListado>> = [
    { chave: 'numero', cabecalho: 'Nº', largura: '70px', celula: (x) => <span className="num text-ink-3">{String(x.numero).padStart(4, '0')}</span> },
    { chave: 'motivo', cabecalho: 'Motivo', celula: (x) => <span className="truncate text-ink">{x.motivo}</span> },
    { chave: 'cliente', cabecalho: 'Cliente', largura: '200px', classeResponsiva: 'hidden lg:table-cell', celula: (x) => x.cliente?.nome_razao ?? '—' },
    { chave: 'placa', cabecalho: 'Placa', largura: '110px', classeResponsiva: 'hidden md:table-cell', celula: (x) => <span className="num">{x.veiculo?.placa ?? '—'}</span> },
    { chave: 'data', cabecalho: 'Data', largura: '120px', celula: (x) => <span className="num text-[12.5px]">{fmtData(x.data_retorno)}</span> },
    {
      chave: 'decisao',
      cabecalho: 'Decisão',
      largura: '150px',
      celula: (x) =>
        podeEditar ? (
          <Selecao
            aria-label="Decisão do retorno"
            className="h-8 text-[12px]"
            value={x.decisao}
            onChange={async (e) => {
              const { error } = await supabase.from('retornos').update({ decisao: e.target.value as never }).eq('id', x.id)
              if (error) toast.erro('Não foi possível salvar', mensagemErro(error))
              else void qc.invalidateQueries({ queryKey: ['retornos'] })
            }}
          >
            <option value="pendente">Pendente</option>
            <option value="procedente">Procedente</option>
            <option value="improcedente">Improcedente</option>
            <option value="cortesia">Cortesia</option>
          </Selecao>
        ) : (
          <Selo tom={x.decisao === 'procedente' ? 'ok' : x.decisao === 'improcedente' ? 'critico' : 'atencao'}>{x.decisao}</Selo>
        ),
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '140px',
      celula: (x) => (
        <Selo tom={x.situacao === 'concluido' ? 'ok' : x.situacao === 'cancelado' ? 'neutro' : 'info'} ponto>
          {x.situacao}
        </Selo>
      ),
    },
  ]

  const colunasTermos: Array<Coluna<TermoRecusa>> = [
    { chave: 'numero', cabecalho: 'Nº', largura: '70px', celula: (x) => <span className="num text-ink-3">{String(x.numero).padStart(4, '0')}</span> },
    { chave: 'defeito', cabecalho: 'Defeito recusado', celula: (x) => <span className="truncate text-ink">{x.defeito}</span> },
    { chave: 'item', cabecalho: 'Item', largura: '190px', classeResponsiva: 'hidden lg:table-cell', celula: (x) => x.item_recusado ?? <span className="text-ink-3">—</span> },
    { chave: 'data', cabecalho: 'Emitido', largura: '150px', celula: (x) => <span className="num text-[12.5px]">{dataHora(x.created_at)}</span> },
    {
      chave: 'assinatura',
      cabecalho: 'Assinatura',
      largura: '180px',
      celula: (x) =>
        x.assinado_em ? (
          <Selo tom="ok" ponto>Assinado {fmtData(x.assinado_em)}</Selo>
        ) : (
          <Selo tom="atencao" ponto>Aguardando assinatura</Selo>
        ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '200px',
      alinhamento: 'direita',
      celula: (x) => (
        <div className="flex justify-end gap-1">
          {!x.assinado_em && podeEditar && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAssinando(x)}>Assinar</Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" iconeInicio={<Printer />} onClick={() => setTermoAberto(x)}>
            Documento
          </Botao>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Header Premium */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Garantias e Retornos</h1>
          <p className="text-[13px] text-ink-2">Gestão de garantias, retornos e termos de recusa</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeCriar && (
            <Botao
              variante="primario"
              iconeInicio={<Plus className="size-4" />}
              onClick={() => {
                setErro(null)
                if (aba === 'garantias') setCriandoGarantia(true)
                else if (aba === 'retornos') setCriandoRetorno(true)
                else setCriandoTermo(true)
              }}
            >
              {aba === 'garantias' ? 'Nova garantia' : aba === 'retornos' ? 'Registrar retorno' : 'Emitir termo'}
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <KpiGarantia
          indice={0} valor={stats.garantias} rotulo="Garantias" cor="#F97316" icone={<ShieldCheck className="size-4" />}
        />
        <KpiGarantia
          indice={1} valor={stats.vigentes} rotulo="Vigentes" cor="#22C55E" icone={<CheckCircle2 className="size-4" />}
        />
        <KpiGarantia
          indice={2} valor={stats.expiradas} rotulo="Expiradas" cor="#EAB308" icone={<Clock className="size-4" />}
        />
        <KpiGarantia
          indice={3} valor={stats.retornos} rotulo="Retornos" cor="#06B6D4" icone={<RefreshCw className="size-4" />}
        />
        <KpiGarantia
          indice={4} valor={stats.termos} rotulo="Termos" cor="#DC2626" icone={<FileWarning className="size-4" />}
        />
      </div>

      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { valor: 'garantias', rotulo: 'Garantias', contador: garantias.data?.length },
          { valor: 'retornos', rotulo: 'Retornos', contador: retornos.data?.length },
          { valor: 'recusas', rotulo: 'Termos de recusa', contador: termos.data?.length },
        ]}
      />

      {aba === 'garantias' && (
        <>
          {garantias.isLoading && <EstadoCarregando rotulo="Carregando garantias…" />}
          {garantias.isError && <EstadoErro descricao={mensagemErro(garantias.error)} aoTentarNovamente={() => void garantias.refetch()} />}
          {garantias.isSuccess && garantias.data.length === 0 && (
            <EstadoVazio
              icone={<ShieldCheck />}
              titulo="Nenhuma garantia registrada"
              descricao="A garantia é vinculada a um item específico — produto ou serviço — e não à OS inteira."
            />
          )}
          {garantias.isSuccess && garantias.data.length > 0 && (
            <Tabela colunas={colunasGarantias} linhas={garantias.data} chaveDe={(x) => x.id} estado="ok" />
          )}
        </>
      )}

      {aba === 'retornos' && (
        <>
          {retornos.isLoading && <EstadoCarregando rotulo="Carregando retornos…" />}
          {retornos.isSuccess && retornos.data.length === 0 && (
            <EstadoVazio icone={<Undo2 />} titulo="Nenhum retorno registrado" descricao="Registre o retorno para analisar procedência e histórico." />
          )}
          {retornos.isSuccess && retornos.data.length > 0 && (
            <Tabela colunas={colunasRetornos} linhas={retornos.data} chaveDe={(x) => x.id} estado="ok" />
          )}
        </>
      )}

      {aba === 'recusas' && (
        <>
          <Aviso tom="info" titulo="Termo de Ciência e Responsabilidade">
            Emitido quando o cliente não aprova um problema identificado. Depois de assinado, o documento vira
            registro imutável — qualquer mudança exige um novo termo.
          </Aviso>
          {termos.isLoading && <EstadoCarregando rotulo="Carregando termos…" />}
          {termos.isSuccess && termos.data.length === 0 && (
            <EstadoVazio icone={<FileWarning />} titulo="Nenhum termo emitido" descricao="Emita o termo quando o cliente recusar um serviço recomendado." />
          )}
          {termos.isSuccess && termos.data.length > 0 && (
            <Tabela colunas={colunasTermos} linhas={termos.data} chaveDe={(x) => x.id} estado="ok" />
          )}
        </>
      )}

      {/* ---------------------------------------------------- nova garantia */}
      <PainelLateral
        aberto={criandoGarantia}
        aoFechar={() => setCriandoGarantia(false)}
        largura="lg"
        titulo="Nova garantia"
        descricao="Vinculada a um item específico."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoGarantia(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarGarantia.isPending} onClick={() => salvarGarantia.mutate()}>Salvar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Cliente" obrigatorio>
              {(p) => <SeletorRef {...p} config={REF_CLIENTE} valor={g.cliente_id} aoSelecionar={(o) => setG({ ...g, cliente_id: o?.id ?? null })} placeholder="Buscar cliente" />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Veículo">
              {(p) => <SeletorRef {...p} config={REF_VEICULO} valor={g.veiculo_id} aoSelecionar={(o) => setG({ ...g, veiculo_id: o?.id ?? null })} placeholder="Buscar pela placa" />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Tipo do item">
              {() => (
                <Segmentado
                  rotuloGrupo="Tipo do item"
                  valor={g.tipo_item}
                  onChange={(v) => setG({ ...g, tipo_item: v })}
                  opcoes={[
                    { valor: 'produto' as TipoItemGarantia, rotulo: 'Produto' },
                    { valor: 'servico' as TipoItemGarantia, rotulo: 'Serviço' },
                  ]}
                />
              )}
            </Campo>
            <Campo className="sm:col-span-8" rotulo="Item coberto" obrigatorio>
              {(p) => <Entrada {...p} value={g.descricao_item} onChange={(e) => setG({ ...g, descricao_item: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="Início">
              {(p) => <Entrada {...p} type="date" value={g.inicio} onChange={(e) => setG({ ...g, inicio: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="Fim">
              {(p) => <Entrada {...p} type="date" value={g.fim} onChange={(e) => setG({ ...g, fim: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="KM inicial">
              {(p) => <Entrada {...p} mono type="number" value={g.km_inicial} onChange={(e) => setG({ ...g, km_inicial: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="KM limite">
              {(p) => <Entrada {...p} mono type="number" value={g.km_limite} onChange={(e) => setG({ ...g, km_limite: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Política de garantia">
              {(p) => <AreaTexto {...p} rows={3} value={g.politica} onChange={(e) => setG({ ...g, politica: e.target.value })} />}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {/* ----------------------------------------------------- novo retorno */}
      <PainelLateral
        aberto={criandoRetorno}
        aoFechar={() => setCriandoRetorno(false)}
        largura="lg"
        titulo="Registrar retorno"
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoRetorno(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarRetorno.isPending} onClick={() => salvarRetorno.mutate()}>Registrar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Cliente" obrigatorio>
              {(p) => <SeletorRef {...p} config={REF_CLIENTE} valor={r.cliente_id} aoSelecionar={(o) => setR({ ...r, cliente_id: o?.id ?? null })} placeholder="Buscar cliente" />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Veículo">
              {(p) => <SeletorRef {...p} config={REF_VEICULO} valor={r.veiculo_id} aoSelecionar={(o) => setR({ ...r, veiculo_id: o?.id ?? null })} placeholder="Buscar pela placa" />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Data">
              {(p) => <Entrada {...p} type="date" value={r.data_retorno} onChange={(e) => setR({ ...r, data_retorno: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="KM">
              {(p) => <Entrada {...p} mono type="number" value={r.km} onChange={(e) => setR({ ...r, km: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Motivo" obrigatorio>
              {(p) => <Entrada {...p} value={r.motivo} onChange={(e) => setR({ ...r, motivo: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Descrição">
              {(p) => <AreaTexto {...p} rows={3} value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {/* -------------------------------------------------------- novo termo */}
      <PainelLateral
        aberto={criandoTermo}
        aoFechar={() => setCriandoTermo(false)}
        largura="lg"
        titulo="Termo de Ciência e Responsabilidade"
        descricao="Emitido quando o cliente recusa um serviço recomendado."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoTermo(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarTermo.isPending} onClick={() => salvarTermo.mutate()}>Emitir termo</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Cliente" obrigatorio>
              {(p) => <SeletorRef {...p} config={REF_CLIENTE} valor={t.cliente_id} aoSelecionar={(o) => setT({ ...t, cliente_id: o?.id ?? null })} placeholder="Buscar cliente" />}
            </Campo>
            <Campo className="sm:col-span-8" rotulo="Veículo">
              {(p) => <SeletorRef {...p} config={REF_VEICULO} valor={t.veiculo_id} aoSelecionar={(o) => setT({ ...t, veiculo_id: o?.id ?? null })} placeholder="Buscar pela placa" />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="KM">
              {(p) => <Entrada {...p} mono type="number" value={t.km} onChange={(e) => setT({ ...t, km: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Defeito identificado" obrigatorio>
              {(p) => <AreaTexto {...p} rows={2} value={t.defeito} onChange={(e) => setT({ ...t, defeito: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Risco de não executar">
              {(p) => <AreaTexto {...p} rows={2} value={t.risco} onChange={(e) => setT({ ...t, risco: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Recomendação técnica">
              {(p) => <AreaTexto {...p} rows={2} value={t.recomendacao} onChange={(e) => setT({ ...t, recomendacao: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Item recusado">
              {(p) => <Entrada {...p} value={t.item_recusado} onChange={(e) => setT({ ...t, item_recusado: e.target.value })} />}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {termoAberto && (
        <TermoRecusaDoc
          termo={termoAberto}
          aoFechar={() => setTermoAberto(null)}
          aoAssinar={!termoAberto.assinado_em && podeEditar ? () => { setAssinando(termoAberto); setTermoAberto(null) } : undefined}
        />
      )}

      <ModalAssinaturaTermo
        termo={assinando}
        aoFechar={() => setAssinando(null)}
        aoConfirmar={(nome, documento) => assinando && assinarTermo.mutate({ termo: assinando, nome, documento })}
        carregando={assinarTermo.isPending}
      />
    </div>
  )
}

function ModalAssinaturaTermo({
  termo,
  aoFechar,
  aoConfirmar,
  carregando,
}: {
  termo: TermoRecusa | null
  aoFechar: () => void
  aoConfirmar: (nome: string, documento: string) => void
  carregando: boolean
}) {
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')

  return (
    <Confirmacao
      aberto={Boolean(termo)}
      aoFechar={aoFechar}
      aoConfirmar={() => aoConfirmar(nome, documento)}
      carregando={carregando}
      titulo="Assinar termo de recusa"
      rotuloConfirmar="Assinar"
      descricao={
        <div className="flex flex-col gap-3">
          <span>Depois de assinado o termo não pode mais ser alterado. Confira antes de confirmar.</span>
          <Campo rotulo="Nome de quem assina" obrigatorio>
            {(p) => <Entrada {...p} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />}
          </Campo>
          <Campo rotulo="Documento">
            {(p) => <Entrada {...p} mono value={documento} onChange={(e) => setDocumento(e.target.value)} />}
          </Campo>
        </div>
      }
    />
  )
}
