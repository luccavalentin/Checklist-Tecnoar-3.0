/**
 * Tecnoar — Clientes Premium
 * World-Class Design: Clean, sofisticado, hierarquia visual refinada
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Download,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro, cn } from '@/lib/utils'
import { mascaraDocumento } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useExclusao, DialogoExclusao } from '@/dados/exclusao'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao } from '@/componentes/ui/Botao'
import { Paginacao } from '@/componentes/ui/Tabela'
import { Confirmacao, Modal } from '@/componentes/ui/Sobreposicoes'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { UFS } from '@/lib/formatos'
import { FormularioCliente } from './FormularioCliente'
import type { ClienteListado, SituacaoRegistro, Tag as TagTipo, TipoPessoa } from '@/tipos/db'

const SELECT_LISTA =
  'id, codigo, tipo_pessoa, nome_razao, nome_fantasia, documento, email, celular, municipio, uf, situacao, origem, created_at, ' +
  'cliente_tags ( tag:tags ( id, nome, cor ) )'

/* ═══════════════════════════════════════════════════════════════
   BADGE DE TIPO
   ═══════════════════════════════════════════════════════════════ */
function TipoBadge({ tipo }: { tipo: TipoPessoa }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        tipo === 'fisica'
          ? 'bg-cyan/10 text-cyan border border-cyan/20'
          : 'bg-purple/10 text-purple border border-purple/20'
      )}
    >
      {tipo === 'fisica' ? 'PF' : 'PJ'}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════
   BADGE DE STATUS
   ═══════════════════════════════════════════════════════════════ */
