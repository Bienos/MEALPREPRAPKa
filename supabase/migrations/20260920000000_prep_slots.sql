-- A prep now targets one meal of the day, so breakfast and supper can be
-- batch-cooked separately instead of everything being lunch/dinner.
-- Existing sessions were all dinner preps, which is what the default records.
alter table prep_sessions add column slot text not null default 'obiad';

alter table prep_sessions
  add constraint prep_sessions_slot_check check (slot in ('sniadanie', 'obiad', 'kolacja'));
