import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { data as fmtData, mascaraDocumento, mascaraTelefone, moeda, numeroBR } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type {
  Cliente,
  ClienteRelacionamento,
  FollowUpListado,
  InteracaoListada,
  TipoInteracao,
} from '@/tipos/db'

type AbaCliente =
  | 'resumo'
  | 'veiculos'
  | 'os'
  | 'itens'
  | 'garantias'
  | 'interacoes'
  | 'followups'
  | 'documentos'

export const TIPOS_INTERACAO: Array<{ valor: TipoInteracao; rotulo: string }> = [
  { valor: 'ligacao', rotulo: 'Ligação' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'visita', rotulo: 'Visita' },
  { valor: 'observacao', rotulo: 'Observação' },
]

const ROTULO_TIPO = Object.fromEntries(TIPOS_INTERACAO.map((t) => [t.valor, t.rotulo])) as Record<
  TipoInteracao,
  string
>

/**
 * Cliente 360 — tudo o que o sistema realmente sabe sobre um cliente,
 * lido das mesmas tabelas usadas pelas telas de origem. Cada aba carrega
 * apenas quando é aberta, para o painel abrir rápido mesmo em clientes
 * com histórico longo.
 */
export function Cliente360({
  clienteId,
  nome,
  aoFechar,
}: {
  clienteId: string
  nome: string
  aoFechar: () => void
}) {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [aba, setAba] = useState<AbaCliente>('resumo')
  const [novaInteracao, setNovaInteracao] = useState(false)
  const [novoFollowUp, setNovoFollowUp] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeCriarInteracao = pode('crm', 'criar')
  const podeCriarFollowUp = pode('follow_up', 'criar')

  const cadastro = useQuery({
    queryKey: ['cliente-360', clienteId, 'cadastro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*, cliente_contatos ( id, nome_setor, email, telefone, celular, ordem )')
        .eq('id', clienteId)
        .single()
      if (error) throw error
      return data as unknown as Cliente & {
        cliente_contatos: Array<{
          id: string
          nome_setor: string | null
          email: string | null
          telefone: string | null
          celular: string | null
          ordem: number
        }>
      }
    },
  })

  const resumo = useQuery({
    queryKey: ['cliente-360', clienteId, 'resumo'],
    queryFn: async (): Promise<ClienteRelacionamento | null> => {
      const { data, error } = await supabase
        .from('vw_clientes_relacionamento')
        .select('*')
        .eq('id', clienteId)
        .maybeSingle()
      if (error) throw error
      return data as unknown as ClienteRelacionamento | null
    },
  })

  const veiculos = useQuery({
    queryKey: ['cliente-360', clienteId, 'veiculos'],
    enabled: aba === 'veiculos',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos')
        .select('id, placa, descricao, marca, modelo, ano, tipo, situacao, km_atual')
        .eq('cliente_id', clienteId)
        .order('placa')
        .limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const ordens = useQuery({
    queryKey: ['cliente-360', clienteId, 'os'],
    enabled: aba === 'os' || aba === 'itens',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero, aberta_em, encerrada_em, valor_total, tipo, veiculo:veiculos ( placa ), status:status_os ( nome, cor )')
        .eq('cliente_id', clienteId)
        .order('aberta_em', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        numero: number
        aberta_em: string
        encerrada_em: string | null
        valor_total: number
        tipo: string
        veiculo: { placa: string } | null
        status: { nome: string; cor: string } | null
      }>
    },
  })

  const itens = useQuery({
    queryKey: ['cliente-360', clienteId, 'itens', (ordens.data ?? []).length],
    enabled: aba === 'itens' && (ordens.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (ordens.data ?? []).map((o) => o.id)
      const [s, p] = await Promise.all([
        supabase.from('os_servicos').select('id, os_id, descricao, quantidade, valor_total').in('os_id', ids),
        supabase.from('os_produtos').select('id, os_id, descricao, quantidade, valor_total').in('os_id', ids),
      ])
      if (s.error) throw s.error
      if (p.error) throw p.error
      return { servicos: s.data ?? [], produtos: p.data ?? [] }
    },
  })

  const garantias = useQuery({
    queryKey: ['cliente-360', clienteId, 'garantias'],
    enabled: aba === 'garantias',
    queryFn: async () => {
      const [g, r, t] = await Promise.all([
        supabase
          .from('garantias')
          .select('id, descricao_item, tipo_item, inicio, fim, situacao, km_limite')
          .eq('cliente_id', clienteId)
          .order('inicio', { ascending: false })
          .limit(100),
        supabase
          .from('retornos')
          .select('id, data_retorno, motivo, situacao, decisao')
          .eq('cliente_id', clienteId)
          .order('data_retorno', { ascending: false })
          .limit(100),
        supabase
          .from('termos_recusa')
          .select('id, numero, defeito, created_at, assinado_em')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      if (g.error) throw g.error
      if (r.error) throw r.error
      if (t.error) throw t.error
      return { garantias: g.data ?? [], retornos: r.data ?? [], termos: t.data ?? [] }
    },
  })

  const interacoes = useQuery({
    queryKey: ['cliente-360', clienteId, 'interacoes'],
    enabled: aba === 'interacoes' || aba === 'resumo',
    queryFn: async (): Promise<InteracaoListada[]> => {
      const { data, error } = await supabase
        .from('interacoes')
        .select('*, responsavel:usuarios ( id, nome_completo )')
        .eq('cliente_id', clienteId)
        .order('ocorrida_em', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as InteracaoListada[]
    },
  })

  const followUps = useQuery({
    queryKey: ['cliente-360', clienteId, 'followups'],
    enabled: aba === 'followups',
    queryFn: async (): Promise<FollowUpListado[]> => {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*, responsavel:usuarios!follow_ups_responsavel_id_fkey ( id, nome_completo )')
        .eq('cliente_id', clienteId)
        .order('data', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as FollowUpListado[]
    },
  })

  /* ------------------------------------------------------- nova interação */
  const [f, setF] = useState({
    tipo: 'ligacao' as TipoInteracao,
    assunto: '',
    descricao: '',
    ocorrida_em: new Date().toISOString().slice(0, 16),
  })

  const registrarInteracao = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (f.assunto.trim().length < 3) throw new Error('Descreva o assunto da interação.')
      const { error } = await supabase.from('interacoes').insert({
        cliente_id: clienteId,
        tipo: f.tipo,
        assunto: f.assunto.trim(),
        descricao: f.descricao.trim() || null,
        ocorrida_em: new Date(f.ocorrida_em).toISOString(),
        responsavel_id: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Interação registrada')
      setNovaInteracao(false)
      setF({ tipo: 'ligacao', assunto: '', descricao: '', ocorrida_em: new Date().toISOString().slice(0, 16) })
      void qc.invalidateQueries({ queryKey: ['cliente-360', clienteId] })
      void qc.invalidateQueries({ queryKey: ['crm'] })
      void qc.invalidateQueries({ queryKey: ['crm-indicadores'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  /* ------------------------------------------------------ novo follow-up */
  const [fu, setFu] = useState({
    proxima_acao: '',
    data: new Date().toISOString().slice(0, 10),
    prioridade: 'media',
    observacao: '',
  })

  const registrarFollowUp = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (fu.proxima_acao.trim().length < 3) throw new Error('Descreva a próxima ação.')
      const { error } = await supabase.from('follow_ups').insert({
        cliente_id: clienteId,
        proxima_acao: fu.proxima_acao.trim(),
        data: fu.data,
        prioridade: fu.prioridade as FollowUpListado['prioridade'],
        observacao: fu.observacao.trim() || null,
        responsavel_id: usuario?.id ?? null,
        criado_por: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Follow-up agendado')
      setNovoFollowUp(false)
      setFu({ proxima_acao: '', data: new Date().toISOString().slice(0, 10), prioridade: 'media', observacao: '' })
      void qc.invalidateQueries({ queryKey: ['cliente-360', clienteId] })
      void qc.invalidateQueries({ queryKey: ['follow-ups'] })
      void qc.invalidateQueries({ queryKey: ['crm'] })
      void qc.invalidateQueries({ queryKey: ['crm-indicadores'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const c = cadastro.data
  const r = resumo.data

  return (
    <>
      <PainelLateral aberto aoFechar={aoFechar} largura="xl" titulo={nome} descricao="Cliente 360">
        <div className="flex flex-col gap-5">
          {cadastro.isError && (
            <EstadoErro descricao={mensagemErro(cadastro.error)} aoTentarNovamente={() => void cadastro.refetch()} />
          )}

          {r && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { rotulo: 'Ordens de serviço', valor: String(r.total_os) },
                { rotulo: 'Valor em OS', valor: moeda(Number(r.valor_os)) },
                { rotulo: 'Vendas', valor: String(r.total_vendas) },
                {
                  rotulo: 'Último atendimento',
                  valor: r.ultimo_atendimento ? `${r.dias_sem_atendimento} dia(s)` : 'Nunca',
                },
              ].map((k) => (
                <div key={k.rotulo} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2 p-3.5">
                  <span className="lbl">{k.rotulo}</span>
                  <span className="num text-lg leading-none text-ink">{k.valor}</span>
                </div>
              ))}
            </div>
          )}

          <Abas
            ativa={aba}
            aoMudar={setAba}
            abas={[
              { valor: 'resumo', rotulo: 'Dados e contatos' },
              { valor: 'veiculos', rotulo: 'Veículos' },
              { valor: 'os', rotulo: 'Ordens de serviço' },
              { valor: 'itens', rotulo: 'Serviços e produtos' },
              { valor: 'garantias', rotulo: 'Garantias e recusas' },
              { valor: 'interacoes', rotulo: 'Interações', contador: r?.total_interacoes || undefined },
              { valor: 'followups', rotulo: 'Follow-ups', contador: r?.follow_ups_abertos || undefined },
              { valor: 'documentos', rotulo: 'Documentos' },
            ]}
          />

          {/* ------------------------------------------------------ resumo */}
          {aba === 'resumo' &&
            (cadastro.isLoading ? (
              <EstadoCarregando />
            ) : c ? (
              <div className="flex flex-col gap-5">
                <Bloco titulo="Dados cadastrais">
                  <Info rotulo="Código" valor={String(c.codigo)} mono />
                  <Info rotulo="Razão social / Nome" valor={c.nome_razao} />
                  <Info rotulo="Nome fantasia" valor={c.nome_fantasia} />
                  <Info rotulo="Documento" valor={c.documento ? mascaraDocumento(c.documento) : null} mono />
                  <Info rotulo="Inscrição estadual" valor={c.inscricao_estadual} mono />
                  <Info rotulo="E-mail" valor={c.email} />
                  <Info rotulo="Celular" valor={c.celular ? mascaraTelefone(c.celular) : null} mono />
                  <Info rotulo="Telefone" valor={c.telefone ? mascaraTelefone(c.telefone) : null} mono />
                  <Info
                    rotulo="Endereço"
                    valor={
                      [c.logradouro, c.numero, c.bairro, [c.municipio, c.uf].filter(Boolean).join('/')]
                        .filter(Boolean)
                        .join(', ') || null
                    }
                  />
                  <Info rotulo="Situação" valor={c.situacao === 'ativo' ? 'Ativo' : 'Inativo'} />
                </Bloco>

                <Bloco titulo="Contatos">
                  {c.cliente_contatos.length === 0 ? (
                    <EstadoVazio
                      compacto
                      titulo="Nenhum contato adicional"
                      descricao="Contatos são cadastrados na ficha do cliente, em Cadastros › Clientes."
                    />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {[...c.cliente_contatos]
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((ct) => (
                          <li key={ct.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded border border-line p-3">
                            <span className="text-[13px] font-medium text-ink">{ct.nome_setor || 'Contato'}</span>
                            {ct.celular && <span className="num text-[12.5px] text-ink-2">{mascaraTelefone(ct.celular)}</span>}
                            {ct.telefone && <span className="num text-[12.5px] text-ink-2">{mascaraTelefone(ct.telefone)}</span>}
                            {ct.email && <span className="text-[12.5px] text-ink-3">{ct.email}</span>}
                          </li>
                        ))}
                    </ul>
                  )}
                </Bloco>

                <Bloco titulo="Últimas interações">
                  {(interacoes.data?.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhuma interação registrada" />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {(interacoes.data ?? []).slice(0, 5).map((i) => (
                        <li key={i.id} className="flex flex-col gap-0.5 rounded border border-line p-3">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <Selo tom="info">{ROTULO_TIPO[i.tipo]}</Selo>
                            <span className="text-[13px] text-ink">{i.assunto}</span>
                            <span className="num ml-auto text-[12px] text-ink-3">{dataHora(i.ocorrida_em)}</span>
                          </div>
                          {i.descricao && <p className="text-[12.5px] text-ink-2">{i.descricao}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
              </div>
            ) : null)}

          {/* ---------------------------------------------------- veículos */}
          {aba === 'veiculos' && (
            <Lista
              carregando={veiculos.isLoading}
              erro={veiculos.error}
              recarregar={() => void veiculos.refetch()}
              vazio="Nenhum veículo vinculado a este cliente."
              itens={veiculos.data ?? []}
              chave={(v) => v.id}
              linha={(v) => (
                <>
                  <span className="num shrink-0 font-semibold text-ink">{v.placa}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                    {v.descricao || [v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                  </span>
                  {v.km_atual !== null && (
                    <span className="num shrink-0 text-[12.5px] text-ink-3">{numeroBR(v.km_atual, 0)} km</span>
                  )}
                  <Selo tom={v.situacao === 'ativo' ? 'ok' : 'neutro'}>{v.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</Selo>
                </>
              )}
            />
          )}

          {/* --------------------------------------------------------- OS */}
          {aba === 'os' && (
            <Lista
              carregando={ordens.isLoading}
              erro={ordens.error}
              recarregar={() => void ordens.refetch()}
              vazio="Nenhuma ordem de serviço para este cliente."
              itens={ordens.data ?? []}
              chave={(o) => o.id}
              linha={(o) => (
                <>
                  <span className="num shrink-0 font-semibold text-ink">{String(o.numero).padStart(5, '0')}</span>
                  <span className="num shrink-0 text-[12.5px] text-ink-2">{o.veiculo?.placa ?? '—'}</span>
                  <span className="num shrink-0 text-[12.5px] text-ink-3">{fmtData(o.aberta_em)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{o.status?.nome ?? '—'}</span>
                  <span className="num shrink-0 font-medium text-ink">{moeda(Number(o.valor_total))}</span>
                </>
              )}
            />
          )}

          {/* --------------------------------------------- itens (histórico) */}
          {aba === 'itens' &&
            (ordens.isLoading || itens.isLoading ? (
              <EstadoCarregando />
            ) : (ordens.data?.length ?? 0) === 0 ? (
              <EstadoVazio titulo="Nenhum serviço ou produto" descricao="Este cliente ainda não tem ordens de serviço." />
            ) : (
              <div className="flex flex-col gap-5">
                <Bloco titulo={`Serviços executados (${itens.data?.servicos.length ?? 0})`}>
                  {(itens.data?.servicos.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhum serviço lançado" />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(itens.data?.servicos ?? []).map((s) => (
                        <li key={s.id} className="flex items-baseline gap-3 rounded border border-line px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.descricao}</span>
                          <span className="num text-[12.5px] text-ink-3">{numeroBR(Number(s.quantidade))}</span>
                          <span className="num text-[12.5px] font-medium text-ink">{moeda(Number(s.valor_total))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
                <Bloco titulo={`Produtos aplicados (${itens.data?.produtos.length ?? 0})`}>
                  {(itens.data?.produtos.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhum produto lançado" />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(itens.data?.produtos ?? []).map((s) => (
                        <li key={s.id} className="flex items-baseline gap-3 rounded border border-line px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.descricao}</span>
                          <span className="num text-[12.5px] text-ink-3">{numeroBR(Number(s.quantidade))}</span>
                          <span className="num text-[12.5px] font-medium text-ink">{moeda(Number(s.valor_total))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
              </div>
            ))}

          {/* -------------------------------------------- garantias/recusas */}
          {aba === 'garantias' &&
            (garantias.isLoading ? (
              <EstadoCarregando />
            ) : garantias.isError ? (
              <EstadoErro descricao={mensagemErro(garantias.error)} aoTentarNovamente={() => void garantias.refetch()} />
            ) : (
              <div className="flex flex-col gap-5">
                <Bloco titulo={`Garantias (${garantias.data?.garantias.length ?? 0})`}>
                  {(garantias.data?.garantias.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhuma garantia registrada" />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(garantias.data?.garantias ?? []).map((g) => (
                        <li key={g.id} className="flex flex-wrap items-baseline gap-3 rounded border border-line px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{g.descricao_item}</span>
                          <span className="num text-[12px] text-ink-3">
                            {fmtData(g.inicio)}{g.fim ? ` → ${fmtData(g.fim)}` : ''}
                          </span>
                          <Selo tom={g.situacao === 'vigente' ? 'ok' : g.situacao === 'acionada' ? 'atencao' : 'neutro'}>
                            {g.situacao}
                          </Selo>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
                <Bloco titulo={`Retornos (${garantias.data?.retornos.length ?? 0})`}>
                  {(garantias.data?.retornos.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhum retorno registrado" />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(garantias.data?.retornos ?? []).map((x) => (
                        <li key={x.id} className="flex flex-wrap items-baseline gap-3 rounded border border-line px-3 py-2">
                          <span className="num shrink-0 text-[12px] text-ink-3">{fmtData(x.data_retorno)}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{x.motivo}</span>
                          <Selo tom="neutro">{x.situacao}</Selo>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
                <Bloco titulo={`Termos de recusa (${garantias.data?.termos.length ?? 0})`}>
                  {(garantias.data?.termos.length ?? 0) === 0 ? (
                    <EstadoVazio compacto titulo="Nenhum termo emitido" />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(garantias.data?.termos ?? []).map((t) => (
                        <li key={t.id} className="flex flex-wrap items-baseline gap-3 rounded border border-line px-3 py-2">
                          <span className="num shrink-0 font-semibold text-ink">{String(t.numero).padStart(4, '0')}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{t.defeito}</span>
                          <Selo tom={t.assinado_em ? 'ok' : 'atencao'}>
                            {t.assinado_em ? 'Assinado' : 'Sem assinatura'}
                          </Selo>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
              </div>
            ))}

          {/* -------------------------------------------------- interações */}
          {aba === 'interacoes' && (
            <div className="flex flex-col gap-4">
              {podeCriarInteracao && (
                <div className="flex justify-end">
                  <Botao variante="secundario" iconeInicio={<Plus />} onClick={() => setNovaInteracao(true)}>
                    Registrar interação
                  </Botao>
                </div>
              )}
              <Lista
                carregando={interacoes.isLoading}
                erro={interacoes.error}
                recarregar={() => void interacoes.refetch()}
                vazio="Nenhuma interação registrada com este cliente."
                itens={interacoes.data ?? []}
                chave={(i) => i.id}
                linha={(i) => (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Selo tom="info">{ROTULO_TIPO[i.tipo]}</Selo>
                      <span className="text-[13px] font-medium text-ink">{i.assunto}</span>
                      <span className="num ml-auto text-[12px] text-ink-3">{dataHora(i.ocorrida_em)}</span>
                    </div>
                    {i.descricao && <p className="text-[12.5px] whitespace-pre-wrap text-ink-2">{i.descricao}</p>}
                    <span className="text-[11.5px] text-ink-3">
                      {i.responsavel?.nome_completo ?? 'Responsável não informado'}
                    </span>
                  </div>
                )}
              />
            </div>
          )}

          {/* --------------------------------------------------- follow-ups */}
          {aba === 'followups' && (
            <div className="flex flex-col gap-4">
              {podeCriarFollowUp && (
                <div className="flex justify-end">
                  <Botao variante="secundario" iconeInicio={<Plus />} onClick={() => setNovoFollowUp(true)}>
                    Agendar follow-up
                  </Botao>
                </div>
              )}
              <Lista
                carregando={followUps.isLoading}
                erro={followUps.error}
                recarregar={() => void followUps.refetch()}
                vazio="Nenhum follow-up para este cliente."
                itens={followUps.data ?? []}
                chave={(x) => x.id}
                linha={(x) => (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="num shrink-0 text-[12.5px] text-ink-2">{fmtData(x.data)}</span>
                      <span className="min-w-0 flex-1 text-[13px] text-ink">{x.proxima_acao}</span>
                      <Selo tom={x.situacao === 'aberto' ? 'atencao' : x.situacao === 'concluido' ? 'ok' : 'neutro'}>
                        {x.situacao}
                      </Selo>
                    </div>
                    {x.observacao && <p className="text-[12.5px] text-ink-2">{x.observacao}</p>}
                  </div>
                )}
              />
            </div>
          )}

          {/* -------------------------------------------------- documentos */}
          {aba === 'documentos' && (
            <Evidencias
              entidade="clientes"
              entidadeId={clienteId}
              categorias={['Contrato', 'Documento', 'Proposta', 'Outro']}
              titulo="Documentos do cliente"
              descricao="Arquivos anexados ficam guardados no Storage e só são visíveis para quem tem acesso ao CRM."
            />
          )}
        </div>
      </PainelLateral>

      {/* --------------------------------------------------- nova interação */}
      <PainelLateral
        aberto={novaInteracao}
        aoFechar={() => setNovaInteracao(false)}
        largura="md"
        titulo="Registrar interação"
        descricao={nome}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setNovaInteracao(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={registrarInteracao.isPending} onClick={() => registrarInteracao.mutate()}>
              Registrar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-6" rotulo="Tipo" obrigatorio>
              {(p) => (
                <Selecao {...p} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoInteracao })}>
                  {TIPOS_INTERACAO.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Quando" obrigatorio>
              {(p) => (
                <Entrada
                  {...p}
                  mono
                  type="datetime-local"
                  value={f.ocorrida_em}
                  onChange={(e) => setF({ ...f, ocorrida_em: e.target.value })}
                />
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Assunto" obrigatorio>
              {(p) => (
                <Entrada
                  {...p}
                  value={f.assunto}
                  onChange={(e) => setF({ ...f, assunto: e.target.value })}
                  placeholder="Ex.: Retorno sobre orçamento do freio dianteiro"
                />
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Descrição">
              {(p) => (
                <AreaTexto {...p} rows={4} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
              )}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {/* ---------------------------------------------------- novo follow-up */}
      <PainelLateral
        aberto={novoFollowUp}
        aoFechar={() => setNovoFollowUp(false)}
        largura="md"
        titulo="Agendar follow-up"
        descricao={nome}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setNovoFollowUp(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={registrarFollowUp.isPending} onClick={() => registrarFollowUp.mutate()}>
              Agendar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Próxima ação" obrigatorio>
              {(p) => (
                <Entrada
                  {...p}
                  value={fu.proxima_acao}
                  onChange={(e) => setFu({ ...fu, proxima_acao: e.target.value })}
                  placeholder="Ex.: Ligar para confirmar a revisão de 6 meses"
                />
              )}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Data" obrigatorio>
              {(p) => <Entrada {...p} mono type="date" value={fu.data} onChange={(e) => setFu({ ...fu, data: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Prioridade">
              {(p) => (
                <Selecao {...p} value={fu.prioridade} onChange={(e) => setFu({ ...fu, prioridade: e.target.value })}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Observação">
              {(p) => (
                <AreaTexto {...p} rows={3} value={fu.observacao} onChange={(e) => setFu({ ...fu, observacao: e.target.value })} />
              )}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>
    </>
  )
}

/* ------------------------------------------------------------ auxiliares */

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="lbl">{titulo}</h3>
      <div className="rounded-lg border border-line bg-surface p-4">{children}</div>
    </section>
  )
}

function Info({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-line py-1.5 text-[13px] last:border-0">
      <span className="w-44 shrink-0 text-ink-3">{rotulo}</span>
      <span className={mono ? 'num min-w-0 flex-1 text-ink' : 'min-w-0 flex-1 text-ink'}>{valor || '—'}</span>
    </div>
  )
}

function Lista<T>({
  carregando,
  erro,
  recarregar,
  vazio,
  itens,
  chave,
  linha,
}: {
  carregando: boolean
  erro: unknown
  recarregar: () => void
  vazio: string
  itens: T[]
  chave: (i: T) => string
  linha: (i: T) => React.ReactNode
}) {
  if (carregando) return <EstadoCarregando />
  if (erro) return <EstadoErro descricao={mensagemErro(erro)} aoTentarNovamente={recarregar} />
  if (itens.length === 0) return <EstadoVazio titulo="Nada por aqui" descricao={vazio} />
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((i) => (
        <li key={chave(i)} className="flex flex-wrap items-baseline gap-3 rounded-lg border border-line bg-surface p-3">
          {linha(i)}
        </li>
      ))}
    </ul>
  )
}
