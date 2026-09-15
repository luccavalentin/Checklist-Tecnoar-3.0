# Função `ia` — Tecnoar IA do Checklist

`index.ts` e `provedores.ts` são cópias fiéis da versão **publicada** no
projeto `zdhebeqlhynffxfmedvj` (versão 3), trazidas do servidor em 13/09/2026.
O mesmo vale para `../ia-modelos`, `../placa` e `../omie-diagnostico` (esta
última está desativada e pode ser excluída no painel).

## Sobre o prompt.ts daqui

É a versão corrigida do papel da perita: mantém a especialidade profunda em
freio, pneumática e ABS/EBS, mas atende o caminhão inteiro e conversa como
gente. **Ainda não foi publicado** — o comportamento em produção hoje vem de
`ia_config.instrucoes_extra`, que a função anexa ao final do prompt e produz o
mesmo efeito sem exigir deploy.

Ao republicar a função, este `prompt.ts` entra junto (a assinatura
`instrucoes(dominios, equipamentos, extra)` é a mesma da versão publicada);
então esvazie o `instrucoes_extra`, para a regra viver num lugar só.
