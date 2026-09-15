-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205508.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 6/8): RPCs da central.

-- ============================================================== RPCs — central
create or replace function public.sos_indicadores(p_inicio timestamptz default date_trunc('day', now()), p_fim timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'aguardando', (select count(*) from public.sos_chamados where status in ('recebido', 'procurando_mecanico')),
    'aguardando_mecanico', (select count(*) from public.sos_chamados where status in ('recebido', 'procurando_mecanico') and mecanico_id is null),
    'aceitos', (select count(*) from public.sos_chamados where status = 'aceito'),
    'a_caminho', (select count(*) from public.sos_chamados where status = 'a_caminho'),
    'no_local', (select count(*) from public.sos_chamados where status = 'no_local'),
    'em_servico', (select count(*) from public.sos_chamados where status = 'servico_iniciado'),
    'finalizados_periodo', (select count(*) from public.sos_chamados where status in ('servico_finalizado', 'concluido') and coalesce(finalizado_em, concluido_em) between p_inicio and p_fim),
    'cancelados_periodo', (select count(*) from public.sos_chamados where status = 'cancelado' and cancelado_em between p_inicio and p_fim),
    'abertos_periodo', (select count(*) from public.sos_chamados where recebido_em between p_inicio and p_fim),
    'aguardando_mais_antigo', (select min(recebido_em) from public.sos_chamados where status in ('recebido', 'procurando_mecanico')),
    'tempo_medio_aceite_seg', (select round(avg(tempo_aceite_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_aceite_seg is not null),
    'tempo_medio_deslocamento_seg', (select round(avg(tempo_deslocamento_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_deslocamento_seg is not null),
    'tempo_medio_servico_seg', (select round(avg(tempo_servico_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_servico_seg is not null),
    'tempo_medio_total_seg', (select round(avg(tempo_total_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_total_seg is not null),
    'nota_media', (select round(avg(avaliacao_nota), 2) from public.sos_chamados where avaliado_em between p_inicio and p_fim),
    'avaliacoes', (select count(*) from public.sos_chamados where avaliado_em between p_inicio and p_fim),
    'mecanicos', (select jsonb_build_object(
                    'disponivel', count(*) filter (where m.situacao = 'disponivel'),
                    'em_atendimento', count(*) filter (where m.situacao = 'em_atendimento'),
                    'pausa', count(*) filter (where m.situacao = 'pausa'),
                    'indisponivel', count(*) filter (where m.situacao = 'indisponivel'),
                    'offline', count(*) filter (where m.situacao = 'offline'))
                  from public.sos_mecanicos m join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'),
    'mecanicos_disponiveis', (select count(*) from public.sos_mecanicos m join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo' where m.situacao = 'disponivel'),
    'mecanicos_em_atendimento', (select count(*) from public.sos_mecanicos where situacao = 'em_atendimento'),
    'agendamentos_pendentes', (select count(*) from public.sos_agendamentos where status = 'solicitado'),
    'por_ocorrencia', (select coalesce(jsonb_object_agg(tipo_ocorrencia, n), '{}'::jsonb) from (select tipo_ocorrencia, count(*) n from public.sos_chamados where recebido_em between p_inicio and p_fim group by 1) t),
    'por_mecanico', (select coalesce(jsonb_agg(jsonb_build_object('mecanico_id', mecanico_id, 'nome', u.nome_completo, 'atendimentos', n, 'nota_media', nota) order by n desc), '[]'::jsonb)
                     from (select mecanico_id, count(*) n, round(avg(avaliacao_nota), 2) nota from public.sos_chamados
                           where mecanico_id is not null and recebido_em between p_inicio and p_fim group by 1) t
                     join public.usuarios u on u.id = t.mecanico_id)
  ) end
$$;

-- Relatório gerencial do período: volume, prazos, qualidade, quem atendeu,
-- quem chamou e o que foi usado do catálogo. Tudo num JSON para a tela.
create or replace function public.sos_relatorio(p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select tempo_aceite_seg from public.sos_config where singleton),
  c as (select * from public.sos_chamados where recebido_em >= p_inicio and recebido_em < p_fim),
  it as (select i.* from public.sos_itens i join c on c.id = i.chamado_id)
  select case when not public.sos_eh_equipe() then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'inicio', p_inicio, 'fim', p_fim,
    'total', (select count(*) from c),
    'concluidos', (select count(*) from c where status in ('servico_finalizado', 'concluido')),
    'cancelados', (select count(*) from c where status = 'cancelado'),
    'em_aberto', (select count(*) from c where status not in ('servico_finalizado', 'concluido', 'cancelado')),
    'emergencias', (select count(*) from c where prioridade = 'emergencia'),
    'os_geradas', (select count(*) from c where os_id is not null),
    'valor_itens', (select coalesce(sum(valor_total), 0) from it),
    'aceite_no_prazo_pct', (select round(100.0 * count(*) filter (where c.tempo_aceite_seg <= cfg.tempo_aceite_seg)
                                         / nullif(count(*) filter (where c.tempo_aceite_seg is not null), 0), 1)
                            from c cross join cfg),
    'tempo_medio_aceite_seg', (select round(avg(tempo_aceite_seg)) from c),
    'tempo_medio_deslocamento_seg', (select round(avg(tempo_deslocamento_seg)) from c),
    'tempo_medio_servico_seg', (select round(avg(tempo_servico_seg)) from c),
    'tempo_medio_total_seg', (select round(avg(tempo_total_seg)) from c),
    'nota_media', (select round(avg(avaliacao_nota), 2) from c),
    'avaliacoes', (select count(avaliacao_nota) from c),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', n, 'concluidos', ok) order by dia), '[]'::jsonb) from (
                  select (recebido_em at time zone 'America/Sao_Paulo')::date as dia, count(*) n,
                         count(*) filter (where status in ('servico_finalizado', 'concluido')) ok
                  from c group by 1) t),
    'por_hora', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
                  select extract(hour from recebido_em at time zone 'America/Sao_Paulo')::int h, count(*) n from c group by 1) t),
    'por_ocorrencia', (select coalesce(jsonb_object_agg(tipo_ocorrencia, n), '{}'::jsonb) from (
                  select tipo_ocorrencia, count(*) n from c group by 1) t),
    'por_origem', (select coalesce(jsonb_object_agg(origem, n), '{}'::jsonb) from (select origem, count(*) n from c group by 1) t),
    'por_mecanico', (select coalesce(jsonb_agg(x order by (x->>'atendimentos')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'mecanico_id', c.mecanico_id, 'nome', u.nome_completo,
                    'atendimentos', count(*),
                    'concluidos', count(*) filter (where c.status in ('servico_finalizado', 'concluido')),
                    'cancelados', count(*) filter (where c.status = 'cancelado'),
                    'tempo_medio_aceite_seg', round(avg(c.tempo_aceite_seg)),
                    'tempo_medio_deslocamento_seg', round(avg(c.tempo_deslocamento_seg)),
                    'tempo_medio_servico_seg', round(avg(c.tempo_servico_seg)),
                    'nota_media', round(avg(c.avaliacao_nota), 2),
                    'recusas', (select count(*) from public.sos_recusas r where r.mecanico_id = c.mecanico_id
                                 and r.created_at >= p_inicio and r.created_at < p_fim),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.mecanico_id = c.mecanico_id)
                  ) as x
                  from c join public.usuarios u on u.id = c.mecanico_id
                  group by c.mecanico_id, u.nome_completo) t),
    'por_cliente', (select coalesce(jsonb_agg(x order by (x->>'chamados')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'cliente_id', c.cliente_id, 'nome', cl.nome_razao, 'chamados', count(*),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.cliente_id = c.cliente_id)
                  ) as x
                  from c join public.clientes cl on cl.id = c.cliente_id
                  group by c.cliente_id, cl.nome_razao
                  order by count(*) desc limit 15) t),
    'itens', (select coalesce(jsonb_agg(x order by (x->>'valor_total')::numeric desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'tipo', tipo, 'produto_id', produto_id, 'servico_id', servico_id, 'codigo', max(codigo),
                    'descricao', max(descricao), 'quantidade', sum(quantidade), 'valor_total', sum(valor_total),
                    'chamados', count(distinct chamado_id)
                  ) as x
                  from it group by tipo, produto_id, servico_id, coalesce(produto_id, servico_id)::text || descricao
                  order by sum(valor_total) desc limit 40) t),
    'motivos_cancelamento', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'papel', papel, 'n', n) order by n desc), '[]'::jsonb) from (
                  select coalesce(nullif(trim(motivo_cancelamento), ''), 'Sem motivo') motivo, cancelado_por_papel papel, count(*) n
                  from c where status = 'cancelado' group by 1, 2 order by 3 desc limit 10) t)
  ) end
