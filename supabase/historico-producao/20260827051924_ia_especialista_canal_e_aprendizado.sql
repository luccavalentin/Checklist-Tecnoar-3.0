-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827051924.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Tecnoar IA: domínio de especialidade, canal de atendimento e aprendizado.

/**
 * Domínios em que a IA é perita.
 *
 * Ficam em tabela, não no código, porque a especialidade da oficina muda com
 * o tempo e quem sabe disso é o técnico, não o programador. O prompt do
 * modelo é montado a partir daqui.
 */
create table ia_dominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text not null,
  /* Palavras que ancoram o domínio na busca e no roteamento da pergunta. */
  termos text[] not null default '{}',
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

/**
 * Equipamentos de diagnóstico que a oficina usa.
 *
 * A IA precisa saber com qual aparelho o mecânico está na mão para dar o
 * caminho certo de menu, código e leitura — orientar por Jaltest quem está
 * com SDP3 faz o técnico perder a manhã.
 */
create table ia_equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  fabricante text,
  descricao text not null,
  /* Marcas/sistemas que o aparelho cobre. */
  cobertura text[] not null default '{}',
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

/**
 * Configuração da IA — registro único.
 *
 * A chave da API não mora aqui: fica em `integracoes`, lida só pela função de
 * borda. Aqui ficam as decisões de comportamento, que o administrador ajusta.
 */
create table ia_config (
  id boolean primary key default true check (id),
  modelo text not null default 'claude-sonnet-4-5',
  max_tokens integer not null default 4000 check (max_tokens between 512 and 32000),
  /* Quantos artigos da base entram como contexto em cada resposta. */
  artigos_contexto integer not null default 5 check (artigos_contexto between 0 and 20),
  /* Instrução extra da casa, somada ao papel de especialista. */
  instrucoes_extra text,
  /* Quando ligado, respostas marcadas como úteis viram rascunho de artigo. */
  aprendizado_ativo boolean not null default true,
  /* Exige que o técnico revise antes de o rascunho virar artigo publicado. */
  exige_revisao boolean not null default true,
  updated_por uuid references usuarios (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into ia_config (id) values (true);

/* ------------------------------------------------ canal de atendimento */

/* O canal aceita mídia; o texto deixa de ser o único caminho. */
do $$ begin
  alter table ia_mensagens add column transcricao text;
  alter table ia_mensagens add column util boolean;
  alter table ia_mensagens add column avaliado_por uuid references usuarios (id) on delete set null;
  alter table ia_mensagens add column avaliado_em timestamptz;
exception when duplicate_column then null; end $$;

comment on column ia_mensagens.transcricao is
  'Texto extraído de áudio enviado pelo colaborador. Nulo quando não houve áudio.';
comment on column ia_mensagens.util is
  'Avaliação do técnico. Só resposta marcada como útil pode virar artigo.';

/**
 * Aprendizado: a ponte entre uma resposta boa e a base técnica.
 *
 * Nada entra na base sozinho. A resposta marcada como útil gera um rascunho
 * que um técnico revisa e publica — é isso que impede a IA de "aprender" a
 * própria alucinação e devolvê-la depois como fonte.
 */
create table ia_aprendizados (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references ia_mensagens (id) on delete cascade,
  artigo_id uuid references artigos_tecnicos (id) on delete set null,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'rascunho_gerado', 'publicado', 'descartado')),
  motivo_descarte text,
  criado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mensagem_id)
);

create index ia_aprendizados_situacao_idx on ia_aprendizados (situacao, created_at desc);

/* -------------------------------------------------------------- RLS */

alter table ia_dominios enable row level security;
alter table ia_equipamentos enable row level security;
alter table ia_config enable row level security;
alter table ia_aprendizados enable row level security;

create policy ia_dominios_ler on ia_dominios for select to authenticated
  using (tem_permissao('tecnoar_ia', 'visualizar'));
create policy ia_dominios_escrever on ia_dominios for all to authenticated
  using (tem_permissao('tecnoar_ia', 'configurar'))
  with check (tem_permissao('tecnoar_ia', 'configurar'));

create policy ia_equipamentos_ler on ia_equipamentos for select to authenticated
  using (tem_permissao('tecnoar_ia', 'visualizar'));
