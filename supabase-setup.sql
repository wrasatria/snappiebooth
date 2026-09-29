-- ================================================================
-- JALANKAN SEKALI di Supabase: buka project -> SQL Editor -> New query
-- -> tempel semua ini -> Run.
-- ================================================================

-- 1) Tabel untuk menyimpan template strip
create table if not exists templates (
  id text primary key,
  name text not null,
  w int not null,
  h int not null,
  bg text default '#ffffff',
  ink text default '#111111',
  ty int default 0,
  fs int default 0,
  frame_path text,
  slots jsonb not null,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

alter table templates enable row level security;

-- Pengunjung website hanya boleh MEMBACA template yang aktif
create policy "public read active templates" on templates
  for select using (active = true);

-- Admin yang sudah login boleh membaca semua dan mengubah apa saja
create policy "admin manage templates" on templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 2) Bucket storage untuk file PNG frame
insert into storage.buckets (id, name, public)
values ('frames', 'frames', true)
on conflict (id) do nothing;

create policy "public read frames" on storage.objects
  for select using (bucket_id = 'frames');

create policy "admin upload frames" on storage.objects
  for insert with check (bucket_id = 'frames' and auth.role() = 'authenticated');

create policy "admin update frames" on storage.objects
  for update using (bucket_id = 'frames' and auth.role() = 'authenticated');

create policy "admin delete frames" on storage.objects
  for delete using (bucket_id = 'frames' and auth.role() = 'authenticated');

-- ================================================================
-- Setelah ini, buat akun admin secara manual (BUKAN lewat SQL):
-- Authentication -> Users -> Add user -> isi email & password Anda sendiri.
-- Tidak ada halaman pendaftaran publik, jadi hanya akun ini yang bisa login.
-- ================================================================
