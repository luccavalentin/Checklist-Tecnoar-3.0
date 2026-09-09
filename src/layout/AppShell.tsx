import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Bell, HelpCircle, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { useTema } from '@/tema/TemaProvider'
import { BotaoIcone } from '@/componentes/ui/Botao'
import { BarraLateral } from './BarraLateral'
import { BuscaGlobal } from './BuscaGlobal'
import { CentralAjuda } from './CentralAjuda'
import { MenuConta } from './MenuConta'
import { PainelNotificacoes, useNaoLidas } from './PainelNotificacoes'
import { IndicadorOffline } from './StatusApp'
import { EnviosPendentes } from './EnviosPendentes'
import '@/busca/fonteNavegacao'

const CHAVE_MENU_RECOLHIDO = 'tecnoar.menu.recolhido'

function lerMenuRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU_RECOLHIDO) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { usuario } = useAuth()
  const { tema, definirTema } = useTema()
  const { pathname } = useLocation()

  const [menuAberto, setMenuAberto] = useState(false)
  const [menuRecolhido, setMenuRecolhido] = useState(lerMenuRecolhido)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false)

  const naoLidas = useNaoLidas(usuario?.id)
  const temaSincronizado = useRef(false)

  // Na primeira carga do perfil, a preferência salva no servidor prevalece.
  useEffect(() => {
    if (!usuario || temaSincronizado.current) return
    temaSincronizado.current = true
    if (usuario.tema !== tema) definirTema(usuario.tema)
  }, [usuario, tema, definirTema])

  // Atalho global de busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBuscaAberta(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setMenuAberto(false)
  }, [pathname])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MENU_RECOLHIDO, menuRecolhido ? '1' : '0')
    } catch {
      /* ignora */
    }
  }, [menuRecolhido])

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Navegação — fixa no desktop, gaveta no mobile */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-line transition-[width] duration-200 lg:block',
          menuRecolhido ? 'w-[90px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'fixed inset-y-0 border-r border-line transition-[width] duration-200',
            menuRecolhido ? 'w-[90px]' : 'w-64',
          )}
        >
          <BarraLateral recolhido={menuRecolhido} />
        </div>
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMenuAberto(false)} aria-hidden />
          <div className="entrada-suave relative h-dvh w-72 max-w-[85vw] border-r border-line-strong shadow-e3">
            <BarraLateral aoNavegar={() => setMenuAberto(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur-sm sm:gap-3 sm:px-5">
          <div className="lg:hidden">
            <BotaoIcone rotulo="Abrir menu" onClick={() => setMenuAberto(true)}>
              <Menu />
            </BotaoIcone>
          </div>
          <div className="hidden lg:block">
            <BotaoIcone
              rotulo={menuRecolhido ? 'Abrir menu lateral' : 'Recolher menu lateral'}
              onClick={() => setMenuRecolhido((v) => !v)}
            >
              {menuRecolhido ? <PanelLeftOpen /> : <PanelLeftClose />}
            </BotaoIcone>
          </div>

          <button
            type="button"
            onClick={() => setBuscaAberta(true)}
            className={cn(
              'flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-line bg-inset px-3 text-left',
              'transition-colors hover:border-line-strong sm:max-w-lg',
            )}
          >
            <Search aria-hidden className="size-[15px] shrink-0 text-ink-3" />
            <span className="hidden truncate text-[13.5px] text-ink-3 sm:block">
              Buscar cliente, placa, OS, produto, protocolo…
            </span>
            <span className="truncate text-[13.5px] text-ink-3 sm:hidden">Buscar…</span>
            <kbd className="num ml-auto hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <IndicadorOffline />

            <div className="relative">
              <BotaoIcone rotulo="Notificações" onClick={() => setNotificacoesAbertas(true)}>
                <Bell />
              </BotaoIcone>
              {(naoLidas.data ?? 0) > 0 && (
                <span
                  aria-hidden
                  className="num absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-on-accent"
                >
                  {naoLidas.data! > 99 ? '99+' : naoLidas.data}
                </span>
              )}
            </div>

            <BotaoIcone rotulo="Central de Ajuda" onClick={() => setAjudaAberta(true)}>
              <HelpCircle />
            </BotaoIcone>

            <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />

            <MenuConta />
          </div>
        </header>

        {/* Medida máxima do conteúdo: acima de ~1760px a linha de leitura e as
            tabelas esticariam sem ganho nenhum. O teto centraliza em monitores
            ultralargos e não altera nada nas larguras usuais da oficina. */}
        <main className="mx-auto w-full min-w-0 max-w-[1760px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {/* Fotos presas por falta de sinal: some sozinho quando a fila zera. */}
          <div className="mb-4 empty:mb-0">
            <EnviosPendentes />
          </div>
          <Outlet />
        </main>
      </div>

      <BuscaGlobal aberto={buscaAberta} aoFechar={() => setBuscaAberta(false)} />
      {usuario && (
        <PainelNotificacoes
          aberto={notificacoesAbertas}
          aoFechar={() => {
            setNotificacoesAbertas(false)
            void naoLidas.refetch()
          }}
          usuarioId={usuario.id}
        />
      )}
      <CentralAjuda aberto={ajudaAberta} aoFechar={() => setAjudaAberta(false)} />
    </div>
  )
}
