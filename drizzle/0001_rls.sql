-- Row-level security: defence in depth for tenant isolation.
--
-- The app connects with a privileged role. For tenant work the data-access
-- layer opens a transaction, sets app.user_id / app.org_id with set_config(..., true)
-- and runs SET LOCAL ROLE app_user (src/server/dal/rls.ts). app_user has only the
-- grants below, and every tenant table has policies keyed on those settings,
-- so a query that forgets its org_id filter returns nothing instead of
-- another tenant's rows.

DO $$
BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public, app TO app_user;
--> statement-breakpoint

-- Narrow grants. Billing columns on organizations are deliberately not
-- writable by app_user: only the Stripe webhook (system path) changes them.
GRANT SELECT (id, name, email, image) ON users TO app_user;
--> statement-breakpoint
GRANT SELECT, UPDATE (name) ON organizations TO app_user;
--> statement-breakpoint
GRANT SELECT, DELETE, UPDATE (role) ON memberships TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON invitations TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (name) ON projects TO app_user;
--> statement-breakpoint

CREATE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint

-- SECURITY DEFINER so policies on memberships can consult memberships
-- without recursing into their own policy.
CREATE FUNCTION app.has_role(target_org uuid, roles member_role[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = target_org
        AND m.user_id = app.current_user_id()
        AND m.role = ANY (roles)
    )
  $$;
--> statement-breakpoint
CREATE FUNCTION app.is_member(target_org uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app.has_role(target_org, '{owner,admin,member}') $$;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- organizations: members read their orgs; owners/admins rename. Creating and
-- deleting organisations are system operations, so there is no policy for them.
CREATE POLICY organizations_select ON organizations FOR SELECT TO app_user
  USING (app.is_member(id));
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO app_user
  USING (id = app.current_org_id() AND app.has_role(id, '{owner,admin}'))
  WITH CHECK (id = app.current_org_id() AND app.has_role(id, '{owner,admin}'));
--> statement-breakpoint

-- memberships: members see co-members; owners/admins change roles; anyone may
-- leave. New memberships come only from org creation or accepted invitations.
CREATE POLICY memberships_select ON memberships FOR SELECT TO app_user
  USING (app.is_member(org_id));
--> statement-breakpoint
CREATE POLICY memberships_update ON memberships FOR UPDATE TO app_user
  USING (org_id = app.current_org_id() AND app.has_role(org_id, '{owner,admin}'))
  WITH CHECK (org_id = app.current_org_id() AND app.has_role(org_id, '{owner,admin}'));
--> statement-breakpoint
CREATE POLICY memberships_delete ON memberships FOR DELETE TO app_user
  USING (
    org_id = app.current_org_id()
    AND (app.has_role(org_id, '{owner,admin}') OR user_id = app.current_user_id())
  );
--> statement-breakpoint

-- invitations: owners/admins only.
CREATE POLICY invitations_all ON invitations FOR ALL TO app_user
  USING (org_id = app.current_org_id() AND app.has_role(org_id, '{owner,admin}'))
  WITH CHECK (org_id = app.current_org_id() AND app.has_role(org_id, '{owner,admin}'));
--> statement-breakpoint

-- projects: any member reads and creates within the current org; admins delete.
CREATE POLICY projects_select ON projects FOR SELECT TO app_user
  USING (org_id = app.current_org_id() AND app.is_member(org_id));
--> statement-breakpoint
CREATE POLICY projects_insert ON projects FOR INSERT TO app_user
  WITH CHECK (org_id = app.current_org_id() AND app.is_member(org_id));
--> statement-breakpoint
CREATE POLICY projects_update ON projects FOR UPDATE TO app_user
  USING (org_id = app.current_org_id() AND app.is_member(org_id))
  WITH CHECK (org_id = app.current_org_id() AND app.is_member(org_id));
--> statement-breakpoint
CREATE POLICY projects_delete ON projects FOR DELETE TO app_user
  USING (org_id = app.current_org_id() AND app.has_role(org_id, '{owner,admin}'));
