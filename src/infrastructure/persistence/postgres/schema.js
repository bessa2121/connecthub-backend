// Esquema relacional (idempotente: roda a cada start). Equivale a uma migration inicial — pronto para virar Flyway/Liquibase.
// As colunas novas usam ADD COLUMN IF NOT EXISTS, então bancos já em produção são atualizados sem perder dados.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  course text NOT NULL,
  year text NOT NULL,
  bio text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS about text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'STUDENT';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';

-- Solicitação pública de acesso (não é conta).
CREATE TABLE IF NOT EXISTS registration_requests (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  institution text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','USED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz
);
-- No máximo uma solicitação "viva" por e-mail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_requests_live_email ON registration_requests (email) WHERE status IN ('PENDING','APPROVED');
CREATE INDEX IF NOT EXISTS idx_requests_status_created ON registration_requests (status, created_at DESC);

-- Autorização para criar UMA conta (uso único).
CREATE TABLE IF NOT EXISTS registration_authorizations (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES registration_requests(id) ON DELETE CASCADE,
  email text NOT NULL,
  institution text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED','USED','REVOKED')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL
);
-- Um e-mail só pode ter uma autorização ativa OU consumida (revogadas ficam no histórico).
CREATE UNIQUE INDEX IF NOT EXISTS uq_authorizations_email_active ON registration_authorizations (email) WHERE status IN ('APPROVED','USED');

-- Confirmação de e-mail: só o hash do código é guardado.
CREATE TABLE IF NOT EXISTS email_verifications (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz
);

-- Auditoria administrativa (guarda ids, não dados pessoais).
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  summary text NOT NULL,
  description text NOT NULL DEFAULT '',
  course text NOT NULL,
  year text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  link text NOT NULL DEFAULT '',
  featured boolean NOT NULL DEFAULT false,
  hue integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS project_authors (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS project_likes (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS images (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_authors_user ON project_authors (user_id);
CREATE INDEX IF NOT EXISTS idx_project_likes_user ON project_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images (owner_id);
`;
