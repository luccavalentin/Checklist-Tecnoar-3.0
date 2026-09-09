import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  LockKeyhole,
  LockKeyholeOpen,
  MessageCircle,
  Printer,
  Save,
  SaveAll,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { numeroBR } from '@/lib/formatos'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Selo } from '@/componentes/ui/Selo'
import { TOM_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import type { OSListada } from '@/tipos/db'

const ROTULO_TIPO = { os: 'OS', orcamento: 'Orçamento', garantia: 'Garantia' } as const

export interface AcoesOS {
  salvando: boolean
  encerrando: boolean
  podeEditar: boolean
  aoSalvar: () => void
  aoSalvarESair: () => void
  aoEncerrar: () => void
  aoReabrir: () => void
  /**
   * Cancelar a OS. Só é passada para quem tem a permissão `cancelar` e
   * enquanto a ordem estiver aberta — sem ela o botão não é montado.
   */
  aoCancelar?: () => void
  aoImprimirOS: () => void
  /**
   * Impressão do Checklist de Entrada. Só é passada quando existe documento a
   * imprimir — sem ela o botão não é montado, em vez de ficar inerte.
   */
  aoImprimirChecklist?: () => void
  /** Só existe quando o cliente tem telefone cadastrado. */
  linkWhatsapp: string | null
}

/**
 * Cabeçalho da ordem de serviço.
 *
 * Concentra o que o atendente precisa ver sem rolar — número, situação, tipo,
 * cliente, veículo, placa e KM — e as ações que ele usa o tempo todo. Fica
 * grudado no topo porque a OS é uma tela longa: as ações não podem sumir
 * quando se desce até os itens.
 *
 * No celular a barra de ações desce para o rodapé, onde o polegar alcança.
 */
export function CabecalhoOS({
  ordem,
  aoVoltar,
  acoes,
}: {
  ordem: OSListada
  aoVoltar: () => void
  acoes: AcoesOS
}) {
  const encerrada = Boolean(ordem.encerrada_em)
  const barra = useRef<HTMLDivElement>(null)

  /*
   * Publica a altura da barra de ações numa variável do documento.
   *
   * Sem isso, o aviso de "nova versão" e outros elementos flutuantes pousam
   * exatamente em cima do botão Salvar no celular. Quem flutua no rodapé lê
   * `--barra-acoes` e se afasta.
   */
  useEffect(() => {
    const el = barra.current
    if (!el) return
    const medir = () => {
      const alta = window.matchMedia('(min-width: 1024px)').matches
      document.documentElement.style.setProperty('--barra-acoes', alta ? '0px' : `${el.offsetHeight}px`)
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', medir)
      document.documentElement.style.setProperty('--barra-acoes', '0px')
    }
  }, [])

  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-canvas/96 px-4 py-2.5 shadow-e1 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex w-full min-w-0 flex-1 items-center gap-3 xl:w-auto xl:min-w-[36rem]">
          <BotaoIcone rotulo="Voltar para a lista" onClick={aoVoltar} className="shrink-0">
            <ArrowLeft />
          </BotaoIcone>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="num text-[19px] leading-none font-bold text-ink sm:text-[22px]">
                OS {String(ordem.numero).padStart(5, '0')}
              </h1>
              {ordem.status && (
                <Selo tom={TOM_COR_STATUS[ordem.status.cor] ?? 'neutro'} ponto>
                  {ordem.status.nome}
                </Selo>
              )}
              <Selo tom={ordem.tipo === 'garantia' ? 'atencao' : ordem.tipo === 'orcamento' ? 'info' : 'neutro'}>
                {ROTULO_TIPO[ordem.tipo]}
              </Selo>
              {encerrada && <Selo tom="ok">Encerrada</Selo>}
            </div>

            <dl className="grid max-w-[940px] grid-cols-2 gap-1.5 text-[12px] sm:grid-cols-[96px_minmax(9rem,1.2fr)_minmax(10rem,1.4fr)_84px]">
              <Dado rotulo="Placa">
                <span className="num font-semibold text-ink">{ordem.veiculo?.placa ?? '—'}</span>
              </Dado>
              <Dado rotulo="Veículo">
                <span className="truncate text-ink-2">{ordem.veiculo?.descricao ?? '—'}</span>
              </Dado>
              <Dado rotulo="Cliente">
                <span className="truncate text-ink-2">{ordem.cliente?.nome_razao ?? 'Não informado'}</span>
              </Dado>
              <Dado rotulo="KM">
                <span className="num text-ink-2">
                  {ordem.km !== null ? `${numeroBR(ordem.km, 0)}` : '—'}
                </span>
              </Dado>
            </dl>
          </div>
        </div>

        {/*
          Ações: em linha no desktop, no rodapé fixo no celular.

          Quando não cabe ao lado da identidade, o `flex-wrap` do pai joga o
          bloco inteiro para a linha de baixo — em vez de espremer a
          identidade até os cartões virarem duas letras. Na linha de baixo os
          botões ficam alinhados à esquerda, sob o número da OS, e não jogados
          na borda direita da tela.
        */}
        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          <BarraAcoes acoes={acoes} encerrada={encerrada} />
        </div>
      </div>

      {/*
        A barra do celular vai para o corpo da página por portal. Dentro do
        cabeçalho ela não funcionaria: `backdrop-filter` cria bloco de contenção
        e um `position: fixed` filho passa a se ancorar no cabeçalho, não na
        janela — a barra aparecia colada no título em vez do rodapé.
      */}
      {createPortal(
        <div
          ref={barra}
          className="area-segura fixed inset-x-0 bottom-0 z-40 flex gap-2 overflow-x-auto border-t border-line bg-surface px-4 py-2.5 lg:hidden"
        >
          <BarraAcoes acoes={acoes} encerrada={encerrada} compacto />
        </div>,
        document.body,
      )}
    </header>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <dt className="lbl text-[9px]">{rotulo}</dt>
      <dd className="mt-0.5 min-w-0 truncate">{children}</dd>
    </div>
  )
}

