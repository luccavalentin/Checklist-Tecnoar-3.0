-- Toda conta ativa do Checklist usa o app SOS (painel de atendimento em campo).
--
-- Antes, só quem tinha função "atua como mecânico" ou estava em SOS →
-- Mecânicos; os demais caíam numa tela que mandava de volta ao Checklist.
-- Agora qualquer funcionário ativo entra, fica disponível, aceita e atende.
--
-- O que NÃO muda: as listas da central (mapa e sugestão de despacho) seguem
-- mostrando só quem tem função de mecânico ou já tem ficha no SOS — e a
-- ficha nasce quando a pessoa define a própria situação no app ("Ficar
-- disponível"). Quem nunca abre o app não aparece para o despacho nem recebe
-- chamado. A central (permissão `sos`) continua no Checklist.
create or replace function public.sos_eh_mecanico()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.situacao = 'ativo')
$$;
