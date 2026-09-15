import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, ChevronRight, ExternalLink, Eye, LogOut, Monitor, Moon, Phone, Radio, Save, ShieldCheck, Sun, Truck, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraTelefone } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { permissaoAtual } from '@/notificacoes/sistema'
import { sosDefinirSituacao } from '@/sos/api'
import { URL_CHECKLIST } from '@/sos/endereco'
import { destravarAudio, tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { SITUACOES_MECANICO } from '@/sos/rotulos'
import { useMecanico } from '../sessao'
import { CartaoModoApp } from '../ModoApp'
import { Avatar } from '../comum/ui'
import { atualizarFicha, temaEscuroAgora, useHomeMecanico } from './dados'
import { Interruptor, PontoSituacao } from './pecas'
import { aplicarTemaMecanico, lerTemaMecanico, type TemaMecanico } from './tema'
import { BotaoM, CampoM, FolhaM, SecaoM, TelaM, TopoM } from './ui'

const TEMAS: Array<{ id: TemaMecanico; rotulo: string; icone: typeof Sun }> = [
  { id: 'escuro', rotulo: 'Escuro', icone: Moon },
  { id: 'claro', rotulo: 'Claro', icone: Sun },
  { id: 'sistema', rotulo: 'Auto', icone: Monitor },
]

/**
 * Perfil do mecânico: o que o cliente vê dele (veículo de apoio, telefone),
 * os chamados (aceitar SOS, testar alerta, notificações), a aparência e a
 * conta. Nome e foto continuam sendo editados no Checklist — é o mesmo usuário.
 */
export function PerfilMecanico() {
  const { perfil, sair } = useMecanico()
  const home = useHomeMecanico()
  const qc = useQueryClient()
  const toast = useToast()
  const ficha = home.data?.ficha ?? perfil.mecanico
  const situacao = ficha?.situacao ?? 'offline'

  const [veiculo, setVeiculo] = useState(ficha?.veiculo_apoio ?? '')
  const [telefone, setTelefone] = useState(mascaraTelefone(ficha?.telefone_contato ?? perfil.telefone ?? ''))
  const [mostrar, setMostrar] = useState(ficha?.mostrar_telefone ?? false)
  const [tema, setTema] = useState<TemaMecanico>(() => lerTemaMecanico())
  const [confirmarSair, setConfirmarSair] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const editou = useRef(false)

  // A ficha pode chegar depois da tela abrir; só preenche se ninguém mexeu.
  useEffect(() => {
    if (editou.current || !ficha) return
    setVeiculo(ficha.veiculo_apoio ?? '')
    setTelefone(mascaraTelefone(ficha.telefone_contato ?? perfil.telefone ?? ''))
    setMostrar(ficha.mostrar_telefone)
  }, [ficha?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useMutation({
    mutationFn: () =>
      // A situação vai igual à atual: aqui só mudam os dados de contato.
      sosDefinirSituacao(situacao, {
        veiculoApoio: veiculo.trim(),
        telefone: telefone.replace(/\D/g, ''),
        mostrarTelefone: mostrar,
      }),
    onSuccess: (f) => {
      editou.current = false
      atualizarFicha(qc, f)
      toast.ok('Perfil salvo', 'O cliente passa a ver estes dados no próximo chamado.')
    },
    onError: (e) => toast.erro('Não foi possível salvar', (e as Error).message),
  })

  const aceitar = useMutation({
    mutationFn: (v: boolean) => sosDefinirSituacao(situacao, { aceitaSos: v }),
    onSuccess: (f) => {
      atualizarFicha(qc, f)
      toast.info(f.aceita_sos ? 'Chamados de SOS ligados' : 'Chamados de SOS desligados', f.aceita_sos ? 'Fique disponível no início para ser avisado.' : 'Você não será avisado de novos chamados.')
    },
    onError: (e) => toast.erro('Não foi possível alterar', (e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const d = telefone.replace(/\D/g, '')
    if (d && d.length < 10) return toast.atencao('Telefone incompleto', 'Informe o DDD e o número.')
    salvar.mutate()
  }

  function escolherTema(t: TemaMecanico) {
    setTema(t)
    aplicarTemaMecanico(t)
  }

  function testarAlerta() {
    void destravarAudio().then((ok) => {
      if (!ok) return toast.atencao('Som indisponível', 'Confira se o aparelho não está no silencioso.')
      tocarAlerta({ duracaoMs: 2400 })
    })
    vibrarAlerta('sos')
  }

  async function sairDoApp() {
    setSaindo(true)
    // Quem sai disponível viraria um "fantasma" no mapa da central: fica
    // offline antes (sem travar a saída se o banco não responder).
    if (situacao === 'disponivel' || situacao === 'pausa') await sosDefinirSituacao('offline').catch(() => {})
    await sair()
  }

  const aceitaSos = aceitar.isPending ? (aceitar.variables ?? true) : (ficha?.aceita_sos ?? true)
  const permissao = permissaoAtual()

  return (
    <>
      <TopoM titulo="Perfil" />
      <TelaM>
        <section className="flex items-center gap-4 rounded-[1.25rem] border border-line bg-surface p-4">
          <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[20px] font-extrabold text-ink">{perfil.nome}</p>
            <p className="mt-1 flex items-center gap-2 text-[14px] text-ink-2">
              <PontoSituacao situacao={situacao} /> {SITUACOES_MECANICO[situacao].rotulo}
              {perfil.central && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-bold text-ink-2">Central</span>}
            </p>
          </div>
        </section>

        <SecaoM titulo="O que o cliente vê">
          <form onSubmit={enviar} className="flex flex-col gap-4 rounded-[1.25rem] border border-line bg-surface p-4">
            <CampoM
              rotulo="Veículo de apoio"
              icone={Truck}
              value={veiculo}
              maxLength={80}
              placeholder="Ex.: Strada branca ABC1D23"
              onChange={(e) => {
                editou.current = true
                setVeiculo(e.target.value)
              }}
              dica="Ajuda o motorista a reconhecer você chegando."
            />
            <CampoM
              rotulo="Telefone de contato"
              icone={Phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={telefone}
              onChange={(e) => {
                editou.current = true
                setTelefone(mascaraTelefone(e.target.value))
              }}
            />
            <div className="-my-1 border-t border-line">
              <Interruptor
                ligado={mostrar}
                aoMudar={(v) => {
                  editou.current = true
                  setMostrar(v)
                }}
                rotulo="Mostrar meu telefone ao cliente"
                descricao="Desligado, o cliente fala com você pelo chat do chamado."
                icone={Eye}
              />
            </div>
            <BotaoM type="submit" variante="escuro" tamanho="lg" largo icone={Save} carregando={salvar.isPending}>
              Salvar
            </BotaoM>
          </form>
        </SecaoM>

        <SecaoM titulo="Chamados">
          <div className="flex flex-col divide-y divide-line rounded-[1.25rem] border border-line bg-surface px-4">
            <Interruptor
              ligado={aceitaSos}
              aoMudar={(v) => aceitar.mutate(v)}
              desabilitado={aceitar.isPending}
              rotulo="Aceitar chamados SOS"
              descricao="Desligado, você não é avisado de novos chamados, mesmo disponível."
              icone={Radio}
            />
            <button type="button" onClick={testarAlerta} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                <Volume2 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">Testar o alerta de SOS</span>
                <span className="block text-[13px] leading-snug text-ink-3">Toca a sirene e vibra por dois segundos.</span>
              </span>
            </button>
            <Link to="/notificacoes" className="flex min-h-16 w-full items-center gap-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                <Bell className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">Notificações</span>
                <span className={cn('block text-[13px] leading-snug', permissao === 'granted' ? 'text-ok-ink' : 'text-warn-ink')}>
                  {permissao === 'granted' ? 'Ativadas neste aparelho' : permissao === 'denied' ? 'Bloqueadas neste aparelho' : 'Desativadas — toque para ativar'}
                </span>
              </span>
              <ChevronRight className="size-5 text-ink-3" />
            </Link>
          </div>
        </SecaoM>

        <SecaoM titulo="Aparência">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
            {TEMAS.map((t) => {
              const Icone = t.icone
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tema === t.id}
                  onClick={() => escolherTema(t.id)}
                  className={cn(
                    'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-[14px] font-bold transition-colors',
                    tema === t.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2',
                  )}
                >
                  <Icone className="size-5" /> {t.rotulo}
                </button>
              )
            })}
          </div>
        </SecaoM>

        <SecaoM titulo="Conta">
          <CartaoModoApp escuro={temaEscuroAgora()} className={temaEscuroAgora() ? 'bg-surface' : undefined} />
          <div className="flex flex-col divide-y divide-line rounded-[1.25rem] border border-line bg-surface px-4">
            {/* O Checklist mora em outro endereço (outro login no navegador).
                Quem opera a central vai direto para o SOS de lá. */}
            <a href={perfil.central ? `${URL_CHECKLIST}/sos` : URL_CHECKLIST} className="flex min-h-16 w-full items-center gap-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <ShieldCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{perfil.central ? 'Central SOS' : 'Sistema Tecnoar (Checklist)'}</span>
                <span className="block text-[13px] leading-snug text-ink-3">
                  {perfil.central ? 'Mapa, despacho e todos os chamados.' : 'Ordens de serviço, checklists e cadastro.'}
                </span>
              </span>
              <ExternalLink className="size-4 text-ink-3" />
            </a>
            <button type="button" onClick={() => setConfirmarSair(true)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-crit-soft text-crit-ink">
                <LogOut className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-crit-ink">Sair</span>
            </button>
          </div>
        </SecaoM>
      </TelaM>

      <FolhaM
        aberta={confirmarSair}
        aoFechar={() => setConfirmarSair(false)}
        titulo="Sair do app?"
        descricao={situacao === 'disponivel' ? 'Você está disponível. Ao sair, deixa de receber chamados.' : 'Para voltar, entre de novo com seu e-mail e senha.'}
        rodape={
          <>
            <BotaoM variante="vermelho" tamanho="lg" largo icone={LogOut} carregando={saindo} onClick={() => void sairDoApp()}>
              Sair
            </BotaoM>
            <BotaoM variante="fantasma" tamanho="lg" largo onClick={() => setConfirmarSair(false)}>
              Cancelar
            </BotaoM>
          </>
        }
      />
    </>
  )
}
