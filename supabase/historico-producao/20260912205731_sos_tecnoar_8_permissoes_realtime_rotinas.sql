-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205731.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 8/8): permissões, RLS, trava do cliente, grants, realtime e rotinas.

-- ============================================================== permissões (menu + RLS)
insert into public.recursos (chave, nome, grupo, ordem, acoes)
values ('sos', 'SOS Tecnoar', 'operacao', 35, array['visualizar', 'criar', 'editar', 'cancelar', 'configurar', 'exportar']::public.acao_permissao[])
on conflict (chave) do update set nome = excluded.nome, acoes = excluded.acoes;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'sos', a
from public.perfis_acesso p
cross join unnest(array['visualizar', 'criar', 'editar', 'cancelar', 'configurar', 'exportar']::public.acao_permissao[]) a
where p.is_system
on conflict do nothing;

-- Os demais perfis NÃO ganham a central automaticamente: mecânico também vê
-- OS, e herdar o SOS por isso o faria receber a sirene da central na
-- oficina e ver o despacho. Quem opera a central é liberado em Perfis e
-- Permissões (o recurso `sos` já aparece lá).

-- Mecânicos de oficina passam a aceitar SOS por padrão (começam offline e
-- ficam disponíveis no app).
insert into public.sos_mecanicos (usuario_id)
select u.id from public.usuarios u join public.funcoes f on f.id = u.funcao_id
where f.atua_como_mecanico and u.situacao = 'ativo'
on conflict do nothing;

-- Presença: só as funções do SOS leem e gravam (sem política = sem acesso direto).
alter table public.sos_presenca            enable row level security;
alter table public.sos_contas_cliente      enable row level security;
alter table public.sos_config              enable row level security;
alter table public.sos_mecanicos           enable row level security;
alter table public.sos_chamados            enable row level security;
alter table public.sos_eventos             enable row level security;
alter table public.sos_posicoes            enable row level security;
alter table public.sos_mensagens           enable row level security;
alter table public.sos_recusas             enable row level security;
alter table public.sos_compartilhamentos   enable row level security;
alter table public.sos_agendamentos        enable row level security;
alter table public.sos_lembretes           enable row level security;
alter table public.sos_contatos_emergencia enable row level security;
alter table public.sos_itens               enable row level security;
alter table public.sos_anexos              enable row level security;

drop policy if exists sos_contas_propria on public.sos_contas_cliente;
create policy sos_contas_propria on public.sos_contas_cliente
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_config_equipe on public.sos_config;
create policy sos_config_equipe on public.sos_config
  for select to authenticated using ((select public.sos_eh_equipe()) or (select public.sos_eh_mecanico()));

drop policy if exists sos_mecanicos_ler on public.sos_mecanicos;
create policy sos_mecanicos_ler on public.sos_mecanicos
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_chamados_ler on public.sos_chamados;
create policy sos_chamados_ler on public.sos_chamados
  for select to authenticated using (
    (select public.sos_eh_equipe())
    or mecanico_id = (select auth.uid())
    or conta_usuario_id = (select auth.uid())
    or cliente_id = (select public.sos_cliente_atual())
    or ((select public.sos_eh_mecanico()) and mecanico_id is null and status in ('recebido', 'procurando_mecanico'))
  );

-- Central ajusta dados descritivos direto (prioridade, endereço, observação);
-- estado só por RPC.
drop policy if exists sos_chamados_editar_central on public.sos_chamados;
create policy sos_chamados_editar_central on public.sos_chamados
  for update to authenticated
  using ((select public.tem_permissao('sos', 'editar')))
  with check ((select public.tem_permissao('sos', 'editar')));

drop policy if exists sos_eventos_ler on public.sos_eventos;
create policy sos_eventos_ler on public.sos_eventos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_posicoes_ler on public.sos_posicoes;
create policy sos_posicoes_ler on public.sos_posicoes
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_mensagens_ler on public.sos_mensagens;
create policy sos_mensagens_ler on public.sos_mensagens
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_recusas_ler on public.sos_recusas;
create policy sos_recusas_ler on public.sos_recusas
  for select to authenticated using (mecanico_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_compartilhamentos_ler on public.sos_compartilhamentos;
create policy sos_compartilhamentos_ler on public.sos_compartilhamentos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));
drop policy if exists sos_compartilhamentos_revogar on public.sos_compartilhamentos;
create policy sos_compartilhamentos_revogar on public.sos_compartilhamentos
  for update to authenticated using (criado_por = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_agendamentos_ler on public.sos_agendamentos;
create policy sos_agendamentos_ler on public.sos_agendamentos
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()) or (select public.sos_eh_equipe()));

