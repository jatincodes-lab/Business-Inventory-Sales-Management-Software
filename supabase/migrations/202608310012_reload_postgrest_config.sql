-- Keep the existing public Data API surface and force PostgREST to rebuild its cache.
alter role authenticator set pgrst.db_schemas = 'public';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
