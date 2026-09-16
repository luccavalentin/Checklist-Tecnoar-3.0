import { useState, type ComponentType, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Bell,
  CalendarCheck,
  ChevronRight,
  Headset,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Pencil,
  Phone,
  ScrollText,
  ShieldCheck,
  Siren,
  Sun,
  Trash2,
  Truck,
  User,
} from 'lucide-react'
import { mascaraTelefone } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosAtualizarConta, sosExcluirMinhaConta } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { aplicarTema, lerTema, useCliente } from '../sessao'
import { Avatar, BotaoApp, CabecalhoTela, CampoApp, Faixa, Folha, Tela } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import { CartaoAparelho } from '../comum/Aparelho'
import { CartaoModoApp } from '../ModoApp'
import { useAlturaTeclado, useCasca, useHomeCliente, useInfoPublica } from './dados'
import { Escolha, GrupoLista, LinhaLista } from './pecas'

type Tema = 'claro' | 'escuro' | 'sistema'

/**
 * Perfil do cliente: dados de contato (é por eles que o mecânico liga),
 * aparência do app e a saída. Nada de configuração escondida em submenu.
 */
export function PerfilCliente() {
  const { conta, email, sair } = useCliente()
  const { naoLidas } = useCasca()
  const qc = useQueryClient()
  const toast = useToast()
  const info = useInfoPublica()
  const online = useOnline()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(conta.nome)
  const [telefone, setTelefone] = useState(mascaraTelefone(conta.telefone ?? ''))
  const [erro, setErro] = useState<string | null>(null)
  const [tema, setTema] = useState<Tema>(lerTema())
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const salvar = useMutation({
    mutationFn: () => sosAtualizarConta({ nome: nome.trim(), telefone: telefone.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      toast.ok('Dados atualizados', 'O mecânico vai ligar para este número.')
      setEditando(false)
    },
    onError: (e) => setErro((e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nome.trim().length < 3) return setErro('Informe seu nome.')
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Informe o celular com DDD.')
    salvar.mutate()
  }

  function trocarTema(t: Tema) {
    setTema(t)
    aplicarTema(t)
  }

  return (
    <>
      <CabecalhoTela titulo="Conta" />
      <Tela className="entrada-suave">
        <section className="flex items-center gap-4 rounded-[1.25rem] border border-line bg-surface p-4">
          <Avatar nome={conta.nome} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-display text-[20px] leading-tight font-bold break-words text-ink">{conta.nome}</p>
            <p className="truncate text-[13.5px] text-ink-3">{email ?? conta.email ?? 'Sem e-mail'}</p>
            <p className="num truncate text-[13px] text-ink-3">{conta.telefone ? mascaraTelefone(conta.telefone) : 'Sem telefone'}</p>
          </div>
        </section>

        {!conta.cliente_id && (
          <Faixa tom="info">Seu pedido de socorro já funciona. O histórico da Tecnoar aparece assim que a conta for ligada ao seu cadastro.</Faixa>
        )}

        <CartaoModoApp />

        <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[16px] font-bold text-ink">Seus dados</h2>
            {!editando && (
              <button type="button" onClick={() => setEditando(true)} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-accent-ink hover:bg-accent-soft">
                <Pencil className="size-4" /> Editar
              </button>
            )}
          </div>
          {editando ? (
            <form onSubmit={enviar} className="flex flex-col gap-3.5">
              <CampoApp rotulo="Nome" icone={User} autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
              <CampoApp
                rotulo="Celular com DDD"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                icone={Phone}
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                dica="É o número que vai para o mecânico no pedido de socorro."
              />
              {erro && <Faixa tom="critico">{erro}</Faixa>}
              <div className="grid grid-cols-2 gap-2">
                <BotaoApp
                  variante="neutro"
                  onClick={() => {
                    setEditando(false)
                    setNome(conta.nome)
                    setTelefone(mascaraTelefone(conta.telefone ?? ''))
                    setErro(null)
                  }}
                >
                  Cancelar
                </BotaoApp>
                <BotaoApp type="submit" carregando={salvar.isPending} disabled={!online}>
                  Salvar
                </BotaoApp>
              </div>
            </form>
          ) : (
            <div className="flex flex-col divide-y divide-line dark:divide-white/10">
              <Dado icone={User} rotulo="Nome" valor={conta.nome} />
              <Dado icone={Phone} rotulo="Celular" valor={conta.telefone ? mascaraTelefone(conta.telefone) : 'Não informado'} />
              <Dado icone={Mail} rotulo="E-mail" valor={email ?? conta.email ?? 'Não informado'} />
            </div>
          )}
        </section>

        <GrupoLista rotulo="Mais opções">
          <LinhaLista para="/notificacoes" icone={Bell} titulo="Notificações" direita={naoLidas ? <Contador n={naoLidas} /> : undefined} />
          <LinhaLista para="/veiculos" icone={Truck} titulo="Meus veículos" />
          <LinhaLista para="/revisoes" icone={CalendarCheck} titulo="Revisões e agendamentos" />
          <LinhaLista para="/contato" icone={Headset} titulo="Falar com a Tecnoar" />
        </GrupoLista>

        <section className="flex flex-col gap-2" aria-labelledby="perfil-aparelho">
          <h2 id="perfil-aparelho" className="px-1 font-display text-[16px] font-bold text-ink">
            App e notificações
          </h2>
          <CartaoAparelho />
        </section>

        <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <h2 className="font-display text-[16px] font-bold text-ink">Aparência</h2>
          <Escolha<Tema>
            valor={tema}
            aoMudar={trocarTema}
            opcoes={[
              { valor: 'claro', rotulo: 'Claro', icone: Sun },
              { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
              { valor: 'sistema', rotulo: 'Auto', icone: Monitor },
            ]}
          />
          <p className="text-[12.5px] text-ink-3">O claro lê melhor ao sol; o escuro descansa a vista à noite.</p>
        </section>

        <GrupoLista rotulo="Privacidade e termos">
          <LinhaLista para="/privacidade" icone={ShieldCheck} titulo="Política de privacidade" />
          <LinhaLista para="/termos" icone={ScrollText} titulo="Termos de uso" />
        </GrupoLista>

        <BotaoApp variante="perigo" tamanho="lg" largo icone={LogOut} onClick={() => setConfirmarSaida(true)}>
          Sair da conta
        </BotaoApp>
        <button
          type="button"
          onClick={() => setExcluindo(true)}
          className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold text-crit-ink/85 transition-colors hover:bg-crit-soft active:bg-crit-soft"
        >
          <Trash2 className="size-4" /> Excluir minha conta
        </button>
      </Tela>

      <FolhaExcluirConta aberta={excluindo} aoFechar={() => setExcluindo(false)} empresa={info.data?.empresa ?? 'Tecnoar'} />

      <Folha
        aberta={confirmarSaida}
        aoFechar={() => setConfirmarSaida(false)}
        titulo="Sair da conta?"
        descricao="Para pedir socorro de novo, você vai precisar entrar com seu e-mail e senha."
        rodape={
          <>
            <BotaoApp
              variante="perigo"
              tamanho="lg"
              largo
              carregando={saindo}
              onClick={async () => {
                setSaindo(true)
                await sair()
              }}
            >
              Sair
            </BotaoApp>
            <BotaoApp variante="fantasma" largo onClick={() => setConfirmarSaida(false)}>
              Continuar conectado
            </BotaoApp>
          </>
        }
      />
    </>
  )
}

/**
 * Excluir a conta (LGPD). Diz com clareza o que some e o que fica — o
 * histórico de serviço é da empresa e continua, sem a ligação com a conta —
 * e pede a palavra EXCLUIR, que o banco confere de novo. Com socorro em
 * andamento o banco recusa; a folha avisa antes e mostra o caminho.
 */
function FolhaExcluirConta({ aberta, aoFechar, empresa }: { aberta: boolean; aoFechar: () => void; empresa: string }) {
  const navegar = useNavigate()
  const online = useOnline()
  const teclado = useAlturaTeclado()
  const home = useHomeCliente()
  const [palavra, setPalavra] = useState('')
  const ativo = home.data?.chamado_ativo ?? null
  const confere = palavra.trim().toUpperCase() === 'EXCLUIR'

  const excluir = useMutation({
    mutationFn: () => sosExcluirMinhaConta(palavra.trim().toUpperCase()),
    // A despedida é pública: ela encerra a sessão com a tela já trocada.
    onSuccess: () => navegar('/conta-excluida', { replace: true, state: { excluida: true } }),
  })

  function fechar() {
    if (excluir.isPending) return
    setPalavra('')
    excluir.reset()
    aoFechar()
  }

  const erro = excluir.isError ? (excluir.error as Error).message : null
  const emAndamento = !!ativo || (!!erro && /andamento/i.test(erro))

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo="Excluir sua conta?" descricao="A exclusão é imediata e não pode ser desfeita.">
      <div className="flex flex-col gap-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" style={teclado ? { paddingBottom: teclado } : undefined}>
        <section className="flex flex-col gap-2" aria-label="O que será apagado">
          <p className="flex items-center gap-2 text-[12.5px] font-extrabold tracking-wide text-crit-ink uppercase">
            <Trash2 className="size-4" /> Apagado agora
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] leading-snug text-ink-2">
            <li>seu acesso ao app (e-mail e senha) e o vínculo da conta;</li>
            <li>todo o trajeto de localização registrado nos socorros;</li>
            <li>as conversas com a Tecno IA;</li>
            <li>os links de acompanhamento que ainda estiverem ativos.</li>
          </ul>
        </section>
        <section className="sos-chip flex flex-col gap-2 rounded-2xl p-3.5" aria-label="O que continua">
          <p className="flex items-center gap-2 text-[12.5px] font-extrabold tracking-wide text-ink-2 uppercase">
            <Archive className="size-4" /> Continua com a {empresa}
          </p>
          <p className="text-[13.5px] leading-snug text-ink-2">
            Os registros dos serviços prestados — chamados, ordens de serviço, laudos e o cadastro de cliente usado neles — ficam guardados pelo prazo
            legal, sem ligação com a conta do app. <Link to="/privacidade" className="font-semibold text-accent-ink underline underline-offset-2">Saiba mais</Link>
          </p>
        </section>

        {emAndamento ? (
          <Faixa tom="critico" icone={Siren}>
            <p>{erro && /andamento/i.test(erro) ? erro : 'Você tem um socorro em andamento. Conclua ou cancele o socorro antes de excluir a conta.'}</p>
            {ativo && (
              <button
                type="button"
                onClick={() => navegar(`/chamado/${ativo.id}`)}
                className="mt-2 flex min-h-10 items-center gap-1.5 font-bold text-crit-ink underline underline-offset-2"
              >
                Ver o socorro {ativo.protocolo} <ChevronRight className="size-4" />
              </button>
            )}
          </Faixa>
        ) : (
          <>
            <CampoApp
              rotulo="Para confirmar, digite EXCLUIR"
              value={palavra}
              onChange={(e) => {
                setPalavra(e.target.value)
                if (excluir.isError) excluir.reset()
              }}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="EXCLUIR"
              dica="Em letras maiúsculas ou minúsculas, tanto faz."
            />
            {erro && <Faixa tom="critico">{erro}</Faixa>}
            {!online && <Faixa tom="atencao">Sem internet. A exclusão precisa de conexão.</Faixa>}
          </>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {!emAndamento && (
            <BotaoApp variante="perigo" tamanho="lg" largo icone={Trash2} disabled={!confere || !online} carregando={excluir.isPending} onClick={() => excluir.mutate()}>
              Excluir minha conta
            </BotaoApp>
          )}
          <BotaoApp variante="fantasma" largo disabled={excluir.isPending} onClick={fechar}>
            Manter minha conta
          </BotaoApp>
        </div>
      </div>
    </Folha>
  )
}

function Dado({ icone: Icone, rotulo, valor }: { icone: ComponentType<{ className?: string }>; rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icone className="size-5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-3">{rotulo}</p>
        <p className="truncate text-[15px] font-medium text-ink">{valor}</p>
      </div>
    </div>
  )
}

function Contador({ n }: { n: number }) {
  return <span className="num shrink-0 rounded-full bg-[#ff6600] px-2 text-[11.5px] leading-5 font-bold text-white">{n > 99 ? '99+' : n}</span>
}
