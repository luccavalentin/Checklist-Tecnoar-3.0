-- SOS Tecnoar — WhatsApp de atendimento configurável na Gestão SOS.
-- Roda depois de 20260926_sos_produto_detalhe.sql. Idempotente.
--
-- Até aqui o botão de WhatsApp do app (login, barra flutuante, contato,
-- chamado) usava o celular do cadastro da empresa. Agora a central define o
-- número em Gestão SOS › Configurações › Atendimento. O número oficial do SOS
-- é (19) 99389-6000: já vem gravado e é o que vale quando o campo fica vazio.
--
-- Não confundir com whatsapp_destinos: aqueles são os números da EQUIPE
-- avisados pela Evolution API. Este é o número que o CLIENTE chama.

alter table public.sos_config
  add column if not exists whatsapp_atendimento text;

update public.sos_config
set whatsapp_atendimento = '19993896000'
where singleton and nullif(whatsapp_atendimento, '') is null;

-- ============================================================== info pública
create or replace function public.sos_info_publica()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'empresa', coalesce(e.nome_fantasia, e.razao_social, 'Tecnoar'),
    'telefone', coalesce(c.telefone_central, e.suporte_telefone, e.celular, e.telefone),
    'whatsapp', coalesce(nullif(c.whatsapp_atendimento, ''), '19993896000'),
    'politica_privacidade_url', e.politica_privacidade_url,
    'mensagem_espera', c.mensagem_espera,
    'cancelamento_cliente_ate', c.cancelamento_cliente_ate
  )
  from public.sos_config c
  left join public.dados_empresa e on e.singleton
  where c.singleton
$$;

grant execute on function public.sos_info_publica() to anon, authenticated;

-- ============================================================== salvar (com o WhatsApp de atendimento)
-- Cópia fiel da versão de 20260914_sos_premium_ia.sql + a linha do WhatsApp.
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
      whatsapp_atendimento = case when p ? 'whatsapp_atendimento' then nullif(regexp_replace(coalesce(p->>'whatsapp_atendimento', ''), '[^0-9]', '', 'g'), '') else whatsapp_atendimento end,
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
      exigir_aprovacao_orcamento = coalesce((p->>'exigir_aprovacao_orcamento')::boolean, exigir_aprovacao_orcamento),
      deslocamento_ativo = coalesce((p->>'deslocamento_ativo')::boolean, deslocamento_ativo),
      deslocamento_valor_km = greatest(0, coalesce((p->>'deslocamento_valor_km')::numeric, deslocamento_valor_km)),
      deslocamento_taxa_minima = greatest(0, coalesce((p->>'deslocamento_taxa_minima')::numeric, deslocamento_taxa_minima)),
      deslocamento_ida_volta = coalesce((p->>'deslocamento_ida_volta')::boolean, deslocamento_ida_volta),
      deslocamento_servico_id = case when p ? 'deslocamento_servico_id' then nullif(p->>'deslocamento_servico_id', '')::uuid else deslocamento_servico_id end,
      ia_ativa = coalesce((p->>'ia_ativa')::boolean, ia_ativa),
      ia_provedor = coalesce(nullif(p->>'ia_provedor', ''), ia_provedor),
      ia_modelo = coalesce(nullif(trim(p->>'ia_modelo'), ''), ia_modelo),
      ia_usar_chave_tecnoar_ia = coalesce((p->>'ia_usar_chave_tecnoar_ia')::boolean, ia_usar_chave_tecnoar_ia),
      ia_instrucoes = case when p ? 'ia_instrucoes' then nullif(trim(p->>'ia_instrucoes'), '') else ia_instrucoes end,
      ia_atendimento = coalesce((p->>'ia_atendimento')::boolean, ia_atendimento),
      ia_foto = coalesce((p->>'ia_foto')::boolean, ia_foto),
      ia_kit = coalesce((p->>'ia_kit')::boolean, ia_kit),
      ia_resumo = coalesce((p->>'ia_resumo')::boolean, ia_resumo),
      ia_limite_cliente_dia = greatest(0, coalesce((p->>'ia_limite_cliente_dia')::int, ia_limite_cliente_dia)),
      atualizado_por = auth.uid(), updated_at = now()
  where singleton;
  -- Chaves nunca voltam para a tela: só entram.
  if nullif(p->>'whatsapp_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_whatsapp_apikey', p->>'whatsapp_apikey')
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  if nullif(p->>'ia_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_ia_apikey', trim(p->>'ia_apikey'))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  if coalesce((p->>'ia_remover_chave')::boolean, false) then
    delete from privado.config where chave = 'sos_ia_apikey';
  end if;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.config', 'sos_config', '00000000-0000-0000-0000-000000000000'::uuid, p - 'whatsapp_apikey' - 'ia_apikey');
  return public.sos_config_atual();
end;
$$;
