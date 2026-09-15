-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260910162317.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Tema claro por padrão, para qualquer perfil. O valor 'sistema' fazia o
-- aparelho decidir: quem usa o celular em modo noturno abria o sistema escuro
-- sem ter escolhido isso aqui dentro.
alter table public.usuarios alter column tema set default 'claro'::public.tema_interface;

-- Quem está em 'sistema' nunca escolheu esse valor — ele era o padrão antigo.
-- Escolha explícita por 'escuro' é preservada.
update public.usuarios set tema = 'claro' where tema = 'sistema';;
