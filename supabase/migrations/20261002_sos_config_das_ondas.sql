-- SOS Tecnoar — a configuração das ondas também pela tela.
-- Roda depois de 20261001_sos_motor_de_ondas.sql. Idempotente.
--
-- 20260930_sos_ofertas_e_politica.sql criou três colunas em `sos_config`:
-- `despacho_em_ondas` (a chave de desligar), `onda_emergencia_pct` (quanto a
-- emergência encurta a espera de cada onda) e `posicao_valida_min` (de que
-- idade a posição do mecânico ainda vale distância). Mas `sos_salvar_config`
-- é de 20260927 e não conhece nenhuma das três: até aqui só se mexia nelas
-- por SQL, e a tela de Configurações não tinha como gravar.
--
-- Esta migração redefine `sos_salvar_config` — cópia fiel da versão de
-- 20260927_sos_whatsapp_atendimento.sql mais as três linhas novas. Nada mais
-- muda: `sos_config_atual` já devolve as colunas (ela usa `to_jsonb(c)`).
--
-- Por que migração nova e não corrigir a de 20260930: reaplicar um arquivo
-- antigo volta à versão antiga as funções redefinidas depois dele — e
-- `sos_salvar_config` é justamente uma delas. Mudança nova = migração nova.

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
      -- Despacho em ondas (colunas de 20260930). Desligar devolve o
      -- comportamento antigo: push para todo mecânico disponível.
      despacho_em_ondas = coalesce((p->>'despacho_em_ondas')::boolean, despacho_em_ondas),
      -- O `check` da coluna é > 0 e <= 100: o clamp evita que a tela derrube
      -- a gravação inteira por um campo digitado errado.
      onda_emergencia_pct = least(100, greatest(1, coalesce((p->>'onda_emergencia_pct')::numeric, onda_emergencia_pct))),
      posicao_valida_min = greatest(1, coalesce((p->>'posicao_valida_min')::int, posicao_valida_min)),
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

revoke execute on function public.sos_salvar_config(jsonb) from public, anon;
grant execute on function public.sos_salvar_config(jsonb) to authenticated, service_role;
