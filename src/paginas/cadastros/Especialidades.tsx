import { CadastroSimples } from '@/componentes/padroes/CadastroSimples'

export function Especialidades() {
  return (
    <CadastroSimples
      config={{
        recurso: 'especialidades',
        tabela: 'especialidades',
        sobretitulo: 'Cadastros',
        titulo: 'Especialidades',
        singular: 'especialidade',
        artigo: 'a',
        placeholderBusca: 'Buscar por nome ou descrição',
        descricaoVazio:
          'As especialidades qualificam mecânicos e serviços. Cadastre a primeira para começar a atribuir competências.',
        camposBooleanos: [
          {
            chave: 'de_laboratorio',
            rotulo: 'Especialidade de laboratório',
            selo: 'Laboratório',
            dica: 'Quem tiver esta especialidade pode ser responsável por peças em teste.',
          },
        ],
      }}
    />
  )
}
