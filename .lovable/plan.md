## Mudança

Substituir o editor atual de subtítulos + tópicos por um **único campo de texto livre** (corpo principal) com uma **barra de formatação simples**: negrito, itálico e sublinhado. Atualizar as instruções acima do campo.

## Editor de roteiro

Em `src/routes/_authenticated/app.roteiro.$disciplinaId.$turmaId.tsx`:

- Remover toda a UI de "seções" (subtítulos + textareas), incluindo `SortableSection`, DnD, botão "+ Subtítulo", helpers `sectionsToItens` / `itensToSections` / `normalizeTopicos`.
- Colocar um único editor rich-text (contentEditable) ocupando o espaço principal, com toolbar acima contendo três botões:
  - **N** (negrito)
  - *I* (itálico)
  - **U** (sublinhado)
- Atalhos de teclado padrão do navegador (Ctrl/Cmd+B/I/U) continuam funcionando.
- Sem listas, sem cores, sem títulos — só as três formatações pedidas.

## Instruções (bloco azul acima do editor)

Substituir por:

> **Como preencher**
> Escreva o conteúdo da prova no campo abaixo. Use os botões da barra para aplicar **negrito**, *itálico* ou sublinhado ao texto selecionado.

## Persistência

Manter o schema atual (`roteiros.itens jsonb`) sem migração:

- Salvar o HTML do editor como um único item: `[{ tipo: "subtitulo", texto: "<html>" }]` — reaproveita a coluna existente sem alterar tipos. (Alternativa considerada: adicionar `{ tipo: "html", texto }` ao union `ItemRoteiro`; fica como opção se você preferir tipagem explícita — diga qual prefere.)
- Ao carregar um roteiro existente:
  - Se `itens` tiver um único item com HTML, carrega direto no editor.
  - Se for o formato antigo (subtítulos + tópicos em texto puro), converter para HTML na abertura: cada subtítulo vira `<p><strong>…</strong></p>` e cada tópico vira `<p>- …</p>`, preservando `**negrito**` → `<strong>`. Assim roteiros antigos continuam abrindo sem perda.

## PDF (`src/lib/pdf.ts`)

- Passar a receber o HTML de cada disciplina e renderizar parágrafo a parágrafo, respeitando `<strong>`, `<em>` e `<u>` (jsPDF: alternar fonte bold/italic e desenhar linha sob o texto para sublinhado).
- Layout de duas colunas, cabeçalho e ordem das disciplinas permanecem iguais.
- Compatibilidade com roteiros antigos: se `itens` vier no formato legado, converter para HTML equivalente antes de renderizar (mesma função do editor).

## Fora de escopo

- Sem mudanças em Admin/Etapa, Acompanhamento, schema do banco, autenticação ou vínculos.
- Sem imagens, links, listas ou tabelas no editor — só B/I/U.
