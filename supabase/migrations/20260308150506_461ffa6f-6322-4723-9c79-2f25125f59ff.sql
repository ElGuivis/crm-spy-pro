
-- Fix threads: set tenant_id from their channel
UPDATE instagram_threads t
SET tenant_id = c.tenant_id
FROM instagram_channels c
WHERE c.id = t.channel_id AND t.tenant_id != c.tenant_id;

-- Fix contacts: set tenant_id from their channel
UPDATE instagram_contacts ct
SET tenant_id = c.tenant_id
FROM instagram_channels c
WHERE c.id = ct.channel_id AND ct.tenant_id != c.tenant_id;

-- Fix messages: set tenant_id from their thread's channel
UPDATE instagram_messages m
SET tenant_id = c.tenant_id
FROM instagram_threads t
JOIN instagram_channels c ON c.id = t.channel_id
WHERE t.id = m.thread_id AND m.tenant_id != c.tenant_id;
