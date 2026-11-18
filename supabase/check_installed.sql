-- Pacer: which database scripts are installed? Read-only, safe to run any time.
-- Every row should say true. A false row names the script in supabase/ to run (in this order).
select step, script, installed from (values
  ('01', 'student_lessons.sql', to_regclass('public.student_lessons') is not null),
  ('02', 'saved_teacher_lectures.sql', to_regclass('public.saved_teacher_lectures') is not null),
  ('03', 'pacer_cloud_storage.sql', to_regclass('public.teacher_rooms') is not null
        and exists (select 1 from storage.buckets where id = 'pacer-teacher-slides')),
  ('04', 'transparent_slide_images.sql', exists (select 1 from storage.buckets
        where id = 'pacer-teacher-slides' and allowed_mime_types = array['image/jpeg', 'image/webp'])),
  ('05', 'board_collaboration.sql', to_regclass('public.pacer_annotations') is not null
        and exists (select 1 from pg_proc where proname = 'pacer_join_board')),
  ('06', 'room_keys.sql', to_regclass('public.pacer_room_keys') is not null
        and exists (select 1 from pg_proc where proname = 'pacer_register_room_key')),
  ('07', 'annotation_owner_access.sql', exists (select 1 from pg_policies
        where tablename = 'pacer_annotations' and policyname = 'private_annotations' and qual like '%pacer_board_access%')),
  ('08', 'launch_readiness.sql', to_regclass('public.waitlist') is not null
        and exists (select 1 from pg_proc where proname = 'rate_limit_hit')),
  ('09', 'notepad_owner_post.sql', exists (select 1 from pg_proc
        where proname = 'pacer_write_notepad' and prosrc like '%owner := %')),
  ('10', 'room_ai_pause.sql', to_regclass('public.pacer_room_ai_signals') is not null),
  ('11', 'ai_token_budget.sql', exists (select 1 from pg_proc where proname = 'ai_budget_add'))
) as checks(step, script, installed)
order by step;
