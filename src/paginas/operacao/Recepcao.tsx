import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRightLeft, ClipboardList, Gauge, History, Plus, ScanLine, Truck, User, Clock, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro, tempoRelativo } from '@/lib/utils'
import { mascaraTelefone } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { REF_CLIENTE, REF_VEICULO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { LeitorPlaca } from '@/componentes/ui/LeitorPlaca'
import { formatarPlaca } from '@/dados/placa'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { FormularioCliente } from '@/paginas/cadastros/FormularioCliente'
import { FormularioVeiculoRapido } from './FormularioVeiculoRapido'
import { HistoricoEntradas } from './recepcao/HistoricoEntradas'
import type { EntradaPatioListada, Veiculo } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   KPI CARD ENTERPRISE — Design Compacto
   ═══════════════════════════════════════════════════════════════ */
function KpiEnterprise({ valor, rotulo, cor, icone, indice }: {
  valor: string | number; rotulo: string; cor: string; icone: React.ReactNode; indice: number
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/5',
        'bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)]',
        'p-3 transition-all duration-300 ease-out',
        'hover:border-white/10 hover:shadow-xl hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300',
        'hover:before:opacity-100'
      )}
      style={{
        animationDelay: `${indice * 80}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-50"
        style={{ background: cor, opacity: 0.12 }}
      />

      {/* Content */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{rotulo}</span>
          <span className="font-mono text-xl font-bold tracking-tight text-[var(--ink)] transition-transform duration-200 group-hover:scale-105">
            {valor}
          </span>
        </div>

        {/* Icon container */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${cor}20, ${cor}8)`,
            boxShadow: `0 0 16px ${cor}25`,
          }}
        >
          <div style={{ color: cor }} className="scale-110">
            {icone}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--line)]/20">
        <div
          className="h-full rounded-full transition-all duration-500 group-hover:w-full"
          style={{
            width: '35%',
            background: `linear-gradient(90deg, ${cor}, ${cor}60, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

export const CATEGORIAS_FOTO = [
  'Frente',
  'Traseira',
  'Lateral esquerda',
  'Lateral direita',
  'Painel',
  'Avarias',
  'Outras',
]

interface FormRecepcao {
  cliente_id: string
  veiculo_id: string
  motorista_nome: string
  motorista_telefone: string
  motorista_documento: string
  motorista_observacao: string
  km: string
  justificativa_km: string
  condicao_entrada: string
  observacoes: string
}

const VAZIO: FormRecepcao = {
  cliente_id: '',
  veiculo_id: '',
  motorista_nome: '',
  motorista_telefone: '',
  motorista_documento: '',
  motorista_observacao: '',
  km: '',
  justificativa_km: '',
  condicao_entrada: '',
  observacoes: '',
}

const SELECT_ENTRADA =
  'id, numero, entrada_em, km, situacao, cliente_id, veiculo_id, observacoes, condicao_entrada, ' +
  'cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa, descricao, alerta_operador ), ' +
  'recebido:usuarios!entradas_patio_recebido_por_fkey ( id, nome_completo )'

export function Recepcao() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()

  const [criandoCliente, setCriandoCliente] = useState(false)
  const [criandoVeiculo, setCriandoVeiculo] = useState(false)
  const [lendoPlaca, setLendoPlaca] = useState(false)
  const [avisoPlaca, setAvisoPlaca] = useState<string | null>(null)
  const [entradaSalva, setEntradaSalva] = useState<{ id: string; numero: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'nova' | 'historico'>('nova')

  const podeVer = pode('recepcao', 'visualizar')
  const podeCriar = pode('recepcao', 'criar')

  const form = useForm<FormRecepcao>({ defaultValues: VAZIO })
  const clienteId = form.watch('cliente_id')
  const veiculoId = form.watch('veiculo_id')
  const kmDigitado = form.watch('km')

  /* Veículo selecionado: traz alerta ao operador e o cliente proprietário. */
  const veiculo = useQuery({
    queryKey: ['veiculo', veiculoId],
    enabled: Boolean(veiculoId),
    queryFn: async (): Promise<Veiculo | null> => {
      const { data, error } = await supabase.from('veiculos').select('*').eq('id', veiculoId).maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    const c = veiculo.data?.cliente_id
    if (c && !form.getValues('cliente_id')) form.setValue('cliente_id', c, { shouldDirty: true })
  }, [veiculo.data, form])

  const ultimoKm = useQuery({
    queryKey: ['ultimo-km', veiculoId],
    enabled: Boolean(veiculoId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ultimo_km_veiculo', { p_veiculo: veiculoId })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const noPatio = useQuery({
    queryKey: ['entradas', 'no-patio'],
    enabled: podeVer,
    refetchInterval: 60_000,
    queryFn: async (): Promise<EntradaPatioListada[]> => {
      const { data, error } = await supabase
        .from('entradas_patio')
        .select(SELECT_ENTRADA)
        .eq('situacao', 'no_patio')
        .order('entrada_em', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as EntradaPatioListada[]
    },
  })

  const kmAnterior = ultimoKm.data?.km ?? null
  const kmNumero = kmDigitado ? Number(kmDigitado.replace(/\D/g, '')) : null
  const kmInconsistente =
    kmNumero !== null && kmAnterior !== null && kmNumero < kmAnterior
  const kmSaltoGrande =
    kmNumero !== null && kmAnterior !== null && kmNumero - kmAnterior > 200000

  const registrar = useMutation({
    mutationFn: async ({ dados, abrirOS }: { dados: FormRecepcao; abrirOS: boolean }) => {
      setErro(null)
      if (!dados.cliente_id) throw new Error('Selecione o cliente.')
      if (!dados.veiculo_id) throw new Error('Selecione o veículo.')
      if ((kmInconsistente || kmSaltoGrande) && !dados.justificativa_km.trim()) {
        throw new Error('A quilometragem está inconsistente. Justifique para continuar.')
      }

      const { data, error } = await supabase
        .from('entradas_patio')
        .insert({
          cliente_id: dados.cliente_id,
          veiculo_id: dados.veiculo_id,
          motorista_nome: dados.motorista_nome.trim() || null,
          motorista_telefone: dados.motorista_telefone.trim() || null,
          motorista_documento: dados.motorista_documento.trim() || null,
          motorista_observacao: dados.motorista_observacao.trim() || null,
          km: kmNumero,
          km_anterior: kmAnterior,
          km_inconsistente: kmInconsistente || kmSaltoGrande,
          justificativa_km: dados.justificativa_km.trim() || null,
          condicao_entrada: dados.condicao_entrada.trim() || null,
          observacoes: dados.observacoes.trim() || null,
          recebido_por: usuario?.id ?? null,
        })
        .select('id, numero')
        .single()
      if (error) throw error
      return { entrada: data, abrirOS }
    },
    onSuccess: ({ entrada, abrirOS }) => {
      toast.ok(`Entrada ${String(entrada.numero).padStart(5, '0')} registrada`)
      setEntradaSalva(entrada)
      void qc.invalidateQueries({ queryKey: ['entradas'] })
      void qc.invalidateQueries({ queryKey: ['patio'] })
      if (abrirOS) navegar(`/operacao/ordens-de-servico?entrada=${entrada.id}`)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  function novaRecepcao() {
    setEntradaSalva(null)
    form.reset(VAZIO)
    setErro(null)
  }

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Recepção</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const stats = noPatio.data ? {
    noPatio: noPatio.data.length,
    alertas: noPatio.data.filter(e => e.veiculo?.alerta_operador).length,
    hoje: noPatio.data.filter(e => {
      const hoje = new Date().toDateString()
      return new Date(e.entrada_em).toDateString() === hoje
    }).length,
  } : null

  return (
    <div className="flex flex-col gap-5">
      {/* Header Premium */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Recepção</h1>
          <p className="text-[13px] text-ink-2">Entrada de veículo no pátio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entradaSalva && aba === 'nova' && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={novaRecepcao}>
              Nova recepção
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiEnterprise
            indice={0} valor={stats.noPatio} rotulo="No Pátio" cor="#F97316" icone={<MapPin className="size-4" />}
          />
          <KpiEnterprise
            indice={1} valor={stats.hoje} rotulo="Hoje" cor="#06B6D4" icone={<Clock className="size-4" />}
          />
          <KpiEnterprise
            indice={2} valor={stats.alertas} rotulo="Com Alertas" cor="#EAB308" icone={<AlertTriangle className="size-4" />}
          />
          <KpiEnterprise
            indice={3} valor="—" rotulo="Última Entrada" cor="#22C55E" icone={<ArrowRightLeft className="size-4" />}
          />
        </div>
      )}

      {!podeCriar && (
        <Aviso tom="atencao">Seu perfil pode consultar a recepção, mas não registrar entradas.</Aviso>
      )}

      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { valor: 'nova', rotulo: 'Nova recepção', icone: <Truck /> },
          { valor: 'historico', rotulo: 'Histórico de entradas', icone: <History /> },
        ]}
      />

      {aba === 'historico' && <HistoricoEntradas podeVer={podeVer} />}

      <div className={aba === 'nova' ? 'grid gap-5 xl:grid-cols-[1fr_360px] xl:items-start' : 'hidden'}>
        <div className="flex flex-col gap-4">
          {entradaSalva ? (
            <>
              <Aviso tom="ok" titulo={`Entrada ${String(entradaSalva.numero).padStart(5, '0')} registrada`}>
                O veículo está no pátio e o prontuário foi atualizado. Anexe as fotos da entrada abaixo.
              </Aviso>

              <Painel>
                <Evidencias
                  entidade="entradas_patio"
                  entidadeId={entradaSalva.id}
                  categorias={CATEGORIAS_FOTO}
                  titulo="Fotos da entrada"
                  descricao="Cada foto guarda cliente, veículo, responsável, data e categoria."
                  contexto={{
                    cliente_id: form.getValues('cliente_id'),
                    veiculo_id: form.getValues('veiculo_id'),
                    placa: veiculo.data?.placa,
                    km: kmNumero,
                    entrada_numero: entradaSalva.numero,
                  }}
                />
              </Painel>

              <div className="flex flex-wrap gap-2">
                <Botao variante="primario" iconeInicio={<ClipboardList />} onClick={() => navegar(`/operacao/ordens-de-servico?entrada=${entradaSalva.id}`)}>
                  Abrir OS para esta entrada
                </Botao>
                <Botao variante="neutro" onClick={() => navegar('/operacao/patio')}>
                  Ir para o Painel do Pátio
                </Botao>
                <Botao variante="neutro" onClick={novaRecepcao}>
                  Registrar outra entrada
                </Botao>
              </div>
            </>
          ) : (
            <form className="flex flex-col gap-4 pb-24 sm:pb-0">
              {erro && <Aviso tom="critico">{erro}</Aviso>}

              <Secao numero="01" titulo="Cliente e veículo" descricao="Sempre da base central — nada é duplicado.">
                <Grade>
                  <Campo className="sm:col-span-6" rotulo="Veículo" obrigatorio dica="Busque por placa, descrição ou número de frota.">
                    {(p) => (
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <SeletorRef
                            {...p}
                            config={REF_VEICULO}
                            valor={veiculoId || null}
                            aoSelecionar={(o) => form.setValue('veiculo_id', o?.id ?? '', { shouldDirty: true })}
                            placeholder="Buscar veículo pela placa"
                            aoCriar={() => setCriandoVeiculo(true)}
                            rotuloCriar="Cadastrar veículo"
                          />
                        </div>
                        <Botao
                          variante="neutro"
                          iconeInicio={<ScanLine />}
                          onClick={() => setLendoPlaca(true)}
                          className="shrink-0"
                        >
                          <span className="sr-only sm:not-sr-only">Ler placa</span>
                        </Botao>
                      </div>
                    )}
                  </Campo>

                  <Campo className="sm:col-span-6" rotulo="Cliente" obrigatorio>
                    {(p) => (
                      <SeletorRef
                        {...p}
                        config={REF_CLIENTE}
                        valor={clienteId || null}
                        aoSelecionar={(o) => form.setValue('cliente_id', o?.id ?? '', { shouldDirty: true })}
                        placeholder="Buscar por nome ou CPF/CNPJ"
                        aoCriar={() => setCriandoCliente(true)}
                        rotuloCriar="Cadastrar cliente"
                      />
                    )}
                  </Campo>
                </Grade>

                {veiculo.data?.alerta_operador && (
                  <Aviso tom="atencao" titulo="Alerta deste veículo">
                    {veiculo.data.alerta_operador}
                  </Aviso>
                )}
              </Secao>

              <Secao numero="02" titulo="Quilometragem">
                <Grade>
                  <Campo
                    className="sm:col-span-4"
                    rotulo="KM na entrada"
                    dica={
                      kmAnterior !== null
                        ? `Último registrado: ${kmAnterior.toLocaleString('pt-BR')} km (${tempoRelativo(ultimoKm.data?.registrado_em)})`
                        : 'Nenhum KM registrado antes para este veículo.'
                    }
                  >
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="numeric"
                        iconeInicio={<Gauge />}
                        value={kmDigitado}
                        onChange={(e) =>
                          form.setValue('km', e.target.value.replace(/\D/g, ''), { shouldDirty: true })
                        }
                        placeholder="000000"
                      />
                    )}
                  </Campo>

                  {(kmInconsistente || kmSaltoGrande) && (
                    <div className="sm:col-span-8">
                      <Aviso tom="atencao" titulo="Quilometragem inconsistente">
                        {kmInconsistente
                          ? `O valor informado é menor que o último registrado (${kmAnterior?.toLocaleString('pt-BR')} km).`
                          : 'O salto em relação ao último registro é muito grande.'}{' '}
                        Justifique para prosseguir.
                      </Aviso>
                    </div>
                  )}

                  {(kmInconsistente || kmSaltoGrande) && (
                    <Campo className="sm:col-span-12" rotulo="Justificativa" obrigatorio>
                      {(p) => <Entrada {...p} {...form.register('justificativa_km')} placeholder="Ex.: painel substituído, hodômetro zerado" />}
                    </Campo>
                  )}
                </Grade>
              </Secao>

              <Secao numero="03" titulo="Motorista">
                <Grade>
                  <Campo className="sm:col-span-4" rotulo="Nome">
                    {(p) => <Entrada {...p} iconeInicio={<User />} {...form.register('motorista_nome')} />}
                  </Campo>
                  <Campo className="sm:col-span-3" rotulo="Telefone">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="tel"
                        value={form.watch('motorista_telefone')}
                        onChange={(e) => form.setValue('motorista_telefone', mascaraTelefone(e.target.value), { shouldDirty: true })}
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-3" rotulo="Documento">
                    {(p) => <Entrada {...p} mono {...form.register('motorista_documento')} />}
                  </Campo>
                  <Campo className="sm:col-span-12" rotulo="Observação do motorista">
                    {(p) => <Entrada {...p} {...form.register('motorista_observacao')} />}
                  </Campo>
                </Grade>
              </Secao>

              <Secao numero="04" titulo="Condição de entrada" descricao="Registre o que já vem com o veículo.">
                <Grade>
                  <Campo className="sm:col-span-12" rotulo="Avarias e condições pré-existentes">
                    {(p) => <AreaTexto {...p} {...form.register('condicao_entrada')} rows={3} placeholder="Ex.: para-choque dianteiro amassado, lanterna traseira direita trincada" />}
                  </Campo>
                  <Campo className="sm:col-span-12" rotulo="Observações da recepção">
                    {(p) => <AreaTexto {...p} {...form.register('observacoes')} rows={2} />}
                  </Campo>
                </Grade>
              </Secao>

              <div className="hidden flex-col gap-2 sm:flex sm:flex-row">
                <Botao
                  variante="primario"
                  tamanho="lg"
                  larguraTotal
                  iconeInicio={<Truck />}
                  disabled={!podeCriar}
                  carregando={registrar.isPending}
                  onClick={form.handleSubmit((d) => registrar.mutate({ dados: d, abrirOS: false }))}
                >
                  Entrada no pátio
                </Botao>
                <Botao
                  variante="secundario"
                  tamanho="lg"
                  larguraTotal
                  iconeInicio={<ClipboardList />}
                  disabled={!podeCriar}
                  carregando={registrar.isPending}
                  onClick={form.handleSubmit((d) => registrar.mutate({ dados: d, abrirOS: true }))}
                >
                  Entrada + Nova OS
                </Botao>
              </div>
              <div className="area-segura fixed inset-x-0 bottom-0 z-40 flex gap-2 overflow-x-auto border-t border-line bg-surface px-4 py-2.5 sm:hidden">
                <Botao
                  variante="primario"
                  tamanho="sm"
                  iconeInicio={<Truck />}
                  disabled={!podeCriar}
                  carregando={registrar.isPending}
                  onClick={form.handleSubmit((d) => registrar.mutate({ dados: d, abrirOS: false }))}
                  className="shrink-0"
                >
                  Entrada
                </Botao>
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  iconeInicio={<ClipboardList />}
                  disabled={!podeCriar}
                  carregando={registrar.isPending}
                  onClick={form.handleSubmit((d) => registrar.mutate({ dados: d, abrirOS: true }))}
                  className="shrink-0"
                >
                  Entrada + OS
                </Botao>
              </div>
              {avisoPlaca && <Aviso tom="atencao" titulo="Placa lida">{avisoPlaca}</Aviso>}
            </form>
          )}
        </div>

        <Painel semPadding className="xl:sticky xl:top-20">
          <CabecalhoPainel titulo="No pátio agora" descricao="Entradas ainda não encerradas." />
          <div className="p-3">
            {noPatio.isLoading && <EstadoCarregando rotulo="Carregando…" className="min-h-32" />}
            {noPatio.isError && (
              <EstadoErro descricao={mensagemErro(noPatio.error)} aoTentarNovamente={() => void noPatio.refetch()} compacto />
            )}
            {noPatio.isSuccess && noPatio.data.length === 0 && (
              <EstadoVazio icone={<Truck />} titulo="Pátio vazio" descricao="Nenhum veículo aguardando." compacto />
            )}
            {noPatio.isSuccess && noPatio.data.length > 0 && (
              <ul className="flex flex-col gap-2">
                {noPatio.data.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[15px] font-semibold text-ink">{e.veiculo?.placa ?? '—'}</span>
                      <span className="num text-[11px] text-ink-3">#{String(e.numero).padStart(5, '0')}</span>
                    </div>
                    <span className="truncate text-[12.5px] text-ink-2">{e.cliente?.nome_razao ?? '—'}</span>
                    <div className="flex items-center gap-2">
                      <span className="num text-[11.5px] text-ink-3">{tempoRelativo(e.entrada_em)}</span>
                      {e.veiculo?.alerta_operador && (
                        <Selo tom="atencao">
                          <AlertTriangle aria-hidden className="size-3" />
                          Alerta
                        </Selo>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>
      </div>

      <FormularioCliente
        aberto={criandoCliente}
        clienteId={null}
        aoFechar={() => setCriandoCliente(false)}
        aoSalvar={(id) => form.setValue('cliente_id', id, { shouldDirty: true })}
      />

      <FormularioVeiculoRapido
        aberto={criandoVeiculo}
        aoFechar={() => setCriandoVeiculo(false)}
        clienteIdSugerido={clienteId || null}
        aoSalvar={(id, cliente) => {
          form.setValue('veiculo_id', id, { shouldDirty: true })
          if (cliente) form.setValue('cliente_id', cliente, { shouldDirty: true })
        }}
      />

      <LeitorPlaca
        aberto={lendoPlaca}
        aoFechar={() => setLendoPlaca(false)}
        aoConfirmar={(placa, encontrado) => {
          setAvisoPlaca(null)
          if (!encontrado) {
            /* Placa válida sem veículo cadastrado não é erro: é um veículo novo.
               A recepção segue e o operador cadastra na hora. */
            setAvisoPlaca(
              `Nenhum veículo cadastrado com a placa ${formatarPlaca(placa)}. Cadastre o veículo para seguir.`,
            )
            setCriandoVeiculo(true)
            return
          }
          form.setValue('veiculo_id', encontrado.id, { shouldDirty: true })
          if (encontrado.cliente) {
            form.setValue('cliente_id', encontrado.cliente.id, { shouldDirty: true })
          }
          if (encontrado.osAberta) {
            setAvisoPlaca(
              `Este veículo já tem a OS ${String(encontrado.osAberta.numero).padStart(5, '0')} em aberto` +
                (encontrado.osAberta.status ? ` (${encontrado.osAberta.status})` : '') +
                '. Confirme se é mesmo uma nova entrada.',
            )
          }
        }}
      />
    </div>
  )
}
