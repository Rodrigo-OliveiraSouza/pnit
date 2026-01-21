INSERT INTO app_users (
  id,
  cognito_sub,
  email,
  role,
  status,
  full_name,
  phone,
  organization,
  city,
  state,
  territory,
  access_reason,
  password_hash,
  password_salt
)
SELECT
  gen_random_uuid(),
  gen_random_uuid(),
  'admin@infinity',
  'admin',
  'active',
  'Administrador',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'seeded admin',
  'ipIYrIMVUqNQr2N3j2Z5uj9NfP7tOU7qUalUG/LUlrk=',
  'tkS00ISDt8wXCcpT8MxEEQ=='
WHERE NOT EXISTS (
  SELECT 1 FROM app_users WHERE email = 'admin@infinity'
);
