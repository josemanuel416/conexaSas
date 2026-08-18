-- Catálogo territorial DANE (departamentos y municipios Colombia)

CREATE TABLE IF NOT EXISTS dane_departments (
  code        VARCHAR(2) PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dane_cities (
  code              VARCHAR(5) PRIMARY KEY,
  department_code   VARCHAR(2) NOT NULL REFERENCES dane_departments(code),
  name              VARCHAR(120) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dane_cities_department ON dane_cities(department_code);
CREATE INDEX IF NOT EXISTS idx_dane_cities_name ON dane_cities(name);
