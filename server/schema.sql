-- Skema PostgreSQL (dari blueprint). Pakai ini saat memindahkan penyimpanan dari db.json ke PostgreSQL.
-- Ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabel Tenant (Pemilik Bisnis / Perusahaan Rental Photobooth)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    subdomain VARCHAR(80) UNIQUE NOT NULL,
    subscription_plan VARCHAR(50) DEFAULT 'ENTERPRISE',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Branch / Cabang / Event
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    address TEXT,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Kiosks (Mesin Fisik Photobooth di Lapangan)
CREATE TABLE kiosks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    kiosk_code VARCHAR(50) UNIQUE NOT NULL, -- Contoh: "Bingkis Kaca 1"
    machine_hardware_id VARCHAR(100) UNIQUE NOT NULL,
    jwt_secret_hash VARCHAR(255) NOT NULL,
    operating_system VARCHAR(80) DEFAULT 'Windows 11 IoT Enterprise',
    app_version VARCHAR(30) NOT NULL,
    status VARCHAR(30) DEFAULT 'ONLINE', -- ONLINE, OFFLINE, MAINTENANCE, PRINTER_OUT
    camera_model VARCHAR(100),
    printer_model VARCHAR(100),
    current_paper_count INT DEFAULT 0,
    max_paper_capacity INT DEFAULT 700,
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Galeri Publik & Digital Event
CREATE TABLE public_galleries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL, -- Contoh: "Beranda Main Event", "Wedding Of Dadit & Shey"
    slug VARCHAR(200) UNIQUE NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    active_until TIMESTAMPTZ NOT NULL,
    accent_color VARCHAR(20) DEFAULT '#000000',
    background_color VARCHAR(20) DEFAULT '#FFFFFF',
    header_logo_url TEXT,
    instagram_handle VARCHAR(80),
    tiktok_handle VARCHAR(80),
    is_password_protected BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Transaksi Photobooth
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    gallery_id UUID REFERENCES public_galleries(id) ON DELETE SET NULL,
    transaction_uuid_client VARCHAR(80) UNIQUE NOT NULL, -- UUID unik yang dibuat di Kiosk
    amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- QRIS, CASH, VOUCHER, CARD
    payment_status VARCHAR(30) DEFAULT 'COMPLETED',
    voucher_code VARCHAR(80),
    sync_status VARCHAR(30) DEFAULT 'DIRECT_ONLINE', -- DIRECT_ONLINE, SYNCED_FROM_FAILSAVE
    failsave_retry_count INT DEFAULT 0,
    created_at_kiosk TIMESTAMPTZ NOT NULL, -- Waktu asli saat foto diambil di Kiosk
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabel Media Aset Transaksi (Foto & GIF)
CREATE TABLE transaction_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL, -- PHOTO_HIGHRES, PHOTO_STRIP_GIF, RAW_POSE
    storage_provider VARCHAR(30) DEFAULT 'S3',
    bucket_name VARCHAR(100) NOT NULL,
    file_key TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    public_url TEXT NOT NULL,
    qr_code_short_code VARCHAR(50) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabel Telemetri & Audit Log Kiosk (Time-series log)
CREATE TABLE kiosk_telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    cpu_percent NUMERIC(5,2),
    ram_free_mb INT,
    disk_free_gb NUMERIC(6,2),
    paper_remaining INT,
    printer_status VARCHAR(50),
    camera_connected BOOLEAN,
    pending_failsave_count INT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks Kinerja
CREATE INDEX idx_kiosks_tenant_status ON kiosks(tenant_id, status);
CREATE INDEX idx_transactions_kiosk_created ON transactions(kiosk_id, created_at_kiosk DESC);
CREATE INDEX idx_media_transaction ON transaction_media(transaction_id);
CREATE INDEX idx_telemetry_kiosk_time ON kiosk_telemetry_logs(kiosk_id, recorded_at DESC);
