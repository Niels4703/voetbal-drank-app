-- Adds a shared guest count per match date.
-- Run this once in Supabase SQL Editor.
ALTER TABLE public.match_settings
  ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0
  CHECK (guest_count >= 0);

-- Keep the existing group/date settings row available for the app.
INSERT INTO public.match_settings (group_id, next_match_date, current_status, guest_count)
VALUES ('vriendengroep', CURRENT_DATE, 'open', 0)
ON CONFLICT (group_id) DO NOTHING;