drop policy if exists sos_lembretes_ler on public.sos_lembretes;
create policy sos_lembretes_ler on public.sos_lembretes
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()) or (select public.sos_eh_equipe()));

drop policy if exists sos_contatos_proprios on public.sos_contatos_emergencia;
create policy sos_contatos_proprios on public.sos_contatos_emergencia
  for all to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists sos_contatos_equipe on public.sos_contatos_emergencia;
create policy sos_contatos_equipe on public.sos_contatos_emergencia
  for select to authenticated using ((select public.sos_eh_equipe()));

drop policy if exists sos_itens_ler on public.sos_itens;
create policy sos_itens_ler on public.sos_itens
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_anexos_ler on public.sos_anexos;
create policy sos_anexos_ler on public.sos_anexos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

-- O cliente final enxerga SÓ o que é dele nas tabelas que já existem.
-- São políticas a mais; as da equipe continuam iguais.
drop policy if exists clientes_sos_proprio on public.clientes;
create policy clientes_sos_proprio on public.clientes
  for select to authenticated using (id = (select public.sos_cliente_atual()));

drop policy if exists veiculos_sos_proprios on public.veiculos;
create policy veiculos_sos_proprios on public.veiculos
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()));

-- Km e apelido do próprio veículo o cliente pode manter.
drop policy if exists veiculos_sos_editar on public.veiculos;
create policy veiculos_sos_editar on public.veiculos
  for update to authenticated
  using (cliente_id = (select public.sos_cliente_atual()))
  with check (cliente_id = (select public.sos_cliente_atual()));

drop policy if exists ordens_servico_sos_proprias on public.ordens_servico;
create policy ordens_servico_sos_proprias on public.ordens_servico
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()));

