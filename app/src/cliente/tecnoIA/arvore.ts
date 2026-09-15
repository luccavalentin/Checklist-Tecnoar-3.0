import { CircleDot, CircleHelp, Disc3, Flame, Gauge, Lock, PowerOff, TriangleAlert, Wind, type LucideIcon } from 'lucide-react'
import type { OcorrenciaSOS } from '@/sos/tipos'

/**
 * TECNO IA — árvore de pré-diagnóstico, 100% no aparelho.
 *
 * Não é um modelo de linguagem: é o raciocínio de um mecânico de freios
 * escrito como perguntas de sim/não. Isso é de propósito — na beira da
 * estrada, sem sinal, a resposta precisa sair na hora e ser sempre a mesma
 * para as mesmas respostas. Cada caminho termina numa gravidade:
 *
 *  - seguir  → pode rodar com atenção e agendar;
 *  - cautela → dá para chegar devagar à oficina (ou tentar uma solução simples);
 *  - parar   → não rode: pare em local seguro e peça o SOS.
 *
 * Referências usadas: pressão de trabalho do sistema pneumático de 8 a 10 bar
 * (corte do regulador perto de 10 bar), alarme de baixa pressão por volta de
 * 5,5–6 bar, freio de mola aplicando abaixo de ~4 bar, queda aceitável com o
 * motor desligado de ~0,2 bar/min, sistema elétrico de 24 V e triângulo a pelo
 * menos 30 m. Na dúvida, cada pergunta leva para o caminho mais conservador.
 */

export type Gravidade = 'seguir' | 'cautela' | 'parar'

export interface OpcaoResposta {
  rotulo: string
  vai: string
  /** Só visual: sim (verde), não (neutro), dúvida (cinza). */
  tom?: 'sim' | 'nao' | 'duvida'
}

export interface NoPergunta {
  tipo: 'pergunta'
  id: string
  texto: string
  /** Como fazer o teste ou onde olhar — em linguagem de motorista. */
  ajuda?: string
  /** Versão curta para o resumo que vai ao mecânico. */
  resumo: string
  opcoes: OpcaoResposta[]
}

export interface NoResultado {
  tipo: 'resultado'
  id: string
  gravidade: Gravidade
  /** Troca o texto padrão do selo de gravidade quando ele não cabe (ex.: "Desligue o motor"). */
  selo?: string
  titulo: string
  explicacao: string
  causas: string[]
  agora: string[]
  evitar?: string[]
  ocorrencia: OcorrenciaSOS
}

export type No = NoPergunta | NoResultado

export interface Sintoma {
  id: string
  rotulo: string
  descricao: string
  icone: LucideIcon
  inicio: string
}

export const GRAVIDADES: Record<Gravidade, { selo: string; curto: string }> = {
  seguir: { selo: 'Pode seguir, com atenção', curto: 'Seguir com atenção' },
  cautela: { selo: 'Siga com cautela até a oficina', curto: 'Cautela' },
  parar: { selo: 'PARE e peça socorro', curto: 'Parar' },
}

export const SINTOMAS: Sintoma[] = [
  { id: 'ar', rotulo: 'Luz ou alarme do ar', descricao: 'Pressão baixa, buzzer, luz vermelha do freio', icone: Gauge, inicio: 'ar_1' },
  { id: 'pedal', rotulo: 'Pedal do freio estranho', descricao: 'Duro, baixo, freio fraco ou puxando', icone: Disc3, inicio: 'pedal_1' },
  { id: 'travado', rotulo: 'Freio travado', descricao: 'Não solta, roda presa ou carreta travada', icone: Lock, inicio: 'trava_1' },
  { id: 'chiado', rotulo: 'Chiado de ar', descricao: 'Vazamento que dá para ouvir', icone: Wind, inicio: 'chiado_1' },
  { id: 'quente', rotulo: 'Roda quente ou fumaça', descricao: 'Cheiro de queimado, fumaça na roda', icone: Flame, inicio: 'quente_1' },
  { id: 'partida', rotulo: 'Não dá partida', descricao: 'Nada acende, só clica ou gira sem pegar', icone: PowerOff, inicio: 'partida_1' },
  { id: 'pneu', rotulo: 'Pneu ou roda', descricao: 'Furou, estourou ou roda bamba', icone: CircleDot, inicio: 'pneu_1' },
  { id: 'painel', rotulo: 'Luz vermelha no painel', descricao: 'Temperatura, óleo, bateria, perda de força', icone: TriangleAlert, inicio: 'painel_1' },
  { id: 'nao_sei', rotulo: 'Não sei explicar', descricao: 'Barulho, cheiro ou algo diferente', icone: CircleHelp, inicio: 'r_nao_sei' },
]

const sim = (vai: string, rotulo = 'Sim'): OpcaoResposta => ({ rotulo, vai, tom: 'sim' })
const nao = (vai: string, rotulo = 'Não'): OpcaoResposta => ({ rotulo, vai, tom: 'nao' })
const duvida = (vai: string, rotulo = 'Não sei'): OpcaoResposta => ({ rotulo, vai, tom: 'duvida' })

const pergunta = (id: string, texto: string, resumo: string, opcoes: OpcaoResposta[], ajuda?: string): NoPergunta => ({
  tipo: 'pergunta',
  id,
  texto,
  resumo,
  opcoes,
  ajuda,
})

const resultado = (r: Omit<NoResultado, 'tipo'>): NoResultado => ({ tipo: 'resultado', ...r })

