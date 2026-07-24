-- Corrige o advisor function_search_path_mutable sem alterar corpo, grants ou triggers.
alter function public.set_updated_at() set search_path = '';
