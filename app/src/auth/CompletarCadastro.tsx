import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, CreditCard, LogOut, MapPin, Phone, Truck, User } from 'lucide-react'
import { mascaraDocumento, mascaraPlaca, mascaraTelefone } from '@/lib/formatos'
import { cn } from '@/lib/utils'
import { sosAtualizarConta, sosCadastrarVeiculo, sosRegistrarConta } from '@/sos/api'
import { posicaoAtual } from '@/sos/geo'
import { ROTULO_TIPO_VEICULO } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { ativarNotificacoes } from '@/notificacoes/sistema'
import { useSessao } from '../sessao'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { FolhaLegal } from '../cliente/legal/DocumentoLegal'
import type { TipoDocumentoLegal } from '../cliente/legal/textos'
import { MolduraAcesso } from './Moldura'

type Passo = 'dados' | 'veiculo' | 'permissoes'

/**
 * Primeiro acesso do cliente. Três passos curtos, cada um com um motivo
 * dito na tela: ninguém entrega celular, placa e localização sem saber por quê.
 *
 * O banco acha o cadastro que já existe na Tecnoar (por CPF/CNPJ ou celular)
 * e amarra a conta a ele — quem já é cliente vê o próprio histórico na hora.
 */
export function CompletarCadastro() {
  const { papel, usuarioId, sair } = useSessao()
  const qc = useQueryClient()
  const inicial = papel?.papel === 'novo' ? papel.nome ?? '' : ''
  const [passo, setPasso] = useState<Passo>('dados')
  const [nome, setNome] = useState(inicial)
  const [telefone, setTelefone] = useState('')
  const [documento, setDocumento] = useState('')
  const [aceite, setAceite] = useState(false)
  const [placa, setPlaca] = useState('')
  const [tipo, setTipo] = useState('cavalo')
  const [modelo, setModelo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [local, setLocal] = useState<'pendente' | 'ok' | 'negado'>('pendente')
  const [avisos, setAvisos] = useState<'pendente' | 'ok' | 'negado'>('pendente')
  // Termos e política abrem numa folha por cima: o que já foi digitado fica.
  const [legal, setLegal] = useState<TipoDocumentoLegal | null>(null)

  async function salvarDados(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!aceite) return setErro('Para continuar, aceite os termos e a política de privacidade.')
    setOcupado(true)
    try {
      await sosRegistrarConta({ nome, telefone, documento: documento || null, aceiteTermos: true })
      setPasso('veiculo')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function salvarVeiculo(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const limpa = placa.replace(/[^A-Za-z0-9]/g, '')
    if (limpa.length !== 7) return setErro('A placa tem 7 caracteres (ex.: ABC1D23).')
    setOcupado(true)
    try {
      await sosCadastrarVeiculo(limpa, modelo || null, tipo)
      setPasso('permissoes')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function pedirLocalizacao() {
    try {
      await posicaoAtual({ timeoutMs: 12000 })
      await sosAtualizarConta({ aceiteLocalizacao: true }).catch(() => {})
      setLocal('ok')
    } catch {
      setLocal('negado')
    }
  }

  async function pedirAvisos() {
    if (!usuarioId) return
    const r = await ativarNotificacoes(usuarioId)
    setAvisos(r === 'ativadas' ? 'ok' : 'negado')
  }

  async function concluir() {
    // O papel muda de "novo" para "cliente": o roteador leva para a Home.
    await qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
  }

  const etapas: Array<{ id: Passo; rotulo: string }> = [
    { id: 'dados', rotulo: 'Seus dados' },
    { id: 'veiculo', rotulo: 'Veículo' },
    { id: 'permissoes', rotulo: 'Avisos' },
  ]
  const indice = etapas.findIndex((e) => e.id === passo)

  return (
    <MolduraAcesso
      titulo={passo === 'dados' ? 'Quase lá' : passo === 'veiculo' ? 'Seu veículo' : 'Tudo pronto'}
      subtitulo={
        passo === 'dados'
          ? 'Com o CPF/CNPJ ou o celular, achamos seu cadastro na Tecnoar e trazemos seus veículos e o histórico.'
          : passo === 'veiculo'
            ? 'Com a placa cadastrada, o pedido de socorro sai com um toque.'
            : 'Duas permissões que fazem o socorro chegar mais rápido.'
      }
      rodape={
        <div className="flex flex-col gap-3">
          {/* Pessoa da equipe no "modo cliente" sem conta de cliente: sair volta
              ao app do mecânico (o modo se desfaz ao sair). */}
          <button type="button" onClick={() => void sair()} className="flex min-h-11 w-full items-center justify-center gap-2 text-[14px] font-semibold text-ink-3">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      }
    >
      <ol className="flex items-center gap-2" aria-label="Etapas do cadastro">
        {etapas.map((e, i) => (
          <li key={e.id} className="flex flex-1 flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', i <= indice ? 'bg-accent' : 'bg-line')} />
            <span className={cn('text-[11.5px] font-semibold', i <= indice ? 'text-ink' : 'text-ink-3')}>{e.rotulo}</span>
          </li>
        ))}
      </ol>

      {passo === 'dados' && (
        <form onSubmit={(e) => void salvarDados(e)} className="flex flex-col gap-4">
          <CampoApp rotulo="Nome completo" autoComplete="name" icone={User} value={nome} onChange={(e) => setNome(e.target.value)} required />
          <CampoApp
            rotulo="Celular com DDD"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            icone={Phone}
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            dica="É por ele que o mecânico fala com você."
            required
          />
          <CampoApp
            rotulo="CPF ou CNPJ (opcional)"
            inputMode="numeric"
            icone={CreditCard}
            value={documento}
            onChange={(e) => setDocumento(mascaraDocumento(e.target.value))}
            dica="Liga sua conta ao histórico existente."
          />
          <label className="sos-chip flex items-start gap-3 rounded-xl p-3.5">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--c-accent)]" />
            <span className="text-[13.5px] leading-relaxed text-ink-2">
              Li e aceito os{' '}
              <button type="button" onClick={() => setLegal('termos')} className="font-semibold text-accent-ink underline underline-offset-2">
                termos de uso
              </button>{' '}
              e a{' '}
              <button type="button" onClick={() => setLegal('privacidade')} className="font-semibold text-accent-ink underline underline-offset-2">
                política de privacidade
              </button>
              . Minha localização só é usada durante um pedido de socorro.
            </span>
          </label>
          {erro && <Faixa tom="critico">{erro}</Faixa>}
          <BotaoApp type="submit" tamanho="lg" largo carregando={ocupado}>
            Continuar
          </BotaoApp>
        </form>
      )}

      {passo === 'veiculo' && (
        <form onSubmit={(e) => void salvarVeiculo(e)} className="flex flex-col gap-4">
          <CampoApp
            rotulo="Placa"
            autoCapitalize="characters"
            icone={Truck}
            value={placa}
            onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
            placeholder="ABC1D23"
            required
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Tipo</span>
            <div className="grid grid-cols-3 gap-2">
              {['cavalo', 'truck', 'toco', 'carreta', 'onibus', 'utilitario'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    'min-h-12 rounded-xl border px-2 text-[13px] font-semibold transition-all',
                    tipo === t ? 'border-accent bg-accent-soft text-accent-ink shadow-[0_10px_24px_-18px_rgb(252_100_0/0.75)]' : 'sos-chip text-ink-2',
                  )}
                >
                  {ROTULO_TIPO_VEICULO[t]}
                </button>
              ))}
            </div>
          </div>
          <CampoApp rotulo="Marca e modelo (opcional)" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: Volvo FH 540" />
          {erro && <Faixa tom="critico">{erro}</Faixa>}
          <BotaoApp type="submit" tamanho="lg" largo carregando={ocupado}>
            Salvar veículo
          </BotaoApp>
          <button type="button" onClick={() => setPasso('permissoes')} className="min-h-12 text-[14px] font-semibold text-ink-3">
            Pular por enquanto
          </button>
        </form>
      )}

      {passo === 'permissoes' && (
        <div className="flex flex-col gap-3">
          <Permissao
            icone={MapPin}
            titulo="Localização"
            texto="Para o mecânico achar você na estrada. Usada só durante um socorro."
            estado={local}
            aoPedir={() => void pedirLocalizacao()}
          />
          <Permissao
            icone={BellRing}
            titulo="Notificações"
            texto="Aviso quando o mecânico aceitar, estiver chegando e quando a revisão vencer."
            estado={avisos}
            aoPedir={() => void pedirAvisos()}
          />
          <BotaoApp tamanho="lg" largo className="mt-2" onClick={() => void concluir()}>
            Começar a usar
          </BotaoApp>
        </div>
      )}
      <FolhaLegal tipo={legal} aoFechar={() => setLegal(null)} />
    </MolduraAcesso>
  )
}

function Permissao({
  icone: Icone,
  titulo,
  texto,
  estado,
  aoPedir,
}: {
  icone: typeof MapPin
  titulo: string
  texto: string
  estado: 'pendente' | 'ok' | 'negado'
  aoPedir: () => void
}) {
  return (
    <div className="sos-card flex items-center gap-3 rounded-[1.35rem] p-4">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', estado === 'ok' ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent')}>
        {estado === 'ok' ? <Check className="size-5" /> : <Icone className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold text-ink">{titulo}</p>
        <p className="text-[12.5px] leading-snug text-ink-2">
          {estado === 'negado' ? 'Bloqueada. Você pode liberar depois nas configurações do celular.' : texto}
        </p>
      </div>
      {estado === 'pendente' && (
        <BotaoApp tamanho="md" variante="neutro" onClick={aoPedir}>
          Permitir
        </BotaoApp>
      )}
    </div>
  )
}
