import { useCallback, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  Handshake,
  HardHat,
  LayoutList,
  PackageSearch,
  Plus,
  Radar,
  Settings2,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Abas, type Aba } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { tocarAlerta } from '@/sos/alerta'
import type { StatusSOS } from '@/sos/tipos'
import { Agendamentos } from './Agendamentos'
import { CatalogoSOS } from './CatalogoSOS'
import { ConfiguracoesSOS } from './ConfiguracoesSOS'
import { ContasApp } from './ContasApp'
import { ContratosSOS } from './ContratosSOS'
import { DetalheChamado } from './DetalheChamado'
import { FILTRO_VAZIO, ListaChamados, type FiltroChamadosTela } from './ListaChamados'
import { MecanicosSOS } from './MecanicosSOS'
import { NovoChamadoCentral } from './NovoChamadoCentral'
import { PainelOperacao } from './PainelOperacao'
import { RelatoriosSOS } from './RelatoriosSOS'
import { EstadoSOSInativo, SeloVigia, TEMPO_ACEITE_PADRAO_SEG, ehErroNaoAtivado, useConfigSOS, useIndicadoresSOS, useSomLiberado } from './comum'

type AbaSOS = 'operacao' | 'chamados' | 'mecanicos' | 'contas' | 'contratos' | 'agendamentos' | 'catalogo' | 'relatorios' | 'configuracoes'

/** Cada área do módulo tem o próprio endereço — é o que o menu lateral abre. */
const ROTA_DA_ABA: Record<AbaSOS, string> = {
  operacao: '/sos',
  chamados: '/sos/chamados',
  mecanicos: '/sos/mecanicos',
  contas: '/sos/clientes',
  contratos: '/sos/contratos',
  agendamentos: '/sos/agendamentos',
  catalogo: '/sos/catalogo',
  relatorios: '/sos/relatorios',
  configuracoes: '/sos/configuracoes',
}
const ABA_DA_ROTA = Object.fromEntries(Object.entries(ROTA_DA_ABA).map(([a, r]) => [r, a])) as Record<string, AbaSOS>

const TITULOS: Record<AbaSOS, string> = {
  operacao: 'Central ao vivo',
  chamados: 'Chamados',
  mecanicos: 'Mecânicos em campo',
  contas: 'Clientes do app',
  contratos: 'Contratos e SLA',
  agendamentos: 'Agendamentos',
  catalogo: 'Peças e serviços',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações',
}

/**
 * Módulo SOS Tecnoar dentro do Checklist — onde todo pedido de socorro
 * chega, é despachado e acompanhado até virar OS, e onde se gerencia quem
 * atende (mecânicos = usuários do Checklist), quem pede (clientes do
 * cadastro), o que se lança (produtos e serviços do cadastro) e os números.
 *
 * O endereço guarda o estado: a área é a rota (`/sos/chamados`,
 * `/sos/relatorios`…) e o chamado aberto é `?chamado=<id>` — um link colado
 * no WhatsApp da equipe abre exatamente a mesma tela. Links antigos com
 * `?aba=` (notificações já enviadas) são levados para a rota certa.
 *
 * O tempo real não é assinado aqui: o `AlertaSOS` do layout já escuta os
 * chamados em qualquer tela e invalida as consultas desta página.
 */
