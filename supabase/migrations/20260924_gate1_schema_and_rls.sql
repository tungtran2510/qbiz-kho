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
