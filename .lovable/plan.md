## Objetivo

Permitir que o admin salve/envie roteiros **em nome de um professor**, escolhendo qual professor entre os vinculados àquela disciplina+turma.

## Mudanças

### 1. `src/routes/_authenticated/app.roteiro.$disciplinaId.$turmaId.tsx`

- Adicionar query nova (só quando `isAdmin`) que busca em `professor_disciplina_turma` os professores vinculados àquela `disciplina_id` + `turma_id`, com join em `professores(id, nome)`.
- Novo estado local `selectedProfessorId`.
- Renderizar, **apenas para admin**, um `Select` (shadcn) no topo do card com o label "Enviando em nome de" e as opções vindas da query. Se houver só um professor vinculado, pré-seleciona; se não houver nenhum, mostra aviso "Nenhum professor vinculado a esta disciplina/turma" e desabilita salvar.
- Quando `existing` (roteiro já salvo) carrega, se admin, inicializar `selectedProfessorId` com `existing.professor_id`.
- No `save.mutationFn`:
  - `const effectiveProfessorId = isAdmin ? selectedProfessorId : professorId;`
  - Se `!effectiveProfessorId`, `throw new Error("Selecione o professor.")`.
  - Usar `effectiveProfessorId` no `professor_id` do payload (tanto insert quanto update).
- Desabilitar os botões "Salvar rascunho" / "Enviar roteiro" quando admin sem professor selecionado.

### 2. Query para carregar `existing` (admin)

Hoje o `queryFn` de `existing` filtra por disciplina+turma+etapa+tipo e usa `maybeSingle()`. Para professor comum isso está correto (RLS restringe aos próprios). Para admin, o admin vê todos — se dois professores enviaram roteiro para a mesma disciplina/turma/etapa, `maybeSingle` quebra. Ajuste:
- Quando `isAdmin`, filtrar também por `professor_id = selectedProfessorId` (recarregando a query ao trocar de professor via inclusão do id na `queryKey`).
- Enquanto o admin não escolhe professor, não carrega roteiro existente (fica como "novo").

### 3. RLS de `roteiros`

Verificar que as policies de INSERT/UPDATE permitem admin gravar com `professor_id` diferente do seu próprio `auth.uid()`. Se as policies atuais usam `professor_id = current_professor_id()` sem cláusula OR para `has_role(auth.uid(),'admin')`, adicionar essa cláusula via migração. (Vou confirmar lendo as policies antes de escrever a migração — se já existir cláusula admin, pulo esta etapa.)

### 4. Trigger `roteiros_before_update`

Já existe cláusula `IF NOT public.has_role(auth.uid(),'admin')`, então admin pode atualizar mesmo se a etapa mudou. OK, sem mudança.

## Fora de escopo

- Não muda schema de `roteiros` (professor_id continua NOT NULL, correto).
- Não muda editor para professor comum (mesmo comportamento).
- Não muda PDF nem acompanhamento.

## Detalhes técnicos

- Novo `queryKey` do seletor: `["pdt-professores", disciplinaId, turmaId]`.
- Novo `queryKey` do existing quando admin: inclui `selectedProfessorId`.
- UI usa `Select` do shadcn já disponível no projeto.