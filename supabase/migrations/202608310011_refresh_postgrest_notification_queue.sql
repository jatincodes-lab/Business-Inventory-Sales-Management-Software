-- Refresh the notification queue before asking PostgREST to rebuild its schema cache.
select pg_notification_queue_usage();
notify pgrst, 'reload schema';
