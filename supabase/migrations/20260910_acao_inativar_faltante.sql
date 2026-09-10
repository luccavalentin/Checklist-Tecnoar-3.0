-- Oito tabelas estao declaradas em registros_excluiveis, mas o recurso delas
-- nao tem a acao 'inativar' — que e exatamente a que previa_exclusao exige,
-- via tem_permissao(recurso, 'inativar').
--
-- Efeito hoje: so administrador consegue excluir esses registros, porque
-- tem_permissao devolve true de imediato para admin. Qualquer outro perfil
-- recebe "Seu perfil nao permite excluir ...", sem que exista como conceder.
--
--   entradas_patio  -> recepcao
--   faturas         -> indicadores
--   follow_ups      -> follow_up
--   garantias       -> garantias
--   interacoes      -> crm
--   pecas_teste     -> pecas_em_teste
--   retornos        -> garantias
--   vendas          -> estoque_vendas
--
-- Rodar no SQL Editor do projeto zdhebeqlhynffxfmedvj.

update public.recursos
set acoes = (acoes::text[] || array['inativar'])::acao_permissao[]
where chave in (
  'recepcao', 'indicadores', 'follow_up', 'garantias',
  'crm', 'pecas_em_teste', 'estoque_vendas'
)
and not ('inativar' = any(acoes::text[]));

-- Conferencia: nao deve sobrar nenhuma linha com "FALTA".
select re.tabela, re.recurso,
       case when 'inativar' = any(r.acoes::text[]) then 'ok' else 'FALTA' end as situacao
from public.registros_excluiveis re
left join public.recursos r on r.chave = re.recurso
order by situacao desc, re.tabela;
