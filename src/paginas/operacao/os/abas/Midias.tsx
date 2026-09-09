import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, ImageUp, Link2, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Selecao } from '@/componentes/ui/Campo'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { enfileirar } from '@/dados/filaEnvios'
import type { Evidencia } from '@/componentes/ui/Evidencias'
import type { OSCompleta } from '../useOS'

const LIMITE_BYTES = 25 * 1024 * 1024

/**
 * As posições da vistoria fotográfica de entrada.
 *
 * A ordem é a da volta que o conferente dá no veículo — frente, contorna pela
 * direita, traseira, volta pela esquerda — e só então os detalhes. Fotografar
 * na ordem evita esquecer um lado.
 */
const SLOTS = [
  { id: 'Principal', rotulo: 'Principal', obrigatorio: true },
  { id: 'Frente', rotulo: 'Frente', obrigatorio: true },
  { id: 'Diagonal dianteira direita', rotulo: 'Diagonal dianteira direita', obrigatorio: true },
  { id: 'Lateral direita', rotulo: 'Lateral direita', obrigatorio: true },
  { id: 'Diagonal traseira direita', rotulo: 'Diagonal traseira direita', obrigatorio: true },
  { id: 'Traseira', rotulo: 'Traseira', obrigatorio: true },
  { id: 'Diagonal traseira esquerda', rotulo: 'Diagonal traseira esquerda', obrigatorio: true },
  { id: 'Lateral esquerda', rotulo: 'Lateral esquerda', obrigatorio: true },
  { id: 'Diagonal dianteira esquerda', rotulo: 'Diagonal dianteira esquerda', obrigatorio: true },
  { id: 'Teto', rotulo: 'Teto', obrigatorio: false },
  { id: 'Porta-malas', rotulo: 'Porta-malas', obrigatorio: false },
  { id: 'Painel', rotulo: 'Painel', obrigatorio: true },
  { id: 'Placa', rotulo: 'Placa', obrigatorio: true },
] as const

interface ItemChecklistMidia {
  id: string
  checklist_id: string
  secao: string
  texto: string
}

/**
 * Fotos de entrada da OS.
 *
 * Cada posição é uma vaga fixa: ou tem foto, ou está vazia e o contador diz
 * quantas faltam. Nada de galeria solta onde ninguém sabe se a lateral
 * esquerda foi registrada.
 */
