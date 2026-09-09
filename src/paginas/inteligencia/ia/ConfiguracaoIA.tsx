import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Blocks,
  Check,
  KeyRound,
  Mic,
  Plug,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Selo } from '@/componentes/ui/Selo'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { IAConfig, IADominio, IAEquipamento } from '@/tipos/db'

type Provedor = 'anthropic' | 'openai' | 'gemini'

/**
 * Catálogo dos provedores.
 *
 * Os modelos listados são atalhos, não uma trava: o campo aceita qualquer
 * identificador. Versão nova de modelo sai toda semana e não pode depender de
 * alguém publicar o sistema de novo para ser usada.
 */
const PROVEDORES: Array<{
  id: Provedor
  nome: string
  ondeObter: string
  prefixo: string
  sugestoes: string[]
  observacao?: string
}> = [
  {
    id: 'gemini',
    nome: 'Google (Gemini)',
    ondeObter: 'aistudio.google.com › API keys',
    prefixo: 'AIza',
    sugestoes: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'],
    observacao:
      'Modelos Pro costumam ter cota zero no plano gratuito do Gemini. Se der "quota exceeded", use um flash.',
  },
  {
    id: 'anthropic',
    nome: 'Anthropic (Claude)',
    ondeObter: 'console.anthropic.com › API Keys',
    prefixo: 'sk-ant-',
    sugestoes: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  {
    id: 'openai',
    nome: 'OpenAI (GPT)',
    ondeObter: 'platform.openai.com › API keys',
    prefixo: 'sk-',
    sugestoes: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'o4-mini'],
    observacao: 'Nesta integração o OpenAI lê texto e imagem. PDF precisa ser enviado como foto das páginas.',
  },
]

interface Situacao {
  provedor: string
  modelo: string
  configurada: boolean
  status: string
  ultima_conexao_em: string | null
  ultimo_erro: string | null
  transcricao_configurada: boolean
  transcricao_status: string
}

/**
 * Configuração da Tecnoar IA.
 *
 * A chave nunca volta para a tela depois de salva — o campo mostra apenas se
 * existe uma guardada. Quem lê o segredo é a função de borda, com a chave de
 * serviço; o navegador jamais a recebe.
 */
