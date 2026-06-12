-- ============================================================================
-- 0012_growth_scale_5.sql
-- Coaches rate each growth dimension out of 5 (a 1–5 scale is natural to judge),
-- not 0–100. The report/generation already normalizes score/max×100, so the HBA
-- Growth Index stays on the /100 scale — only the input scale changes.
-- Existing assessment_scores keep their own copied max_score, so old data still
-- normalizes correctly.
-- ============================================================================

update public.marking_criteria c
set max_score = 5
from public.marking_schemes s
where c.scheme_id = s.id and s.is_active and c.max_score = 100;
