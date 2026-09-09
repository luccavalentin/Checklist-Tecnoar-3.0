import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GitBranch, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Alternador, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo } from '@/componentes/ui/Selo'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { TIPOS_VEICULO } from '@/paginas/cadastros/Veiculos'
import { ROTULO_TIPO_CHECKLIST } from './rotulos'
import type { ChecklistModelo, ChecklistModeloItem, TipoChecklist, TipoVeiculo } from '@/tipos/db'

const TIPOS_CHECKLIST_OPERACAO: TipoChecklist[] = ['tecnico_inicial', 'final_os']

/**
 * Editor dos itens de um modelo.
 *
 * Se o modelo já foi usado, alterar a lista publica uma nova versão em vez de
 * mexer na anterior — os checklists já preenchidos continuam exatamente como
 * foram respondidos.
 */
export function EditorModelo({ modelo }: { modelo: ChecklistModelo }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = usePermissoes()
  const podeConfigurar = pode('checklists', 'configurar') || pode('checklist_5s', 'configurar')

  const [novoTexto, setNovoTexto] = useState('')
  const [novaSecao, setNovaSecao] = useState('Geral')
  const [confirmandoVersao, setConfirmandoVersao] = useState<null | (() => void)>(null)

  /* Propriedades do próprio modelo — antes só os itens eram editáveis, então
     um modelo nascia com o nome errado e ficava assim para sempre. */
  const [prop, setProp] = useState({
    descricao: modelo.descricao,
    tipo: modelo.tipo,
    tipo_veiculo: modelo.tipo_veiculo ?? '',
    entrada_visual: modelo.entrada_visual,
    situacao: modelo.situacao,
  })

  useEffect(() => {
    setProp({
      descricao: modelo.descricao,
      tipo: modelo.tipo,
      tipo_veiculo: modelo.tipo_veiculo ?? '',
      entrada_visual: modelo.entrada_visual,
      situacao: modelo.situacao,
    })
  }, [modelo])

  const usos = useQuery({
    queryKey: ['checklist-usos', modelo.id, modelo.versao_atual],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('modelo_id', modelo.id)
        .eq('versao', modelo.versao_atual)
      if (error) throw error
      return count ?? 0
    },
  })

  /* Execuções de qualquer versão — decide se o tipo ainda pode mudar. */
  const usosTotais = useQuery({
    queryKey: ['checklist-usos-totais', modelo.id],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('modelo_id', modelo.id)
      if (error) throw error
      return count ?? 0
    },
  })

  const itens = useQuery({
    queryKey: ['checklist-itens', modelo.id, modelo.versao_atual],
    queryFn: async (): Promise<ChecklistModeloItem[]> => {
      const { data, error } = await supabase
        .from('checklist_modelo_itens')
        .select('*')
        .eq('modelo_id', modelo.id)
        .eq('versao', modelo.versao_atual)
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const secoes = useMemo(() => {
    const s = new Set<string>(['Geral'])
    for (const i of itens.data ?? []) s.add(i.secao)
    return [...s]
  }, [itens.data])

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ['checklist-itens', modelo.id] })
    void qc.invalidateQueries({ queryKey: ['checklist-modelos'] })
    void qc.invalidateQueries({ queryKey: ['checklist-usos', modelo.id] })
  }

  /** Garante que edições em versão já usada criem uma nova versão antes. */
  async function garantirVersaoEditavel(): Promise<number> {
    if ((usos.data ?? 0) === 0) return modelo.versao_atual
    const { data, error } = await supabase.rpc('nova_versao_checklist', { p_modelo: modelo.id })
    if (error) throw error
    toast.info('Nova versão publicada', `O modelo passou para a versão ${data}. O histórico anterior fica intacto.`)
    return data as number
  }

  /**
   * Salva as propriedades do modelo.
   *
   * Não mexe em versão: descrição, situação e marcação visual não alteram a
   * lista de itens respondida, então republicar versão aqui só poluiria o
   * histórico. O tipo é a exceção — ele decide o formato de resposta dos
   * itens, e por isso só muda enquanto o modelo não tem item nem execução.
   */
  const salvarPropriedades = useMutation({
    mutationFn: async () => {
      const descricao = prop.descricao.trim()
      if (descricao.length < 3) throw new Error('Informe a descrição do modelo.')
      const { error } = await supabase
        .from('checklist_modelos')
        .update({
          descricao,
          tipo: prop.tipo,
          tipo_veiculo: prop.tipo_veiculo === '' ? null : (prop.tipo_veiculo as TipoVeiculo),
          entrada_visual: prop.entrada_visual,
          situacao: prop.situacao,
        })
        .eq('id', modelo.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Modelo atualizado')
      void qc.invalidateQueries({ queryKey: ['checklist-modelos'] })
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const adicionar = useMutation({
    mutationFn: async () => {
      const texto = novoTexto.trim()
      if (texto.length < 3) throw new Error('Descreva o item com pelo menos 3 caracteres.')
      if ((itens.data ?? []).some((i) => i.texto.toLowerCase() === texto.toLowerCase() && i.secao === novaSecao)) {
        throw new Error('Já existe um item igual nesta seção.')
      }
      const versao = await garantirVersaoEditavel()
      const maior = Math.max(0, ...(itens.data ?? []).map((i) => i.ordem))
      const { error } = await supabase.from('checklist_modelo_itens').insert({
        modelo_id: modelo.id,
        versao,
        secao: novaSecao,
        ordem: maior + 1,
        texto,
        tipo_resposta: modelo.tipo.startsWith('diario') ? 'conformidade' : 'estado',
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNovoTexto('')
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível adicionar', mensagemErro(e)),
  })

  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<ChecklistModeloItem> }) => {
      await garantirVersaoEditavel()
      const { error } = await supabase.from('checklist_modelo_itens').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      await garantirVersaoEditavel()
      const { error } = await supabase.from('checklist_modelo_itens').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  const mover = useMutation({
    mutationFn: async ({ item, direcao }: { item: ChecklistModeloItem; direcao: -1 | 1 }) => {
      const lista = itens.data ?? []
      const i = lista.findIndex((x) => x.id === item.id)
      const j = i + direcao
      if (j < 0 || j >= lista.length) return
      await garantirVersaoEditavel()
      const outro = lista[j]!
      const r1 = await supabase.from('checklist_modelo_itens').update({ ordem: outro.ordem }).eq('id', item.id)
      if (r1.error) throw r1.error
      const r2 = await supabase.from('checklist_modelo_itens').update({ ordem: item.ordem }).eq('id', outro.id)
      if (r2.error) throw r2.error
    },
    onSuccess: invalidar,
    onError: (e) => toast.erro('Não foi possível reordenar', mensagemErro(e)),
  })

  const jaUsado = (usos.data ?? 0) > 0

  /* O tipo governa o formato de resposta dos itens; trocá-lo depois de existir
     item ou execução deixaria respostas de formatos diferentes no mesmo modelo. */
  const podeTrocarTipo = (itens.data?.length ?? 0) === 0 && (usosTotais.data ?? 0) === 0

  const alterouPropriedades =
    prop.descricao.trim() !== modelo.descricao ||
    prop.tipo !== modelo.tipo ||
    (prop.tipo_veiculo === '' ? null : prop.tipo_veiculo) !== modelo.tipo_veiculo ||
    prop.entrada_visual !== modelo.entrada_visual ||
    prop.situacao !== modelo.situacao

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom="info">
          <GitBranch aria-hidden className="size-3" />
          Versão {modelo.versao_atual}
        </Selo>
        <span className="text-[12.5px] text-ink-3">
          {usos.isSuccess ? `${usos.data} execução(ões) nesta versão` : 'Carregando usos…'}
        </span>
      </div>

      {podeConfigurar && (
        <Painel semPadding>
          <CabecalhoPainel
            titulo="Propriedades do modelo"
            descricao="Nome, aplicação e situação. Não altera a versão nem os checklists já respondidos."
          />
          <div className="flex flex-col gap-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Descrição" obrigatorio>
                {(p) => (
                  <Entrada
                    {...p}
                    value={prop.descricao}
                    onChange={(e) => setProp((v) => ({ ...v, descricao: e.target.value }))}
                  />
                )}
              </Campo>

              <Campo
                rotulo="Tipo"
                dica={
                  podeTrocarTipo
                    ? 'Define onde o checklist aparece e o formato de resposta.'
                    : 'Travado: o tipo define o formato de resposta dos itens, e este modelo já tem item ou execução.'
                }
              >
                {(p) => (
                  <Selecao
                    {...p}
                    value={prop.tipo}
                    disabled={!podeTrocarTipo}
                    onChange={(e) => setProp((v) => ({ ...v, tipo: e.target.value as TipoChecklist }))}
                  >
                    {TIPOS_CHECKLIST_OPERACAO.map((v) => (
                      <option key={v} value={v}>
                        {ROTULO_TIPO_CHECKLIST[v]}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>

              <Campo rotulo="Tipo de veículo" dica="Deixe em branco para valer para qualquer veículo.">
                {(p) => (
                  <Selecao
                    {...p}
                    value={prop.tipo_veiculo}
                    onChange={(e) => setProp((v) => ({ ...v, tipo_veiculo: e.target.value }))}
                  >
                    <option value="">Qualquer veículo</option>
                    {TIPOS_VEICULO.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>

              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao
                    {...p}
                    value={prop.situacao}
                    onChange={(e) => setProp((v) => ({ ...v, situacao: e.target.value as typeof v.situacao }))}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo — não aparece para executar</option>
                  </Selecao>
                )}
              </Campo>
            </div>

            <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
              <Alternador
                rotulo="Inclui mapa visual de avarias"
                ativo={prop.entrada_visual}
                onChange={(v) => setProp((s) => ({ ...s, entrada_visual: v }))}
              />
              Inclui mapa visual de avarias na entrada
            </label>

            <div className="flex justify-end">
              <Botao
                variante="primario"
                iconeInicio={<Save />}
                carregando={salvarPropriedades.isPending}
                disabled={!alterouPropriedades}
                onClick={() => salvarPropriedades.mutate()}
              >
                Salvar alterações
              </Botao>
            </div>
          </div>
        </Painel>
      )}

      {jaUsado && podeConfigurar && (
        <Aviso tom="atencao" titulo="Este modelo já foi usado">
          Qualquer alteração publica automaticamente a versão {modelo.versao_atual + 1}. Os checklists já
          preenchidos continuam exatamente como foram respondidos.
        </Aviso>
      )}

      {podeConfigurar && (
        <Painel>
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Seção" className="w-48">
              {(p) => (
                <Selecao {...p} value={novaSecao} onChange={(e) => setNovaSecao(e.target.value)}>
                  {secoes.map((s) => <option key={s} value={s}>{s}</option>)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Nova seção" className="w-48">
              {(p) => (
                <Entrada
                  {...p}
                  placeholder="Criar seção"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v) {
                      setNovaSecao(v)
                      e.target.value = ''
                    }
                  }}
                />
              )}
            </Campo>
            <Campo rotulo="Item do checklist" className="min-w-64 flex-1">
              {(p) => (
                <Entrada
                  {...p}
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  placeholder="Ex.: Verificar vazamento na válvula relé"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      adicionar.mutate()
                    }
                  }}
                />
              )}
            </Campo>
            <Botao variante="primario" iconeInicio={<Plus />} carregando={adicionar.isPending} onClick={() => adicionar.mutate()}>
              Adicionar
            </Botao>
          </div>
        </Painel>
      )}

      <Painel semPadding>
        <CabecalhoPainel titulo="Itens" descricao="A ordem é a sequência de execução na oficina." />
        <div className="p-2">
          {itens.isLoading && <EstadoCarregando rotulo="Carregando itens…" />}
          {itens.isError && (
            <EstadoErro descricao={mensagemErro(itens.error)} aoTentarNovamente={() => void itens.refetch()} />
          )}
          {itens.isSuccess && itens.data.length === 0 && (
            <EstadoVazio titulo="Nenhum item" descricao="Adicione o primeiro item do checklist." compacto />
          )}

          {itens.isSuccess &&
            itens.data.map((item, i) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 hover:bg-surface-2">
                <span className="num w-8 shrink-0 text-[11px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <Selo tom="neutro" className="shrink-0">{item.secao}</Selo>

                <input
                  aria-label={`Texto do item ${i + 1}`}
                  defaultValue={item.texto}
                  disabled={!podeConfigurar}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== item.texto) atualizar.mutate({ id: item.id, campos: { texto: v } })
                  }}
                  className="min-w-52 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[13.5px] text-ink hover:border-line focus:border-cyan focus:outline-none disabled:opacity-70"
                />

                {podeConfigurar && (
                  <>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-3">
                      <Alternador
                        rotulo="Exige evidência"
                        ativo={item.exige_evidencia}
                        onChange={(v) => atualizar.mutate({ id: item.id, campos: { exige_evidencia: v } })}
                      />
                      Evidência
                    </label>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-3">
                      <Alternador
                        rotulo="Exige medição"
                        ativo={item.exige_medicao}
                        onChange={(v) => atualizar.mutate({ id: item.id, campos: { exige_medicao: v } })}
                      />
                      Medição
                    </label>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-3">
                      <Alternador
                        rotulo="Obrigatório"
                        ativo={item.obrigatorio}
                        onChange={(v) => atualizar.mutate({ id: item.id, campos: { obrigatorio: v } })}
                      />
                      Obrigatório
                    </label>

                    <div className="flex shrink-0">
                      <BotaoIcone rotulo="Subir" tamanho="sm" disabled={i === 0} onClick={() => mover.mutate({ item, direcao: -1 })}>
                        <ArrowUp />
                      </BotaoIcone>
                      <BotaoIcone
                        rotulo="Descer"
                        tamanho="sm"
                        disabled={i === itens.data.length - 1}
                        onClick={() => mover.mutate({ item, direcao: 1 })}
                      >
                        <ArrowDown />
                      </BotaoIcone>
                      <BotaoIcone rotulo="Remover" tamanho="sm" onClick={() => remover.mutate(item.id)}>
                        <Trash2 />
                      </BotaoIcone>
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>
      </Painel>

      <Confirmacao
        aberto={Boolean(confirmandoVersao)}
        aoFechar={() => setConfirmandoVersao(null)}
        aoConfirmar={() => {
          confirmandoVersao?.()
          setConfirmandoVersao(null)
        }}
        titulo="Publicar nova versão?"
        descricao="Os checklists já preenchidos continuam na versão atual."
        rotuloConfirmar="Publicar"
      />
    </div>
  )
}
