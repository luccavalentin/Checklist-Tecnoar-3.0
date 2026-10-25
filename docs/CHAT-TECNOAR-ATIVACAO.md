# Canal humano Chat Tecnoar

Implementação local de 24/10/2026. O canal conecta o usuário autenticado com a equipe Tecnoar, independente de chamado. A Tecno IA continua separada. O atalho do cliente e o cartão central do mecânico abrem `/chat-tecnoar`. A equipe responde em **SOS Tecnoar → Chat Tecnoar**, rota `/sos/chat` do Checklist.

## Ativação no servidor (pendente)

Aplicar **somente** `supabase/migrations/20261024_chat_equipe_tecnoar.sql` ao projeto Supabase do ambiente, depois de revisar o SQL. Não executar todas as migrações antigas para ativar o chat. A mudança cria tabelas, RPCs, bucket privado, RLS e políticas de presença; não muda o chat existente de chamados.

O plugin Supabase foi localizado, mas não está instalado/conectado nesta sessão. A migração não foi aplicada em produção. Sem ela, o aplicativo mostra uma mensagem de canal ainda não ativado; não simula recebimento pela equipe. A publicação do frontend e a instalação de um APK novo também são etapas independentes.

## Recursos presentes

- Conversa privada cliente/equipe, persistência, consulta de histórico e mensagens anteriores.
- Texto, fotos, áudio gravado, vídeo MP4/WebM, PDF e TXT (até 25 MB por arquivo).
- Responder citando, copiar texto, apagar a própria mensagem até uma hora com lápide.
- Localização pontual via GPS; visualização de imagens, reprodução de áudio e vídeo.
- Leitura/entrega ao abrir a conversa, presença e digitando em sala privada, atualização em tempo real e polling como recuperação.
- Busca no histórico carregado e caixa de entrada da equipe com busca por nome.
- Estados de carregamento e falha, sem inventar disponibilidade de atendente.

## Ainda não equivale a todas as funções do WhatsApp

Não implementa chamadas de voz/vídeo, grupos, canais públicos, status, listas de transmissão, figurinhas, reações, encaminhamento, edição, mensagens temporárias, sincronização criptográfica multidispositivo nem criptografia de ponta a ponta. A equipe autorizada acessa o conteúdo para atender. Também não há fila persistente offline nem push próprio deste canal; notificações do chat de chamados permanecem separadas. Os marcadores deste canal são coletivos da equipe, não um recibo por atendente.

## Validação executada

`scripts/testes-chat/test-chat-sql.mjs` executa o SQL em PostgreSQL local via PGlite com stubs das funções já existentes de autenticação e equipe. Verifica isolamento entre usuários, acesso da central, proibição de referências cruzadas, leitura, exclusão e política da sala privada. A replicação lógica do Supabase não é executada nesse teste.

`scripts/testes-chat/verificar-interface.mjs` usa dados simulados para verificar a interface em 320, 390 e 600 px, os três cartões do painel, o contador anual (consulta HEAD com valor controlado), botões de 44 px, mensagem enviada, busca e ausência de duplicação no perfil. Capturas e resultados em `output/playwright/ajustes-chat-equipe`.

Após ativar, testar com duas contas reais em dispositivos diferentes: cliente A só acessa sua conversa, cliente B não lê A, atendente autorizado responde a A, demais mecânicos não entram em A, anexos privados não abrem sem autorização e presença/leitura só refletem sessões reais. Não há alegação de validação em produção ou de paridade integral com WhatsApp.

Para repetir: `npm install --prefix scripts/testes-chat`, depois `npm run test:sql --prefix scripts/testes-chat`. Para interface, iniciar `npm run dev:app -- --host 127.0.0.1 --port 5175` e executar `npm run test:ui --prefix scripts/testes-chat`.
