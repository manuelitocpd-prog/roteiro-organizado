# Roteiros de Prova — Colégio Manuelito

Sistema interno para professores enviarem roteiros de prova e a coordenação exportar PDFs por turma seguindo o layout institucional.

## Primeiro acesso — criando o admin

O sistema não tem cadastro público. Para criar o primeiro admin:

1. Peça a um usuário (com o email que será do admin) para entrar em `/auth`. Como não há senha ainda, use o painel de Cloud Auth → **Users** → **Add user** → *email/password* → marque "auto confirm". Anote a senha.
2. Depois, no editor de banco (Cloud → Users → SQL), rode:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'seuemail@colegiomanuelito.com'
   ON CONFLICT DO NOTHING;
   ```

3. Faça login em `/auth`. Após o login, o botão **Painel Admin** aparece no topo.

## Fluxo diário

- **Admin**: configura a etapa (`Painel Admin → Etapa atual`), define currículo por turma, cadastra professores (cada um recebe senha inicial gerada), cria vínculos e acompanha os envios.
- **Professor**: entra com email/senha, vê sua etapa atual, escolhe disciplina e turma, preenche o roteiro (subtítulos e tópicos, com `**negrito**` inline) e envia.
- **Exportar PDF**: na aba **Acompanhamento**, botão `PDF` por turma gera o PDF em A4 com duas colunas idênticas (para cortar ao meio e distribuir).

## Ensino Médio

Não veio no seed inicial. Cadastre pelo `Currículo por turma` (criar turma → adicionar disciplinas).
