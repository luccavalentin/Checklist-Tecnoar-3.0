import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { DadosEmpresa as Empresa, TabelasUpdate } from '@/tipos/db'

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const esquema = z.object({
  razao_social: z.string().trim().max(160).nullable().optional(),
  nome_fantasia: z.string().trim().max(160).nullable().optional(),
  cnpj: z.string().trim().max(20).nullable().optional(),
  inscricao_estadual: z.string().trim().max(30).nullable().optional(),
  inscricao_municipal: z.string().trim().max(30).nullable().optional(),
  telefone: z.string().trim().max(20).nullable().optional(),
  celular: z.string().trim().max(20).nullable().optional(),
  email: z.preprocess(vazioParaNulo, z.string().email('E-mail inválido.').nullable().optional()),
  site: z.preprocess(vazioParaNulo, z.string().url('Endereço inválido (use https://…).').nullable().optional()),
  endereco: z.string().trim().max(200).nullable().optional(),
  logradouro: z.string().trim().max(160).nullable().optional(),
  numero: z.string().trim().max(20).nullable().optional(),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: z.string().trim().max(120).nullable().optional(),
  cep: z.string().trim().max(10).nullable().optional(),
  municipio: z.string().trim().max(100).nullable().optional(),
  uf: z.string().trim().max(2).nullable().optional(),
  suporte_nome: z.string().trim().max(120).nullable().optional(),
  suporte_email: z.preprocess(vazioParaNulo, z.string().email('E-mail inválido.').nullable().optional()),
  suporte_telefone: z.string().trim().max(20).nullable().optional(),
  politica_privacidade_url: z.preprocess(
    vazioParaNulo,
    z.string().url('Endereço inválido (use https://…).').nullable().optional(),
  ),
})

type Dados = z.infer<typeof esquema>

const CAMPOS_VAZIOS: Dados = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  telefone: '',
  celular: '',
  email: '',
  site: '',
  endereco: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cep: '',
  municipio: '',
  uf: '',
  suporte_nome: '',
  suporte_email: '',
  suporte_telefone: '',
  politica_privacidade_url: '',
}

