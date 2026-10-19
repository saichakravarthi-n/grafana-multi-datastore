USE demo;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  active TINYINT NOT NULL
);

INSERT INTO users (id, name, active) VALUES
  (1, 'Ada', 1),
  (2, 'Grace', 1),
  (3, 'Alan', 0);
