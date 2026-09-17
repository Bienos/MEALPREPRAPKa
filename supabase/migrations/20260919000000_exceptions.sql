-- Exception workflows: ad-hoc food logged outside the plan.
-- Reuses planned_meals rather than adding a parallel log table.

alter table planned_meals drop constraint planned_meals_source_check;

alter table planned_meals
  add constraint planned_meals_source_check
  check (source in ('sheet', 'manual', 'saved_meal', 'quick_add', 'ai_estimate'));

-- Macros that are an estimate rather than a sheet value are shown with "~".
alter table planned_meals
  add column approximate boolean not null default false;
