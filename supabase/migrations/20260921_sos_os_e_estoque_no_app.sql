-- OS e estoque no app do mecânico, falando com o sistema Tecnoar.
--
-- ESTOQUE — quem manda no saldo é a Omie (ERP): a sincronização grava em
-- `produtos.saldo` e `produtos.reservado` o que a Omie tem, e sobrescreve a
-- cada importação. Por isso o Tecnoar NÃO mexe nesses campos (uma reserva
-- gravada ali sumiria na próxima sincronização). O que ele sabe e a Omie não
-- sabe é o que já está comprometido em campo e na oficina:
--
--   disponível = saldo (Omie) − reservado (Omie) − comprometido (Tecnoar)
--   comprometido = peças em OS abertas do Tecnoar (ainda não faturadas na Omie)
--                + peças lançadas em SOS abertos que ainda não viraram OS
--
-- Assim dois mecânicos não contam com a mesma última peça, e o número volta a
-- bater sozinho quando a OS é faturada na Omie e o estoque é sincronizado.
-- Cada peça na OS ganha o estado do Checklist: `reservado` (havia estoque),
-- `necessario` (faltou — a central é avisada na hora) e `utilizado` (serviço
-- finalizado).
--
-- OS NO APP — o mecânico vê as OS dele (as que a oficina o escalou e as dos
-- socorros que atendeu), abre, lança e ajusta peças e serviços do catálogo,
-- informa km e diagnóstico. OS ligada a um SOS aberto passa pelos itens do
-- SOS (os dois lados ficam iguais). Criar OS pelo app exige a mesma permissão
-- do Checklist (`ordens_servico: criar`).

-- ───────────────────────────────────────────────────────── estoque real
create or replace function public.sos_estoque_comprometido(p_produto uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select sum(op.quantidade)
    from public.os_produtos op
    join public.ordens_servico o on o.id = op.os_id
    where op.produto_id = p_produto and op.situacao = 'ativo' and op.aprovacao <> 'recusado'
      and op.estado in ('necessario', 'reservado', 'utilizado')
      and o.encerrada_em is null and o.situacao = 'ativo'
  ), 0) + coalesce((
    select sum(i.quantidade)
    from public.sos_itens i
    join public.sos_chamados c on c.id = i.chamado_id
    where i.produto_id = p_produto and i.os_item_id is null
      and c.status not in ('concluido', 'cancelado')
  ), 0)
$$;

