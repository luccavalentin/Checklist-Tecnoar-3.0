import type { Content } from 'pdfmake/interfaces'
import { supabase } from '@/lib/supabase'
import { mascaraDocumento, moeda } from '@/lib/formatos'
import {
  COR,
  REGUA,
  campo,
  carregarLogo,
  documento,
  gerarPdfBlob,
  gradeCampos,
  nomeArquivo,
  tabela,
  timbre,
  tituloSecao,
  baixarPdf,
  type Empresa,
} from '@/documentos/pdf'
import { sosDetalhe, sosInfoPublica, sosUrlsArquivos } from './api'
import { OCORRENCIAS, PRIORIDADES, formatarDuracao } from './rotulos'
import type { AnexoSOS, DetalheChamado } from './tipos'

/**
 * Laudo do atendimento SOS em PDF — o documento que vai para o cliente, o
 * gestor da frota e a seguradora: o que aconteceu, quando, quem atendeu, o
 * que foi feito, com fotos antes/depois, itens com valores, a assinatura do
 * orçamento e a avaliação. Mesmo papel timbrado dos documentos da OS.
 *
 * Funciona na central (Checklist) e no app (cliente e mecânico): cada um só
 * consegue gerar o laudo dos chamados que já pode ver — os dados vêm da mesma
 * RPC da tela.
 */

const ETAPA_FOTO: Record<string, string> = {
  abertura: 'Abertura',
  diagnostico: 'Diagnóstico',
  antes: 'Antes',
  depois: 'Depois',
  conclusao: 'Conclusão',
  outro: 'Outro',
}

function quando(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function segundosEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000))
}

/**
 * Imagem do bucket → JPEG em data URL, reduzida. O pdfmake só entende JPEG e
 * PNG; o canvas converte qualquer formato que o navegador abra (inclusive
 * WebP) e mantém o arquivo leve para mandar por WhatsApp.
 */
async function imagemParaDataUrl(url: string, maxLado = 1100, formato: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    const bitmap = await createImageBitmap(blob)
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (formato === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return canvas.toDataURL(formato, 0.82)
  } catch {
    return null
  }
}

/** Dados da empresa: completos para a equipe; o essencial (público) para o cliente. */
async function carregarEmpresa(): Promise<Empresa> {
  const { data: e } = await supabase.from('dados_empresa').select('*').maybeSingle()
  if (e) {
    return {
      nome: e.nome_fantasia || e.razao_social || 'Tecnoar Freios',
      razaoSocial: e.razao_social ?? null,
      cnpj: e.cnpj ? mascaraDocumento(e.cnpj) : null,
      inscricaoEstadual: e.inscricao_estadual ?? null,
      inscricaoMunicipal: e.inscricao_municipal ?? null,
      telefone: e.telefone ?? null,
      endereco: e.endereco ?? null,
      email: e.email ?? null,
    }
  }
  const info = await sosInfoPublica().catch(() => null)
  return { nome: info?.empresa ?? 'Tecnoar Freios', telefone: info?.telefone ?? null }
}

