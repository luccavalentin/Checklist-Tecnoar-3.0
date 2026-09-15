import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CarFront, ClipboardList, FileText, Gauge, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraDocumento, mascaraTelefone, somenteDigitos } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosOSAbrir } from '@/sos/api'
import type { NovaOSApp } from '@/sos/tipos'
import { useAlturaTeclado, useOnline } from '../dados'
import { Placa } from '../pecas'
import { AvisoLinha, PassoCliente, type ClienteEscolhido, type VeiculoEscolhido } from '../clienteCampo'
import { useTemaMecanico } from '../tema'
import { AreaM, BotaoM, CampoM, CartaoM, RodapeAcao, RotuloM, SeloM, TelaM, TopoM } from '../ui'
import { CHAVES_OS } from './dados'

/**
 * NOVA OS — aberta pelo mecânico no app, direto no sistema Tecnoar.
 *
 *   1. Cliente e veículo   o mesmo campo do novo chamado: busca por placa,
 *                          nome, celular ou CPF/CNPJ no cadastro de clientes
 *                          do Checklist, ou cadastra o cliente na hora. A OS
 *                          exige veículo, então a placa é obrigatória.
 *   2. Problema            o que o cliente relatou, e a quilometragem.
 *   3. Conferir e abrir    e a OS abre já com a folha de peças, que é o
 *                          próximo passo natural: lançar o que vai usar.
 *
 * O cliente cadastrado aqui entra na mesma tabela do Checklist; o banco
 * reaproveita quem já tem o celular ou o documento em vez de duplicar.
 */

type Passo = 'cliente' | 'problema' | 'conferir'
const PASSOS: Passo[] = ['cliente', 'problema', 'conferir']
const TITULO: Record<Passo, string> = {
  cliente: 'Cliente e veículo',
  problema: 'O que o cliente relatou?',
  conferir: 'Conferir e abrir',
}

