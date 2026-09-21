-- Trigger-only identity provisioning. The function owner retains the trusted
-- execution path used by auth.users triggers; API roles must not call it as
-- an exposed RPC.
alter function public.handle_new_auth_user()
  set search_path = pg_catalog, public;

revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.handle_new_auth_user() from authenticated;
