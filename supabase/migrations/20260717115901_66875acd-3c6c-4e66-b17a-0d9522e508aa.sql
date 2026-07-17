
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'professor');
CREATE TYPE public.tipo_avaliacao_enum AS ENUM ('parcial', 'global');
CREATE TYPE public.status_roteiro_enum AS ENUM ('rascunho', 'enviado');

-- =========================
-- Helper: updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================
-- user_roles
-- =========================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles select self or admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles admin manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================
-- turmas
-- =========================
CREATE TABLE public.turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  segmento text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.turmas TO authenticated;
GRANT ALL ON public.turmas TO service_role;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "turmas read all authenticated" ON public.turmas FOR SELECT TO authenticated USING (true);
CREATE POLICY "turmas admin write" ON public.turmas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- disciplinas
-- =========================
CREATE TABLE public.disciplinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinas TO authenticated;
GRANT ALL ON public.disciplinas TO service_role;
ALTER TABLE public.disciplinas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disciplinas read all authenticated" ON public.disciplinas FOR SELECT TO authenticated USING (true);
CREATE POLICY "disciplinas admin write" ON public.disciplinas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- turma_disciplina
-- =========================
CREATE TABLE public.turma_disciplina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id uuid NOT NULL REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  ordem_exibicao integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turma_id, disciplina_id)
);
CREATE INDEX ON public.turma_disciplina (turma_id, ordem_exibicao);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.turma_disciplina TO authenticated;
GRANT ALL ON public.turma_disciplina TO service_role;
ALTER TABLE public.turma_disciplina ENABLE ROW LEVEL SECURITY;
CREATE POLICY "td read all authenticated" ON public.turma_disciplina FOR SELECT TO authenticated USING (true);
CREATE POLICY "td admin write" ON public.turma_disciplina FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- professores
-- =========================
CREATE TABLE public.professores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professores TO authenticated;
GRANT ALL ON public.professores TO service_role;
ALTER TABLE public.professores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_professor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.professores WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE POLICY "professores read self or admin" ON public.professores FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "professores admin write" ON public.professores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- professor_disciplina_turma
-- =========================
CREATE TABLE public.professor_disciplina_turma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professores(id) ON DELETE CASCADE,
  disciplina_id uuid NOT NULL REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professor_id, disciplina_id, turma_id)
);
CREATE INDEX ON public.professor_disciplina_turma (professor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_disciplina_turma TO authenticated;
GRANT ALL ON public.professor_disciplina_turma TO service_role;
ALTER TABLE public.professor_disciplina_turma ENABLE ROW LEVEL SECURITY;

-- Trigger: só permite vínculo se a combinação existir em turma_disciplina
CREATE OR REPLACE FUNCTION public.validate_pdt_curriculo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.turma_disciplina
    WHERE turma_id = NEW.turma_id AND disciplina_id = NEW.disciplina_id
  ) THEN
    RAISE EXCEPTION 'A combinação turma/disciplina não existe no currículo (turma_disciplina).';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_pdt_curriculo
BEFORE INSERT OR UPDATE ON public.professor_disciplina_turma
FOR EACH ROW EXECUTE FUNCTION public.validate_pdt_curriculo();

CREATE POLICY "pdt read self or admin" ON public.professor_disciplina_turma FOR SELECT TO authenticated
  USING (professor_id = public.current_professor_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pdt admin write" ON public.professor_disciplina_turma FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- configuracao_etapa (singleton)
-- =========================
CREATE TABLE public.configuracao_etapa (
  id integer PRIMARY KEY CHECK (id = 1),
  etapa_atual integer NOT NULL CHECK (etapa_atual BETWEEN 1 AND 4),
  tipo_avaliacao public.tipo_avaliacao_enum NOT NULL,
  ano_letivo integer NOT NULL DEFAULT 2026,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracao_etapa TO authenticated;
GRANT ALL ON public.configuracao_etapa TO service_role;
ALTER TABLE public.configuracao_etapa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config read all authenticated" ON public.configuracao_etapa FOR SELECT TO authenticated USING (true);
CREATE POLICY "config admin write" ON public.configuracao_etapa FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_config_etapa_updated_at BEFORE UPDATE ON public.configuracao_etapa
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- roteiros
-- =========================
CREATE TABLE public.roteiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professores(id) ON DELETE CASCADE,
  disciplina_id uuid NOT NULL REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE RESTRICT,
  etapa integer NOT NULL CHECK (etapa BETWEEN 1 AND 4),
  tipo_avaliacao public.tipo_avaliacao_enum NOT NULL,
  data_inicio_realizacao date,
  data_fim_realizacao date,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacao text,
  status public.status_roteiro_enum NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turma_id, disciplina_id, etapa, tipo_avaliacao)
);
CREATE INDEX ON public.roteiros (turma_id, etapa, tipo_avaliacao);
CREATE INDEX ON public.roteiros (professor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiros TO authenticated;
GRANT ALL ON public.roteiros TO service_role;
ALTER TABLE public.roteiros ENABLE ROW LEVEL SECURITY;

-- Trigger: no INSERT copia etapa/tipo da configuração atual (professor não escolhe)
CREATE OR REPLACE FUNCTION public.roteiros_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.configuracao_etapa%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.configuracao_etapa WHERE id = 1;
  IF cfg IS NULL THEN
    RAISE EXCEPTION 'Configuração de etapa não definida.';
  END IF;
  NEW.etapa := cfg.etapa_atual;
  NEW.tipo_avaliacao := cfg.tipo_avaliacao;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_roteiros_before_insert BEFORE INSERT ON public.roteiros
FOR EACH ROW EXECUTE FUNCTION public.roteiros_before_insert();

-- Trigger: no UPDATE, bloqueia se etapa/tipo diferem da config atual (exceto admin)
CREATE OR REPLACE FUNCTION public.roteiros_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.configuracao_etapa%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.configuracao_etapa WHERE id = 1;
  -- não deixa alterar etapa/tipo manualmente
  NEW.etapa := OLD.etapa;
  NEW.tipo_avaliacao := OLD.tipo_avaliacao;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    IF cfg.etapa_atual <> OLD.etapa OR cfg.tipo_avaliacao <> OLD.tipo_avaliacao THEN
      RAISE EXCEPTION 'Roteiro travado: etapa/tipo de avaliação atual mudaram desde o envio.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_roteiros_before_update BEFORE UPDATE ON public.roteiros
FOR EACH ROW EXECUTE FUNCTION public.roteiros_before_update();

-- Policies: professor lê/escreve os seus, admin tudo
CREATE POLICY "roteiros select" ON public.roteiros FOR SELECT TO authenticated
  USING (professor_id = public.current_professor_id() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roteiros insert" ON public.roteiros FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (
      professor_id = public.current_professor_id()
      AND EXISTS (
        SELECT 1 FROM public.professor_disciplina_turma pdt
        WHERE pdt.professor_id = professor_id
          AND pdt.turma_id = roteiros.turma_id
          AND pdt.disciplina_id = roteiros.disciplina_id
      )
    )
  );

CREATE POLICY "roteiros update" ON public.roteiros FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR professor_id = public.current_professor_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR professor_id = public.current_professor_id()
  );

CREATE POLICY "roteiros delete admin" ON public.roteiros FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Seed configuração inicial
INSERT INTO public.configuracao_etapa (id, etapa_atual, tipo_avaliacao, ano_letivo)
VALUES (1, 1, 'parcial', 2026);
