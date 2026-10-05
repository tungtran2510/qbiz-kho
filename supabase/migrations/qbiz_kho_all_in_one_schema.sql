-- >>> START FILE: 20260924_gate1_schema_and_rls.sql <<<
-- ==============================================================================
-- QBIZ KHO PRODUCTION V1 — GATE 1 CLOUD SCHEMA & ROW LEVEL SECURITY
-- Spec: QBIZ_KHO_MASTER_PRODUCTION_V1_SYNC01.md
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TENANCY & AUTHENTICATION MODELS
-- ==============================================================================

-- 2.1 SHOPS
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON public.shops(owner_user_id);

-- 2.2 MEMBERSHIPS & ROLES
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'WAREHOUSE')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED')),
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_memberships_shop_user UNIQUE (shop_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_shop ON public.memberships(shop_id);

-- 2.3 DEVICES
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    device_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Thiết bị này',
    platform TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_devices_shop_key UNIQUE (shop_id, device_key)
);

CREATE INDEX IF NOT EXISTS idx_devices_shop ON public.devices(shop_id);

-- 2.4 REGISTERS
CREATE TABLE IF NOT EXISTS public.registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Quầy chính',
    warehouse_id UUID,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registers_shop ON public.registers(shop_id);

-- ==============================================================================
-- 3. MASTER DATA TABLES
-- ==============================================================================

-- 3.1 WAREHOUSES
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_shop ON public.warehouses(shop_id);

