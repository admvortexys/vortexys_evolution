-- =============================================
-- VORTEXYS — Migration v7
-- Corrige UNIQUE constraint em wa_bot_configs.department_id
-- Sem ela, o ON CONFLICT (department_id) falha em runtime
-- =============================================

ALTER TABLE wa_bot_configs
  ADD CONSTRAINT IF NOT EXISTS wa_bot_configs_department_id_key
  UNIQUE (department_id);
