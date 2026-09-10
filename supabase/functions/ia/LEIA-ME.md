# Função `ia` — o que está aqui e o que falta

A função `ia` está **publicada** no projeto (`zdhebeqlhynffxfmedvj`, versão 3) mas
nunca foi versionada aqui. Só o `prompt.ts` foi trazido até agora; `index.ts` e
`provedores.ts` seguem existindo apenas no servidor.

O mesmo vale para outras funções publicadas e ausentes do repositório:
`ia-modelos`, `placa` e `omie-diagnostico`.

Isso é risco real: o que roda em produção não tem cópia no git, e uma
republicação sobrescreve código que ninguém tem.

## Sobre o prompt.ts daqui

É a versão corrigida do papel da perita: mantém a especialidade profunda em
freio, pneumática e ABS/EBS, mas atende o caminhão inteiro e conversa como
gente. **Ainda não foi publicado** — o comportamento em produção hoje vem de
`ia_config.instrucoes_extra`, que a função anexa ao final do prompt e produz o
mesmo efeito sem exigir deploy.

Ao republicar a função, use este `prompt.ts` e então esvazie o
`instrucoes_extra`, para a regra viver num lugar só.
