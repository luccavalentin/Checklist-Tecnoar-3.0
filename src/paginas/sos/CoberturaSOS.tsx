import { useMemo, useState } from 'react'
import { Circle } from 'react-leaflet'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CircleDot,
  Crosshair,
  History,
  Layers,
  MapPin,
  MapPinOff,
  Pencil,
  Plus,
  Radius,
} from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoVazio } from '@/componentes/ui/Estados'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { MapaSOS } from '@/sos/Mapa'
import { sosCoberturaPendente, sosListarBases, sosPoliticaCompleta, sosSalvarBase, sosSalvarOnda } from '@/sos/api'
import { SITUACOES_MECANICO, dataHoraCurta, formatarDistancia } from '@/sos/rotulos'
import type { BaseListada, BaseSOS, OndaDespacho } from '@/sos/tipos'
import { ErroSOS, LinhaAlternador, lerNumero, useConfigSOS } from './comum'

const CHAVE_BASES = ['sos', 'bases'] as const
const CHAVE_POLITICA = ['sos', 'politica-completa'] as const
const CHAVE_PENDENTE = ['sos', 'cobertura-pendente'] as const

/**
 * Cobertura e despacho — a tela onde a regra dos 80 km deixa de ser uma linha
 * de SQL e passa a ser algo que a gestão vê e muda.
 *
 * As três medidas da especificação aparecem separadas de propósito, porque
 * confundi-las é o erro que esta tela existe para evitar:
 *
 *   · COBERTURA COMERCIAL — base/filial → caminhão. Define a área prioritária.
 *     É o que os círculos no mapa desenham e o que "Área prioritária" mede.
 *   · PROXIMIDADE DA EQUIPE — posição recente do mecânico → caminhão. É o raio
 *     de cada onda, que seleciona quem recebe a oferta.
 *   · PERCURSO — origem da saída → caminhão. Vira previsão de chegada, com a
 *     velocidade média da configuração.
 *
 * Mudar uma onda aqui PUBLICA UMA VERSÃO NOVA da política. Os chamados que já
 * estão na estrada continuam com a versão que receberam no despacho — é o que
 * impede uma edição de madrugada reescrever a regra de quem já está esperando.
 */