$$;

-- Central gere a ficha do mecânico no SOS sem depender do celular dele:
-- tirar de "disponível" quem saiu sem avisar, desligar o SOS de alguém,
-- registrar a viatura. Também inclui no SOS um usuário cuja função não é de
-- mecânico (ex.: supervisor que atende socorro).
create or replace function public.sos_central_mecanico(p_usuario uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_atual uuid; v_sit public.sos_situacao_mecanico := nullif(p->>'situacao', '')::public.sos_situacao_mecanico;
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario and situacao = 'ativo') then
    raise exception 'Usuário inválido ou inativo.';
  end if;
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = p_usuario;
  if v_sit in ('disponivel', 'offline', 'indisponivel') and v_atual is not null
     and exists (select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')) then
    raise exception 'Este mecânico está num atendimento. Troque o mecânico do chamado antes.';
  end if;
  insert into public.sos_mecanicos (usuario_id, situacao, aceita_sos, veiculo_apoio, telefone_contato, mostrar_telefone)
  values (p_usuario, coalesce(v_sit, 'offline'), coalesce((p->>'aceita_sos')::boolean, true),
          nullif(p->>'veiculo_apoio', ''), nullif(p->>'telefone', ''), coalesce((p->>'mostrar_telefone')::boolean, false))
  on conflict (usuario_id) do update
    set situacao = coalesce(v_sit, public.sos_mecanicos.situacao),
        aceita_sos = coalesce((p->>'aceita_sos')::boolean, public.sos_mecanicos.aceita_sos),
        veiculo_apoio = case when p ? 'veiculo_apoio' then nullif(p->>'veiculo_apoio', '') else public.sos_mecanicos.veiculo_apoio end,
        telefone_contato = case when p ? 'telefone' then nullif(p->>'telefone', '') else public.sos_mecanicos.telefone_contato end,
        mostrar_telefone = coalesce((p->>'mostrar_telefone')::boolean, public.sos_mecanicos.mostrar_telefone),
        chamado_atual_id = case when coalesce(v_sit, public.sos_mecanicos.situacao) in ('disponivel', 'offline', 'indisponivel')
                                then null else public.sos_mecanicos.chamado_atual_id end;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.mecanico', 'sos_mecanicos', p_usuario, p);
  return (select to_jsonb(m) from public.sos_mecanicos m where m.usuario_id = p_usuario);
end;
$$;

-- Mapa e lista da central: mecânicos com posição e situação.
-- Recriada (e não só substituída): as colunas do retorno podem mudar entre versões.
drop function if exists public.sos_mecanicos_mapa();
create or replace function public.sos_mecanicos_mapa()
returns table (
  usuario_id uuid, nome text, avatar_url text, situacao public.sos_situacao_mecanico, aceita_sos boolean,
  latitude double precision, longitude double precision, posicao_em timestamptz, chamado_atual_id uuid,
  veiculo_apoio text, telefone text, especialidades text, visto_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.nome_completo, u.avatar_url, coalesce(m.situacao, 'offline'), coalesce(m.aceita_sos, true),
         m.latitude, m.longitude, m.posicao_em, m.chamado_atual_id, m.veiculo_apoio,
         coalesce(m.telefone_contato, u.telefone),
         (select string_agg(e.nome, ', ' order by e.nome) from public.usuario_especialidades ue
            join public.especialidades e on e.id = ue.especialidade_id where ue.usuario_id = u.id),
         pr.visto_em
  from public.usuarios u
  left join public.funcoes f on f.id = u.funcao_id
  left join public.sos_mecanicos m on m.usuario_id = u.id
  left join public.sos_presenca pr on pr.usuario_id = u.id
  where public.sos_eh_equipe() and u.situacao = 'ativo' and (coalesce(f.atua_como_mecanico, false) or m.usuario_id is not null)
  order by case coalesce(m.situacao, 'offline') when 'em_atendimento' then 0 when 'disponivel' then 1 when 'pausa' then 2 when 'indisponivel' then 3 else 4 end,
           u.nome_completo
$$;

-- Lista da central com os dados de exibição já juntos (cliente, placa, mecânico).
create or replace function public.sos_listar_chamados(p_filtro jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(x order by (x->>'ordem_prioridade')::int, (x->>'recebido_em') desc) from (
      select to_jsonb(c) || jsonb_build_object(
        'cliente_nome', cl.nome_razao,
        'placa', v.placa, 'veiculo', nullif(concat_ws(' ', v.marca, v.modelo), ''),
        'mecanico_nome', u.nome_completo,
        'status_rotulo', public.sos_rotulo_status(c.status),
        'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
        'os_numero', (select numero from public.ordens_servico where id = c.os_id),
        'mensagens_nao_lidas', (select count(*) from public.sos_mensagens m where m.chamado_id = c.id and m.lida_em is null and m.autor_papel = 'cliente'),
        'ordem_prioridade', case when c.status in ('recebido', 'procurando_mecanico') then 0
                                 when c.status in ('aceito', 'a_caminho', 'no_local', 'servico_iniciado') then 1
                                 when c.status = 'servico_finalizado' then 2 else 3 end
      ) as x
      from public.sos_chamados c
      join public.clientes cl on cl.id = c.cliente_id
      left join public.veiculos v on v.id = c.veiculo_id
      left join public.usuarios u on u.id = c.mecanico_id
      where (nullif(p_filtro->>'status', '') is null or c.status::text = any (string_to_array(p_filtro->>'status', ',')))
        and (nullif(p_filtro->>'mecanico_id', '') is null or c.mecanico_id = (p_filtro->>'mecanico_id')::uuid)
        and (nullif(p_filtro->>'ocorrencia', '') is null or c.tipo_ocorrencia::text = p_filtro->>'ocorrencia')
        and (nullif(p_filtro->>'de', '') is null or c.recebido_em >= (p_filtro->>'de')::timestamptz)
        and (nullif(p_filtro->>'ate', '') is null or c.recebido_em < (p_filtro->>'ate')::timestamptz + interval '1 day')
        and (nullif(trim(p_filtro->>'busca'), '') is null
             or c.protocolo ilike '%' || trim(p_filtro->>'busca') || '%'
             or cl.nome_razao ilike '%' || trim(p_filtro->>'busca') || '%'
             or upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) like '%' || upper(regexp_replace(p_filtro->>'busca', '[^A-Za-z0-9]', '', 'g')) || '%'
             or coalesce(v.modelo, '') ilike '%' || trim(p_filtro->>'busca') || '%')
        and (coalesce((p_filtro->>'ativos')::boolean, false) = false or c.status not in ('concluido', 'cancelado'))
      order by c.recebido_em desc
      limit least(coalesce((p_filtro->>'limite')::int, 200), 500)
    ) t), '[]'::jsonb) end
