-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260826144749.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Campos de pagamento da OS. A aba "Pagamento" grava aqui; sem estas colunas
-- ela seria apenas uma tela bonita sem efeito nenhum.

create type forma_pagamento as enum (
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'boleto',
  'transferencia',
  'faturado',
  'outro'
);

alter table ordens_servico
  add column forma_pagamento forma_pagamento,
  add column condicao_pagamento text,
  add column parcelas integer check (parcelas is null or parcelas between 1 and 48),
  add column valor_pago numeric(14,2) not null default 0,
  add column pago_em timestamptz,
  add column observacao_pagamento text,
  add column encerrada_por uuid references usuarios (id) on delete set null;

comment on column ordens_servico.valor_pago is
  'Quanto já foi recebido. O saldo é calculado contra valor_total na tela — nunca estimado.';

/**
 * Encerrar uma OS é um ato com hora e autor.
 *
 * Fica em função para que o carimbo não dependa de o cliente lembrar de
 * preencher, e para recusar o encerramento quando ainda houver item pendente
 * de aprovação — encerrar com pendência esconde trabalho não decidido.
 */
create or replace function encerrar_os(p_os uuid, p_forcar boolean default false)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pendentes integer;
  v_agora timestamptz := now();
begin
  if not tem_permissao('ordens_servico', 'editar') then
    raise exception 'Sem permissão para encerrar ordens de serviço.' using errcode = '42501';
  end if;

  if not exists (select 1 from ordens_servico where id = p_os) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  select count(*) into v_pendentes
  from (
    select 1 from os_servicos where os_id = p_os and aprovacao = 'pendente' and situacao = 'ativo'
    union all
    select 1 from os_produtos where os_id = p_os and aprovacao = 'pendente' and situacao = 'ativo'
  ) x;

  if v_pendentes > 0 and not p_forcar then
    raise exception 'Há % item(ns) aguardando aprovação do cliente.', v_pendentes using errcode = '22023';
  end if;

  update ordens_servico
     set encerrada_em = coalesce(encerrada_em, v_agora),
         encerrada_por = coalesce(encerrada_por, auth.uid())
   where id = p_os;

  insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
  values (p_os, 'encerramento', 'Ordem de serviço encerrada',
          case when v_pendentes > 0 then 'Encerrada com itens pendentes de aprovação.' else null end,
          auth.uid());

  return v_agora;
end;
$$;

revoke all on function encerrar_os(uuid, boolean) from public, anon;
grant execute on function encerrar_os(uuid, boolean) to authenticated, service_role;

/** Reabrir desfaz o encerramento e registra o motivo. */
create or replace function reabrir_os(p_os uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not tem_permissao('ordens_servico', 'editar') then
    raise exception 'Sem permissão para reabrir ordens de serviço.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = '22023';
  end if;

  update ordens_servico set encerrada_em = null, encerrada_por = null where id = p_os;

  insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
  values (p_os, 'reabertura', 'Ordem de serviço reaberta', btrim(p_motivo), auth.uid());
end;
$$;

revoke all on function reabrir_os(uuid, text) from public, anon;
grant execute on function reabrir_os(uuid, text) to authenticated, service_role;;
