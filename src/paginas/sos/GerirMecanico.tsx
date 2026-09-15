import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Search, UserPlus } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Alternador, Campo, Entrada } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosCentralMecanico } from '@/sos/api'
import { SITUACOES_MECANICO } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { MecanicoMapa, SituacaoMecanico } from '@/sos/tipos'
import { ALVO_ALTERNADOR, Avatar } from './comum'

const ORDEM: SituacaoMecanico[] = ['disponivel', 'pausa', 'indisponivel', 'offline']

/**
 * A central mexe na ficha SOS do mecânico sem precisar do celular dele:
 * tirar de "disponível" quem saiu sem avisar (senão o despacho continua
 * mandando chamado), desligar o SOS de alguém, registrar a viatura.
 * Função, especialidades e dados pessoais continuam no cadastro do usuário
 * do Checklist — aqui só o que é do SOS.
 */
export function GerirMecanico({ mecanico, aoFechar }: { mecanico: MecanicoMapa | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [situacao, setSituacao] = useState<SituacaoMecanico>('offline')
  const [aceita, setAceita] = useState(true)
  const [viatura, setViatura] = useState('')
  const [telefone, setTelefone] = useState('')

  useEffect(() => {
    if (!mecanico) return
    setSituacao(mecanico.situacao === 'em_atendimento' ? 'em_atendimento' : mecanico.situacao)
    setAceita(mecanico.aceita_sos)
    setViatura(mecanico.veiculo_apoio ?? '')
    setTelefone(mecanico.telefone ?? '')
  }, [mecanico])

  const salvar = useMutation({
    mutationFn: () =>
      sosCentralMecanico(mecanico!.usuario_id, {
        ...(situacao !== 'em_atendimento' ? { situacao } : {}),
        aceita_sos: aceita,
        veiculo_apoio: viatura.trim() || null,
        telefone: telefone.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.mecanicos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.indicadores })
      toast.ok('Mecânico atualizado', `${mecanico?.nome} — ${SITUACOES_MECANICO[situacao].rotulo}.`)
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', (e as Error).message),
  })

  const emAtendimento = mecanico?.situacao === 'em_atendimento'

  return (
    <Modal
      aberto={!!mecanico}
      aoFechar={aoFechar}
      titulo="Gerenciar mecânico no SOS"
      descricao="Situação e dados de campo. Função e especialidades ficam no cadastro do usuário."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Botao>
        </>
      }
    >
      {mecanico && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar nome={mecanico.nome} url={mecanico.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{mecanico.nome}</p>
              <p className="truncate text-[12.5px] text-ink-3">{mecanico.especialidades || 'Sem especialidades cadastradas'}</p>
            </div>
            <Link
              to="/cadastros/usuarios"
              className="flex min-h-11 shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-cyan-ink hover:underline sm:min-h-8"
            >
              Cadastro <ExternalLink className="size-3.5" />
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <span className="lbl">Situação</span>
            {emAtendimento ? (
              <p className="rounded-md bg-cyan-soft px-3 py-2.5 text-[13px] text-cyan-ink">
                Está num atendimento. Para liberar, troque o mecânico do chamado ou aguarde a finalização.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ORDEM.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={situacao === s}
                    onClick={() => setSituacao(s)}
                    className={cn(
                      'flex min-h-11 items-center justify-center gap-2 rounded-md border px-2 text-[13px] font-medium transition-colors',
                      situacao === s ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
                    )}
                  >
                    <span aria-hidden className={cn('size-2 rounded-full', SITUACOES_MECANICO[s].ponto)} />
                    {SITUACOES_MECANICO[s].rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-line px-3.5 py-3">
            <div>
              <p className="text-[13.5px] font-medium text-ink">Recebe chamados do SOS</p>
              <p className="text-[12px] text-ink-3">Desligado, não entra no despacho nem é avisado.</p>
            </div>
            <span className={cn('flex shrink-0 items-center', ALVO_ALTERNADOR)}>
              <Alternador ativo={aceita} onChange={setAceita} rotulo="Recebe chamados do SOS" />
            </span>
          </div>

          <Campo rotulo="Viatura de apoio" dica="Aparece para o cliente quando o mecânico está a caminho.">
            {(p) => <Entrada {...p} value={viatura} onChange={(e) => setViatura(e.target.value)} placeholder="Ex.: Strada branca ABC1D23" />}
          </Campo>
          <Campo rotulo="Telefone de campo" dica="Se vazio, usa o telefone do cadastro do usuário.">
            {(p) => <Entrada {...p} type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-0000" />}
          </Campo>
        </div>
      )}
    </Modal>
  )
}

const db = supabase as unknown as SupabaseClient

/**
 * Incluir no SOS um usuário cuja função não é de mecânico (supervisor que
 * também atende socorro, eletricista de outra equipe). Quem já tem função de
 * mecânico entra sozinho — esta lista mostra só os demais.
 */
export function IncluirMecanico({ aberto, aoFechar, jaNoSos }: { aberto: boolean; aoFechar: () => void; jaNoSos: Set<string> }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useState('')

  const usuarios = useQuery({
    queryKey: ['sos', 'usuarios-para-incluir'],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await db
        .from('usuarios')
        .select('id, nome_completo, avatar_url, funcao:funcoes ( nome )')
        .eq('situacao', 'ativo')
        .order('nome_completo')
      if (error) throw error
      return (data ?? []) as unknown as Array<{ id: string; nome_completo: string; avatar_url: string | null; funcao: { nome: string } | null }>
    },
  })

  const incluir = useMutation({
    mutationFn: (id: string) => sosCentralMecanico(id, { situacao: 'offline', aceita_sos: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.mecanicos })
      toast.ok('Incluído no SOS', 'Ele passa a ver o painel de mecânico no app e pode ficar disponível.')
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível incluir', (e as Error).message),
  })

  const termo = busca.trim().toLowerCase()
  const lista = (usuarios.data ?? []).filter((u) => !jaNoSos.has(u.id) && (!termo || u.nome_completo.toLowerCase().includes(termo)))

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Incluir usuário no SOS" descricao="Para quem atende socorro sem ter função de mecânico.">
      <div className="flex flex-col gap-3">
        <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar usuário" aria-label="Buscar usuário" iconeInicio={<Search />} />
        {usuarios.isError && <p className="text-[13px] text-crit-ink">{(usuarios.error as Error).message}</p>}
        <ul className="flex max-h-[50vh] flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {lista.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-3">{usuarios.isLoading ? 'Carregando…' : 'Ninguém para incluir.'}</li>}
          {lista.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <Avatar nome={u.nome_completo} url={u.avatar_url} tamanho="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{u.nome_completo}</p>
                <p className="truncate text-[11.5px] text-ink-3">{u.funcao?.nome ?? 'Sem função'}</p>
              </div>
              <Botao tamanho="sm" variante="secundario" iconeInicio={<UserPlus />} carregando={incluir.isPending && incluir.variables === u.id} onClick={() => incluir.mutate(u.id)} className="shrink-0 max-sm:h-11">
                Incluir
              </Botao>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
