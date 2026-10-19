CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  sku TEXT NOT NULL
);

INSERT INTO orders (id, user_id, sku) VALUES
  (10, 1, 'book'),
  (11, 2, 'pen'),
  (12, 9, 'mug');
