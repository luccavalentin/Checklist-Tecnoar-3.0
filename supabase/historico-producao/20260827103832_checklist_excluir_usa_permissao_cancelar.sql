-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827103832.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- A ação de permissão do sistema é `cancelar`; `excluir` não existe no enum.
create or replace function excluir_checklist(p_checklist uuid, p_motivo text default null)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_situacao situacao_checklist;
  v_os uuid;
  v_numero integer;
begin
  if not tem_permissao('checklists', 'cancelar') then
    raise exception 'Sem permissão para cancelar ou remover checklists.' using errcode = '42501';
  end if;

  select situacao, os_id, numero into v_situacao, v_os, v_numero
  from checklists where id = p_checklist;
  if not found then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;

  /* Concluído é prova do estado de entrada: cancela, não apaga. */
  if v_situacao = 'concluido' then
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'Checklist concluído não é apagado: informe o motivo do cancelamento.'
        using errcode = '22023';
    end if;
    update checklists
       set situacao = 'cancelado',
           observacoes = concat_ws(E'\n', observacoes, 'Cancelado: ' || btrim(p_motivo)),
           updated_at = now()
     where id = p_checklist;

    if v_os is not null then
      insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
      values (v_os, 'checklist', 'Checklist cancelado', btrim(p_motivo), auth.uid());
    end if;
    return 'cancelado';
  end if;

  delete from checklists where id = p_checklist;

  if v_os is not null then
    insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (v_os, 'checklist', 'Checklist removido',
            concat('CHK ', lpad(v_numero::text, 4, '0')), auth.uid());
  end if;
  return 'excluido';
end;
$$;

/* Perfis que já editam checklist passam a poder cancelar. */
insert into perfil_permissoes (perfil_id, recurso, acao)
select distinct perfil_id, 'checklists', 'cancelar'::acao_permissao
from perfil_permissoes
where recurso = 'checklists' and acao = 'editar'
on conflict do nothing;;