function StatusBadge({ status, origem }: { status: SituacaoRegistro; origem?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold',
          status === 'ativo'
            ? 'bg-ok/10 text-ok border border-ok/20'
            : 'bg-surface-2 text-ink-3 border border-line'
        )}
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', status === 'ativo' ? 'bg-ok animate-pulse' : 'bg-ink-3')}
        />
        {status === 'ativo' ? 'Ativo' : 'Inativo'}
      </span>
      {origem === 'omie' && (
        <span className="rounded bg-blue/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue border border-blue/20">
          Omie
        </span>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAG BADGE
   ═══════════════════════════════════════════════════════════════ */
function TagBadge({ tag }: { tag: TagTipo }) {
  /* Tag sem cor definida cai no cinza do tema: sem isto o `style` recebia
     null e a pastilha ficava transparente sobre o fundo. */
  const cor = tag.cor ?? 'var(--c-ink-3)'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`,
        color: cor,
        border: `1px solid color-mix(in srgb, ${cor} 25%, transparent)`,
      }}
    >
      {tag.nome}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MODAL DE EXPORTAÇÃO - COM LOGO REAL
   ═══════════════════════════════════════════════════════════════ */
function ModalExport({
  aberto,
  aoFechar,
  total,
  clientes,
  tags,
}: {
  aberto: boolean
  aoFechar: () => void
  total: number
  clientes: ClienteListado[]
  tags: TagTipo[]
}) {
  const [formato, setFormato] = useState<'excel' | 'pdf'>('excel')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroUF, setFiltroUF] = useState('')
  const [filtroTag, setFiltroTag] = useState('')
  const [exportando, setExportando] = useState(false)
  const toast = useToast()

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => {
      if (filtroTipo && c.tipo_pessoa !== filtroTipo) return false
      if (filtroStatus && c.situacao !== filtroStatus) return false
      if (filtroUF && c.uf !== filtroUF) return false
      if (filtroTag) {
        const temTag = c.cliente_tags?.some(ct => ct.tag?.id === filtroTag)
        if (!temTag) return false
      }
      return true
    })
  }, [clientes, filtroTipo, filtroStatus, filtroUF, filtroTag])

  async function exportarExcel() {
    setExportando(true)
    try {
      // Gerar HTML profissional para Excel
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="UTF-8">
          <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Clientes</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
          <style>
            body { font-family: Arial, sans-serif; }
            .header { background: linear-gradient(135deg, #0b1c33 0%, #1a3a5c 100%); color: white; padding: 30px; }
            .logo-text { font-size: 32px; font-weight: bold; color: #fc6400; }
            .subtitle { font-size: 12px; color: #b8c5d6; margin-top: 5px; }
            .report-title { font-size: 18px; margin-top: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #fc6400; color: white; padding: 12px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
            td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
            tr:nth-child(even) { background: #f9f9f9; }
            .badge { padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-pf { background: #e6f4fb; color: #0086c4; }
            .badge-pj { background: #f3f0ff; color: #7c3aed; }
            .badge-ativo { background: #e6f6f1; color: #0e9c74; }
            .badge-inativo { background: #f0f0f0; color: #666; }
            .footer { margin-top: 20px; padding: 15px; text-align: right; font-size: 10px; color: #999; background: #f5f5f5; }
            .filters { background: #fff3e6; padding: 10px; margin-bottom: 15px; font-size: 10px; border-left: 4px solid #fc6400; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-text">TECNOAR</div>
            <div class="subtitle">CHECKLIST 3.0 — SISTEMA DE GESTÃO OPERACIONAL</div>
            <div class="report-title">Relatório de Clientes</div>
          </div>
          <div class="filters">
            <strong>Filtros aplicados:</strong>
            ${filtroTipo ? ` Tipo: ${filtroTipo === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'} |` : ''}
            ${filtroStatus ? ` Status: ${filtroStatus === 'ativo' ? 'Ativos' : 'Inativos'} |` : ''}
            ${filtroUF ? ` UF: ${filtroUF} |` : ''}
            ${filtroTag ? ` Tag: ${tags.find(t => t.id === filtroTag)?.nome || ''} |` : ''}
            <strong>Total: ${clientesFiltrados.length} registro(s)</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Nome / Razão Social</th>
                <th>Nome Fantasia</th>
                <th>Documento</th>
                <th>E-mail</th>
                <th>Celular</th>
                <th>UF</th>
                <th>Município</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Data Cadastro</th>
              </tr>
            </thead>
            <tbody>
              ${clientesFiltrados.map(c => `
                <tr>
                  <td>#${String(c.codigo).padStart(4, '0')}</td>
                  <td><span class="badge ${c.tipo_pessoa === 'fisica' ? 'badge-pf' : 'badge-pj'}">${c.tipo_pessoa === 'fisica' ? 'PF' : 'PJ'}</span></td>
                  <td>${c.nome_razao}</td>
                  <td>${c.nome_fantasia || '-'}</td>
                  <td>${c.documento ? mascaraDocumento(c.documento) : '-'}</td>
                  <td>${c.email || '-'}</td>
                  <td>${c.celular || '-'}</td>
                  <td>${c.uf || '-'}</td>
                  <td>${c.municipio || '-'}</td>
                  <td><span class="badge ${c.situacao === 'ativo' ? 'badge-ativo' : 'badge-inativo'}">${c.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
                  <td>${c.origem === 'omie' ? 'Omie' : 'Manual'}</td>
                  <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            Tecnoar Checklist 3.0 | Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
          </div>
        </body>
        </html>
      `

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clientes_tecnoar_${new Date().toISOString().slice(0, 10)}.xls`
      a.click()
      URL.revokeObjectURL(url)
      toast.ok('Excel baixado com sucesso!')
      aoFechar()
    } catch {
      toast.erro('Erro ao exportar')
    }
    setExportando(false)
  }

  async function exportarPDF() {
    setExportando(true)
    try {
      const conteudo = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 9px; }
            .header { background: linear-gradient(135deg, #0b1c33 0%, #1a3a5c 100%); color: white; padding: 25px; }
            .logo-text { font-size: 28px; font-weight: bold; color: #fc6400; letter-spacing: 3px; }
            .subtitle { font-size: 9px; color: #b8c5d6; margin-top: 3px; letter-spacing: 1px; }
            .report-info { display: flex; justify-content: space-between; margin-top: 20px; }
            .report-title { font-size: 14px; color: #333; border-bottom: 2px solid #fc6400; padding-bottom: 8px; }
            .filters { background: #fff3e6; padding: 10px; margin: 15px 0; font-size: 8px; border-left: 3px solid #fc6400; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #fc6400; color: white; padding: 8px 5px; text-align: left; font-size: 8px; text-transform: uppercase; }
            td { padding: 6px 5px; border-bottom: 1px solid #eee; }
            tr:nth-child(even) { background: #fafafa; }
            .badge { padding: 2px 5px; border-radius: 3px; font-size: 7px; font-weight: bold; }
            .badge-pf { background: #e6f4fb; color: #0086c4; }
            .badge-pj { background: #f3f0ff; color: #7c3aed; }
            .badge-ativo { background: #e6f6f1; color: #0e9c74; }
            .badge-inativo { background: #f0f0f0; color: #666; }
            .footer { margin-top: 25px; padding: 15px; background: #0b1c33; color: #b8c5d6; display: flex; justify-content: space-between; font-size: 8px; }
            .footer-logo { color: #fc6400; font-weight: bold; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-text">TECNOAR</div>
            <div class="subtitle">CHECKLIST 3.0 — SISTEMA DE GESTÃO OPERACIONAL</div>
            <div class="report-info">
              <div class="report-title">Relatório de Clientes</div>
              <div style="text-align: right; font-size: 9px;">
                <div>Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
                <div>às ${new Date().toLocaleTimeString('pt-BR')}</div>
              </div>
            </div>
          </div>
          <div class="filters">
            <strong>Filtros aplicados:</strong>
            ${filtroTipo ? ` Tipo: ${filtroTipo === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'} |` : ''}
            ${filtroStatus ? ` Status: ${filtroStatus === 'ativo' ? 'Ativos' : 'Inativos'} |` : ''}
            ${filtroUF ? ` UF: ${filtroUF} |` : ''}
            ${filtroTag ? ` Tag: ${tags.find(t => t.id === filtroTag)?.nome || ''} |` : ''}
            <strong>Total: ${clientesFiltrados.length} registro(s)</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Nome / Razão Social</th>
                <th>Documento</th>
                <th>E-mail</th>
                <th>Celular</th>
                <th>UF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${clientesFiltrados.map(c => `
                <tr>
                  <td>#${String(c.codigo).padStart(4, '0')}</td>
                  <td><span class="badge ${c.tipo_pessoa === 'fisica' ? 'badge-pf' : 'badge-pj'}">${c.tipo_pessoa === 'fisica' ? 'PF' : 'PJ'}</span></td>
                  <td>${c.nome_razao}</td>
                  <td>${c.documento ? mascaraDocumento(c.documento) : '-'}</td>
                  <td>${c.email || '-'}</td>
                  <td>${c.celular || '-'}</td>
                  <td>${c.uf || '-'}</td>
                  <td><span class="badge ${c.situacao === 'ativo' ? 'badge-ativo' : 'badge-inativo'}">${c.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <div><span class="footer-logo">TECNOAR</span> Checklist 3.0 — Sistema de Gestão Operacional</div>
            <div>Página 1 de 1</div>
          </div>
        </body>
        </html>
      `

      const win = window.open('', '_blank')
      if (win) {
        win.document.write(conteudo)
        win.document.close()
        setTimeout(() => win.print(), 250)
      }
      toast.ok('PDF gerado!')
      aoFechar()
    } catch {
      toast.erro('Erro ao gerar PDF')
    }
    setExportando(false)
  }


  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Exportar"
      descricao={`${total} registro(s) na base`}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            disabled={clientesFiltrados.length === 0}
            carregando={exportando}
            onClick={() => (formato === 'excel' ? exportarExcel() : exportarPDF())}
            iconeInicio={<Download />}
          >
            {exportando ? 'Exportando…' : `Baixar ${formato.toUpperCase()}`}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Formato</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormato('excel')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border py-3 text-[13px] font-semibold transition-all',
                  formato === 'excel'
                    ? 'border-accent bg-accent/10 text-accent shadow-sm'
                    : 'border-line text-ink-2 hover:border-ink/20'
                )}
              >
                <FileSpreadsheet className="size-5" />
                Excel
              </button>
              <button
                onClick={() => setFormato('pdf')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border py-3 text-[13px] font-semibold transition-all',
                  formato === 'pdf'
                    ? 'border-accent bg-accent/10 text-accent shadow-sm'
                    : 'border-line text-ink-2 hover:border-ink/20'
                )}
              >
                <FileSpreadsheet className="size-5" />
                PDF
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Filtros</label>
            <div className="grid grid-cols-2 gap-3">
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] focus:border-accent focus:outline-none">
                <option value="">Todos os tipos</option>
                <option value="juridica">Pessoa Jurídica</option>
                <option value="fisica">Pessoa Física</option>
              </select>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] focus:border-accent focus:outline-none">
                <option value="">Todos os status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
              <select value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] focus:border-accent focus:outline-none">
                <option value="">Todas as UFs</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] focus:border-accent focus:outline-none">
                <option value="">Todas as tags</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface-2/50 p-3">
            <p className="text-[12px] text-ink-2">
              <span className="font-bold text-accent">{clientesFiltrados.length}</span> cliente(s) serão exportados
            </p>
          </div>
        </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════
   KPI CARD — Premium Design Compacto Clicável
   ═══════════════════════════════════════════════════════════════ */