create policy ia_equipamentos_escrever on ia_equipamentos for all to authenticated
  using (tem_permissao('tecnoar_ia', 'configurar'))
  with check (tem_permissao('tecnoar_ia', 'configurar'));

create policy ia_config_ler on ia_config for select to authenticated
  using (tem_permissao('tecnoar_ia', 'visualizar'));
create policy ia_config_escrever on ia_config for update to authenticated
  using (tem_permissao('tecnoar_ia', 'configurar'))
  with check (tem_permissao('tecnoar_ia', 'configurar'));

create policy ia_aprendizados_ler on ia_aprendizados for select to authenticated
  using (tem_permissao('base_tecnica', 'visualizar'));
create policy ia_aprendizados_escrever on ia_aprendizados for all to authenticated
  using (tem_permissao('base_tecnica', 'editar'))
  with check (tem_permissao('base_tecnica', 'editar'));

/* --------------------------------------------------- domínio semeado */

insert into ia_dominios (nome, descricao, termos, ordem) values
  ('Freio a ar',
   'Sistema pneumático de freio de veículos pesados: compressor, secador, reservatórios, válvulas de serviço e estacionamento, câmaras e cuícas, regulagem e curso.',
   array['freio a ar','pneumático','cuíca','câmara','compressor','secador','reservatório','pedal','freio de mão','APU'], 1),
  ('ABS e EBS',
   'Antiblocagem e freio eletronicamente controlado: centrais, moduladores, sensores de rotação, anéis fônicos, códigos de falha e calibração.',
   array['ABS','EBS','modulador','sensor de roda','anel fônico','ECU','central','código de falha'], 2),
  ('Circuito pneumático',
   'Traçado e integridade do circuito: linhas, engates, válvulas de proteção de quatro circuitos, push-pull, purga, estanqueidade e perda de pressão.',
   array['circuito','estanqueidade','vazamento','push-pull','quatro circuitos','engate','purga','linha'], 3),
  ('Diagnóstico eletrônico',
   'Leitura e interpretação de falhas com aparelho de diagnóstico, testes de atuador, parametrização e programação de módulo.',
   array['diagnóstico','scanner','leitura','atuador','parametrização','programação','DTC'], 4),
  ('Válvulas específicas',
   'Válvulas relé, distribuidora, de pedal, de freio motor, protetora, de escape rápido, reguladora de pressão e de comando do reboque.',
   array['válvula relé','distribuidora','válvula do pedal','freio motor','protetora','escape rápido','reguladora','reboque'], 5)
on conflict (nome) do nothing;

insert into ia_equipamentos (nome, fabricante, descricao, cobertura, ordem) values
  ('Jaltest', 'Cojali',
   'Multimarca para veículos pesados: leitura e apagamento de falhas, testes de atuador, parametrização e informação técnica.',
   array['multimarca','pesados','implementos','ABS','EBS'], 1),
  ('Star Diagnosis / XENTRY', 'Mercedes-Benz',
   'Diagnóstico de fábrica da linha Mercedes-Benz, com acesso a módulos e rotinas específicas.',
   array['Mercedes-Benz','Actros','Axor','Atego'], 2),
  ('SDP3', 'Scania',
   'Software oficial Scania para diagnóstico, parametrização e programação de módulos.',
   array['Scania','R series','P series','G series'], 3),
  ('VCADS / Tech Tool (VOCOM)', 'Volvo',
   'Ferramenta oficial Volvo para diagnóstico, testes e programação, conectada pela interface VOCOM.',
   array['Volvo','FH','FM','VM'], 4),
  ('Haldex Diagnostics', 'Haldex',
   'Diagnóstico dos sistemas EB+ de freio de implementos e de válvulas Haldex.',
   array['implemento','carreta','EB+','freio eletrônico'], 5),
  ('WABCO / ZF Toolbox', 'WABCO (ZF)',
   'Diagnóstico de ABS/EBS, suspensão pneumática e válvulas WABCO em cavalos e implementos.',
   array['ABS','EBS','ECAS','suspensão pneumática','implemento'], 6),
  ('Knorr-Bremse NEO / ECUtalk', 'Knorr-Bremse',
   'Diagnóstico de sistemas de freio eletrônico e válvulas Knorr-Bremse.',
   array['EBS','TEBS','válvula','implemento'], 7)
on conflict (nome) do nothing;;
