ALTER TABLE public.instagram_content
  ADD CONSTRAINT instagram_content_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;