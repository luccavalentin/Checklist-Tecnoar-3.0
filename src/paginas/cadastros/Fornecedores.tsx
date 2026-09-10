/**
 * Tecnoar — Fornecedores Premium
 * World-Class Design: Clean, sofisticado, hierarquia visual refinada
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Building2,
  Download,
  FileSpreadsheet,
  PackageSearch,
  Plus,
  TrendingUp,
  Truck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro, cn } from '@/lib/utils'
import { UFS, mascaraCEP, mascaraDocumento, mascaraTelefone, somenteDigitos, validarDocumento } from '@/lib/formatos'
import { consultarCNPJ } from '@/lib/consultasExternas'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useExclusao, DialogoExclusao } from '@/dados/exclusao'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado, Selecao } from '@/componentes/ui/Campo'
import { CampoCEP } from '@/componentes/ui/CampoCEP'
import { Paginacao } from '@/componentes/ui/Tabela'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Confirmacao, Modal, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { Fornecedor, SituacaoRegistro, TipoPessoa } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   TIPOS
   ═══════════════════════════════════════════════════════════════ */
interface FormFornecedor {
  tipo_pessoa: TipoPessoa
  descricao: string
  nome_fantasia: string
  documento: string
  inscricao_estadual: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  complemento: string
  municipio: string
  uf: string
  telefone1: string
  telefone2: string
  email: string
  observacoes: string
  situacao: SituacaoRegistro
}

