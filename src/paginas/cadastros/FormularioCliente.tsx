/**
 * Tecnoar — Formulário de Cliente Premium
 * Design: Clean, sofisticado, organização inteligente
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import {
  Plus,
  Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro, cn } from '@/lib/utils'
import {
  mascaraCEP,
  mascaraDocumento,
  mascaraTelefone,
  somenteDigitos,
  UFS,
  validarDocumento,
} from '@/lib/formatos'
import { consultarCNPJ } from '@/lib/consultasExternas'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Alternador, AreaTexto, Campo, Entrada, Segmentado, Selecao } from '@/componentes/ui/Campo'
import { CampoCEP } from '@/componentes/ui/CampoCEP'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import type { Cliente, ClienteContato, SituacaoRegistro, TipoPessoa } from '@/tipos/db'
import type { Tag as TagTipo } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   TIPOS
   ═══════════════════════════════════════════════════════════════ */
export interface FormCliente {
  tipo_pessoa: TipoPessoa
  nome_razao: string
  nome_fantasia: string
  documento: string
  nascimento_fundacao: string
  inscricao_estadual: string
  email: string
  celular: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  sem_numero: boolean
  bairro: string
  complemento: string
  municipio: string
  uf: string
  entrega_mesmo_endereco: boolean
  entrega_cep: string
  entrega_logradouro: string
  entrega_numero: string
  entrega_bairro: string
  entrega_complemento: string
  entrega_municipio: string
  entrega_uf: string
  limite_credito: string
  observacao_credito: string
  notificar_whatsapp: boolean
  notificar_email: boolean
  observacoes: string
  situacao: SituacaoRegistro
  contatos: Array<{ id?: string; nome_setor: string; email: string; telefone: string; celular: string }>
  tags: string[]
}

export const CLIENTE_VAZIO: FormCliente = {
  tipo_pessoa: 'juridica',
  nome_razao: '',
  nome_fantasia: '',
  documento: '',
  nascimento_fundacao: '',
  inscricao_estadual: '',
  email: '',
  celular: '',
  telefone: '',
  cep: '',
  logradouro: '',
  numero: '',
  sem_numero: false,
  bairro: '',
  complemento: '',
  municipio: '',
  uf: '',
  entrega_mesmo_endereco: true,
  entrega_cep: '',
  entrega_logradouro: '',
  entrega_numero: '',
  entrega_bairro: '',
  entrega_complemento: '',
  entrega_municipio: '',
  entrega_uf: '',
  limite_credito: '',
  observacao_credito: '',
  notificar_whatsapp: true,
  notificar_email: true,
  observacoes: '',
  situacao: 'ativo',
  contatos: [],
  tags: [],
}

function paraFormulario(c: Cliente, contatos: ClienteContato[], tags: string[]): FormCliente {
  return {
    ...CLIENTE_VAZIO,
    tipo_pessoa: c.tipo_pessoa,
    nome_razao: c.nome_razao,
    nome_fantasia: c.nome_fantasia ?? '',
    documento: mascaraDocumento(c.documento ?? ''),
    nascimento_fundacao: c.nascimento_fundacao ?? '',
    inscricao_estadual: c.inscricao_estadual ?? '',
    email: c.email ?? '',
    celular: c.celular ?? '',
    telefone: c.telefone ?? '',
    cep: mascaraCEP(c.cep ?? ''),
    logradouro: c.logradouro ?? '',
    numero: c.numero ?? '',
    sem_numero: c.sem_numero,
    bairro: c.bairro ?? '',
    complemento: c.complemento ?? '',
    municipio: c.municipio ?? '',
    uf: c.uf ?? '',
    entrega_mesmo_endereco: c.entrega_mesmo_endereco,
    entrega_cep: mascaraCEP(c.entrega_cep ?? ''),
    entrega_logradouro: c.entrega_logradouro ?? '',
    entrega_numero: c.entrega_numero ?? '',
    entrega_bairro: c.entrega_bairro ?? '',
    entrega_complemento: c.entrega_complemento ?? '',
    entrega_municipio: c.entrega_municipio ?? '',
    entrega_uf: c.entrega_uf ?? '',
    limite_credito: c.limite_credito !== null ? String(c.limite_credito).replace('.', ',') : '',
    observacao_credito: c.observacao_credito ?? '',
    notificar_whatsapp: c.notificar_whatsapp,
    notificar_email: c.notificar_email,
    observacoes: c.observacoes ?? '',
    situacao: c.situacao,
    contatos: contatos.map((k) => ({
      id: k.id,
      nome_setor: k.nome_setor,
      email: k.email ?? '',
      telefone: k.telefone ?? '',
      celular: k.celular ?? '',
    })),
    tags,
  }
}