$$;

create or replace function public.sos_salvar_config(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  update public.sos_config
  set modo_distribuicao = coalesce(p->>'modo_distribuicao', modo_distribuicao),
      raio_busca_km = coalesce((p->>'raio_busca_km')::numeric, raio_busca_km),
      velocidade_media_kmh = coalesce((p->>'velocidade_media_kmh')::numeric, velocidade_media_kmh),
      tempo_aceite_seg = coalesce((p->>'tempo_aceite_seg')::int, tempo_aceite_seg),
      telefone_central = case when p ? 'telefone_central' then nullif(p->>'telefone_central', '') else telefone_central end,
      whatsapp_ativo = coalesce((p->>'whatsapp_ativo')::boolean, whatsapp_ativo),
      whatsapp_url = case when p ? 'whatsapp_url' then nullif(p->>'whatsapp_url', '') else whatsapp_url end,
      whatsapp_instancia = case when p ? 'whatsapp_instancia' then nullif(p->>'whatsapp_instancia', '') else whatsapp_instancia end,
      whatsapp_destinos = case when p ? 'whatsapp_destinos' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p->'whatsapp_destinos') x) else whatsapp_destinos end,
      mensagem_espera = coalesce(nullif(p->>'mensagem_espera', ''), mensagem_espera),
      lembrete_meses = coalesce((p->>'lembrete_meses')::int, lembrete_meses),
      lembrete_km = coalesce((p->>'lembrete_km')::int, lembrete_km),
      cancelamento_cliente_ate = coalesce(nullif(p->>'cancelamento_cliente_ate', '')::public.sos_status, cancelamento_cliente_ate),
      gerar_os_ao_finalizar = coalesce((p->>'gerar_os_ao_finalizar')::boolean, gerar_os_ao_finalizar),
      offline_apos_min = greatest(0, coalesce((p->>'offline_apos_min')::int, offline_apos_min)),
      concluir_apos_horas = greatest(1, coalesce((p->>'concluir_apos_horas')::int, concluir_apos_horas)),
      atualizado_por = auth.uid(), updated_at = now()
  where singleton;
  -- A chave da Evolution API nunca volta para o app: só entra.
  if nullif(p->>'whatsapp_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_whatsapp_apikey', p->>'whatsapp_apikey')
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.config', 'sos_config', '00000000-0000-0000-0000-000000000000'::uuid, p - 'whatsapp_apikey');
  return (select to_jsonb(c) || jsonb_build_object('whatsapp_apikey_definida', exists (select 1 from privado.config where chave = 'sos_whatsapp_apikey'))
          from public.sos_config c where c.singleton);
