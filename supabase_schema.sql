-- ==========================================
-- Phyzelyne Database Schema
-- Run this in your Supabase SQL Editor
-- ==========================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------
-- 1. TRANSACTIONS TABLE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT,
    category TEXT,
    type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
    "originalCurrency" TEXT,
    image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own transactions" 
    ON public.transactions 
    FOR ALL 
    USING (auth.uid() = user_id);

-- ------------------------------------------
-- 2. SETTINGS TABLE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    "currencyCode" TEXT DEFAULT 'GHS',
    "primaryGoal" TEXT,
    "spendingHabit" TEXT,
    "monthlyIncome" NUMERIC(15, 2),
    "incomeTarget" NUMERIC(15, 2),
    onboarded BOOLEAN DEFAULT FALSE NOT NULL,
    plan TEXT DEFAULT 'free',
    "darkMode" BOOLEAN DEFAULT FALSE NOT NULL,
    "accentTheme" TEXT DEFAULT 'gold',
    "weeklySummary" BOOLEAN DEFAULT TRUE NOT NULL,
    "overspendAlerts" BOOLEAN DEFAULT TRUE NOT NULL,
    "goalAlerts" BOOLEAN DEFAULT TRUE NOT NULL,
    name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings" 
    ON public.settings 
    FOR ALL 
    USING (auth.uid() = user_id);

-- ------------------------------------------
-- 3. GOALS TABLE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT,
    target NUMERIC(15, 2) NOT NULL,
    saved NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    deadline DATE,
    "originalCurrency" TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own goals" 
    ON public.goals 
    FOR ALL 
    USING (auth.uid() = user_id);

-- ------------------------------------------
-- 4. INVOICES TABLE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    "logo" TEXT,
    "accentColor" TEXT,
    "fromName" TEXT,
    "fromTagline" TEXT,
    "fromEmail" TEXT,
    "fromPhone" TEXT,
    "fromAddress" TEXT,
    "toName" TEXT,
    "toContact" TEXT,
    "toEmail" TEXT,
    "toPhone" TEXT,
    "toAddress" TEXT,
    "number" TEXT,
    "date" DATE,
    "due" DATE,
    "po" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "taxRate" NUMERIC(5, 2),
    "discountVal" NUMERIC(15, 2),
    "discountType" TEXT,
    "currency" TEXT,
    "items" JSONB,
    "total" NUMERIC(15, 2) NOT NULL,
    "status" TEXT DEFAULT 'draft' NOT NULL,
    "paidAt" TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own invoices" 
    ON public.invoices 
    FOR ALL 
    USING (auth.uid() = user_id);

-- ------------------------------------------
-- 5. RECEIPTS TABLE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipts (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    merchant TEXT,
    date DATE,
    amount NUMERIC(15, 2) NOT NULL,
    category TEXT,
    image TEXT,
    "createdAt" TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own receipts" 
    ON public.receipts 
    FOR ALL 
    USING (auth.uid() = user_id);

-- ------------------------------------------
-- 6. ENABLE REALTIME REPLICATION
-- ------------------------------------------
-- Add Phyzelyne tables to the supabase_realtime publication to enable postgres_changes listeners
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.receipts;