export function ConfiguracaoIA() {
  const qc = useQueryClient()
  const [f2Provedor, setF2Provedor] = useState<Provedor>('gemini')
  const toast = useToast()
  const [erro, setErro] = useState<string | null>(null)

  const situacao = useQuery({
    queryKey: ['ia-situacao'],
    queryFn: async (): Promise<Situacao | null> => {
      const { data, error } = await supabase.rpc('ia_situacao')
      if (error) throw error
      return (data as unknown as Situacao[])?.[0] ?? null
    },
  })

  const provedores = useQuery({
    queryKey: ['ia-provedores'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ia_provedores')
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        provedor: string
        modelo: string | null
        configurada: boolean
        status: string
      }>
    },
  })

  const config = useQuery({
    queryKey: ['ia-config'],
    queryFn: async (): Promise<IAConfig | null> => {
      const { data, error } = await supabase.from('ia_config').select('*').eq('id', true).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const dominios = useQuery({
    queryKey: ['ia-dominios'],
    queryFn: async (): Promise<IADominio[]> => {
      const { data, error } = await supabase.from('ia_dominios').select('*').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const equipamentos = useQuery({
    queryKey: ['ia-equipamentos'],
    queryFn: async (): Promise<IAEquipamento[]> => {
      const { data, error } = await supabase.from('ia_equipamentos').select('*').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  /**
   * Modelos que a chave realmente enxerga.
   *
   * Vem do provedor, não de uma lista escrita no código: foi uma lista fixa
   * que deixou a Tecnoar apontando para um modelo que a conta não podia mais
   * usar. Só busca quando há chave guardada para o provedor escolhido.
   */
  const modelosDisponiveis = useQuery({
    queryKey: ['ia-modelos', f2Provedor],
    enabled: Boolean(f2Provedor),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        status?: string
        erro?: string
        modelos?: Array<{ id: string; rotulo: string; previa: boolean }>
      }>('ia-modelos', { body: { provedor: f2Provedor } })
      if (error) throw error
      return data ?? { status: 'erro', modelos: [] }
    },
  })

  const [f, setF] = useState({
    provedor: 'anthropic' as Provedor,
    modelo: '',
    max_tokens: '4000',
    artigos_contexto: '5',
    instrucoes_extra: '',
    aprendizado_ativo: true,
    exige_revisao: true,
  })

  useEffect(() => {
    const c = config.data
    if (!c) return
    setF2Provedor((c.provedor as Provedor) ?? 'gemini')
    setF({
      provedor: (c.provedor as Provedor) ?? 'gemini',
      modelo: c.modelo ?? '',
      max_tokens: String(c.max_tokens),
      artigos_contexto: String(c.artigos_contexto),
      instrucoes_extra: c.instrucoes_extra ?? '',
      aprendizado_ativo: c.aprendizado_ativo,
      exige_revisao: c.exige_revisao,
    })
  }, [config.data])

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['ia-situacao'] })
    void qc.invalidateQueries({ queryKey: ['ia-provedores'] })
    void qc.invalidateQueries({ queryKey: ['ia-config'] })
  }

  const chamar = async (corpo: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<{ status?: string; erro?: string }>('ia', { body: corpo })
    if (error) throw error
    if (data?.erro && data.status !== 'sem_transcricao') throw new Error(data.erro)
    return data
  }

  const salvarConfig = useMutation({
    mutationFn: async () => {
      setErro(null)
      const tokens = Number(f.max_tokens)
      const artigos = Number(f.artigos_contexto)
      if (!Number.isFinite(tokens) || tokens < 512 || tokens > 32000) {
        throw new Error('O limite de tokens precisa ficar entre 512 e 32000.')
      }
      if (!Number.isFinite(artigos) || artigos < 0 || artigos > 20) {
        throw new Error('A quantidade de artigos de contexto precisa ficar entre 0 e 20.')
      }
      if (!f.modelo.trim()) throw new Error('Informe o identificador do modelo.')

      const { error } = await supabase
        .from('ia_config')
        .update({
          provedor: f.provedor,
          modelo: f.modelo.trim(),
          max_tokens: tokens,
          artigos_contexto: artigos,
          instrucoes_extra: f.instrucoes_extra.trim() || null,
          aprendizado_ativo: f.aprendizado_ativo,
          exige_revisao: f.exige_revisao,
          updated_at: new Date().toISOString(),
        })
        .eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Configuração salva')
      invalidar()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const testar = useMutation({
    mutationFn: () => chamar({ acao: 'testar' }),
    onSuccess: (d) => {
      if (d?.status === 'conectada') toast.ok('Conexão testada com sucesso')
      else toast.erro('A conexão falhou', d?.erro ?? 'Verifique a chave e o modelo.')
      invalidar()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  if (situacao.isLoading || config.isLoading) return <EstadoCarregando rotulo="Carregando configuração…" />

  const s = situacao.data
  const provedorAtual = PROVEDORES.find((p) => p.id === f.provedor)
  const listaModelos = modelosDisponiveis.data?.modelos ?? []

  return (
    <div className="flex flex-col gap-4">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      {/* estado atual */}
      <div className="aresta flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lbl">Estado da Tecnoar IA</span>
          <div className="flex flex-wrap items-center gap-2">
            {s?.configurada ? (
              <Selo tom={s.status === 'conectada' ? 'ok' : s.status === 'erro' ? 'critico' : 'atencao'} ponto>
                {s.status === 'conectada' ? 'Conectada' : s.status === 'erro' ? 'Com erro' : 'Configurada'}
              </Selo>
            ) : (
              <Selo tom="neutro" ponto>Não configurada</Selo>
            )}
            <span className="num text-[12.5px] text-ink-2">
              {PROVEDORES.find((p) => p.id === s?.provedor)?.nome ?? s?.provedor} · {s?.modelo || 'sem modelo'}
            </span>
            {s?.ultima_conexao_em && (
              <span className="num text-[11.5px] text-ink-3">último contato em {dataHora(s.ultima_conexao_em)}</span>
            )}
          </div>
          {s?.ultimo_erro && <span className="text-[12px] text-crit-ink">{s.ultimo_erro}</span>}
        </div>
        <Botao
          variante="secundario"
          iconeInicio={<Plug />}
          disabled={!s?.configurada}
          carregando={testar.isPending}
          onClick={() => testar.mutate()}
        >
          Testar conexão
        </Botao>
      </div>

      {!s?.configurada && (
        <Aviso tom="atencao" titulo="Nenhuma chave informada para o provedor escolhido">
          A IA não responde nada enquanto não houver chave. O sistema não simula resposta.
        </Aviso>
      )}

      {/* provedores */}
      <Painel semPadding>
        <CabecalhoPainel
          titulo="Provedores de modelo"
          descricao="Cadastre a chave de cada fornecedor que a oficina usa. Só um fica ativo por vez."
          acao={
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <ShieldCheck aria-hidden className="size-3.5 text-ok" />
              A chave fica no servidor
            </span>
          }
        />
        <div className="flex flex-col gap-3 p-5">
          {PROVEDORES.map((p) => (
            <CartaoProvedor
              key={p.id}
              info={p}
              ativo={f.provedor === p.id}
              estado={provedores.data?.find((x) => x.provedor === p.id)}
              aoSalvar={async (chave, modelo) => {
                await chamar({ acao: 'salvar_credenciais', provedor: p.id, api_key: chave, modelo })
                toast.ok(`Chave do ${p.nome} guardada`)
                invalidar()
              }}
              aoRemover={async () => {
                await chamar({ acao: 'remover_credenciais', provedor: p.id })
                toast.ok(`Chave do ${p.nome} removida`)
                invalidar()
              }}
              aoAtivar={() => {
                setF2Provedor(p.id)
                setF({ ...f, provedor: p.id, modelo: p.sugestoes[0] })
              }}
            />
          ))}

          <CartaoProvedor
            info={{
              id: 'transcricao' as Provedor,
              nome: 'Transcrição de áudio (Whisper / OpenAI)',
              ondeObter: 'platform.openai.com › API keys',
              prefixo: 'sk-',
              sugestoes: ['whisper-1', 'gpt-4o-transcribe'],
              observacao:
                'Sem este serviço os áudios do pátio ficam anexados mas não são ouvidos pela IA — e ela diz isso na conversa.',
            }}
            icone={<Mic />}
            estado={provedores.data?.find((x) => x.provedor === 'transcricao')}
            aoSalvar={async (chave, modelo) => {
              await chamar({ acao: 'salvar_credenciais', provedor: 'transcricao', api_key: chave, modelo })
              toast.ok('Serviço de transcrição configurado')
              invalidar()
            }}
            aoRemover={async () => {
              await chamar({ acao: 'remover_credenciais', provedor: 'transcricao' })
              toast.ok('Transcrição desligada')
              invalidar()
            }}
          />
        </div>
      </Painel>

      {/* comportamento */}
      <Secao numero="01" titulo="Comportamento" descricao="Como a IA responde e o quanto ela consulta da base.">
        <Grade>
          <Campo className="sm:col-span-4" rotulo="Provedor ativo" obrigatorio>
            {(p) => (
              <Selecao
                {...p}
                value={f.provedor}
                onChange={(e) => {
                  const novo = e.target.value as Provedor
                  const info = PROVEDORES.find((x) => x.id === novo)
                  setF2Provedor(novo)
                  setF({ ...f, provedor: novo, modelo: info?.sugestoes[0] ?? '' })
                }}
              >
                {PROVEDORES.map((x) => (
                  <option key={x.id} value={x.id}>{x.nome}</option>
                ))}
              </Selecao>
            )}
          </Campo>

          <Campo
            className="sm:col-span-4"
            rotulo="Modelo"
            obrigatorio
            dica={
              modelosDisponiveis.data?.status === 'ok'
                ? `${modelosDisponiveis.data.modelos?.length ?? 0} modelos disponíveis nesta conta.`
                : 'Guarde a chave para carregar os modelos da conta.'
            }
          >
            {(p) =>
              listaModelos.length > 0 ? (
                <Selecao {...p} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })}>
                  {/* O modelo gravado pode ter saído do ar: continua listado
                      para o administrador ver o que está configurado hoje. */}
                  {f.modelo && !listaModelos.some((m) => m.id === f.modelo) && (
                    <option value={f.modelo}>{f.modelo} (não está mais na conta)</option>
                  )}
                  {listaModelos
                    .filter((m) => !m.previa)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.rotulo}</option>
                    ))}
                  {listaModelos.some((m) => m.previa) && (
                    <optgroup label="Prévias e experimentais">
                      {listaModelos
                        .filter((m) => m.previa)
                        .map((m) => (
                          <option key={m.id} value={m.id}>{m.rotulo}</option>
                        ))}
                    </optgroup>
                  )}
                </Selecao>
              ) : (
                <>
                  <Entrada
                    {...p}
                    mono
                    list="modelos-sugeridos"
                    value={f.modelo}
                    onChange={(e) => setF({ ...f, modelo: e.target.value })}
                    placeholder={provedorAtual?.sugestoes[0]}
                  />
                  <datalist id="modelos-sugeridos">
                    {provedorAtual?.sugestoes.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </>
              )
            }
          </Campo>

          <Campo className="sm:col-span-2" rotulo="Tokens por resposta" dica="Entre 512 e 32000.">
            {(p) => (
              <Entrada
                {...p}
                mono
                type="number"
                value={f.max_tokens}
                onChange={(e) => setF({ ...f, max_tokens: e.target.value })}
              />
            )}
          </Campo>

          <Campo className="sm:col-span-2" rotulo="Artigos de contexto" dica="Quantos artigos da base entram por resposta.">
            {(p) => (
              <Entrada
                {...p}
                mono
                type="number"
                value={f.artigos_contexto}
                onChange={(e) => setF({ ...f, artigos_contexto: e.target.value })}
              />
            )}
          </Campo>

          <Campo
            className="sm:col-span-12"
            rotulo="Orientação da casa"
            dica="Somada ao papel de perita. Use para regras específicas da Tecnoar."
          >
            {(p) => (
              <AreaTexto
                {...p}
                rows={3}
                value={f.instrucoes_extra}
                onChange={(e) => setF({ ...f, instrucoes_extra: e.target.value })}
                placeholder="Ex.: sempre lembrar o mecânico de registrar a pressão medida no checklist da OS."
              />
            )}
          </Campo>
        </Grade>
      </Secao>

      <Secao numero="02" titulo="Aprendizado" descricao="Como o conhecimento da conversa vira base técnica.">
        <div className="flex flex-col gap-3">
          <Interruptor
            ligado={f.aprendizado_ativo}
            aoAlternar={() => setF({ ...f, aprendizado_ativo: !f.aprendizado_ativo })}
            titulo="Aprender com as respostas marcadas como úteis"
            descricao="Cada resposta aprovada pelo técnico entra na fila para virar artigo da base."
          />
          <Interruptor
            ligado={f.exige_revisao}
            aoAlternar={() => setF({ ...f, exige_revisao: !f.exige_revisao })}
            titulo="Exigir revisão humana antes de publicar"
            descricao="O artigo nasce como rascunho e só vai para a base depois que alguém revisa."
            travado={!f.aprendizado_ativo}
          />
          {!f.exige_revisao && f.aprendizado_ativo && (
            <Aviso tom="atencao" titulo="Sem revisão, um erro da IA vira procedimento da casa">
              O artigo gerado passa a valer como fonte nas próximas respostas. Recomendo manter a revisão ligada.
            </Aviso>
          )}
        </div>
      </Secao>

      {/* especialidade */}
      <Painel semPadding>
        <CabecalhoPainel
          titulo="Especialidade"
          descricao="O que a IA domina e com quais aparelhos ela sabe orientar. Isso alimenta as instruções dela."
          acao={<Blocks aria-hidden className="size-4 text-ink-3" />}
        />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="lbl">Domínios técnicos</span>
            {(dominios.data ?? []).map((d) => (
              <div key={d.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">{d.nome}</span>
                  {!d.ativo && <Selo tom="neutro">Desligado</Selo>}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{d.descricao}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="lbl">Equipamentos de diagnóstico</span>
            {(equipamentos.data ?? []).map((e) => (
              <div key={e.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">{e.nome}</span>
                  {e.fabricante && <span className="text-[11.5px] text-ink-3">{e.fabricante}</span>}
                  {!e.ativo && <Selo tom="neutro">Desligado</Selo>}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{e.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </Painel>

      <div className="flex justify-end gap-2">
        <Botao variante="primario" carregando={salvarConfig.isPending} onClick={() => salvarConfig.mutate()}>
          Salvar configuração
        </Botao>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- cartão de chave */

function CartaoProvedor({
  info,
  ativo,
  estado,
  icone,
  aoSalvar,
  aoRemover,
  aoAtivar,
}: {
  info: { id: string; nome: string; ondeObter: string; prefixo: string; sugestoes: string[]; observacao?: string }
  ativo?: boolean
  estado?: { configurada: boolean; status: string; modelo: string | null }
  icone?: React.ReactNode
  aoSalvar: (chave: string, modelo: string) => Promise<void>
  aoRemover: () => Promise<void>
  aoAtivar?: () => void
}) {
  const toast = useToast()
  const [chave, setChave] = useState('')
  const [modelo, setModelo] = useState(info.sugestoes[0] ?? '')
  const [salvando, setSalvando] = useState(false)
  const configurada = estado?.configurada ?? false

  async function salvar() {
    if (!chave.trim()) {
      toast.erro('Informe a chave', 'O campo está vazio.')
      return
    }
    setSalvando(true)
    try {
      await aoSalvar(chave.trim(), modelo.trim())
      setChave('')
    } catch (e) {
      toast.erro('Não foi possível guardar a chave', mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className={cn(
        'aresta rounded-lg border p-4',
        ativo ? 'border-cyan/50 bg-cyan-soft/30' : 'border-line bg-surface',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-3">{icone ?? <KeyRound aria-hidden className="size-4" />}</span>
        <span className="text-[13.5px] font-medium text-ink">{info.nome}</span>
        {configurada ? (
          <Selo tom={estado?.status === 'erro' ? 'critico' : 'ok'} ponto>
            {estado?.status === 'erro' ? 'Com erro' : 'Chave guardada'}
          </Selo>
        ) : (
          <Selo tom="neutro">Sem chave</Selo>
        )}
        {ativo && <Selo tom="info">Ativo</Selo>}
        {!ativo && aoAtivar && configurada && (
          <Botao tamanho="sm" variante="fantasma" onClick={aoAtivar} className="ml-auto">
            Usar este
          </Botao>
        )}
      </div>

      <p className="mt-1.5 text-[12px] text-ink-3">
        Chave em <span className="num">{info.ondeObter}</span> · começa com{' '}
        <span className="num">{info.prefixo}</span>
      </p>
      {info.observacao && (
        <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-ink-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
          {info.observacao}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-7">
          <Entrada
            mono
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={configurada ? 'Informe outra chave para substituir' : `${info.prefixo}…`}
            aria-label={`Chave da API — ${info.nome}`}
          />
        </div>
        <div className="sm:col-span-3">
          <Entrada
            mono
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="modelo"
            aria-label={`Modelo padrão — ${info.nome}`}
          />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Botao
            tamanho="sm"
            variante="secundario"
            iconeInicio={<Check />}
            carregando={salvando}
            onClick={() => void salvar()}
          >
            Guardar
          </Botao>
          {configurada && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              iconeInicio={<Trash2 />}
              onClick={() => void aoRemover()}
            >
              <span className="sr-only">Remover chave do {info.nome}</span>
            </Botao>
          )}
        </div>
      </div>
    </div>
  )
}

function Interruptor({
  ligado,
  aoAlternar,
  titulo,
  descricao,
  travado,
}: {
  ligado: boolean
  aoAlternar: () => void
  titulo: string
  descricao: string
  travado?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={travado}
      onClick={aoAlternar}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors disabled:opacity-50',
        ligado ? 'border-cyan/40 bg-cyan-soft/30' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
          ligado ? 'bg-cyan' : 'bg-surface-2',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-white shadow-e1 transition-transform',
            ligado && 'translate-x-4',
          )}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-ink">{titulo}</span>
        <span className="text-[12px] leading-snug text-ink-2">{descricao}</span>
      </span>
    </button>
  )
}
