-- Ensure newly deployed RPCs are immediately available through Supabase REST.
notify pgrst, 'reload schema';