async function montarLaudo(d: DetalheChamado) {
  const c = d.chamado
  const [empresa, logo] = await Promise.all([carregarEmpresa(), carregarLogo()])

  const fotos = (d.anexos ?? []).filter((a: AnexoSOS) => a.tipo === 'foto').slice(0, 8)
  const caminhos = [...fotos.map((f) => f.caminho), ...(c.orcamento_assinatura ? [c.orcamento_assinatura] : [])]
  const urls = caminhos.length ? await sosUrlsArquivos(caminhos, 600).catch(() => ({}) as Record<string, string>) : {}
  const imagens = await Promise.all(
    fotos.map(async (f) => ({ foto: f, dados: urls[f.caminho] ? await imagemParaDataUrl(urls[f.caminho]) : null })),
  )
  const assinatura = c.orcamento_assinatura && urls[c.orcamento_assinatura]
    ? await imagemParaDataUrl(urls[c.orcamento_assinatura], 700, 'image/png')
    : null

  const ocorrencia = OCORRENCIAS[c.tipo_ocorrencia]?.rotulo ?? c.ocorrencia_rotulo
  const veiculo = d.veiculo
  const conteudo: Content[] = [
    timbre(empresa, logo, 'Laudo de atendimento SOS', c.protocolo, quando(c.recebido_em) ?? undefined),
    REGUA,

    tituloSecao('Cliente e veículo'),
    gradeCampos(
      [
        campo('Cliente', d.cliente?.nome, true),
        campo('Telefone', d.cliente?.telefone ?? null),
        campo('Placa', veiculo?.placa ?? null, true),
        campo('Veículo', veiculo ? [veiculo.marca, veiculo.modelo, veiculo.ano].filter(Boolean).join(' ') || veiculo.descricao : null),
        campo('KM', veiculo?.km_atual != null ? veiculo.km_atual.toLocaleString('pt-BR') : null),
        campo('Tipo', veiculo?.tipo ?? null),
      ],
      3,
    ),

    tituloSecao('Atendimento'),
    gradeCampos(
      [
        campo('Problema relatado', ocorrencia, true),
        campo('Prioridade', PRIORIDADES[c.prioridade]?.rotulo ?? c.prioridade),
        campo('Situação', c.status_rotulo),
        campo('Mecânico', d.mecanico?.nome ?? null),
        campo('Local', c.endereco ?? (c.latitude != null && c.longitude != null ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` : null)),
        campo('OS gerada', d.os ? String(d.os.numero).padStart(5, '0') : null),
      ],
      3,
    ),
    c.descricao ? { text: [{ text: 'Relato do cliente: ', style: 'rotulo' }, { text: c.descricao, style: 'valor' }], margin: [0, 0, 0, 6] } : { text: '' },

    tituloSecao('Linha do tempo'),
    tabela(
      ['Etapa', 'Quando', 'Tempo'],
      [
        ['Pedido recebido', quando(c.recebido_em), ''],
        ['Mecânico aceitou', quando(c.aceito_em), formatarDuracao(segundosEntre(c.recebido_em, c.aceito_em))],
        ['Chegou ao local', quando(c.chegou_em), formatarDuracao(segundosEntre(c.a_caminho_em ?? c.aceito_em, c.chegou_em))],
        ['Serviço iniciado', quando(c.iniciado_em), ''],
        ['Serviço finalizado', quando(c.finalizado_em), formatarDuracao(segundosEntre(c.iniciado_em, c.finalizado_em))],
      ]
        .filter((l) => l[1])
        .map((l) => l.map((t, i) => ({ text: t ?? '', style: i === 0 ? 'td' : 'tdFraco' }))),
      ['*', 140, 80],
    ),
    c.sla_chegada_min && c.chegou_em
      ? {
          text: (segundosEntre(c.recebido_em, c.chegou_em) ?? 0) <= c.sla_chegada_min * 60
            ? `Chegada dentro do prazo do contrato (${c.sla_chegada_min} min).`
            : `Chegada fora do prazo do contrato (${c.sla_chegada_min} min).`,
          style: 'aviso',
          margin: [0, 0, 0, 6],
        }
      : { text: '' },

    tituloSecao('Diagnóstico e serviço'),
    campo('Diagnóstico', c.diagnostico),
    campo('Serviço realizado', c.servico_realizado),
    ...(c.observacoes_finais ? [campo('Observações', c.observacoes_finais)] : []),
  ]

  const itens = d.itens ?? []
  if (itens.length) {
    const total = itens.reduce((s, i) => s + Number(i.valor_total || 0), 0)
    conteudo.push(
      tituloSecao('Peças e serviços'),
      tabela(
        ['Descrição', 'Qtd', 'Unitário', 'Total'],
        [
          ...itens.map((i) => [
            { text: `${i.descricao}${i.codigo ? `  ·  ${i.codigo}` : ''}`, style: 'td' },
            { text: Number(i.quantidade).toLocaleString('pt-BR'), style: 'td', alignment: 'right' as const },
            { text: moeda(i.valor_unitario), style: 'td', alignment: 'right' as const },
            { text: moeda(i.valor_total), style: 'td', alignment: 'right' as const },
          ]),
          [
            { text: 'Total', style: 'valorForte' },
            { text: '' },
            { text: '' },
            { text: moeda(total), style: 'valorForte', alignment: 'right' as const },
          ],
        ],
        ['*', 40, 70, 80],
      ),
    )
  }

  if (c.orcamento_status) {
    const rotulo = { pendente: 'Aguardando o cliente', aprovado: 'Aprovado pelo cliente', recusado: 'Recusado' }[c.orcamento_status]
    conteudo.push(
      tituloSecao('Orçamento'),
      gradeCampos(
        [
          campo('Situação', rotulo, true),
          campo('Valor', c.orcamento_valor != null ? moeda(c.orcamento_valor) : null),
          campo('Respondido em', quando(c.orcamento_respondido_em)),
        ],
        3,
      ),
      ...(c.orcamento_observacao ? [campo('Observação', c.orcamento_observacao)] : []),
      ...(assinatura
        ? [{ stack: [{ image: assinatura, width: 180, margin: [0, 2, 0, 2] as [number, number, number, number] }, { text: 'Assinatura do cliente no app', style: 'rotulo' }], unbreakable: true }]
        : []),
    )
  }

  const comFoto = imagens.filter((i) => i.dados)
  if (comFoto.length) {
    conteudo.push(tituloSecao('Registro fotográfico'))
    for (let i = 0; i < comFoto.length; i += 2) {
      conteudo.push({
        columns: comFoto.slice(i, i + 2).map(({ foto, dados }) => ({
          width: '50%',
          stack: [
            { image: dados as string, fit: [245, 180] as [number, number] },
            { text: [ETAPA_FOTO[foto.etapa] ?? 'Foto', foto.legenda].filter(Boolean).join(' — '), style: 'rotulo', margin: [0, 2, 0, 0] as [number, number, number, number] },
          ],
        })),
        columnGap: 14,
        margin: [0, 0, 0, 10],
        unbreakable: true,
      })
    }
  }

  if (c.avaliacao_nota) {
    conteudo.push(
      tituloSecao('Avaliação do cliente'),
      { text: `${'★'.repeat(c.avaliacao_nota)}${'☆'.repeat(5 - c.avaliacao_nota)}  ${c.avaliacao_nota}/5`, color: COR.marca, fontSize: 11, margin: [0, 0, 0, 2] },
      ...(c.avaliacao_comentario ? [{ text: `“${c.avaliacao_comentario}”`, style: 'aviso' }] : []),
    )
  }

  conteudo.push({
    text: 'Documento gerado pelo SOS Tecnoar a partir dos registros do atendimento (horários, posição, fotos e itens lançados em campo).',
    style: 'aviso',
    margin: [0, 16, 0, 0],
  })

  return {
    definicao: documento(conteudo, {
      titulo: `Laudo SOS ${c.protocolo}`,
      assunto: `Atendimento SOS ${c.protocolo} — ${d.cliente?.nome ?? ''}`,
      rodape: `SOS ${c.protocolo} · ${empresa.nome}`,
    }),
    nome: nomeArquivo(['laudo', c.protocolo, veiculo?.placa]),
  }
}

/** Baixa o PDF (central, computador). */
export async function baixarLaudoSOS(chamadoId: string): Promise<void> {
  const { definicao, nome } = await montarLaudo(await sosDetalhe(chamadoId))
  await baixarPdf(definicao, nome)
}

/** O PDF pronto, como arquivo — para compartilhar num segundo toque. */
export async function gerarLaudoArquivo(chamadoId: string): Promise<File> {
  const { definicao, nome } = await montarLaudo(await sosDetalhe(chamadoId))
  const blob = await gerarPdfBlob(definicao)
  return new File([blob], nome, { type: 'application/pdf' })
}

/** O aparelho abre a folha de compartilhar com este arquivo? */
export function podeCompartilharArquivo(arquivo: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  return !!nav.share && !!nav.canShare?.({ files: [arquivo] })
}

/**
 * Entrega o arquivo: folha de compartilhar (WhatsApp, e-mail…) onde existe,
 * download onde não. No iPhone, CHAME DIRETO DO TOQUE: o Safari recusa o
 * compartilhamento se houve espera (montar o PDF) entre o toque e a chamada —
 * por isso o laudo é preparado antes (`gerarLaudoArquivo`) e entregue aqui.
 */
export async function entregarArquivo(arquivo: File): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  if (podeCompartilharArquivo(arquivo)) {
    try {
      await navigator.share({ files: [arquivo], title: arquivo.name })
      return 'compartilhado'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelado'
    }
  }
  const url = URL.createObjectURL(arquivo)
  const a = document.createElement('a')
  a.href = url
  a.download = arquivo.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'baixado'
}

/**
 * Tudo num toque só: bom no computador e no Android. No iPhone prefira
 * `useLaudoSOS` (prepara e depois compartilha), senão cai no download.
 */
export async function compartilharLaudoSOS(chamadoId: string): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  return entregarArquivo(await gerarLaudoArquivo(chamadoId))
}
