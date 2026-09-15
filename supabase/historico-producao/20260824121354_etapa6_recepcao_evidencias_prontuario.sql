-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824121354.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 6 — Recepção, evidências e prontuário do veículo
-- ============================================================

create type public.tipo_evidencia as enum ('foto', 'video', 'audio', 'documento');
create type public.situacao_entrada as enum ('no_patio', 'encerrada', 'cancelada');

-- ---------- evidências (reutilizado por recepção, OS, checklists, laboratório) ----------
create table public.evidencias (
  id             uuid primary key default gen_random_uuid(),
  entidade       text not null,
  entidade_id    uuid not null,
  categoria      text,
  tipo           public.tipo_evidencia not null default 'foto',
  caminho        text not null,
  nome_arquivo   text,
  tamanho_bytes  bigint,
  descricao      text,
  /* Contexto congelado no momento do registro: a evidência não perde sentido
     se o cadastro mudar depois. */
  contexto       jsonb,
  criado_por     uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index evidencias_entidade_ix on public.evidencias (entidade, entidade_id, created_at);

-- ---------- prontuário: linha do tempo do veículo ----------
create table public.eventos_veiculo (
  id                uuid primary key default gen_random_uuid(),
  veiculo_id        uuid not null references public.veiculos (id) on delete cascade,
  cliente_id        uuid references public.clientes (id) on delete set null,
  tipo              text not null,
  titulo            text not null,
  descricao         text,
  km                integer,
  referencia_tabela text,
  referencia_id     uuid,
  ocorrido_em       timestamptz not null default now(),
  registrado_por    uuid references public.usuarios (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index eventos_veiculo_ix on public.eventos_veiculo (veiculo_id, ocorrido_em desc);
create index eventos_cliente_ix on public.eventos_veiculo (cliente_id, ocorrido_em desc);

-- ---------- entradas no pátio ----------
create table public.entradas_patio (
  id                    uuid primary key default gen_random_uuid(),
  numero                bigint generated always as identity,
  cliente_id            uuid not null references public.clientes (id) on delete restrict,
  veiculo_id            uuid not null references public.veiculos (id) on delete restrict,

  motorista_nome        text,
  motorista_telefone    text,
  motorista_documento   text,
  motorista_observacao  text,

  km                    integer,
  km_anterior           integer,
  km_inconsistente      boolean not null default false,
  justificativa_km      text,

  condicao_entrada      text,
  observacoes           text,

  situacao              public.situacao_entrada not null default 'no_patio',
  entrada_em            timestamptz not null default now(),
  saida_em              timestamptz,
  recebido_por          uuid references public.usuarios (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index entradas_patio_situacao_ix on public.entradas_patio (situacao, entrada_em desc);
create index entradas_patio_veiculo_ix on public.entradas_patio (veiculo_id, entrada_em desc);
create index entradas_patio_cliente_ix on public.entradas_patio (cliente_id, entrada_em desc);
create trigger entradas_patio_updated_at before update on public.entradas_patio
  for each row execute function public.tg_set_updated_at();

-- Ao registrar a entrada: atualiza o KM do veículo e alimenta o prontuário.
create or replace function public.tg_entrada_registrar_prontuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.km is not null then
    update public.veiculos
       set km_atual = greatest(coalesce(km_atual, 0), new.km)
     where id = new.veiculo_id;
  end if;

  insert into public.eventos_veiculo (
    veiculo_id, cliente_id, tipo, titulo, descricao, km, referencia_tabela, referencia_id, ocorrido_em, registrado_por
  ) values (
    new.veiculo_id, new.cliente_id, 'entrada',
    'Entrada no pátio',
    nullif(trim(coalesce(new.condicao_entrada, '') || ' ' || coalesce(new.observacoes, '')), ''),
    new.km, 'entradas_patio', new.id, new.entrada_em, new.recebido_por
  );

  return new;
end;
$$;
revoke execute on function public.tg_entrada_registrar_prontuario() from public, anon, authenticated;

create trigger entradas_patio_prontuario
  after insert on public.entradas_patio
  for each row execute function public.tg_entrada_registrar_prontuario();

-- ---------- último KM conhecido, para conferência na recepção ----------
create or replace function public.ultimo_km_veiculo(p_veiculo uuid)
returns table (km integer, registrado_em timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.km, e.ocorrido_em
  from public.eventos_veiculo e
  where e.veiculo_id = p_veiculo and e.km is not null
    and public.tem_permissao('veiculos', 'visualizar')
  order by e.ocorrido_em desc
  limit 1;
$$;
revoke execute on function public.ultimo_km_veiculo(uuid) from public, anon;
grant execute on function public.ultimo_km_veiculo(uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.evidencias enable row level security;
create policy evidencias_ler on public.evidencias for select to authenticated
  using (public.usuario_atual_ativo());
create policy evidencias_criar on public.evidencias for insert to authenticated
  with check (public.usuario_atual_ativo() and criado_por = auth.uid());
create policy evidencias_excluir on public.evidencias for delete to authenticated
  using (criado_por = auth.uid() or public.usuario_atual_admin());

alter table public.eventos_veiculo enable row level security;
create policy eventos_veiculo_ler on public.eventos_veiculo for select to authenticated
  using (public.tem_permissao('veiculos', 'visualizar'));
create policy eventos_veiculo_criar on public.eventos_veiculo for insert to authenticated
  with check (public.usuario_atual_ativo());

alter table public.entradas_patio enable row level security;
create policy entradas_ler on public.entradas_patio for select to authenticated
  using (public.tem_permissao('recepcao', 'visualizar') or public.tem_permissao('patio', 'visualizar'));
create policy entradas_criar on public.entradas_patio for insert to authenticated
  with check (public.tem_permissao('recepcao', 'criar'));
create policy entradas_editar on public.entradas_patio for update to authenticated
  using (public.tem_permissao('recepcao', 'editar') or public.tem_permissao('patio', 'editar'))
  with check (public.tem_permissao('recepcao', 'editar') or public.tem_permissao('patio', 'editar'));

-- ============================================================
-- Storage: evidências (bucket privado)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias', 'evidencias', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/webm','application/pdf']
)
on conflict (id) do nothing;

create policy "evidencias ler" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and public.usuario_atual_ativo());
create policy "evidencias enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and public.usuario_atual_ativo());
create policy "evidencias remover" on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias' and (owner = auth.uid() or public.usuario_atual_admin()));;
