
# Sistema de Roteiros de Prova — Colégio Manuelito

Sistema web completo para professores enviarem roteiros de prova por turma/disciplina, com painel admin e exportação de PDF idêntico ao modelo institucional.

> Stack real do template: **TanStack Start + React 19 + TypeScript + Tailwind + shadcn/ui**, com **Lovable Cloud** (Supabase gerenciado) para banco, auth e storage. Tudo em português.

## 1. Backend (Lovable Cloud / Supabase)

Ativar Lovable Cloud e criar uma migration única com:

### Enums
- `app_role` → `'admin' | 'professor'`
- `tipo_avaliacao_enum` → `'parcial' | 'global'`
- `status_roteiro_enum` → `'rascunho' | 'enviado'`

### Tabelas
- `turmas` (id, nome, segmento, ativo, created_at)
- `disciplinas` (id, nome, created_at)
- `turma_disciplina` (id, turma_id, disciplina_id, ordem_exibicao, unique(turma_id, disciplina_id))
- `professores` (id, nome, email unique, user_id → auth.users, ativo, created_at)
- `professor_disciplina_turma` (id, professor_id, disciplina_id, turma_id, unique(professor_id, disciplina_id, turma_id)) — FK composta lógica validada por trigger contra `turma_disciplina`
- `configuracao_etapa` (id int PK check id=1, etapa_atual 1-4, tipo_avaliacao, updated_at) — linha única
- `roteiros` (id, professor_id, disciplina_id, turma_id, etapa, tipo_avaliacao, data_inicio_realizacao, data_fim_realizacao, itens jsonb, observacao, status, created_at, updated_at, unique(disciplina_id, turma_id, etapa, tipo_avaliacao))
- `user_roles` (id, user_id, role, unique(user_id, role)) — padrão obrigatório para roles

### Segurança
- `GRANT`s explícitos para `authenticated` e `service_role` em todas as tabelas do schema public.
- Função `has_role(_user_id, _role)` SECURITY DEFINER.
- Função `current_professor_id()` SECURITY DEFINER que retorna `professores.id` do `auth.uid()`.
- **RLS**:
  - `turmas`, `disciplinas`, `turma_disciplina`, `configuracao_etapa`: SELECT para authenticated; INSERT/UPDATE/DELETE só admin.
  - `professores`, `professor_disciplina_turma`, `user_roles`: leitura própria + admin total.
  - `roteiros`: professor lê/escreve os seus próprios (via `current_professor_id()`) apenas se a combinação (disciplina, turma) existir em `professor_disciplina_turma`; admin acesso total.
  - Trigger em `roteiros` que bloqueia UPDATE quando `etapa`/`tipo_avaliacao` do registro diferem da `configuracao_etapa` atual e o usuário não é admin (regra de "trava histórica").
  - Trigger BEFORE INSERT/UPDATE em `roteiros` copia `etapa` e `tipo_avaliacao` de `configuracao_etapa` na criação (professor não escolhe).

### Seed
- Migration adicional insere `configuracao_etapa` (1, 'parcial') e popula `turmas`, `disciplinas`, `turma_disciplina` a partir da planilha anexada (Infantil 2–5, 1º–5º Ano Fund I, 6º–9º Ano Fund II — 109 vínculos). Ensino Médio fica para o admin cadastrar pela UI.

## 2. Autenticação
- Supabase Auth email/senha (sem cadastro público).
- Admin cria professor pela UI → server function usa `supabaseAdmin.auth.admin.createUser` com senha temporária + `user_roles('professor')` + insere em `professores`. Retorna senha inicial para o admin repassar.
- Usuário admin inicial criado manualmente (documentado no README).
- Layout `_authenticated/` para toda a área logada; `/auth` público.

## 3. Frontend — rotas (TanStack Start)

Estrutura em `src/routes/`:
- `index.tsx` → redireciona para `/auth` ou `/app` conforme sessão.
- `auth.tsx` → login email/senha.
- `_authenticated/route.tsx` → gate (já gerenciado).
- `_authenticated/app.tsx` → layout com header (logo Manuelito, nome, botão sair) + `<Outlet />`.
- `_authenticated/app/index.tsx` → **Home do professor**: card com etapa/tipo atual, lista de disciplinas que leciona, escolha da disciplina → mostra turmas com status do roteiro.
- `_authenticated/app/roteiro.$disciplinaId.$turmaId.tsx` → editor de roteiro (ver §4).
- `_authenticated/admin/route.tsx` → gate extra `has_role('admin')`, com sidebar.
- `_authenticated/admin/etapa.tsx` → configuração da etapa/tipo.
- `_authenticated/admin/turmas.tsx` → CRUD de `turma_disciplina` (drag-to-reorder por turma).
- `_authenticated/admin/professores.tsx` → CRUD de professores + criação de auth user.
- `_authenticated/admin/vinculos.tsx` → CRUD de `professor_disciplina_turma` (selects restritos ao que existe em `turma_disciplina`).
- `_authenticated/admin/acompanhamento.tsx` → matriz turma×disciplina com status; abrir/editar qualquer roteiro; botão "Exportar PDF" por turma.

