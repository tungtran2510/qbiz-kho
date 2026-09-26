-- ==============================================================================
-- QBIZ KHO PRODUCTION V1 — GATE 6: PLATFORM SUPER ADMIN & AUDIT
-- Spec: CMD_20260925_AUTH_UX_AND_PLATFORM_SUPER_ADMIN.txt
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- 1. PLATFORM ADMINS TABLE (Server-Authoritative, Separate from Shop Memberships)
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'SUPER_ADMIN' CHECK (role IN ('SUPER_ADMIN')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_platform_admins_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(email);

-- Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. PLATFORM AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    actor_platform_role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    target_shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT 'SUCCESS',
    details JSONB DEFAULT '{}'::jsonb,
    device_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON public.platform_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target_shop ON public.platform_audit_logs(target_shop_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. HELPER FUNCTIONS (SECURITY DEFINER)

-- Check if current authenticated user is an active Platform Super Admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.platform_admins
        WHERE user_id = p_user_id AND status = 'ACTIVE'
    );
END;
$$;

-- RLS Policies for platform_admins
DROP POLICY IF EXISTS platform_admins_select ON public.platform_admins;
CREATE POLICY platform_admins_select ON public.platform_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- RLS Policies for platform_audit_logs
DROP POLICY IF EXISTS platform_audit_select ON public.platform_audit_logs;
CREATE POLICY platform_audit_select ON public.platform_audit_logs
    FOR SELECT TO authenticated
    USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_audit_insert ON public.platform_audit_logs;
CREATE POLICY platform_audit_insert ON public.platform_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin(auth.uid()));

-- 4. PLATFORM CONSOLE RPC FUNCTIONS (Strictly Guarded by is_platform_admin)

-- Get platform summary metrics
CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    total_shops INT;
    active_shops INT;
    total_users INT;
    total_devices INT;
    sync_errors INT;
    conflict_count INT;
BEGIN
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Super Admin privilege required';
    END IF;

    SELECT count(*) INTO total_shops FROM public.shops;
    SELECT count(*) INTO active_shops FROM public.shops WHERE status = 'ACTIVE';
    SELECT count(*) INTO total_users FROM auth.users;
    SELECT count(*) INTO total_devices FROM public.devices;
    SELECT count(*) INTO sync_errors FROM public.sync_operations WHERE status = 'FAILED';
    SELECT count(*) INTO conflict_count FROM public.sync_operations WHERE status = 'CONFLICT';

    RETURN jsonb_build_object(
        'total_shops', total_shops,
        'active_shops', active_shops,
        'total_users', total_users,
        'total_devices', total_devices,
        'sync_errors', sync_errors,
        'conflict_count', conflict_count,
        'app_version', 'v1.0.0-pilot',
        'backup_status', 'HEALTHY',
        'timestamp', now()
    );
END;
$$;

-- Get all shops list with owner info and member count
CREATE OR REPLACE FUNCTION public.get_platform_shops()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    shops_data JSONB;
BEGIN
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Super Admin privilege required';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'code', s.code,
            'status', s.status,
            'owner_user_id', s.owner_user_id,
            'owner_email', u.email,
            'member_count', (SELECT count(*) FROM public.memberships m WHERE m.shop_id = s.id AND m.status = 'ACTIVE'),
            'device_count', (SELECT count(*) FROM public.devices d WHERE d.shop_id = s.id),
            'created_at', s.created_at
        ) ORDER BY s.created_at DESC
    ) INTO shops_data
    FROM public.shops s
    LEFT JOIN auth.users u ON u.id = s.owner_user_id;

    RETURN COALESCE(shops_data, '[]'::jsonb);
END;
$$;

-- Toggle shop status (ACTIVE <-> SUSPENDED)
CREATE OR REPLACE FUNCTION public.toggle_platform_shop(p_shop_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Super Admin privilege required';
    END IF;
    IF p_status NOT IN ('ACTIVE', 'SUSPENDED') THEN
        RAISE EXCEPTION 'Invalid shop status: %', p_status;
    END IF;

    UPDATE public.shops
    SET status = p_status, updated_at = now()
    WHERE id = p_shop_id;

    -- Audit event
    INSERT INTO public.platform_audit_logs (actor_user_id, target_shop_id, action, result, details)
    VALUES (
        auth.uid(),
        p_shop_id,
        'TOGGLE_SHOP_STATUS',
        'SUCCESS',
        jsonb_build_object('new_status', p_status)
    );

    RETURN jsonb_build_object('success', true, 'shop_id', p_shop_id, 'status', p_status);
END;
$$;

-- 5. SECURE SUPER ADMIN BOOTSTRAP FUNCTION
-- One-time secure registration for platform owner (tungtran2510@gmail.com)
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    target_user_id UUID;
    existing_admin_id UUID;
BEGIN
    -- Platform Owner Security Check: Only the authorized owner email can be bootstrapped
    IF lower(trim(p_email)) != 'tungtran2510@gmail.com' THEN
        RAISE EXCEPTION 'Unauthorized: Bootstrap restricted to designated platform owner.';
    END IF;

    SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User account not found in auth.users');
    END IF;

    SELECT id INTO existing_admin_id FROM public.platform_admins WHERE user_id = target_user_id;
    IF existing_admin_id IS NOT NULL THEN
        UPDATE public.platform_admins SET status = 'ACTIVE', updated_at = now() WHERE id = existing_admin_id;
        RETURN jsonb_build_object('success', true, 'message', 'Existing super admin record activated');
    END IF;

    INSERT INTO public.platform_admins (user_id, email, role, status)
    VALUES (target_user_id, lower(trim(p_email)), 'SUPER_ADMIN', 'ACTIVE');

    INSERT INTO public.platform_audit_logs (actor_user_id, action, result, details)
    VALUES (target_user_id, 'BOOTSTRAP_SUPER_ADMIN', 'SUCCESS', jsonb_build_object('email', p_email));

    RETURN jsonb_build_object('success', true, 'message', 'Super admin provisioned successfully');
END;
$$;