export function AbaMidias({ ordem, podeEditar }: { ordem: OSCompleta; podeEditar: boolean }) {
  const qc = useQueryClient()

  const fotos = useQuery({
    queryKey: ['os-fotos-entrada', ordem.id],
    queryFn: async (): Promise<Evidencia[]> => {
      const { data, error } = await supabase
        .from('evidencias')
        .select('*')
        .eq('entidade', 'ordens_servico')
        .eq('entidade_id', ordem.id)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as Evidencia[]
    },
  })

  const itensChecklist = useQuery({
    queryKey: ['os-itens-checklist-vinculo', ordem.id],
    queryFn: async (): Promise<ItemChecklistMidia[]> => {
      const { data: checklists, error: erroChecklists } = await supabase
        .from('checklists')
        .select('id')
        .eq('os_id', ordem.id)
      if (erroChecklists) throw erroChecklists
      const ids = (checklists ?? []).map((c) => c.id)
      if (ids.length === 0) return []

      const { data, error } = await supabase
        .from('checklist_respostas')
        .select('id, checklist_id, secao, texto')
        .in('checklist_id', ids)
        .order('secao')
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  /* Uma vaga guarda no máximo uma foto: a mais recente daquela posição. */
  const porSlot = new Map<string, Evidencia>()
  for (const f of fotos.data ?? []) {
    if (f.categoria && SLOTS.some((s) => s.id === f.categoria)) porSlot.set(f.categoria, f)
  }

  /* O contador conta vagas preenchidas sobre o total de vagas — é o número
     que o conferente confere de relance. A pendência de obrigatórias é dita
     separadamente, porque teto e porta-malas nem sempre se aplicam. */
  const preenchidas = SLOTS.filter((s) => porSlot.has(s.id)).length
  const faltamObrigatorias = SLOTS.filter((s) => s.obrigatorio && !porSlot.has(s.id)).length
  const invalidar = () => void qc.invalidateQueries({ queryKey: ['os-fotos-entrada', ordem.id] })

  return (
    <div className="flex flex-col gap-4">
      <Painel semPadding>
        <CabecalhoPainel
          titulo={`Fotos de entrada ${preenchidas}/${SLOTS.length}`}
          descricao="Vistoria fotográfica do veículo como ele chegou. Principal funciona como capa; as demais seguem a volta técnica."
          acao={
            faltamObrigatorias === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok-soft px-2.5 py-1 text-[11.5px] font-medium text-ok-ink">
                <CheckCircle2 aria-hidden className="size-3.5" />
                Obrigatórias completas
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent-ink">
                Faltam {faltamObrigatorias} obrigatória(s)
              </span>
            )
          }
        />

        <div className="p-5">
          {fotos.isLoading ? (
            <EstadoCarregando rotulo="Carregando fotos…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {SLOTS.map((s) => (
                <SlotFoto
                  key={s.id}
                  osId={ordem.id}
                  slot={s.id}
                  rotulo={s.rotulo}
                  obrigatorio={s.obrigatorio}
                  foto={porSlot.get(s.id) ?? null}
                  podeEditar={podeEditar}
                  aoMudar={invalidar}
                  itensChecklist={itensChecklist.data ?? []}
                  contexto={{
                    os_numero: ordem.numero,
                    placa: ordem.veiculo?.placa,
                    cliente: ordem.cliente?.nome_razao,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Painel>

      {/* Fotos que não cabem numa vaga fixa continuam tendo lugar. */}
      <Evidencias
        entidade="ordens_servico"
        entidadeId={ordem.id}
        ocultarCategorias={SLOTS.map((s) => s.id)}
        categorias={['Diagnóstico', 'Durante', 'Depois', 'Peça', 'Documento', 'Outras']}
        somenteLeitura={!podeEditar}
        titulo="Outras mídias da OS"
        descricao="Diagnóstico, execução, peças e documentos — fora da vistoria de entrada."
        contexto={{ os_numero: ordem.numero, placa: ordem.veiculo?.placa }}
      />
    </div>
  )
}

/* --------------------------------------------------------------- uma vaga */

function SlotFoto({
  osId,
  slot,
  rotulo,
  obrigatorio,
  foto,
  podeEditar,
  aoMudar,
  itensChecklist,
  contexto,
}: {
  osId: string
  slot: string
  rotulo: string
  obrigatorio: boolean
  foto: Evidencia | null
  podeEditar: boolean
  aoMudar: () => void
  itensChecklist: ItemChecklistMidia[]
  contexto: Record<string, unknown>
}) {
  const { usuario } = useAuth()
  const toast = useToast()
  const camera = useRef<HTMLInputElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const [editandoNota, setEditandoNota] = useState(false)
  const [nota, setNota] = useState(foto?.descricao ?? '')
  const contextoFoto = (foto?.contexto && typeof foto.contexto === 'object' ? foto.contexto : {}) as Record<string, unknown>
  const [itemVinculado, setItemVinculado] = useState(String(contextoFoto.checklist_item_id ?? ''))

  const url = useQuery({
    queryKey: ['foto-url', foto?.id],
    enabled: Boolean(foto),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(foto!.caminho, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  const enviar = useMutation({
    mutationFn: async (f: File) => {
      if (f.size > LIMITE_BYTES) throw new Error(`"${f.name}" passa de 25 MB.`)
      const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const caminho = `ordens_servico/${osId}/${crypto.randomUUID()}.${ext}`

      const item = itensChecklist.find((i) => i.id === itemVinculado)
      const contextoCompleto = {
        ...contexto,
        slot,
        registrado_por_nome: usuario?.nome_completo,
        checklist_item_id: item?.id ?? null,
        checklist_item_texto: item?.texto ?? null,
        checklist_secao: item?.secao ?? null,
      }

      const registro = {
        entidade: 'ordens_servico',
        entidade_id: osId,
        categoria: slot,
        tipo: 'foto',
        caminho,
        nome_arquivo: f.name,
        tamanho_bytes: f.size,
        contexto: contextoCompleto,
        criado_por: usuario?.id ?? null,
      }

      /* Sem rede, a foto vai para a fila e o operador continua trabalhando.
         Ela não é dada como salva: o aviso de pendências fica visível. */
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enfileirar({
          caminho,
          arquivo: f,
          nomeArquivo: f.name,
          tipoMime: f.type,
          tamanho: f.size,
          registro,
        })
        return { enfileirado: true }
      }

      const { error: erroUp } = await supabase.storage
        .from('evidencias')
        .upload(caminho, f, { contentType: f.type })
      if (erroUp) {
        await enfileirar({
          caminho,
          arquivo: f,
          nomeArquivo: f.name,
          tipoMime: f.type,
          tamanho: f.size,
          registro,
        })
        return { enfileirado: true }
      }

      /* Substituir é trocar de verdade: a foto antiga sai do storage e da
         tabela, senão a vaga acumula lixo invisível. */
      if (foto) {
        await supabase.storage.from('evidencias').remove([foto.caminho])
        await supabase.from('evidencias').delete().eq('id', foto.id)
      }

      const { error } = await supabase.from('evidencias').insert(registro as never)
      if (error) throw error
      return { enfileirado: false }
    },
    onSuccess: (r) => {
      if (r.enfileirado) {
        toast.ok(`${rotulo} guardada`, 'Sem conexão agora. Ela sobe assim que o sinal voltar.')
      } else {
        toast.ok(`${rotulo} registrada`)
      }
      aoMudar()
    },
    onError: (e) => toast.erro('Falha ao enviar', mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async () => {
      await supabase.storage.from('evidencias').remove([foto!.caminho])
      const { error } = await supabase.from('evidencias').delete().eq('id', foto!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Foto removida')
      aoMudar()
    },
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  const salvarNota = useMutation({
    mutationFn: async () => {
      const item = itensChecklist.find((i) => i.id === itemVinculado)
      const contextoAtualizado = {
        ...contextoFoto,
        checklist_item_id: item?.id ?? null,
        checklist_item_texto: item?.texto ?? null,
        checklist_secao: item?.secao ?? null,
      }
      const { error } = await supabase
        .from('evidencias')
        .update({ descricao: nota.trim() || null, contexto: contextoAtualizado })
        .eq('id', foto!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Observação salva')
      setEditandoNota(false)
      aoMudar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const ocupada = Boolean(foto)

  return (
    <>
      <div
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-lg border bg-surface',
          ocupada ? 'border-line' : obrigatorio ? 'border-dashed border-accent/40' : 'border-dashed border-line-strong',
        )}
      >
        <div className="relative aspect-[4/3] bg-inset">
          {ocupada ? (
            url.isLoading ? (
              <span className="flex h-full items-center justify-center">
                <Loader2 aria-hidden className="size-5 animate-spin text-ink-3" />
              </span>
            ) : (
              <img src={url.data} alt={rotulo} className="size-full object-cover" loading="lazy" />
            )
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1.5 text-ink-3">
              <ImageUp aria-hidden className="size-6" />
              <span className="text-[10.5px]">{obrigatorio ? 'Obrigatória' : 'Opcional'}</span>
            </span>
          )}

          {enviar.isPending && (
            <span className="absolute inset-0 flex items-center justify-center bg-overlay">
              <Loader2 aria-hidden className="size-6 animate-spin text-white" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 p-2.5">
          <span className="truncate text-[11.5px] leading-tight font-medium text-ink">{rotulo}</span>

          {foto ? (
            <>
              {foto.descricao && (
                <span className="line-clamp-2 text-[10.5px] leading-snug text-ink-2">{foto.descricao}</span>
              )}
              {contextoFoto.checklist_item_texto && (
                <span className="inline-flex items-center gap-1 truncate text-[10px] text-cyan-ink">
                  <Link2 aria-hidden className="size-3" />
                  {String(contextoFoto.checklist_item_texto)}
                </span>
              )}
              <span className="num text-[9.5px] text-ink-3">
                {dataHora(foto.created_at)}
                {contextoFoto.registrado_por_nome ? ` · ${String(contextoFoto.registrado_por_nome)}` : ''}
              </span>
            </>
          ) : (
            <span className="text-[10.5px] text-ink-3">Sem foto</span>
          )}

          {podeEditar && (
            <div className="mt-1 flex flex-wrap gap-1">
              {/* No celular abre a câmera traseira; no desktop cai no seletor. */}
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) enviar.mutate(f)
                  e.target.value = ''
                }}
              />
              <input
                ref={arquivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) enviar.mutate(f)
                  e.target.value = ''
                }}
              />

              <Botao
                tamanho="sm"
                variante="fantasma"
                iconeInicio={<Camera />}
                onClick={() => camera.current?.click()}
                className="px-1.5 sm:hidden"
              >
                {ocupada ? 'Trocar' : 'Foto'}
              </Botao>
              <Botao
                tamanho="sm"
                variante="fantasma"
                iconeInicio={<Upload />}
                onClick={() => arquivo.current?.click()}
                className="hidden px-1.5 sm:inline-flex"
              >
                {ocupada ? 'Trocar' : 'Enviar'}
              </Botao>

              {ocupada && (
                <>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    iconeInicio={<Pencil />}
                    onClick={() => { setNota(foto?.descricao ?? ''); setEditandoNota(true) }}
                    className="px-1.5"
                  >
                    <span className="sr-only">Observação de {rotulo}</span>
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    iconeInicio={<Trash2 />}
                    carregando={remover.isPending}
                    onClick={() => remover.mutate()}
                    className="px-1.5"
                  >
                    <span className="sr-only">Remover {rotulo}</span>
                  </Botao>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        aberto={editandoNota}
        aoFechar={() => setEditandoNota(false)}
        titulo={`Observação — ${rotulo}`}
        descricao="Uma linha sobre o que a foto mostra."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setEditandoNota(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarNota.isPending} onClick={() => salvarNota.mutate()}>
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo="Observação">
            {(p) => (
              <AreaTexto
                {...p}
                rows={3}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ex.: risco no para-choque já existente na entrada."
              />
            )}
          </Campo>
          <Campo rotulo="Vincular ao item do checklist">
            {(p) => (
              <Selecao {...p} value={itemVinculado} onChange={(e) => setItemVinculado(e.target.value)}>
                <option value="">Sem vínculo</option>
                {itensChecklist.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.secao} · {item.texto}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          {foto && (
            <Aviso tom="info">
              Registrada em {dataHora(foto.created_at)}.
            </Aviso>
          )}
        </div>
      </Modal>
    </>
  )
}
