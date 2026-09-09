import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { AvariaVeiculo, TipoAvaria, TipoVeiculo } from '@/tipos/db'

/**
 * Legenda de avarias.
 *
 * Seis tipos fechados, os mesmos que o setor usa no papel. A cor é só apoio de
 * leitura — quem manda é o rótulo, porque o documento impresso sai em preto e
 * branco e precisa continuar legível.
 */
export const LEGENDA_AVARIAS: Array<{
  valor: TipoAvaria
  rotulo: string
  sigla: string
  classe: string
}> = [
  { valor: 'batido', rotulo: 'Batido', sigla: 'B', classe: 'border-crit/50 bg-crit-soft text-crit-ink' },
  { valor: 'riscado', rotulo: 'Riscado', sigla: 'R', classe: 'border-warn/50 bg-warn-soft text-warn-ink' },
  { valor: 'amassado', rotulo: 'Amassado', sigla: 'A', classe: 'border-accent/50 bg-accent-soft text-accent-ink' },
  { valor: 'quebrado', rotulo: 'Quebrado', sigla: 'Q', classe: 'border-crit/50 bg-crit-soft text-crit-ink' },
  { valor: 'faltante', rotulo: 'Faltante', sigla: 'F', classe: 'border-ink-3/40 bg-ink-3/10 text-ink-2' },
  { valor: 'trincado', rotulo: 'Trincado', sigla: 'T', classe: 'border-cyan/50 bg-cyan-soft text-cyan-ink' },
]

const MAPA_LEGENDA = Object.fromEntries(LEGENDA_AVARIAS.map((l) => [l.valor, l])) as Record<
  TipoAvaria,
  (typeof LEGENDA_AVARIAS)[number]
>

/** Posições por tipo de veículo. Caminhão não tem porta-malas; carreta não tem cabine. */
const POSICOES_CAVALO = [
  'Para-choque dianteiro',
  'Capô',
  'Para-brisa',
  'Cabine — lateral esquerda',
  'Cabine — lateral direita',
  'Porta esquerda',
  'Porta direita',
  'Teto da cabine',
  'Defletor',
  'Tanque esquerdo',
  'Tanque direito',
  'Para-lama',
  'Quinta roda',
  'Rodas e pneus',
  'Traseira da cabine',
]

const POSICOES_CARRETA = [
  'Dianteira do implemento',
  'Lateral esquerda',
  'Lateral direita',
  'Traseira',
  'Porta traseira',
  'Assoalho',
  'Teto / lona',
  'Para-lamas',
  'Rodas e pneus',
  'Para-choque traseiro',
  'Suspensão',
]

const POSICOES_GERAIS = [
  'Frente',
  'Traseira',
  'Lateral esquerda',
  'Lateral direita',
  'Teto',
  'Vidros',
  'Rodas e pneus',
  'Interior',
]

function posicoesPara(tipo: TipoVeiculo | null): string[] {
  if (tipo === 'cavalo' || tipo === 'truck' || tipo === 'toco') return POSICOES_CAVALO
  if (tipo === 'carreta' || tipo === 'bitrem' || tipo === 'rodotrem' || tipo === 'vanderleia') return POSICOES_CARRETA
  return POSICOES_GERAIS
}

/**
 * Mapa de avarias de entrada.
 *
 * Registra o estado em que o veículo chegou, por posição. Existe para a
 * oficina não ser responsabilizada por dano que já veio — e por isso o
 * registro é feito na entrada, com foto, e vai impresso no checklist.
 */
