## Objetivo

Hoje existe **uma única configuração global** (etapa, tipo de avaliação, ano letivo e período de realização) na tabela `configuracao_etapa` (1 linha, id=1). Vamos passar a ter **uma configuração por segmento**, para que cada segmento possa ter datas de prova (e até etapa/tipo) diferentes.

Segmentos existentes nas turmas: `Educação Infantil`, `Fundamental I`, `Fundamental II` (exibidos na tela como "Educação Infantil", "Ensino Fundamental I", "Ensino Fundamental II").

## Banco de dados (migração)

1. Adicionar coluna `segmento` em `configuracao_etapa`, com índice único por segmento.
2. Migrar a linha atual (etapa 3, global, 21/09–25/09) para os três segmentos, criando as três linhas com os mesmos valores atuais — nada muda visualmente até o admin editar.
3. Atualizar as funções de gatilho `roteiros_before_insert` e `roteiros_before_update`: em vez de ler sempre a linha id=1, elas passam a ler a configuração do segmento da turma do roteiro (via `turmas.segmento`). A regra de travamento (roteiro fica só-leitura para o professor quando etapa/tipo mudam) continua igual, mas agora por segmento.
4. Manter as permissões atuais: leitura para qualquer usuário autenticado, escrita apenas para admin.

## Tela "Etapa atual" (admin)

- Passa a ter 3 abas: Educação Infantil / Ensino Fundamental I / Ensino Fundamental II.
- Cada aba tem o mesmo formulário de hoje (etapa, tipo de avaliação, ano letivo, início e fim da realização) e um botão "Salvar" que grava só aquele segmento.
- Um resumo no topo mostrando, lado a lado, a etapa/tipo/período de cada segmento, para conferência rápida.

## Onde a configuração é consumida

- **Painel do professor** (`app.index`) e **editor de roteiro**: passam a mostrar a etapa/tipo/período do segmento da turma daquela disciplina, em vez do valor global.
- **Acompanhamento (admin)** e **geração de PDF**: o cabeçalho de cada turma usa as datas do segmento daquela turma; o filtro de roteiros da etapa atual também passa a considerar a etapa do segmento correspondente.

## Detalhes técnicos

- `src/lib/queries.ts`: `configQuery` retorna a lista de configurações (todas as linhas) em vez de uma única; adiciono um helper `configPorSegmento(cfgs, segmento)`.
- Arquivos afetados: `src/lib/queries.ts`, `src/routes/_authenticated/admin.etapa.tsx`, `admin.acompanhamento.tsx`, `app.index.tsx`, `app.roteiro.$disciplinaId.$turmaId.tsx`.
- `src/lib/pdf.ts` não muda de assinatura — continua recebendo as datas por parâmetro, agora vindas do segmento.
