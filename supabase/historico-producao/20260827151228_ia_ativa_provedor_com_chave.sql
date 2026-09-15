-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827151228.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Aponta a IA para o provedor que realmente tem chave.
update ia_config
   set provedor = 'gemini',
       modelo = coalesce((select ambiente from integracoes where provedor = 'gemini'), 'gemini-2.5-pro'),
       updated_at = now()
 where id;

/**
 * Ativa automaticamente um provedor recém-configurado.
 *
 * Guardar a chave e continuar vendo "não configurada" é uma armadilha: quem
 * cadastrou a chave espera que ela passe a valer. Quando o provedor ativo
 * está sem chave e outro acabou de ganhar uma, a IA passa a usar o que
 * funciona — em vez de ficar apontando para o vazio.
 *
 * Se o provedor ativo já tem chave, nada muda: trocar de fornecedor continua
 * sendo decisão explícita do administrador.
 */
create or replace function tg_ia_ativa_provedor_configurado()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ativo text;
begin
  if new.app_key is null or new.provedor not in ('anthropic', 'openai', 'gemini') then
    return new;
  end if;

  select c.provedor into v_ativo from ia_config c where c.id;
  if v_ativo = new.provedor then
    return new;
  end if;

  if not exists (
    select 1 from integracoes i where i.provedor = v_ativo and i.app_key is not null
  ) then
    update ia_config
       set provedor = new.provedor,
           modelo = coalesce(nullif(btrim(new.ambiente), ''), modelo),
           updated_at = now()
     where id;
  end if;

  return new;
end;
$$;

drop trigger if exists ia_ativa_provedor_configurado on integracoes;
create trigger ia_ativa_provedor_configurado
  after insert or update of app_key on integracoes
  for each row execute function tg_ia_ativa_provedor_configurado();

select (select provedor from ia_config where id) provedor_ativo,
       (select modelo from ia_config where id) modelo;
