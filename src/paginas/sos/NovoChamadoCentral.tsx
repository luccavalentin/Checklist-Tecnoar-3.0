import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, LocateFixed, MapPin, MessageCircle, Phone, Search, Siren, UserRound, X } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { mascaraPlaca, mascaraTelefone } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosAbrirChamado, sosBuscarCliente } from '@/sos/api'
import { MapaSOS, type MarcadorMapa } from '@/sos/Mapa'
import { buscarLugar, enderecoDoPonto, formatarCoordenadas, type Ponto } from '@/sos/geo'
import { OCORRENCIAS, ORDEM_OCORRENCIAS, PRIORIDADES } from '@/sos/rotulos'
import type { ClienteBusca, OcorrenciaSOS, PrioridadeSOS } from '@/sos/tipos'
import { invalidarSOS, posicaoRecente, useMecanicosSOS } from './comum'

/**
 * Coordenadas coladas de qualquer lugar: "-23.55052, -46.63330", o link do
 * Google Maps com "@-23.55,-46.63,15z" ou "?q=-23.55,-46.63". É o que o
 * motorista manda pelo WhatsApp quando compartilha a localização.
 */
export function extrairCoordenadas(texto: string): Ponto | null {
  const m = texto.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

type OrigemCentral = 'telefone' | 'whatsapp'

export function NovoChamadoCentral({ aberto, aoFechar, aoCriado }: { aberto: boolean; aoFechar: () => void; aoCriado: (id: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const mecanicos = useMecanicosSOS(aberto)

  const [termo, setTermo] = useState('')
  const [termoBusca, setTermoBusca] = useState('')
  const [cliente, setCliente] = useState<ClienteBusca | null>(null)
  const [veiculo, setVeiculo] = useState<string>('')
  const [placaNova, setPlacaNova] = useState('')
  const [descVeiculo, setDescVeiculo] = useState('')
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaSOS | null>(null)
  const [prioridade, setPrioridade] = useState<PrioridadeSOS | null>(null)
  const [descricao, setDescricao] = useState('')
  const [ponto, setPonto] = useState<Ponto | null>(null)
  const [centro, setCentro] = useState<Ponto | null>(null)
  const [endereco, setEndereco] = useState('')
  const [enderecoEditado, setEnderecoEditado] = useState(false)
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [textoLocal, setTextoLocal] = useState('')
  const [lugares, setLugares] = useState<Array<Ponto & { nome: string }> | null>(null)
  const [procurandoLugar, setProcurandoLugar] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [origem, setOrigem] = useState<OrigemCentral>('telefone')
  const [tentouEnviar, setTentouEnviar] = useState(false)

  // Formulário limpo a cada abertura: um SOS nunca herda dados do anterior.
  useEffect(() => {
    if (!aberto) return
    setTermo('')
    setTermoBusca('')
    setCliente(null)
    setVeiculo('')
    setPlacaNova('')
    setDescVeiculo('')
    setOcorrencia(null)
    setPrioridade(null)
    setDescricao('')
    setPonto(null)
    setCentro(null)
    setEndereco('')
    setEnderecoEditado(false)
    setTextoLocal('')
    setLugares(null)
    setTelefone('')
    setOrigem('telefone')
    setTentouEnviar(false)
  }, [aberto])

  useEffect(() => {
    const t = window.setTimeout(() => setTermoBusca(termo.trim()), 300)
    return () => window.clearTimeout(t)
  }, [termo])

  const clientes = useQuery({
    queryKey: ['sos', 'busca-cliente', termoBusca],
    enabled: aberto && !cliente && termoBusca.length >= 2,
    staleTime: 30_000,
    queryFn: () => sosBuscarCliente(termoBusca),
  })

  // Sem ponto ainda, o mapa abre na região onde os mecânicos estão — é onde
  // os clientes costumam estar também, e poupa o zoom a partir do Brasil inteiro.
  useEffect(() => {
    if (!aberto || centro || ponto) return
    const m = (mecanicos.data ?? []).find((x) => posicaoRecente(x))
    if (m?.latitude != null && m.longitude != null) setCentro({ lat: m.latitude, lng: m.longitude })
  }, [aberto, mecanicos.data, centro, ponto])

  function escolherPonto(p: Ponto, recentralizar = false) {
    setPonto(p)
    if (recentralizar) setCentro(p)
    if (enderecoEditado) return
    setBuscandoEndereco(true)
    void enderecoDoPonto(p)
      .then((e) => {
        if (e) setEndereco(e)
      })
      .finally(() => setBuscandoEndereco(false))
  }

  async function procurarLocal() {
    const texto = textoLocal.trim()
    if (!texto) return
    const coords = extrairCoordenadas(texto)
    if (coords) {
      setLugares(null)
      escolherPonto(coords, true)
      return
    }
    setProcurandoLugar(true)
    try {
      setLugares(await buscarLugar(texto))
    } finally {
      setProcurandoLugar(false)
    }
  }

  function selecionarCliente(c: ClienteBusca) {
    setCliente(c)
    setTelefone(c.celular ? mascaraTelefone(c.celular) : '')
    const veiculos = c.veiculos ?? []
    setVeiculo(veiculos.length === 1 ? veiculos[0]!.id : veiculos.length ? '' : 'outra')
  }

  const prioridadeFinal: PrioridadeSOS = prioridade ?? (ocorrencia ? OCORRENCIAS[ocorrencia].prioridade : 'normal')
  const placaLimpa = placaNova.replace(/[^A-Za-z0-9]/g, '')
  const erros = {
    cliente: !cliente ? 'Escolha o cliente.' : null,
    // Escolha explícita: sem veículo o chamado não vira OS depois. "Outra placa"
    // em branco é a saída honesta para quando o motorista não sabe informar.
    veiculo: cliente && !veiculo ? 'Escolha o veículo.' : veiculo === 'outra' && placaLimpa.length > 0 && placaLimpa.length < 7 ? 'Placa incompleta.' : null,
    ocorrencia: !ocorrencia ? 'Escolha o tipo de problema.' : null,
  }
  const valido = !erros.cliente && !erros.veiculo && !erros.ocorrencia

  const abrir = useMutation({
    mutationFn: () =>
      sosAbrirChamado({
        cliente_id: cliente!.cliente_id,
        veiculo_id: veiculo && veiculo !== 'outra' ? veiculo : null,
        placa: veiculo === 'outra' && placaLimpa ? placaLimpa.toUpperCase() : null,
        veiculo_descricao: veiculo === 'outra' ? descVeiculo.trim() || null : null,
        tipo_ocorrencia: ocorrencia!,
        prioridade: prioridadeFinal,
        descricao: descricao.trim() || null,
        latitude: ponto?.lat ?? null,
        longitude: ponto?.lng ?? null,
        endereco: endereco.trim() || null,
        ponto_ajustado: !!ponto,
        telefone_contato: telefone.replace(/\D/g, '') || null,
        origem,
      }),
    onSuccess: (c) => {
      toast.ok(`${c.protocolo} aberto`, 'O chamado entrou na fila da central.')
      invalidarSOS(qc, c.id)
      aoCriado(c.id)
    },
    onError: (e) => toast.erro('Não foi possível abrir o SOS', mensagemErro(e)),
  })

  const marcadores = useMemo<MarcadorMapa[]>(() => (ponto ? [{ id: 'novo', ponto, tipo: 'cliente', pulsar: true }] : []), [ponto])

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      largura="lg"
      titulo="Abrir SOS pela central"
      descricao="Para quem pediu socorro por telefone ou WhatsApp. O chamado segue o mesmo fluxo de um pedido feito pelo app."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={abrir.isPending}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            iconeInicio={<Siren />}
            carregando={abrir.isPending}
            onClick={() => {
              setTentouEnviar(true)
              if (valido) abrir.mutate()
            }}
          >
            Abrir SOS
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Etapa numero={1} titulo="Cliente" erro={tentouEnviar ? erros.cliente : null}>
          {cliente ? (
            <div className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok-soft/60 px-3.5 py-3">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ok text-white">
                <Check className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{cliente.nome}</p>
                <p className="num truncate text-[12px] text-ink-2">{[cliente.documento, cliente.celular].filter(Boolean).join(' · ') || 'Sem documento'}</p>
              </div>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setCliente(null)} className="shrink-0 max-sm:h-11">
                Trocar
              </Botao>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Entrada
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Nome, CPF/CNPJ ou placa"
                aria-label="Buscar cliente"
                iconeInicio={<Search />}
                autoComplete="off"
              />
              {termoBusca.length >= 2 && (
                <ul className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface shadow-e1">
                  {clientes.isFetching && !clientes.data && (
                    <li className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-ink-3">
                      <Loader2 className="size-4 animate-spin" /> Buscando…
                    </li>
                  )}
                  {clientes.isError && <li className="px-3.5 py-3 text-[13px] text-crit-ink">{mensagemErro(clientes.error)}</li>}
                  {clientes.isSuccess && clientes.data.length === 0 && (
                    <li className="px-3.5 py-3 text-[13px] leading-relaxed text-ink-3">
                      Nenhum cliente para “{termoBusca}”. Cadastre em Cadastros › Clientes e volte aqui.
                    </li>
                  )}
                  {(clientes.data ?? []).map((c) => (
                    <li key={c.cliente_id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => selecionarCliente(c)}
                        className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-accent-soft"
                      >
                        <UserRound aria-hidden className="size-4 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink">{c.nome}</span>
                          <span className="num block truncate text-[11.5px] text-ink-3">
                            {[c.documento, c.celular, c.veiculos?.length ? `${c.veiculos.length} veículo${c.veiculos.length > 1 ? 's' : ''}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Etapa>

        {cliente && (
          <Etapa numero={2} titulo="Veículo" erro={tentouEnviar || veiculo === 'outra' ? erros.veiculo : null}>
            <div className="flex flex-wrap gap-2">
              {(cliente.veiculos ?? []).map((v) => (
                <Opcao key={v.id} ativo={veiculo === v.id} onClick={() => setVeiculo(v.id)}>
                  <span className="num font-semibold">{mascaraPlaca(v.placa)}</span>
                  {v.descricao && <span className="truncate text-ink-3">{v.descricao}</span>}
                </Opcao>
              ))}
              <Opcao ativo={veiculo === 'outra'} onClick={() => setVeiculo('outra')}>
                Outra placa ou não sabe
              </Opcao>
            </div>
            {veiculo === 'outra' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <Campo rotulo="Placa">
                  {(p) => <Entrada {...p} value={mascaraPlaca(placaNova)} onChange={(e) => setPlacaNova(e.target.value)} placeholder="ABC-1D23" mono maxLength={8} />}
                </Campo>
                <Campo rotulo="Modelo" dica="Cadastrado no cliente sem duplicar placa.">
                  {(p) => <Entrada {...p} value={descVeiculo} onChange={(e) => setDescVeiculo(e.target.value)} placeholder="Ex.: Scania R450" />}
                </Campo>
              </div>
            )}
          </Etapa>
        )}

        <Etapa numero={cliente ? 3 : 2} titulo="Problema" erro={tentouEnviar ? erros.ocorrencia : null}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ORDEM_OCORRENCIAS.map((o) => {
              const info = OCORRENCIAS[o]
              const Icone = info.icone
              const ativo = ocorrencia === o
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setOcorrencia(o)}
                  className={cn(
                    'flex min-h-[64px] min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    ativo ? 'border-accent bg-accent-soft ring-1 ring-accent/30' : 'border-line-strong bg-surface hover:border-ink-3',
                  )}
                >
                  <Icone aria-hidden className={cn('mt-0.5 size-4 shrink-0', info.cor)} />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-tight font-semibold text-ink">{info.rotulo}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-3">{info.descricao}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="lbl">Prioridade {prioridade ? '' : '· automática pelo problema'}</span>
            <Segmentado<PrioridadeSOS>
              rotuloGrupo="Prioridade"
              valor={prioridadeFinal}
              onChange={setPrioridade}
              className="[&>button]:min-h-11 lg:[&>button]:min-h-8"
              opcoes={(['normal', 'alta', 'emergencia'] as const).map((p) => ({ valor: p, rotulo: PRIORIDADES[p].rotulo }))}
            />
          </div>
          <Campo rotulo="Descrição">
            {(p) => (
              <AreaTexto
                {...p}
                rows={3}
                value={descricao}
                maxLength={2000}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que o motorista contou: sintomas, onde parou, se está em local seguro"
              />
            )}
          </Campo>
        </Etapa>

        <Etapa numero={cliente ? 4 : 3} titulo="Localização">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Entrada
                value={textoLocal}
                onChange={(e) => setTextoLocal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void procurarLocal()
                  }
                }}
                placeholder="Endereço, rodovia, cidade ou coordenadas"
                aria-label="Buscar local ou colar coordenadas"
                iconeInicio={<MapPin />}
              />
            </div>
            <Botao variante="neutro" onClick={() => void procurarLocal()} carregando={procurandoLugar} disabled={!textoLocal.trim()} className="shrink-0">
              Buscar
            </Botao>
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Cole as coordenadas ou o link do Google Maps que o motorista mandou — ou toque no mapa para marcar o ponto. Links curtos (maps.app.goo.gl)
            não trazem as coordenadas: abra o link e copie os números.
          </p>
          {lugares && (
            <ul className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
              {lugares.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">Nada encontrado. Tente a cidade ou a rodovia com o km.</li>}
              {lugares.map((l) => (
                <li key={`${l.lat},${l.lng}`} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setLugares(null)
                      escolherPonto(l, true)
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink hover:bg-surface-2"
                  >
                    <LocateFixed aria-hidden className="size-4 shrink-0 text-cyan" />
                    <span className="line-clamp-2">{l.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative isolate h-64 overflow-hidden rounded-xl border border-line sm:h-72">
            <MapaSOS marcadores={marcadores} centro={centro} zoom={12} tema="claro" aoClicarMapa={(p) => escolherPonto(p)} className="size-full" />
            {!ponto && (
              <span className="pointer-events-none absolute inset-x-0 top-3 z-[600] mx-auto w-fit rounded-full bg-[#081830]/85 px-3 py-1.5 text-[12px] text-white shadow-e2">
                Toque no mapa para marcar onde o veículo está
              </span>
            )}
          </div>
          {ponto ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                <span className="num">{formatarCoordenadas(ponto)}</span>
                <button type="button" onClick={() => setPonto(null)} className="flex min-h-11 items-center gap-1 text-crit-ink hover:underline sm:min-h-8">
                  <X aria-hidden className="size-3" /> Remover ponto
                </button>
              </div>
              <Campo rotulo="Endereço / referência" dica={buscandoEndereco ? 'Identificando o endereço…' : 'Ajuste com a referência que o motorista deu (posto, km, trevo).'}>
                {(p) => (
                  <Entrada
                    {...p}
                    value={endereco}
                    onChange={(e) => {
                      setEndereco(e.target.value)
                      setEnderecoEditado(true)
                    }}
                    placeholder="Ex.: BR-116, km 245, posto Graal"
                  />
                )}
              </Campo>
            </div>
          ) : (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn-ink">
              Sem o ponto no mapa o chamado abre, mas o despacho inteligente não calcula distância nem previsão de chegada.
            </p>
          )}
        </Etapa>

        <Etapa numero={cliente ? 5 : 4} titulo="Contato">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Telefone de contato" dica="Número em que o motorista atende agora.">
              {(p) => (
                <Entrada {...p} type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(11) 90000-0000" mono />
              )}
            </Campo>
            <div className="flex flex-col gap-1.5">
              <span className="lbl">Pedido chegou por</span>
              <Segmentado<OrigemCentral>
                rotuloGrupo="Origem do pedido"
                valor={origem}
                onChange={setOrigem}
                className="[&>button]:min-h-11 lg:[&>button]:min-h-8"
                opcoes={[
                  { valor: 'telefone', rotulo: 'Telefone', icone: <Phone /> },
                  { valor: 'whatsapp', rotulo: 'WhatsApp', icone: <MessageCircle /> },
                ]}
              />
            </div>
          </div>
        </Etapa>
      </div>
    </PainelLateral>
  )
}

function Etapa({ numero, titulo, erro, children }: { numero: number; titulo: string; erro?: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <span aria-hidden className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-[#081830] text-[11px] font-semibold text-white dark:bg-white dark:text-[#081830]">
          {numero}
        </span>
        <h3 className="font-display text-[14px] font-semibold text-ink">{titulo}</h3>
        {erro && <span className="ml-auto text-[12px] font-medium text-crit-ink">{erro}</span>}
      </header>
      {children}
    </section>
  )
}

function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors',
        ativo ? 'border-accent bg-accent-soft text-ink ring-1 ring-accent/30' : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
      )}
    >
      {ativo && <Check aria-hidden className="size-3.5 shrink-0 text-accent" />}
      {children}
    </button>
  )
}