create or replace function public.sos_estoque_disponivel(p_produto uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(coalesce(p.saldo, 0) - coalesce(p.reservado, 0) - public.sos_estoque_comprometido(p.id), 0)
  from public.produtos p where p.id = p_produto
$$;

revoke execute on function public.sos_estoque_comprometido(uuid) from public, anon;
revoke execute on function public.sos_estoque_disponivel(uuid) from public, anon;
grant execute on function public.sos_estoque_comprometido(uuid) to authenticated;
grant execute on function public.sos_estoque_disponivel(uuid) to authenticated;

-- Catálogo com o estoque de verdade (e de quando ele é).
drop function if exists public.sos_catalogo(text, text, integer);
create or replace function public.sos_catalogo(p_termo text, p_tipo text default null, p_limite integer default 30)
returns table (
  tipo text, id uuid, codigo text, descricao text, unidade text, preco numeric,
  saldo numeric, reservado numeric, comprometido numeric, disponivel numeric, estoque_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.tipo, t.id, t.codigo, t.descricao, t.unidade, t.preco, t.saldo, t.reservado, t.comprometido,
         case when t.tipo = 'produto' then greatest(coalesce(t.saldo, 0) - coalesce(t.reservado, 0) - t.comprometido, 0) end,
         t.estoque_em
  from (
    select 'produto'::text as tipo, p.id, p.codigo, p.descricao, p.unidade, p.preco_venda as preco, p.saldo,
           p.reservado, public.sos_estoque_comprometido(p.id) as comprometido, p.omie_sincronizado_em as estoque_em
    from public.produtos p
    where (p_tipo is null or p_tipo = 'produto') and p.situacao = 'ativo' and not coalesce(p.bloqueado, false)
      and (p.descricao ilike '%' || p_termo || '%' or p.codigo ilike p_termo || '%' or coalesce(p.referencia, '') ilike p_termo || '%')
    union all
    select 'servico'::text, s.id, s.codigo, s.descricao, null, s.valor_padrao, null, null, 0, null
    from public.servicos s
    where (p_tipo is null or p_tipo = 'servico') and s.situacao = 'ativo'
      and (s.descricao ilike '%' || p_termo || '%' or s.codigo ilike p_termo || '%')
  ) t
  where (public.sos_eh_mecanico() or public.sos_eh_equipe()) and length(trim(coalesce(p_termo, ''))) >= 2
  order by 4
  limit least(greatest(p_limite, 1), 60)
$$;
revoke execute on function public.sos_catalogo(text, text, integer) from public, anon;
grant execute on function public.sos_catalogo(text, text, integer) to authenticated;

-- Peça sem estoque disponível: a central fica sabendo na hora, não na oficina.
create or replace function public.sos_avisar_falta_estoque(p_descricao text, p_quantidade numeric, p_disponivel numeric, p_onde text, p_link text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_u uuid;
  -- 2 → "2"; 1,5 → "1,5" (quantidade de peça, sem casas à toa).
  v_qtd  text := case when p_quantidade = trunc(p_quantidade) then trunc(p_quantidade)::bigint::text
                      else replace(round(p_quantidade, 3)::text, '.', ',') end;
  v_disp text := case when p_disponivel = trunc(p_disponivel) then trunc(p_disponivel)::bigint::text
                      else replace(round(p_disponivel, 3)::text, '.', ',') end;
begin
  for v_u in select * from public.sos_usuarios_central() loop
    perform public.sos_notificar(v_u, 'Peça sem estoque: ' || left(p_descricao, 60),
      p_onde || ': lançado ' || v_qtd || ', disponível ' || v_disp || '. Providencie a peça ou combine outra com o mecânico.',
      p_link);
  end loop;
end;
$$;
revoke execute on function public.sos_avisar_falta_estoque(text, numeric, numeric, text, text) from public, anon, authenticated;

-- ─────────────────────────────── itens do SOS com estado de estoque na OS
create or replace function public.sos_sincronizar_itens_os(p_chamado uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os     uuid;
  v_status public.sos_status;
  v_it     public.sos_itens;
  v_id     uuid;
  v_ord    integer;
  v_n      integer := 0;
  v_estado public.estado_produto_os;
begin
  select os_id, status into v_os, v_status from public.sos_chamados where id = p_chamado;
  if v_os is null then return 0; end if;
  for v_it in select * from public.sos_itens where chamado_id = p_chamado and os_item_id is null order by created_at loop
    if v_it.tipo = 'produto' then
      -- Estado da peça na OS: usada (serviço feito), reservada (havia
      -- estoque) ou necessária (faltou). O comprometido já conta este item
      -- (ainda sem OS), então "sobra ≥ 0" quer dizer que ele coube.
      v_estado := case
        when v_status in ('servico_finalizado', 'concluido') then 'utilizado'
        when v_it.produto_id is not null
             and (select coalesce(saldo, 0) - coalesce(reservado, 0) from public.produtos where id = v_it.produto_id)
                 - public.sos_estoque_comprometido(v_it.produto_id) >= 0 then 'reservado'
        else 'necessario' end;
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_produtos where os_id = v_os;
      insert into public.os_produtos (os_id, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, desconto, ordem, estado)
      values (v_os, v_it.produto_id, v_it.codigo, v_it.descricao, coalesce(v_it.unidade, 'UN'), v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord, v_estado)
      returning id into v_id;
    else
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_servicos where os_id = v_os;
      insert into public.os_servicos (os_id, servico_id, codigo, descricao, quantidade, valor_unitario, desconto, ordem)
      values (v_os, v_it.servico_id, v_it.codigo, v_it.descricao, v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord)
      returning id into v_id;
    end if;
    update public.sos_itens set os_item_id = v_id where id = v_it.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.sos_adicionar_item(p_chamado uuid, p_tipo text, p_ref uuid, p_quantidade numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_id    uuid;
  v_p     public.produtos;
  v_s     public.servicos;
  v_disp  numeric;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado encerrado.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;

  if p_tipo = 'produto' then
    select * into v_p from public.produtos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Produto não encontrado no catálogo.'; end if;
    -- Disponível ANTES deste lançamento (Omie − comprometido no Tecnoar).
    v_disp := public.sos_estoque_disponivel(v_p.id);
    insert into public.sos_itens (chamado_id, tipo, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'produto', v_p.id, v_p.codigo, v_p.descricao, v_p.unidade, p_quantidade, coalesce(v_p.preco_venda, 0), auth.uid())
    returning id into v_id;
    if p_quantidade > v_disp then
      perform public.sos_avisar_falta_estoque(v_p.descricao, p_quantidade, v_disp, 'SOS ' || v_c.protocolo, '/sos?chamado=' || p_chamado);
    end if;
  elsif p_tipo = 'servico' then
    select * into v_s from public.servicos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Serviço não encontrado no catálogo.'; end if;
    insert into public.sos_itens (chamado_id, tipo, servico_id, codigo, descricao, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'servico', v_s.id, v_s.codigo, v_s.descricao, p_quantidade, coalesce(v_s.valor_padrao, 0), auth.uid())
    returning id into v_id;
  else
    raise exception 'Tipo de item inválido.';
  end if;

  perform public.sos_registrar_evento(p_chamado, 'item', 'Item lançado: ' || coalesce(v_p.descricao, v_s.descricao),
    null, jsonb_build_object('item_id', v_id, 'tipo', p_tipo, 'quantidade', p_quantidade), null, null, null);
  -- Chamado que já tem OS recebe o item lá também.
  perform public.sos_sincronizar_itens_os(p_chamado);
  return (select to_jsonb(i) from public.sos_itens i where i.id = v_id)
    || case when p_tipo = 'produto'
            then jsonb_build_object('estoque', jsonb_build_object('disponivel_antes', v_disp, 'faltou', p_quantidade > v_disp))
            else '{}'::jsonb end;
end;
$$;

-- Serviço finalizado: as peças do SOS na OS passam a "utilizado".
create or replace function public.sos_texto_para_os()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_obs text;
begin
  if new.os_id is null then return new; end if;
  if new.diagnostico is not distinct from old.diagnostico
     and new.servico_realizado is not distinct from old.servico_realizado
     and new.observacoes_finais is not distinct from old.observacoes_finais
     and new.os_id is not distinct from old.os_id
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- Mesmo formato de `sos_gerar_os`: é por ele que sabemos que o bloco é do SOS.
  v_obs := concat_ws(E'\n', 'Atendimento SOS em ' || coalesce(new.endereco, 'local informado no app'),
                     nullif(trim(new.servico_realizado), ''), nullif(trim(new.observacoes_finais), ''));

  update public.ordens_servico o
  set diagnostico = case
        when coalesce(trim(o.diagnostico), '') in ('', coalesce(trim(old.diagnostico), ''))
          then coalesce(nullif(trim(new.diagnostico), ''), o.diagnostico)
        else o.diagnostico end,
      observacoes = case
        when coalesce(o.observacoes, '') = '' or o.observacoes like 'Atendimento SOS%' then v_obs
        else o.observacoes end
  where o.id = new.os_id and o.encerrada_em is null;

  if new.status = 'servico_finalizado' and old.status is distinct from 'servico_finalizado' then
    -- Peças lançadas no socorro foram usadas.
    update public.os_produtos op set estado = 'utilizado'
    where op.id in (select i.os_item_id from public.sos_itens i where i.chamado_id = new.id and i.tipo = 'produto' and i.os_item_id is not null)
      and op.estado in ('necessario', 'reservado');

    -- Finalizou sem serviço do catálogo: o serviço descrito vira linha da OS.
    if nullif(trim(new.servico_realizado), '') is not null
       and not exists (select 1 from public.sos_itens where chamado_id = new.id and tipo = 'servico')
       and not exists (select 1 from public.os_servicos where os_id = new.os_id and descricao like 'Socorro: %')
       and exists (select 1 from public.ordens_servico where id = new.os_id and encerrada_em is null) then
      insert into public.os_servicos (os_id, descricao, quantidade, valor_unitario, ordem)
      values (new.os_id, left('Socorro: ' || new.servico_realizado, 200), 1, 0,
              (select coalesce(max(ordem), 0) + 1 from public.os_servicos where os_id = new.os_id));
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────── OS no app
-- Quem vê e quem mexe numa OS pelo app.
create or replace function public.sos_acesso_os(p_os uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ver', (v.escalado or v.do_socorro or public.tem_permissao('ordens_servico', 'visualizar')),
    'editar', o.encerrada_em is null and o.situacao = 'ativo'
              and (v.escalado or v.do_socorro or public.tem_permissao('ordens_servico', 'editar')),
    'chamado_id', v.chamado_id)
  from public.ordens_servico o
  cross join lateral (
    select exists (select 1 from public.os_mecanicos m where m.os_id = o.id and m.usuario_id = auth.uid()) as escalado,
           exists (select 1 from public.sos_chamados c where c.os_id = o.id and c.mecanico_id = auth.uid()) as do_socorro,
           (select c.id from public.sos_chamados c where c.os_id = o.id order by c.recebido_em desc limit 1) as chamado_id
  ) v
  where o.id = p_os
$$;

-- Minhas OS: as que a oficina me escalou e as dos socorros que atendi.
create or replace function public.sos_minhas_os(p_situacao text default 'abertas', p_limite integer default 40)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'pode_criar', public.tem_permissao('ordens_servico', 'criar'),
    'lista', coalesce((
      select jsonb_agg(x order by x->>'ordem' desc)
      from (
        select jsonb_build_object(
          'id', o.id, 'numero', o.numero, 'aberta_em', o.aberta_em, 'encerrada_em', o.encerrada_em,
          'ordem', coalesce(o.encerrada_em, o.aberta_em),
          'status', s.nome, 'status_cor', s.cor,
          'cliente', cl.nome_razao, 'placa', v.placa, 'veiculo', nullif(concat_ws(' ', v.marca, v.modelo), ''),
          'valor_total', o.valor_total, 'problema', o.problema_alegado,
          'itens', (select count(*) from public.os_produtos p where p.os_id = o.id and p.situacao = 'ativo')
                 + (select count(*) from public.os_servicos sv where sv.os_id = o.id and sv.situacao = 'ativo'),
          'faltando', (select count(*) from public.os_produtos p where p.os_id = o.id and p.situacao = 'ativo' and p.estado = 'necessario'),
          'chamado_id', c.id, 'protocolo', c.protocolo) as x
        from public.ordens_servico o
        join public.clientes cl on cl.id = o.cliente_id
        join public.veiculos v on v.id = o.veiculo_id
        left join public.status_os s on s.id = o.status_id
        left join lateral (select c.id, c.protocolo from public.sos_chamados c where c.os_id = o.id order by c.recebido_em desc limit 1) c on true
        where o.situacao = 'ativo'
          and (exists (select 1 from public.os_mecanicos m where m.os_id = o.id and m.usuario_id = auth.uid())
               or exists (select 1 from public.sos_chamados c2 where c2.os_id = o.id and c2.mecanico_id = auth.uid()))
          and case when p_situacao = 'encerradas' then o.encerrada_em > now() - interval '90 days'
                   else o.encerrada_em is null end
        order by coalesce(o.encerrada_em, o.aberta_em) desc
        limit least(greatest(p_limite, 1), 100)
      ) l
    ), '[]'::jsonb))
$$;

create or replace function public.sos_os_detalhe(p_os uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_acesso jsonb := public.sos_acesso_os(p_os);
  v_o      public.ordens_servico;
begin
  if v_acesso is null or not (v_acesso->>'ver')::boolean then raise exception 'Sem acesso a esta OS.'; end if;
  select * into v_o from public.ordens_servico where id = p_os;
  return jsonb_build_object(
    'os', jsonb_build_object(
      'id', v_o.id, 'numero', v_o.numero, 'aberta_em', v_o.aberta_em, 'encerrada_em', v_o.encerrada_em,
      'km', v_o.km, 'problema', v_o.problema_alegado, 'diagnostico', v_o.diagnostico, 'observacoes', v_o.observacoes,
      'valor_produtos', v_o.valor_produtos, 'valor_servicos', v_o.valor_servicos, 'desconto', v_o.desconto,
      'acrescimo', v_o.acrescimo, 'valor_total', v_o.valor_total,
      'status', (select jsonb_build_object('nome', s.nome, 'cor', s.cor) from public.status_os s where s.id = v_o.status_id)),
    'cliente', (select jsonb_build_object('id', cl.id, 'nome', cl.nome_razao, 'telefone', coalesce(cl.celular, cl.telefone))
                from public.clientes cl where cl.id = v_o.cliente_id),
    'veiculo', (select jsonb_build_object('id', v.id, 'placa', v.placa, 'marca', v.marca, 'modelo', v.modelo, 'ano', v.ano, 'km_atual', v.km_atual)
                from public.veiculos v where v.id = v_o.veiculo_id),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'produto_id', p.produto_id, 'codigo', p.codigo, 'descricao', p.descricao, 'unidade', p.unidade,
        'quantidade', p.quantidade, 'valor_unitario', p.valor_unitario, 'valor_total', p.valor_total,
        'estado', p.estado, 'aprovacao', p.aprovacao,
        'disponivel', case when p.produto_id is not null then public.sos_estoque_disponivel(p.produto_id) end,
        'do_socorro', exists (select 1 from public.sos_itens i where i.os_item_id = p.id)) order by p.ordem, p.created_at)
      from public.os_produtos p where p.os_id = p_os and p.situacao = 'ativo'), '[]'::jsonb),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'servico_id', s.servico_id, 'codigo', s.codigo, 'descricao', s.descricao,
        'quantidade', s.quantidade, 'valor_unitario', s.valor_unitario, 'valor_total', s.valor_total,
        'aprovacao', s.aprovacao,
        'do_socorro', exists (select 1 from public.sos_itens i where i.os_item_id = s.id)) order by s.ordem, s.created_at)
      from public.os_servicos s where s.os_id = p_os and s.situacao = 'ativo'), '[]'::jsonb),
    'chamado', (select jsonb_build_object('id', c.id, 'protocolo', c.protocolo, 'status', c.status)
                from public.sos_chamados c where c.id = (v_acesso->>'chamado_id')::uuid),
    'pode_editar', (v_acesso->>'editar')::boolean
  );
