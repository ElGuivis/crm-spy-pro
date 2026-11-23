-- Fotos dos produtos do Bling copiadas para o nosso Storage (22/11/2026; _shared/bling-images.ts).
-- Bucket PÚBLICO (as fotos aparecem no catálogo do WhatsApp, e-mails e no CRM); só o servidor grava
-- (service_role ignora RLS; sem política de INSERT/UPDATE para anon/authenticated).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
