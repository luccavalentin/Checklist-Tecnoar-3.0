/**
 * O texto do manual, seção por seção.
 *
 * Fica separado do gerador porque quem revisa o texto não deveria precisar
 * entender pdfmake para trocar uma frase.
 *
 * Cada seção tem título, parágrafos e, quando ajuda, a tela correspondente.
 * `passos` vira lista numerada — é o formato que alguém segue com o celular
 * na mão e o caminhão na frente.
 */

export const CAPA = {
  titulo: 'Manual do Usuário',
  subtitulo: 'Sistema Operacional Tecnoar',
  linha: 'Recepção · Ordens de Serviço · Pátio · Checklists · Laboratório',
  endereco: 'checklist.tecnoarsistemas.com.br',
}

export const SECOES = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    resumo: 'Não é preciso saber nada de informática para usar o sistema.',
    blocos: [
      {
        tipo: 'texto',
        titulo: 'Entrar',
        paragrafos: [
          'Abra o endereço no navegador do computador, do tablet ou do celular. Informe o e-mail e a senha que a Tecnoar forneceu.',
          'Esqueceu a senha? Use **Esqueci minha senha** na própria tela — o sistema envia um link para o seu e-mail.',
        ],
        tela: '01-login',
        legenda: 'Tela de entrada. O botão Solicitar acesso serve para quem ainda não tem conta.',
      },
      {
        tipo: 'texto',
        titulo: 'Ainda não tem conta',
        paragrafos: [
          'Clique em **Solicitar acesso** e preencha seus dados. A conta fica aguardando liberação até que um administrador aprove e defina o que você pode acessar.',
          'Enquanto isso, ao entrar você verá um aviso de acesso pendente. É normal, não é erro.',
        ],
      },
      {
        tipo: 'texto',
        titulo: 'Por que não vejo todos os menus',
        paragrafos: [
          'O sistema mostra apenas o que o seu perfil permite. Se falta um menu de que você precisa, fale com o administrador — não é defeito.',
        ],
      },
    ],
  },

  {
    id: 'instalar',
    titulo: 'Instalar no seu aparelho',
    resumo:
      'O sistema funciona como aplicativo: abre em tela cheia, com ícone próprio, e a câmera das evidências funciona melhor.',
    blocos: [
      {
        tipo: 'aviso',
        texto:
          'O Tecnoar não está na Play Store nem na App Store, e não precisa estar. A instalação é feita pelo próprio navegador, em poucos toques, e o aplicativo se atualiza sozinho — sem esperar aprovação de loja.',
      },
      {
        tipo: 'passos',
        titulo: 'Android — Chrome',
        passos: [
          'Abra o endereço do sistema no Chrome.',
          'Aparece a faixa **Instalar o Tecnoar Checklist** na parte de baixo da tela. Toque em **Instalar**.',
          'Se a faixa não aparecer, toque nos três pontos (⋮) do Chrome e escolha **Instalar aplicativo** ou **Adicionar à tela inicial**.',
          'Confirme. O ícone da Tecnoar aparece junto dos seus outros aplicativos.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'iPhone e iPad — Safari',
        passos: [
          'Abra o endereço do sistema no Safari. Precisa ser o Safari.',
          'Toque no botão **Compartilhar** — o quadrado com a seta para cima, na barra de baixo.',
          'Role a lista e toque em **Adicionar à Tela de Início**.',
          'Confirme em **Adicionar**, no canto superior direito.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Computador — Chrome ou Edge',
        passos: [
          'Abra o endereço do sistema.',
          'Na barra de endereço, à direita, aparece um ícone de instalar (um monitor com uma seta).',
          'Clique nele e confirme em **Instalar**.',
        ],
      },
      {
        tipo: 'texto',
        titulo: 'Quando aparecer aviso de atualização',
        paragrafos: [
          'De tempos em tempos surge um aviso de que há uma versão nova. Aceite quando estiver num bom momento — o sistema nunca se atualiza sozinho no meio do seu trabalho.',
          'Se estiver preenchendo um checklist, termine primeiro. Fotos que ainda estão subindo são preservadas.',
        ],
      },
      {
        tipo: 'texto',
        titulo: 'Sem internet',
        paragrafos: [
          'Um aviso de **Sem conexão** aparece no alto da tela. O sistema não finge que salvou o que não salvou: o que depender da internet fica bloqueado até a conexão voltar.',
        ],
      },
    ],
  },

  {
    id: 'caminho-do-veiculo',
    titulo: 'O caminho do veículo',
    resumo: 'O menu segue a ordem real do trabalho, da chegada à entrega.',
    blocos: [
      {
        tipo: 'fluxo',
        etapas: [
          '01 Recepção',
          '02 Ordem de Serviço',
          '03 Checklist de Entrada',
          'Execução do serviço',
          '04 Checklist de Saída',
          '05 Saída do Pátio',
        ],
      },
      {
        tipo: 'passos',
        titulo: '01 — Recepção',
        paragrafos: ['Registra a chegada do veículo e do motorista. É o começo de tudo.'],
        passos: [
          'Informe a placa. Se o veículo já esteve aqui, o restante vem preenchido.',
          'Confirme o cliente, o motorista e a quilometragem.',
          'Registre a condição de entrada e as observações do motorista.',
          'Escolha **Entrada** para só registrar a chegada, ou **Entrada e OS** para já abrir a ordem de serviço.',
        ],
        tela: '03-recepcao',
        legenda: 'Recepção. No celular os botões ficam fixos no rodapé, ao alcance do polegar.',
      },
      {
        tipo: 'passos',
        titulo: '02 — Ordem de Serviço',
        paragrafos: [
          'A OS reúne tudo do atendimento: problema alegado, diagnóstico, equipe, peças, serviços, fotos e pagamento.',
        ],
        passos: [
          'Preencha o problema alegado pelo cliente, com as palavras dele.',
          'Atribua o mecânico responsável na aba **Equipe**.',
          'Lance serviços e peças conforme forem sendo usados.',
          'Anexe fotos das avarias na aba **Mídias** — é a defesa da oficina.',
          'Ao terminar, use **Encerrar** para fechar a OS.',
        ],
        tela: '04-ordens-servico',
        legenda: 'Lista de ordens de serviço, com situação e valor de cada uma.',
      },
      {
        tipo: 'passos',
        titulo: '03 e 04 — Checklists de Entrada e Saída',
        paragrafos: [
          'O Checklist de Entrada registra como o veículo chegou. O de Saída confirma que o serviço resolveu. Cada tela mostra apenas os modelos do seu tipo.',
        ],
        passos: [
          'Escolha o modelo e toque em **Executar**.',
          'Responda item por item. Os botões são grandes de propósito: dá para responder de luva.',
          'Ao marcar um defeito, registre a criticidade e tire foto.',
          'Conclua o checklist. Depois de concluído ele não é apagado — no máximo cancelado com motivo, e o registro fica.',
        ],
        tela: '05-checklist-entrada',
        legenda: 'Checklist de Entrada. A tela oferece só os modelos de entrada.',
      },
      {
        tipo: 'passos',
        titulo: '05 — Saída do Pátio',
        paragrafos: ['Última conferência antes de o veículo deixar a oficina.'],
        passos: [
          'Confira se o checklist de saída está concluído.',
          'Confira a situação do pagamento.',
          'Registre a entrega e a quem o veículo foi entregue.',
        ],
        tela: '08-saida-patio',
      },
    ],
  },

  {
    id: 'patio',
    titulo: 'Painel do Pátio e Modo TV',
    resumo: 'Onde está cada veículo, agora.',
    blocos: [
      {
        tipo: 'texto',
        paragrafos: [
          'O Painel do Pátio mostra todos os veículos na oficina, agrupados pela etapa em que estão. Atualiza sozinho a cada 20 segundos.',
          'Os cartões de indicador no alto respondem às perguntas do dia: quantos estão em diagnóstico, quantos aguardam aprovação, quantos aguardam peça, quantos estouraram o prazo.',
          'O **Modo TV** é a mesma informação preparada para uma televisão na parede da oficina: letra grande, sem menu, girando sozinho entre os veículos.',
        ],
        tela: '07-patio',
        legenda: 'Painel do Pátio. Sem veículo no pátio, a tela diz isso claramente em vez de mostrar números inventados.',
      },
    ],
  },

  {
    id: 'laboratorio',
    titulo: 'Peças em Teste e Garantias',
    resumo: 'O laboratório e o pós-venda.',
    blocos: [
      {
        tipo: 'texto',
        titulo: 'Peças em Teste',
        paragrafos: [
          'Cada peça recebida para teste ganha um protocolo e um prazo. A tela avisa quando o prazo estoura, para que ninguém descubra pelo cliente.',
        ],
        tela: '09-pecas-em-teste',
      },
      {
        tipo: 'texto',
        titulo: 'Garantias e Retornos',
        paragrafos: [
          'Registra o veículo que voltou. Serve para atender o cliente e, com o tempo, para mostrar o que está voltando com mais frequência.',
        ],
        tela: '10-garantias',
      },
    ],
  },

  {
    id: 'cadastros',
    titulo: 'Cadastros',
    resumo: 'A base que alimenta toda a operação.',
    blocos: [
      {
        tipo: 'texto',
        paragrafos: [
          'Clientes, veículos, produtos e serviços são a base de tudo. Clientes e produtos vêm sincronizados do OMIE — o que veio de lá é controlado por lá, e o sistema avisa quando você tenta alterar algo assim.',
        ],
        tela: '11-clientes',
        legenda: 'Cadastro de clientes. Dados pessoais tarjados nesta imagem.',
      },
      {
        tipo: 'texto',
        titulo: 'Inativar ou excluir',
        paragrafos: [
          '**Inativar** tira o registro do dia a dia e preserva o histórico. É o que você quase sempre quer.',
          '**Excluir** apaga de vez. Antes de apagar, o sistema mostra exatamente o que será destruído junto e quantos registros são. Se algo importante depende daquele cadastro, ele recusa e explica o motivo.',
        ],
      },
    ],
  },

  {
    id: 'ia',
    titulo: 'Tecnoar IA',
    resumo: 'A perita técnica da casa, disponível a qualquer hora.',
    blocos: [
      {
        tipo: 'texto',
        paragrafos: [
          'A Tecnoar IA é especialista em freio a ar, ABS, EBS, pneumática e diagnóstico eletrônico de pesados — e conhece o caminhão inteiro. Pergunte por texto, foto ou áudio.',
          'Ela responde como um colega experiente: começa pela próxima ação, dá o teste na ordem e aponta o risco de segurança quando existe. Quando um valor de pressão ou torque precisa ser confirmado no manual do fabricante, ela diz isso em vez de chutar.',
          'Se a resposta ajudou, marque o **joinha**. Respostas boas viram rascunho de artigo na Base Técnica, e a oficina passa a ter o próprio manual.',
        ],
        tela: '19-tecnoar-ia',
        legenda: 'Canal de atendimento da Tecnoar IA. Cada conversa é sua e pode ser excluída.',
      },
      {
        tipo: 'aviso',
        texto:
          'A IA orienta, não assina o serviço. Valor crítico de pressão, torque ou folga sempre se confere no manual do fabricante daquele modelo.',
      },
    ],
  },

  {
    id: 'gestao',
    titulo: 'Gestão',
    resumo: 'O que os números dizem sobre a operação.',
    blocos: [
      {
        tipo: 'texto',
        paragrafos: [
          'Indicadores e Financeiro respondem perguntas de dono: quanto entrou, quanto está em aberto, quanto tempo o veículo fica parado, o que está fora do prazo.',
          'Quando não há dado, a tela diz que não há. Nenhum número é inventado para preencher espaço.',
        ],
        tela: '17-indicadores',
      },
    ],
  },

  {
    id: 'sistema',
    titulo: 'Perfis e Permissões',
    resumo: 'Quem pode o quê.',
    blocos: [
      {
        tipo: 'texto',
        paragrafos: [
          'Cada perfil recebe permissões por recurso e por ação: visualizar, criar, editar, aprovar, cancelar, inativar, configurar, exportar e sincronizar.',
          'É possível abrir exceção para uma pessoa específica sem mexer no perfil inteiro. A exceção individual sempre prevalece.',
        ],
        tela: '20-perfis-permissoes',
      },
    ],
  },

]