export function NovaOSMecanico() {
  useTemaMecanico()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const teclado = useAlturaTeclado()

  const [passo, setPasso] = useState<Passo>('cliente')
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null)
  const [veiculo, setVeiculo] = useState<VeiculoEscolhido | null>(null)
  const [problema, setProblema] = useState('')
  const [km, setKm] = useState('')
  const [editando, setEditando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const indice = PASSOS.indexOf(passo)

  useEffect(() => {
    window.scrollTo(0, 0)
    setErro(null)
  }, [passo])

  function irPara(p: Passo) {
    setPasso(p)
  }

  function avancar() {
    if (editando) {
      setEditando(false)
      return irPara('conferir')
    }
    irPara(PASSOS[Math.min(indice + 1, PASSOS.length - 1)] ?? 'conferir')
  }

  function voltar() {
    setEditando(false)
    if (indice <= 0) return navegar('/os')
    irPara(PASSOS[indice - 1] ?? 'cliente')
  }

  const abrir = useMutation({
    mutationFn: (p: NovaOSApp) => sosOSAbrir(p),
    onSuccess: (os) => {
      void qc.invalidateQueries({ queryKey: CHAVES_OS.raiz })
      toast.ok(
        `OS nº ${os.numero} aberta no sistema Tecnoar`,
        os.cliente_novo ? 'Cliente cadastrado. Agora lance as peças que vai usar.' : 'Agora lance as peças que vai usar.',
      )
      // Abre direto a folha de peças: é o que o mecânico faz em seguida.
      navegar(`/os/${os.id}?adicionar=produto`, { replace: true })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const erroProblema = problema.trim().length < 3 ? 'Descreva o problema em poucas palavras.' : null
  const kmDig = somenteDigitos(km)

  function enviar() {
    if (abrir.isPending || !cliente || !veiculo) return
    setErro(null)
    const p: NovaOSApp = { problema: problema.trim(), km: kmDig || null }
    if (cliente.id) p.cliente_id = cliente.id
    else {
      p.cliente_nome = cliente.nome
      p.telefone = cliente.telefone
      p.documento = cliente.documento ?? null
    }
    if (veiculo.id) p.veiculo_id = veiculo.id
    else {
      p.placa = veiculo.placa ?? ''
      p.veiculo_descricao = veiculo.descricao
    }
    abrir.mutate(p)
  }

  return (
    <div className="mec mec-fundo min-h-dvh">
      <TopoM
        voltar={voltar}
        sobretitulo={`Nova OS · ${indice + 1} de ${PASSOS.length}`}
        titulo={TITULO[passo]}
        acao={
          <button
            type="button"
            aria-label="Cancelar a nova OS"
            onClick={() => navegar('/os', { replace: true })}
            className="flex size-12 items-center justify-center rounded-2xl text-ink-2 active:bg-surface-2"
          >
            <X className="size-6" />
          </button>
        }
      />
      <div className="mx-auto flex max-w-xl gap-1.5 px-4 pt-3" aria-hidden>
        {PASSOS.map((p, i) => (
          <span key={p} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i <= indice ? 'bg-accent' : 'bg-line')} />
        ))}
      </div>

      {passo === 'cliente' && (
        <PassoCliente
          exigirVeiculo
          pedirDocumento
          atual={cliente && veiculo ? { cliente, veiculo } : null}
          aoEscolher={(c, v) => {
            setCliente(c)
            setVeiculo(v)
            // Com o veículo escolhido já com OS aberta, a quilometragem vem do cadastro.
            avancar()
          }}
        />
      )}

      {passo === 'problema' && cliente && veiculo && (
        <>
          <TelaM comBarra={false} className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
            <ResumoClienteVeiculo cliente={cliente} veiculo={veiculo} aoTrocar={() => irPara('cliente')} />

            {veiculo.osAberta && (
              <CartaoM className="flex flex-col gap-3 border-2 border-warn/60">
                <AvisoLinha icone={AlertTriangle} tom="ambar">
                  Este veículo já tem a OS nº {veiculo.osAberta.numero} aberta. Se for o mesmo atendimento, lance nela em vez de abrir outra.
                </AvisoLinha>
                <BotaoM variante="neutro" tamanho="lg" largo icone={FileText} onClick={() => navegar(`/os/${veiculo.osAberta!.id}`)}>
                  Ir para a OS nº {veiculo.osAberta.numero}
                </BotaoM>
              </CartaoM>
            )}

            <AreaM
              rotulo="Problema relatado *"
              placeholder="O que o cliente relatou ou o que você encontrou."
              value={problema}
              onChange={(e) => setProblema(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              erro={tentou ? erroProblema : null}
              dica="Curto mesmo: o diagnóstico você completa na OS."
            />
            <CampoM
              rotulo="Quilometragem (opcional)"
              icone={Gauge}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 412.300"
              value={km}
              onChange={(e) => setKm(somenteDigitos(e.target.value) ? Number(somenteDigitos(e.target.value)).toLocaleString('pt-BR') : '')}
              dica="Sem km, a OS usa a última do cadastro do veículo."
            />
          </TelaM>
          <RodapeAcao teclado={teclado}>
            <BotaoM
              variante="laranja"
              tamanho={teclado ? 'lg' : 'xl'}
              largo
              onClick={() => {
                setTentou(true)
                if (!erroProblema) avancar()
              }}
            >
              Continuar
            </BotaoM>
          </RodapeAcao>
        </>
      )}

      {passo === 'conferir' && cliente && veiculo && (
        <>
          <TelaM comBarra={false} className="pb-[calc(9rem+env(safe-area-inset-bottom))]">
            <LinhaConferir
              icone={UserRound}
              rotulo="Cliente"
              aoAlterar={() => {
                setEditando(true)
                irPara('cliente')
              }}
            >
              <p className="font-display text-[17px] leading-tight font-extrabold break-words text-ink">{cliente.nome}</p>
              {cliente.telefone && <p className="num text-[13.5px] text-ink-2">{mascaraTelefone(cliente.telefone)}</p>}
              {cliente.documento && <p className="num text-[13.5px] text-ink-2">{mascaraDocumento(cliente.documento)}</p>}
              {!cliente.id && (
                <SeloM tom="ciano" className="mt-1 self-start">
                  Cliente novo · entra no cadastro do sistema
                </SeloM>
              )}
            </LinhaConferir>

            <LinhaConferir
              icone={CarFront}
              rotulo="Veículo"
              aoAlterar={() => {
                setEditando(true)
                irPara('cliente')
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Placa placa={veiculo.placa} tamanho="lg" />
                {!veiculo.id && <SeloM tom="ciano">Veículo novo</SeloM>}
              </div>
              {veiculo.descricao && <p className="text-[14px] text-ink-2">{veiculo.descricao}</p>}
            </LinhaConferir>

            <LinhaConferir
              icone={ClipboardList}
              rotulo="Problema relatado"
              aoAlterar={() => {
                setEditando(true)
                irPara('problema')
              }}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink">{problema.trim()}</p>
              {kmDig && <p className="num text-[13.5px] text-ink-2">{Number(kmDig).toLocaleString('pt-BR')} km</p>}
            </LinhaConferir>

            {erro && (
              <AvisoLinha icone={AlertTriangle} tom="ambar">
                {erro}
              </AvisoLinha>
            )}
          </TelaM>
          <RodapeAcao>
            {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem internet: abrir OS precisa de sinal.</p>}
            <BotaoM variante="laranja" tamanho="xl" largo icone={FileText} carregando={abrir.isPending} disabled={!online} onClick={enviar}>
              Abrir OS
            </BotaoM>
          </RodapeAcao>
        </>
      )}
    </div>
  )
}

function ResumoClienteVeiculo({ cliente, veiculo, aoTrocar }: { cliente: ClienteEscolhido; veiculo: VeiculoEscolhido; aoTrocar: () => void }) {
  return (
    <CartaoM className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[16px] leading-tight font-extrabold text-ink">{cliente.nome}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Placa placa={veiculo.placa} tamanho="sm" />
          {veiculo.descricao && <span className="truncate text-[13px] text-ink-3">{veiculo.descricao}</span>}
        </div>
      </div>
      <BotaoM variante="neutro" tamanho="md" onClick={aoTrocar}>
        Trocar
      </BotaoM>
    </CartaoM>
  )
}

function LinhaConferir({
  icone: Icone,
  rotulo,
  aoAlterar,
  children,
}: {
  icone: typeof UserRound
  rotulo: string
  aoAlterar: () => void
  children: React.ReactNode
}) {
  return (
    <CartaoM className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">
        <Icone className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RotuloM>{rotulo}</RotuloM>
        {children}
      </div>
      <button type="button" onClick={aoAlterar} className="-mr-1 min-h-11 shrink-0 px-2 text-[14px] font-bold text-accent-ink">
        Alterar
      </button>
    </CartaoM>
  )
}