drop policy if exists os_servicos_sos on public.os_servicos;
create policy os_servicos_sos on public.os_servicos
  for select to authenticated using (os_id in (select id from public.ordens_servico where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists os_produtos_sos on public.os_produtos;
create policy os_produtos_sos on public.os_produtos
  for select to authenticated using (os_id in (select id from public.ordens_servico where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists eventos_veiculo_sos on public.eventos_veiculo;
create policy eventos_veiculo_sos on public.eventos_veiculo
  for select to authenticated using (veiculo_id in (select id from public.veiculos where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists status_os_sos on public.status_os;
create policy status_os_sos on public.status_os
  for select to authenticated using ((select public.sos_cliente_atual()) is not null);

-- ============================================================== trava: cliente do app só vê o que é dele
-- Até o SOS, toda conta logada era da equipe; políticas antigas do tipo
-- "autenticado pode ler" eram seguras por isso. Agora há clientes de fora com
-- login. Em vez de confiar que nenhuma política antiga seja ampla demais, uma
-- política RESTRITIVA (soma com AND a qualquer outra) em cada tabela garante:
-- conta de cliente do app nunca passa do que é dela, seja qual for a regra
-- que já existia. Para a equipe a trava é neutra.
create or replace function public.sos_eh_conta_cliente()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.sos_contas_cliente where usuario_id = auth.uid())
     and not exists (select 1 from public.usuarios where id = auth.uid())
$$;

-- As políticas abaixo chamam estas funções como `authenticated`.
grant execute on function public.sos_eh_conta_cliente(), public.sos_cliente_atual(), public.sos_eh_equipe(),
  public.sos_eh_mecanico(), public.sos_pode_ver_chamado(uuid) to authenticated;

do $$
declare
  t record;
  -- Tabelas que o cliente lê, com a condição do que é dele.
  proprias constant jsonb := jsonb_build_object(
    'clientes', 'id = (select public.sos_cliente_atual())',
    'veiculos', 'cliente_id = (select public.sos_cliente_atual())',
    'ordens_servico', 'cliente_id = (select public.sos_cliente_atual())',
    'os_servicos', 'os_id in (select o.id from public.ordens_servico o where o.cliente_id = (select public.sos_cliente_atual()))',
    'os_produtos', 'os_id in (select o.id from public.ordens_servico o where o.cliente_id = (select public.sos_cliente_atual()))',
    'eventos_veiculo', 'veiculo_id in (select v.id from public.veiculos v where v.cliente_id = (select public.sos_cliente_atual()))',
    'notificacoes', 'usuario_id = (select auth.uid())',
    'push_inscricoes', 'usuario_id = (select auth.uid())',
    'status_os', 'true'
  );
  v_cond text;
begin
  for t in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname not like 'sos\_%'
  loop
    v_cond := proprias->>t.relname;
    execute format('drop policy if exists sos_trava_cliente on public.%I', t.relname);
    execute format(
      'create policy sos_trava_cliente on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      t.relname,
      'not (select public.sos_eh_conta_cliente())' || coalesce(' or (' || v_cond || ')', ''),
      -- Escrita direta do cliente só nas próprias notificações/inscrições de push
      -- e no km do próprio veículo; o resto passa pelas RPCs.
      case when t.relname in ('notificacoes', 'push_inscricoes', 'veiculos')
           then 'not (select public.sos_eh_conta_cliente())' || coalesce(' or (' || v_cond || ')', '')
           else 'not (select public.sos_eh_conta_cliente())' end
    );
  end loop;
end $$;

-- Arquivos: o cliente só alcança o bucket do SOS (e, dentro dele, a política
-- abaixo limita aos chamados dele). Fotos de OS de outros clientes, nunca.
drop policy if exists sos_trava_cliente_arquivos on storage.objects;
create policy sos_trava_cliente_arquivos on storage.objects
  as restrictive for all to authenticated
  using (bucket_id = 'sos' or not (select public.sos_eh_conta_cliente()))
  with check (bucket_id = 'sos' or not (select public.sos_eh_conta_cliente()));

-- Bucket `sos`: arquivos vivem em `<chamado_id>/...`; quem vê o chamado vê o arquivo.
drop policy if exists sos_storage_ler on storage.objects;
create policy sos_storage_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'sos' and (select public.sos_pode_ver_chamado(((storage.foldername(name))[1])::uuid)));
drop policy if exists sos_storage_gravar on storage.objects;
create policy sos_storage_gravar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sos' and (select public.sos_pode_ver_chamado(((storage.foldername(name))[1])::uuid)));

-- ============================================================== grants
-- Nada disto é chamável sem login, exceto o que é explicitamente público.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;

-- Rotinas internas não são chamadas pelo app.
revoke execute on function public.sos_limpar_posicoes(), public.sos_avisar_whatsapp(uuid, text),
  public.sos_vigiar(), public.sos_avisar_mecanicos(uuid, text, text, uuid), public.sos_texto_duracao(integer),
  public.sos_ignorar_conta_cliente(), public.sos_mecanicos_antes(),
  public.sos_chamados_antes(), public.sos_chamados_depois(), public.sos_mensagens_depois(),
  public.sos_sincronizar_itens_os(uuid), public.sos_registrar_evento(uuid, text, text, text, jsonb, double precision, double precision, public.sos_papel),
  public.sos_notificar(uuid, text, text, text), public.sos_garantir_veiculo(uuid, text, text, text), public.sos_usuarios_central()
  from authenticated;

-- Página de acompanhamento e telefone da central: sem login.
grant execute on function public.sos_acompanhar(text), public.sos_info_publica(),
  public.sos_rotulo_status(public.sos_status), public.sos_rotulo_ocorrencia(public.sos_tipo_ocorrencia) to anon;

-- ============================================================== realtime
do $$
declare t text;
begin
  foreach t in array array['sos_chamados', 'sos_posicoes', 'sos_mensagens', 'sos_eventos', 'sos_mecanicos',
                           'sos_agendamentos', 'sos_itens', 'sos_anexos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- Linha inteira no evento de UPDATE (o app precisa do estado novo completo).
alter table public.sos_chamados replica identity full;
alter table public.sos_mecanicos replica identity full;

-- ============================================================== rotinas
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('sos_lembretes', 'sos_limpar_posicoes', 'sos_vigiar');
    perform cron.schedule('sos_lembretes', '15 7 * * *', $c$ select public.sos_gerar_lembretes() $c$);
    perform cron.schedule('sos_limpar_posicoes', '30 3 * * *', $c$ select public.sos_limpar_posicoes() $c$);
    -- A cada 30 s (pg_cron 1.5+); versões antigas aceitam no máximo 1 min.
    begin
      perform cron.schedule('sos_vigiar', '30 seconds', $c$ select public.sos_vigiar() $c$);
    exception when others then
      perform cron.schedule('sos_vigiar', '* * * * *', $c$ select public.sos_vigiar() $c$);
    end;
  end if;
end $$;;