end;
$$;

create or replace function public.sos_config_atual()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select case when not public.sos_eh_equipe() then null else
    to_jsonb(c) || jsonb_build_object('whatsapp_apikey_definida', exists (select 1 from privado.config where chave = 'sos_whatsapp_apikey'))
  end from public.sos_config c where c.singleton
$$;

-- Central abre chamado em nome do cliente (telefone/WhatsApp) — o mesmo
-- `sos_abrir_chamado` cuida; aqui só a busca de cliente por nome/doc/placa.
create or replace function public.sos_buscar_cliente(p_termo text)
returns table (cliente_id uuid, nome text, documento text, celular text, veiculos jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.nome_razao, c.documento, coalesce(c.celular, c.telefone),
         (select jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'descricao', concat_ws(' ', v.marca, v.modelo, v.ano)))
          from public.veiculos v where v.cliente_id = c.id and v.situacao = 'ativo')
  from public.clientes c
  where public.sos_eh_equipe() and c.situacao = 'ativo' and length(trim(coalesce(p_termo, ''))) >= 2
    and (c.nome_razao ilike '%' || p_termo || '%'
         or (length(regexp_replace(p_termo, '\D', '', 'g')) >= 3 and c.documento_digitos like regexp_replace(p_termo, '\D', '', 'g') || '%')
         or exists (select 1 from public.veiculos v where v.cliente_id = c.id
                    and upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) like upper(regexp_replace(p_termo, '[^A-Za-z0-9]', '', 'g')) || '%'))
  order by c.nome_razao limit 20
