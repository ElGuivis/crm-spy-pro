
ALTER TABLE public.bulk_campaigns
ADD COLUMN sending_schedule JSONB DEFAULT NULL;

COMMENT ON COLUMN public.bulk_campaigns.sending_schedule IS 'JSON with day-of-week sending windows, e.g. {"1":{"start":"09:00","end":"18:00"},"2":{"start":"09:00","end":"18:00"}} where keys are 0=Sun..6=Sat';
