-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827103912.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Dados fiscais e endereço detalhado da empresa, para os documentos emitidos.

/**
 * O timbre da OS e do Checklist de Entrada precisa dos dados fiscais.
 *
 * Antes só existia `endereco` como texto único, o que impedia montar o
 * endereço no padrão do documento e não guardava inscrição estadual nem
 * municipal — que aparecem no papel timbrado e em qualquer conferência fiscal.
 */
alter table dados_empresa
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_municipal text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cep text,
  add column if not exists celular text;

comment on column dados_empresa.endereco is
  'Endereço em linha única, montado a partir das partes. Mantido para os '
  'documentos que já o consomem.';;