end;
$$;

-- Lançar peça/serviço numa OS pelo app.
create or replace function public.sos_os_adicionar_item(p_os uuid, p_tipo text, p_ref uuid, p_quantidade numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acesso jsonb := public.sos_acesso_os(p_os);
  v_ch     public.sos_chamados;
  v_p      public.produtos;
  v_s      public.servicos;
  v_disp   numeric;
  v_id     uuid;
  v_ord    integer;
  v_num    bigint;
begin
  if v_acesso is null or not (v_acesso->>'editar')::boolean then raise exception 'Esta OS não pode ser alterada por você.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;

  -- OS de um socorro ainda aberto: o item entra pelo SOS (os dois lados iguais).
  select * into v_ch from public.sos_chamados c
  where c.id = (v_acesso->>'chamado_id')::uuid and c.status not in ('concluido', 'cancelado');
  if found and public.sos_pode_atender(v_ch.id) then
    return public.sos_adicionar_item(v_ch.id, p_tipo, p_ref, p_quantidade);
  end if;

  select numero into v_num from public.ordens_servico where id = p_os;
  if p_tipo = 'produto' then
    select * into v_p from public.produtos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Produto não encontrado no catálogo.'; end if;
    v_disp := public.sos_estoque_disponivel(v_p.id);
    select coalesce(max(ordem), 0) + 1 into v_ord from public.os_produtos where os_id = p_os;
    insert into public.os_produtos (os_id, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, ordem, estado)
    values (p_os, v_p.id, v_p.codigo, v_p.descricao, coalesce(v_p.unidade, 'UN'), p_quantidade, coalesce(v_p.preco_venda, 0), v_ord,
            case when p_quantidade <= v_disp then 'reservado' else 'necessario' end::public.estado_produto_os)
    returning id into v_id;
    if p_quantidade > v_disp then
      perform public.sos_avisar_falta_estoque(v_p.descricao, p_quantidade, v_disp, 'OS ' || v_num, '/operacao/ordens-de-servico?os=' || p_os);
    end if;
  elsif p_tipo = 'servico' then
    select * into v_s from public.servicos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Serviço não encontrado no catálogo.'; end if;
    select coalesce(max(ordem), 0) + 1 into v_ord from public.os_servicos where os_id = p_os;
    insert into public.os_servicos (os_id, servico_id, codigo, descricao, quantidade, valor_unitario, ordem)
    values (p_os, v_s.id, v_s.codigo, v_s.descricao, p_quantidade, coalesce(v_s.valor_padrao, 0), v_ord)
    returning id into v_id;
  else
    raise exception 'Tipo de item inválido.';
  end if;

  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id, dados)
  values (p_os, 'item', 'Item lançado pelo app SOS', coalesce(v_p.descricao, v_s.descricao),
          (select id from public.usuarios where id = auth.uid()),
          jsonb_build_object('tipo', p_tipo, 'quantidade', p_quantidade));
  return jsonb_build_object('id', v_id, 'tipo', p_tipo)
    || case when p_tipo = 'produto'
            then jsonb_build_object('estoque', jsonb_build_object('disponivel_antes', v_disp, 'faltou', p_quantidade > v_disp))
            else '{}'::jsonb end;
