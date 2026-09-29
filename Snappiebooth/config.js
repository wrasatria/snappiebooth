/* Isi dua nilai ini dari Supabase: Project Settings -> API.
   File ini dipakai oleh admin.html (login) dan oleh website utama (membaca template).
   SUPABASE_ANON_KEY aman ditaruh di sini karena hanya bisa membaca data publik
   dan tidak bisa menulis apa pun tanpa login admin (dijaga oleh RLS di database). */
const SUPABASE_URL = "https://mrdgdcmiqgocaelvgthr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tHRnSLVY7bN3vpr0V58PmA_A6eZMbA5";
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;