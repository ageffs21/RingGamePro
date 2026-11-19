const SUPABASE_URL =
    'https://ybtxfjdulygyhluhnhss.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_8Nucrpf3K-nFBoGhtooZaA_h7dTphIR';

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );