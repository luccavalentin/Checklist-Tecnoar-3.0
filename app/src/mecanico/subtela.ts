import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Telas de dentro do atendimento (OS, produtos, serviços, fotos…). Cada uma é
 * uma tela inteira, uma decisão por vez; o endereço ganha `?tela=…` para o
 * botão "voltar" do aparelho fechar a tela em vez de sair do chamado.
 */
export type SubTela = 'os' | 'diagnostico' | 'observacoes' | 'fotos' | 'produtos' | 'servicos' | 'orcamento' | 'ia' | 'finalizar'

const VALIDAS: SubTela[] = ['os', 'diagnostico', 'observacoes', 'fotos', 'produtos', 'servicos', 'orcamento', 'ia', 'finalizar']

export function useSubTela() {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const local = useLocation()
  const bruta = params.get('tela')
  const tela = VALIDAS.includes(bruta as SubTela) ? (bruta as SubTela) : null
  const empilhada = !!(local.state as { sub?: boolean } | null)?.sub

  const abrir = useCallback((t: SubTela) => navegar({ search: `?tela=${t}` }, { state: { sub: true } }), [navegar])

  const fechar = useCallback(() => {
    // Aberta por um toque aqui dentro: volta no histórico. Aberta por link
    // (atalho "OS" do início): troca o endereço sem empilhar.
    if (empilhada) navegar(-1)
    else {
      const p = new URLSearchParams(params)
      p.delete('tela')
      setParams(p, { replace: true })
    }
  }, [empilhada, navegar, params, setParams])

  return { tela, abrir, fechar }
}
