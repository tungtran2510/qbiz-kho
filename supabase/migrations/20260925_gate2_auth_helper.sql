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