end;
$$;

-- Quantidade de um item da OS (zero = remove). Item vindo do SOS segue pelo SOS.
create or replace function public.sos_os_alterar_item(p_os uuid, p_item uuid, p_quantidade numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acesso jsonb := public.sos_acesso_os(p_os);
  v_sos    public.sos_itens;
begin
  if v_acesso is null or not (v_acesso->>'editar')::boolean then raise exception 'Esta OS não pode ser alterada por você.'; end if;
  if not exists (select 1 from public.os_produtos where id = p_item and os_id = p_os)
     and not exists (select 1 from public.os_servicos where id = p_item and os_id = p_os) then
    raise exception 'Item não encontrado nesta OS.';
  end if;

  select * into v_sos from public.sos_itens where os_item_id = p_item;
  if found and public.sos_pode_atender(v_sos.chamado_id)
     and exists (select 1 from public.sos_chamados where id = v_sos.chamado_id and status not in ('concluido', 'cancelado')) then
    if coalesce(p_quantidade, 0) <= 0 then perform public.sos_remover_item(v_sos.id);
    else perform public.sos_alterar_item(v_sos.id, p_quantidade); end if;
    return;
  end if;

  if coalesce(p_quantidade, 0) <= 0 then
    update public.os_produtos set situacao = 'cancelado' where id = p_item and os_id = p_os;
    update public.os_servicos set situacao = 'cancelado' where id = p_item and os_id = p_os;
  else
    update public.os_produtos set quantidade = p_quantidade where id = p_item and os_id = p_os;
    update public.os_servicos set quantidade = p_quantidade where id = p_item and os_id = p_os;
  end if;
end;
$$;

-- Km, diagnóstico e observações da OS pelo app.
create or replace function public.sos_os_atualizar(p_os uuid, p_km integer default null, p_diagnostico text default null, p_observacoes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acesso jsonb := public.sos_acesso_os(p_os);
  v_o      public.ordens_servico;
  v_km     integer;
  v_ch     uuid;
begin
  if v_acesso is null or not (v_acesso->>'editar')::boolean then raise exception 'Esta OS não pode ser alterada por você.'; end if;
  select * into v_o from public.ordens_servico where id = p_os;

  if p_km is not null then
    if p_km <= 0 or p_km > 9999999 then raise exception 'Quilometragem inválida.'; end if;
    select km_atual into v_km from public.veiculos where id = v_o.veiculo_id;
    if v_km is not null and p_km < v_km then
      raise exception 'A quilometragem informada (% km) é menor que a do cadastro (% km). Confira o painel.', p_km, v_km;
    end if;
    update public.veiculos set km_atual = p_km where id = v_o.veiculo_id;
    update public.ordens_servico set km = p_km where id = p_os;
  end if;

  -- OS de socorro aberto: o texto é do atendimento (o gatilho leva para a OS).
  v_ch := (v_acesso->>'chamado_id')::uuid;
  if v_ch is not null and exists (select 1 from public.sos_chamados where id = v_ch and status not in ('concluido', 'cancelado'))
     and public.sos_pode_atender(v_ch) then
    if p_diagnostico is not null or p_observacoes is not null then
      perform public.sos_salvar_atendimento(v_ch,
        jsonb_strip_nulls(jsonb_build_object('diagnostico', p_diagnostico, 'observacoes', p_observacoes)));
    end if;
  else
    update public.ordens_servico
    set diagnostico = coalesce(nullif(trim(p_diagnostico), ''), diagnostico),
        observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
    where id = p_os;
  end if;

  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id, dados)
  values (p_os, 'os', 'OS atualizada pelo app SOS', null, (select id from public.usuarios where id = auth.uid()),
          jsonb_strip_nulls(jsonb_build_object('km', p_km, 'diagnostico', p_diagnostico is not null, 'observacoes', p_observacoes is not null)));
  return public.sos_os_detalhe(p_os);
end;
$$;

-- Veículo pela placa (para abrir OS pelo app).
create or replace function public.sos_os_buscar_veiculo(p_placa text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.tem_permissao('ordens_servico', 'criar') then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'veiculo', nullif(concat_ws(' ', v.marca, v.modelo, v.ano), ''),
                                        'cliente_id', cl.id, 'cliente', cl.nome_razao,
                                        'os_aberta', (select o.numero from public.ordens_servico o
                                                      where o.veiculo_id = v.id and o.encerrada_em is null and o.situacao = 'ativo'
                                                      order by o.aberta_em desc limit 1)))
    from (select * from public.veiculos v
          where v.situacao = 'ativo'
            and length(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')) >= 3
            and v.placa_normalizada like upper(regexp_replace(p_placa, '[^A-Za-z0-9]', '', 'g')) || '%'
          order by v.placa limit 8) v
    join public.clientes cl on cl.id = v.cliente_id
  ), '[]'::jsonb) end
