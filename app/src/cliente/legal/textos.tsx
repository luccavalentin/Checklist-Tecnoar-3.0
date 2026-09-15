import type { ReactNode } from 'react'

/**
 * Termos de uso e política de privacidade do SOS Tecnoar.
 *
 * Escritos para o app como ele é de verdade — cada dado citado aqui existe no
 * banco ou no aparelho, cada prazo é o que o servidor cumpre (o trajeto some
 * 30 dias depois do chamado encerrado: `sos_limpar_posicoes`; a exclusão de
 * conta apaga o que `sos_excluir_minha_conta` apaga). Mudou o comportamento
 * do app? Mude o texto junto e atualize `VIGENCIA_LEGAL`.
 *
 * Nome e contatos da empresa vêm de `sos_info_publica` — nada fixo aqui.
 */

export const VIGENCIA_LEGAL = '12 de setembro de 2026'

export type TipoDocumentoLegal = 'termos' | 'privacidade'

export interface ContextoLegal {
  empresa: string
  telefone: string | null
  whatsapp: string | null
  politicaUrl: string | null
}

export interface SecaoLegal {
  id: string
  titulo: string
  conteudo: ReactNode
}

export interface DocumentoLegalDados {
  titulo: string
  subtitulo: string
  resumo: string[]
  secoes: SecaoLegal[]
}

/* ── peças de texto ─────────────────────────────────────────────────────── */

function P({ children }: { children: ReactNode }) {
  return <p className="text-[14.5px] leading-relaxed text-ink-2">{children}</p>
}

