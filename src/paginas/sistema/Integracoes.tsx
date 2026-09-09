import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cog,
  Package,
  PlugZap,
  RefreshCw,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro, tempoRelativo } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { EnvioOmie } from './integracoes/EnvioOmie'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type {
  ConflitoSincronizacao,
  EstadoIntegracao,
  Sincronizacao,
  StatusIntegracao,
  TipoSincronizacao,
} from '@/tipos/db'

const SELO_STATUS: Record<StatusIntegracao, { rotulo: string; tom: 'neutro' | 'info' | 'ok' | 'critico'; descricao: string }> = {
  nao_configurada: { rotulo: 'Não configurada', tom: 'neutro', descricao: 'Nenhuma credencial foi informada.' },
  configurada: { rotulo: 'Configurada', tom: 'info', descricao: 'Credenciais salvas, mas a conexão ainda não foi testada.' },
  conectada: { rotulo: 'Conectada', tom: 'ok', descricao: 'A última chamada à Omie foi bem-sucedida.' },
  erro: { rotulo: 'Erro', tom: 'critico', descricao: 'A última tentativa falhou.' },
}

const TIPOS: Array<{ tipo: TipoSincronizacao; rotulo: string; descricao: string; icone: typeof Users }> = [
  { tipo: 'clientes', rotulo: 'Clientes', descricao: 'Entram na mesma base de Cadastros › Clientes.', icone: Users },
  { tipo: 'produtos', rotulo: 'Produtos', descricao: 'Entram na mesma base de Cadastros › Produtos.', icone: Package },
  { tipo: 'servicos', rotulo: 'Serviços', descricao: 'Entram na mesma base de Cadastros › Serviços.', icone: Wrench },
  { tipo: 'estoque', rotulo: 'Estoque', descricao: 'Atualiza o saldo dos produtos já sincronizados.', icone: Boxes },
  { tipo: 'vendas', rotulo: 'Vendas', descricao: 'Alimenta os indicadores de Comercial.', icone: Cog },
]

const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.tipo, t.rotulo])) as Record<TipoSincronizacao, string>

interface FormCredenciais {
  app_key: string
  app_secret: string
  ambiente: string
}

interface RespostaSync {
  sincronizacao_id?: string
  processados?: number
  novos?: number
  atualizados?: number
  falhas?: number
  conflitos?: number
  proxima_pagina?: number | null
  total_paginas?: number
  concluida?: boolean
  erro?: string
}

