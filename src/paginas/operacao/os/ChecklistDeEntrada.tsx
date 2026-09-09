import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2, Printer, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { mascaraDocumento, mascaraInscricaoEstadual, mascaraTelefone, numeroBR } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoCarregando, EstadoErro } from '@/componentes/ui/Estados'
import { LEGENDA_AVARIAS } from './abas/MapaAvarias'
import { baixarPdf, nomeArquivo } from '@/documentos/pdf'
import { pdfChecklistEntrada } from '@/documentos/pdfChecklistEntrada'
import { mensagemErro as msgErro } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import type {
  AvariaVeiculo,
  Checklist,
  ChecklistResposta,
  DadosEmpresa,
  RespostaChecklist,
} from '@/tipos/db'
import type { OSCompleta } from './useOS'

const ROTULO_TIPO_OS = { os: 'Ordem de serviço', orcamento: 'Orçamento', garantia: 'Garantia' } as const

/**
 * Checklist de Entrada — documento A4.
 *
 * É o papel que o cliente assina na portaria dizendo em que estado o veículo
 * chegou. Por isso é técnico e sóbrio: sem cor de enfeite, hierarquia por peso
 * e régua, e tudo cabendo na folha. As caixinhas de marcação são desenhadas com
 * borda para funcionarem também quando a impressora é preto e branco.
 */
