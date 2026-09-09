import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BellRing, Camera, Monitor, Moon, Save, Sun, Trash2, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emSegundoPlano, iniciais, mensagemErro, mensagemErroAuth } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { useTema } from '@/tema/TemaProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { TemaInterface } from '@/tipos/db'

const esquemaPerfil = z.object({
  nome_completo: z.string().trim().min(3, 'Informe seu nome completo.'),
  telefone: z.string().trim().max(20, 'Telefone muito longo.').optional(),
})
type DadosPerfil = z.infer<typeof esquemaPerfil>

const esquemaSenha = z
  .object({
    senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres.'),
    confirmacao: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((d) => d.senha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' })
type DadosSenha = z.infer<typeof esquemaSenha>

export function Configuracoes() {
  const { usuario, recarregarPerfil } = useAuth()
  const { tema, definirTema } = useTema()
  const toast = useToast()
  const [erroPerfil, setErroPerfil] = useState<string | null>(null)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [enviandoAvatar, setEnviandoAvatar] = useState(false)
  const inputAvatar = useRef<HTMLInputElement>(null)

  const formPerfil = useForm<DadosPerfil>({
    resolver: zodResolver(esquemaPerfil),
    defaultValues: { nome_completo: '', telefone: '' },
  })

  const formSenha = useForm<DadosSenha>({
    resolver: zodResolver(esquemaSenha),
    defaultValues: { senha: '', confirmacao: '' },
  })

  useEffect(() => {
    if (!usuario) return
    formPerfil.reset({ nome_completo: usuario.nome_completo, telefone: usuario.telefone ?? '' })
  }, [usuario, formPerfil])

  async function salvarPerfil(dados: DadosPerfil) {
    if (!usuario) return
    setErroPerfil(null)
    const { error } = await supabase
      .from('usuarios')
      .update({
        nome_completo: dados.nome_completo.trim(),
        telefone: dados.telefone?.trim() ? dados.telefone.trim() : null,
      })
      .eq('id', usuario.id)

    if (error) {
      setErroPerfil(mensagemErro(error))
      return
    }
    await recarregarPerfil()
    toast.ok('Perfil atualizado')
  }

  async function alterarSenha(dados: DadosSenha) {
    setErroSenha(null)
    const { error } = await supabase.auth.updateUser({ password: dados.senha })
    if (error) {
      setErroSenha(mensagemErroAuth(error))
      return
    }
    formSenha.reset({ senha: '', confirmacao: '' })
    toast.ok('Senha alterada', 'Use a nova senha no próximo acesso.')
  }

  async function enviarAvatar(arquivo: File | null) {
    if (!usuario || !arquivo) return
    setErroPerfil(null)
    if (!arquivo.type.startsWith('image/')) {
      setErroPerfil('Envie uma imagem válida para a foto do perfil.')
      return
    }
    if (arquivo.size > 3 * 1024 * 1024) {
      setErroPerfil('A imagem deve ter até 3 MB.')
      return
    }

    setEnviandoAvatar(true)
    const ext = arquivo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const caminho = `${usuario.id}/avatar.${ext}`
    const { error: erroUpload } = await supabase.storage
      .from('avatars')
      .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })

    if (erroUpload) {
      setEnviandoAvatar(false)
      setErroPerfil(mensagemErro(erroUpload))
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(caminho)
    const avatar_url = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await supabase.from('usuarios').update({ avatar_url }).eq('id', usuario.id)
    setEnviandoAvatar(false)

    if (error) {
      setErroPerfil(mensagemErro(error))
      return
    }
    await recarregarPerfil()
    toast.ok('Foto do perfil atualizada')
  }

  async function removerAvatar() {
    if (!usuario) return
    setErroPerfil(null)
    const { error } = await supabase.from('usuarios').update({ avatar_url: null }).eq('id', usuario.id)
    if (error) {
      setErroPerfil(mensagemErro(error))
      return
    }
    await recarregarPerfil()
    toast.ok('Foto removida')
  }

  function mudarTema(t: TemaInterface) {
    definirTema(t)
    if (usuario) {
      emSegundoPlano(supabase.from('usuarios').update({ tema: t }).eq('id', usuario.id), 'preferência de tema')
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <CabecalhoPagina sobretitulo="Sistema" titulo="Configurações" />

      <Painel semPadding>
        <CabecalhoPainel titulo="Seus dados" descricao="Aparecem no cabeçalho e nos registros do sistema." />
        <form
          noValidate
          onSubmit={formPerfil.handleSubmit(salvarPerfil)}
          className="flex flex-col gap-4 p-5"
        >
          {erroPerfil && <Aviso tom="critico">{erroPerfil}</Aviso>}

          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-4">
              <span className="lbl">Foto do perfil</span>
              <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-surface font-display text-xl font-bold text-ink shadow-e1">
                  {usuario?.avatar_url ? (
                    <img src={usuario.avatar_url} alt="" className="size-full object-cover" />
                  ) : usuario?.nome_completo ? (
                    iniciais(usuario.nome_completo)
                  ) : (
                    <UserRound aria-hidden className="size-8 text-ink-3" />
                  )}
                </span>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <input
                    ref={inputAvatar}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void enviarAvatar(e.target.files?.[0] ?? null)}
                  />
                  <Botao
                    type="button"
                    tamanho="sm"
                    variante="neutro"
                    iconeInicio={<Camera />}
                    carregando={enviandoAvatar}
                    onClick={() => inputAvatar.current?.click()}
                  >
                    Trocar
                  </Botao>
                  {usuario?.avatar_url && (
                    <Botao type="button" tamanho="sm" variante="fantasma" iconeInicio={<Trash2 />} onClick={() => void removerAvatar()}>
                      Remover
                    </Botao>
                  )}
                </div>
              </div>
              <p className="text-[12px] leading-snug text-ink-3">Use uma imagem quadrada, até 3 MB. Ela aparece no menu superior e nos registros internos.</p>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome completo" obrigatorio erro={formPerfil.formState.errors.nome_completo?.message}>
                {(p) => <Entrada {...p} {...formPerfil.register('nome_completo')} autoComplete="name" />}
              </Campo>
              <Campo rotulo="Telefone" erro={formPerfil.formState.errors.telefone?.message}>
                {(p) => (
                  <Entrada
                    {...p}
                    {...formPerfil.register('telefone')}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    mono
                  />
                )}
              </Campo>
              <Campo rotulo="E-mail" dica="O e-mail de acesso só pode ser alterado por um administrador.">
                {(p) => <Entrada {...p} value={usuario?.email ?? ''} readOnly disabled />}
              </Campo>
              <Campo rotulo="Função" dica="Definida pelo administrador em Cadastros › Usuários.">
                {(p) => <Entrada {...p} value={usuario?.funcao?.nome ?? 'Não definida'} readOnly disabled />}
              </Campo>
            </div>
          </div>

          <div className="flex justify-end">
            <Botao
              type="submit"
              variante="primario"
              iconeInicio={<Save />}
              carregando={formPerfil.formState.isSubmitting}
            >
              Salvar
            </Botao>
          </div>
        </form>
      </Painel>

      <Painel semPadding>
        <CabecalhoPainel titulo="Aparência" descricao="A preferência acompanha sua conta em qualquer dispositivo." />
        <div className="flex flex-col gap-3 p-5">
          <Segmentado
            className="max-w-md"
            rotuloGrupo="Tema da interface"
            valor={tema}
            onChange={mudarTema}
            opcoes={[
              { valor: 'claro', rotulo: 'Claro', icone: <Sun /> },
              { valor: 'escuro', rotulo: 'Escuro', icone: <Moon /> },
              { valor: 'sistema', rotulo: 'Sistema', icone: <Monitor /> },
            ]}
          />
          <p className="text-[12.5px] text-ink-3">
            “Sistema” acompanha a configuração do aparelho, útil para tablets que alternam entre pátio e recepção.
          </p>
        </div>
      </Painel>

      <Painel semPadding>
        <CabecalhoPainel titulo="Segurança" descricao="Alterar a senha de acesso." />
        <form noValidate onSubmit={formSenha.handleSubmit(alterarSenha)} className="flex flex-col gap-4 p-5">
          {erroSenha && <Aviso tom="critico">{erroSenha}</Aviso>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nova senha"
              obrigatorio
              erro={formSenha.formState.errors.senha?.message}
              dica="Mínimo de 8 caracteres."
            >
              {(p) => (
                <Entrada {...p} {...formSenha.register('senha')} type="password" autoComplete="new-password" />
              )}
            </Campo>
            <Campo rotulo="Confirmar nova senha" obrigatorio erro={formSenha.formState.errors.confirmacao?.message}>
              {(p) => (
                <Entrada
                  {...p}
                  {...formSenha.register('confirmacao')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </Campo>
          </div>

          <div className="flex justify-end">
            <Botao type="submit" variante="primario" carregando={formSenha.formState.isSubmitting}>
              Alterar senha
            </Botao>
          </div>
        </form>
      </Painel>

      <Painel semPadding>
        <CabecalhoPainel titulo="Notificações" />
        <div className="p-5">
          <Aviso tom="info" titulo="Nada a configurar ainda">
            <span className="flex items-start gap-2">
              <BellRing aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
              <span>
                As preferências por canal e por tipo de alerta aparecem aqui quando os módulos que geram
                notificações entrarem em serviço. Não existe interruptor sem efeito real nesta tela.
              </span>
            </span>
          </Aviso>
        </div>
      </Painel>
    </div>
  )
}
