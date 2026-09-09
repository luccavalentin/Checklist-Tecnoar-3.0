import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import '@/styles/theme.css'
import { App } from './App'
import { ProvedorTema } from '@/tema/TemaProvider'
import { ProvedorAuth } from '@/auth/AuthProvider'
import { ProvedorToast } from '@/componentes/ui/Toast'
import { BarreiraErro } from '@/componentes/BarreiraErro'
import { ProvedorPermissoes } from '@/permissoes/PermissoesProvider'
import { ReconhecimentoPlacaProvider, provedorPadrao } from '@/dados/ReconhecimentoPlaca'
import { AvisoAtualizacao } from '@/layout/StatusApp'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Dado operacional desatualizado é pior do que uma consulta a mais.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (tentativas, erro) => {
        const msg = String((erro as Error)?.message ?? '').toLowerCase()
        if (msg.includes('jwt') || msg.includes('permission')) return false
        return tentativas < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado.')

createRoot(raiz).render(
  <StrictMode>
    <BarreiraErro>
      <ProvedorTema>
        <QueryClientProvider client={cliente}>
          <ProvedorToast>
            <ProvedorAuth>
              <ProvedorPermissoes>
                {/*
                  A leitura de placa começa em manual/mock. Em produção, o
                  provider chama função de borda, onde a chave do OCR fica
                  guardada. A OS nunca trava quando a leitura falha.
                */}
                <ReconhecimentoPlacaProvider provedor={provedorPadrao()}>
                  <BrowserRouter>
                    <App />
                  </BrowserRouter>
                </ReconhecimentoPlacaProvider>
              </ProvedorPermissoes>
              {/* Registra o service worker em qualquer rota, inclusive no login. */}
              <AvisoAtualizacao />
            </ProvedorAuth>
          </ProvedorToast>
        </QueryClientProvider>
      </ProvedorTema>
    </BarreiraErro>
  </StrictMode>,
)
