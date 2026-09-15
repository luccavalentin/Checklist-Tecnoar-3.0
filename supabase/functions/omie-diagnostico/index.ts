import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

/**
 * Desativada.
 *
 * Esta função existiu por uma única tarde, para descobrir como a Omie separa
 * cliente de fornecedor no retorno de `ListarClientes`. A resposta virou
 * código em `omie/index.ts` (classificação pelas tags do cadastro) e o
 * diagnóstico deixou de ter motivo para existir.
 *
 * Ela lê credenciais de integração, então não fica de pé “por via das dúvidas”:
 * o corpo foi esvaziado. Pode ser excluída pelo painel do Supabase.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({ erro: 'Função de diagnóstico desativada.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  ),
)