const VAZIO: FormFornecedor = {
  tipo_pessoa: 'juridica',
  descricao: '',
  nome_fantasia: '',
  documento: '',
  inscricao_estadual: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  complemento: '',
  municipio: '',
  uf: '',
  telefone1: '',
  telefone2: '',
  email: '',
  observacoes: '',
  situacao: 'ativo',
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
   SEÇÃO DO FORMULÁRIO
   ═══════════════════════════════════════════════════════════════ */
function SecaoForm({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line bg-surface-2/50 px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LINHA DE CAMPOS
   ═══════════════════════════════════════════════════════════════ */
function LinhaCampos({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

/* ═══════════════════════════════════════════════════════════════
   MODAL DE EXPORTAÇÃO
   ═══════════════════════════════════════════════════════════════ */
function ModalExport({
  aberto,
  aoFechar,
  total,
  fornecedores,
}: {
  aberto: boolean
  aoFechar: () => void
  total: number
  fornecedores: Fornecedor[]
}) {
  const [formato, setFormato] = useState<'excel' | 'pdf'>('excel')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroUF, setFiltroUF] = useState('')
  const [exportando, setExportando] = useState(false)
  const toast = useToast()

  const filtrados = useMemo(() => {
    return fornecedores.filter(f => {
      if (filtroTipo && f.tipo_pessoa !== filtroTipo) return false
      if (filtroStatus && f.situacao !== filtroStatus) return false
      if (filtroUF && f.uf !== filtroUF) return false
      return true
    })
  }, [fornecedores, filtroTipo, filtroStatus, filtroUF])

  async function exportarExcel() {
    setExportando(true)
    try {
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="UTF-8">
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
            <div class="report-title">Relatório de Fornecedores</div>
          </div>
          <div class="filters">
            <strong>Filtros aplicados:</strong>
            ${filtroTipo ? ` Tipo: ${filtroTipo === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'} |` : ''}
            ${filtroStatus ? ` Status: ${filtroStatus === 'ativo' ? 'Ativos' : 'Inativos'} |` : ''}
            ${filtroUF ? ` UF: ${filtroUF} |` : ''}
            <strong>Total: ${filtrados.length} registro(s)</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição / Razão Social</th>
                <th>Nome Fantasia</th>
                <th>Tipo</th>
                <th>CNPJ/CPF</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Município</th>
                <th>UF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.map(f => `
                <tr>
                  <td>#${String(f.codigo).padStart(6, '0')}</td>
                  <td>${f.descricao}</td>
                  <td>${f.nome_fantasia || '-'}</td>
                  <td><span class="badge ${f.tipo_pessoa === 'fisica' ? 'badge-pf' : 'badge-pj'}">${f.tipo_pessoa === 'fisica' ? 'PF' : 'PJ'}</span></td>
                  <td>${f.documento ? mascaraDocumento(f.documento) : '-'}</td>
                  <td>${f.telefone1 || '-'}</td>
                  <td>${f.email || '-'}</td>
                  <td>${f.municipio || '-'}</td>
                  <td>${f.uf || '-'}</td>
                  <td><span class="badge ${f.situacao === 'ativo' ? 'badge-ativo' : 'badge-inativo'}">${f.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
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
      a.download = `fornecedores_tecnoar_${new Date().toISOString().slice(0, 10)}.xls`
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
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-text">TECNOAR</div>
            <div class="subtitle">CHECKLIST 3.0 — SISTEMA DE GESTÃO OPERACIONAL</div>
            <div class="report-info">
              <div class="report-title">Relatório de Fornecedores</div>
              <div style="text-align: right; font-size: 9px;">
                <div>Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
                <div>às ${new Date().toLocaleTimeString('pt-BR')}</div>
              </div>
            </div>
          </div>
          <div class="filters">
            <strong>Filtros:</strong>
            ${filtroTipo ? ` Tipo: ${filtroTipo === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'} |` : ''}
            ${filtroStatus ? ` Status: ${filtroStatus === 'ativo' ? 'Ativos' : 'Inativos'} |` : ''}
            ${filtroUF ? ` UF: ${filtroUF} |` : ''}
            <strong>Total: ${filtrados.length} registro(s)</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>CNPJ/CPF</th>
                <th>Telefone</th>
                <th>UF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.map(f => `
                <tr>
                  <td>#${String(f.codigo).padStart(6, '0')}</td>
                  <td>${f.descricao}</td>
                  <td><span class="badge ${f.tipo_pessoa === 'fisica' ? 'badge-pf' : 'badge-pj'}">${f.tipo_pessoa === 'fisica' ? 'PF' : 'PJ'}</span></td>
                  <td>${f.documento ? mascaraDocumento(f.documento) : '-'}</td>
                  <td>${f.telefone1 || '-'}</td>
                  <td>${f.uf || '-'}</td>
                  <td><span class="badge ${f.situacao === 'ativo' ? 'badge-ativo' : 'badge-inativo'}">${f.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
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
            disabled={filtrados.length === 0}
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
              <select value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] focus:border-accent focus:outline-none sm:col-span-2">
                <option value="">Todas as UFs</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface-2/50 p-3">
            <p className="text-[12px] text-ink-2">
              <span className="font-bold text-accent">{filtrados.length}</span> fornecedor(es) serão exportados
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
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-15 blur-xl" style={{ backgroundColor: cor }} />
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 truncate">{rotulo}</span>
          <span className="font-mono text-[22px] font-bold tracking-tight text-ink transition-transform duration-300 group-hover:scale-105">
            {valor}
          </span>
          {subrotulo && <span className="text-[9px] text-ink-3 truncate">{subrotulo}</span>}
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 transition-all duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${cor}10`, boxShadow: `0 0 12px ${cor}20` }}
        >
          <div style={{ color: cor }} className="scale-90">{icone}</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-0 rounded-b-xl transition-all duration-500 group-hover:w-full" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />
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
function FornecedorRow({
  fornecedor,
  onEdit,
  onSituacao,
  onExcluir,
}: {
  fornecedor: Fornecedor
  /** Ausente quando o perfil não pode editar: a linha para de ser clicável. */
  onEdit?: () => void
  onSituacao?: () => void
  onExcluir?: () => void
}) {
  const [hover, setHover] = useState(false)

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
        <span className="font-mono text-[11px] font-medium text-ink-3">#{String(fornecedor.codigo).padStart(6, '0')}</span>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-[13px] font-semibold text-ink max-w-[200px] truncate">{fornecedor.descricao}</p>
        {fornecedor.municipio && (
          <p className="text-[11px] text-ink-3 max-w-[200px] truncate">
            {fornecedor.municipio}{fornecedor.uf ? ` · ${fornecedor.uf}` : ''}
          </p>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className="text-[11px] text-ink-2">{fornecedor.nome_fantasia || '—'}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold uppercase',
          fornecedor.tipo_pessoa === 'fisica'
            ? 'bg-cyan/10 text-cyan border border-cyan/20'
            : 'bg-purple/10 text-purple border border-purple/20'
        )}>
          {fornecedor.tipo_pessoa === 'fisica' ? 'PF' : 'PJ'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] text-ink-2">
          {fornecedor.documento ? mascaraDocumento(fornecedor.documento) : '—'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-[11px] text-ink">{fornecedor.telefone1 || '—'}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-[11px] text-ink-2 max-w-[150px] truncate block">{fornecedor.email || '—'}</span>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={fornecedor.situacao} origem={fornecedor.origem} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex justify-end gap-1">
          {onSituacao && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              onClick={(e) => { e.stopPropagation(); onSituacao() }}
            >
              {fornecedor.situacao === 'ativo' ? 'Inativar' : 'Ativar'}
            </Botao>
          )}
          {onExcluir && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              /* A linha inteira abre o fornecedor: o clique em excluir para
                 aqui, senão o cadastro abriria por baixo da confirmação. */
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
   MODAL DE FORMULÁRIO
   ═══════════════════════════════════════════════════════════════ */
function ModalFormulario({
  aberto,
  aoFechar,
  editando,
  form,
  erro,
  aviso,
  consultando,
  tipo,
  onTipoChange,
  onConsultar,
  onSalvar,
  podeSalvar,
  salvarPending,
}: {
  aberto: boolean
  aoFechar: () => void
  editando: Fornecedor | null
  form: ReturnType<typeof useForm<FormFornecedor>>
  erro: string | null
  aviso: string | null
  consultando: boolean
  tipo: TipoPessoa
  onTipoChange: (v: TipoPessoa) => void
  onConsultar: () => void
  onSalvar: () => void
  podeSalvar: boolean
  salvarPending: boolean
}) {

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      largura="xl"
      titulo={editando ? 'Editar fornecedor' : 'Novo fornecedor'}
      descricao={
        editando ? `Código ${String(editando.codigo).padStart(6, '0')}` : 'Cadastro completo'
      }
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            disabled={!podeSalvar}
            carregando={salvarPending}
            onClick={form.handleSubmit(onSalvar)}
          >
            Salvar
          </Botao>
        </>
      }
    >
            <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(onSalvar)}>
              {erro && (
                <div className="rounded-lg border border-crit/30 bg-crit/5 px-4 py-3 text-[13px] text-crit-ink">
                  {erro}
                </div>
              )}
              {aviso && (
                <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[13px] text-warn-ink">
                  {aviso}
                </div>
              )}

              {/* Dados */}
              <SecaoForm title="Identificação">
                <div className="space-y-4">
                  <div className="flex items-center gap-6">
                    <span className="text-[11px] font-medium text-ink-3 w-24">Tipo</span>
                    <Segmentado
                      rotuloGrupo="Tipo"
                      valor={tipo}
                      onChange={onTipoChange}
                      opcoes={[
                        { valor: 'juridica' as TipoPessoa, rotulo: 'Jurídica' },
                        { valor: 'fisica' as TipoPessoa, rotulo: 'Física' },
                      ]}
                    />
                  </div>

                  <LinhaCampos>
                    <Campo rotulo={tipo === 'fisica' ? 'Nome' : 'Razão social'} obrigatorio>
                      {(p) => <Entrada {...p} {...form.register('descricao', { required: true })} />}
                    </Campo>
                    <Campo rotulo="Nome fantasia">
                      {(p) => <Entrada {...p} {...form.register('nome_fantasia')} />}
                    </Campo>
                    <Campo rotulo={tipo === 'fisica' ? 'CPF' : 'CNPJ'}>
                      {(p) => (
                        <div className="relative">
                          <Entrada
                            {...p}
                            mono
                            value={form.watch('documento')}
                            onChange={(e) => form.setValue('documento', mascaraDocumento(e.target.value), { shouldDirty: true })}
                          />
                          {tipo === 'juridica' && (
                            <button
                              type="button"
                              onClick={onConsultar}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/10"
                              disabled={consultando}
                            >
                              {consultando ? '...' : 'Consultar'}
                            </button>
                          )}
                        </div>
                      )}
                    </Campo>
                  </LinhaCampos>

                  <LinhaCampos>
                    <Campo rotulo="Inscrição estadual">
                      {(p) => <Entrada {...p} {...form.register('inscricao_estadual')} placeholder="Isento" />}
                    </Campo>
                    <Campo rotulo="Situação">
                      {(p) => (
                        <Selecao {...p} {...form.register('situacao')}>
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                        </Selecao>
                      )}
                    </Campo>
                  </LinhaCampos>
                </div>
              </SecaoForm>

              {/* Endereço */}
              <SecaoForm title="Endereço">
                <div className="space-y-4">
                  <div className="max-w-[200px]">
                    <CampoCEP
                      valor={form.watch('cep')}
                      aoMudar={(v) => form.setValue('cep', v, { shouldDirty: true })}
                      aoEncontrar={(r) => {
                        form.setValue('logradouro', r.logradouro, { shouldDirty: true })
                        form.setValue('bairro', r.bairro, { shouldDirty: true })
                        form.setValue('municipio', r.municipio, { shouldDirty: true })
                        form.setValue('uf', r.uf, { shouldDirty: true })
                      }}
                    />
                  </div>

                  <LinhaCampos>
                    <Campo className="lg:col-span-2" rotulo="Logradouro">
                      {(p) => <Entrada {...p} {...form.register('logradouro')} />}
                    </Campo>
                    <Campo rotulo="Número">
                      {(p) => <Entrada {...p} mono {...form.register('numero')} />}
                    </Campo>
                    <Campo className="lg:col-span-2" rotulo="Bairro">
                      {(p) => <Entrada {...p} {...form.register('bairro')} />}
                    </Campo>
                    <Campo rotulo="Complemento">
                      {(p) => <Entrada {...p} {...form.register('complemento')} />}
                    </Campo>
                    <Campo rotulo="Município">
                      {(p) => <Entrada {...p} {...form.register('municipio')} />}
                    </Campo>
                    <Campo rotulo="UF">
                      {(p) => (
                        <Selecao {...p} {...form.register('uf')}>
                          <option value="">—</option>
                          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </Selecao>
                      )}
                    </Campo>
                  </LinhaCampos>
                </div>
              </SecaoForm>

              {/* Contato */}
              <SecaoForm title="Contato">
                <LinhaCampos>
                  <Campo rotulo="Telefone 1">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        value={form.watch('telefone1')}
                        onChange={(e) => form.setValue('telefone1', mascaraTelefone(e.target.value), { shouldDirty: true })}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Telefone 2">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        value={form.watch('telefone2')}
                        onChange={(e) => form.setValue('telefone2', mascaraTelefone(e.target.value), { shouldDirty: true })}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="E-mail">
                    {(p) => <Entrada {...p} {...form.register('email')} type="email" />}
                  </Campo>
                </LinhaCampos>
              </SecaoForm>

              {/* Observações */}
              <SecaoForm title="Observações">
                <Campo rotulo="Observações">
                  {(p) => <AreaTexto {...p} {...form.register('observacoes')} rows={3} />}
                </Campo>
              </SecaoForm>
            </form>
    </PainelLateral>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TELA
   ═══════════════════════════════════════════════════════════════ */
const SELECT_LISTA = '*'

export function Fornecedores() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fTipo, setFTipo] = useState<'' | TipoPessoa>('')
  const [fSituacao, setFSituacao] = useState<'' | SituacaoRegistro>('ativo')
  const [fUF, setFUF] = useState('')
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [alvo, setAlvo] = useState<Fornecedor | null>(null)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [consultando, setConsultando] = useState(false)

  const podeVer = pode('fornecedores', 'visualizar')
  const podeCriar = pode('fornecedores', 'criar')
  const podeEditar = pode('fornecedores', 'editar')
  const podeInativar = pode('fornecedores', 'inativar')

  const exclusao = useExclusao({ tabela: 'fornecedores', invalidar: [['fornecedores']] })

  const form = useForm<FormFornecedor>({ defaultValues: VAZIO })
  const tipo = form.watch('tipo_pessoa')

  /* Cada número é uma contagem do banco — nenhum deriva da página aberta. */
  const stats = useQuery({
    queryKey: ['fornecedores', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, ativos, pj, pf] = await Promise.all([
        supabase.from('fornecedores').select('*', { count: 'exact', head: true }),
        supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
        supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'juridica'),
        supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'fisica'),
      ])
      const falha = [total, ativos, pj, pf].find((r) => r.error)
      if (falha?.error) throw falha.error
      return { total: total.count ?? 0, ativos: ativos.count ?? 0, pj: pj.count ?? 0, pf: pf.count ?? 0 }
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        const dig = t.replace(/\D/g, '')
        const partes = [`descricao.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`, `email.ilike.%${t}%`]
        if (dig.length >= 3) partes.push(`documento_digitos.ilike.%${dig}%`)
        r = r.or(partes.join(','))
      }
      if (fTipo) r = r.eq('tipo_pessoa', fTipo)
      if (fSituacao) r = r.eq('situacao', fSituacao)
      if (fUF) r = r.eq('uf', fUF)
      return r
    },
    [ctrl.busca, fTipo, fSituacao, fUF],
  )

  const lista = useListagem<Fornecedor>({
    chave: ['fornecedores', 'lista', ctrl.busca, fTipo, fSituacao, fUF, ctrl.pagina, ctrl.porPagina],
    tabela: 'fornecedores',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'descricao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  /* Base do "Exportar": o que está filtrado, não só a página aberta. */
  const todos = useQuery({
    queryKey: ['fornecedores', 'todos', fTipo, fSituacao, fUF],
    enabled: podeVer && exportando,
    queryFn: async (): Promise<Fornecedor[]> => {
      let q = supabase.from('fornecedores').select('*').order('descricao')
      if (fTipo) q = q.eq('tipo_pessoa', fTipo)
      if (fSituacao) q = q.eq('situacao', fSituacao)
      if (fUF) q = q.eq('uf', fUF)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Fornecedor[]
    },
  })

  useEffect(() => {
    setErro(null)
    setAviso(null)
    if (editando) {
      form.reset({
        tipo_pessoa: editando.tipo_pessoa,
        descricao: editando.descricao,
        nome_fantasia: editando.nome_fantasia ?? '',
        documento: editando.documento ? mascaraDocumento(editando.documento) : '',
        inscricao_estadual: editando.inscricao_estadual ?? '',
        cep: editando.cep ? mascaraCEP(editando.cep) : '',
        logradouro: editando.logradouro ?? '',
        numero: editando.numero ?? '',
        bairro: editando.bairro ?? '',
        complemento: editando.complemento ?? '',
        municipio: editando.municipio ?? '',
        uf: editando.uf ?? '',
        telefone1: editando.telefone1 ?? '',
        telefone2: editando.telefone2 ?? '',
        email: editando.email ?? '',
        observacoes: editando.observacoes ?? '',
        situacao: editando.situacao,
      })
    } else if (criando) {
      form.reset(VAZIO)
    }
  }, [editando, criando, form])

  /* Consulta o CNPJ e preenche o que veio — digitar de novo o que a Receita
     já respondeu é onde nascem as divergências de cadastro. */
  async function consultarDocumento() {
    const doc = somenteDigitos(form.getValues('documento'))
    if (doc.length !== 14) {
      setAviso('Informe um CNPJ completo para consultar.')
      return
    }
    setConsultando(true)
    setAviso(null)
    try {
      const r = await consultarCNPJ(doc)
      if (!r) {
        setAviso('CNPJ não encontrado na consulta pública.')
        return
      }
      form.setValue('descricao', r.razao_social ?? form.getValues('descricao'), { shouldDirty: true })
      form.setValue('nome_fantasia', r.nome_fantasia ?? '', { shouldDirty: true })
      if (r.cep) form.setValue('cep', mascaraCEP(r.cep), { shouldDirty: true })
      if (r.logradouro) form.setValue('logradouro', r.logradouro, { shouldDirty: true })
      if (r.numero) form.setValue('numero', r.numero, { shouldDirty: true })
      if (r.bairro) form.setValue('bairro', r.bairro, { shouldDirty: true })
      if (r.municipio) form.setValue('municipio', r.municipio, { shouldDirty: true })
      if (r.uf) form.setValue('uf', r.uf, { shouldDirty: true })
      if (r.email) form.setValue('email', r.email, { shouldDirty: true })
      if (r.telefone) form.setValue('telefone1', r.telefone, { shouldDirty: true })
    } catch (e) {
      setAviso(mensagemErro(e))
    } finally {
      setConsultando(false)
    }
  }

  const salvar = useMutation({
    mutationFn: async (d: FormFornecedor) => {
      setErro(null)
      if (!d.descricao.trim()) throw new Error('Informe a razão social ou o nome.')
      if (d.documento && !validarDocumento(d.documento, d.tipo_pessoa)) {
        throw new Error(d.tipo_pessoa === 'fisica' ? 'CPF inválido.' : 'CNPJ inválido.')
      }
      const texto = (v: string) => v.trim() || null
      const payload = {
        tipo_pessoa: d.tipo_pessoa,
        descricao: d.descricao.trim(),
        nome_fantasia: texto(d.nome_fantasia),
        documento: texto(d.documento),
        inscricao_estadual: texto(d.inscricao_estadual),
        cep: texto(d.cep),
        logradouro: texto(d.logradouro),
        numero: texto(d.numero),
        bairro: texto(d.bairro),
        complemento: texto(d.complemento),
        municipio: texto(d.municipio),
        uf: d.uf || null,
        telefone1: texto(d.telefone1),
        telefone2: texto(d.telefone2),
        email: texto(d.email),
        observacoes: texto(d.observacoes),
        situacao: d.situacao,
      }
      const r = editando
        ? await supabase.from('fornecedores').update(payload).eq('id', editando.id)
        : await supabase.from('fornecedores').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Fornecedor atualizado' : 'Fornecedor cadastrado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['fornecedores'] })
      void qc.invalidateQueries({ queryKey: ['omie-pendentes'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um fornecedor com este documento.' : m)
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (f: Fornecedor) => {
      const nova: SituacaoRegistro = f.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('fornecedores').update({ situacao: nova }).eq('id', f.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['fornecedores'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoFornecedores total={null} />
        <EstadoSemPermissao />
      </div>
    )
  }

  const temFiltros = Boolean(fTipo || fUF || fSituacao !== 'ativo')

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoFornecedores
        total={lista.total}
        acao={
          <>
            <Botao variante="neutro" iconeInicio={<Download />} onClick={() => setExportando(true)}>
              Exportar
            </Botao>
            {podeCriar && (
              <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
                Novo fornecedor
              </Botao>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          indice={0}
          valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'}
          rotulo="Total"
          subrotulo="cadastrados"
          cor="var(--c-accent)"
          icone={<Building2 className="size-4" />}
          onClick={() => { setFSituacao(''); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={1}
          valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'}
          rotulo="Ativos"
          subrotulo="disponíveis"
          cor="var(--c-ok)"
          icone={<Truck className="size-4" />}
          onClick={() => { setFSituacao('ativo'); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={2}
          valor={stats.data?.pj.toLocaleString('pt-BR') ?? '—'}
          rotulo="Pessoa jurídica"
          subrotulo="empresas"
          cor="var(--c-cyan)"
          icone={<PackageSearch className="size-4" />}
          onClick={() => { setFTipo('juridica'); ctrl.reiniciar() }}
        />
        <KpiCard
          indice={3}
          valor={stats.data?.pf.toLocaleString('pt-BR') ?? '—'}
          rotulo="Pessoa física"
          subrotulo="autônomos"
          cor="var(--c-warn)"
          icone={<TrendingUp className="size-4" />}
          onClick={() => { setFTipo('fisica'); ctrl.reiniciar() }}
        />
      </div>

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por nome, fantasia, documento ou e-mail"
          chips={[
            fTipo && {
              id: 't',
              rotulo: `Tipo: ${fTipo === 'fisica' ? 'Pessoa física' : 'Pessoa jurídica'}`,
              aoRemover: () => setFTipo(''),
            },
            fUF && { id: 'uf', rotulo: `UF: ${fUF}`, aoRemover: () => setFUF('') },
            fSituacao !== 'ativo' && {
              id: 's',
              rotulo: `Situação: ${fSituacao === 'inativo' ? 'Inativos' : 'Todos'}`,
              aoRemover: () => setFSituacao('ativo'),
            },
          ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>}
          aoLimpar={temFiltros ? () => { setFTipo(''); setFUF(''); setFSituacao('ativo'); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Tipo">
                {(p) => (
                  <Selecao {...p} value={fTipo} onChange={(e) => { setFTipo(e.target.value as '' | TipoPessoa); ctrl.reiniciar() }}>
                    <option value="">Todos</option>
                    <option value="juridica">Pessoa jurídica</option>
                    <option value="fisica">Pessoa física</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as '' | SituacaoRegistro); ctrl.reiniciar() }}>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                    <option value="">Todos</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="UF">
                {(p) => (
                  <Selecao {...p} value={fUF} onChange={(e) => { setFUF(e.target.value); ctrl.reiniciar() }}>
                    <option value="">Todas</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <div className="aresta border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/60">
                  {['Código', 'Fornecedor', 'Fantasia', 'Tipo', 'Documento', 'Telefone', 'E-mail', 'Status'].map((c) => (
                    <th key={c} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">
                      {c}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3" />
                </tr>
              </thead>
              <tbody>
                {lista.linhas.map((f) => (
                  <FornecedorRow
                    key={f.id}
                    fornecedor={f}
                    onEdit={podeEditar ? () => setEditando(f) : undefined}
                    onSituacao={podeInativar ? () => setAlvo(f) : undefined}
                    onExcluir={podeInativar ? () => exclusao.pedir(f.id) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {lista.estado === 'carregando' && (
            <div className="py-16">
              <EstadoCarregando rotulo="Carregando fornecedores…" />
            </div>
          )}

          {lista.estado === 'ok' && lista.linhas.length === 0 && (
            <div className="py-16">
              <EstadoVazio
                icone={<Building2 />}
                titulo={ctrl.busca || temFiltros ? 'Nenhum resultado' : 'Nenhum fornecedor cadastrado'}
                descricao={
                  ctrl.busca || temFiltros
                    ? 'Ajuste a busca ou os filtros.'
                    : 'Os fornecedores abastecem o cadastro de produtos e as compras.'
                }
                acao={
                  podeCriar && !ctrl.busca && !temFiltros ? (
                    <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
                      Cadastrar o primeiro
                    </Botao>
                  ) : undefined
                }
              />
            </div>
          )}

          {lista.estado === 'erro' && (
            <div className="py-16">
              <EstadoErro descricao={mensagemErro(lista.erro)} aoTentarNovamente={lista.recarregar} />
            </div>
          )}
        </div>

        {lista.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0 py-2"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={lista.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      <ModalFormulario
        aberto={criando || Boolean(editando)}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        editando={editando}
        form={form}
        erro={erro}
        aviso={aviso}
        consultando={consultando}
        tipo={tipo}
        onTipoChange={(v) => form.setValue('tipo_pessoa', v, { shouldDirty: true })}
        onConsultar={() => void consultarDocumento()}
        onSalvar={form.handleSubmit((d) => salvar.mutate(d))}
        podeSalvar={editando ? podeEditar : podeCriar}
        salvarPending={salvar.isPending}
      />

      <ModalExport
        aberto={exportando}
        aoFechar={() => setExportando(false)}
        total={lista.total ?? 0}
        fornecedores={todos.data ?? []}
      />

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar fornecedor?' : 'Reativar fornecedor?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={
          <>
            <strong className="font-semibold text-ink">{alvo?.descricao}</strong>{' '}
            {alvo?.situacao === 'ativo'
              ? 'deixa de aparecer na seleção de fornecedores. O histórico é preservado.'
              : 'volta a ficar disponível.'}
          </>
        }
      />

      <DialogoExclusao ctrl={exclusao} />
    </div>
  )
}

function CabecalhoFornecedores({ total, acao }: { total: number | null; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Fornecedores</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {total !== null && (
          <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
            {total.toLocaleString('pt-BR')} registros
          </span>
        )}
        {acao}
      </div>
    </div>
  )
}
