## Objetivo

Ajustar o gerador de PDF (`src/lib/pdf.ts`) para o cabeçalho e o espaçamento entre disciplinas ficarem iguais aos modelos anexados.

## Mudanças em `src/lib/pdf.ts`

### 1. Remover a linha divisória do cabeçalho
Em `drawColumn`, apagar o bloco:
```
doc.setLineWidth(0.2);
doc.line(colX + PAD, TOP + HEADER_H - 2, colX + COL_W - PAD, TOP + HEADER_H - 2);
```
O `HEADER_H` continua igual, então o espaço em branco abaixo do cabeçalho é preservado.

### 2. Cabeçalho: nome maior + quebra inteligente do segmento
- "COLÉGIO MANUELITO" passa de 10pt para ~11.5pt (bold).
- Calcular a largura disponível: `availW = colX + COL_W - PAD - textX`.
- Medir o segmento em maiúsculas com `doc.getTextWidth` a 9pt:
  - **Cabe em uma linha:** linha 2 = segmento, linha 3 = ano letivo (comportamento atual).
  - **Não cabe:** usar `doc.splitTextToSize(segmento, availW)` e desenhar as duas primeiras linhas nas posições 2 e 3, **sem** o ano letivo.
- Se o segmento quebrado gerar mais de 2 linhas, reduzir levemente a fonte (ex.: 8pt) para caber em duas.

### 3. Espaçamento entre disciplinas
Em `buildBlocksForDisciplina`, o espaçador final passa de `height: 3` para `height: 7`.

## Verificação

Gerar PDFs de teste para uma turma de cada segmento (Infantil, Fundamental II, Fundamental I / 5º ano), converter as páginas em imagem e comparar visualmente com os três modelos anexados — conferindo que:
- não há linha sob o cabeçalho;
- "EDUCAÇÃO INFANTIL" quebra em duas linhas e não mostra o ano;
- "FUNDAMENTAL II" fica em uma linha e mostra o ano;
- o respiro entre blocos de disciplina é claramente maior que o entrelinhas.

Ajustar os números (tamanho da fonte e altura do espaçador) até bater com o modelo.

## Fora de escopo

Nenhuma mudança em banco de dados, telas ou conteúdo dos roteiros.