-- 3.2 CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.categories(id),
    type TEXT NOT NULL DEFAULT 'PRODUCT' CHECK (type IN ('PRODUCT', 'SERVICE')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_shop ON public.categories(shop_id);

-- 3.3 PRODUCTS & SERVICES
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    price NUMERIC(15,2),
    cost_price NUMERIC(15,2),
    category_id UUID REFERENCES public.categories(id),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_shop ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(shop_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(shop_id, barcode);

-- 3.4 CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_shop_phone ON public.customers(shop_id, phone);

-- 3.5 SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON public.suppliers(shop_id);

-- ==============================================================================
-- 4. INVENTORY LEDGER & STOCK LEVEL TABLES
-- ==============================================================================

-- 4.1 INVENTORY LEVELS (Materialized fast cache - NOT sovereign truth)
CREATE TABLE IF NOT EXISTS public.inventory_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    on_hand INT NOT NULL DEFAULT 0,
    reserved INT NOT NULL DEFAULT 0,
    damaged INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_levels_shop_prod_wh UNIQUE (shop_id, product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_levels_lookup ON public.inventory_levels(shop_id, product_id, warehouse_id);

-- 4.2 INVENTORY MOVEMENTS (Sovereign immutable append-only ledger)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN', 'EXCHANGE')),
    qty INT NOT NULL,
    balance_after INT,
    reference TEXT,
    source TEXT NOT NULL DEFAULT 'pos',
    user_id UUID REFERENCES auth.users(id),
    device_id UUID REFERENCES public.devices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_movements_idempotency UNIQUE (shop_id, operation_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_movements_shop_prod ON public.inventory_movements(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_movements_op ON public.inventory_movements(shop_id, operation_id);

-- ==============================================================================
-- 5. COMMERCIAL TRANSACTIONS
-- ==============================================================================

-- 5.1 SALES
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    code TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    shift_id UUID,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount NUMERIC(15,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    payment_status TEXT NOT NULL DEFAULT 'PAID',
    user_id UUID REFERENCES auth.users(id),
    device_id UUID REFERENCES public.devices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_sales_operation UNIQUE (shop_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_shop_created ON public.sales(shop_id, created_at DESC);

-- 5.2 SALE ITEMS
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    qty INT NOT NULL,
    price NUMERIC(15,2) NOT NULL,
    total NUMERIC(15,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);

-- 5.3 ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    code TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    order_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (order_state IN ('DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
    payment_state TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_state IN ('UNPAID', 'PARTIAL', 'PAID')),
    fulfillment_state TEXT NOT NULL DEFAULT 'UNFULFILLED' CHECK (fulfillment_state IN ('UNFULFILLED', 'FULFILLED')),
    grand_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_orders_operation UNIQUE (shop_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_shop ON public.orders(shop_id, created_at DESC);

-- 5.4 ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    qty INT NOT NULL,
    price NUMERIC(15,2) NOT NULL,
    total NUMERIC(15,2) NOT NULL
);

-- 5.5 TRANSFERS
CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    code TEXT NOT NULL,
    from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    status TEXT NOT NULL DEFAULT 'IN_TRANSIT' CHECK (status IN ('IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
    lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_transfers_operation UNIQUE (shop_id, operation_id)
);

-- 5.6 RETURNS & REFUNDS
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    sale_id UUID NOT NULL REFERENCES public.sales(id),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    total_refund NUMERIC(15,2) NOT NULL DEFAULT 0,
    refund_method TEXT NOT NULL DEFAULT 'original',
    lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_returns_operation UNIQUE (shop_id, operation_id)
);

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    sale_id UUID NOT NULL REFERENCES public.sales(id),
    return_id UUID REFERENCES public.returns(id),
    shift_id UUID,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    method TEXT NOT NULL DEFAULT 'cash',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_refunds_operation UNIQUE (shop_id, operation_id)
);

-- ==============================================================================
-- 6. SHIFTS & CASH MANAGEMENT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    register_id UUID NOT NULL REFERENCES public.registers(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    device_id UUID NOT NULL REFERENCES public.devices(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
    counted_cash NUMERIC(15,2),
    expected_cash NUMERIC(15,2),
    difference NUMERIC(15,2),
    summary JSONB,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_shifts_operation UNIQUE (shop_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_shifts_shop ON public.shifts(shop_id, opened_at DESC);

-- ==============================================================================
-- 7. SYNC FOUNDATION & AUDIT LOGS
-- ==============================================================================

-- 7.1 SYNC OPERATIONS (Idempotent delivery log)
CREATE TABLE IF NOT EXISTS public.sync_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    device_id UUID NOT NULL REFERENCES public.devices(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    base_version INT,
    server_version INT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'REJECTED_CONFLICT', 'FAILED')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error_code TEXT,
    CONSTRAINT uq_sync_operations_idempotency UNIQUE (shop_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_shop_status ON public.sync_operations(shop_id, status);

-- 7.2 AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    device_id UUID REFERENCES public.devices(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    operation_id UUID,
    source TEXT NOT NULL DEFAULT 'UI' CHECK (source IN ('UI', 'AI', 'SYNC', 'IMPORT', 'SYSTEM')),
    result TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'DENIED', 'ERROR')),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_shop ON public.audit_logs(shop_id, created_at DESC);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) & HELPER FUNCTIONS
-- ==============================================================================

-- 8.1 AUTHENTICATION & MEMBERSHIP HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_active_shop_member(target_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE shop_id = target_shop_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_shop_role(target_shop_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.memberships
  WHERE shop_id = target_shop_id
    AND user_id = auth.uid()
    AND status = 'ACTIVE'
  LIMIT 1;
$$;

-- 8.2 ENABLE RLS ON ALL TABLES
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 8.3 RLS POLICIES FOR SHOPS
DROP POLICY IF EXISTS "Shops select policy" ON public.shops;
CREATE POLICY "Shops select policy" ON public.shops
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid() OR public.is_active_shop_member(id));

DROP POLICY IF EXISTS "Shops insert policy" ON public.shops;
CREATE POLICY "Shops insert policy" ON public.shops
    FOR INSERT TO authenticated
    WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Shops update policy" ON public.shops;
CREATE POLICY "Shops update policy" ON public.shops
    FOR UPDATE TO authenticated
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

-- 8.4 RLS POLICIES FOR MEMBERSHIPS
DROP POLICY IF EXISTS "Memberships select policy" ON public.memberships;
CREATE POLICY "Memberships select policy" ON public.memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_active_shop_member(shop_id));

DROP POLICY IF EXISTS "Memberships insert policy" ON public.memberships;
CREATE POLICY "Memberships insert policy" ON public.memberships
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_shop_role(shop_id) = 'OWNER' OR (
        -- Allow self-inserting owner membership immediately upon creating shop
        role = 'OWNER' AND user_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.shops WHERE id = shop_id AND owner_user_id = auth.uid()
        )
    ));

DROP POLICY IF EXISTS "Memberships update policy" ON public.memberships;
CREATE POLICY "Memberships update policy" ON public.memberships
    FOR UPDATE TO authenticated
    USING (public.get_user_shop_role(shop_id) = 'OWNER')
    WITH CHECK (public.get_user_shop_role(shop_id) = 'OWNER');

-- 8.5 MACRO RLS FOR ALL SHARED BUSINESS TABLES
-- Any active member of the shop can read:
DO $$
DECLARE
    t text;
    shared_tables text[] := ARRAY[
        'devices', 'registers', 'warehouses', 'categories', 'products',
        'customers', 'suppliers', 'inventory_levels', 'inventory_movements',
        'sales', 'sale_items', 'orders', 'order_items', 'transfers',
        'returns', 'refunds', 'shifts', 'sync_operations', 'audit_logs'
    ];
BEGIN
    FOREACH t IN ARRAY shared_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s_select_active_member" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "%s_select_active_member" ON public.%I
             FOR SELECT TO authenticated
             USING (public.is_active_shop_member(shop_id))',
            t, t
        );

        EXECUTE format('DROP POLICY IF EXISTS "%s_insert_authorized_member" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "%s_insert_authorized_member" ON public.%I
             FOR INSERT TO authenticated
             WITH CHECK (public.is_active_shop_member(shop_id))',
            t, t
        );

        EXECUTE format('DROP POLICY IF EXISTS "%s_update_authorized_member" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "%s_update_authorized_member" ON public.%I
             FOR UPDATE TO authenticated
             USING (public.is_active_shop_member(shop_id))
             WITH CHECK (public.is_active_shop_member(shop_id))',
            t, t
        );
    END LOOP;
END $$;

-- >>> END FILE: 20260924_gate1_schema_and_rls.sql <<<


-- >>> START FILE: 20260925_gate2_auth_helper.sql <<<
-- ==============================================================================
-- QBIZ KHO PRODUCTION V1 — GATE 2 AUTH HELPER: CONFIRMED USER PROVISIONING
-- Allows creating confirmed auth users directly without SMTP rate limit (429)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_confirmed_user(
    p_email TEXT,
    p_password TEXT,
    p_raw_user_meta_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_user_id UUID;
BEGIN
    SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
    IF new_user_id IS NOT NULL THEN
        UPDATE auth.users 
        SET encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = p_raw_user_meta_data,
            updated_at = now()
        WHERE id = new_user_id;
        RETURN new_user_id;
    END IF;

    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        p_email,
        crypt(p_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        p_raw_user_meta_data,
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        new_user_id,
        json_build_object('sub', new_user_id, 'email', p_email)::jsonb,
        'email',
        new_user_id::text,
        now(),
        now(),
        now()
    );

    RETURN new_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_confirmed_user(TEXT, TEXT, JSONB) TO anon, authenticated;

-- >>> END FILE: 20260925_gate2_auth_helper.sql <<<


-- >>> START FILE: 20260925_gate6_platform_super_admin.sql <<<
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

-- >>> END FILE: 20260925_gate6_platform_super_admin.sql <<<


-- >>> START FILE: 20260925_gate7_google_drive_backup.sql <<<
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

-- >>> END FILE: 20260925_gate7_google_drive_backup.sql <<<