$$;

-- Contas do app (clientes) para a central conferir vínculo e acesso.
create or replace function public.sos_contas_app(p_termo text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'nome', a.nome, 'telefone', a.telefone, 'email', a.email,
      'cliente_id', a.cliente_id, 'cliente_nome', cl.nome_razao, 'created_at', a.created_at,
      'ultimo_acesso', (select last_sign_in_at from auth.users where id = a.usuario_id),
      'chamados', (select count(*) from public.sos_chamados where conta_usuario_id = a.usuario_id),
      'veiculos', (select count(*) from public.veiculos where cliente_id = a.cliente_id and situacao = 'ativo')
    ) order by a.created_at desc)
    from public.sos_contas_cliente a
    left join public.clientes cl on cl.id = a.cliente_id
    where nullif(trim(p_termo), '') is null or a.nome ilike '%' || p_termo || '%' or a.email ilike '%' || p_termo || '%'
       or coalesce(a.telefone_digitos, '') like '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'
  ), '[]'::jsonb) end
$$;

-- Limpeza do rastro: 30 dias após encerrar, a localização some.
create or replace function public.sos_limpar_posicoes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  with apagadas as (
    delete from public.sos_posicoes p
    using public.sos_chamados c
    where c.id = p.chamado_id and c.status in ('concluido', 'cancelado')
      and coalesce(c.concluido_em, c.cancelado_em, c.updated_at) < now() - interval '30 days'
    returning 1
  ) select count(*) into v_n from apagadas;
  delete from public.sos_compartilhamentos where expira_em < now() - interval '7 days';
  return v_n;
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;;