function KpiCard({
  valor,
  rotulo,
  subrotulo,
  cor,
  icone,
  indice,
  onClick,
}: {
  valor: string | number
  rotulo: string
  subrotulo?: string
  cor: string
  icone: React.ReactNode
  indice: number
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface to-surface-2 p-3 transition-all duration-300',
        onClick ? 'cursor-pointer hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5' : ''
      )}
      style={{ animationDelay: `${indice * 80}ms` }}
    >
      {/* Background Glow on Hover */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-15 blur-xl" style={{ backgroundColor: cor }} />
      </div>

      {/* Content */}
      <div className="relative flex items-center justify-between gap-3">
        {/* Text Side */}
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 truncate">{rotulo}</span>
          <span className="font-mono text-[22px] font-bold tracking-tight text-ink transition-transform duration-300 group-hover:scale-105">
            {valor}
          </span>
          {subrotulo && (
            <span className="text-[9px] text-ink-3 truncate">{subrotulo}</span>
          )}
        </div>

        {/* Icon Side */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 transition-all duration-300 group-hover:scale-110"
          style={{
            backgroundColor: `${cor}10`,
            boxShadow: `0 0 12px ${cor}20`
          }}
        >
          <div style={{ color: cor }} className="scale-90">
            {icone}
          </div>
        </div>
      </div>

      {/* Bottom Accent */}
      <div className="absolute bottom-0 left-0 h-[2px] w-0 rounded-b-xl transition-all duration-500 group-hover:w-full" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />

      {/* Click indicator */}
      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="text-[9px] font-medium text-ink-3 bg-surface/80 px-2 py-1 rounded-full backdrop-blur-sm">
            Ver lista →
          </span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LINHA DA TABELA
   ═══════════════════════════════════════════════════════════════ */
function ClienteRow({
  cliente,
  onEdit,
  onSituacao,
  onExcluir,
}: {
  cliente: ClienteListado
  /** Ausente quando o perfil não pode editar: a linha para de ser clicável. */
  onEdit?: () => void
  onSituacao?: () => void
  onExcluir?: () => void
}) {
  const [hover, setHover] = useState(false)
  const tags = cliente.cliente_tags?.map((ct) => ct.tag).filter(Boolean) as TagTipo[]

  return (
    <tr
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        'border-b border-line/60 transition-all duration-150',
        onEdit && 'cursor-pointer',
        hover && 'bg-accent/[0.04]'
      )}
    >
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] font-medium text-ink-3">#{String(cliente.codigo).padStart(4, '0')}</span>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-[13px] font-semibold text-ink max-w-[200px] truncate">{cliente.nome_razao}</p>
        {cliente.nome_fantasia && cliente.nome_fantasia.trim() !== cliente.nome_razao.trim() && (
          <p className="text-[11px] text-ink-3 max-w-[200px] truncate">{cliente.nome_fantasia}</p>
        )}
      </td>
      <td className="px-4 py-3.5"><TipoBadge tipo={cliente.tipo_pessoa} /></td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] text-ink-2">
          {cliente.documento ? mascaraDocumento(cliente.documento) : '—'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {cliente.celular && <p className="font-mono text-[11px] text-ink">{cliente.celular}</p>}
        {cliente.email && <p className="text-[10px] text-ink-3 max-w-[140px] truncate">{cliente.email}</p>}
        {!cliente.celular && !cliente.email && <span className="text-[11px] text-ink-3">—</span>}
      </td>
      <td className="px-4 py-3.5">
        {cliente.uf ? (
          <span className="inline-flex items-center rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink border border-line">
            {cliente.uf}
          </span>
        ) : (
          <span className="text-[11px] text-ink-3">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => <TagBadge key={tag.id} tag={tag} />)}
          {tags.length > 2 && (
            <span className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium text-ink-3 border border-line">
              +{tags.length - 2}
            </span>
          )}
          {tags.length === 0 && <span className="text-[11px] text-ink-3">—</span>}
        </div>
      </td>
      <td className="px-4 py-3.5"><StatusBadge status={cliente.situacao} origem={cliente.origem} /></td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex justify-end gap-1">
          {onSituacao && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              onClick={(e) => { e.stopPropagation(); onSituacao() }}
            >
              {cliente.situacao === 'ativo' ? 'Inativar' : 'Ativar'}
            </Botao>
          )}
          {onExcluir && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              /* A linha inteira abre o cliente; sem isto o clique em excluir
                 abriria o cadastro por baixo da confirmação. */
              onClick={(e) => { e.stopPropagation(); onExcluir() }}
            >
              Excluir
            </Botao>
          )}
        </div>
      </td>
    </tr>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function Clientes() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fTipo, setFTipo] = useState('')
  const [fUF, setFUF] = useState('')
  const [fSituacao, setFSituacao] = useState<'' | SituacaoRegistro>('ativo')
  const [fTag, setFTag] = useState('')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [mostrarExport, setMostrarExport] = useState(false)

  const [editando, setEditando] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<ClienteListado | null>(null)

  const podeVer = pode('clientes', 'visualizar')
  const podeCriar = pode('clientes', 'criar')
  const podeEditar = pode('clientes', 'editar')
  const podeInativar = pode('clientes', 'inativar')

  const exclusao = useExclusao({ tabela: 'clientes', invalidar: [['clientes']] })

  // Estatísticas
  const stats = useQuery({
    queryKey: ['clientes', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, pj, pf, ativos] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'juridica'),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'fisica'),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
      ])
      return {
        total: total.count ?? 0,
        pj: pj.count ?? 0,
        pf: pf.count ?? 0,
        ativos: ativos.count ?? 0,
      }
    },
  })

  const tags = useQuery({
    queryKey: ['tags', 'ativas'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TagTipo[]> => {
      const { data, error } = await supabase.from('tags').select('*').eq('situacao', 'ativo').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        const digitos = t.replace(/\D/g, '')
        const partes = [`nome_razao.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`, `email.ilike.%${t}%`]
        if (digitos.length >= 3) partes.push(`documento_digitos.ilike.%${digitos}%`)
        r = r.or(partes.join(','))
      }
      if (fTipo) r = r.eq('tipo_pessoa', fTipo)
      if (fUF) r = r.eq('uf', fUF)
      if (fSituacao) r = r.eq('situacao', fSituacao)
      if (fTag) r = r.eq('cliente_tags.tag_id', fTag)
      return r
    },
    [ctrl.busca, fTipo, fUF, fSituacao, fTag],
  )

  const lista = useListagem<ClienteListado>({
    chave: ['clientes', 'lista', ctrl.busca, fTipo, fUF, fSituacao, fTag, ctrl.pagina, ctrl.porPagina],
    tabela: 'clientes',
    select: fTag ? SELECT_LISTA.replace('cliente_tags (', 'cliente_tags!inner (') : SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'nome_razao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const todosClientes = useQuery({
    queryKey: ['clientes', 'todos'],
    enabled: mostrarExport,
    queryFn: async (): Promise<ClienteListado[]> => {
      let q = supabase.from('clientes').select(SELECT_LISTA).order('nome_razao')
      if (fSituacao) q = q.eq('situacao', fSituacao)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as ClienteListado[]
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (c: ClienteListado) => {
      const nova: SituacaoRegistro = c.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('clientes').update({ situacao: nova }).eq('id', c.id)
      if (error) throw error
      return nova
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['clientes'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  const limparFiltros = () => {
    setFTipo(''); setFUF(''); setFSituacao('ativo'); setFTag('')
    ctrl.reiniciar()
  }

  const temFiltros = fTipo || fUF || fSituacao !== 'ativo' || fTag

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Clientes</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Clientes</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}

          <button
            onClick={() => setMostrarExport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-ink-2 transition-all hover:border-accent/30 hover:text-accent"
          >
            <Download className="size-4" />
            Exportar
          </button>

          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo Cliente
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          indice={0}
          valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'}
          rotulo="Total"
          subrotulo="clientes"
          cor="var(--c-accent)"
          icone={<Users className="size-4" />}
          onClick={() => { setFTipo(''); setFSituacao(''); ctrl.setBusca(''); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={1}
          valor={stats.data?.pj.toLocaleString('pt-BR') ?? '—'}
          rotulo="Jurídica"
          subrotulo="empresas"
          cor="var(--c-accent)"
          icone={<Building2 className="size-4" />}
          onClick={() => { setFTipo('juridica'); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={2}
          valor={stats.data?.pf.toLocaleString('pt-BR') ?? '—'}
          rotulo="Física"
          subrotulo="clientes"
          cor="var(--c-cyan)"
          icone={<User className="size-4" />}
          onClick={() => { setFTipo('fisica'); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={3}
          valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'}
          rotulo="Ativos"
          subrotulo="no sistema"
          cor="var(--c-ok)"
          icone={<TrendingUp className="size-4" />}
          onClick={() => { setFTipo(''); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }}
        />
      </div>

      {/* Busca */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
          <input
            type="text"
            value={ctrl.busca}
            onChange={(e) => ctrl.setBusca(e.target.value)}
            placeholder="Buscar por nome, documento ou e-mail..."
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-10 text-[13px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
          {ctrl.busca && (
            <button onClick={() => ctrl.setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-semibold transition-all',
            mostrarFiltros || temFiltros
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line bg-surface text-ink-2 hover:border-ink/20'
          )}
        >
          <Filter className="size-4" />
          Filtros
          {temFiltros && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {[fTipo, fUF, fSituacao !== 'ativo', fTag].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Painel de Filtros */}
      {mostrarFiltros && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink">Filtros</span>
            <button onClick={limparFiltros} className="text-[10px] text-ink-3 underline hover:text-ink">
              Limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">Tipo:</label>
              <select value={fTipo} onChange={(e) => { setFTipo(e.target.value); ctrl.reiniciar() }} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="">Todos</option>
                <option value="juridica">Jurídica</option>
                <option value="fisica">Física</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">Status:</label>
              <select value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as '' | SituacaoRegistro); ctrl.reiniciar() }} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
                <option value="">Todos</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">UF:</label>
              <select value={fUF} onChange={(e) => { setFUF(e.target.value); ctrl.reiniciar() }} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="">Todas</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">Tag:</label>
              <select value={fTag} onChange={(e) => { setFTag(e.target.value); ctrl.reiniciar() }} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="">Todas</option>
                {tags.data?.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Chips de Filtros */}
      {temFiltros && (
        <div className="flex flex-wrap gap-2">
          {fTipo && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">{fTipo === 'fisica' ? 'PF' : 'PJ'}<button onClick={() => { setFTipo(''); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
          {fUF && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">UF: {fUF}<button onClick={() => { setFUF(''); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
          {fSituacao !== 'ativo' && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">{fSituacao === 'inativo' ? 'Inativos' : 'Todos'}<button onClick={() => { setFSituacao('ativo'); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
          {fTag && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">{tags.data?.find((t) => t.id === fTag)?.nome}<button onClick={() => { setFTag(''); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/60">
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">ID</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Cliente</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Tipo</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Documento</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Contato</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">UF</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Tags</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Status</th>
                <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3" />
              </tr>
            </thead>
            <tbody>
              {lista.linhas.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  onEdit={podeEditar ? () => setEditando(cliente.id) : undefined}
                  onSituacao={podeInativar ? () => setAlvo(cliente) : undefined}
                  onExcluir={podeInativar ? () => exclusao.pedir(cliente.id) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>

        {lista.estado === 'carregando' && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {lista.estado === 'ok' && lista.linhas.length === 0 && (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
              <User className="size-6 text-ink-3" />
            </div>
            <p className="font-medium text-ink">
              {ctrl.busca || temFiltros ? 'Nenhum resultado' : 'Nenhum cliente cadastrado'}
            </p>
            <p className="mt-1 text-[12px] text-ink-3">
              {ctrl.busca || temFiltros ? 'Ajuste a busca' : 'Clique em Novo Cliente'}
            </p>
          </div>
        )}

        {lista.estado === 'erro' && (
          <div className="py-16 text-center">
            <p className="text-[13px] text-crit">{mensagemErro(lista.erro)}</p>
            <button onClick={lista.recarregar} className="mt-2 text-[12px] text-accent underline">Tentar novamente</button>
          </div>
        )}
      </div>

      {lista.estado === 'ok' && lista.total !== null && lista.total > 0 && (
        <Paginacao pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={lista.total} aoMudarPagina={ctrl.setPagina} />
      )}

      <ModalExport
        aberto={mostrarExport}
        aoFechar={() => setMostrarExport(false)}
        total={lista.total ?? 0}
        clientes={todosClientes.data ?? []}
        tags={tags.data ?? []}
      />

      <FormularioCliente
        aberto={criando || Boolean(editando)}
        clienteId={editando}
        aoFechar={() => { setCriando(false); setEditando(null) }}
      />

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar cliente?' : 'Reativar cliente?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={<><strong>{alvo?.nome_razao}</strong> {alvo?.situacao === 'ativo' ? 'deixa de aparecer nas Seleções' : 'volta a ficar disponível'}.</>}
      />
      <DialogoExclusao ctrl={exclusao} />

    </div>
  )
}