export function MapaAvarias({
  checklistId,
  veiculoId,
  tipoVeiculo,
  editavel,
}: {
  checklistId: string
  veiculoId: string | null
  tipoVeiculo: TipoVeiculo | null
  editavel: boolean
}) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [posicao, setPosicao] = useState('')
  const [tipo, setTipo] = useState<TipoAvaria>('riscado')
  const [observacao, setObservacao] = useState('')

  const posicoes = posicoesPara(tipoVeiculo)

  const avarias = useQuery({
    queryKey: ['avarias', checklistId],
    queryFn: async (): Promise<AvariaVeiculo[]> => {
      const { data, error } = await supabase
        .from('avarias_veiculo')
        .select('*')
        .eq('checklist_id', checklistId)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })

  const registrar = useMutation({
    mutationFn: async () => {
      if (!posicao) throw new Error('Escolha a posição no veículo.')
      const { error } = await supabase.from('avarias_veiculo').insert({
        checklist_id: checklistId,
        veiculo_id: veiculoId,
        posicao,
        tipo,
        observacao: observacao.trim() || null,
        registrado_por: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Avaria registrada')
      setObservacao('')
      void qc.invalidateQueries({ queryKey: ['avarias', checklistId] })
    },
    onError: (e) => toast.erro('Não foi possível registrar', mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('avarias_veiculo').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['avarias', checklistId] }),
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  /* Agrupa por posição para a leitura ser "o que há em cada parte do veículo". */
  const porPosicao = new Map<string, AvariaVeiculo[]>()
  for (const a of avarias.data ?? []) {
    porPosicao.set(a.posicao, [...(porPosicao.get(a.posicao) ?? []), a])
  }

  return (
    <Painel semPadding>
      <CabecalhoPainel
        titulo="Avarias na entrada"
        descricao="Estado em que o veículo chegou. Vai impresso no Checklist de Entrada."
        acao={
          (avarias.data?.length ?? 0) > 0 ? (
            <span className="num text-[12px] text-ink-3">{avarias.data?.length} registro(s)</span>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 p-5">
        {/* legenda */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="lbl">Legenda</span>
          {LEGENDA_AVARIAS.map((l) => (
            <span
              key={l.valor}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium',
                l.classe,
              )}
            >
              <span className="num font-bold">{l.sigla}</span>
              {l.rotulo}
            </span>
          ))}
        </div>

        {editavel && (
          <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-4 sm:grid-cols-12">
            <Campo className="sm:col-span-5" rotulo="Posição no veículo" obrigatorio>
              {(p) => (
                <Selecao {...p} value={posicao} onChange={(e) => setPosicao(e.target.value)}>
                  <option value="">Selecione</option>
                  {posicoes.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-3" rotulo="Tipo de avaria">
              {(p) => (
                <Selecao {...p} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAvaria)}>
                  {LEGENDA_AVARIAS.map((l) => (
                    <option key={l.valor} value={l.valor}>{l.rotulo}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Observação">
              {(p) => (
                <Entrada
                  {...p}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: risco de 20 cm acima do estribo"
                />
              )}
            </Campo>
            <div className="flex items-end sm:col-span-12">
              <Botao
                variante="secundario"
                iconeInicio={<Plus />}
                carregando={registrar.isPending}
                onClick={() => registrar.mutate()}
              >
                Registrar avaria
              </Botao>
            </div>
          </div>
        )}

        {(avarias.data?.length ?? 0) === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma avaria registrada"
            descricao={
              editavel
                ? 'Registre o que o veículo já trouxe de dano. Sem registro na entrada, a oficina responde depois.'
                : 'Nada foi apontado na entrada deste veículo.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {[...porPosicao.entries()].map(([pos, itens]) => (
              <li key={pos} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                <span className="text-[12.5px] font-medium text-ink">{pos}</span>
                <ul className="flex flex-col gap-1">
                  {itens.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <Selo tom={a.tipo === 'faltante' ? 'neutro' : 'critico'}>{MAPA_LEGENDA[a.tipo].rotulo}</Selo>
                      <span className="min-w-0 flex-1 text-ink-2">{a.observacao || '—'}</span>
                      {editavel && (
                        <BotaoIcone
                          rotulo={`Remover avaria em ${pos}`}
                          variante="fantasma"
                          tamanho="sm"
                          onClick={() => remover.mutate(a.id)}
                        >
                          <Trash2 />
                        </BotaoIcone>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Painel>
  )
}
