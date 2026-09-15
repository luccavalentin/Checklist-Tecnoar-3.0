-- ════════════════════════════════════════════════════════════════════════════
-- Mecânico abre OS pelo app
-- ════════════════════════════════════════════════════════════════════════════
--
-- A Nova OS do app SOS (sos_os_abrir) exige "Ordens de Serviço → Criar".
-- Operação Mecânica só visualizava e editava; Gestão Tecnoar não tinha acesso
-- às OS. Idempotente: roda de novo sem duplicar.

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pa.id, 'ordens_servico', a.acao::public.acao_permissao
from public.perfis_acesso pa
cross join (values ('visualizar'), ('criar'), ('editar')) as a(acao)
where pa.nome in ('Operação Mecânica', 'Gestão Tecnoar')
  and not exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = pa.id and pp.recurso = 'ordens_servico' and pp.acao = a.acao::public.acao_permissao
  );
