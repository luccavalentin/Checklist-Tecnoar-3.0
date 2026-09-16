import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import './estilo.css'
import { ProvedorToast } from '@/componentes/ui/Toast'
import { BarreiraErro } from '@/componentes/BarreiraErro'
import { destravarNoPrimeiroToque } from '@/sos/alerta'
import { ProvedorSessao } from './sessao'
import { AppSOS } from './AppSOS'
import { AtualizadorApp, ConviteApp, StatusRede, registrarServiceWorker } from './comum/Pwa'
import { AvisosDoApp } from './comum/Aparelho'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 10 * 60_000,
      retry: (tentativas, erro) => {
        const msg = String((erro as Error)?.message ?? '').toLowerCase()
        if (msg.includes('permissão') || msg.includes('ativado no banco') || msg.includes('jwt')) return false
        return tentativas < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})

// O app mora na raiz do subdomínio do SOS. Links antigos e os que o banco
// grava nas notificações ainda trazem `/app/...` (quando ele era uma pasta do
// Checklist): o caminho é corrigido antes de o roteador ler o endereço.
{
  const { pathname, search, hash } = window.location
  if (/^\/app(\/|$)/.test(pathname)) window.history.replaceState(null, '', (pathname.slice(4) || '/') + search + hash)
}

// Service worker do app: instalação, esqueleto offline e push.
// A versão nova entra sozinha, mas nunca no meio de um pedido de socorro.
registrarServiceWorker()

// Sem um toque na página, nenhum navegador toca som. O primeiro toque em
// qualquer lugar já deixa o alerta de SOS pronto.
destravarNoPrimeiroToque()

{
  const tema = localStorage.getItem('sos.tema')
  const escuro = tema === 'escuro' || (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', escuro)
}

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Elemento #raiz não encontrado.')

createRoot(raiz).render(
  <StrictMode>
    <BarreiraErro>
      <QueryClientProvider client={cliente}>
        <ProvedorToast>
          <ProvedorSessao>
            <BrowserRouter>
              <AppSOS />
              <AtualizadorApp />
              <ConviteApp />
              <StatusRede />
              <AvisosDoApp />
            </BrowserRouter>
          </ProvedorSessao>
        </ProvedorToast>
      </QueryClientProvider>
    </BarreiraErro>
  </StrictMode>,
)
