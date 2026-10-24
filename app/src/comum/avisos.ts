/**
 * Leitura do título de uma notificação.
 *
 * Até 08/10/2026 a urgência de um aviso viajava escondida num emoji no começo
 * do título — "🚨 Novo SOS 2026-0042". Era presentação carregando
 * comportamento: quem reescrevesse o texto para melhorar a redação desligava
 * a vibração de emergência sem saber, e o emoji ainda ia inteiro para a tela
 * de bloqueio do motorista, que é onde a marca aparece mais exposta.
 *
 * A migração `20261008_notificacoes_sem_emoji` recorta a marcação em
 * `sos_notificar` e grava a urgência na coluna `urgente`. Estas funções
 * existem porque o app tem de funcionar nos TRÊS mundos ao mesmo tempo:
 *
 *   · linha nova, com `urgente` preenchido;
 *   · linha antiga, já gravada com o emoji no título;
 *   · ambiente onde a migração ainda não rodou.
 *
 * Então o recorte continua acontecendo também aqui, na exibição, e a coluna é
 * usada quando existe. Quando toda a tabela estiver limpa, some o recuo — não
 * esta função, que segue sendo o lugar certo para a regra.
 */

/** Marcação de urgência que os títulos antigos trazem na frente. */
const MARCACAO = /^[^\p{L}\p{N}]+/u

/** O título como o usuário deve ler: sem a marcação, se houver. */
export function semMarcacao(titulo: string): string {
  const limpo = titulo.replace(MARCACAO, '').trim()
  // Título que era só marcação fica como está: aviso sem nome na tela de
  // bloqueio é pior do que aviso feio. Mesma decisão do lado do banco.
  return limpo || titulo
}

/** Pede atenção imediata: vibra o aparelho e fica mais tempo na tela. */
export function ehUrgente(aviso: { titulo: string; urgente?: boolean | null }): boolean {
  if (typeof aviso.urgente === 'boolean') return aviso.urgente
  return MARCACAO.test(aviso.titulo)
}
