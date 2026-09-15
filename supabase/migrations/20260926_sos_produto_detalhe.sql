-- ════════════════════════════════════════════════════════════════════════════
-- Ficha do produto no app do mecânico
-- ════════════════════════════════════════════════════════════════════════════
--
-- A lista do catálogo mostra só nome, preço e disponível. Ao tocar no produto
-- o app abre a ficha completa do cadastro (o mesmo do Checklist, espelho da
-- Omie) e, em seguida, a função `omie-produto` confere o item na Omie e
-- atualiza estas mesmas colunas.
--
-- Custo (custo médio e preço de custo) só aparece para quem pode editar
-- produtos: mecânico vê preço de venda e estoque, não margem.

create or replace function public.sos_produto_detalhe(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.produtos;
  v_comprometido numeric;
  v_ve_custo boolean;
  v_fornecedor text;
begin
  if not (public.sos_eh_mecanico() or public.sos_eh_equipe()) then
    raise exception 'Sem permissão.';
  end if;
  select * into v_p from public.produtos where id = p_id;
  if not found then raise exception 'Produto não encontrado.'; end if;

  v_comprometido := public.sos_estoque_comprometido(p_id);
  v_ve_custo := public.tem_permissao('produtos', 'editar');
  select coalesce(nome_fantasia, descricao) into v_fornecedor from public.fornecedores where id = v_p.fornecedor_id;

  return jsonb_build_object(
    'id', v_p.id,
    'codigo', v_p.codigo,
    'descricao', v_p.descricao,
    'descricao_detalhada', v_p.descricao_detalhada,
    'referencia', v_p.referencia,
    'ean', v_p.ean,
    'ncm', v_p.ncm,
    'marca', v_p.marca,
    'modelo', v_p.modelo,
    'familia', v_p.familia,
    'unidade', v_p.unidade,
    'tipo_item', v_p.tipo_item,
    'localizacao', v_p.localizacao,
    'local_estoque_omie', v_p.omie_local_estoque,
    'fornecedor', v_fornecedor,
    'observacoes', v_p.observacoes,
    'peso_liquido', v_p.peso_liquido,
    'peso_bruto', v_p.peso_bruto,
    'preco_venda', v_p.preco_venda,
    'custo_medio', case when v_ve_custo then v_p.custo_medio end,
    'preco_custo', case when v_ve_custo then v_p.preco_custo end,
    'saldo', v_p.saldo,
    'fisico', v_p.fisico,
    'reservado', v_p.reservado,
    'pendente', v_p.pendente,
    'estoque_minimo', v_p.estoque_minimo,
    'comprometido', v_comprometido,
    'disponivel', greatest(coalesce(v_p.saldo, 0) - coalesce(v_p.reservado, 0) - v_comprometido, 0),
    'situacao', v_p.situacao,
    'bloqueado', coalesce(v_p.bloqueado, false),
    'origem', v_p.origem,
    'omie_id', v_p.omie_id,
    'sincronizado_em', v_p.omie_sincronizado_em
  );
end;
$$;

revoke execute on function public.sos_produto_detalhe(uuid) from public, anon;
grant execute on function public.sos_produto_detalhe(uuid) to authenticated;
