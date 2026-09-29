-- ================================================================
-- Pindahkan 6 template bawaan (Classic, Noir, Lime, Grid, Tilt, Bubble)
-- ke database, supaya bisa dikelola lewat admin.html.
-- Jalankan di Supabase: SQL Editor -> New query -> tempel -> Run.
-- Aman dijalankan berkali-kali (kalau sudah ada, akan ditimpa datanya).
-- ================================================================

insert into templates (id, name, w, h, bg, ink, ty, fs, frame_path, slots, sort_order, active) values
('classic', 'Classic', 600, 1792, '#ffffff', '#111111', 1745, 44, null,
  '[{"x":40,"y":40,"w":520,"h":390},{"x":40,"y":454,"w":520,"h":390},{"x":40,"y":868,"w":520,"h":390},{"x":40,"y":1282,"w":520,"h":390}]'::jsonb,
  1, true),

('noir', 'Noir', 600, 1792, '#111111', '#ffffff', 1745, 44, null,
  '[{"x":40,"y":40,"w":520,"h":390},{"x":40,"y":454,"w":520,"h":390},{"x":40,"y":868,"w":520,"h":390},{"x":40,"y":1282,"w":520,"h":390}]'::jsonb,
  2, true),

('lime', 'Lime', 600, 1792, '#c6f56b', '#111111', 1745, 44, null,
  '[{"x":40,"y":40,"w":520,"h":390},{"x":40,"y":454,"w":520,"h":390},{"x":40,"y":868,"w":520,"h":390},{"x":40,"y":1282,"w":520,"h":390}]'::jsonb,
  3, true),

('grid', 'Grid 2x2', 1200, 1000, '#ffffff', '#111111', 950, 44, null,
  '[{"x":50,"y":50,"w":520,"h":390},{"x":630,"y":50,"w":520,"h":390},{"x":50,"y":460,"w":520,"h":390},{"x":630,"y":460,"w":520,"h":390}]'::jsonb,
  4, true),

('tilt', 'Tilt', 1200, 1000, '#f1f1f1', '#111111', 950, 44, null,
  '[{"x":60,"y":60,"w":520,"h":390,"r":-3},{"x":620,"y":60,"w":520,"h":390,"r":3},{"x":60,"y":470,"w":520,"h":390,"r":3},{"x":620,"y":470,"w":520,"h":390,"r":-3}]'::jsonb,
  5, true),

('bubble', 'Bubble', 1000, 1100, '#ffffff', '#111111', 1040, 44, null,
  '[{"x":60,"y":60,"w":420,"h":420,"radius":210},{"x":520,"y":60,"w":420,"h":420,"radius":210},{"x":60,"y":520,"w":420,"h":420,"radius":210},{"x":520,"y":520,"w":420,"h":420,"radius":210}]'::jsonb,
  6, true)

on conflict (id) do update set
  name = excluded.name, w = excluded.w, h = excluded.h, bg = excluded.bg, ink = excluded.ink,
  ty = excluded.ty, fs = excluded.fs, slots = excluded.slots, sort_order = excluded.sort_order, active = excluded.active;
