## Mudanças

### 1. Período de realização vai para "Etapa atual" (global)

- Adicionar duas colunas em `configuracao_etapa`: `data_inicio_realizacao` e `data_fim_realizacao` (date, nulláveis).
- Em `/admin/etapa`: adicionar dois campos de data (início/fim) ao lado de etapa/tipo/ano, salvos junto com o resto.
- No editor de roteiro (`app.roteiro.$disciplinaId.$turmaId.tsx`): remover os inputs de data. As datas passam a ser lidas do `configQuery` e exibidas apenas como leitura (badge/linha informativa), já que valem para toda a escola na etapa vigente.
- No PDF (`src/lib/pdf.ts`): usar as datas de `configuracao_etapa` no cabeçalho (em vez das do roteiro). As colunas `data_inicio_realizacao`/`data_fim_realizacao` do `roteiros` deixam de ser preenchidas pela UI (mantidas no schema para não quebrar histórico).

### 2. Editor de roteiro: só subtítulos + tópicos como texto com "-"

Reestrutura o editor para uma lista de subtítulos apenas. Cada subtítulo tem:
- um input para o título (ex.: "Livro 02 — Unidade 2");
- um textarea multilinha onde o professor escreve os tópicos, um por linha, cada linha começando com `-`.

Regras:
- Remover o `<Select>` de tipo (tópico/subtítulo) e o botão "+ Tópico". Sobra só "+ Subtítulo".
- Instrução visível acima da lista: "Escreva cada tópico em uma linha, iniciando com `-`. Não use `*` ou outros símbolos. Use `**texto**` para negrito."
- Validação leve ao digitar/salvar: linhas do textarea que não começarem com `-` (ignorando espaços) recebem `-` automaticamente ou são sinalizadas; qualquer `*` no início de linha é convertido para `-`.

Persistência (mantendo o tipo `ItemRoteiro` atual para não migrar dados):
- Cada subtítulo salvo como `{ tipo: "subtitulo", texto: "<título>" }` seguido de vários `{ tipo: "topico", texto: "<linha sem o '-'>" }`.
- Ao carregar um roteiro existente, agrupar tópicos sob o subtítulo anterior e reconstruir os textareas com linhas `- <texto>`.
- Roteiros antigos continuam abrindo normalmente (mesma estrutura de itens).

### 3. PDF

- Renderiza subtítulos em negrito e cada tópico prefixado com `- ` (já era o comportamento, apenas garantir que `*` residual vire `-`).
- Cabeçalho passa a mostrar o período global vindo de `configuracao_etapa`.

## Detalhes técnicos

- Migração: `ALTER TABLE public.configuracao_etapa ADD COLUMN data_inicio_realizacao date, ADD COLUMN data_fim_realizacao date;` (grants/RLS já existentes cobrem).
- `src/lib/queries.ts` (`configQuery`): passa a devolver também as duas datas.
- `src/routes/_authenticated/admin.etapa.tsx`: dois `<Input type="date">` + mutation atualizada.
- `src/routes/_authenticated/app.roteiro.$disciplinaId.$turmaId.tsx`: remover estado `dIni/dFim`, remover inputs, refatorar `itens` para uma UI baseada em "seções" (subtítulo + textarea), com serialização/deserialização para o formato `ItemRoteiro[]` atual.
- `src/lib/pdf.ts`: ler datas do `cfg`, normalizar `*` → `-` no início de linhas de tópico.
- Sem mudanças em Acompanhamento além de remover qualquer edição de período que exista lá.