export function ChecklistDeEntrada({
  ordem,
  checklistId,
  aoFechar,
}: {
  ordem: OSCompleta
  checklistId: string
  aoFechar: () => void
}) {
  const empresa = useQuery({
    queryKey: ['dados-empresa-documento'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const dados = useQuery({
    queryKey: ['checklist-entrada', checklistId],
    queryFn: async () => {
      const [chk, resp, avr, ent] = await Promise.all([
        supabase.from('checklists').select('*').eq('id', checklistId).single(),
        supabase.from('checklist_respostas').select('*').eq('checklist_id', checklistId).order('ordem'),
        supabase.from('avarias_veiculo').select('*').eq('checklist_id', checklistId).order('created_at'),
        /* Sem entrada vinculada não há o que consultar: id vazio viraria um
           UUID inválido e o PostgREST recusaria a requisição inteira. */
        ordem.entrada_id
          ? supabase
              .from('entradas_patio')
              .select('motorista_nome, motorista_telefone, observacoes, condicao_entrada, entrada_em')
              .eq('id', ordem.entrada_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (chk.error) throw chk.error
      if (resp.error) throw resp.error
      if (avr.error) throw avr.error
      return {
        checklist: chk.data as Checklist,
        respostas: (resp.data ?? []) as ChecklistResposta[],
        avarias: (avr.data ?? []) as AvariaVeiculo[],
        entrada: ent.data ?? null,
      }
    },
  })

  const vendedor = useQuery({
    queryKey: ['os-vendedor', ordem.aberta_por],
    enabled: Boolean(ordem.aberta_por),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('nome_completo')
        .eq('id', ordem.aberta_por!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const toast = useToast()
  const [baixando, setBaixando] = useState(false)

  /**
   * Baixa o documento como PDF de verdade.
   *
   * O `window.print()` depende de o operador escolher "Salvar como PDF" e
   * ainda deixa cabeçalho e URL do navegador na folha. Para um documento que
   * o cliente assina, o arquivo tem que sair pronto e com a marca.
   */
  async function baixar() {
    if (!d) return
    setBaixando(true)
    try {
      const secoes = [...secoesMapa.entries()].map(([secao, itens]) => ({
        secao,
        itens: itens.map((i) => ({ texto: i.texto, resposta: i.resposta, observacao: i.observacao })),
      }))
      const definicao = await pdfChecklistEntrada({
        empresa: {
          nome: e?.nome_fantasia || e?.razao_social || 'Tecnoar Freios',
          razaoSocial: e?.razao_social ?? null,
          cnpj: e?.cnpj ? mascaraDocumento(e.cnpj) : null,
          inscricaoEstadual: e?.inscricao_estadual ? mascaraInscricaoEstadual(e.inscricao_estadual) : null,
          inscricaoMunicipal: e?.inscricao_municipal ?? null,
          telefone: e?.telefone ?? null,
          endereco: e?.endereco ?? null,
          email: e?.email ?? null,
        },
        os: {
          numero: ordem.numero,
          tipo: ROTULO_TIPO_OS[ordem.tipo],
          aberta_em: ordem.aberta_em,
          encerrada_em: ordem.encerrada_em,
          km: ordem.km,
          problema_alegado: ordem.problema_alegado,
          vendedor: vendedor.data?.nome_completo ?? null,
        },
        cliente: {
          nome: c?.nome_razao ?? null,
          documento: c?.documento ? mascaraDocumento(c.documento) : null,
          contato: c?.celular ? mascaraTelefone(c.celular) : (c?.telefone ?? null),
          email: c?.email ?? null,
          endereco: endereco || null,
        },
        veiculo: {
          placa: v?.placa ?? null,
          modelo: v?.descricao || [v?.marca, v?.modelo].filter(Boolean).join(' ') || null,
          cor: v?.cor ?? null,
          ano: v?.ano ?? null,
          tipo: v?.tipo ?? null,
        },
        motorista: {
          nome: d.entrada?.motorista_nome ?? null,
          telefone: d.entrada?.motorista_telefone ? mascaraTelefone(d.entrada.motorista_telefone) : null,
        },
        checklist: {
          nome: d.checklist.modelo_descricao,
          versao: d.checklist.versao,
          concluido_em: d.checklist.concluido_em,
        },
        secoes,
        avarias: d.avarias.map((a) => {
          const l = LEGENDA_AVARIAS.find((x) => x.valor === a.tipo)
          return { sigla: l?.sigla ?? '?', tipo: l?.rotulo ?? a.tipo, posicao: a.posicao, observacao: a.observacao }
        }),
        legenda: LEGENDA_AVARIAS.map((l) => ({ sigla: l.sigla, rotulo: l.rotulo })),
        objetosPessoais: d.entrada?.condicao_entrada ?? null,
      })
      await baixarPdf(definicao, nomeArquivo(['checklist-entrada', String(ordem.numero).padStart(5, '0'), v?.placa]))
    } catch (err) {
      toast.erro('Não foi possível gerar o PDF', msgErro(err))
    } finally {
      setBaixando(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  const e = empresa.data
  const d = dados.data
  const c = ordem.cliente
  const v = ordem.veiculo

  /* Agrupa as respostas por seção preservando a ordem do modelo. */
  const secoesMapa = new Map<string, ChecklistResposta[]>()
  for (const r of d?.respostas ?? []) {
    secoesMapa.set(r.secao, [...(secoesMapa.get(r.secao) ?? []), r])
  }

  const endereco = c
    ? [c.logradouro, c.numero, c.bairro, [c.municipio, c.uf].filter(Boolean).join('/')].filter(Boolean).join(', ')
    : ''

  return createPortal(
    <div className="fixed inset-0 z-70 overflow-y-auto bg-canvas">
      <style>{`
        @media print {
          .sem-impressao { display: none !important }
          .folha { padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important }
          .evitar-quebra { break-inside: avoid }
          @page { size: A4 portrait; margin: 12mm 10mm }
        }
      `}</style>

      <div className="sem-impressao sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <span className="font-display text-[15px] font-semibold text-ink">
          Checklist de Entrada — OS {String(ordem.numero).padStart(5, '0')}
        </span>
        <div className="flex gap-2">
          <Botao
            variante="primario"
            iconeInicio={baixando ? <Loader2 className="animate-spin" /> : <Download />}
            disabled={baixando || !d}
            onClick={() => void baixar()}
          >
            Baixar PDF
          </Botao>
          <Botao variante="neutro" iconeInicio={<Printer />} onClick={() => window.print()}>
            Imprimir
          </Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] p-6">
        {dados.isLoading ? (
          <EstadoCarregando />
        ) : dados.isError ? (
          <EstadoErro descricao={mensagemErro(dados.error)} aoTentarNovamente={() => void dados.refetch()} />
        ) : (
          <article className="folha flex flex-col gap-4 rounded-lg border border-line bg-surface p-8 text-ink print:rounded-none">
            {/* ------------------------------------------------- cabeçalho */}
            <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
              <div className="flex items-center gap-3.5">
                <img src="/brand/tecnoar-positivo.svg" alt="" className="h-12 w-auto" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-display text-[14px] leading-tight font-bold">
                    {e?.nome_fantasia || e?.razao_social || 'Tecnoar Freios'}
                  </span>
                  {e?.cnpj && <span className="num text-[10px] text-ink-2">CNPJ {mascaraDocumento(e.cnpj)}</span>}
                  {e?.telefone && <span className="num text-[10px] text-ink-2">{e.telefone}</span>}
                  {e?.endereco && <span className="text-[10px] text-ink-2">{e.endereco}</span>}
                </div>
              </div>

              <div className="flex flex-col items-end gap-0.5">
                <span className="font-display text-[11px] font-bold tracking-[0.16em] text-ink-2 uppercase">
                  Checklist de Entrada
                </span>
                <span className="num text-2xl leading-none font-bold">
                  OS {String(ordem.numero).padStart(5, '0')}
                </span>
                <span className="num text-[10px] text-ink-2">{ROTULO_TIPO_OS[ordem.tipo]}</span>
                <span className="num text-[10px] text-ink-3">
                  Data de impressão: {dataHora(new Date().toISOString())}
                </span>
              </div>
            </header>

            {/* --------------------------------------------- cliente e OS */}
            <section className="evitar-quebra grid grid-cols-2 gap-x-6">
              <Bloco titulo="Cliente">
                <Linha rotulo="Nome" valor={c?.nome_razao} />
                <Linha rotulo="CPF / CNPJ" valor={c?.documento ? mascaraDocumento(c.documento) : null} mono />
                <Linha
                  rotulo="Contato"
                  valor={c?.celular ? mascaraTelefone(c.celular) : c?.telefone ? mascaraTelefone(c.telefone) : null}
                  mono
                />
                <Linha rotulo="E-mail" valor={c?.email} />
                <Linha rotulo="Endereço" valor={endereco || null} />
              </Bloco>

              <Bloco titulo="Atendimento">
                <Linha rotulo="Tipo" valor={ROTULO_TIPO_OS[ordem.tipo]} />
                <Linha rotulo="Vendedor / atendente" valor={vendedor.data?.nome_completo} />
                <Linha rotulo="Abertura" valor={dataHora(ordem.aberta_em)} mono />
                <Linha
                  rotulo="Encerramento"
                  valor={ordem.encerrada_em ? dataHora(ordem.encerrada_em) : 'Em aberto'}
                  mono
                />
                <Linha rotulo="Motorista" valor={d?.entrada?.motorista_nome} />
                <Linha
                  rotulo="Telefone"
                  valor={d?.entrada?.motorista_telefone ? mascaraTelefone(d.entrada.motorista_telefone) : null}
                  mono
                />
              </Bloco>
            </section>

            {/* ------------------------------------------------- veículo */}
            <section className="evitar-quebra">
              <Bloco titulo="Veículo">
                <div className="grid grid-cols-3 gap-x-6">
                  <Linha rotulo="Placa" valor={v?.placa} mono destaque />
                  <Linha rotulo="Modelo" valor={v?.descricao || [v?.marca, v?.modelo].filter(Boolean).join(' ')} />
                  <Linha rotulo="Cor" valor={v?.cor} />
                  <Linha rotulo="Ano" valor={v?.ano ? String(v.ano) : null} mono />
                  <Linha rotulo="KM de entrada" valor={ordem.km !== null ? numeroBR(ordem.km, 0) : null} mono />
                  <Linha rotulo="Tipo" valor={v?.tipo} />
                </div>
              </Bloco>
            </section>

            {/* -------------------------------------- legenda + avarias */}
            <section className="evitar-quebra flex flex-col gap-2">
              <h2 className="font-display text-[11px] font-bold tracking-[0.16em] text-ink-2 uppercase">
                Avarias na entrada
              </h2>

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-y border-line py-1.5">
                {LEGENDA_AVARIAS.map((l) => (
                  <span key={l.valor} className="flex items-center gap-1.5 text-[10px]">
                    <span className="num flex size-[15px] items-center justify-center border border-ink font-bold">
                      {l.sigla}
                    </span>
                    {l.rotulo}
                  </span>
                ))}
              </div>

              {(d?.avarias.length ?? 0) === 0 ? (
                <p className="text-[11px] text-ink-2 italic">
                  Nenhuma avaria apontada na entrada deste veículo.
                </p>
              ) : (
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-ink">
                      <th className="w-[34px] py-1 pr-2 text-left font-display text-[9.5px] tracking-wider uppercase">Tipo</th>
                      <th className="w-[190px] py-1 pr-3 text-left font-display text-[9.5px] tracking-wider uppercase">Posição</th>
                      <th className="py-1 text-left font-display text-[9.5px] tracking-wider uppercase">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.avarias ?? []).map((a) => {
                      const l = LEGENDA_AVARIAS.find((x) => x.valor === a.tipo)
                      return (
                        <tr key={a.id} className="border-b border-line">
                          <td className="py-1">
                            <span className="num flex size-[15px] items-center justify-center border border-ink font-bold">
                              {l?.sigla}
                            </span>
                          </td>
                          <td className="py-1">{a.posicao}</td>
                          <td className="py-1 text-ink-2">{a.observacao || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* ----------------------------------------- itens do checklist */}
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-[11px] font-bold tracking-[0.16em] text-ink-2 uppercase">
                {d?.checklist.modelo_descricao}
              </h2>

              {[...secoesMapa.entries()].map(([secao, itens]) => (
                <div key={secao} className="evitar-quebra flex flex-col gap-1">
                  <h3 className="border-b border-ink pb-0.5 font-display text-[11px] font-semibold">{secao}</h3>
                  <ul className="grid grid-cols-2 gap-x-6">
                    {itens.map((i) => (
                      <li key={i.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-line py-1 text-[11px]">
                        <span className="min-w-0">
                          <span>{i.texto}</span>
                          {i.observacao && <span className="block text-[10px] text-ink-2 italic">{i.observacao}</span>}
                        </span>
                        <MarcacaoResposta resposta={i.resposta} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            {/* ---------------------------------- itens de conferência fixos */}
            <section className="evitar-quebra flex flex-col gap-1.5">
              <h2 className="font-display text-[11px] font-bold tracking-[0.16em] text-ink-2 uppercase">
                Conferência de cabine
              </h2>
              <div className="grid grid-cols-5 gap-2">
                {['Painel', 'Som', 'A/C', 'Vidro', 'Objetos'].map((x) => (
                  <div key={x} className="flex items-center gap-2 border border-line px-2 py-1.5 text-[11px]">
                    <span aria-hidden className="size-[14px] shrink-0 border border-ink" />
                    {x}
                  </div>
                ))}
              </div>
            </section>

            {/* ------------------------------------------------ observações */}
            <section className="evitar-quebra grid grid-cols-2 gap-4">
              <Bloco titulo="Problema relatado pelo cliente">
                <p className="min-h-[52px] text-[11px] leading-relaxed whitespace-pre-wrap">
                  {ordem.problema_alegado || d?.entrada?.observacoes || '—'}
                </p>
              </Bloco>
              <Bloco titulo="Objetos pessoais visíveis no veículo">
                <p className="min-h-[52px] text-[11px] leading-relaxed whitespace-pre-wrap">
                  {d?.entrada?.condicao_entrada || '—'}
                </p>
              </Bloco>
            </section>

            {/* ------------------------------------------------- assinaturas */}
            <section className="evitar-quebra mt-2 grid grid-cols-2 gap-10 pt-4">
              {['Cliente / motorista', 'Responsável técnico'].map((r) => (
                <div key={r} className="flex flex-col gap-1">
                  <div className="h-9 border-b border-ink" />
                  <span className="text-[10.5px] font-semibold">{r}</span>
                  <span className="text-[9.5px] text-ink-2">Nome legível, documento e data</span>
                </div>
              ))}
            </section>

            <p className="border-t border-line pt-2 text-[9px] leading-relaxed text-ink-2">
              Declaro que conferi o veículo nas condições descritas acima e que os apontamentos de avaria
              registrados neste documento correspondem ao estado em que o veículo foi entregue à oficina.
            </p>

            <footer className="num text-center text-[9px] text-ink-3">
              {e?.nome_fantasia || 'Tecnoar Freios'} · Checklist de Entrada da OS{' '}
              {String(ordem.numero).padStart(5, '0')} · gerado pelo Sistema Operacional Tecnoar
            </footer>
          </article>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-display text-[9.5px] font-bold tracking-[0.16em] text-ink-2 uppercase">{titulo}</h3>
      <div className="flex flex-col border-t border-line pt-1">{children}</div>
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  mono,
  destaque,
}: {
  rotulo: string
  valor?: string | null
  mono?: boolean
  destaque?: boolean
}) {
  return (
    <div className="flex gap-2 py-[1px] text-[11px]">
      <span className="w-[92px] shrink-0 text-ink-3">{rotulo}</span>
      <span
        className={[mono ? 'num' : '', destaque ? 'font-bold' : '', 'min-w-0 flex-1'].filter(Boolean).join(' ')}
      >
        {valor || '—'}
      </span>
    </div>
  )
}

function MarcacaoResposta({ resposta }: { resposta: RespostaChecklist | null }) {
  const ok = resposta === 'ok' || resposta === 'conforme'
  const ruim = resposta === 'nao_ok' || resposta === 'nao_conforme'
  const na = resposta === 'nao_se_aplica'

  return (
    <span className="grid grid-cols-3 gap-1 text-[9px]">
      <CaixaMarcada rotulo="OK" marcado={ok} />
      <CaixaMarcada rotulo="NOK" marcado={ruim} />
      <CaixaMarcada rotulo="N/A" marcado={na} />
    </span>
  )
}

function CaixaMarcada({ rotulo, marcado }: { rotulo: string; marcado: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className="num flex size-[13px] items-center justify-center border border-ink text-[9px] font-bold">
        {marcado ? 'X' : ''}
      </span>
      {rotulo}
    </span>
  )
}
