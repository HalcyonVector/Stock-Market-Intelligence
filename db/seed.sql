-- Minimal seed so the DB is queryable immediately.
INSERT INTO companies (name, sector, industry) VALUES
  ('Apple Inc.', 'IT', 'Consumer Electronics'),
  ('NVIDIA Corp.', 'IT', 'Semiconductors'),
  ('Reliance Industries', 'Energy', 'Conglomerate')
ON CONFLICT DO NOTHING;

INSERT INTO stocks (symbol, market, currency, company_id) VALUES
  ('AAPL', 'US', 'USD', 1),
  ('NVDA', 'US', 'USD', 2),
  ('RELIANCE', 'IN', 'INR', 3)
ON CONFLICT DO NOTHING;
