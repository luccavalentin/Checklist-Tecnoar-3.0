import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Download, LogOut, Monitor, Moon, Settings2, Sun } from 'lucide-react'
import { cn, emSegundoPlano, iniciais } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useTema } from '@/tema/TemaProvider'
import { Segmentado } from '@/componentes/ui/Campo'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import type { TemaInterface } from '@/tipos/db'
import { useInstalacao } from './ConviteInstalacao'

export function MenuConta() {
  const { usuario, sair } = useAuth()
  const { tema, definirTema } = useTema()
  const instalacao = useInstalacao()
  const navegar = useNavigate()
  const [aberto, setAberto] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const onClique = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', onClique)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClique)
      document.removeEventListener('keydown', onEsc)
    }
  }, [aberto])

  function mudarTema(t: TemaInterface) {
    definirTema(t)
    // Preferência acompanha o usuário em qualquer dispositivo.
    if (usuario) {
      emSegundoPlano(supabase.from('usuarios').update({ tema: t }).eq('id', usuario.id), 'preferência de tema')
    }
  }

  async function confirmarSaida() {
    setSaindo(true)
    await sair()
    setSaindo(false)
    setConfirmandoSaida(false)
    navegar('/entrar', { replace: true })
  }

  const nome = usuario?.nome_completo ?? '—'
  const funcao = usuario?.funcao?.nome ?? usuario?.perfil?.nome ?? 'Sem função definida'

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-surface-2 sm:pr-2"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line-strong bg-surface-2 font-display text-[13px] font-bold text-ink"
        >
          {usuario?.avatar_url ? (
            <img src={usuario.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            iniciais(usuario?.nome_completo)
          )}
        </span>
        <span className="hidden min-w-0 flex-col items-start sm:flex">
          <span className="max-w-40 truncate text-[13px] font-semibold text-ink">{nome}</span>
          <span className="lbl max-w-40 truncate">{funcao}</span>
        </span>
        <ChevronDown aria-hidden className="hidden size-3.5 shrink-0 text-ink-3 sm:block" />
      </button>

      {aberto && (
        <div
          role="menu"
          className="entrada-suave absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-e3"
        >
          <div className="flex flex-col gap-0.5 border-b border-line px-4 py-3.5">
            <span className="truncate text-[13.5px] font-semibold text-ink">{nome}</span>
            <span className="truncate text-[12px] text-ink-3">{usuario?.email}</span>
            <span className="lbl mt-1">{funcao}</span>
          </div>

          <div className="flex flex-col gap-2 border-b border-line px-4 py-3.5">
            <span className="lbl">Aparência</span>
            <Segmentado
              rotuloGrupo="Tema da interface"
              valor={tema}
              onChange={mudarTema}
              opcoes={[
                { valor: 'claro', rotulo: 'Claro', icone: <Sun /> },
                { valor: 'escuro', rotulo: 'Escuro', icone: <Moon /> },
                { valor: 'sistema', rotulo: 'Sistema', icone: <Monitor /> },
              ]}
            />
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false)
                navegar('/sistema/configuracoes')
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13.5px] text-ink-2',
                'transition-colors hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Settings2 aria-hidden className="size-4 text-ink-3" />
              Configurações
            </button>
            {instalacao.disponivel && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false)
                  instalacao.instalar()
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13.5px] text-ink-2',
                  'transition-colors hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Download aria-hidden className="size-4 text-ink-3" />
                Instalar aplicativo
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false)
                setConfirmandoSaida(true)
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13.5px] text-crit-ink transition-colors hover:bg-crit-soft"
            >
              <LogOut aria-hidden className="size-4" />
              Sair
            </button>
          </div>
        </div>
      )}

      <Confirmacao
        aberto={confirmandoSaida}
        aoFechar={() => setConfirmandoSaida(false)}
        aoConfirmar={() => void confirmarSaida()}
        titulo="Sair do sistema?"
        descricao="Você voltará para a tela de login. Nada em andamento será perdido."
        rotuloConfirmar="Sair"
        carregando={saindo}
      />
    </div>
  )
}
