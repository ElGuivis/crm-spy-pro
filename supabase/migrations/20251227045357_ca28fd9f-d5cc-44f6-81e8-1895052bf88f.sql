-- Create table for email SMTP integrations
CREATE TABLE public.email_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for access (public for now, can be restricted later)
CREATE POLICY "Allow all access to email_integrations" 
ON public.email_integrations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_email_integrations_updated_at
BEFORE UPDATE ON public.email_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();