-- ==============================================================================
-- QBIZ KHO PRODUCTION V1 — GATE 7: GOOGLE DRIVE CONNECTION & AUTO BACKUP
-- Spec: CMD_20260925_GOOGLE_LOGIN_AND_DRIVE_AUTO_BACKUP.txt
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- 1. SHOP DRIVE CONNECTIONS TABLE (Per-shop, Server-Authoritative)
CREATE TABLE IF NOT EXISTS public.shop_drive_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google_drive' CHECK (provider IN ('google_drive')),
    google_account_email TEXT NOT NULL,
    encrypted_refresh_token TEXT, -- Token stored server-side only; never returned to client
    drive_folder_id TEXT,
    status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH')),
    auto_backup_enabled BOOLEAN NOT NULL DEFAULT true,
    schedule TEXT NOT NULL DEFAULT 'DAILY_0200',
    timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    last_backup_at TIMESTAMPTZ,
    last_backup_status TEXT CHECK (last_backup_status IN ('SUCCESS', 'FAILED', 'PENDING', 'RUNNING')),
    last_error_code TEXT,
    checksum TEXT,
    connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_shop_drive_connections_shop UNIQUE (shop_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_drive_shop ON public.shop_drive_connections(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_drive_status ON public.shop_drive_connections(status);

-- Enable RLS
ALTER TABLE public.shop_drive_connections ENABLE ROW LEVEL SECURITY;

-- 2. SHOP BACKUP RUNS TABLE (Execution history, audit, and verification)
CREATE TABLE IF NOT EXISTS public.shop_backup_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    run_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (run_type IN ('MANUAL', 'SCHEDULED')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'NEEDS_REAUTH')),
    manifest JSONB DEFAULT '{}'::jsonb,
    record_counts JSONB DEFAULT '{}'::jsonb,
    file_id TEXT,
    file_name TEXT,
    file_size BIGINT DEFAULT 0,
    checksum TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_backup_runs_shop ON public.shop_backup_runs(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_backup_runs_status ON public.shop_backup_runs(status);
CREATE INDEX IF NOT EXISTS idx_shop_backup_runs_created ON public.shop_backup_runs(created_at DESC);

-- Enable RLS
ALTER TABLE public.shop_backup_runs ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR SHOP_DRIVE_CONNECTIONS
-- Helper to check user's role in shop
CREATE OR REPLACE FUNCTION public.check_user_shop_role(p_shop_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE shop_id = p_shop_id
          AND user_id = auth.uid()
          AND status = 'ACTIVE'
          AND role = ANY(p_roles)
    );
$$;

-- SELECT Policy: Only OWNER and MANAGER can view Drive connection metadata (Tokens guarded via RPC)
DROP POLICY IF EXISTS shop_drive_connections_select ON public.shop_drive_connections;
CREATE POLICY shop_drive_connections_select ON public.shop_drive_connections
    FOR SELECT TO authenticated
    USING (public.check_user_shop_role(shop_id, ARRAY['OWNER', 'MANAGER']));

-- INSERT/UPDATE/DELETE Policy: Strictly OWNER of that shop can manage Drive connection
DROP POLICY IF EXISTS shop_drive_connections_insert ON public.shop_drive_connections;
CREATE POLICY shop_drive_connections_insert ON public.shop_drive_connections
    FOR INSERT TO authenticated
    WITH CHECK (public.check_user_shop_role(shop_id, ARRAY['OWNER']));

DROP POLICY IF EXISTS shop_drive_connections_update ON public.shop_drive_connections;
CREATE POLICY shop_drive_connections_update ON public.shop_drive_connections
    FOR UPDATE TO authenticated
    USING (public.check_user_shop_role(shop_id, ARRAY['OWNER']))
    WITH CHECK (public.check_user_shop_role(shop_id, ARRAY['OWNER']));

DROP POLICY IF EXISTS shop_drive_connections_delete ON public.shop_drive_connections;
CREATE POLICY shop_drive_connections_delete ON public.shop_drive_connections
    FOR DELETE TO authenticated
    USING (public.check_user_shop_role(shop_id, ARRAY['OWNER']));

-- 4. RLS POLICIES FOR SHOP_BACKUP_RUNS
-- SELECT Policy: OWNER and MANAGER of that shop
DROP POLICY IF EXISTS shop_backup_runs_select ON public.shop_backup_runs;
CREATE POLICY shop_backup_runs_select ON public.shop_backup_runs
    FOR SELECT TO authenticated
    USING (public.check_user_shop_role(shop_id, ARRAY['OWNER', 'MANAGER']));

-- INSERT Policy: OWNER and MANAGER for manual backup runs
DROP POLICY IF EXISTS shop_backup_runs_insert ON public.shop_backup_runs;
CREATE POLICY shop_backup_runs_insert ON public.shop_backup_runs
    FOR INSERT TO authenticated
    WITH CHECK (public.check_user_shop_role(shop_id, ARRAY['OWNER', 'MANAGER']));

-- UPDATE Policy: OWNER and MANAGER for marking run status
DROP POLICY IF EXISTS shop_backup_runs_update ON public.shop_backup_runs;
CREATE POLICY shop_backup_runs_update ON public.shop_backup_runs
    FOR UPDATE TO authenticated
    USING (public.check_user_shop_role(shop_id, ARRAY['OWNER', 'MANAGER']))
    WITH CHECK (public.check_user_shop_role(shop_id, ARRAY['OWNER', 'MANAGER']));

-- 5. SERVER-AUTHORITATIVE SECURITY DEFINER RPCS (No token leaks)

-- Get Shop Drive Status (Safe projection: NEVER returns refresh token to client)
CREATE OR REPLACE FUNCTION public.get_shop_drive_status(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    conn RECORD;
    is_allowed BOOLEAN;
BEGIN
    -- Check permissions: OWNER or MANAGER required
    is_allowed := public.check_user_shop_role(p_shop_id, ARRAY['OWNER', 'MANAGER']);
    IF NOT is_allowed THEN
        RAISE EXCEPTION 'Từ chối truy cập: Chỉ Chủ cửa hàng hoặc Quản lý mới được xem cấu hình sao lưu.';
    END IF;

    SELECT
        id,
        shop_id,
        provider,
        google_account_email,
        drive_folder_id,
        status,
        auto_backup_enabled,
        schedule,
        timezone,
        last_backup_at,
        last_backup_status,
        last_error_code,
        checksum,
        created_at,
        updated_at
    INTO conn
    FROM public.shop_drive_connections
    WHERE shop_id = p_shop_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'connected', false,
            'status', 'DISCONNECTED',
            'shop_id', p_shop_id
        );
    END IF;

    RETURN jsonb_build_object(
        'connected', (conn.status = 'CONNECTED'),
        'id', conn.id,
        'shop_id', conn.shop_id,
        'provider', conn.provider,
        'google_account_email', conn.google_account_email,
        'drive_folder_id', conn.drive_folder_id,
        'status', conn.status,
        'auto_backup_enabled', conn.auto_backup_enabled,
        'schedule', conn.schedule,
        'timezone', conn.timezone,
        'last_backup_at', conn.last_backup_at,
        'last_backup_status', conn.last_backup_status,
        'last_error_code', conn.last_error_code,
        'checksum', conn.checksum,
        'updated_at', conn.updated_at
    );
END;
$$;

-- Disconnect Google Drive (OWNER only)
CREATE OR REPLACE FUNCTION public.disconnect_shop_drive(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    is_owner BOOLEAN;
BEGIN
    -- Strict check: OWNER only
    is_owner := public.check_user_shop_role(p_shop_id, ARRAY['OWNER']);
    IF NOT is_owner THEN
        RAISE EXCEPTION 'Từ chối truy cập: Chỉ Chủ cửa hàng (OWNER) mới có quyền ngắt kết nối Google Drive.';
    END IF;

    UPDATE public.shop_drive_connections
    SET
        status = 'DISCONNECTED',
        auto_backup_enabled = false,
        encrypted_refresh_token = NULL,
        last_backup_status = NULL,
        last_error_code = NULL,
        updated_at = now()
    WHERE shop_id = p_shop_id;

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', p_shop_id,
        'status', 'DISCONNECTED'
    );
END;
$$;

-- Record a completed backup run and update connection metadata
CREATE OR REPLACE FUNCTION public.record_backup_run(
    p_shop_id UUID,
    p_run_type TEXT,
    p_status TEXT,
    p_file_id TEXT,
    p_file_name TEXT,
    p_file_size BIGINT,
    p_checksum TEXT,
    p_record_counts JSONB,
    p_manifest JSONB,
    p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    is_allowed BOOLEAN;
    new_run_id UUID;
BEGIN
    -- Security check: OWNER or MANAGER
    is_allowed := public.check_user_shop_role(p_shop_id, ARRAY['OWNER', 'MANAGER']);
    IF NOT is_allowed THEN
        RAISE EXCEPTION 'Từ chối truy cập: Cần quyền Quản lý hoặc Chủ shop để ghi nhận sao lưu.';
    END IF;

    -- Insert backup run record
    INSERT INTO public.shop_backup_runs (
        shop_id,
        run_type,
        status,
        manifest,
        record_counts,
        file_id,
        file_name,
        file_size,
        checksum,
        started_at,
        completed_at,
        error_message,
        triggered_by
    ) VALUES (
        p_shop_id,
        p_run_type,
        p_status,
        p_manifest,
        p_record_counts,
        p_file_id,
        p_file_name,
        p_file_size,
        p_checksum,
        now(),
        CASE WHEN p_status IN ('SUCCESS', 'FAILED') THEN now() ELSE NULL END,
        p_error_message,
        auth.uid()
    ) RETURNING id INTO new_run_id;

    -- Update connection status
    IF p_status = 'SUCCESS' THEN
        UPDATE public.shop_drive_connections
        SET
            last_backup_at = now(),
            last_backup_status = 'SUCCESS',
            last_error_code = NULL,
            checksum = p_checksum,
            updated_at = now()
        WHERE shop_id = p_shop_id;
    ELSIF p_status = 'FAILED' THEN
        UPDATE public.shop_drive_connections
        SET
            last_backup_status = 'FAILED',
            last_error_code = p_error_message,
            updated_at = now()
        WHERE shop_id = p_shop_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', new_run_id,
        'status', p_status
    );
END;
$$;

-- Scheduled background backup runner (Called by pg_cron or Edge Function at 02:00 shop time)
CREATE OR REPLACE FUNCTION public.schedule_daily_backups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    shop_rec RECORD;
    queued_count INT := 0;
BEGIN
    FOR shop_rec IN
        SELECT shop_id
        FROM public.shop_drive_connections
        WHERE status = 'CONNECTED'
          AND auto_backup_enabled = true
    LOOP
        INSERT INTO public.shop_backup_runs (
            shop_id,
            run_type,
            status,
            started_at
        ) VALUES (
            shop_rec.shop_id,
            'SCHEDULED',
            'PENDING',
            now()
        );
        queued_count := queued_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'queued_shops', queued_count,
        'timestamp', now()
    );
END;
$$;
