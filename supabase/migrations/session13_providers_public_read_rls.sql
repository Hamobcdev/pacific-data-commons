-- Fix: providers table missing public read policy.
-- PostgREST !inner join applies RLS on joined tables independently.
-- Without this, directory search returns zero results.
CREATE POLICY "providers_public_read"
  ON providers FOR SELECT TO anon
  USING (is_active = true);
