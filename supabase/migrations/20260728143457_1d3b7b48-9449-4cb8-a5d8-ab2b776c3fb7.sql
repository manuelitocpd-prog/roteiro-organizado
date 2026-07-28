ALTER TABLE public.configuracao_etapa ADD COLUMN IF NOT EXISTS segmento text;

ALTER TABLE public.configuracao_etapa DROP CONSTRAINT IF EXISTS configuracao_etapa_id_check;

UPDATE public.configuracao_etapa SET segmento = 'Educação Infantil' WHERE id = 1;

INSERT INTO public.configuracao_etapa (id, etapa_atual, tipo_avaliacao, ano_letivo, data_inicio_realizacao, data_fim_realizacao, segmento)
SELECT 2, etapa_atual, tipo_avaliacao, ano_letivo, data_inicio_realizacao, data_fim_realizacao, 'Fundamental I' FROM public.configuracao_etapa WHERE id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.configuracao_etapa (id, etapa_atual, tipo_avaliacao, ano_letivo, data_inicio_realizacao, data_fim_realizacao, segmento)
SELECT 3, etapa_atual, tipo_avaliacao, ano_letivo, data_inicio_realizacao, data_fim_realizacao, 'Fundamental II' FROM public.configuracao_etapa WHERE id = 1
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracao_etapa ALTER COLUMN segmento SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS configuracao_etapa_segmento_key ON public.configuracao_etapa (segmento);

CREATE OR REPLACE FUNCTION public.roteiros_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.configuracao_etapa%ROWTYPE;
  seg text;
BEGIN
  SELECT t.segmento INTO seg FROM public.turmas t WHERE t.id = NEW.turma_id;
  SELECT * INTO cfg FROM public.configuracao_etapa WHERE segmento = seg;
  IF cfg IS NULL THEN
    RAISE EXCEPTION 'Configuração de etapa não definida para o segmento %.', seg;
  END IF;
  NEW.etapa := cfg.etapa_atual;
  NEW.tipo_avaliacao := cfg.tipo_avaliacao;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.roteiros_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.configuracao_etapa%ROWTYPE;
  seg text;
BEGIN
  SELECT t.segmento INTO seg FROM public.turmas t WHERE t.id = OLD.turma_id;
  SELECT * INTO cfg FROM public.configuracao_etapa WHERE segmento = seg;
  NEW.etapa := OLD.etapa;
  NEW.tipo_avaliacao := OLD.tipo_avaliacao;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    IF cfg IS NULL OR cfg.etapa_atual <> OLD.etapa OR cfg.tipo_avaliacao <> OLD.tipo_avaliacao THEN
      RAISE EXCEPTION 'Roteiro travado: etapa/tipo de avaliação atual mudaram desde o envio.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;