/* Cuidados repetidos em vários resultados — um texto só, para não divergir. */
const SINALIZAR = 'Pare em local seguro, fora da pista: freio de estacionamento, pisca-alerta e triângulo a pelo menos 30 m (bem mais longe em curva ou rodovia rápida).'
const NAO_SOLTAR_MOLA = 'Não solte o freio de mola na mão (parafuso de desaperto da câmara) sem saber: a mola comprimida tem força para ferir gravemente.'
const NAO_AGUA = 'Não jogue água no tambor quente: ele pode trincar.'

const LISTA: No[] = [
  /* ── ar ─────────────────────────────────────────────────────────────── */
  pergunta(
    'ar_1',
    'Olhe o manômetro de ar no painel. Algum ponteiro está abaixo de 6 bar ou na faixa vermelha?',
    'Manômetro abaixo de 6 bar',
    [sim('ar_2', 'Sim, está baixo'), nao('r_ar_sensor', 'Não, está normal'), duvida('r_ar_duvida', 'Não sei ler')],
    'Normalmente são dois ponteiros, um para cada circuito do freio. O normal é entre 8 e 10 bar. Se a escala for em psi: 6 bar ≈ 87 psi.',
  ),
  pergunta(
    'ar_2',
    'Com o veículo parado e o motor ligado, acelere de leve (uns 1.200 rpm). A pressão volta a passar de 7 bar em até 3 minutos?',
    'Pressão sobe acelerando',
    [sim('ar_3', 'Sim, subiu'), nao('r_ar_nao_carrega', 'Não sobe ou sobe muito devagar'), duvida('r_ar_nao_carrega', 'Não consigo testar')],
    'É o teste do compressor: se a pressão sobe, o ar está sendo produzido.',
  ),
  pergunta(
    'ar_3',
    'Depois de encher, a pressão cai sozinha com o motor desligado, ou você ouve chiado de ar?',
    'Pressão cai / chiado depois de encher',
    [sim('r_ar_vazamento'), nao('r_ar_consumo', 'Não, fica estável')],
    'Com o motor desligado e o pé fora do freio, a queda aceitável é pequena. Mais de 0,2 bar por minuto indica vazamento.',
  ),
  resultado({
    id: 'r_ar_nao_carrega',
    gravidade: 'parar',
    titulo: 'O sistema de ar não está carregando',
    explicacao:
      'Sem pressão, o freio de serviço perde força e, abaixo de uns 4 bar, o freio de mola aplica sozinho — o caminhão pode travar no meio da pista.',
    causas: [
      'Correia do compressor partida ou patinando',
      'Válvula reguladora ou secador de ar travado (no frio intenso pode congelar)',
      'Vazamento grande: mangueira solta, conexão rompida, reservatório furado',
      'Compressor com defeito',
    ],
    agora: [
      'Se ainda está rodando, saia da pista agora, enquanto ainda há pressão.',
      SINALIZAR,
      'Não siga viagem esperando a pressão subir.',
      'Peça o socorro: o mecânico precisa ver o compressor e a linha de ar.',
    ],
    evitar: [NAO_SOLTAR_MOLA],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_ar_vazamento',
    gravidade: 'cautela',
    titulo: 'Vazamento de ar no sistema de freio',
    explicacao:
      'O compressor está repondo o ar, mas ele escapa por algum ponto. Enquanto o motor mantém a pressão acima de 7 bar, o freio funciona; se o vazamento aumentar, deixa de funcionar.',
    causas: [
      'Conexão ou mangueira de ar vazando',
      'Diafragma da câmara de freio furado',
      'Válvula do pedal, válvula relé ou dreno do reservatório vazando',
      'Engate de ar da carreta com vedação gasta',
    ],
    agora: [
      'Com o motor desligado, ande em volta do caminhão ouvindo de onde vem o chiado — isso ajuda muito o mecânico.',
      'Siga devagar, evitando serra e descidas longas, até a oficina mais próxima.',
      'Olho no manômetro: se cair abaixo de 6 bar ou o alarme voltar, pare em local seguro e peça socorro.',
    ],
    ocorrencia: 'vazamento',
  }),
  resultado({
    id: 'r_ar_consumo',
    gravidade: 'seguir',
    titulo: 'Provável consumo alto de ar, sem defeito agora',
    explicacao:
      'Muitas frenagens seguidas (manobra, trânsito, descida) gastam ar mais rápido do que o compressor repõe. Se a pressão voltou ao normal e fica estável, não há sinal de defeito grave neste momento.',
    causas: ['Uso intenso do freio em pouco tempo', 'Compressor cansado ou secador saturado (água no sistema)', 'Reservatórios com água por falta de drenagem'],
    agora: [
      'Pode seguir observando o manômetro.',
      'Drene os reservatórios no fim do dia, se o seu caminhão tiver dreno manual.',
      'Se o alarme acender de novo sem uso intenso do freio, pare e refaça o diagnóstico.',
      'Vale agendar uma revisão do compressor e do secador.',
    ],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_ar_sensor',
    gravidade: 'cautela',
    titulo: 'Pressão normal com alarme: provável falha de sensor',
    explicacao:
      'Se os ponteiros mostram pressão normal, o ar existe. O alarme pode estar vindo de um interruptor de pressão, de fiação ou de um circuito oscilando.',
    causas: [
      'Interruptor ou sensor de baixa pressão com defeito',
      'Mau contato na fiação do painel',
      'Um dos circuitos oscilando (confira de novo os dois ponteiros)',
      'Em caminhões com EBS/ABS, pode ser aviso eletrônico do freio',
    ],
    agora: [
      'Teste o freio em baixa velocidade num lugar seguro. Se o pedal responde normal, siga com cautela até a oficina.',
      'Fique de olho no manômetro: se algum ponteiro cair, pare.',
      'Luz vermelha de freio com buzzer contínuo é sinal para parar.',
    ],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_ar_duvida',
    gravidade: 'parar',
    titulo: 'Na dúvida sobre o ar, não arrisque',
    explicacao:
      'Freio a ar sem pressão pode falhar ou travar as rodas. Sem conseguir ler o manômetro, o mais seguro é parar e deixar o mecânico olhar.',
    causas: ['Pressão baixa por vazamento', 'Compressor sem carregar', 'Falha de sensor (menos grave, mas só dá para saber olhando)'],
    agora: [SINALIZAR, 'Peça o socorro e mande uma foto do painel pelo chat do chamado — ajuda muito.'],
    evitar: [NAO_SOLTAR_MOLA],
    ocorrencia: 'freios',
  }),

  /* ── pedal ──────────────────────────────────────────────────────────── */
  pergunta('pedal_1', 'Como o pedal está diferente?', 'Como está o pedal', [
    { rotulo: 'Duro, e o caminhão freia pouco', vai: 'pedal_descida' },
    { rotulo: 'Afunda mais que o normal', vai: 'pedal_curso' },
    { rotulo: 'Normal, mas puxa para um lado', vai: 'pedal_lado' },
    { rotulo: 'Trepida ou vibra ao frear', vai: 'r_trepida' },
  ]),
  pergunta(
    'pedal_descida',
    'Isso começou depois de uma descida longa ou de muitas frenagens seguidas?',
    'Depois de descida / muitas frenagens',
    [sim('r_fading'), nao('pedal_ar_ok')],
  ),
  pergunta(
    'pedal_ar_ok',
    'O manômetro de ar está acima de 7 bar?',
    'Ar acima de 7 bar',
    [sim('r_pedal_duro_lona'), nao('r_ar_nao_carrega'), duvida('r_ar_duvida')],
  ),
  pergunta(
    'pedal_curso',
    'Ao pisar fundo, o ponteiro do ar cai muito de uma vez (mais de 1 bar) ou você ouve ar escapando perto das rodas?',
    'Ar escapa ao frear',
    [sim('r_vazamento_aplicacao'), nao('r_folga_catraca'), duvida('r_vazamento_aplicacao')],
  ),
  pergunta(
    'pedal_lado',
    'Alguma roda está bem mais quente que as outras ou cheirando a queimado?',
    'Uma roda mais quente',
    [sim('r_roda_agarrando'), nao('r_puxa_lado'), duvida('r_puxa_lado')],
    'Não encoste a mão: aproxime o dorso da mão devagar, sem tocar no tambor ou no cubo.',
  ),
  resultado({
    id: 'r_fading',
    gravidade: 'parar',
    titulo: 'Freio superaquecido (fading)',
    explicacao:
      'Em descida longa, lona e tambor esquentam tanto que perdem atrito: o pedal fica duro e o caminhão não para como deveria. É uma das causas mais comuns de acidente grave com caminhão.',
    causas: ['Uso contínuo do freio de serviço na descida', 'Freio motor ou retarder pouco usado', 'Marcha alta demais na descida', 'Catracas desreguladas sobrecarregando algumas rodas'],
    agora: [
      'Reduza a marcha e use o freio motor ou retarder para segurar o caminhão.',
      'Pare assim que for seguro (acostamento largo, área de escape, posto) e deixe esfriar de 30 a 60 minutos.',
      'Depois de frio, teste o freio devagar antes de seguir. Se continuar fraco, peça socorro.',
    ],
    evitar: [NAO_AGUA, 'Não segure o caminhão só no pedal em descida.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_pedal_duro_lona',
    gravidade: 'parar',
    titulo: 'Freio fraco com pressão normal',
    explicacao:
      'Tem ar suficiente, mas a força não vira frenagem. Costuma ser lona gasta, vitrificada ou suja de óleo, ou a válvula do pedal com problema.',
    causas: ['Lonas gastas ou vitrificadas', 'Óleo ou graxa na lona (retentor de cubo vazando)', 'Válvula do pedal com defeito', 'Catracas muito desreguladas'],
    agora: [SINALIZAR, 'Freio fraco é risco grave: não siga viagem, principalmente carregado.', 'Peça o socorro e conte como o pedal está.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_vazamento_aplicacao',
    gravidade: 'parar',
    titulo: 'Vazamento de ar quando freia',
    explicacao:
      'Se o ar escapa só ao pisar, o vazamento está no caminho da frenagem — normalmente numa câmara de freio com diafragma furado ou numa válvula. Cada freada gasta mais ar do que deveria.',
    causas: ['Diafragma da câmara de freio furado', 'Válvula relé ou do pedal vazando', 'Mangueira de serviço rachada'],
    agora: [
      SINALIZAR,
      'Com o motor ligado, peça para alguém pisar no freio enquanto você escuta de qual roda vem o chiado — de longe, sem entrar embaixo do caminhão.',
      'Peça o socorro e diga de qual roda vem o som.',
    ],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_folga_catraca',
    gravidade: 'cautela',
    titulo: 'Folga grande no freio (catraca)',
    explicacao:
      'Pedal com curso longo e ar normal costuma ser folga: o ajustador (catraca) não está compensando o desgaste da lona e a haste da câmara precisa andar mais para frear.',
    causas: ['Catraca desregulada ou travada', 'Lonas no fim da vida útil', 'Tambor gasto'],
    agora: [
      'Dirija devagar e com mais distância do veículo da frente.',
      'Evite serra e descidas longas.',
      'Vá direto para a oficina ou agende o quanto antes. Se o caminhão não parar bem, pare e peça socorro.',
    ],
    evitar: ['Não regule a catraca na estrada sem experiência: regulagem errada trava a roda.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_roda_agarrando',
    gravidade: 'parar',
    titulo: 'Freio agarrando em uma roda',
    explicacao:
      'Roda muito mais quente que as outras indica freio que não solta totalmente: a lona fica raspando no tambor, esquenta e pode pegar fogo.',
    causas: ['Catraca regulada apertada demais', 'Mola de retorno da sapata quebrada', 'Câmara de freio que não retorna', 'Rolamento de roda com defeito'],
    agora: ['Pare em local seguro, longe de mato seco.', 'Deixe o extintor à mão e observe se sai fumaça.', 'Peça o socorro — não siga rodando com a roda quente.'],
    evitar: [NAO_AGUA, 'Não encoste a mão no tambor ou no cubo.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_puxa_lado',
    gravidade: 'cautela',
    titulo: 'Freio desigual entre os lados',
    explicacao: 'O caminhão puxa para o lado que freia mais. Costuma ser regulagem diferente entre as rodas, lona contaminada ou uma câmara fraca.',
    causas: ['Catracas com regulagens diferentes', 'Óleo ou graxa na lona de um lado', 'Câmara de freio fraca de um lado', 'Pneu murcho de um lado'],
    agora: ['Confira a calibragem dos pneus dianteiros.', 'Siga devagar e com mais distância até a oficina.', 'Se o puxão for forte ou piorar, pare e peça socorro.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_trepida',
    gravidade: 'seguir',
    titulo: 'Trepidação ao frear',
    explicacao:
      'Vibração no pedal ou no volante ao frear costuma ser tambor ovalizado ou lona irregular. Não é emergência, mas piora com o tempo e gasta pneu e suspensão.',
    causas: ['Tambor ovalizado ou com ponto quente', 'Lonas com desgaste irregular', 'Folga na suspensão ou na direção', 'Roda ou pneu desbalanceado'],
    agora: [
      'Pode seguir com atenção, sem abusar do freio.',
      'Agende uma revisão de freios: a Tecnoar mede tambores e lonas.',
      'Se aparecer barulho metálico, cheiro de queimado ou puxão, pare.',
    ],
    ocorrencia: 'freios',
  }),

  /* ── freio travado ──────────────────────────────────────────────────── */
  pergunta('trava_1', 'O que está acontecendo?', 'Tipo de travamento', [
    { rotulo: 'O caminhão não sai do lugar', vai: 'trava_ar' },
    { rotulo: 'Anda, mas uma roda arrasta ou esquenta', vai: 'r_roda_agarrando' },
    { rotulo: 'A carreta está travada', vai: 'trava_carreta' },
  ]),
  pergunta('trava_ar', 'O manômetro de ar está acima de 6 bar?', 'Ar acima de 6 bar', [sim('r_trava_mola'), nao('trava_enche'), duvida('r_ar_duvida')]),
  pergunta(
    'trava_enche',
    'Com o motor ligado e acelerando de leve, a pressão passa de 6 bar em alguns minutos?',
    'Pressão sobe acelerando',
    [sim('r_trava_resolvido', 'Sim, e o freio soltou'), nao('r_ar_nao_carrega')],
    'O freio de mola só solta com pressão. Caminhão parado muito tempo pode estar só com o sistema vazio.',
  ),
  pergunta(
    'trava_carreta',
    'As mangueiras de ar da carreta estão bem engatadas, sem chiado nos engates?',
    'Engates da carreta ok',
    [sim('r_carreta_valvula', 'Sim, estão certas'), nao('r_carreta_engate', 'Não, chiando ou soltas'), duvida('r_carreta_engate', 'Não sei conferir')],
    'São duas: a de suprimento/emergência (normalmente vermelha) e a de serviço (normalmente amarela ou azul).',
  ),
  resultado({
    id: 'r_trava_mola',
    gravidade: 'parar',
    titulo: 'Freio de estacionamento não solta',
    explicacao:
      'Com pressão normal e o caminhão preso, o freio de mola não está recebendo ar para liberar: válvula do freio de estacionamento, válvula relé ou câmara de mola com defeito.',
    causas: ['Válvula do freio de estacionamento com defeito', 'Válvula relé travada', 'Câmara de mola com diafragma rompido', 'Linha de ar do freio de mola dobrada ou rompida'],
    agora: ['Não force acelerando: pode queimar lona e embreagem.', 'Se estiver na via, pisca-alerta e triângulo.', 'Peça o socorro.'],
    evitar: [NAO_SOLTAR_MOLA, 'Nunca entre embaixo do caminhão sem ele estar calçado.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_trava_resolvido',
    gravidade: 'seguir',
    titulo: 'Faltava ar para liberar o freio',
    explicacao:
      'O freio de mola só solta com pressão. Se a pressão subiu e o caminhão liberou normalmente, era o sistema vazio — caminhão parado muitas horas ou um pequeno vazamento noturno.',
    causas: ['Caminhão parado por muito tempo', 'Pequeno vazamento que esvazia o sistema à noite'],
    agora: [
      'Espere a pressão passar de 7 bar antes de sair.',
      'Se o sistema esvazia toda noite, há vazamento: agende uma revisão.',
      'Se voltar a travar rodando, pare e peça socorro.',
    ],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_carreta_engate',
    gravidade: 'cautela',
    selo: 'Dá para tentar resolver',
    titulo: 'Provável problema no engate de ar da carreta',
    explicacao:
      'Se a mangueira de suprimento está solta ou vazando no engate, a carreta perde ar e o freio de mola dela aplica sozinho. É uma proteção, não uma quebra.',
    causas: ['Mangueira solta ou engatada trocada', 'Anel de borracha do engate gasto ou perdido', 'Mangueira rachada'],
    agora: [
      'Com o caminhão parado, freado e o pisca-alerta ligado, confira os engates das mangueiras.',
      'Se tiver anel de vedação reserva, troque.',
      'Recarregue o ar da carreta (botão de suprimento no painel) e veja se ela libera.',
      'Se não resolver em poucos minutos, peça socorro.',
    ],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_carreta_valvula',
    gravidade: 'parar',
    titulo: 'Freio da carreta não libera',
    explicacao: 'Com os engates certos, o problema está na própria carreta: válvula relé-emergência, câmara de mola ou vazamento no reservatório dela.',
    causas: ['Válvula relé-emergência da carreta com defeito', 'Câmara de mola da carreta rompida', 'Vazamento no reservatório ou nas linhas da carreta'],
    agora: [SINALIZAR, 'Não arraste a carreta travada: os pneus esquentam e podem estourar ou pegar fogo.', 'Peça o socorro.'],
    evitar: [NAO_SOLTAR_MOLA],
    ocorrencia: 'freios',
  }),

  /* ── chiado de ar ───────────────────────────────────────────────────── */
  pergunta('chiado_1', 'Quando você ouve o chiado?', 'Quando chia', [
    { rotulo: 'Um jato curto de vez em quando, perto do motor', vai: 'r_secador_normal' },
    { rotulo: 'Só quando piso no freio', vai: 'chiado_pedal' },
    { rotulo: 'O tempo todo, mesmo sem pisar', vai: 'chiado_mantem' },
  ]),
  pergunta(
    'chiado_pedal',
    'A cada pisada, a pressão cai mais de 1 bar ou o alarme de ar acende?',
    'Pressão cai muito por pisada',
    [sim('r_vazamento_aplicacao'), nao('r_vazamento_pequeno'), duvida('r_vazamento_aplicacao')],
  ),
  pergunta(
    'chiado_mantem',
    'Com o motor ligado, a pressão se mantém acima de 7 bar e o alarme fica apagado?',
    'Pressão se mantém com motor ligado',
    [sim('r_ar_vazamento'), nao('r_ar_nao_carrega'), duvida('r_ar_duvida')],
  ),
  resultado({
    id: 'r_secador_normal',
    gravidade: 'seguir',
    titulo: 'Esse chiado é normal',
    explicacao:
      'O secador de ar solta um jato curto sempre que o compressor chega à pressão máxima (a "purga"). É o sistema funcionando e tirando a umidade do ar.',
    causas: ['Purga do secador de ar — normal', 'Se o jato vier a cada poucos segundos, pode haver vazamento fazendo o compressor trabalhar sem parar'],
    agora: ['Pode seguir normalmente.', 'Se o chiado ficar contínuo ou o alarme de ar acender, refaça o diagnóstico.'],
    ocorrencia: 'vazamento',
  }),
  resultado({
    id: 'r_vazamento_pequeno',
    gravidade: 'cautela',
    titulo: 'Pequeno vazamento ao frear',
    explicacao: 'Escapa um pouco de ar ao frear, mas a pressão aguenta. Tende a piorar: um diafragma começando a furar ou uma vedação de válvula cedendo.',
    causas: ['Diafragma de câmara de freio começando a furar', 'Vedação da válvula relé', 'Válvula do pedal'],
    agora: ['Siga com cautela até a oficina.', 'Fique de olho no manômetro: se o alarme acender, pare e peça socorro.'],
    ocorrencia: 'vazamento',
  }),

  /* ── roda quente / fumaça ───────────────────────────────────────────── */
  pergunta('quente_1', 'Tem fumaça saindo de alguma roda, ou chama?', 'Fumaça ou chama na roda', [
    sim('r_fogo_roda', 'Sim, fumaça ou chama'),
    nao('quente_2', 'Não, só cheiro ou calor'),
  ]),
  pergunta('quente_2', 'O calor ou o cheiro vem de uma roda só (ou de um lado só)?', 'Uma roda só', [sim('quente_cubo'), nao('r_fading_leve', 'Não, de várias rodas')]),
  pergunta(
    'quente_cubo',
    'Tem óleo ou graxa escorrendo pelo centro da roda (cubo), ou um ronco que aumenta com a velocidade?',
    'Graxa no cubo / ronco',
    [sim('r_rolamento'), nao('r_roda_agarrando'), duvida('r_roda_agarrando')],
  ),
  resultado({
    id: 'r_fogo_roda',
    gravidade: 'parar',
    selo: 'PARE AGORA',
    titulo: 'Risco de incêndio na roda',
    explicacao: 'Fumaça na roda é freio agarrado ou rolamento travando. Lona e graxa pegam fogo, e o pneu pode queimar e estourar.',
    causas: ['Freio agarrado (catraca, mola ou câmara)', 'Rolamento de roda travando', 'Pneu vazio rodando e esquentando'],
    agora: [
      'Pare agora, longe de mato seco, postos e outros veículos.',
      'Desligue o motor e afaste as pessoas.',
      'Se houver chama e for seguro, use o extintor na base do fogo, de lado para o pneu.',
      'Fogo que não apaga: ligue 193 e fique longe — pneu em chamas pode estourar.',
    ],
    evitar: [NAO_AGUA, 'Não fique de frente para o pneu quente.'],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_fading_leve',
    gravidade: 'cautela',
    titulo: 'Freios quentes pelo uso',
    explicacao: 'Várias rodas quentes depois de serra ou trânsito pesado é sinal de uso intenso do freio. Ainda não é defeito, mas freio quente perde eficiência.',
    causas: ['Descida longa usando o freio de serviço', 'Freio motor ou retarder pouco usado'],
    agora: [
      'Pare em local seguro e deixe esfriar de 30 a 60 minutos.',
      'Nas descidas, use marcha reduzida e freio motor.',
      'Se depois de frio ainda houver cheiro ou uma roda mais quente, peça socorro.',
    ],
    evitar: [NAO_AGUA],
    ocorrencia: 'freios',
  }),
  resultado({
    id: 'r_rolamento',
    gravidade: 'parar',
    titulo: 'Provável problema no rolamento da roda',
    explicacao: 'Graxa escorrendo e calor no cubo indicam rolamento ou retentor danificado. Se o rolamento travar, a roda prende — ou pode até se soltar.',
    causas: ['Rolamento gasto ou sem lubrificação', 'Retentor do cubo vazando', 'Porca do cubo com aperto errado'],
    agora: [SINALIZAR, 'Não siga rodando.', 'Peça o socorro.'],
    ocorrencia: 'roda_pneu',
  }),

  /* ── partida ────────────────────────────────────────────────────────── */
  pergunta('partida_1', 'Ao virar a chave, as luzes do painel acendem?', 'Painel acende', [sim('partida_2'), nao('r_sem_energia', 'Não, nada acende')]),
  pergunta('partida_2', 'O motor de partida gira (faz o barulho de tentar pegar)?', 'Motor de partida gira', [
    sim('partida_diesel', 'Sim, gira mas não pega'),
    nao('r_bateria', 'Não, só um clique ou nada'),
    { rotulo: 'Gira bem devagar', vai: 'r_bateria', tom: 'duvida' },
  ]),
  pergunta('partida_diesel', 'O diesel pode ter acabado?', 'Diesel acabou', [
    sim('r_sem_diesel', 'Sim, acabou ou estava na reserva'),
    nao('r_alimentacao', 'Não, tem diesel'),
    duvida('r_alimentacao'),
  ]),
  resultado({
    id: 'r_sem_energia',
    gravidade: 'cautela',
    selo: 'Tente isto primeiro',
    titulo: 'Sem energia no painel',
    explicacao: 'Painel apagado geralmente é energia que não chega: chave geral desligada, terminal de bateria solto ou fusível principal.',
    causas: ['Chave geral (desligador de bateria) desligada', 'Terminal de bateria solto ou oxidado', 'Fusível ou relé principal queimado', 'Baterias totalmente descarregadas'],
    agora: [
      'Confira a chave geral das baterias.',
      'Veja se os terminais estão firmes — sem encostar ferramenta nos dois polos ao mesmo tempo.',
      'Se não resolver, peça socorro.',
    ],
    ocorrencia: 'nao_liga',
  }),
  resultado({
    id: 'r_bateria',
    gravidade: 'cautela',
    selo: 'Tente isto primeiro',
    titulo: 'Bateria fraca ou motor de partida',
    explicacao: 'Clique sem girar, ou giro lento, é quase sempre bateria sem carga ou mau contato. Caminhão usa 24 V: duas baterias de 12 V ligadas em série.',
    causas: [
      'Baterias descarregadas (geladeira, som, luzes com o motor desligado)',
      'Terminal solto ou oxidado',
      'Motor de partida ou solenoide com defeito',
      'Alternador sem carregar (se a luz da bateria acendia rodando)',
    ],
    agora: [
      'Desligue tudo que consome energia.',
      'Confira os terminais das baterias.',
      'Partida auxiliar só com outro veículo 24 V e cabos grossos — ou peça o socorro.',
    ],
    evitar: ['Não faça "chupeta" de carro de passeio 12 V direto no sistema 24 V.'],
    ocorrencia: 'nao_liga',
  }),
  resultado({
    id: 'r_sem_diesel',
    gravidade: 'cautela',
    selo: 'Tente isto primeiro',
    titulo: 'Ar na linha de combustível',
    explicacao: 'Quando o diesel acaba, entra ar na linha e o motor não pega mesmo depois de abastecer. É preciso escorvar (sangrar) o sistema.',
    causas: ['Tanque vazio', 'Ar na linha depois de abastecer'],
    agora: [
      'Abasteça.',
      'Use a bomba manual de escorva, no filtro de diesel, até ela ficar dura.',
      'Dê partidas curtas, de no máximo 15 segundos, com pausa entre elas.',
      'Se não pegar, peça socorro — insistir esquenta e queima o motor de partida.',
    ],
    ocorrencia: 'nao_liga',
  }),
  resultado({
    id: 'r_alimentacao',
    gravidade: 'parar',
    selo: 'Precisa de mecânico',
    titulo: 'Falha na alimentação ou na injeção',
    explicacao: 'Com diesel no tanque e o motor girando sem pegar, o combustível não chega ou não é injetado.',
    causas: [
      'Filtro de diesel entupido ou com água',
      'Diesel parafinado no frio intenso',
      'Bomba de combustível ou bicos injetores',
      'Imobilizador ou falha eletrônica — veja se há luz de falha no painel',
    ],
    agora: ['Se souber, drene o copo separador de água do filtro.', 'Não insista na partida por mais de 15 segundos seguidos.', 'Peça o socorro.'],
    ocorrencia: 'nao_liga',
  }),

  /* ── pneu e roda ────────────────────────────────────────────────────── */
  pergunta('pneu_1', 'Qual é o problema?', 'Qual pneu/roda', [
    { rotulo: 'Pneu dianteiro (da direção)', vai: 'r_pneu_dianteiro' },
    { rotulo: 'Pneu traseiro de roda dupla', vai: 'pneu_par' },
    { rotulo: 'Pneu da carreta', vai: 'pneu_par' },
    { rotulo: 'Roda bamba ou porcas soltas', vai: 'r_roda_solta' },
  ]),
  pergunta('pneu_par', 'O outro pneu da dupla (o vizinho) está cheio e sem dano?', 'Pneu vizinho bom', [sim('r_geminado_ok'), nao('r_geminado_ruim'), duvida('r_geminado_ruim')]),
  resultado({
    id: 'r_pneu_dianteiro',
    gravidade: 'parar',
    titulo: 'Pneu da direção: não rode',
    explicacao: 'Pneu dianteiro vazio ou estourado tira o controle da direção. Mesmo devagar, não vale o risco.',
    causas: ['Furo ou corte', 'Estouro por calor ou pressão errada', 'Válvula ou roda com vazamento'],
    agora: [
      'Se estourou rodando: segure firme o volante, tire o pé do acelerador e deixe perder velocidade antes de frear com suavidade.',
      SINALIZAR,
      'Peça o socorro: troca de pneu de caminhão exige macaco e ferramentas certas.',
    ],
    ocorrencia: 'roda_pneu',
  }),
  resultado({
    id: 'r_geminado_ok',
    gravidade: 'cautela',
    titulo: 'Pneu furado na roda dupla',
    explicacao:
      'Com o vizinho bom, dá para andar um trecho curto e devagar até um local seguro. Mas o pneu bom fica com o dobro da carga e pode estourar, e o vazio esquenta e pode pegar fogo.',
    causas: ['Furo ou corte', 'Válvula com vazamento'],
    agora: [
      'Ande só o necessário, devagar (até uns 30–40 km/h), até um local seguro ou borracharia.',
      'Pare de tempos em tempos e veja se sai fumaça ou cheiro de borracha.',
      'Peça o socorro ou vá à borracharia mais próxima.',
    ],
    evitar: ['Não siga viagem longa assim, principalmente carregado.'],
    ocorrencia: 'roda_pneu',
  }),
  resultado({
    id: 'r_geminado_ruim',
    gravidade: 'parar',
    titulo: 'Os dois pneus da dupla comprometidos',
    explicacao: 'Sem um pneu bom na dupla, o eixo fica sem apoio seguro: risco de estouro, incêndio e dano à roda.',
    causas: ['Pneu vazio sobrecarregando o vizinho', 'Os dois pneus danificados'],
    agora: [SINALIZAR, 'Peça o socorro.'],
    ocorrencia: 'roda_pneu',
  }),
  resultado({
    id: 'r_roda_solta',
    gravidade: 'parar',
    selo: 'PARE AGORA',
    titulo: 'Risco de a roda se soltar',
    explicacao: 'Porcas soltas ou roda bamba podem arrancar os prisioneiros e soltar a roda inteira na pista — um risco enorme para você e para os outros.',
    causas: ['Aperto errado depois de troca de pneu', 'Prisioneiros ou porcas danificados', 'Rolamento com folga'],
    agora: ['Pare imediatamente no local seguro mais próximo.', 'Não siga rodando, nem "só até ali".', 'Peça o socorro. Se tiver a chave de roda, só aperte com o caminhão parado e calçado.'],
    ocorrencia: 'roda_pneu',
  }),

  /* ── painel ─────────────────────────────────────────────────────────── */
  pergunta('painel_1', 'Qual aviso apareceu?', 'Aviso do painel', [
    { rotulo: 'Temperatura do motor alta', vai: 'painel_agua' },
    { rotulo: 'Pressão do óleo (luz do óleo)', vai: 'r_oleo' },
    { rotulo: 'O motor perdeu força', vai: 'painel_forca' },
    { rotulo: 'Luz da bateria (carga)', vai: 'r_alternador' },
  ]),
  pergunta('painel_agua', 'Está saindo vapor ou vazando água / líquido de arrefecimento?', 'Vapor ou vazamento de água', [sim('r_superaquecimento_vazamento'), nao('r_superaquecimento')]),
  pergunta('painel_forca', 'Aparece aviso de ARLA 32 (Arla / AdBlue) ou de emissões no painel?', 'Aviso de ARLA 32', [sim('r_arla'), nao('painel_fumaca'), duvida('painel_fumaca')]),
  pergunta('painel_fumaca', 'Como está a fumaça do escapamento?', 'Fumaça do escapamento', [
    { rotulo: 'Muita fumaça preta', vai: 'r_turbo' },
    { rotulo: 'Fumaça branca, com cheiro adocicado', vai: 'r_junta' },
    { rotulo: 'Normal', vai: 'r_modo_protecao', tom: 'nao' },
  ]),
  resultado({
    id: 'r_oleo',
    gravidade: 'parar',
    selo: 'DESLIGUE O MOTOR',
    titulo: 'Pressão do óleo baixa',
    explicacao: 'Sem pressão de óleo o motor funde em poucos minutos — é o conserto mais caro de um caminhão. Luz do óleo acesa com o motor rodando é motivo para desligar já.',
    causas: ['Nível de óleo baixo (vazamento ou consumo)', 'Bomba de óleo ou filtro com problema', 'Sensor de pressão com defeito (só dá para saber medindo)'],
    agora: ['Pare em local seguro e desligue o motor imediatamente.', 'Espere uns 10 minutos e confira o nível na vareta.', 'Mesmo com o nível bom, não ligue de novo: peça o socorro.'],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_superaquecimento_vazamento',
    gravidade: 'parar',
    titulo: 'Motor superaquecendo com vazamento',
    explicacao: 'O líquido de arrefecimento está saindo. Sem ele, o motor esquenta até danificar o cabeçote.',
    causas: ['Mangueira estourada ou abraçadeira solta', 'Radiador furado', 'Bomba d’água vazando'],
    agora: ['Pare em local seguro e desligue o motor.', 'Espere esfriar antes de olhar — mangueira estourada é o mais comum.', 'Peça o socorro.'],
    evitar: ['Não abra o reservatório quente: o líquido sai fervendo e queima.'],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_superaquecimento',
    gravidade: 'parar',
    titulo: 'Motor superaquecendo',
    explicacao: 'O motor está esquentando além do normal. Continuar rodando pode empenar o cabeçote e queimar a junta.',
    causas: [
      'Nível baixo do líquido de arrefecimento',
      'Correia da bomba d’água ou da ventoinha partida',
      'Embreagem da ventoinha (viscosa) com defeito',
      'Radiador sujo ou entupido',
      'Válvula termostática travada',
    ],
    agora: [
      'Pare em local seguro. Deixe em marcha lenta de 1 a 2 minutos e depois desligue.',
      'Com o motor frio, confira o nível e a correia.',
      'Se o ponteiro subir de novo, não siga: peça o socorro.',
    ],
    evitar: ['Não abra o reservatório com o motor quente.'],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_arla',
    gravidade: 'cautela',
    titulo: 'ARLA 32 limitando a potência',
    explicacao: 'Caminhões Euro 5 e 6 reduzem a força de propósito quando falta ARLA 32 ou há falha no sistema de emissões. É proteção, não quebra do motor.',
    causas: ['Tanque de ARLA vazio ou ARLA de má qualidade', 'Sensor de nível ou qualidade do ARLA', 'Bomba ou bico dosador do ARLA', 'ARLA cristalizado no frio'],
    agora: [
      'Complete o ARLA 32 no próximo posto.',
      'Desligue e ligue o motor depois de abastecer — alguns caminhões só liberam a potência após alguns minutos.',
      'Se o aviso continuar com o tanque cheio, agende na oficina.',
    ],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_turbo',
    gravidade: 'cautela',
    titulo: 'Perda de força com fumaça preta',
    explicacao: 'Fumaça preta com perda de força é diesel demais para pouco ar: mangueira do turbo ou do intercooler solta, filtro de ar entupido ou turbina com defeito.',
    causas: ['Mangueira do turbo/intercooler solta ou furada', 'Filtro de ar entupido', 'Turbina com defeito', 'Bico injetor pingando'],
    agora: [
      'Siga devagar até a oficina, sem exigir do motor em subidas.',
      'Com o motor desligado, veja se alguma mangueira grossa do turbo está solta.',
      'Se aparecer assobio forte ou fumaça azul, pare e peça socorro.',
    ],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_junta',
    gravidade: 'parar',
    titulo: 'Possível água dentro do motor',
    explicacao:
      'Fumaça branca densa com cheiro adocicado indica líquido de arrefecimento queimando dentro do motor — junta do cabeçote, cabeçote trincado ou trocador de calor. Seguir rodando pode destruir o motor.',
    causas: ['Junta do cabeçote queimada', 'Cabeçote trincado', 'Trocador de calor (resfriador de óleo) furado'],
    agora: ['Pare e desligue o motor.', 'Com o motor frio, confira o nível do líquido de arrefecimento.', 'Peça o socorro.'],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_modo_protecao',
    gravidade: 'cautela',
    titulo: 'Motor em modo de proteção',
    explicacao: 'Sem ARLA e sem fumaça estranha, perda de força costuma ser o motor se protegendo de alguma falha lida por sensor — ou filtro de diesel entupido.',
    causas: ['Filtro de diesel saturado', 'Sensor com defeito (pressão do turbo, temperatura, rotação)', 'Falha na injeção eletrônica'],
    agora: [
      'Anote as luzes e mensagens do painel, ou tire uma foto.',
      'Se o caminhão estiver seguro para andar, siga devagar até a oficina.',
      'Se piorar ou aparecer luz vermelha, pare e peça socorro.',
    ],
    ocorrencia: 'mecanico',
  }),
  resultado({
    id: 'r_alternador',
    gravidade: 'cautela',
    titulo: 'A bateria não está carregando',
    explicacao: 'Luz da bateria acesa rodando quer dizer que o alternador não está carregando: o caminhão anda até as baterias acabarem.',
    causas: ['Correia do alternador partida ou frouxa', 'Alternador ou regulador de tensão com defeito', 'Cabo de carga solto'],
    agora: [
      'Desligue o que puder (ar-condicionado, faróis auxiliares, geladeira), mantendo as luzes obrigatórias.',
      'Siga direto para a oficina mais próxima, sem desligar o motor no caminho.',
      'Olhe o termômetro: se a mesma correia move a bomba d’água e a temperatura subir, pare.',
    ],
    ocorrencia: 'pane_eletrica',
  }),

  /* ── não sei ────────────────────────────────────────────────────────── */
  resultado({
    id: 'r_nao_sei',
    gravidade: 'cautela',
    selo: 'Fale com um mecânico',
    titulo: 'Vamos deixar o mecânico descobrir',
    explicacao: 'Tudo bem não saber. Barulho novo, cheiro estranho ou comportamento diferente merecem uma olhada antes de virar problema grande.',
    causas: ['Pode ser algo simples ou o começo de um defeito maior — só vendo'],
    agora: [
      'Se o caminhão está parado na via ou você não se sente seguro para dirigir, peça o SOS.',
      'Se dá para rodar normalmente, agende uma avaliação.',
      'Anote quando acontece (frio, quente, freando, acelerando): ajuda muito no diagnóstico.',
    ],
    ocorrencia: 'desconhecido',
  }),
]

export const NOS: Record<string, No> = Object.fromEntries(LISTA.map((n) => [n.id, n]))

/** Garantia em desenvolvimento: nenhuma resposta aponta para um nó que não existe. */
if (import.meta.env.DEV) {
  for (const n of LISTA) {
    if (n.tipo === 'pergunta') for (const o of n.opcoes) if (!NOS[o.vai]) console.warn(`[TECNO IA] "${n.id}" aponta para "${o.vai}", que não existe.`)
  }
  for (const s of SINTOMAS) if (!NOS[s.inicio]) console.warn(`[TECNO IA] sintoma "${s.id}" começa em "${s.inicio}", que não existe.`)
}
