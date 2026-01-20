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
  'z1Yd38w2yx2FFMTlKkrqGEE8H/Wiw4EWKL4FkKbr3xg=',
  'epEU2WMvB4yENy7ZFbszIw=='
WHERE NOT EXISTS (
  SELECT 1 FROM app_users WHERE email = 'admin@infinity'
);