export function DadosEmpresa() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [erro, setErro] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: ['dados-empresa'],
    queryFn: async (): Promise<Empresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const form = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: CAMPOS_VAZIOS })
  const { reset } = form

  useEffect(() => {
    const d = consulta.data
    if (!d) return
    reset({
      razao_social: d.razao_social ?? '',
      nome_fantasia: d.nome_fantasia ?? '',
      cnpj: d.cnpj ?? '',
      telefone: d.telefone ?? '',
      email: d.email ?? '',
      site: d.site ?? '',
      endereco: d.endereco ?? '',
      municipio: d.municipio ?? '',
      uf: d.uf ?? '',
      suporte_nome: d.suporte_nome ?? '',
      suporte_email: d.suporte_email ?? '',
      suporte_telefone: d.suporte_telefone ?? '',
      politica_privacidade_url: d.politica_privacidade_url ?? '',
    })
  }, [consulta.data, reset])

  if (!usuario?.is_admin) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Sistema" titulo="Dados da Empresa" />
        <EstadoSemPermissao descricao="Somente administradores podem ver e editar os dados da empresa." />
      </div>
    )
  }

  async function salvar(dados: Dados) {
    setErro(null)
    const t = (v: string | null | undefined) => {
      const s = typeof v === 'string' ? v.trim() : v
      return s ? s : null
    }

    const limpo: TabelasUpdate<'dados_empresa'> = {
      razao_social: t(dados.razao_social),
      nome_fantasia: t(dados.nome_fantasia),
      cnpj: t(dados.cnpj),
      telefone: t(dados.telefone),
      email: t(dados.email),
      site: t(dados.site),
      endereco: t(dados.endereco),
      municipio: t(dados.municipio),
      uf: t(dados.uf)?.toUpperCase() ?? null,
      suporte_nome: t(dados.suporte_nome),
      suporte_email: t(dados.suporte_email),
      suporte_telefone: t(dados.suporte_telefone),
      politica_privacidade_url: t(dados.politica_privacidade_url),
    }

    const existente = consulta.data
    const { error } = existente
      ? await supabase.from('dados_empresa').update(limpo).eq('id', existente.id)
      : await supabase.from('dados_empresa').insert({ ...limpo, singleton: true })

    if (error) {
      setErro(mensagemErro(error))
      return
    }
    await qc.invalidateQueries({ queryKey: ['dados-empresa'] })
    await qc.invalidateQueries({ queryKey: ['dados-empresa-suporte'] })
    toast.ok('Dados da empresa salvos')
  }

  if (consulta.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Sistema" titulo="Dados da Empresa" />
        <EstadoCarregando />
      </div>
    )
  }

  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Sistema" titulo="Dados da Empresa" />
        <EstadoErro descricao={mensagemErro(consulta.error)} aoTentarNovamente={() => void consulta.refetch()} />
      </div>
    )
  }

  const e = form.formState.errors

  return (
    <form noValidate onSubmit={form.handleSubmit(salvar)} className="flex max-w-4xl flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Sistema"
        titulo="Dados da Empresa"
        acoes={
          <Botao type="submit" variante="primario" iconeInicio={<Save />} carregando={form.formState.isSubmitting}>
            Salvar
          </Botao>
        }
      />

      {erro && <Aviso tom="critico">{erro}</Aviso>}

      <Painel semPadding>
        <CabecalhoPainel titulo="Identificação" descricao="Usada nos documentos gerados pelo sistema." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Campo rotulo="Razão social" erro={e.razao_social?.message}>
            {(p) => <Entrada {...p} {...form.register('razao_social')} placeholder="Não informado" />}
          </Campo>
          <Campo rotulo="Nome fantasia" erro={e.nome_fantasia?.message}>
            {(p) => <Entrada {...p} {...form.register('nome_fantasia')} placeholder="Não informado" />}
          </Campo>
          <Campo rotulo="CNPJ" erro={e.cnpj?.message}>
            {(p) => <Entrada {...p} {...form.register('cnpj')} mono placeholder="00.000.000/0000-00" />}
          </Campo>
          <Campo rotulo="Inscrição estadual" erro={e.inscricao_estadual?.message}>
            {(p) => <Entrada {...p} mono {...form.register('inscricao_estadual')} placeholder="Isento" />}
          </Campo>
          <Campo rotulo="Inscrição municipal" erro={e.inscricao_municipal?.message}>
            {(p) => <Entrada {...p} mono {...form.register('inscricao_municipal')} placeholder="Não informada" />}
          </Campo>
          <Campo rotulo="Telefone" erro={e.telefone?.message}>
            {(p) => <Entrada {...p} {...form.register('telefone')} mono type="tel" placeholder="(00) 0000-0000" />}
          </Campo>
          <Campo rotulo="E-mail" erro={e.email?.message}>
            {(p) => <Entrada {...p} {...form.register('email')} type="email" placeholder="contato@empresa.com.br" />}
          </Campo>
          <Campo rotulo="Site" erro={e.site?.message}>
            {(p) => <Entrada {...p} {...form.register('site')} type="url" placeholder="https://" />}
          </Campo>
        </div>
      </Painel>

      <Painel semPadding>
        <CabecalhoPainel titulo="Endereço" />
        <div className="grid gap-4 p-5 sm:grid-cols-6">
          <Campo className="sm:col-span-4" rotulo="Logradouro" erro={e.logradouro?.message}>
            {(p) => <Entrada {...p} {...form.register('logradouro')} placeholder="Rua, avenida…" />}
          </Campo>
          <Campo className="sm:col-span-1" rotulo="Número" erro={e.numero?.message}>
            {(p) => <Entrada {...p} mono {...form.register('numero')} placeholder="s/n" />}
          </Campo>
          <Campo className="sm:col-span-1" rotulo="CEP" erro={e.cep?.message}>
            {(p) => <Entrada {...p} mono {...form.register('cep')} placeholder="00000-000" />}
          </Campo>
          <Campo className="sm:col-span-3" rotulo="Bairro" erro={e.bairro?.message}>
            {(p) => <Entrada {...p} {...form.register('bairro')} placeholder="Não informado" />}
          </Campo>
          <Campo className="sm:col-span-1" rotulo="Complemento" erro={e.complemento?.message}>
            {(p) => <Entrada {...p} {...form.register('complemento')} placeholder="Sala, galpão…" />}
          </Campo>
          <Campo className="sm:col-span-1" rotulo="Município" erro={e.municipio?.message}>
            {(p) => <Entrada {...p} {...form.register('municipio')} placeholder="Não informado" />}
          </Campo>
          <Campo className="sm:col-span-1" rotulo="UF" erro={e.uf?.message}>
            {(p) => <Entrada {...p} {...form.register('uf')} maxLength={2} mono placeholder="SP" />}
          </Campo>
          <Campo
            className="sm:col-span-6"
            rotulo="Endereço em linha única"
            dica="É esta linha que sai no timbre dos documentos."
            erro={e.endereco?.message}
          >
            {(p) => <Entrada {...p} {...form.register('endereco')} placeholder="Monte a partir dos campos acima" />}
          </Campo>
        </div>
      </Painel>

      <Painel semPadding>
        <CabecalhoPainel
          titulo="Suporte e documentos"
          descricao="Aparecem na Central de Ajuda e na tela de login."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Campo rotulo="Responsável pelo suporte" erro={e.suporte_nome?.message}>
            {(p) => <Entrada {...p} {...form.register('suporte_nome')} placeholder="Não informado" />}
          </Campo>
          <Campo rotulo="E-mail do suporte" erro={e.suporte_email?.message}>
            {(p) => <Entrada {...p} {...form.register('suporte_email')} type="email" placeholder="Não informado" />}
          </Campo>
          <Campo rotulo="Telefone do suporte" erro={e.suporte_telefone?.message}>
            {(p) => <Entrada {...p} {...form.register('suporte_telefone')} mono type="tel" placeholder="Não informado" />}
          </Campo>
          <Campo
            className="sm:col-span-3"
            rotulo="URL da Política de Privacidade"
            erro={e.politica_privacidade_url?.message}
            dica="Enquanto estiver vazio, a tela de login informa que o documento ainda não foi publicado."
          >
            {(p) => <Entrada {...p} {...form.register('politica_privacidade_url')} type="url" placeholder="https://" />}
          </Campo>
        </div>
      </Painel>
    </form>
  )
}
