-- Bootstrap/enable the superadmin `taqim2609` without shipping a default password.
-- Usage (operator only, never commit values):
--   psql "$DATABASE_URL" -v pw="$GRANDPOS_SUPERADMIN_PASSWORD" -f db/bootstrap_superadmin.sql
-- The script refuses empty passwords and never reveals prior hashes.
BEGIN;

\if :{?pw}
\else
  \echo 'ERROR: variable pw is required (pass -v pw="$GRANDPOS_SUPERADMIN_PASSWORD")'
  \quit 1
\endif

-- psql never interpolates variables inside dollar-quoted bodies, so the
-- password is staged in a session GUC first and read back from plpgsql.
SELECT pg_catalog.set_config('grandpos.bootstrap_pw', :'pw', false);

DO $$
BEGIN
  IF length(current_setting('grandpos.bootstrap_pw')) < 12 THEN
    RAISE EXCEPTION 'bootstrap password must be at least 12 characters';
  END IF;
END;
$$;

UPDATE user_credentials c
   SET password_hash = crypt(:'pw', gen_salt('bf', 12)),
       disabled = FALSE,
       bootstrap_required = FALSE,
       updated_at = now()
  FROM users u
 WHERE u.id = c.user_id
   AND u.username = 'taqim2609';

SELECT username, (c.disabled = FALSE AND c.bootstrap_required = FALSE) AS enabled
  FROM users u JOIN user_credentials c ON c.user_id = u.id
 WHERE u.username = 'taqim2609';

COMMIT;
