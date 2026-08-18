-- Agregar módulo Agenda de citas (para bases de datos ya migradas)
INSERT INTO modules (code, name, description, icon, sort_order) VALUES
  ('agenda_citas', 'Agenda de citas', 'Programación y gestión de citas', 'event', 7)
ON CONFLICT (code) DO NOTHING;
