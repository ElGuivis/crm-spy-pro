-- Bloqueia o cadastro de novos usuarios no banco (defesa em profundidade).
-- Motivo: acesso restrito ao dono por enquanto. O toggle "Allow new users to
-- sign up" do painel do Supabase Auth tambem deve ficar desligado, mas este
-- trigger vale para qualquer caminho (e-mail, OAuth, admin API, convite).
--
-- Valvula para criar uma conta quando for necessario (dentro de uma transacao):
--   BEGIN;
--   SET LOCAL app.allow_signup = 'on';
--   -- ... criar o usuario ...
--   COMMIT;
--
-- Para reabrir o cadastro de vez:
--   DROP TRIGGER block_new_signups ON auth.users;
--   DROP FUNCTION public.block_new_signups();

CREATE OR REPLACE FUNCTION public.block_new_signups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.allow_signup', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cadastro desativado' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS block_new_signups ON auth.users;
CREATE TRIGGER block_new_signups
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_new_signups();
