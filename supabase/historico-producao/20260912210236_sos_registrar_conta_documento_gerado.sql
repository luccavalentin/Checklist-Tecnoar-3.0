-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912210236.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- `clientes.documento_digitos` é coluna gerada no banco real: o cadastro do
-- app grava só `documento`.
create or replace function public.sos_registrar_conta(
  p_nome text, p_telefone text, p_documento text default null, p_email text default null,
  p_aceite_termos boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel   text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_doc   text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_cli   uuid;
  v_nome  text := nullif(trim(p_nome), '');
  v_email text := coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = auth.uid()));
  v_sit   text;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  if v_nome is null then raise exception 'Informe seu nome.'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe um celular com DDD.'; end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ incompleto.'; end if;

  select situacao::text into v_sit from public.usuarios where id = auth.uid();
  if v_sit is not null and v_sit <> 'pendente' then
    raise exception 'Esta conta é da equipe Tecnoar. Entre como mecânico.';
  end if;
  if v_sit = 'pendente' then
    -- Pedido de acesso criado sozinho quando a conta nasceu pelo app: some.
    if coalesce((select raw_user_meta_data->>'tipo_conta' from auth.users where id = auth.uid()), '') = 'sos_cliente' then
      delete from public.usuarios where id = auth.uid() and situacao = 'pendente';
    else
      raise exception 'Esta conta tem um pedido de acesso à equipe em análise. Use outro e-mail para o app de cliente.';
    end if;
  end if;

  if v_doc is not null then
    select id into v_cli from public.clientes where documento_digitos = v_doc and situacao = 'ativo' limit 1;
  end if;
  if v_cli is null then
    -- Últimos 8 dígitos evitam diferença de DDI/9º dígito entre cadastros.
    select id into v_cli from public.clientes
    where situacao = 'ativo'
      and (right(regexp_replace(coalesce(celular, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
           or right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8))
    order by created_at limit 1;
  end if;
  if v_cli is null then
    -- `documento_digitos` é coluna gerada a partir de `documento`.
    insert into public.clientes (tipo_pessoa, nome_razao, documento, celular, email, origem, notificar_whatsapp)
    values (
      (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
      v_nome, nullif(trim(p_documento), ''), p_telefone, v_email, 'manual', true
    )
    returning id into v_cli;
  end if;

  insert into public.sos_contas_cliente (usuario_id, cliente_id, nome, telefone, telefone_digitos, documento_digitos, email, aceite_termos_em)
  values (auth.uid(), v_cli, v_nome, p_telefone, v_tel, v_doc, v_email, case when p_aceite_termos then now() end)
  on conflict (usuario_id) do update
    set cliente_id = coalesce(public.sos_contas_cliente.cliente_id, excluded.cliente_id),
        nome = excluded.nome, telefone = excluded.telefone, telefone_digitos = excluded.telefone_digitos,
        documento_digitos = coalesce(excluded.documento_digitos, public.sos_contas_cliente.documento_digitos),
        email = coalesce(excluded.email, public.sos_contas_cliente.email),
        aceite_termos_em = coalesce(public.sos_contas_cliente.aceite_termos_em, excluded.aceite_termos_em),
        updated_at = now();

  return public.sos_meu_papel();
end;
$$;;
