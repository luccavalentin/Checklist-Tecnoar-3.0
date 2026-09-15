import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sosCompartilhar, sosHomeCliente, sosIaPublico, sosInfoPublica, sosMeusLembretes, sosMeusVeiculos } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { HomeCliente, OcorrenciaSOS, PrioridadeSOS, TipoAgendamento } from '@/sos/tipos'

/**
 * Consultas e utilidades compartilhadas pelas telas do cliente.
 *
 * As chaves são as de `CHAVES_SOS` sempre que existem: é por elas que o tempo
 * real (`useTempoRealCliente`) invalida o cache. Chave inventada aqui é
 * chave que nunca se atualiza sozinha.
 */

/** Lembretes não têm chave em CHAVES_SOS; ficam sob a raiz 'sos' para o `qc.clear()` do sair. */
export const CHAVE_LEMBRETES = ['sos', 'lembretes'] as const
export const CHAVE_INFO_PUBLICA = ['sos', 'info-publica'] as const
export const CHAVE_IA_PUBLICO = ['sos', 'ia-publico'] as const

/** Conversa da TECNO IA guardada na sessão do navegador (some ao fechar o app ou sair). */
export const chaveConversaIA = (usuarioId: string | null) => `sos.tecnoia.conversa.${usuarioId ?? 'sem-usuario'}`

export type VeiculoCliente = Awaited<ReturnType<typeof sosMeusVeiculos>>[number]

/** Resumo da Home — também alimenta o botão SOS da barra (chamado ativo). */
export function useHomeCliente() {
  return useQuery({
    queryKey: CHAVES_SOS.homeCliente,
    queryFn: sosHomeCliente,
    staleTime: 15_000,
  })
}

/** Telefone/WhatsApp da central e textos públicos: mudam raramente. */
export function useInfoPublica() {
  return useQuery({
    queryKey: CHAVE_INFO_PUBLICA,
    queryFn: sosInfoPublica,
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

/**
 * A IA de verdade está ligada para o cliente? Decide se a TECNO IA abre a
 * conversa com a IA ou o guia rápido do aparelho. Sem retentativa longa: na
 * dúvida (sem sinal, erro), o guia rápido responde na hora.
 */
export function useIaPublico() {
  return useQuery({
    queryKey: CHAVE_IA_PUBLICO,
    queryFn: sosIaPublico,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

export function useMeusVeiculos() {
  return useQuery({
    queryKey: CHAVES_SOS.veiculos,
    queryFn: sosMeusVeiculos,
    staleTime: 60_000,
  })
}

/** Lembretes de manutenção preventiva (gerados pelo Checklist a partir das OS). */
export function useLembretes() {
  return useQuery({ queryKey: CHAVE_LEMBRETES, queryFn: sosMeusLembretes, staleTime: 60_000 })
}

/**
 * Quanto o teclado virtual cobre do rodapé (px). No iPhone o teclado não
 * encolhe a página: um botão `fixed bottom-0` fica escondido atrás dele. Com
 * esta medida o rodapé sobe junto e o CONFIRMAR continua à vista.
 */
export function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const medir = () => setAltura(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])
  // Diferenças pequenas são a barra do navegador recolhendo, não teclado.
  return altura > 80 ? altura : 0
}

/* ── contexto da casca ──────────────────────────────────────────────────── */

/**
 * O que a casca já calcula e as telas filhas reaproveitam, em vez de abrir uma
 * segunda assinatura de tempo real para o mesmo contador.
 */
export interface CtxCascaCliente {
  naoLidas: number
}

export function useCasca(): CtxCascaCliente {
  return useOutletContext<CtxCascaCliente | undefined>() ?? { naoLidas: 0 }
}

/* ── estados de navegação entre telas ───────────────────────────────────── */

/** O que a TECNO IA (ou outra tela) pode entregar ao fluxo de SOS. */
export interface EstadoFluxoSOS {
  ocorrencia?: OcorrenciaSOS
  descricao?: string
  prioridade?: PrioridadeSOS
  contextoIA?: Record<string, unknown>
}

/** Pré-preenchimento do formulário de agendamento. */
export interface EstadoAgendar {
  tipo?: TipoAgendamento
  descricao?: string
  veiculoId?: string
}

/* ── textos ─────────────────────────────────────────────────────────────── */

export function saudacao(agora = new Date()): string {
  const h = agora.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function primeiroNome(nome: string | null | undefined): string {
  const n = (nome ?? '').trim().split(/\s+/)[0] ?? ''
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''
}

export function nomeVeiculo(v: { marca?: string | null; modelo?: string | null; descricao?: string | null } | null | undefined): string {
  if (!v) return 'Veículo'
  return [v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || 'Veículo'
}

export function kmTexto(km: number | null | undefined): string | null {
  if (km == null) return null
  return `${Number(km).toLocaleString('pt-BR')} km`
}

function paraData(iso: string): Date {
  // Datas "puras" (AAAA-MM-DD) viram meia-noite UTC e voltam um dia no Brasil.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
}

export function dataLonga(iso: string | null | undefined): string {
  if (!iso) return '—'
  return paraData(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** 23/08/2026 — cabe nos cartões estreitos do celular. */
export function dataNumerica(iso: string | null | undefined): string {
  if (!iso) return '—'
  return paraData(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Data (sem hora) já passou? */
export function venceu(iso: string | null | undefined, agora = Date.now()): boolean {
  if (!iso) return false
  return paraData(iso).getTime() < agora
}

/** Base do mapa acompanha o tema do app (escuro à noite não ofusca o motorista). */
export function temaMapa(): 'claro' | 'escuro' {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

/** Home sem vínculo: a conta existe, mas ainda não foi ligada a um cadastro da Tecnoar. */
export function semVinculo(home: HomeCliente | undefined): boolean {
  return !!home && home.ok === false
}

/* ── compartilhar acompanhamento ────────────────────────────────────────── */

/**
 * Gera o link público (12 h) e abre a folha de compartilhar do celular; sem
 * ela (computador, navegador antigo), copia o link.
 */
export async function compartilharAcompanhamento(
  chamadoId: string,
  protocolo: string,
): Promise<'compartilhado' | 'copiado' | 'cancelado'> {
  const token = await sosCompartilhar(chamadoId)
  const url = `${window.location.origin}/acompanhar/${token}`
  const texto = `Acompanhe meu socorro Tecnoar (${protocolo}) ao vivo:`
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Socorro Tecnoar', text: texto, url })
      return 'compartilhado'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelado'
    }
  }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`)
    return 'copiado'
  } catch {
    // Último recurso: o próprio link na tela para a pessoa copiar na mão.
    window.prompt('Copie o link do acompanhamento:', url)
    return 'copiado'
  }
}
