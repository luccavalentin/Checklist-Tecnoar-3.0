# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clientes que solicitam socorro mecânico para caminhões e mecânicos que recebem e executam os atendimentos. A central acompanha a operação pela interface web.

## Product Purpose

Permitir pedir socorro, receber a confirmação do aceite, acompanhar o deslocamento e conversar com o responsável pelo atendimento.

## Operating Context

Uso pelo celular em situação de urgência na estrada. O cliente confirma a localização do caminhão; o mecânico precisa encontrar esse ponto. Conectividade e precisão de GPS podem variar.

## Capabilities and Constraints

O projeto existente contém jornadas de cliente e equipe, chamados, localização, conversa, orçamento e histórico. A documentação em docs/produtos-sos diferencia capacidades propostas de comportamento já implementado. O redesign deve preservar as funções existentes e não apresentar estimativas, aceite ou posição sem dados confirmados. Há alterações locais pré-existentes que devem ser preservadas.

## Brand Commitments

SOS Tecnoar. Preservar os arquivos oficiais de marca, tons e cores originais do cliente. O usuário solicitou aparência sofisticada, profissional e moderna com elementos 3D de destaque, motion, efeitos e cuidado com a experiência do usuário; autorizou colaboração com agentes e geração de imagens.

## Evidence on Hand

Código em app/src, identidade em design e documentação em docs/produtos-sos. O arquivo design/SOS-TECNOAR-PROMPTS-REDESIGN-3D.md reúne propostas de prompts, não telas aprovadas nem funcionalidades confirmadas.

O usuário forneceu LOGOS TECNOAR.pdf e LOGOS TECNOAR.cdr (1).zip em 22/10/2026, como referência principal de marca. O PDF apresenta versões para fundos escuro e claro e monocromática. O usuário reforçou imagens ultrarrealistas e elementos em 3D.

## Product Principles

- Facilitar a solicitação de ajuda com pouca digitação.
- Distinguir busca, aceite, preparação e deslocamento.
- Dar acesso claro ao acompanhamento e à conversa.
- Manter informações legíveis durante o uso real na estrada.
- Construir identidade visual consistente entre cliente e equipe.

## Design Decision

O usuário autorizou a implementação em 22/10/2026 após receber os conceitos e assets. Aplicar identidade original, imagens ultrarrealistas, elementos 3D e motion. A primeira implementação cobre início do cliente, acompanhamento, painel e alerta do mecânico e componentes de interação compartilhados. Outras telas herdam controles e tipografia; não foram todas recompostas individualmente.