/**
 * Ação de uso eventual.
 *
 * No celular mantém o rótulo curto (a barra rola na horizontal). No desktop
 * fica só o ícone até `2xl`, onde sobra largura para o texto — é o que impede
 * sete botões com rótulo longo de expulsarem a identidade da OS da tela.
 */
function AcaoSecundaria({
  compacto,
  icone,
  rotulo,
  rotuloCurto,
  onClick,
}: {
  compacto?: boolean
  icone: ReactNode
  rotulo: string
  rotuloCurto: string
  onClick: () => void
}) {
  return (
    <Botao
      variante="neutro"
      tamanho={compacto ? 'md' : 'sm'}
      iconeInicio={icone}
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className={cn(compacto ? 'shrink-0' : 'px-3 2xl:px-4')}
    >
      {compacto ? rotuloCurto : <span className="hidden 2xl:inline">{rotulo}</span>}
    </Botao>
  )
}

function BarraAcoes({
  acoes,
  encerrada,
  compacto,
}: {
  acoes: AcoesOS
  encerrada: boolean
  compacto?: boolean
}) {
  /* No rodapé do celular os botões são 'md': 'sm' dá alvo de 30px, que a mão
     de luva erra. A barra rola na horizontal, então largura não é problema.
     No desktop o mouse acerta 'sm', e a barra fica com a altura de uma barra
     de ferramentas em vez de roubar um sexto da tela do laptop. */
  const tamanho = compacto ? ('md' as const) : ('sm' as const)

  return (
    <>
      {acoes.podeEditar && !encerrada && (
        <>
          <Botao
            variante="primario"
            tamanho={tamanho}
            iconeInicio={<Save />}
            carregando={acoes.salvando}
            onClick={acoes.aoSalvar}
            className={cn(compacto && 'shrink-0')}
          >
            Salvar
          </Botao>
          <Botao
            variante="neutro"
            tamanho={tamanho}
            iconeInicio={<SaveAll />}
            carregando={acoes.salvando}
            onClick={acoes.aoSalvarESair}
            className={cn(compacto && 'shrink-0')}
          >
            Salvar e sair
          </Botao>
        </>
      )}

      {acoes.podeEditar &&
        (encerrada ? (
          <Botao
            variante="neutro"
            tamanho={tamanho}
            iconeInicio={<LockKeyholeOpen />}
            onClick={acoes.aoReabrir}
            className={cn(compacto && 'shrink-0')}
          >
            Reabrir
          </Botao>
        ) : (
          <Botao
            variante="secundario"
            tamanho={tamanho}
            iconeInicio={<LockKeyhole />}
            carregando={acoes.encerrando}
            onClick={acoes.aoEncerrar}
            className={cn(compacto && 'shrink-0')}
          >
            Encerrar
          </Botao>
        ))}

      {acoes.aoCancelar && !encerrada && (
        <Botao
          variante="destrutivo"
          tamanho={tamanho}
          iconeInicio={<Ban />}
          onClick={acoes.aoCancelar}
          className={cn(compacto && 'shrink-0')}
        >
          Cancelar OS
        </Botao>
      )}

      <AcaoSecundaria
        compacto={compacto}
        icone={<Printer />}
        rotulo="Imprimir OS"
        rotuloCurto="OS"
        onClick={acoes.aoImprimirOS}
      />

      {acoes.aoImprimirChecklist && (
        <AcaoSecundaria
          compacto={compacto}
          icone={<ClipboardList />}
          rotulo="Checklist de entrada"
          rotuloCurto="Checklist"
          onClick={acoes.aoImprimirChecklist}
        />
      )}

      {acoes.linkWhatsapp && (
        <AcaoSecundaria
          compacto={compacto}
          icone={<MessageCircle />}
          rotulo="WhatsApp"
          rotuloCurto="WhatsApp"
          onClick={() => window.open(acoes.linkWhatsapp!, '_blank', 'noopener,noreferrer')}
        />
      )}
    </>
  )
}