export function CentralSOS() {
  const { pode } = usePermissoes()
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const podeVer = pode('sos', 'visualizar')
  const podeCriar = pode('sos', 'criar')
  const podeEditar = pode('sos', 'editar')
  const podeConfigurar = pode('sos', 'configurar')
  const podeExportar = pode('sos', 'exportar')

  const rotaLimpa = pathname.replace(/\/+$/, '') || '/sos'
  const abaRota: AbaSOS = ABA_DA_ROTA[rotaLimpa] ?? 'operacao'
  const aba: AbaSOS = abaRota === 'configuracoes' && !podeConfigurar ? 'operacao' : abaRota
  const chamadoId = params.get('chamado')
  const abaLegada = params.get('aba') as AbaSOS | null

  const indicadores = useIndicadoresSOS(podeVer)
  const config = useConfigSOS(podeVer)
  const tempoAceite = config.data?.tempo_aceite_seg ?? TEMPO_ACEITE_PADRAO_SEG
  const [filtro, setFiltro] = useState<FiltroChamadosTela>(FILTRO_VAZIO)
  const [novoAberto, setNovoAberto] = useState(false)
  const [somLiberado, liberarSom] = useSomLiberado()

  // Trocar de área é navegar (o menu lateral acompanha e o "voltar" do
  // navegador funciona); o chamado aberto, se houver, continua aberto.
  const mudarAba = useCallback(
    (v: AbaSOS) => {
      const chamado = params.get('chamado')
      navegar(ROTA_DA_ABA[v] + (chamado ? `?chamado=${encodeURIComponent(chamado)}` : ''))
    },
    [navegar, params],
  )

  const abrirChamado = useCallback(
    (id: string) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          n.set('chamado', id)
          return n
        },
        { replace: true },
      ),
    [setParams],
  )

  const fecharChamado = useCallback(
    () =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          n.delete('chamado')
          return n
        },
        { replace: true },
      ),
    [setParams],
  )

  const verChamados = useCallback(
    (status: StatusSOS[]) => {
      setFiltro({ ...FILTRO_VAZIO, status: status.join(',') })
      mudarAba('chamados')
    },
    [mudarAba],
  )

  if (abaLegada && abaLegada in ROTA_DA_ABA) {
    const resto = new URLSearchParams(params)
    resto.delete('aba')
    const busca = resto.toString()
    return <Navigate to={ROTA_DA_ABA[abaLegada] + (busca ? `?${busca}` : '')} replace />
  }

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Operação" titulo="SOS Tecnoar" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const ind = indicadores.data?.ok === false ? undefined : indicadores.data
  const inativo = indicadores.isError && ehErroNaoAtivado(indicadores.error)
  const aguardando = ind?.aguardando ?? 0

  const abas: Array<Aba<AbaSOS>> = [
    { valor: 'operacao', rotulo: 'Ao vivo', icone: <Radar />, contador: aguardando || undefined },
    { valor: 'chamados', rotulo: 'Chamados', icone: <LayoutList /> },
    { valor: 'mecanicos', rotulo: 'Mecânicos', icone: <HardHat />, contador: ind ? ind.mecanicos_disponiveis : undefined },
    { valor: 'contas', rotulo: 'Clientes do app', icone: <Smartphone /> },
    { valor: 'contratos', rotulo: 'Contratos e SLA', icone: <Handshake /> },
    { valor: 'agendamentos', rotulo: 'Agendamentos', icone: <CalendarClock />, contador: ind?.agendamentos_pendentes || undefined },
    { valor: 'catalogo', rotulo: 'Peças e serviços', icone: <PackageSearch /> },
    { valor: 'relatorios', rotulo: 'Relatórios', icone: <BarChart3 /> },
    ...(podeConfigurar ? [{ valor: 'configuracoes' as const, rotulo: 'Configurações', icone: <Settings2 /> }] : []),
  ]

  return (
    // Folga inferior com a faixa do indicador de início do iPhone (app instalado).
    <div className="flex min-w-0 flex-col gap-4 pb-[env(safe-area-inset-bottom)]">
      <CabecalhoPagina
        // No celular os dois botões ocupam a largura toda, meio a meio, com
        // 44 px de altura: lado a lado e soltos à esquerda pareciam sobra.
        className={cn(
          'gap-3 sm:gap-4',
          !inativo && 'max-sm:[&>div:last-child]:grid max-sm:[&>div:last-child]:w-full max-sm:[&>div:last-child]:auto-cols-fr max-sm:[&>div:last-child]:grid-flow-col max-sm:[&>div:last-child>button]:h-11',
        )}
        sobretitulo={`SOS Tecnoar · ${TITULOS[aba]}`}
        titulo={aba === 'operacao' ? 'SOS Tecnoar' : TITULOS[aba]}
        meta={
          !inativo && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-ok/35 bg-ok-soft px-3 py-1">
                <span aria-hidden className="pulso-ativo size-1.5 rounded-full bg-ok" />
                <span className="lbl text-ok-ink">Central ao vivo</span>
              </span>
              <SeloVigia aoClicar={podeConfigurar ? () => mudarAba('configuracoes') : undefined} />
              {aguardando > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-crit px-3 py-1 text-white">
                  <span aria-hidden className="sos-piscar size-1.5 rounded-full bg-white" />
                  <span className="num text-[11.5px] font-semibold">{aguardando}</span>
                  <span className="text-[11.5px] font-medium">aguardando</span>
                </span>
              )}
            </span>
          )
        }
        acoes={
          !inativo && (
            <>
              <Botao
                variante={somLiberado ? 'neutro' : 'secundario'}
                iconeInicio={somLiberado ? <Volume2 /> : <VolumeX />}
                onClick={() =>
                  void liberarSom().then((ok) => {
                    if (ok) tocarAlerta({ tipo: 'aviso' })
                  })
                }
                title={somLiberado ? 'Tocar um bipe de teste' : 'O navegador bloqueia som até um clique na página'}
                className={cn(!somLiberado && 'sos-piscar')}
              >
                {somLiberado ? 'Som ativo' : 'Ativar som'}
              </Botao>
              {podeCriar && (
                <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setNovoAberto(true)}>
                  Abrir SOS
                </Botao>
              )}
            </>
          )
        }
      />

      {inativo ? (
        <EstadoSOSInativo aoTentarNovamente={() => void indicadores.refetch()} />
      ) : (
        <>
          {/* No celular e no tablet a aba vira alvo de 44 px (o padrão do sistema é 36). */}
          <Abas abas={abas} ativa={aba} aoMudar={mudarAba} className="max-lg:[&>button]:h-11 max-lg:[&>button]:px-3.5" />

          {aba === 'operacao' && (
            <PainelOperacao
              indicadores={ind}
              carregandoIndicadores={indicadores.isLoading}
              tempoAceiteSeg={tempoAceite}
              podeCriar={podeCriar}
              aoAbrirChamado={abrirChamado}
              aoNovoChamado={() => setNovoAberto(true)}
              aoVerChamados={verChamados}
            />
          )}
          {aba === 'chamados' && (
            <ListaChamados filtro={filtro} aoMudarFiltro={setFiltro} tempoAceiteSeg={tempoAceite} podeExportar={podeExportar} aoAbrirChamado={abrirChamado} />
          )}
          {aba === 'agendamentos' && <Agendamentos podeEditar={podeEditar} />}
          {aba === 'mecanicos' && <MecanicosSOS aoAbrirChamado={abrirChamado} />}
          {aba === 'contas' && <ContasApp podeEditar={podeEditar} />}
          {aba === 'contratos' && <ContratosSOS podeConfigurar={podeConfigurar} />}
          {aba === 'catalogo' && <CatalogoSOS />}
          {aba === 'relatorios' && <RelatoriosSOS />}
          {aba === 'configuracoes' && <ConfiguracoesSOS podeConfigurar={podeConfigurar} />}
        </>
      )}

      <DetalheChamado chamadoId={chamadoId} aoFechar={fecharChamado} />

      {podeCriar && (
        <NovoChamadoCentral
          aberto={novoAberto}
          aoFechar={() => setNovoAberto(false)}
          aoCriado={(id) => {
            setNovoAberto(false)
            abrirChamado(id)
          }}
        />
      )}
    </div>
  )
}
