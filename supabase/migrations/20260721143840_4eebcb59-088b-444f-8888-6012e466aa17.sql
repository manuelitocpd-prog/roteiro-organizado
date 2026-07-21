ALTER TABLE public.configuracao_etapa
  ADD COLUMN IF NOT EXISTS data_inicio_realizacao date,
  ADD COLUMN IF NOT EXISTS data_fim_realizacao date;