$$;

-- Abrir OS pelo app: mesma permissão do Checklist; o mecânico entra escalado.
create or replace function public.sos_os_criar(p_veiculo uuid, p_problema text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_v      public.veiculos;
  v_status uuid;
  v_os     uuid;
  v_u      uuid := (select id from public.usuarios where id = auth.uid());
begin
  if not public.tem_permissao('ordens_servico', 'criar') then raise exception 'Seu perfil não permite abrir OS.'; end if;
  if nullif(trim(coalesce(p_problema, '')), '') is null then raise exception 'Descreva o problema.'; end if;
  select * into v_v from public.veiculos where id = p_veiculo and situacao = 'ativo';
  if not found then raise exception 'Veículo não encontrado.'; end if;

  select id into v_status from public.status_os where situacao = 'ativo' and categoria = 'entrada' order by ordem limit 1;
  insert into public.ordens_servico (tipo, cliente_id, veiculo_id, status_id, km, problema_alegado, aberta_por)
  values ('os', v_v.cliente_id, v_v.id, v_status, v_v.km_atual, trim(p_problema), v_u)
  returning id into v_os;
  if v_u is not null then
    insert into public.os_mecanicos (os_id, usuario_id, principal) values (v_os, v_u, true) on conflict do nothing;
  end if;
  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
  values (v_os, 'os', 'OS aberta pelo app SOS', trim(p_problema), v_u);
  return v_os;
end;
$$;

do $$
declare v_f text;
begin
  foreach v_f in array array[
    'public.sos_acesso_os(uuid)', 'public.sos_minhas_os(text, integer)', 'public.sos_os_detalhe(uuid)',
    'public.sos_os_adicionar_item(uuid, text, uuid, numeric)', 'public.sos_os_alterar_item(uuid, uuid, numeric)',
    'public.sos_os_atualizar(uuid, integer, text, text)', 'public.sos_os_buscar_veiculo(text)',
    'public.sos_os_criar(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;
