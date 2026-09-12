import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Check, ClipboardList, FileText, Images, Info, PenLine, ReceiptText, Trash2, Wrench, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { moeda, paraNumero } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Abas } from '@/componentes/ui/Abas'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo } from '@/componentes/ui/Selo'
import { Confirmacao, Modal } from '@/componentes/ui/Sobreposicoes'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { REF_PRODUTO, REF_SERVICO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { DocumentoOS } from './DocumentoOS'
import { CabecalhoOS, type AcoesOS } from './CabecalhoOS'
import { AbaPagamento } from './abas/Pagamento'
import { AbaChecklist } from './abas/ChecklistDaOS'
import { AbaMidias } from './abas/Midias'
import { ChecklistDeEntrada } from './ChecklistDeEntrada'
import {
  ESTADOS_PRODUTO,
  ROTULO_APROVACAO,
  TOM_APROVACAO,
  useAprovarItem,
  useAssinaturas,
  useEstadoProduto,
  useEventosOS,
  useInvalidarOS,
  useItensOS,
  useOrdem,
  useStatusOS,
} from './useOS'
import type { EstadoProdutoOS, Mecanico, OSProduto, OSServico, SituacaoAprovacao, TipoOS } from '@/tipos/db'

type AbaOS = 'abertura' | 'checklist' | 'servicos' | 'midias' | 'outras' | 'pagamento'

interface FormAtendimento {
  tipo: TipoOS
  status_id: string
  km: string
  previsao_em: string
  problema_alegado: string
  diagnostico: string
  observacoes: string
  desconto: string
  acrescimo: string
}

export function EditorOS({ osId, aoVoltar }: { osId: string; aoVoltar: () => void }) {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const invalidar = useInvalidarOS()

  const [aba, setAba] = useState<AbaOS>('abertura')
  const [imprimindo, setImprimindo] = useState(false)
  const [imprimindoChecklist, setImprimindoChecklist] = useState<string | null>(null)
  const [encerrando, setEncerrando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [reabrindo, setReabrindo] = useState(false)
  const [motivoReabertura, setMotivoReabertura] = useState('')
  const [assinando, setAssinando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeEditar = pode('ordens_servico', 'editar')
  const podeCancelar = pode('ordens_servico', 'cancelar')
  const podeAprovar = pode('ordens_servico', 'aprovar')

  const ordem = useOrdem(osId)
  const { servicos, produtos } = useItensOS(osId)
  const eventos = useEventosOS(osId)
  const status = useStatusOS()
  const assinaturas = useAssinaturas('ordens_servico', osId)
  const aprovar = useAprovarItem(osId)
  const mudarEstado = useEstadoProduto(osId)

  const mecanicosDisponiveis = useQuery({
    queryKey: ['mecanicos'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Mecanico[]> => {
      const { data, error } = await supabase.from('vw_mecanicos').select('*').order('nome_completo')
      if (error) throw error
      return (data ?? []) as Mecanico[]
    },
  })

  const atribuidos = useQuery({
    queryKey: ['os-mecanicos', osId],
    enabled: Boolean(osId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('os_mecanicos')
        .select('usuario_id, principal, especialidade_id, usuario:usuarios ( id, nome_completo )')
        .eq('os_id', osId)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        usuario_id: string
        principal: boolean
        especialidade_id: string | null
        usuario: { id: string; nome_completo: string } | null
      }>
    },
  })

  const form = useForm<FormAtendimento>({
    defaultValues: {
      tipo: 'os',
      status_id: '',
      km: '',
      previsao_em: '',
      problema_alegado: '',
      diagnostico: '',
      observacoes: '',
      desconto: '',
      acrescimo: '',
    },
  })

  useEffect(() => {
    const o = ordem.data
    if (!o) return
    form.reset({
      tipo: o.tipo,
      status_id: o.status_id ?? '',
      km: o.km !== null ? String(o.km) : '',
      previsao_em: o.previsao_em ? o.previsao_em.slice(0, 16) : '',
      problema_alegado: o.problema_alegado ?? '',
      diagnostico: o.diagnostico ?? '',
      observacoes: o.observacoes ?? '',
      desconto: o.desconto ? String(o.desconto).replace('.', ',') : '',
      acrescimo: o.acrescimo ? String(o.acrescimo).replace('.', ',') : '',
    })
  }, [ordem.data, form])

  const salvar = useMutation({
    mutationFn: async (d: FormAtendimento) => {
      setErro(null)
      const { error } = await supabase
        .from('ordens_servico')
        .update({
          tipo: d.tipo,
          status_id: d.status_id || null,
          km: d.km ? Number(d.km.replace(/\D/g, '')) : null,
          previsao_em: d.previsao_em ? new Date(d.previsao_em).toISOString() : null,
          problema_alegado: d.problema_alegado.trim() || null,
          diagnostico: d.diagnostico.trim() || null,
          observacoes: d.observacoes.trim() || null,
          desconto: paraNumero(d.desconto) ?? 0,
          acrescimo: paraNumero(d.acrescimo) ?? 0,
        })
        .eq('id', osId)
      if (error) throw error
      const { error: erroTotais } = await supabase.rpc('recalcular_totais_os', { p_os: osId })
      if (erroTotais) throw erroTotais
    },
    onSuccess: () => {
      toast.ok('Ordem de serviço salva')
      invalidar(osId)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const adicionarServico = useMutation({
    mutationFn: async (servicoId: string) => {
      const { data: s, error: erroS } = await supabase.from('servicos').select('*').eq('id', servicoId).single()
      if (erroS) throw erroS
      const { error } = await supabase.from('os_servicos').insert({
        os_id: osId,
        servico_id: s.id,
        codigo: s.codigo,
        descricao: s.descricao,
        quantidade: 1,
        valor_unitario: s.valor_padrao,
        ordem: (servicos.data?.length ?? 0) + 1,
      })
      if (error) throw error
    },
    onSuccess: () => invalidar(osId),
    onError: (e) => toast.erro('Não foi possível adicionar', mensagemErro(e)),
  })

  const adicionarProduto = useMutation({
    mutationFn: async (produtoId: string) => {
      const { data: p, error: erroP } = await supabase.from('produtos').select('*').eq('id', produtoId).single()
      if (erroP) throw erroP
      const { error } = await supabase.from('os_produtos').insert({
        os_id: osId,
        produto_id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        unidade: p.unidade,
        quantidade: 1,
        valor_unitario: p.preco_venda,
        ordem: (produtos.data?.length ?? 0) + 1,
      })
      if (error) throw error
    },
    onSuccess: () => invalidar(osId),
    onError: (e) => toast.erro('Não foi possível adicionar', mensagemErro(e)),
  })

  const atualizarItem = useMutation({
    mutationFn: async ({
      tabela,
      id,
      campos,
    }: {
      tabela: 'os_servicos' | 'os_produtos'
      id: string
      campos: { quantidade?: number; valor_unitario?: number; desconto?: number }
    }) => {
      const r =
        tabela === 'os_servicos'
          ? await supabase.from('os_servicos').update(campos).eq('id', id)
          : await supabase.from('os_produtos').update(campos).eq('id', id)
      if (r.error) throw r.error
    },
    onSuccess: () => invalidar(osId),
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const removerItem = useMutation({
    mutationFn: async ({ tabela, id }: { tabela: 'os_servicos' | 'os_produtos'; id: string }) => {
      const r =
        tabela === 'os_servicos'
          ? await supabase.from('os_servicos').delete().eq('id', id)
          : await supabase.from('os_produtos').delete().eq('id', id)
      if (r.error) throw r.error
    },
    onSuccess: () => invalidar(osId),
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  const alternarMecanico = useMutation({
    mutationFn: async ({ usuarioId, adicionar }: { usuarioId: string; adicionar: boolean }) => {
      if (adicionar) {
        const { error } = await supabase.from('os_mecanicos').insert({ os_id: osId, usuario_id: usuarioId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('os_mecanicos').delete().eq('os_id', osId).eq('usuario_id', usuarioId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['os-mecanicos', osId] })
      void qc.invalidateQueries({ queryKey: ['patio'] })
      void qc.invalidateQueries({ queryKey: ['minha-operacao'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar a equipe', mensagemErro(e)),
  })

  const assinar = useMutation({
    mutationFn: async ({ momento, nome, documento }: { momento: string; nome: string; documento: string }) => {
      if (!nome.trim()) throw new Error('Informe o nome de quem está assinando.')
      const { error } = await supabase.from('assinaturas').insert({
        entidade: 'ordens_servico',
        entidade_id: osId,
        momento,
        nome: nome.trim(),
        documento: documento.trim() || null,
        registrado_por: usuario?.id ?? null,
      })
      if (error) throw error
      const { error: erroEvento } = await supabase.from('os_eventos').insert({
        os_id: osId,
        tipo: 'assinatura',
        titulo: `Assinatura — ${momento}`,
        descricao: nome.trim(),
        usuario_id: usuario?.id ?? null,
      })
      if (erroEvento) throw erroEvento
    },
    onSuccess: () => {
      toast.ok('Assinatura registrada')
      setAssinando(null)
      void qc.invalidateQueries({ queryKey: ['assinaturas', 'ordens_servico', osId] })
      void qc.invalidateQueries({ queryKey: ['os-eventos', osId] })
    },
    onError: (e) => toast.erro('Não foi possível assinar', mensagemErro(e)),
  })

  /**
   * Cancelamento.
   *
   * Não apaga: a OS sai das listas (que filtram `situacao = 'ativo'`) e o
   * motivo fica na linha do tempo. Apagar destruiria o número já entregue ao
   * cliente e abriria buraco na sequência.
   */
  const cancelar = useMutation({
    mutationFn: async () => {
      const motivo = motivoCancelamento.trim()
      if (motivo.length < 3) throw new Error('Descreva o motivo do cancelamento.')

      const { error } = await supabase
        .from('ordens_servico')
        .update({ situacao: 'inativo' })
        .eq('id', osId)
      if (error) throw error

      await supabase.from('os_eventos').insert({
        os_id: osId,
        tipo: 'situacao',
        titulo: 'Ordem de serviço cancelada',
        descricao: motivo,
        usuario_id: usuario?.id ?? null,
      })
    },
    onSuccess: () => {
      toast.ok('Ordem de serviço cancelada')
      setCancelando(false)
      setMotivoCancelamento('')
      invalidar(osId)
      aoVoltar()
    },
    onError: (e) => toast.erro('Não foi possível cancelar', mensagemErro(e)),
  })

  const encerrar = useMutation({
    mutationFn: async (forcar: boolean) => {
      const { error } = await supabase.rpc('encerrar_os', { p_os: osId, p_forcar: forcar })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Ordem de serviço encerrada')
      setEncerrando(false)
      invalidar(osId)
    },
    onError: (e) => {
      setEncerrando(false)
      toast.erro('Não foi possível encerrar', mensagemErro(e))
    },
  })

  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reabrir_os', { p_os: osId, p_motivo: motivoReabertura })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Ordem de serviço reaberta')
      setReabrindo(false)
      setMotivoReabertura('')
      invalidar(osId)
    },
    onError: (e) => toast.erro('Não foi possível reabrir', mensagemErro(e)),
  })

  /** Checklists desta OS — a aba mostra o que já existe, sem inventar nada. */
  const checklists = useQuery({
    queryKey: ['os-checklists', osId],
    enabled: Boolean(osId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklists')
        .select('id, numero, modelo_descricao, tipo, situacao, versao, concluido_em, iniciado_em')
        .eq('os_id', osId)
        .order('iniciado_em', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const pendentes = useMemo(() => {
    const s = (servicos.data ?? []).filter((i) => i.aprovacao === 'pendente' && i.situacao === 'ativo').length
    const p = (produtos.data ?? []).filter((i) => i.aprovacao === 'pendente' && i.situacao === 'ativo').length
    return s + p
  }, [servicos.data, produtos.data])

  if (ordem.isLoading) return <EstadoCarregando rotulo="Carregando ordem de serviço…" />
  if (ordem.isError)
    return <EstadoErro descricao={mensagemErro(ordem.error)} aoTentarNovamente={() => void ordem.refetch()} />
  if (!ordem.data) return <EstadoVazio titulo="Ordem não encontrada" descricao="O registro pode ter sido removido." />

  const o = ordem.data

  /**
   * Link do WhatsApp do cliente.
   *
   * Só existe quando há telefone gravado — botão que abre uma conversa vazia
   * não serve para nada, então ele simplesmente não aparece.
   */
  const telefone = (o.cliente?.celular || o.cliente?.telefone || '').replace(/\D/g, '')
  const linkWhatsapp =
    telefone.length >= 10
      ? `https://wa.me/55${telefone.slice(-11)}?text=${encodeURIComponent(
          `Olá! Aqui é da ${'Tecnoar Freios'}. Sobre a OS ${String(o.numero).padStart(5, '0')}` +
            (o.veiculo?.placa ? ` do veículo ${o.veiculo.placa}` : '') +
            ':',
        )}`
      : null

  const acoes: AcoesOS = {
    salvando: salvar.isPending,
    encerrando: encerrar.isPending,
    podeEditar,
    aoSalvar: form.handleSubmit((d) => salvar.mutate(d)),
    aoSalvarESair: form.handleSubmit(async (d) => {
      await salvar.mutateAsync(d)
      aoVoltar()
    }),
    aoEncerrar: () => setEncerrando(true),
    aoCancelar: podeCancelar ? () => setCancelando(true) : undefined,
    aoReabrir: () => setReabrindo(true),
    aoImprimirOS: () => setImprimindo(true),
    aoImprimirChecklist: checklists.data?.[0]
      ? () => setImprimindoChecklist(checklists.data![0].id)
      : undefined,
    linkWhatsapp,
  }

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <CabecalhoOS ordem={o} aoVoltar={aoVoltar} acoes={acoes} />

      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {o.veiculo?.alerta_operador && (
        <Aviso tom="atencao" titulo="Alerta deste veículo">{o.veiculo.alerta_operador}</Aviso>
      )}

      <Abas
        ativa={aba}
        aoMudar={setAba}
        className="sticky top-[116px] z-20 lg:top-[84px]"
        abas={[
          { valor: 'abertura', rotulo: 'Abertura', icone: <FileText /> },
          { valor: 'checklist', rotulo: 'Checklist', contador: checklists.data?.length || undefined, icone: <ClipboardList /> },
          {
            valor: 'servicos',
            rotulo: 'Serviços / Peças',
            contador: (servicos.data?.length ?? 0) + (produtos.data?.length ?? 0) || undefined,
            icone: <Wrench />,
          },
          { valor: 'midias', rotulo: 'Mídias', icone: <Images /> },
          { valor: 'outras', rotulo: 'Outras Informações', contador: eventos.data?.length || undefined, icone: <Info /> },
          { valor: 'pagamento', rotulo: 'Pagamento', icone: <ReceiptText /> },
        ]}
      />

      {aba === 'abertura' && (
        <form className="flex flex-col gap-4">
          <Secao numero="01" titulo="Atendimento">
            <Grade>
              <Campo className="sm:col-span-3" rotulo="Tipo">
                {(p) => (
                  <Selecao {...p} {...form.register('tipo')} disabled={!podeEditar}>
                    <option value="os">Ordem de serviço</option>
                    <option value="orcamento">Orçamento</option>
                    <option value="garantia">Garantia</option>
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Status">
                {(p) => (
                  <Selecao {...p} {...form.register('status_id')} disabled={!podeEditar}>
                    <option value="">Sem status</option>
                    {status.data?.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-2" rotulo="KM">
                {(p) => (
                  <Entrada
                    {...p}
                    mono
                    inputMode="numeric"
                    disabled={!podeEditar}
                    value={form.watch('km')}
                    onChange={(e) => form.setValue('km', e.target.value.replace(/\D/g, ''), { shouldDirty: true })}
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Previsão de entrega">
                {(p) => <Entrada {...p} type="datetime-local" disabled={!podeEditar} {...form.register('previsao_em')} />}
              </Campo>

              <Campo className="sm:col-span-6" rotulo="Problema alegado pelo cliente">
                {(p) => <AreaTexto {...p} rows={4} disabled={!podeEditar} {...form.register('problema_alegado')} />}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Diagnóstico técnico">
                {(p) => <AreaTexto {...p} rows={4} disabled={!podeEditar} {...form.register('diagnostico')} />}
              </Campo>

            </Grade>
          </Secao>

          <Secao numero="02" titulo="Equipe" descricao="Somente usuários com função habilitada como mecânico.">
            {mecanicosDisponiveis.isSuccess && mecanicosDisponiveis.data.length === 0 ? (
              <Aviso tom="atencao">
                Nenhum usuário está configurado como mecânico. Ajuste a função em Cadastros › Funções e Cargos e
                atribua-a em Cadastros › Usuários.
              </Aviso>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mecanicosDisponiveis.data?.map((m) => {
                  const marcado = atribuidos.data?.some((a) => a.usuario_id === m.id) ?? false
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={marcado}
                      disabled={!podeEditar || alternarMecanico.isPending}
                      onClick={() => alternarMecanico.mutate({ usuarioId: m.id, adicionar: !marcado })}
                      className={cn(
                        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50',
                        marcado ? 'border-cyan bg-cyan-soft text-cyan-ink' : 'border-line-strong text-ink-2 hover:text-ink',
                      )}
                    >
                      {marcado && <Check aria-hidden className="size-3.5" />}
                      {m.nome_completo}
                      <span className="text-[10.5px] opacity-70">{m.funcao}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Secao>

        </form>
      )}

      {aba === 'checklist' && <AbaChecklist ordem={o} podeEditar={podeEditar} />}

      {aba === 'servicos' && (
        <div className="flex flex-col gap-4">
          {pendentes > 0 && (
            <Aviso tom="atencao" titulo={`${pendentes} item(ns) aguardando aprovação`}>
              A aprovação pode ser parcial: aprove ou recuse cada linha separadamente.
            </Aviso>
          )}

          <TabelaItens
            titulo="Serviços"
            itens={servicos.data ?? []}
            carregando={servicos.isLoading}
            podeEditar={podeEditar}
            podeAprovar={podeAprovar}
            aoAtualizar={(id, campos) => atualizarItem.mutate({ tabela: 'os_servicos', id, campos })}
            aoRemover={(id) => removerItem.mutate({ tabela: 'os_servicos', id })}
            aoAprovar={(id, aprovacao) =>
              aprovar.mutate({ tabela: 'os_servicos', id, aprovacao, usuarioId: usuario?.id ?? null })
            }
            adicionar={
              podeEditar ? (
                <SeletorRef
                  config={REF_SERVICO}
                  valor={null}
                  aoSelecionar={(o) => o && adicionarServico.mutate(o.id)}
                  placeholder="Adicionar serviço do catálogo"
                />
              ) : undefined
            }
          />

          <TabelaItens
            titulo="Produtos"
            produto
            itens={produtos.data ?? []}
            carregando={produtos.isLoading}
            podeEditar={podeEditar}
            podeAprovar={podeAprovar}
            aoAtualizar={(id, campos) => atualizarItem.mutate({ tabela: 'os_produtos', id, campos })}
            aoRemover={(id) => removerItem.mutate({ tabela: 'os_produtos', id })}
            aoAprovar={(id, aprovacao) =>
              aprovar.mutate({ tabela: 'os_produtos', id, aprovacao, usuarioId: usuario?.id ?? null })
            }
            aoMudarEstado={(id, estado) => mudarEstado.mutate({ id, estado })}
            adicionar={
              podeEditar ? (
                <SeletorRef
                  config={REF_PRODUTO}
                  valor={null}
                  aoSelecionar={(o) => o && adicionarProduto.mutate(o.id)}
                  placeholder="Adicionar produto do estoque"
                />
              ) : undefined
            }
          />
        </div>
      )}

      {aba === 'midias' && <AbaMidias ordem={o} podeEditar={podeEditar} />}

      {aba === 'outras' && (
        <div className="flex flex-col gap-4">
          <Secao numero="01" titulo="Observações internas" descricao="Não sai no documento entregue ao cliente.">
            <Campo rotulo="Observações">
              {(campo) => (
                <AreaTexto {...campo} rows={4} disabled={!podeEditar} {...form.register('observacoes')} />
              )}
            </Campo>
          </Secao>

          <Secao numero="02" titulo="Assinaturas">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {['Aprovação do orçamento', 'Retirada do veículo'].map((m) => (
                  <Botao key={m} tamanho="sm" variante="neutro" iconeInicio={<PenLine />} onClick={() => setAssinando(m)}>
                    {m}
                  </Botao>
                ))}
              </div>

              {assinaturas.isSuccess && assinaturas.data.length === 0 && (
                <p className="text-[12.5px] text-ink-3">Nenhuma assinatura registrada.</p>
              )}
              {assinaturas.isSuccess && assinaturas.data.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {assinaturas.data.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                      <Selo tom="ok" ponto>{a.momento}</Selo>
                      <span className="text-[13px] text-ink">{a.nome}</span>
                      {a.documento && <span className="num text-[12px] text-ink-3">{a.documento}</span>}
                      <span className="num ml-auto text-[11.5px] text-ink-3">{dataHora(a.assinado_em)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Secao>

        <Painel semPadding>
          <CabecalhoPainel titulo="Linha do tempo" descricao="Registro automático de tudo que aconteceu nesta OS." />
          <div className="p-5">
            {eventos.isLoading && <EstadoCarregando rotulo="Carregando histórico…" />}
            {eventos.isSuccess && eventos.data.length === 0 && (
              <EstadoVazio titulo="Sem eventos" descricao="Nada foi registrado ainda." compacto />
            )}
            {eventos.isSuccess && eventos.data.length > 0 && (
              <ol className="flex flex-col">
                {eventos.data.map((ev, i) => (
                  <li key={ev.id} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span aria-hidden className="mt-1.5 size-2 rounded-full bg-cyan" />
                      {i < eventos.data.length - 1 && <span aria-hidden className="w-px flex-1 bg-line" />}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 pb-5">
                      <span className="text-[13.5px] font-medium text-ink">{ev.titulo}</span>
                      {ev.descricao && <span className="text-[12.5px] leading-relaxed text-ink-2">{ev.descricao}</span>}
                      <span className="num text-[11.5px] text-ink-3">
                        {dataHora(ev.ocorrido_em)}
                        {ev.usuario?.nome_completo ? ` · ${ev.usuario.nome_completo}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Painel>
        </div>
      )}

      {aba === 'pagamento' && <AbaPagamento ordem={o} podeEditar={podeEditar} />}

      <Confirmacao
        aberto={encerrando}
        aoFechar={() => setEncerrando(false)}
        aoConfirmar={() => encerrar.mutate(pendentes > 0)}
        carregando={encerrar.isPending}
        titulo="Encerrar ordem de serviço"
        rotuloConfirmar="Encerrar"
        descricao={
          pendentes > 0 ? (
            <>
              Ainda há <strong>{pendentes} item(ns)</strong> aguardando aprovação do cliente. Encerrar agora
              registra a OS como encerrada mesmo assim, e isso fica no histórico.
            </>
          ) : (
            'A OS será marcada como encerrada, com data e autor. Ela pode ser reaberta depois, com motivo.'
          )
        }
      />

      <Modal
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar ordem de serviço"
        descricao="A OS sai das listas e dos indicadores. O número e o histórico são preservados."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
            <Botao
              variante="destrutivo"
              carregando={cancelar.isPending}
              disabled={motivoCancelamento.trim().length < 3}
              onClick={() => cancelar.mutate()}
            >
              Cancelar OS
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Motivo do cancelamento"
          obrigatorio
          dica="Fica na linha do tempo da OS, com autor e data."
        >
          {(campo) => (
            <AreaTexto
              {...campo}
              rows={3}
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Ex.: aberta no veículo errado"
            />
          )}
        </Campo>
      </Modal>

      <Modal
        aberto={reabrindo}
        aoFechar={() => setReabrindo(false)}
        titulo="Reabrir ordem de serviço"
        descricao="O motivo fica registrado na linha do tempo."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setReabrindo(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={reabrir.isPending} onClick={() => reabrir.mutate()}>
              Reabrir
            </Botao>
          </>
        }
      >
        <Campo rotulo="Motivo da reabertura" obrigatorio>
          {(campo) => (
            <AreaTexto
              {...campo}
              rows={3}
              value={motivoReabertura}
              onChange={(e) => setMotivoReabertura(e.target.value)}
              placeholder="Ex.: cliente retornou com o mesmo sintoma."
            />
          )}
        </Campo>
      </Modal>

      <ModalAssinatura
        momento={assinando}
        aoFechar={() => setAssinando(null)}
        aoAssinar={(nome, documento) => assinando && assinar.mutate({ momento: assinando, nome, documento })}
        carregando={assinar.isPending}
      />

      {imprimindoChecklist && (
        <ChecklistDeEntrada
          ordem={o}
          checklistId={imprimindoChecklist}
          aoFechar={() => setImprimindoChecklist(null)}
        />
      )}

      {imprimindo && (
        <DocumentoOS
          osId={osId}
          aoFechar={() => setImprimindo(false)}
          servicos={servicos.data ?? []}
          produtos={produtos.data ?? []}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ tabela itens */

interface CampoItem {
  campo: 'quantidade' | 'valor_unitario' | 'desconto'
  rotulo: string
  curto: string
  passo: string
  largura: string
}

const CAMPOS_ITEM: CampoItem[] = [
  { campo: 'quantidade', rotulo: 'Quantidade', curto: 'Qtd.', passo: '0.001', largura: 'w-20' },
  { campo: 'valor_unitario', rotulo: 'Valor unitário', curto: 'Unitário', passo: '0.01', largura: 'w-28' },
  { campo: 'desconto', rotulo: 'Desconto', curto: 'Desconto', passo: '0.01', largura: 'w-24' },
]

function TabelaItens({
  titulo,
  itens,
  carregando,
  podeEditar,
  podeAprovar,
  aoAtualizar,
  aoRemover,
  aoAprovar,
  aoMudarEstado,
  adicionar,
  produto,
}: {
  titulo: string
  itens: Array<OSServico | OSProduto>
  carregando: boolean
  podeEditar: boolean
  podeAprovar: boolean
  aoAtualizar: (id: string, campos: { quantidade?: number; valor_unitario?: number; desconto?: number }) => void
  aoRemover: (id: string) => void
  aoAprovar: (id: string, aprovacao: SituacaoAprovacao) => void
  aoMudarEstado?: (id: string, estado: EstadoProdutoOS) => void
  adicionar?: React.ReactNode
  produto?: boolean
}) {
  /* Os controles do item existem em dois leiautes — cartão no celular, linha
     na tabela do desktop — e são montados aqui uma vez só. */
  const campoNumero = (i: OSServico | OSProduto, c: CampoItem, classe: string) => (
    <input
      type="number"
      inputMode="decimal"
      step={c.passo}
      min="0"
      aria-label={`${c.rotulo} de ${i.descricao}`}
      disabled={!podeEditar}
      defaultValue={i[c.campo]}
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (v !== i[c.campo]) aoAtualizar(i.id, { [c.campo]: v } as Partial<Record<CampoItem['campo'], number>>)
      }}
      className={cn('num rounded border border-line-strong bg-inset px-2 text-right disabled:opacity-60', classe)}
    />
  )

  const seletorEstado = (i: OSServico | OSProduto, classe: string) => (
    <select
      aria-label={`Estado de ${i.descricao}`}
      disabled={!podeEditar}
      value={(i as OSProduto).estado}
      onChange={(e) => aoMudarEstado?.(i.id, e.target.value as EstadoProdutoOS)}
      className={cn('w-full rounded border border-line-strong bg-inset px-1.5 disabled:opacity-60', classe)}
    >
      {ESTADOS_PRODUTO.map((e) => (
        <option key={e.valor} value={e.valor}>{e.rotulo}</option>
      ))}
    </select>
  )

  const botoesAprovacao = (i: OSServico | OSProduto, tamanho: string) =>
    podeAprovar ? (
      <div className="flex gap-1">
        {(['aprovado', 'recusado', 'pendente'] as SituacaoAprovacao[]).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={i.aprovacao === a}
            aria-label={`${ROTULO_APROVACAO[a]}: ${i.descricao}`}
            title={ROTULO_APROVACAO[a]}
            onClick={() => aoAprovar(i.id, a)}
            className={cn(
              'flex items-center justify-center rounded border transition-colors',
              tamanho,
              i.aprovacao === a
                ? a === 'aprovado'
                  ? 'border-ok bg-ok-soft text-ok-ink'
                  : a === 'recusado'
                    ? 'border-crit bg-crit-soft text-crit-ink'
                    : 'border-warn bg-warn-soft text-warn-ink'
                : 'border-line-strong text-ink-3 hover:text-ink',
            )}
          >
            {a === 'aprovado' ? <Check className="size-3.5" /> : a === 'recusado' ? <X className="size-3.5" /> : '—'}
          </button>
        ))}
      </div>
    ) : (
      <Selo tom={TOM_APROVACAO[i.aprovacao]} ponto>{ROTULO_APROVACAO[i.aprovacao]}</Selo>
    )

  return (
    <Painel semPadding>
      <CabecalhoPainel
        titulo={titulo}
        descricao={produto ? 'Estado operacional e aprovação por item.' : 'Aprovação por item.'}
      />

      {adicionar && <div className="border-b border-line p-4">{adicionar}</div>}

      <div className="overflow-x-auto">
        {carregando ? (
          <div className="p-5">
            <EstadoCarregando rotulo="Carregando itens…" className="min-h-32" />
          </div>
        ) : itens.length === 0 ? (
          <div className="p-5">
            <EstadoVazio
              titulo={`Nenhum ${produto ? 'produto' : 'serviço'} lançado`}
              descricao={`Use o campo acima para adicionar ${produto ? 'produtos do estoque' : 'serviços do catálogo'}.`}
              compacto
            />
          </div>
        ) : (
          <>
            {/* Celular e tablet: um cartão por item. A tabela tem ~900px e, no
                celular, obrigava a arrastar a tela para lançar quantidade ou
                aprovar — aqui cada item cabe inteiro, com alvos para o dedo. */}
            <ul className="flex flex-col divide-y divide-line lg:hidden">
              {itens.map((i) => (
                <li key={i.id} className={cn('flex flex-col gap-3 p-4', i.aprovacao === 'recusado' && 'opacity-55')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] leading-snug font-medium text-ink">{i.descricao}</p>
                      <p className="num mt-0.5 text-[11.5px] text-ink-3">{i.codigo ?? 'Sem código'}</p>
                    </div>
                    {podeEditar && (
                      <BotaoIcone rotulo={`Remover ${i.descricao}`} tamanho="sm" onClick={() => aoRemover(i.id)}>
                        <Trash2 />
                      </BotaoIcone>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {CAMPOS_ITEM.map((c) => (
                      <label key={c.campo} className="flex min-w-0 flex-col gap-1">
                        <span className="lbl">{c.curto}</span>
                        {campoNumero(i, c, 'h-10 w-full text-[14px]')}
                      </label>
                    ))}
                  </div>

                  {produto && <label className="flex flex-col gap-1"><span className="lbl">Estado</span>{seletorEstado(i, 'h-10 text-[14px]')}</label>}

                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                    {botoesAprovacao(i, 'size-10')}
                    <div className="flex flex-col items-end">
                      <span className="lbl">Total</span>
                      <span className="num text-[15px] font-semibold text-ink">{moeda(i.valor_total)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <table className="hidden w-full border-collapse lg:table">
              <thead>
                <tr>
                  <th className="lbl h-10 border-b border-line-strong bg-surface-2 px-3 text-left">Código</th>
                  <th className="lbl h-10 border-b border-line-strong bg-surface-2 px-3 text-left">Descrição</th>
                  <th className="lbl h-10 w-24 border-b border-line-strong bg-surface-2 px-3 text-right">Qtd.</th>
                  <th className="lbl h-10 w-32 border-b border-line-strong bg-surface-2 px-3 text-right">Unitário</th>
                  <th className="lbl h-10 w-28 border-b border-line-strong bg-surface-2 px-3 text-right">Desc.</th>
                  <th className="lbl h-10 w-32 border-b border-line-strong bg-surface-2 px-3 text-right">Total</th>
                  {produto && <th className="lbl h-10 w-36 border-b border-line-strong bg-surface-2 px-3 text-left">Estado</th>}
                  <th className="lbl h-10 w-44 border-b border-line-strong bg-surface-2 px-3 text-left">Aprovação</th>
                  <th className="h-10 w-12 border-b border-line-strong bg-surface-2" />
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className={cn('border-b border-line last:border-b-0', i.aprovacao === 'recusado' && 'opacity-55')}>
                    <td className="num px-3 py-2 text-[12.5px] text-ink-3">{i.codigo ?? '—'}</td>
                    <td className="px-3 py-2 text-[13px] text-ink">{i.descricao}</td>
                    {CAMPOS_ITEM.map((c) => (
                      <td key={c.campo} className="px-3 py-2 text-right">
                        {campoNumero(i, c, cn('h-8 text-[12.5px]', c.largura))}
                      </td>
                    ))}
                    <td className="num px-3 py-2 text-right text-[13px] font-medium text-ink">{moeda(i.valor_total)}</td>
                    {produto && <td className="px-3 py-2">{seletorEstado(i, 'h-8 text-[12px]')}</td>}
                    <td className="px-3 py-2">{botoesAprovacao(i, 'size-7')}</td>
                    <td className="px-2 py-2 text-right">
                      {podeEditar && (
                        <BotaoIcone rotulo={`Remover ${i.descricao}`} tamanho="sm" onClick={() => aoRemover(i.id)}>
                          <Trash2 />
                        </BotaoIcone>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Painel>
  )
}

/* ------------------------------------------------------------- assinatura */

function ModalAssinatura({
  momento,
  aoFechar,
  aoAssinar,
  carregando,
}: {
  momento: string | null
  aoFechar: () => void
  aoAssinar: (nome: string, documento: string) => void
  carregando: boolean
}) {
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')

  useEffect(() => {
    if (momento) {
      setNome('')
      setDocumento('')
    }
  }, [momento])

  return (
    <Modal
      aberto={Boolean(momento)}
      aoFechar={aoFechar}
      titulo={`Assinatura — ${momento ?? ''}`}
      descricao="A assinatura fica registrada com data, hora e responsável."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={carregando} onClick={() => aoAssinar(nome, documento)}>
            Registrar assinatura
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome de quem assina" obrigatorio>
          {(p) => <Entrada {...p} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />}
        </Campo>
        <Campo rotulo="Documento">
          {(p) => <Entrada {...p} mono value={documento} onChange={(e) => setDocumento(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}