export function CoberturaSOS({ podeConfigurar }: { podeConfigurar: boolean }) {
  const [baseEditando, setBaseEditando] = useState<BaseListada | 'nova' | null>(null)
  const [ondaEditando, setOndaEditando] = useState<OndaDespacho | null>(null)

  const config = useConfigSOS()
  const bases = useQuery({ queryKey: CHAVE_BASES, staleTime: 30_000, queryFn: sosListarBases })
  const politica = useQuery({ queryKey: CHAVE_POLITICA, staleTime: 30_000, queryFn: sosPoliticaCompleta })
  const pendente = useQuery({ queryKey: CHAVE_PENDENTE, staleTime: 30_000, queryFn: sosCoberturaPendente })

  const lista = useMemo(() => bases.data ?? [], [bases.data])
  const comCoordenada = lista.filter((b) => b.ativo && b.latitude != null && b.longitude != null)
  const matriz = lista.find((b) => b.prestador_tipo === 'proprio' && b.principal) ?? lista.find((b) => b.prestador_tipo === 'proprio')
  const proprias = lista.filter((b) => b.prestador_tipo === 'proprio' && b.ativo)

  const vigente = politica.data?.vigente
  const ondas = useMemo(
    () => (politica.data?.ondas ?? []).filter((o) => o.versao === vigente).sort((a, b) => a.ordem - b.ordem),
    [politica.data, vigente],
  )
  const versoes = politica.data?.versoes ?? []
  const versaoAtual = versoes.find((v) => v.versao === vigente)

  if (bases.isError) return <ErroSOS erro={bases.error} aoTentarNovamente={() => void bases.refetch()} />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GradeMetricas colunas={4}>
        <Metrica
          rotulo="Área prioritária"
          valor={matriz?.raio_cobertura_km != null ? `${Number(matriz.raio_cobertura_km)} km` : '—'}
          glosa={matriz ? `medidos de ${matriz.nome}` : 'nenhuma base da Tecnoar cadastrada'}
          tom="accent"
          icone={<Radius />}
          carregando={bases.isLoading}
        />
        <Metrica
          rotulo="Bases e filiais"
          valor={bases.data ? proprias.length : '—'}
          glosa={
            bases.data
              ? `${comCoordenada.length} com ponto no mapa${pendente.data?.bases_sem_coordenada ? ` · ${pendente.data.bases_sem_coordenada} sem` : ''}`
              : undefined
          }
          tom="cyan"
          icone={<Building2 />}
          carregando={bases.isLoading}
        />
        <Metrica
          rotulo="Fora da área"
          valor={pendente.data ? pendente.data.chamados_fora_30d : '—'}
          glosa="chamados nos últimos 30 dias"
          tom={pendente.data?.chamados_fora_30d ? 'atencao' : 'neutro'}
          icone={<MapPinOff />}
          carregando={pendente.isLoading}
        />
        <Metrica
          rotulo="Política vigente"
          valor={vigente != null ? `v${vigente}` : '—'}
          glosa={versaoAtual ? `${versaoAtual.ondas} etapa${versaoAtual.ondas === 1 ? '' : 's'} de despacho` : undefined}
          tom="neutro"
          icone={<Layers />}
          carregando={politica.isLoading}
        />
      </GradeMetricas>

      {/* A pendência que não pode ser silenciosa: sem ponto no mapa, a área de
          80 km não existe, e o despacho está rodando só pela proximidade da
          equipe. A tela diz isso em vez de exibir um raio que não é aplicado. */}
      {pendente.data && !pendente.data.propria_medida && (
        <Aviso
          tom="atencao"
          titulo="A área prioritária ainda não está medida"
          acao={
            podeConfigurar ? (
              <Botao variante="secundario" iconeInicio={<MapPin />} onClick={() => setBaseEditando(matriz ?? 'nova')}>
                Marcar a base no mapa
              </Botao>
            ) : undefined
          }
        >
          Nenhuma base da Tecnoar tem ponto no mapa, então não há de onde medir os {matriz?.raio_cobertura_km ?? 80} km. Enquanto isso, o
          chamado é oferecido pela distância até o mecânico, como antes, e as etapas que exigem cobertura não barram ninguém
          {pendente.data.chamados_sem_medicao_30d > 0
            ? ` — ${pendente.data.chamados_sem_medicao_30d} chamado(s) dos últimos 30 dias entraram sem medição.`
            : '.'}
        </Aviso>
      )}

      {pendente.data?.expansao_habilitada && (
        <Aviso tom="info" titulo="Expansão de área habilitada">
          Existe uma etapa ativa que atende chamado fora da área prioritária. Ela é o único caminho automático para fora dos{' '}
          {matriz?.raio_cobertura_km ?? 80} km — fora dela, o chamado vai para a central.
        </Aviso>
      )}

      {/* ── bases e o mapa da cobertura ─────────────────────────────────── */}
      <Painel semPadding>
        <CabecalhoPainel
          titulo="Bases e filiais"
          descricao="De onde a área prioritária é medida. Cada base tem seu raio: a matriz cobre a área cheia, uma filial nova pode cobrir menos enquanto não tem equipe."
          acao={
            podeConfigurar && (
              <Botao variante="secundario" iconeInicio={<Plus />} onClick={() => setBaseEditando('nova')}>
                Nova base
              </Botao>
            )
          }
        />

        {bases.isLoading ? (
          <div className="p-5">
            <EstadoCarregando rotulo="Carregando as bases…" />
          </div>
        ) : !lista.length ? (
          <div className="p-5">
            <EstadoVazio
              icone={<Building2 />}
              titulo="Nenhuma base cadastrada"
              descricao="Cadastre a matriz com o ponto no mapa para a área prioritária passar a valer."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="min-h-[18rem] xl:min-h-[24rem]">
              {comCoordenada.length ? (
                <MapaSOS
                  enquadrar
                  marcadores={comCoordenada.map((b) => ({
                    id: b.id,
                    ponto: { lat: b.latitude as number, lng: b.longitude as number },
                    tipo: 'mecanico' as const,
                    rotulo: b.nome,
                    sigla: b.prestador_tipo === 'proprio' ? 'T' : 'P',
                  }))}
                  className="h-full min-h-[18rem] xl:min-h-[24rem]"
                >
                  {comCoordenada.map((b) => (
                    // O círculo é a COBERTURA COMERCIAL — a área de onde o
                    // chamado "é da casa". Não é alcance de equipe.
                    <Circle
                      key={`area-${b.id}`}
                      center={[b.latitude as number, b.longitude as number]}
                      radius={Number(b.raio_cobertura_km) * 1000}
                      interactive={false}
                      pathOptions={
                        b.prestador_tipo === 'proprio'
                          ? { color: '#fc6400', weight: 1.5, opacity: 0.6, fillColor: '#fc6400', fillOpacity: 0.07 }
                          : { color: '#00a8e8', weight: 1, opacity: 0.45, fillColor: '#00a8e8', fillOpacity: 0.05 }
                      }
                    />
                  ))}
                </MapaSOS>
              ) : (
                <div className="flex h-full min-h-[18rem] items-center justify-center p-5">
                  <EstadoVazio
                    icone={<MapPinOff />}
                    titulo="Sem ponto no mapa"
                    descricao="As bases existem, mas nenhuma tem coordenada — não há área para desenhar."
                  />
                </div>
              )}
            </div>

            <ul className="flex flex-col divide-y divide-line border-line max-xl:border-t xl:border-l">
              {lista.map((b) => (
                <li key={b.id} className={cn('flex items-start gap-3 px-4 py-3.5', !b.ativo && 'opacity-60')}>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                      b.prestador_tipo === 'proprio' ? 'bg-accent-soft text-accent-ink' : 'bg-cyan-soft text-cyan-ink',
                    )}
                  >
                    <Building2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{b.nome}</span>
                      {b.principal && <Selo tom="destaque">Principal</Selo>}
                      {!b.ativo && <Selo tom="neutro">Inativa</Selo>}
                      {b.latitude == null && <Selo tom="atencao">Sem ponto</Selo>}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      {[b.prestador_tipo === 'proprio' ? 'Tecnoar' : b.prestador_nome, [b.municipio, b.uf].filter(Boolean).join('/')]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">
                      Cobre {formatarDistancia(Number(b.raio_cobertura_km))} · {b.mecanicos} mecânico{b.mecanicos === 1 ? '' : 's'} no
                      prestador
                    </p>
                  </div>
                  {podeConfigurar && (
                    <BotaoIcone rotulo={`Editar ${b.nome}`} onClick={() => setBaseEditando(b)}>
                      <Pencil />
                    </BotaoIcone>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Painel>

      {/* ── etapas do despacho ──────────────────────────────────────────── */}
      <Painel semPadding>
        <CabecalhoPainel
          titulo="Etapas do despacho"
          descricao="A ordem em que o chamado é oferecido. O raio de cada etapa é a distância até o MECÂNICO; a área prioritária é medida da base, acima."
          acao={
            vigente != null && (
              <Selo tom="neutro">
                versão {vigente}
                {versaoAtual?.chamados ? ` · ${versaoAtual.chamados} chamado(s)` : ''}
              </Selo>
            )
          }
        />
        {politica.isLoading ? (
          <div className="p-5">
            <EstadoCarregando rotulo="Carregando a política…" />
          </div>
        ) : !ondas.length ? (
          <div className="p-5">
            <EstadoVazio icone={<Layers />} titulo="Nenhuma etapa ativa" descricao="Sem etapas, todo chamado vai direto para a central." />
          </div>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {ondas.map((o) => (
              <li key={o.id} className={cn('flex items-start gap-3 px-4 py-3.5', !o.ativo && 'opacity-60')}>
                <span
                  aria-hidden
                  className="num mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[12px] font-semibold"
                >
                  {o.ordem}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{o.nome}</span>
                    <Selo tom={tomEtapa(o)}>{rotuloEtapa(o)}</Selo>
                    {!o.ativo && <Selo tom="neutro">Desligada</Selo>}
                    {!o.exige_cobertura && <Selo tom="info">Fora da área</Selo>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">
                    Mecânico de {Number(o.raio_min_km)} a {Number(o.raio_max_km)} km ·{' '}
                    {o.espera_seg > 0 ? `espera ${o.espera_seg} s` : 'sem prazo (fica aberta)'}
                    {o.aceita_sem_posicao ? ' · aceita sem GPS recente' : ''}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {o.situacoes.map((s) => SITUACOES_MECANICO[s]?.rotulo ?? s).join(', ')}
                    {o.max_ofertas > 0 ? ` · até ${o.max_ofertas} oferta(s)` : ''}
                  </p>
                  {o.observacoes && <p className="mt-1 text-[12.5px] text-ink-3">{o.observacoes}</p>}
                </div>
                {podeConfigurar && (
                  <BotaoIcone rotulo={`Editar ${o.nome}`} onClick={() => setOndaEditando(o)}>
                    <Pencil />
                  </BotaoIcone>
                )}
              </li>
            ))}
            {/* A etapa que não é onda: o fim da busca automática. Ela aparece na
                lista porque é parte da política, e deixá-la fora dava a impressão
                de que o robô tenta para sempre. */}
            <li className="flex items-start gap-3 bg-surface-2/60 px-4 py-3.5">
              <span
                aria-hidden
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-3"
              >
                <Crosshair className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">Exceção da central</span>
                  <Selo tom="atencao">Pessoa assume</Selo>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  Esgotadas as etapas, ou passados {config.data?.busca_limite_min ?? 12} min de busca, o chamado para de ser oferecido
                  automaticamente e a central é avisada com o motivo. O chamado não é cancelado e o cliente não vê “mecânico a caminho”.
                </p>
              </div>
            </li>
          </ol>
        )}
      </Painel>

      {/* ── histórico de versões ────────────────────────────────────────── */}
      {versoes.length > 1 && (
        <Painel semPadding>
          <CabecalhoPainel
            titulo="Versões da política"
            descricao="Alterar uma etapa publica uma versão nova. Chamado em andamento continua na versão com que foi despachado — é o que mantém o histórico verdadeiro."
          />
          <ul className="flex flex-col divide-y divide-line">
            {versoes.map((v) => (
              <li key={v.versao} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className="mt-0.5 text-ink-3">
                  <History className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="num text-[12.5px] font-semibold">v{v.versao}</span>
                    <span className="truncate text-[13px]">{v.nome}</span>
                    {v.vigente && <Selo tom="ok">Vigente</Selo>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {dataHoraCurta(v.criada_em)} · {v.ondas} etapa{v.ondas === 1 ? '' : 's'} ·{' '}
                    {v.chamados ? `${v.chamados} chamado(s) despachado(s)` : 'nenhum chamado ainda'}
                  </p>
                  {v.observacoes && <p className="mt-0.5 text-[12.5px] text-ink-2">{v.observacoes}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Painel>
      )}

      {baseEditando && <FormBase base={baseEditando} aoFechar={() => setBaseEditando(null)} />}
      {ondaEditando && <FormOnda onda={ondaEditando} aoFechar={() => setOndaEditando(null)} />}
    </div>
  )
}

function rotuloEtapa(o: OndaDespacho): string {
  if (!o.exige_cobertura) return 'Expansão'
  if (o.tipo_prestador === 'proprio') return 'Tecnoar'
  if (o.tipo_prestador === 'parceiro') return 'Parceiro'
  return 'Qualquer prestador'
}

function tomEtapa(o: OndaDespacho): TomSelo {
  if (!o.exige_cobertura) return 'info'
  if (o.tipo_prestador === 'proprio') return 'destaque'
  return 'neutro'
}

/* ── formulários ─────────────────────────────────────────────────────────── */

function FormBase({ base, aoFechar }: { base: BaseListada | 'nova'; aoFechar: () => void }) {
  const nova = base === 'nova'
  const b = nova ? null : base
  const qc = useQueryClient()
  const toast = useToast()
  const [nome, setNome] = useState(b?.nome ?? '')
  const [municipio, setMunicipio] = useState(b?.municipio ?? '')
  const [uf, setUf] = useState(b?.uf ?? '')
  const [raio, setRaio] = useState(String(b?.raio_cobertura_km ?? 80))
  const [lat, setLat] = useState(b?.latitude != null ? String(b.latitude) : '')
  const [lng, setLng] = useState(b?.longitude != null ? String(b.longitude) : '')
  const [principal, setPrincipal] = useState(b?.principal ?? nova)
  const [ativo, setAtivo] = useState(b?.ativo ?? true)
  const [observacoes, setObservacoes] = useState(b?.observacoes ?? '')

  const latN = lerNumero(lat)
  const lngN = lerNumero(lng)
  const raioN = lerNumero(raio)
  const ponto = latN != null && lngN != null ? { lat: latN, lng: lngN } : null

  const erroRaio = raioN == null || raioN <= 0 || raioN > 1000 ? 'Entre 1 e 1000 km.' : undefined
  // Latitude e longitude andam juntas: meia coordenada não localiza nada, e o
  // banco recusa (`sos_bases_antes`). Melhor dizer aqui.
  const erroPonto = (latN == null) !== (lngN == null) ? 'Informe latitude e longitude juntas.' : undefined

  const salvar = useMutation({
    mutationFn: () =>
      sosSalvarBase({
        ...(b ? { id: b.id } : {}),
        nome: nome.trim(),
        municipio: municipio.trim() || null,
        uf: uf.trim().toUpperCase() || null,
        raio_cobertura_km: raioN as number,
        latitude: latN,
        longitude: lngN,
        principal,
        ativo,
        observacoes: observacoes.trim() || null,
      } as Partial<BaseSOS>),
    onSuccess: () => {
      toast.ok(nova ? 'Base cadastrada' : 'Base atualizada', ponto ? 'A área prioritária já vale para os próximos chamados.' : undefined)
      void qc.invalidateQueries({ queryKey: ['sos'] })
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const impedido = !nome.trim() || !!erroRaio || !!erroPonto

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={nova ? 'Nova base' : (b?.nome ?? 'Base')}
      descricao="A área prioritária é medida daqui até o caminhão parado."
      largura="lg"
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending} disabled={impedido} onClick={() => salvar.mutate()}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Campo rotulo="Nome da base" obrigatorio>
            {(p) => <Entrada {...p} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Matriz — São Paulo" />}
          </Campo>
          <Campo rotulo="Raio (km)" erro={erroRaio} obrigatorio dica="Padrão: 80 km.">
            {(p) => <Entrada {...p} inputMode="decimal" value={raio} onChange={(e) => setRaio(e.target.value)} mono />}
          </Campo>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
          <Campo rotulo="Município">
            {(p) => <Entrada {...p} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />}
          </Campo>
          <Campo rotulo="UF">
            {(p) => <Entrada {...p} value={uf} maxLength={2} onChange={(e) => setUf(e.target.value)} />}
          </Campo>
        </div>

        <div>
          <p className="mb-2 text-[12.5px] text-ink-2">
            Toque no mapa para marcar o ponto da base. Sem ponto, a área não é medida e o despacho segue só pela distância até o mecânico.
          </p>
          <div className="overflow-hidden rounded-lg border border-line">
            <MapaSOS
              centro={ponto}
              zoom={ponto ? 9 : 4}
              aoClicarMapa={(p) => {
                setLat(p.lat.toFixed(6))
                setLng(p.lng.toFixed(6))
              }}
              marcadores={ponto ? [{ id: 'base', ponto, tipo: 'mecanico', rotulo: nome.trim() || 'Base', sigla: 'T' }] : []}
              className="h-56"
            >
              {ponto && raioN != null && raioN > 0 && (
                <Circle
                  center={[ponto.lat, ponto.lng]}
                  radius={raioN * 1000}
                  interactive={false}
                  pathOptions={{ color: '#fc6400', weight: 1.5, opacity: 0.6, fillColor: '#fc6400', fillOpacity: 0.07 }}
                />
              )}
            </MapaSOS>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Campo rotulo="Latitude" erro={erroPonto}>
              {(p) => <Entrada {...p} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} mono />}
            </Campo>
            <Campo rotulo="Longitude">
              {(p) => <Entrada {...p} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} mono />}
            </Campo>
          </div>
        </div>

        <LinhaAlternador
          ativo={principal}
          onChange={setPrincipal}
          icone={<Crosshair />}
          rotulo="Base principal"
          texto="A referência do prestador. Só uma por prestador — marcar esta desmarca a anterior."
        />
        <LinhaAlternador
          ativo={ativo}
          onChange={setAtivo}
          icone={<CircleDot />}
          rotulo="Ativa"
          texto="Base inativa não entra no cálculo da cobertura."
        />

        <Campo rotulo="Observações">
          {(p) => <AreaTexto {...p} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}

function FormOnda({ onda, aoFechar }: { onda: OndaDespacho; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [nome, setNome] = useState(onda.nome)
  const [raioMin, setRaioMin] = useState(String(onda.raio_min_km))
  const [raioMax, setRaioMax] = useState(String(onda.raio_max_km))
  const [espera, setEspera] = useState(String(onda.espera_seg))
  const [exigeCobertura, setExigeCobertura] = useState(onda.exige_cobertura)
  const [semPosicao, setSemPosicao] = useState(onda.aceita_sem_posicao)
  const [ativo, setAtivo] = useState(onda.ativo)

  const minN = lerNumero(raioMin)
  const maxN = lerNumero(raioMax)
  const esperaN = lerNumero(espera)
  const erroRaio = minN == null || maxN == null || maxN <= minN ? 'O raio final tem que ser maior que o inicial.' : undefined
  const erroEspera = esperaN == null || esperaN < 0 ? 'Em segundos. 0 = sem prazo.' : undefined

  const salvar = useMutation({
    mutationFn: () =>
      sosSalvarOnda({
        id: onda.id,
        nome: nome.trim(),
        raio_min_km: minN as number,
        raio_max_km: maxN as number,
        espera_seg: esperaN as number,
        exige_cobertura: exigeCobertura,
        aceita_sem_posicao: semPosicao,
        ativo,
      }),
    onSuccess: (r) => {
      toast.ok(`Política publicada na versão ${r.versao}`, 'Chamados em andamento continuam na versão anterior.')
      void qc.invalidateQueries({ queryKey: ['sos'] })
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Etapa ${onda.ordem} · ${onda.nome}`}
      descricao="Salvar publica uma versão nova da política. Quem já está esperando na estrada continua na versão atual."
      largura="md"
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={salvar.isPending}
            disabled={!nome.trim() || !!erroRaio || !!erroEspera}
            onClick={() => salvar.mutate()}
          >
            Publicar versão
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome da etapa" obrigatorio>
          {(p) => <Entrada {...p} value={nome} onChange={(e) => setNome(e.target.value)} />}
        </Campo>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Do mecânico a (km)" erro={erroRaio} obrigatorio>
            {(p) => <Entrada {...p} inputMode="decimal" value={raioMin} onChange={(e) => setRaioMin(e.target.value)} mono />}
          </Campo>
          <Campo rotulo="Até (km)" obrigatorio>
            {(p) => <Entrada {...p} inputMode="decimal" value={raioMax} onChange={(e) => setRaioMax(e.target.value)} mono />}
          </Campo>
          <Campo rotulo="Espera (s)" erro={erroEspera} dica="0 = fica aberta." obrigatorio>
            {(p) => <Entrada {...p} inputMode="numeric" value={espera} onChange={(e) => setEspera(e.target.value)} mono />}
          </Campo>
        </div>

        <LinhaAlternador
          ativo={exigeCobertura}
          onChange={setExigeCobertura}
          icone={<Radius />}
          rotulo="Só dentro da área prioritária"
          texto="Ligado, esta etapa não atende chamado medido fora da área. Desligado, ela é a etapa de expansão — o único caminho automático para fora da área."
        />
        <LinhaAlternador
          ativo={semPosicao}
          onChange={setSemPosicao}
          icone={<MapPinOff />}
          rotulo="Aceitar quem está sem GPS recente"
          texto="A base do prestador entra como estimativa identificada, nunca como posição ao vivo. Útil no reforço; na primeira etapa tira o sentido do raio."
        />
        <LinhaAlternador ativo={ativo} onChange={setAtivo} icone={<Layers />} rotulo="Etapa ativa" texto="Desligada, esta etapa é pulada no despacho." />
      </div>
    </Modal>
  )
}