Componentes shadcn (Card, Tabs, Table, Dialog, Select, Input, Button, DnD via `@dnd-kit/sortable`).

## 4. Editor de roteiro (professor e admin)
- Somente leitura da etapa/tipo (badge no topo).
- Campos: `data_inicio_realizacao`, `data_fim_realizacao`, lista dinâmica de **itens** (`{tipo: 'subtitulo' | 'topico', texto}`) com adicionar, remover, reordenar (drag), e um select por item para alternar tipo. Campo `observacao` opcional.
- Hint visível: "use `**texto**` para negrito inline dentro de tópicos".
- Botões: **Salvar rascunho** e **Enviar roteiro**.
- Se `roteiro.etapa`/`tipo_avaliacao` diferem da config atual → modo leitura (histórico), com aviso.
- Responsivo (mobile-first).

## 5. Geração de PDF — `src/lib/pdf.ts`

Usar **jsPDF** com fonte **Noto Sans** (regular + bold) embarcada via `.addFileToVFS`/`.addFont` para acentuação PT-BR perfeita.

- Página **A4 retrato**, dividida em **duas colunas verticais idênticas** (mesmo conteúdo duplicado lado a lado), cada uma com moldura.
- Cabeçalho por coluna (repete em todas as páginas): logo Manuelito à esquerda + bloco à direita com "COLÉGIO MANUELITO" (bold), segmento em maiúsculo (ex.: "FUNDAMENTAL II"), ano letivo "2026".
- Título centralizado só na 1ª página de cada coluna:
  - `AVALIAÇÕES {PARCIAIS|GLOBAIS} – {N}ª ETAPA`
  - Nome da turma em maiúsculo (`6º ANO`)
  - `REALIZAÇÃO: dd/mm a dd/mm` (ou só uma data)
- Para cada disciplina com roteiro `status='enviado'` na etapa/tipo atual, na ordem `turma_disciplina.ordem_exibicao`:
  - Nome em **NEGRITO CENTRALIZADO MAIÚSCULO**.
  - Itens na ordem: `subtitulo` (bold, sem marcador) ou `topico` (prefixo `- `, com parser inline `**...**` → bold via `getStringUnitWidth`).
  - `OBS: ...` ao final se houver observação.
  - Linha em branco entre disciplinas.
- Motor de layout: mede altura de cada bloco em uma "coluna virtual" da largura de uma metade; se estourar a altura útil, quebra para nova página (ambas as colunas continuam sincronizadas com o mesmo conteúdo).
- Botão de export no painel admin (por turma). Nome do arquivo: `roteiro_{turma_slug}_{n}etapa_{tipo}.pdf`.

## 6. Assets e branding
- Logo Manuelito subido como Lovable Asset e usado no cabeçalho da UI e no PDF (embarcado como PNG base64).
- Design institucional: paleta neutra (fundo claro), tokens semânticos em `src/styles.css` puxando as cores do logo (amarelo #DDEB6B, azul #22C4E5, roxo #7E45A6) para acentos discretos; primary preto/grafite.

## 7. Detalhes técnicos
- Data fetching: TanStack Query + server functions (`createServerFn` + `requireSupabaseAuth`). Loaders só nas rotas `_authenticated/*`.
- Zod para validação de payloads (inclusive shape do `itens` jsonb).
- Nenhuma escolha de etapa/tipo aparece para o professor em nenhum lugar.
- `head()` por rota com títulos apropriados; substituir o placeholder de `/`.

## 8. Entregáveis
1. Migrations (schema + seed a partir da planilha).
2. UI professor (login → home → editor).
3. UI admin (etapa, turmas/currículo, professores, vínculos, acompanhamento).
4. Geração de PDF fiel ao modelo anexado.
5. README curto explicando: como criar o admin inicial, como cadastrar Ensino Médio, e o fluxo de senha temporária de professor.

## Perguntas que assumi (posso ajustar antes de implementar se preferir)
- Ano letivo exibido no cabeçalho: **2026** fixo (posso mover para `configuracao_etapa` se quiser editável).
- Senha temporária ao criar professor: gerada automaticamente e mostrada uma vez ao admin.
- Ensino Médio: **não** seedado (planilha não tem); cadastro pela UI.