export function Integracoes() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [configurando, setConfigurando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [progresso, setProgresso] = useState<{ tipo: TipoSincronizacao; pagina: number; total: number } | null>(null)

  const podeVer = pode('integracoes', 'visualizar')
  const podeConfigurar = pode('integracoes', 'configurar')
  const podeSincronizar = pode('integracoes', 'sincronizar')

  const estado = useQuery({
    queryKey: ['integracao', 'omie'],
    enabled: podeVer,
    queryFn: async (): Promise<EstadoIntegracao | null> => {
      const { data, error } = await supabase.rpc('integracao_estado', { p_provedor: 'omie' })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const historico = useQuery({
    queryKey: ['sincronizacoes'],
    enabled: podeVer,
    queryFn: async (): Promise<Sincronizacao[]> => {
      const { data, error } = await supabase
        .from('sincronizacoes')
        .select('*')
        .order('iniciada_em', { ascending: false })
        .limit(30)
      if (error) throw error
      return data ?? []
    },
  })

  const conflitos = useQuery({
    queryKey: ['conflitos-sincronizacao'],
    enabled: podeVer,
    queryFn: async (): Promise<ConflitoSincronizacao[]> => {
      const { data, error } = await supabase
        .from('conflitos_sincronizacao')
        .select('*')
        .is('resolvido_em', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })

  const form = useForm<FormCredenciais>({ defaultValues: { app_key: '', app_secret: '', ambiente: 'producao' } })

  async function chamar(corpo: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke<RespostaSync & { status?: string; erro?: string }>('omie', {
      body: corpo,
    })
    if (error) {
      const ctx = (error as { context?: Response })?.context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const c = (await ctx.json()) as { erro?: string }
          if (c?.erro) throw new Error(c.erro)
        } catch (e) {
          if (e instanceof Error && e.message) throw e
        }
      }
      throw new Error(mensagemErro(error))
    }
    return data!
  }

  const salvar = useMutation({
    mutationFn: (d: FormCredenciais) =>
      chamar({ acao: 'salvar_credenciais', app_key: d.app_key, app_secret: d.app_secret, ambiente: d.ambiente }),
    onSuccess: () => {
      toast.ok('Credenciais salvas', 'Teste a conexão para confirmar que estão corretas.')
      setConfigurando(false)
      form.reset()
      void qc.invalidateQueries({ queryKey: ['integracao'] })
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: () => chamar({ acao: 'remover_credenciais' }),
    onSuccess: () => {
      toast.ok('Credenciais removidas')
      setRemovendo(false)
      void qc.invalidateQueries({ queryKey: ['integracao'] })
    },
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  const testar = useMutation({
    mutationFn: () => chamar({ acao: 'testar' }),
    onSuccess: (r) => {
      if (r.erro) toast.erro('Conexão recusada', r.erro)
      else toast.ok('Conexão confirmada', 'A Omie respondeu com sucesso.')
      void qc.invalidateQueries({ queryKey: ['integracao'] })
    },
    onError: (e) => toast.erro('Falha ao testar', mensagemErro(e)),
  })

  /** Sincroniza percorrendo as páginas até o fim, sem travar a interface. */
  const sincronizar = useMutation({
    mutationFn: async (tipos: TipoSincronizacao[]) => {
      const resumo: Array<{ tipo: TipoSincronizacao; novos: number; atualizados: number; falhas: number; erro?: string }> = []

      for (const tipo of tipos) {
        let pagina = 1
        let id: string | undefined
        let ultimo: RespostaSync = {}
        setProgresso({ tipo, pagina, total: 0 })

        // Limite de segurança: evita laço infinito se a API mudar de contrato.
        for (let i = 0; i < 500; i++) {
          ultimo = await chamar({ acao: 'sincronizar', tipo, pagina, sincronizacao_id: id })
          id = ultimo.sincronizacao_id
          setProgresso({ tipo, pagina: ultimo.total_paginas ? pagina : 0, total: ultimo.total_paginas ?? 0 })
          if (ultimo.erro || ultimo.concluida || !ultimo.proxima_pagina) break
          pagina = ultimo.proxima_pagina
        }

        resumo.push({
          tipo,
          novos: ultimo.novos ?? 0,
          atualizados: ultimo.atualizados ?? 0,
          falhas: ultimo.falhas ?? 0,
          erro: ultimo.erro,
        })
      }

      setProgresso(null)
      return resumo
    },
    onSuccess: (resumo) => {
      const comErro = resumo.filter((r) => r.erro)
      if (comErro.length) {
        toast.erro('Sincronização interrompida', comErro.map((r) => `${ROTULO_TIPO[r.tipo]}: ${r.erro}`).join(' · '))
      } else {
        const novos = resumo.reduce((s, r) => s + r.novos, 0)
        const atualizados = resumo.reduce((s, r) => s + r.atualizados, 0)
        toast.ok('Sincronização concluída', `${novos} novo(s), ${atualizados} atualizado(s).`)
      }
      void qc.invalidateQueries({ queryKey: ['sincronizacoes'] })
      void qc.invalidateQueries({ queryKey: ['conflitos-sincronizacao'] })
      void qc.invalidateQueries({ queryKey: ['integracao'] })
      void qc.invalidateQueries({ queryKey: ['clientes'] })
      void qc.invalidateQueries({ queryKey: ['produtos'] })
      void qc.invalidateQueries({ queryKey: ['servicos'] })
    },
    onError: (e) => {
      setProgresso(null)
      toast.erro('Falha na sincronização', mensagemErro(e))
    },
  })

  const resolver = useMutation({
    mutationFn: async ({ id, decisao }: { id: string; decisao: string }) => {
      const { error } = await supabase
        .from('conflitos_sincronizacao')
        .update({ resolvido_em: new Date().toISOString(), decisao })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Conflito marcado como revisado')
      void qc.invalidateQueries({ queryKey: ['conflitos-sincronizacao'] })
    },
    onError: (e) => toast.erro('Não foi possível registrar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Sistema" titulo="Integrações" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const e = estado.data
  const selo = e ? SELO_STATUS[e.status] : SELO_STATUS.nao_configurada
  const ocupado = sincronizar.isPending || testar.isPending

  const colunasHistorico: Array<Coluna<Sincronizacao>> = [
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      largura: '130px',
      celula: (s) => <span className="font-medium text-ink">{ROTULO_TIPO[s.tipo] ?? s.tipo}</span>,
    },
    { chave: 'inicio', cabecalho: 'Início', largura: '160px', celula: (s) => <span className="num text-[12.5px]">{dataHora(s.iniciada_em)}</span> },
    {
      chave: 'fim',
      cabecalho: 'Fim',
      largura: '160px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (s) => <span className="num text-[12.5px]">{s.finalizada_em ? dataHora(s.finalizada_em) : '—'}</span>,
    },
    { chave: 'processados', cabecalho: 'Processados', largura: '110px', alinhamento: 'direita', celula: (s) => <span className="num">{s.processados}</span> },
    { chave: 'novos', cabecalho: 'Novos', largura: '90px', alinhamento: 'direita', celula: (s) => <span className="num text-ok-ink">{s.novos}</span> },
    { chave: 'atualizados', cabecalho: 'Atualizados', largura: '110px', alinhamento: 'direita', celula: (s) => <span className="num text-cyan-ink">{s.atualizados}</span> },
    {
      chave: 'falhas',
      cabecalho: 'Falhas',
      largura: '90px',
      alinhamento: 'direita',
      celula: (s) => <span className={cn('num', s.falhas > 0 ? 'text-crit-ink' : 'text-ink-3')}>{s.falhas}</span>,
    },
    {
      chave: 'resultado',
      cabecalho: 'Resultado',
      largura: '190px',
      celula: (s) => (
        <div className="flex flex-col gap-1">
          <Selo
            tom={
              s.resultado === 'concluida' ? 'ok'
              : s.resultado === 'em_andamento' ? 'info'
              : s.resultado === 'concluida_com_falhas' ? 'atencao'
              : 'critico'
            }
            ponto
          >
            {s.resultado === 'concluida' ? 'Concluída'
              : s.resultado === 'em_andamento' ? 'Em andamento'
              : s.resultado === 'concluida_com_falhas' ? 'Com pendências'
              : s.resultado === 'cancelada' ? 'Cancelada'
              : 'Falhou'}
          </Selo>
          {s.mensagem && <span className="text-[11.5px] leading-snug text-ink-3">{s.mensagem}</span>}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Sistema"
        titulo="Integrações"
        acoes={
          <Botao variante="neutro" iconeInicio={<RefreshCw />} onClick={() => void estado.refetch()} carregando={estado.isFetching}>
            Atualizar
          </Botao>
        }
      />

      <Aviso tom="info" titulo="A Omie é opcional">
        O Tecnoar funciona por completo com os próprios cadastros. A integração apenas traz para a mesma base os
        registros que já existem na Omie — cadastros manuais e sincronizados convivem lado a lado.
      </Aviso>

      {estado.isLoading && <EstadoCarregando rotulo="Carregando integração…" />}
      {estado.isError && <EstadoErro descricao={mensagemErro(estado.error)} aoTentarNovamente={() => void estado.refetch()} />}

      {estado.isSuccess && (
        <>
          <Painel semPadding>
            <CabecalhoPainel
              titulo="Omie"
              descricao="ERP financeiro e de cadastros."
              acao={
                <div className="flex flex-wrap gap-2">
                  {podeConfigurar && (
                    <Botao tamanho="sm" variante="neutro" onClick={() => setConfigurando(true)}>
                      {e?.tem_credenciais ? 'Alterar credenciais' : 'Configurar'}
                    </Botao>
                  )}
                  {podeConfigurar && e?.tem_credenciais && (
                    <Botao tamanho="sm" variante="destrutivo" iconeInicio={<Trash2 />} onClick={() => setRemovendo(true)}>
                      Remover
                    </Botao>
                  )}
                  {e?.tem_credenciais && (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      iconeInicio={<PlugZap />}
                      carregando={testar.isPending}
                      disabled={ocupado}
                      onClick={() => testar.mutate()}
                    >
                      Testar conexão
                    </Botao>
                  )}
                </div>
              }
            />

            <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <span className="lbl">Status</span>
                <Selo tom={selo.tom} ponto>{selo.rotulo}</Selo>
                <span className="text-[12px] leading-relaxed text-ink-3">{selo.descricao}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="lbl">Ambiente</span>
                <span className="text-[13.5px] text-ink">{e?.ambiente === 'sandbox' ? 'Homologação' : 'Produção'}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="lbl">App key</span>
                <span className="num text-[13px] text-ink">{e?.app_key_mascarada ?? 'Não informada'}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="lbl">Última conexão</span>
                <span className="num text-[13px] text-ink">
                  {e?.ultima_conexao_em ? dataHora(e.ultima_conexao_em) : 'Nunca'}
                </span>
                {e?.ultima_conexao_em && (
                  <span className="text-[11.5px] text-ink-3">{tempoRelativo(e.ultima_conexao_em)}</span>
                )}
              </div>
            </div>

            {e?.ultimo_erro && (
              <div className="px-5 pb-5">
                <Aviso tom="critico" titulo="Último erro relatado pela Omie">
                  {e.ultimo_erro}
                </Aviso>
              </div>
            )}
          </Painel>

          <EnvioOmie podeEnviar={podeSincronizar} configurada={Boolean(e?.tem_credenciais)} />

          <Painel semPadding>
            <CabecalhoPainel
              titulo="Sincronização"
              descricao="Cada tipo entra na base correspondente do Tecnoar."
              acao={
                podeSincronizar && e?.tem_credenciais ? (
                  <Botao
                    tamanho="sm"
                    variante="primario"
                    iconeInicio={<RefreshCw />}
                    carregando={sincronizar.isPending}
                    disabled={ocupado}
                    onClick={() => sincronizar.mutate(['clientes', 'produtos', 'servicos', 'estoque', 'vendas'])}
                  >
                    Sincronizar tudo
                  </Botao>
                ) : undefined
              }
            />

            <div className="p-5">
              {!e?.tem_credenciais ? (
                <Aviso tom="atencao" titulo="Configure as credenciais primeiro">
                  Sem app key e app secret o sistema não tem como falar com a Omie. Nenhuma sincronização pode ser
                  iniciada.
                </Aviso>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {TIPOS.map((t) => {
                    const rodando = progresso?.tipo === t.tipo
                    return (
                      <div key={t.tipo} className="flex flex-col gap-3 rounded-lg border border-line p-4">
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 text-ink-3 [&_svg]:size-4">
                            <t.icone />
                          </span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[13.5px] font-semibold text-ink">{t.rotulo}</span>
                            <span className="text-[12px] leading-relaxed text-ink-3">{t.descricao}</span>
                          </div>
                        </div>
                        <Botao
                          tamanho="sm"
                          variante="neutro"
                          larguraTotal
                          iconeInicio={<RefreshCw />}
                          disabled={!podeSincronizar || ocupado}
                          carregando={rodando}
                          onClick={() => sincronizar.mutate([t.tipo])}
                        >
                          {rodando
                            ? progresso!.total > 0
                              ? `Página ${progresso!.pagina} de ${progresso!.total}`
                              : 'Sincronizando…'
                            : 'Sincronizar'}
                        </Botao>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Painel>

          {conflitos.isSuccess && conflitos.data.length > 0 && (
            <Painel semPadding>
              <CabecalhoPainel
                titulo="Aguardando revisão"
                descricao="Registros que não foram unidos automaticamente por falta de correspondência segura."
              />
              <ul className="flex flex-col divide-y divide-[var(--c-line)]">
                {conflitos.data.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-3 p-4">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[13.5px] text-ink">{c.motivo}</span>
                      <span className="num text-[11.5px] text-ink-3">
                        {ROTULO_TIPO[c.tipo] ?? c.tipo} · Omie {c.identificador ?? '—'} · {dataHora(c.created_at)}
                      </span>
                    </div>
                    {podeSincronizar && (
                      <Botao
                        tamanho="sm"
                        variante="neutro"
                        iconeInicio={<CheckCircle2 />}
                        carregando={resolver.isPending}
                        onClick={() => resolver.mutate({ id: c.id, decisao: 'revisado manualmente' })}
                      >
                        Marcar como revisado
                      </Botao>
                    )}
                  </li>
                ))}
              </ul>
            </Painel>
          )}

          <Painel semPadding>
            <CabecalhoPainel titulo="Histórico de sincronizações" descricao="Números reais de cada execução." />
            <div className="p-5">
              {historico.isLoading && <EstadoCarregando rotulo="Carregando histórico…" />}
              {historico.isError && (
                <EstadoErro descricao={mensagemErro(historico.error)} aoTentarNovamente={() => void historico.refetch()} />
              )}
              {historico.isSuccess && historico.data.length === 0 && (
                <EstadoVazio
                  titulo="Nenhuma sincronização executada"
                  descricao="O histórico registra tipo, início, fim, quantidades e falhas de cada execução."
                  compacto
                />
              )}
              {historico.isSuccess && historico.data.length > 0 && (
                <Tabela colunas={colunasHistorico} linhas={historico.data} chaveDe={(s) => s.id} estado="ok" densidade="compacta" />
              )}
            </div>
          </Painel>
        </>
      )}

      <PainelLateral
        aberto={configurando}
        aoFechar={() => setConfigurando(false)}
        titulo="Credenciais da Omie"
        descricao="Ficam apenas no servidor. O sistema nunca devolve o segredo para a tela."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setConfigurando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>
              Salvar
            </Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          <Aviso tom="info">
            As credenciais são geradas no painel da Omie em <strong className="font-semibold text-ink">Configurações › Chaves de integração</strong>.
          </Aviso>
          <Campo rotulo="App key" obrigatorio>
            {(p) => <Entrada {...p} mono {...form.register('app_key', { required: true })} autoComplete="off" />}
          </Campo>
          <Campo rotulo="App secret" obrigatorio>
            {(p) => <Entrada {...p} mono type="password" {...form.register('app_secret', { required: true })} autoComplete="off" />}
          </Campo>
          <Campo rotulo="Ambiente">
            {(p) => (
              <Selecao {...p} {...form.register('ambiente')}>
                <option value="producao">Produção</option>
                <option value="sandbox">Homologação</option>
              </Selecao>
            )}
          </Campo>
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={removendo}
        aoFechar={() => setRemovendo(false)}
        aoConfirmar={() => remover.mutate()}
        carregando={remover.isPending}
        destrutivo
        titulo="Remover credenciais da Omie?"
        rotuloConfirmar="Remover"
        descricao="A integração volta para “Não configurada”. Os registros já sincronizados continuam no Tecnoar e a operação segue normalmente."
      />
    </div>
  )
}
