import { useCallback, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { ItemCatalogo } from '@/sos/tipos'
import { Catalogo } from './Catalogo'
import { useDestinosLancamento } from './os/dados'
import { FolhaLancar } from './os/FolhaLancar'
import { TelaM, TopoM } from './ui'

/**
 * Atalhos "Produtos" e "Serviços" do início: o cadastro do sistema Tecnoar
 * inteiro, com o disponível real. Tocar num item abre "Lançar" — no chamado
 * em atendimento (a peça fica reservada até a OS ser efetivada) ou numa das
 * OS abertas com o mecânico. Sem destino, é consulta de preço e estoque.
 *
 * A lista de OS (atalho "OS") mora em `os/ListaOS.tsx`.
 */
export function CatalogoMecanico() {
  const { tipo } = useParams<{ tipo: string }>()
  const { destinos, carregando, erro, tentar } = useDestinosLancamento()
  const [escolhido, setEscolhido] = useState<ItemCatalogo | null>(null)
  const fechar = useCallback(() => setEscolhido(null), [])

  if (tipo !== 'produtos' && tipo !== 'servicos') return <Navigate to="/" replace />
  const produtos = tipo === 'produtos'
  // "Lançar" só aparece quando há onde lançar — botão que não leva a nada não entra.
  const podeLancar = destinos.length > 0
  const sub = podeLancar ? 'Sistema Tecnoar · toque para lançar' : 'Sistema Tecnoar · preço e estoque'

  return (
    <>
      <TopoM voltar="/" titulo={produtos ? 'Produtos' : 'Serviços'} sub={sub} />
      <TelaM>
        {erro && !podeLancar && (
          <p className="rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13.5px] leading-snug font-medium text-warn-ink">
            Não foi possível ver seu chamado e suas OS agora, então lançar fica para depois.{' '}
            <button type="button" onClick={tentar} className="min-h-11 font-bold underline underline-offset-2">
              Tentar de novo
            </button>
          </p>
        )}
        <Catalogo
          tipo={produtos ? 'produto' : 'servico'}
          podeAdicionar={false}
          aoEscolher={podeLancar ? setEscolhido : undefined}
          avisoConsulta={
            carregando || erro ? '' : 'Consulta de preço e estoque. Para lançar, é preciso um chamado em atendimento ou uma OS aberta com você.'
          }
        />
      </TelaM>
      <FolhaLancar item={escolhido} aoFechar={fechar} destinos={destinos} carregandoDestinos={carregando} erroDestinos={erro} aoTentarDestinos={tentar} />
    </>
  )
}
