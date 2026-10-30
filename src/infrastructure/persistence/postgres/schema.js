// Esquema relacional (idempotente). Equivale a uma migration inicial — pronto para virar Flyway/Liquibase no Java.
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
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_authors_user ON project_authors (user_id);
`;
