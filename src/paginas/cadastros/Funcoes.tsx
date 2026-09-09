import { CadastroSimples } from '@/componentes/padroes/CadastroSimples'

export function Funcoes() {
  return (
    <CadastroSimples
      config={{
        recurso: 'funcoes',
        tabela: 'funcoes',
        sobretitulo: 'Cadastros',
        titulo: 'Funções e Cargos',
        singular: 'função',
        artigo: 'a',
        placeholderBusca: 'Buscar por nome ou descrição',
        descricaoVazio:
          'A função descreve o que a pessoa faz na oficina. É diferente do perfil de acesso, que define o que ela pode fazer no sistema.',
        camposBooleanos: [
          {
            chave: 'atua_como_mecanico',
            rotulo: 'Atua como mecânico',
            selo: 'Mecânico',
            dica: 'Somente quem tem uma função marcada assim pode ser atribuído a uma OS como mecânico.',
          },
          {
            chave: 'atua_no_laboratorio',
            rotulo: 'Atua no laboratório',
            selo: 'Laboratório',
            dica: 'Habilita a pessoa como responsável por peças em teste.',
          },
        ],
      }}
    />
  )
}
