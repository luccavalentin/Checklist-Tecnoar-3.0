import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoNegativo } from '@/componentes/marca/Logo'
import { BotaoIcone } from '@/componentes/ui/Botao'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { useAuth } from '@/auth/AuthProvider'
import { NAVEGACAO, grupoDaRota, type ItemMenu } from './navegacao'
import { usePermissoes } from '@/permissoes/PermissoesProvider'

const CHAVE_GRUPOS = 'tecnoar.menu.grupos'

function lerGruposAbertos(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_GRUPOS)
    if (bruto) {
      const v = JSON.parse(bruto)
      if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
    }
  } catch {
    /* ignora */
  }
  return ['inicio', 'cadastros', 'operacao']
}

export function BarraLateral({
  aoNavegar,
  recolhido = false,
}: {
  aoNavegar?: () => void
  recolhido?: boolean
}) {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const { sair } = useAuth()
  const { podeVer, carregando } = usePermissoes()
  const [abertos, setAbertos] = useState<string[]>(lerGruposAbertos)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const [saindo, setSaindo] = useState(false)
  // Menu sempre escuro, independente do tema do app
  const modoEscuro = true

  async function confirmarSaida() {
    setSaindo(true)
    await sair()
    setSaindo(false)
    setConfirmandoSaida(false)
    navegar('/entrar', { replace: true })
  }

  const grupoAtivo = useMemo(() => grupoDaRota(pathname)?.id, [pathname])
  const grupos = useMemo(
    () =>
      NAVEGACAO.map((g) => ({
        ...g,
        itens: g.itens
          .map((i) => ({
            ...i,
            subitens: i.subitens?.filter((s) => s.recurso === null || podeVer(s.recurso)),
          }))
          .filter((i) => i.recurso === null || podeVer(i.recurso) || (i.subitens?.length ?? 0) > 0),
      })).filter((g) => g.itens.length > 0),
    [podeVer],
  )

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(abertos))
    } catch {
      /* ignora */
    }
  }, [abertos])

  function alternar(id: string) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((g) => g !== id) : [...atual, id]))
  }

  if (recolhido) {
    const itens = grupos.flatMap((g) => achatarMenu(g.itens))

    return (
      <div
        className={cn(
          'topo-seguro flex h-full flex-col',
          modoEscuro ? 'bg-[#071225] text-white' : 'bg-white text-[#071225]',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center justify-center border-b',
            modoEscuro ? 'border-white/10' : 'border-slate-200',
          )}
        >
          <NavLink to="/visao-geral" aria-label="Tecnoar — Visão Geral">
            <LogoNegativo altura={38} />
          </NavLink>
        </div>

        <nav aria-label="Navegação principal recolhida" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col items-center gap-2">
            {itens.map((item) => (
              <li key={item.rota}>
                <NavLink
                  to={item.rota}
                  title={item.rotulo}
                  aria-label={item.rotulo}
                  className={({ isActive }) =>
                    cn(
                      'relative flex size-12 items-center justify-center rounded-lg border transition-colors',
                      modoEscuro
                        ? isActive
                          ? 'border-white/10 bg-white/12 text-accent shadow-e2'
                          : 'border-transparent text-slate-300 hover:bg-white/8 hover:text-white'
                        : isActive
                          ? 'border-slate-200 bg-slate-100 text-accent shadow-e1'
                          : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-[3px] rounded-r-sm bg-accent"
                        />
                      )}
                      <item.icone aria-hidden className="size-[19px]" />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {carregando && (
          <div className="flex justify-center px-3 pb-3">
            <span className="size-2 rounded-full bg-accent" title="Carregando permissões" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        /* No app instalado do iPhone o topo fica sob o relógio e a bateria. */
        'topo-seguro flex h-full flex-col',
        modoEscuro ? 'bg-[#071225] text-white' : 'bg-white text-[#071225]',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center justify-between border-b px-4',
          modoEscuro ? 'border-white/10' : 'border-slate-200',
        )}
      >
        <NavLink to="/visao-geral" onClick={aoNavegar} aria-label="Tecnoar — Visão Geral">
          <LogoNegativo altura={40} />
        </NavLink>
        {aoNavegar && (
          <div className="lg:hidden">
            <BotaoIcone rotulo="Fechar menu" tamanho="sm" onClick={aoNavegar}>
              <X />
            </BotaoIcone>
          </div>
        )}
      </div>

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-4">
          {grupos.map((grupo) => {
            // A rota em uso nunca some por causa do estado do menu.
            const aberto = abertos.includes(grupo.id) || grupo.id === grupoAtivo
            const unico = grupo.itens.length === 1

            return (
              <li key={grupo.id} className="flex flex-col gap-0.5">
                {!unico ? (
                  <button
                    type="button"
                    onClick={() => alternar(grupo.id)}
                    aria-expanded={aberto}
                    className={cn(
                      'flex items-center justify-between rounded px-3 py-1.5 font-display text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors',
                      modoEscuro ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {grupo.rotulo}
                    <ChevronRight
                      aria-hidden
                      className={cn('size-3.5 transition-transform duration-150', aberto && 'rotate-90')}
                    />
                  </button>
                ) : (
                  grupo.id !== 'inicio' && (
                    <span
                      className={cn(
                        'px-3 py-1.5 font-display text-[10px] font-semibold tracking-[0.16em] uppercase',
                        modoEscuro ? 'text-slate-400' : 'text-slate-500',
                      )}
                    >
                      {grupo.rotulo}
                    </span>
                  )
                )}

                {(aberto || unico) && (
                  <ul className="flex flex-col gap-0.5">
                    {grupo.itens.map((item) => (
                      <li key={item.rota}>
                        <NavLink
                          to={item.rota}
                          onClick={aoNavegar}
                          className={({ isActive }) =>
                            cn(
                              /*
                               * 44px de altura no toque, 36px no desktop.
                               * A gaveta é usada de luva no pátio; alvo de 32px
                               * erra o item vizinho com frequência.
                               */
                              'group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2',
                              'text-[13.5px] transition-colors lg:min-h-9',
                              modoEscuro
                                ? isActive
                                  ? 'bg-white/12 font-semibold text-white'
                                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
                                : isActive
                                  ? 'bg-slate-100 font-semibold text-slate-950'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <span
                                  aria-hidden
                                  className="absolute inset-y-2 left-0 w-[3px] rounded-r-sm bg-accent"
                                />
                              )}
                              <item.icone
                                aria-hidden
                                className={cn(
                                  'size-[15px] shrink-0',
                                  isActive ? 'text-accent' : modoEscuro ? 'text-slate-400' : 'text-slate-500',
                                )}
                              />
                              <span className="truncate">{item.rotulo}</span>
                            </>
                          )}
                        </NavLink>
                        {item.subitens && item.subitens.length > 0 && (
                          <ul
                            className={cn(
                              'mt-0.5 ml-7 flex flex-col gap-0.5 border-l pl-2',
                              modoEscuro ? 'border-white/10' : 'border-slate-200',
                            )}
                          >
                            {item.subitens.map((subitem) => (
                              <li key={subitem.rota}>
                                <NavLink
                                  to={subitem.rota}
                                  onClick={aoNavegar}
                                  className={({ isActive }) =>
                                    cn(
                                      'group relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors',
                                      modoEscuro
                                        ? isActive
                                          ? 'bg-white/10 font-semibold text-white'
                                          : 'text-slate-400 hover:bg-white/8 hover:text-white'
                                        : isActive
                                          ? 'bg-slate-100 font-semibold text-slate-950'
                                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                                    )
                                  }
                                >
                                  {({ isActive }) => (
                                    <>
                                      <subitem.icone
                                        aria-hidden
                                        className={cn(
                                          'size-3.5 shrink-0',
                                          isActive ? 'text-accent' : modoEscuro ? 'text-slate-500' : 'text-slate-400',
                                        )}
                                      />
                                      <span className="truncate">{subitem.rotulo}</span>
                                    </>
                                  )}
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {carregando && (
        <div className="px-3 pb-2">
          <span
            className={cn(
              'font-display text-[10px] font-semibold tracking-[0.16em] uppercase',
              modoEscuro ? 'text-slate-400' : 'text-slate-500',
            )}
          >
            Carregando permissões…
          </span>
        </div>
      )}

      <div
        className={cn(
          'area-segura shrink-0 border-t px-2 py-2',
          modoEscuro ? 'border-white/10' : 'border-slate-200',
        )}
      >
        <button
          type="button"
          onClick={() => setConfirmandoSaida(true)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
            modoEscuro
              ? 'text-slate-300 hover:bg-white/5 hover:text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <LogOut aria-hidden className="size-4 shrink-0" />
          Sair
        </button>
      </div>

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

function achatarMenu(itens: ItemMenu[]): ItemMenu[] {
  return itens.flatMap((item) => [item, ...(item.subitens ? achatarMenu(item.subitens) : [])])
}