function Itens({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2 pl-1 text-[14.5px] leading-relaxed text-ink-2 [&>li]:relative [&>li]:pl-4 [&>li]:before:absolute [&>li]:before:top-[0.62em] [&>li]:before:left-0 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-accent [&>li]:before:content-['']">{children}</ul>
}

function F({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>
}

function Destaque({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3 text-[14px] leading-relaxed text-accent-ink">{children}</div>
}

/* ── termos de uso ──────────────────────────────────────────────────────── */

export function termosDeUso(ctx: ContextoLegal): DocumentoLegalDados {
  const e = ctx.empresa
  return {
    titulo: 'Termos de uso',
    subtitulo: `As regras para usar o SOS Tecnoar, o app de socorro mecânico da ${e}.`,
    resumo: [
      `O SOS Tecnoar serve para pedir socorro mecânico à ${e}, acompanhar o atendimento e cuidar do histórico do seu veículo.`,
      'Em acidente com feridos, fogo ou risco à vida, ligue primeiro para 193 (Bombeiros), 192 (SAMU) ou 191 (PRF).',
      'Tempos de chegada são estimativas: dependem de mecânicos disponíveis, distância, trânsito e condições da via.',
      'Peças, serviços e deslocamento aparecem no orçamento, item por item. Você aprova assinando na tela — ou recusa.',
      'A TECNO IA orienta, mas não substitui a avaliação de um mecânico.',
    ],
    secoes: [
      {
        id: 'aceitacao',
        titulo: 'Aceitação',
        conteudo: (
          <>
            <P>
              Estes termos valem para o aplicativo SOS Tecnoar (“app”), oferecido pela <F>{e}</F> (“Tecnoar”). Ao criar sua conta e usar o app, você
              declara que leu e concorda com estes termos e com a <F>Política de privacidade</F>. Se não concordar, não use o app.
            </P>
            <P>Nada nestes termos limita os direitos que você tem como consumidor pela lei brasileira.</P>
          </>
        ),
      },
      {
        id: 'servico',
        titulo: 'O que o app oferece',
        conteudo: (
          <>
            <P>Pelo app você pode:</P>
            <Itens>
              <li>pedir socorro mecânico com a sua localização e acompanhar o mecânico ao vivo no mapa;</li>
              <li>conversar com o mecânico e com a central e enviar fotos, áudios e vídeos do problema;</li>
              <li>receber orçamentos, aprová-los com a sua assinatura na tela ou recusá-los;</li>
              <li>baixar o laudo do atendimento em PDF;</li>
              <li>consultar o histórico de serviços e socorros dos seus veículos, receber lembretes de revisão e pedir agendamentos;</li>
              <li>usar a TECNO IA para uma triagem do problema antes de pedir ajuda.</li>
            </Itens>
            <P>Funcionalidades podem ser melhoradas, alteradas ou retiradas. Mudanças que afetem você de forma relevante serão avisadas no app.</P>
          </>
        ),
      },
      {
        id: 'conta',
        titulo: 'Sua conta',
        conteudo: (
          <Itens>
            <li>O app é para maiores de 18 anos: motoristas, frotistas e responsáveis por veículos.</li>
            <li>
              Informe dados verdadeiros e mantenha-os atualizados — principalmente o <F>celular</F>, que é por onde o mecânico fala com você.
            </li>
            <li>A conta é pessoal. Guarde sua senha e não a compartilhe; você responde pelo que for feito com a sua conta.</li>
            <li>Se suspeitar de uso indevido, troque a senha e avise a Tecnoar.</li>
          </Itens>
        ),
      },
      {
        id: 'socorro',
        titulo: 'Pedido de socorro',
        conteudo: (
          <>
            <Destaque>
              O SOS Tecnoar é um serviço de <strong>assistência mecânica</strong>, não um serviço público de emergência. Em acidente com vítima, fogo,
              vazamento de produto perigoso ou risco à vida, ligue primeiro para 193, 192, 190 ou 191 e só depois peça o socorro mecânico.
            </Destaque>
            <Itens>
              <li>Informe o local, o veículo e o problema com a maior precisão possível e confira o ponto no mapa antes de enviar.</li>
              <li>Enquanto espera, siga as regras de segurança: pisca-alerta ligado, triângulo na via e, se possível, fique fora da pista.</li>
              <li>
                Previsões de chegada e distâncias são <F>estimativas</F> calculadas com GPS e mapas e mudam com trânsito, clima, condições da via e sinal de
                celular. A Tecnoar não garante um horário de chegada, salvo quando houver prazo previsto em contrato de frota.
              </li>
              <li>O atendimento depende da disponibilidade de mecânicos e da área de cobertura. Se não for possível atender, a Tecnoar avisa você.</li>
              <li>Você pode cancelar pelo app enquanto a opção “Cancelar o socorro” aparecer; depois disso, fale com a central.</li>
              <li>Pedidos falsos ou de má-fé tiram um mecânico de quem precisa e podem levar à suspensão da conta e às medidas legais cabíveis.</li>
            </Itens>
          </>
        ),
      },
      {
        id: 'orcamento',
        titulo: 'Orçamento, valores e pagamento',
        conteudo: (
          <Itens>
            <li>Peças e serviços são lançados a partir do catálogo da {e}, com os preços vigentes.</li>
            <li>Quando cobrada, a taxa de deslocamento é calculada pela distância até o seu veículo e aparece no orçamento como item separado.</li>
            <li>O orçamento mostra cada item, a quantidade, o preço e o total. Você pode aprová-lo — assinando com o dedo na tela — ou recusá-lo.</li>
            <li>
              A <F>assinatura no app vale como a sua concordância</F> com os itens e valores exibidos naquele orçamento. Ela fica registrada no chamado e no
              laudo. Se os itens mudarem depois, um novo orçamento pode ser enviado para você responder de novo.
            </li>
            <li>
              O app não processa pagamentos. A forma e o prazo de pagamento são combinados diretamente com a {e}, que emite os documentos fiscais do serviço.
            </li>
            <li>Em caso de dúvida sobre valores, fale com o mecânico pela conversa do chamado ou com a central antes de responder.</li>
          </Itens>
        ),
      },
      {
        id: 'tecno-ia',
        titulo: 'TECNO IA',
        conteudo: (
          <>
            <P>
              A TECNO IA faz uma <F>triagem automática</F> com base no que você descreve e nas fotos que envia, e pode sugerir pedir socorro ou agendar
              uma revisão. Ela pode errar: não é diagnóstico e não substitui a avaliação de um mecânico. Quem decide o que fazer é você.
            </P>
            <Itens>
              <li>Na dúvida ou em situação de risco, pare em local seguro e peça o SOS.</li>
              <li>Não use a TECNO IA enquanto dirige.</li>
              <li>Existe um limite diário de mensagens por conta. Sem internet ou com a IA indisponível, o app oferece um guia rápido que funciona no próprio aparelho, com as mesmas limitações.</li>
              <li>Não envie à IA dados de outras pessoas ou informações que não tenham relação com o veículo.</li>
            </Itens>
          </>
        ),
      },
      {
        id: 'conteudo',
        titulo: 'O que você envia pelo app',
        conteudo: (
          <Itens>
            <li>
              Você autoriza a Tecnoar a usar as fotos, áudios, vídeos, mensagens e a assinatura que envia para prestar o atendimento, emitir o laudo e manter
              os registros do serviço.
            </li>
            <li>É proibido enviar conteúdo ofensivo, ilegal ou que exponha outras pessoas sem necessidade.</li>
            <li>Trate mecânicos e equipe com respeito. Ofensas e ameaças podem levar ao bloqueio da conta.</li>
          </Itens>
        ),
      },
      {
        id: 'acompanhamento',
        titulo: 'Compartilhar o acompanhamento',
        conteudo: (
          <P>
            Durante um socorro você pode gerar um link de acompanhamento ao vivo para enviar a quem quiser (família, gestor da frota). Quem tiver o link vê
            a etapa do atendimento, a previsão de chegada e as posições do mecânico e do veículo — sem o seu telefone e sem as mensagens. O link expira
            em 12 horas. Você escolhe com quem compartilha.
          </P>
        ),
      },
      {
        id: 'laudo',
        titulo: 'Laudo e histórico',
        conteudo: (
          <P>
            O laudo em PDF reúne os registros do atendimento: horários, fotos, peças e serviços com valores, a assinatura do orçamento e a avaliação. O
            histórico mostra as ordens de serviço e os socorros ligados ao seu cadastro na {e}. Se encontrar algo errado, fale com a Tecnoar para corrigir.
          </P>
        ),
      },
      {
        id: 'disponibilidade',
        titulo: 'Disponibilidade e responsabilidades',
        conteudo: (
          <>
            <P>
              O app depende de internet, GPS e do seu aparelho, e pode ficar indisponível por falha de rede, manutenção ou motivos fora do controle da
              Tecnoar. Sem sinal, ligue para a central{ctx.telefone ? ` (${ctx.telefone})` : ''}.
            </P>
            <P>
              A {e} responde pelos serviços que presta, nos termos do Código de Defesa do Consumidor. Informações falsas ou incompletas no pedido podem
              atrasar ou impedir o atendimento.
            </P>
          </>
        ),
      },
      {
        id: 'encerramento',
        titulo: 'Exclusão e suspensão da conta',
        conteudo: (
          <P>
            Você pode excluir sua conta a qualquer momento em <F>Perfil → Excluir minha conta</F> — exceto durante um socorro em andamento. A Tecnoar pode
            suspender contas usadas em desacordo com estes termos, informando o motivo.
          </P>
        ),
      },
      {
        id: 'propriedade',
        titulo: 'Propriedade intelectual',
        conteudo: <P>A marca Tecnoar, o app e seus conteúdos pertencem à {e} ou a seus licenciadores. Não é permitido copiar, modificar ou explorar o app fora do uso previsto aqui.</P>,
      },
      {
        id: 'mudancas',
        titulo: 'Mudanças nestes termos',
        conteudo: <P>Estes termos podem ser atualizados. A data de vigência fica no topo e mudanças relevantes são avisadas no app com antecedência.</P>,
      },
      {
        id: 'lei',
        titulo: 'Lei aplicável e foro',
        conteudo: <P>Estes termos seguem as leis brasileiras. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão sobre eles.</P>,
      },
    ],
  }
}

/* ── política de privacidade ────────────────────────────────────────────── */

export function politicaDePrivacidade(ctx: ContextoLegal): DocumentoLegalDados {
  const e = ctx.empresa
  return {
    titulo: 'Política de privacidade',
    subtitulo: `Como a ${e} trata os seus dados pessoais no SOS Tecnoar, de acordo com a LGPD.`,
    resumo: [
      'Usamos seus dados para prestar o socorro, falar com você e manter o histórico do seu veículo.',
      'Sua localização só é usada durante um pedido de socorro. O trajeto registrado é apagado 30 dias depois que o chamado termina.',
      `Quem vê seus dados é a equipe da ${e} e o mecânico que atende você. Nada é vendido nem usado para publicidade.`,
      'Você vê, corrige e exclui sua conta pelo próprio app, em Perfil.',
    ],
    secoes: [
      {
        id: 'quem-somos',
        titulo: 'Quem cuida dos seus dados',
        conteudo: (
          <>
            <P>
              A <F>{e}</F> (“Tecnoar”) é a controladora dos dados pessoais tratados no aplicativo SOS Tecnoar (“app”), usado por clientes para pedir socorro
              mecânico, acompanhar o atendimento, consultar o histórico do veículo e agendar serviços.
            </P>
            <P>
              Esta política explica quais dados coletamos, para quê, com quem compartilhamos, por quanto tempo guardamos e como você exerce seus direitos,
              conforme a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
              {ctx.politicaUrl ? ' Ela trata especificamente do app e complementa a política de privacidade geral da empresa, indicada no fim desta página.' : ''}
            </P>
          </>
        ),
      },
      {
        id: 'dados',
        titulo: 'Quais dados coletamos',
        conteudo: (
          <Itens>
            <li>
              <F>Identificação e contato:</F> nome, e-mail, senha (guardada de forma criptografada pelo serviço de autenticação — ninguém da Tecnoar tem
              acesso a ela), celular e, se você informar, CPF ou CNPJ, usado para ligar sua conta ao cadastro que você já tem na Tecnoar.
            </li>
            <li>
              <F>Veículos:</F> placa, tipo, marca, modelo e quilometragem que você informa ou que já constam no seu cadastro na Tecnoar.
            </li>
            <li>
              <F>Localização — só durante um socorro:</F> o ponto do pedido (coordenadas, precisão e endereço aproximado) e, enquanto o socorro está em
              andamento, a posição do seu aparelho enviada de tempos em tempos para o mecânico encontrar você. Fora de um socorro o app não coleta sua
              localização, nem em segundo plano.
            </li>
            <li>
              <F>O que você envia:</F> descrição do problema, fotos, áudios e vídeos do chamado, mensagens trocadas com o mecânico e a central, avaliação do
              atendimento e a assinatura feita na tela para aprovar um orçamento.
            </li>
            <li>
              <F>Atendimento e histórico:</F> chamados (protocolo, horários e etapas), orçamentos e respostas, peças e serviços, ordens de serviço,
              agendamentos e lembretes de revisão calculados a partir do histórico do veículo.
            </li>
            <li>
              <F>Conversas com a TECNO IA:</F> as mensagens que você escreve e as respostas da IA. Para responder melhor, a IA recebe também seu nome, os
              dados do veículo principal e um resumo dos últimos serviços. Fotos enviadas à IA servem só para gerar a resposta e não ficam guardadas no app.
            </li>
            <li>
              <F>Notificações:</F> se você permitir, o endereço técnico de entrega de notificações do seu aparelho (fornecido pelo navegador) e a
              identificação do navegador — usados só para enviar os avisos do app.
            </li>
            <li>
              <F>Dados técnicos:</F> registros de acesso gerados pela infraestrutura (como data, hora e endereço IP), usados para segurança e para corrigir
              falhas; a sessão de login e suas preferências (como o tema claro ou escuro), guardadas no próprio aparelho. O app não usa cookies de
              publicidade nem ferramentas de rastreamento de terceiros.
            </li>
          </Itens>
        ),
      },
      {
        id: 'finalidades',
        titulo: 'Para que usamos',
        conteudo: (
          <>
            <Itens>
              <li>Receber e atender o pedido de socorro: localizar o veículo, acionar o mecânico, estimar distância e chegada e permitir que vocês se falem.</li>
              <li>Enviar orçamentos, registrar a sua aprovação ou recusa e emitir o laudo e a ordem de serviço do atendimento.</li>
              <li>Ligar sua conta ao seu cadastro na Tecnoar e mostrar o histórico de serviços e socorros dos seus veículos.</li>
              <li>Lembrar revisões e receber pedidos de agendamento.</li>
              <li>Avisar sobre o seu atendimento (mecânico a caminho, orçamento, conclusão) e sobre revisões.</li>
              <li>Oferecer a triagem da TECNO IA, quando você a usa.</li>
              <li>Manter o app seguro, evitar fraudes e pedidos falsos e resolver problemas técnicos.</li>
              <li>Cumprir obrigações legais, como as fiscais e as de defesa do consumidor, e defender direitos em processos.</li>
            </Itens>
            <P>
              Não usamos seus dados para publicidade nem para decisões automatizadas que afetem seus direitos. As sugestões da TECNO IA são só sugestões:
              quem decide pedir socorro, agendar ou aprovar um orçamento é você.
            </P>
          </>
        ),
      },
      {
        id: 'bases-legais',
        titulo: 'Bases legais',
        conteudo: (
          <>
            <P>Tratamos seus dados com base no art. 7º da LGPD:</P>
            <Itens>
              <li>
                <F>Execução de contrato</F> (inciso V): conta, pedido de socorro, atendimento, orçamento, laudo, histórico, agendamentos e avisos do
                atendimento.
              </li>
              <li>
                <F>Obrigação legal ou regulatória</F> (inciso II): registros fiscais e da prestação do serviço.
              </li>
              <li>
                <F>Exercício regular de direitos</F> (inciso VI): guarda de registros para eventual defesa em processos.
              </li>
              <li>
                <F>Proteção da vida e da incolumidade física</F> (inciso VII): localizar você e acionar ajuda em situações de risco na estrada.
              </li>
              <li>
                <F>Legítimo interesse</F> (inciso IX): segurança, prevenção de fraudes, melhoria do atendimento e lembretes de revisão — sempre dentro do que
                você espera e com o direito de se opor.
              </li>
              <li>
                <F>Consentimento</F> (inciso I): acesso à localização, câmera, microfone e notificações do aparelho, que você autoriza nas permissões do
                sistema e pode retirar quando quiser.
              </li>
            </Itens>
          </>
        ),
      },
      {
        id: 'compartilhamento',
        titulo: 'Com quem compartilhamos',
        conteudo: (
          <>
            <Itens>
              <li>
                <F>Equipe da {e}:</F> a central de atendimento e os mecânicos. Os mecânicos acionados veem o necessário para decidir se aceitam e para chegar
                até você; o mecânico que atende vê seu nome, telefone de contato, veículo, localização, descrição, fotos e mensagens do chamado.
              </li>
              <li>
                <F>Quem você escolher:</F> o link de acompanhamento que você compartilha mostra a etapa, a previsão e as posições do mecânico e do veículo — sem
                seu telefone e sem as mensagens — e expira em 12 horas.
              </li>
              <li>
                <F>Prestadores que operam o app para a Tecnoar</F>, só no necessário para cada tarefa: infraestrutura em nuvem (banco de dados, arquivos,
                login e funções do servidor, pela Supabase); o provedor de inteligência artificial que gera as respostas da TECNO IA (como o Google Gemini),
                que recebe o texto da conversa, a foto enviada e o contexto descrito acima; os serviços de mapa do OpenStreetMap, que recebem coordenadas para
                desenhar o mapa, mostrar o endereço aproximado e calcular a rota, sem seu nome ou telefone; os serviços de notificação do fabricante do
                aparelho ou do navegador (como Apple e Google), que entregam os avisos; e o WhatsApp, quando a Tecnoar o usa para avisar a própria equipe de
                um novo socorro.
              </li>
              <li>
                <F>Autoridades públicas</F>, quando houver obrigação legal ou ordem judicial.
              </li>
            </Itens>
            <Destaque>Não vendemos, não alugamos e não cedemos seus dados para publicidade.</Destaque>
            <P>
              Alguns prestadores podem processar dados fora do Brasil. Nesses casos, a transferência segue as hipóteses do art. 33 da LGPD, com prestadores que
              oferecem garantias contratuais de proteção de dados.
            </P>
          </>
        ),
      },
      {
        id: 'retencao',
        titulo: 'Por quanto tempo guardamos',
        conteudo: (
          <Itens>
            <li>
              <F>Trajeto de localização do socorro:</F> apagado automaticamente 30 dias depois que o chamado é concluído ou cancelado.
            </li>
            <li>
              <F>Conta do app:</F> enquanto ela existir. Ao excluir a conta, apagamos na hora o seu acesso (e-mail e senha), o vínculo da conta, todo o
              trajeto de localização, as conversas com a TECNO IA e os links de acompanhamento ainda válidos.
            </li>
            <li>
              <F>Conversas com a TECNO IA:</F> enquanto a conta existir.
            </li>
            <li>
              <F>Chamados, orçamentos, assinaturas, fotos, mensagens, laudos e ordens de serviço:</F> guardados como registro da prestação do serviço pelo
              tempo exigido pelas obrigações legais (fiscais e de garantia ao consumidor) e para defesa de direitos. Se você excluir a conta, esses registros
              continuam no sistema da Tecnoar, sem ligação com a conta do app.
            </li>
            <li>
              <F>Cadastro de cliente na Tecnoar</F> (nome, documento, telefone e veículos usados nas ordens de serviço): faz parte dos registros do serviço e
              não é apagado junto com a conta do app. Se quiser que ele seja revisado ou anonimizado no que não for obrigatório guardar, peça pelos contatos
              abaixo.
            </li>
            <li>
              <F>Endereço de notificações:</F> até você desativar as notificações ou excluir a conta.
            </li>
          </Itens>
        ),
      },
      {
        id: 'direitos',
        titulo: 'Seus direitos e como exercê-los',
        conteudo: (
          <>
            <P>A LGPD (art. 18) garante a você, entre outros, os direitos abaixo. A maioria você exerce no próprio app:</P>
            <Itens>
              <li>
                <F>Confirmar e acessar seus dados:</F> em Perfil (seus dados), Chamados (seus socorros) e Histórico (serviços do veículo). O laudo em PDF de
                cada atendimento fica disponível no chamado.
              </li>
              <li>
                <F>Corrigir:</F> em Perfil → Editar (nome e celular). Para documento e veículos, fale com a Tecnoar.
              </li>
              <li>
                <F>Excluir:</F> em Perfil → Excluir minha conta. A exclusão é imediata e não pode ser desfeita; não é possível excluir com um socorro em
                andamento.
              </li>
              <li>
                <F>Retirar consentimentos:</F> desligue localização, câmera, microfone ou notificações nas configurações do celular a qualquer momento. Sem a
                localização você ainda pode pedir socorro, marcando o local no mapa.
              </li>
              <li>
                <F>Portabilidade, informação sobre compartilhamento, anonimização, bloqueio, oposição e revisão de decisões automatizadas:</F> peça pelos
                contatos abaixo. Respondemos em até 15 dias.
              </li>
            </Itens>
            <P>Se achar que seus direitos não foram atendidos, você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</P>
          </>
        ),
      },
      {
        id: 'seguranca',
        titulo: 'Segurança',
        conteudo: (
          <>
            <P>
              A comunicação com o app é criptografada; cada pessoa só acessa o que é dela, por regras de acesso aplicadas no próprio banco de dados; fotos e
              arquivos ficam em armazenamento privado e só abrem por links temporários; e as ações importantes ficam registradas.
            </P>
            <P>
              Nenhum sistema é totalmente imune a falhas. Se ocorrer um incidente de segurança que possa trazer risco ou dano relevante a você, avisaremos
              você e a ANPD, como determina a lei. Ajude também: não compartilhe sua senha e use bloqueio de tela no celular.
            </P>
          </>
        ),
      },
      {
        id: 'menores',
        titulo: 'Crianças e adolescentes',
        conteudo: <P>O app é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes.</P>,
      },
      {
        id: 'mudancas',
        titulo: 'Mudanças nesta política',
        conteudo: <P>Esta política pode ser atualizada. A data de vigência fica no topo e mudanças relevantes são avisadas no app.</P>,
      },
    ],
  }
}
