import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, Lock, RefreshCw, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao } from './Botao'

/* ------------------------------------------------------------- Esqueleto */

export function Esqueleto({ className, largura }: { className?: string; largura?: string }) {
  return (
    <span
      aria-hidden
      className={cn('relative block overflow-hidden rounded bg-skeleton', className)}
      style={largura ? { width: largura } : undefined}
    >
      <span
        className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/12 to-transparent"
        style={{ animation: 'tec-brilho 1.5s infinite' }}
      />
    </span>
  )
}

const LARGURAS_ESQUELETO = ['58%', '88%', '72%', '80%', '46%', '64%', '76%', '52%']

export function EsqueletoLinhas({ linhas = 5, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-live="polite">
      {Array.from({ length: linhas }).map((_, i) => (
        <Esqueleto key={i} className="h-3" largura={LARGURAS_ESQUELETO[i % LARGURAS_ESQUELETO.length]} />
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

/* -------------------------------------------------------------- Moldura */

function Moldura({
  icone,
  titulo,
  descricao,
  acao,
  tom = 'neutro',
  compacto,
  className,
}: {
  icone: ReactNode
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  tom?: 'neutro' | 'critico'
  compacto?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center',
        compacto ? 'min-h-40' : 'min-h-64',
        tom === 'critico' ? 'border-crit/40 bg-crit-soft/40' : 'border-line-strong',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-12 items-center justify-center rounded-lg border [&_svg]:size-5',
          tom === 'critico' ? 'border-crit/45 text-crit' : 'border-dashed border-line-strong text-ink-3',
        )}
      >
        {icone}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[15px] font-semibold text-ink">{titulo}</p>
        {descricao && <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">{descricao}</p>}
      </div>
      {acao}
    </div>
  )
}

/* ---------------------------------------------------------------- Vazio */

export function EstadoVazio({
  titulo = 'Nenhum registro',
  descricao,
  icone,
  acao,
  compacto,
  className,
}: {
  titulo?: string
  descricao?: ReactNode
  icone?: ReactNode
  acao?: ReactNode
  compacto?: boolean
  className?: string
}) {
  return (
    <Moldura
      icone={icone ?? <Inbox />}
      titulo={titulo}
      descricao={descricao}
      acao={acao}
      compacto={compacto}
      className={className}
    />
  )
}

/* ----------------------------------------------------------------- Erro */

export function EstadoErro({
  titulo = 'Não foi possível carregar',
  descricao,
  aoTentarNovamente,
  compacto,
  className,
}: {
  titulo?: string
  descricao?: ReactNode
  aoTentarNovamente?: () => void
  compacto?: boolean
  className?: string
}) {
  const semRede = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <Moldura
      tom="critico"
      icone={semRede ? <WifiOff /> : <AlertTriangle />}
      titulo={semRede ? 'Sem conexão' : titulo}
      descricao={
        semRede ? 'O dispositivo está offline. Reconecte para carregar as informações.' : descricao
      }
      compacto={compacto}
      className={className}
      acao={
        aoTentarNovamente && (
          <Botao variante="destrutivo" tamanho="sm" iconeInicio={<RefreshCw />} onClick={aoTentarNovamente}>
            Tentar novamente
          </Botao>
        )
      }
    />
  )
}

/* -------------------------------------------------------- Sem permissão */

export function EstadoSemPermissao({
  descricao = 'Seu perfil de acesso não inclui esta ação. Fale com o gestor responsável.',
  compacto,
  className,
}: {
  descricao?: ReactNode
  compacto?: boolean
  className?: string
}) {
  return (
    <Moldura
      icone={<Lock />}
      titulo="Acesso restrito"
      descricao={descricao}
      compacto={compacto}
      className={className}
    />
  )
}

/* ----------------------------------------------------------- Carregando */

export function EstadoCarregando({ rotulo = 'Carregando…', className }: { rotulo?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex min-h-64 flex-col items-center justify-center gap-3 text-ink-3', className)}
    >
      <Loader2 aria-hidden className="size-6 animate-spin text-cyan" />
      <span className="text-[13px]">{rotulo}</span>
    </div>
  )
}

/**
 * Tela de abertura do sistema.
 *
 * Depois de três segundos ela para de só girar e diz o que está esperando —
 * e, se o aparelho está sem rede, diz isso na hora. Na oficina o celular fica
 * sem sinal com frequência: um "Carregando" mudo por seis segundos faz o
 * operador achar que o sistema travou.
 */
export function TelaCarregando() {
  const [demorando, setDemorando] = useState(false)
  const semRede = typeof navigator !== 'undefined' && !navigator.onLine

  useEffect(() => {
    const t = setTimeout(() => setDemorando(true), 3000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <Loader2 aria-hidden className="size-7 animate-spin text-cyan" />
      <span className="lbl">Carregando</span>
      {(demorando || semRede) && (
        <p className="max-w-xs text-[12.5px] leading-relaxed text-ink-2">
          {semRede
            ? 'Este aparelho está sem conexão. Assim que o sinal voltar, o sistema entra sozinho.'
            : 'Ainda falando com o servidor. Se demorar muito, verifique a conexão.'}
        </p>
      )}
    </div>
  )
}