/* ═══════════════════════════════════════════════════════════════
   SEÇÃO
   ═══════════════════════════════════════════════════════════════ */
function SecaoForm({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line bg-surface-2/50 px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LINHA DE CAMPOS
   ═══════════════════════════════════════════════════════════════ */
function LinhaCampos({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function FormularioCliente({
  aberto,
  aoFechar,
  clienteId,
  valoresIniciais,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  clienteId: string | null
  valoresIniciais?: Partial<FormCliente>
  aoSalvar?: (id: string) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = usePermissoes()
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoDoc, setBuscandoDoc] = useState(false)
  const [avisoConsulta, setAvisoConsulta] = useState<string | null>(null)

  const form = useForm<FormCliente>({ defaultValues: { ...CLIENTE_VAZIO, ...valoresIniciais } })
  const contatos = useFieldArray({ control: form.control, name: 'contatos' })

  const tags = useQuery({
    queryKey: ['tags', 'ativas'],
    enabled: aberto,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TagTipo[]> => {
      const { data, error } = await supabase.from('tags').select('*').eq('situacao', 'ativo').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const registro = useQuery({
    queryKey: ['clientes', 'registro', clienteId],
    enabled: aberto && Boolean(clienteId),
    queryFn: async () => {
      const [c, k, t] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', clienteId!).single(),
        supabase.from('cliente_contatos').select('*').eq('cliente_id', clienteId!).order('ordem'),
        supabase.from('cliente_tags').select('tag_id').eq('cliente_id', clienteId!),
      ])
      if (c.error) throw c.error
      if (k.error) throw k.error
      if (t.error) throw t.error
      return { cliente: c.data, contatos: k.data ?? [], tags: (t.data ?? []).map((x) => x.tag_id) }
    },
  })

  useEffect(() => {
    if (!aberto) return
    if (clienteId && registro.data) {
      form.reset(paraFormulario(registro.data.cliente, registro.data.contatos, registro.data.tags))
    } else if (!clienteId) {
      form.reset({ ...CLIENTE_VAZIO, ...valoresIniciais })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, clienteId, registro.data])

  const tipo = form.watch('tipo_pessoa')
  const mesmoEndereco = form.watch('entrega_mesmo_endereco')
  const semNumero = form.watch('sem_numero')
  const tagsSelecionadas = form.watch('tags')

  async function preencherPorCNPJ() {
    const doc = form.getValues('documento')
    if (somenteDigitos(doc).length !== 14) {
      setAvisoConsulta('Informe um CNPJ completo para consultar.')
      return
    }
    setBuscandoDoc(true)
    setAvisoConsulta(null)
    const r = await consultarCNPJ(doc)
    setBuscandoDoc(false)
    if (!r) {
      setAvisoConsulta('A consulta de CNPJ não respondeu. Preencha os dados manualmente.')
      return
    }
    form.setValue('nome_razao', r.razao_social, { shouldDirty: true })
    if (r.nome_fantasia) form.setValue('nome_fantasia', r.nome_fantasia, { shouldDirty: true })
    if (r.email) form.setValue('email', r.email, { shouldDirty: true })
    if (r.telefone) form.setValue('telefone', mascaraTelefone(r.telefone), { shouldDirty: true })
    if (r.data_inicio) form.setValue('nascimento_fundacao', r.data_inicio.slice(0, 10), { shouldDirty: true })
    if (r.cep) form.setValue('cep', mascaraCEP(r.cep), { shouldDirty: true })
    if (r.logradouro) form.setValue('logradouro', r.logradouro, { shouldDirty: true })
    if (r.numero) form.setValue('numero', r.numero, { shouldDirty: true })
    if (r.complemento) form.setValue('complemento', r.complemento, { shouldDirty: true })
    if (r.bairro) form.setValue('bairro', r.bairro, { shouldDirty: true })
    if (r.municipio) form.setValue('municipio', r.municipio, { shouldDirty: true })
    if (r.uf) form.setValue('uf', r.uf, { shouldDirty: true })
  }

  const salvar = useMutation({
    mutationFn: async (d: FormCliente) => {
      setErro(null)
      const nome = d.nome_razao.trim()
      if (nome.length < 2) throw new Error('Informe o nome ou a razão social.')
      if (d.documento && !validarDocumento(d.documento, d.tipo_pessoa)) {
        throw new Error(d.tipo_pessoa === 'fisica' ? 'CPF inválido.' : 'CNPJ inválido.')
      }

      const payload = {
        tipo_pessoa: d.tipo_pessoa,
        nome_razao: nome,
        nome_fantasia: d.nome_fantasia.trim() || null,
        documento: d.documento.trim() || null,
        nascimento_fundacao: d.nascimento_fundacao || null,
        inscricao_estadual: d.inscricao_estadual.trim() || null,
        email: d.email.trim() || null,
        celular: d.celular.trim() || null,
        telefone: d.telefone.trim() || null,
        cep: d.cep.trim() || null,
        logradouro: d.logradouro.trim() || null,
        numero: d.sem_numero ? 'S/N' : d.numero.trim() || null,
        sem_numero: d.sem_numero,
        bairro: d.bairro.trim() || null,
        complemento: d.complemento.trim() || null,
        municipio: d.municipio.trim() || null,
        uf: d.uf || null,
        entrega_mesmo_endereco: d.entrega_mesmo_endereco,
        entrega_cep: d.entrega_mesmo_endereco ? null : d.entrega_cep.trim() || null,
        entrega_logradouro: d.entrega_mesmo_endereco ? null : d.entrega_logradouro.trim() || null,
        entrega_numero: d.entrega_mesmo_endereco ? null : d.entrega_numero.trim() || null,
        entrega_bairro: d.entrega_mesmo_endereco ? null : d.entrega_bairro.trim() || null,
        entrega_complemento: d.entrega_mesmo_endereco ? null : d.entrega_complemento.trim() || null,
        entrega_municipio: d.entrega_mesmo_endereco ? null : d.entrega_municipio.trim() || null,
        entrega_uf: d.entrega_mesmo_endereco ? null : d.entrega_uf || null,
        limite_credito: d.limite_credito ? Number(d.limite_credito.replace(/\./g, '').replace(',', '.')) : null,
        observacao_credito: d.observacao_credito.trim() || null,
        notificar_whatsapp: d.notificar_whatsapp,
        notificar_email: d.notificar_email,
        observacoes: d.observacoes.trim() || null,
        situacao: d.situacao,
      }

      let id = clienteId
      if (id) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('clientes').insert(payload).select('id').single()
        if (error) throw error
        id = data.id
      }

      const { error: erroDel } = await supabase.from('cliente_contatos').delete().eq('cliente_id', id)
      if (erroDel) throw erroDel
      const validos = d.contatos.filter((k) => k.nome_setor.trim())
      if (validos.length) {
        const { error } = await supabase.from('cliente_contatos').insert(
          validos.map((k, i) => ({
            cliente_id: id!,
            nome_setor: k.nome_setor.trim(),
            email: k.email.trim() || null,
            telefone: k.telefone.trim() || null,
            celular: k.celular.trim() || null,
            ordem: i,
          })),
        )
        if (error) throw error
      }

      const { error: erroTagDel } = await supabase.from('cliente_tags').delete().eq('cliente_id', id)
      if (erroTagDel) throw erroTagDel
      if (d.tags.length) {
        const { error } = await supabase.from('cliente_tags').insert(d.tags.map((tag_id) => ({ cliente_id: id!, tag_id })))
        if (error) throw error
      }

      return id!
    },
    onSuccess: (id) => {
      toast.ok(clienteId ? 'Cliente atualizado' : 'Cliente cadastrado')
      void qc.invalidateQueries({ queryKey: ['clientes'] })
      aoSalvar?.(id)
      aoFechar()
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(
        m.includes('duplicate key') || m.includes('clientes_documento_uk')
          ? 'Já existe um cliente com este documento.'
          : m,
      )
    },
  })

  const podeSalvar = clienteId ? pode('clientes', 'editar') : pode('clientes', 'criar')


  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      largura="xl"
      titulo={clienteId ? 'Editar cliente' : 'Novo cliente'}
      descricao={clienteId && registro.data?.cliente.codigo
        ? `Código ${String(registro.data.cliente.codigo).padStart(4, '0')}`
        : 'Cadastro completo'}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            disabled={!podeSalvar}
            carregando={salvar.isPending}
            onClick={form.handleSubmit((d) => salvar.mutate(d))}
          >
            Salvar
          </Botao>
        </>
      }
    >
            <form className="flex flex-col gap-5" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
              {erro && (
                <div className="rounded-lg border border-crit/30 bg-crit/5 px-4 py-3 text-[13px] text-crit-ink">
                  {erro}
                </div>
              )}
              {avisoConsulta && (
                <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[13px] text-warn-ink">
                  {avisoConsulta}
                </div>
              )}

              {/* Seção: Dados Gerais */}
              <SecaoForm title="Dados Gerais">
                <div className="space-y-4">
                  <div className="flex items-center gap-6">
                    <span className="text-[11px] font-medium text-ink-3 w-24">Tipo</span>
                    <Segmentado
                      rotuloGrupo="Tipo"
                      valor={tipo}
                      onChange={(v) => form.setValue('tipo_pessoa', v, { shouldDirty: true })}
                      opcoes={[
                        { valor: 'juridica' as TipoPessoa, rotulo: 'Jurídica' },
                        { valor: 'fisica' as TipoPessoa, rotulo: 'Física' },
                      ]}
                    />
                  </div>

                  <LinhaCampos>
                    <Campo rotulo={tipo === 'fisica' ? 'Nome completo' : 'Razão social'} obrigatorio>
                      {(p) => <Entrada {...p} {...form.register('nome_razao', { required: true })} />}
                    </Campo>
                    <Campo rotulo="Nome fantasia">
                      {(p) => <Entrada {...p} {...form.register('nome_fantasia')} />}
                    </Campo>
                    <Campo rotulo={tipo === 'fisica' ? 'CPF' : 'CNPJ'}>
                      {(p) => (
                        <div className="relative">
                          <Entrada
                            {...p}
                            mono
                            value={form.watch('documento')}
                            onChange={(e) => form.setValue('documento', mascaraDocumento(e.target.value), { shouldDirty: true })}
                          />
                          {tipo === 'juridica' && (
                            <button
                              type="button"
                              onClick={() => void preencherPorCNPJ()}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/10"
                              disabled={buscandoDoc}
                            >
                              {buscandoDoc ? '...' : 'Consultar'}
                            </button>
                          )}
                        </div>
                      )}
                    </Campo>
                  </LinhaCampos>

                  <LinhaCampos>
                    <Campo rotulo={tipo === 'fisica' ? 'Nascimento' : 'Fundação'}>
                      {(p) => <Entrada {...p} {...form.register('nascimento_fundacao')} type="date" />}
                    </Campo>
                    <Campo rotulo="Inscrição estadual">
                      {(p) => <Entrada {...p} {...form.register('inscricao_estadual')} placeholder="Isento" />}
                    </Campo>
                    <Campo rotulo="Situação">
                      {(p) => (
                        <Selecao {...p} {...form.register('situacao')}>
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                        </Selecao>
                      )}
                    </Campo>
                  </LinhaCampos>
                </div>
              </SecaoForm>

              {/* Seção: Contato */}
              <SecaoForm title="Contato">
                <div className="space-y-4">
                  <LinhaCampos>
                    <Campo rotulo="E-mail">
                      {(p) => <Entrada {...p} {...form.register('email')} type="email" />}
                    </Campo>
                    <Campo rotulo="Celular / WhatsApp">
                      {(p) => (
                        <Entrada
                          {...p}
                          mono
                          value={form.watch('celular')}
                          onChange={(e) => form.setValue('celular', mascaraTelefone(e.target.value), { shouldDirty: true })}
                        />
                      )}
                    </Campo>
                    <Campo rotulo="Telefone fixo">
                      {(p) => (
                        <Entrada
                          {...p}
                          mono
                          value={form.watch('telefone')}
                          onChange={(e) => form.setValue('telefone', mascaraTelefone(e.target.value), { shouldDirty: true })}
                        />
                      )}
                    </Campo>
                  </LinhaCampos>

                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                      <Alternador
                        rotulo="WhatsApp"
                        ativo={form.watch('notificar_whatsapp')}
                        onChange={(v) => form.setValue('notificar_whatsapp', v, { shouldDirty: true })}
                      />
                      <span className="text-[13px] text-ink-2">Aceita WhatsApp</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Alternador
                        rotulo="E-mail"
                        ativo={form.watch('notificar_email')}
                        onChange={(v) => form.setValue('notificar_email', v, { shouldDirty: true })}
                      />
                      <span className="text-[13px] text-ink-2">Aceita e-mail</span>
                    </div>
                  </div>
                </div>
              </SecaoForm>

              {/* Seção: Endereço Principal */}
              <SecaoForm title="Endereço Principal">
                <div className="space-y-4">
                  <div className="max-w-[200px]">
                    <CampoCEP
                      valor={form.watch('cep')}
                      aoMudar={(v) => form.setValue('cep', v, { shouldDirty: true })}
                      aoEncontrar={(r) => {
                        form.setValue('logradouro', r.logradouro, { shouldDirty: true })
                        form.setValue('bairro', r.bairro, { shouldDirty: true })
                        form.setValue('municipio', r.municipio, { shouldDirty: true })
                        form.setValue('uf', r.uf, { shouldDirty: true })
                      }}
                    />
                  </div>

                  <LinhaCampos>
                    <Campo className="lg:col-span-2" rotulo="Logradouro">
                      {(p) => <Entrada {...p} {...form.register('logradouro')} />}
                    </Campo>
                    <Campo rotulo="Número">
                      {(p) => <Entrada {...p} mono {...form.register('numero')} disabled={semNumero} />}
                    </Campo>
                  </LinhaCampos>

                  <LinhaCampos>
                    <Campo className="lg:col-span-2" rotulo="Bairro">
                      {(p) => <Entrada {...p} {...form.register('bairro')} />}
                    </Campo>
                    <Campo rotulo="Complemento">
                      {(p) => <Entrada {...p} {...form.register('complemento')} />}
                    </Campo>
                    <Campo rotulo="Município">
                      {(p) => <Entrada {...p} {...form.register('municipio')} />}
                    </Campo>
                    <Campo rotulo="UF">
                      {(p) => (
                        <Selecao {...p} {...form.register('uf')}>
                          <option value="">—</option>
                          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </Selecao>
                      )}
                    </Campo>
                  </LinhaCampos>

                  <div className="flex items-center gap-3">
                    <Alternador
                      rotulo="Sem número"
                      ativo={semNumero}
                      onChange={(v) => form.setValue('sem_numero', v, { shouldDirty: true })}
                    />
                    <span className="text-[13px] text-ink-2">Endereço sem número</span>
                  </div>
                </div>
              </SecaoForm>

              {/* Seção: Endereço de Entrega */}
              <SecaoForm title="Endereço de Entrega">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Alternador
                      rotulo="Mesmo endereço"
                      ativo={mesmoEndereco}
                      onChange={(v) => form.setValue('entrega_mesmo_endereco', v, { shouldDirty: true })}
                    />
                    <span className="text-[13px] text-ink-2">Usar endereço principal</span>
                  </div>

                  {!mesmoEndereco && (
                    <>
                      <div className="max-w-[200px]">
                        <CampoCEP
                          valor={form.watch('entrega_cep')}
                          aoMudar={(v) => form.setValue('entrega_cep', v, { shouldDirty: true })}
                          aoEncontrar={(r) => {
                            form.setValue('entrega_logradouro', r.logradouro, { shouldDirty: true })
                            form.setValue('entrega_bairro', r.bairro, { shouldDirty: true })
                            form.setValue('entrega_municipio', r.municipio, { shouldDirty: true })
                            form.setValue('entrega_uf', r.uf, { shouldDirty: true })
                          }}
                        />
                      </div>

                      <LinhaCampos>
                        <Campo className="lg:col-span-2" rotulo="Logradouro">
                          {(p) => <Entrada {...p} {...form.register('entrega_logradouro')} />}
                        </Campo>
                        <Campo rotulo="Número">
                          {(p) => <Entrada {...p} mono {...form.register('entrega_numero')} />}
                        </Campo>
                        <Campo className="lg:col-span-2" rotulo="Bairro">
                          {(p) => <Entrada {...p} {...form.register('entrega_bairro')} />}
                        </Campo>
                        <Campo rotulo="Complemento">
                          {(p) => <Entrada {...p} {...form.register('entrega_complemento')} />}
                        </Campo>
                        <Campo rotulo="Município">
                          {(p) => <Entrada {...p} {...form.register('entrega_municipio')} />}
                        </Campo>
                        <Campo rotulo="UF">
                          {(p) => (
                            <Selecao {...p} {...form.register('entrega_uf')}>
                              <option value="">—</option>
                              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </Selecao>
                          )}
                        </Campo>
                      </LinhaCampos>
                    </>
                  )}
                </div>
              </SecaoForm>

              {/* Seção: Crédito */}
              <SecaoForm title="Crédito">
                <LinhaCampos>
                  <Campo rotulo="Limite de crédito" dica="Deixe vazio se não houver limite.">
                    {(p) => <Entrada {...p} mono {...form.register('limite_credito')} placeholder="0,00" />}
                  </Campo>
                  <Campo className="lg:col-span-2" rotulo="Observação de crédito">
                    {(p) => <Entrada {...p} {...form.register('observacao_credito')} />}
                  </Campo>
                </LinhaCampos>
              </SecaoForm>

              {/* Seção: Tags */}
              <SecaoForm title="Classificação">
                {tags.data && tags.data.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.data.map((t) => {
                      const marcada = tagsSelecionadas.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            form.setValue(
                              'tags',
                              marcada ? tagsSelecionadas.filter((x) => x !== t.id) : [...tagsSelecionadas, t.id],
                              { shouldDirty: true },
                            )
                          }
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
                            marcada
                              ? 'border-accent bg-accent text-white'
                              : 'border-line text-ink-2 hover:border-ink/20 hover:bg-surface-2'
                          )}
                        >
                          {t.nome}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-3">Nenhuma tag cadastrada.</p>
                )}
              </SecaoForm>

              {/* Seção: Contatos Adicionais */}
              <SecaoForm title="Contatos Adicionais">
                <div className="space-y-3">
                  {contatos.fields.length === 0 && (
                    <p className="text-[12px] text-ink-3">Nenhum contato adicional.</p>
                  )}
                  {contatos.fields.map((campo, i) => (
                    <div key={campo.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
                      <div className="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Campo rotulo={i === 0 ? 'Nome / Setor' : undefined}>
                          {(p) => <Entrada {...p} {...form.register(`contatos.${i}.nome_setor`)} />}
                        </Campo>
                        <Campo rotulo={i === 0 ? 'E-mail' : undefined}>
                          {(p) => <Entrada {...p} {...form.register(`contatos.${i}.email`)} type="email" />}
                        </Campo>
                        <Campo rotulo={i === 0 ? 'Telefone' : undefined}>
                          {(p) => <Entrada {...p} mono {...form.register(`contatos.${i}.telefone`)} />}
                        </Campo>
                        <Campo rotulo={i === 0 ? 'WhatsApp' : undefined}>
                          {(p) => <Entrada {...p} mono {...form.register(`contatos.${i}.celular`)} />}
                        </Campo>
                      </div>
                      <BotaoIcone rotulo="Remover" onClick={() => contatos.remove(i)}>
                        <Trash2 className="size-4 text-crit" />
                      </BotaoIcone>
                    </div>
                  ))}
                  <Botao
                    tamanho="sm"
                    variante="neutro"
                    iconeInicio={<Plus className="size-3.5" />}
                    onClick={() => contatos.append({ nome_setor: '', email: '', telefone: '', celular: '' })}
                  >
                    Adicionar contato
                  </Botao>
                </div>
              </SecaoForm>

              {/* Seção: Observações */}
              <SecaoForm title="Observações">
                <Campo rotulo="Observações gerais">
                  {(p) => <AreaTexto {...p} {...form.register('observacoes')} rows={3} />}
                </Campo>
              </SecaoForm>

              {clienteId && registro.data?.cliente.origem === 'omie' && (
                <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-[12px] text-info-ink">
                  <strong>Registro sincronizado da Omie.</strong> Alterações feitas aqui são válidas no Tecnoar.
                </div>
              )}
            </form>
    </PainelLateral>
  )
}
