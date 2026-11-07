-- Navicat Web demo database. Load with:  mysql -u root -p < tests/demo_schema.sql
DROP DATABASE IF EXISTS navicat_demo;
CREATE DATABASE navicat_demo DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE navicat_demo;

CREATE TABLE categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  parent_id INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_name (name),
  KEY fk_cat_parent (parent_id),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Product categories';

CREATE TABLE products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category_id INT UNSIGNED NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  weight_kg FLOAT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  tags SET('new','sale','featured','clearance') NULL,
  attributes JSON NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sku (sku),
  KEY idx_category (category_id),
  FULLTEXT KEY ft_name_desc (name, description),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Catalogue';

CREATE TABLE customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NULL,
  country CHAR(2) NOT NULL DEFAULT 'US',
  city VARCHAR(80) NULL,
  status ENUM('active','inactive','banned') NOT NULL DEFAULT 'active',
  credit_limit DECIMAL(12,2) NULL,
  birth_date DATE NULL,
  notes TEXT NULL,
  avatar BLOB NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email (email),
  KEY idx_country_city (country, city),
  KEY idx_last_name (last_name)
) ENGINE=InnoDB COMMENT='Customer master data';

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(16) NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  ordered_at DATETIME NOT NULL,
  shipped_at DATETIME NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  shipping_address VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_customer (customer_id),
  KEY idx_ordered_at (ordered_at),
  KEY idx_status (status),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_product (order_id, product_id),
  KEY idx_product (product_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  logged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor VARCHAR(60) NOT NULL,
  action VARCHAR(40) NOT NULL,
  details JSON NULL,
  KEY idx_logged (logged_at)
) ENGINE=InnoDB COMMENT='No primary key on purpose';

CREATE TABLE settings (
  name VARCHAR(60) NOT NULL,
  value TEXT NULL,
  PRIMARY KEY (name)
) ENGINE=MyISAM;

DELIMITER ;;
CREATE FUNCTION fn_order_total(p_order_id BIGINT UNSIGNED) RETURNS DECIMAL(12,2)
  READS SQL DATA DETERMINISTIC
BEGIN
  DECLARE v DECIMAL(12,2);
  SELECT IFNULL(SUM(line_total), 0) INTO v FROM order_items WHERE order_id = p_order_id;
  RETURN v;
END;;

CREATE PROCEDURE sp_customer_orders(IN p_customer_id INT UNSIGNED)
BEGIN
  SELECT * FROM orders WHERE customer_id = p_customer_id ORDER BY ordered_at DESC;
  SELECT COUNT(*) AS order_count, IFNULL(SUM(total), 0) AS total_spent FROM orders WHERE customer_id = p_customer_id;
END;;

CREATE TRIGGER trg_order_items_ai AFTER INSERT ON order_items FOR EACH ROW
BEGIN
  UPDATE orders SET total = fn_order_total(NEW.order_id) WHERE id = NEW.order_id;
END;;

CREATE TRIGGER trg_order_items_ad AFTER DELETE ON order_items FOR EACH ROW
BEGIN
  UPDATE orders SET total = fn_order_total(OLD.order_id) WHERE id = OLD.order_id;
END;;

CREATE EVENT ev_purge_audit ON SCHEDULE EVERY 1 DAY STARTS '2026-01-01 03:00:00'
  ON COMPLETION PRESERVE DISABLE COMMENT 'Purge audit rows older than 90 days'
  DO DELETE FROM audit_log WHERE logged_at < NOW() - INTERVAL 90 DAY;;
DELIMITER ;

INSERT INTO categories (id, name, parent_id) VALUES
(1,'Electronics',NULL),(2,'Computers',1),(3,'Phones',1),(4,'Home',NULL),(5,'Kitchen',4),(6,'Garden',4),(7,'Audio',1);

INSERT INTO products (sku, name, category_id, price, stock, weight_kg, is_active, tags, attributes, description) VALUES
('LT-1001','UltraBook 14 inch',2,1299.00,12,1.25,1,'new,featured','{"cpu":"i7","ram_gb":16,"ssd_gb":512}','Slim 14-inch laptop with all-day battery.'),
('LT-1002','WorkStation 17 inch',2,2499.00,4,2.9,1,'featured','{"cpu":"i9","ram_gb":64,"ssd_gb":2048}','Desktop replacement for heavy workloads.'),
('PH-2001','Phone X Pro',3,999.00,55,0.19,1,'new','{"screen":6.7,"storage_gb":256}','Flagship phone with triple camera.'),
('PH-2002','Phone Lite',3,399.00,120,0.17,1,'sale','{"screen":6.1,"storage_gb":128}','Budget phone, great battery.'),
('AU-3001','Noise-Cancelling Headphones',7,299.00,33,0.25,1,'featured','{"bluetooth":true,"battery_h":30}','Over-ear, 30h battery.'),
('AU-3002','Portable Speaker',7,89.90,78,0.6,1,NULL,'{"bluetooth":true,"waterproof":"IP67"}','Pocket-sized, waterproof.'),
('KT-4001','Espresso Machine',5,549.00,9,8.5,1,'featured','{"bar":15,"tank_l":1.8}','Semi-automatic espresso machine.'),
('KT-4002','Chef Knife 20cm',5,79.00,45,0.3,1,NULL,'{"steel":"VG-10"}','Japanese steel chef knife.'),
('KT-4003','Air Fryer 5L',5,129.00,0,4.2,0,'clearance','{"capacity_l":5}','Discontinued model.'),
('GD-5001','Cordless Lawn Mower',6,449.00,7,21.0,1,'new','{"battery_v":40,"cut_cm":40}','40V cordless mower.'),
('GD-5002','Garden Hose 30m',6,34.50,200,2.1,1,'sale',NULL,'Kink-resistant hose with nozzle.'),
('EL-6001','4K Monitor 27 inch',2,379.00,26,5.4,1,NULL,'{"hz":144,"panel":"IPS"}','27-inch 4K 144Hz monitor.');

INSERT INTO customers (first_name, last_name, email, phone, country, city, status, credit_limit, birth_date, notes) VALUES
('Alice','Johnson','alice.johnson@example.com','+1-555-0101','US','Seattle','active',5000.00,'1988-04-12',NULL),
('Bob','Smith','bob.smith@example.com','+1-555-0102','US','Austin','active',2500.00,'1979-11-03','Prefers email contact'),
('Carla','Gomez','carla.gomez@example.com','+34-600-123456','ES','Madrid','active',1500.00,'1992-07-21',NULL),
('David','Lee','david.lee@example.com','+65-8123-4567','SG','Singapore','inactive',NULL,'1985-01-30','Moved address 2025'),
('Emma','Brown','emma.brown@example.com','+44-20-7946-0958','GB','London','active',3000.00,'1995-09-09',NULL),
('Farid','Rahman','farid.rahman@example.com','+880-1711-000000','BD','Dhaka','active',800.00,'1990-12-24',NULL),
('Grace','Kim','grace.kim@example.com','+82-10-1234-5678','KR','Seoul','active',4200.00,'1983-03-15','VIP'),
('Hiro','Tanaka','hiro.tanaka@example.com','+81-90-1234-5678','JP','Tokyo','banned',0.00,'1975-06-06','Chargeback 2024'),
('Isabella','Rossi','isabella.rossi@example.com','+39-333-1234567','IT','Milan','active',2000.00,'1998-02-02',NULL),
('Jonas','Weber','jonas.weber@example.com','+49-151-1234567','DE','Berlin','active',1200.00,'1991-08-18',NULL),
('Khalid','Al-Sayed','khalid.alsayed@example.com','+971-50-1234567','AE','Dubai','active',10000.00,'1980-10-10','Corporate account'),
('Lena','Novak','lena.novak@example.com','+420-601-123456','CZ','Prague','inactive',500.00,'1999-05-25',NULL),
('Miguel','Santos','miguel.santos@example.com','+55-11-91234-5678','BR','Sao Paulo','active',900.00,'1987-07-07',NULL),
('Nora','Olsen','nora.olsen@example.com','+47-412-34-567','NO','Oslo','active',3500.00,'1993-11-11',NULL),
('Omar','Haddad','omar.haddad@example.com','+20-100-123-4567','EG','Cairo','active',700.00,'1986-04-04',NULL),
('Priya','Patel','priya.patel@example.com','+91-98765-43210','IN','Mumbai','active',1800.00,'1994-01-19',NULL),
('Quentin','Dubois','quentin.dubois@example.com','+33-6-12-34-56-78','FR','Paris','active',2200.00,'1982-12-01',NULL),
('Rosa','Martinez','rosa.martinez@example.com','+52-55-1234-5678','MX','Mexico City','active',1100.00,'1996-06-30',NULL),
('Sam','Taylor','sam.taylor@example.com','+61-412-345-678','AU','Sydney','active',2700.00,'1989-09-19',NULL),
('Tomasz','Kowalski','tomasz.kowalski@example.com','+48-600-123-456','PL','Warsaw','inactive',NULL,'1978-02-14',NULL),
('Uma','Nair','uma.nair@example.com','+91-91234-56789','IN','Kochi','active',1300.00,'1997-10-05',NULL),
('Victor','Hugo','victor.hugo@example.com','+33-7-98-76-54-32','FR','Lyon','active',600.00,'1984-03-03','Wants invoices by post'),
('Wen','Zhang','wen.zhang@example.com','+86-138-0013-8000','CN','Shanghai','active',5000.00,'1990-08-08',NULL),
('Yara','Silva','yara.silva@example.com','+351-912-345-678','PT','Lisbon','active',1500.00,'2000-01-01',NULL);

INSERT INTO orders (order_no, customer_id, status, ordered_at, shipped_at, total, currency, shipping_address) VALUES
('ORD-10001',1,'delivered','2026-01-05 10:12:00','2026-01-06 09:00:00',0,'USD','12 Pine St, Seattle'),
('ORD-10002',2,'delivered','2026-01-07 14:30:00','2026-01-08 11:00:00',0,'USD','77 Oak Ave, Austin'),
('ORD-10003',3,'shipped','2026-01-15 09:05:00','2026-01-16 08:30:00',0,'EUR','Calle Mayor 5, Madrid'),
('ORD-10004',5,'paid','2026-02-02 16:45:00',NULL,0,'GBP','221B Baker St, London'),
('ORD-10005',7,'delivered','2026-02-10 11:20:00','2026-02-11 10:00:00',0,'USD','Gangnam 12, Seoul'),
('ORD-10006',9,'cancelled','2026-02-14 19:00:00',NULL,0,'EUR','Via Roma 1, Milan'),
('ORD-10007',10,'delivered','2026-02-20 08:15:00','2026-02-21 09:10:00',0,'EUR','Unter den Linden 3, Berlin'),
('ORD-10008',11,'delivered','2026-03-01 12:00:00','2026-03-02 12:00:00',0,'USD','Sheikh Zayed Rd, Dubai'),
('ORD-10009',13,'shipped','2026-03-05 13:40:00','2026-03-06 10:00:00',0,'USD','Av. Paulista 1000, Sao Paulo'),
('ORD-10010',14,'paid','2026-03-11 10:10:00',NULL,0,'EUR','Karl Johans gate 2, Oslo'),
('ORD-10011',16,'delivered','2026-03-18 17:25:00','2026-03-19 09:00:00',0,'USD','Marine Drive 9, Mumbai'),
('ORD-10012',17,'delivered','2026-03-22 09:30:00','2026-03-23 08:00:00',0,'EUR','Rue de Rivoli 8, Paris'),
('ORD-10013',19,'pending','2026-04-01 07:55:00',NULL,0,'USD','George St 50, Sydney'),
('ORD-10014',1,'delivered','2026-04-03 15:00:00','2026-04-04 10:00:00',0,'USD','12 Pine St, Seattle'),
('ORD-10015',21,'delivered','2026-04-09 11:11:00','2026-04-10 11:00:00',0,'USD','MG Road 4, Kochi'),
('ORD-10016',23,'shipped','2026-04-15 20:20:00','2026-04-16 09:00:00',0,'USD','Nanjing Rd 100, Shanghai'),
('ORD-10017',24,'paid','2026-04-21 10:00:00',NULL,0,'EUR','Rua Augusta 7, Lisbon'),
('ORD-10018',5,'delivered','2026-05-02 13:13:00','2026-05-03 09:30:00',0,'GBP','221B Baker St, London'),
('ORD-10019',7,'delivered','2026-05-06 09:45:00','2026-05-07 10:00:00',0,'USD','Gangnam 12, Seoul'),
('ORD-10020',11,'delivered','2026-05-12 16:00:00','2026-05-13 09:00:00',0,'USD','Sheikh Zayed Rd, Dubai'),
('ORD-10021',15,'cancelled','2026-05-19 18:30:00',NULL,0,'USD','Tahrir Sq 1, Cairo'),
('ORD-10022',18,'delivered','2026-05-25 12:12:00','2026-05-26 10:00:00',0,'USD','Reforma 222, Mexico City'),
('ORD-10023',22,'shipped','2026-06-01 08:00:00','2026-06-02 08:00:00',0,'EUR','Place Bellecour 3, Lyon'),
('ORD-10024',2,'pending','2026-06-08 14:00:00',NULL,0,'USD','77 Oak Ave, Austin'),
('ORD-10025',3,'delivered','2026-06-15 10:30:00','2026-06-16 09:00:00',0,'EUR','Calle Mayor 5, Madrid'),
('ORD-10026',9,'paid','2026-06-20 15:45:00',NULL,0,'EUR','Via Roma 1, Milan'),
('ORD-10027',13,'delivered','2026-06-27 11:00:00','2026-06-28 10:00:00',0,'USD','Av. Paulista 1000, Sao Paulo'),
('ORD-10028',16,'shipped','2026-07-02 09:20:00','2026-07-03 09:00:00',0,'USD','Marine Drive 9, Mumbai'),
('ORD-10029',19,'delivered','2026-07-09 13:50:00','2026-07-10 09:00:00',0,'USD','George St 50, Sydney'),
('ORD-10030',23,'pending','2026-07-14 17:35:00',NULL,0,'USD','Nanjing Rd 100, Shanghai');

INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES
(1,1,1,1299.00),(1,5,1,299.00),(2,3,1,999.00),(2,6,2,89.90),(3,4,1,399.00),(3,11,3,34.50),
(4,7,1,549.00),(4,8,2,79.00),(5,2,1,2499.00),(5,12,2,379.00),(6,9,1,129.00),(7,10,1,449.00),(7,11,2,34.50),
(8,1,2,1299.00),(8,3,2,999.00),(8,5,2,299.00),(9,6,1,89.90),(9,8,1,79.00),(10,12,1,379.00),(11,4,2,399.00),
(12,7,1,549.00),(12,8,1,79.00),(12,6,1,89.90),(13,3,1,999.00),(14,12,1,379.00),(14,5,1,299.00),(15,4,1,399.00),
(16,2,1,2499.00),(16,1,1,1299.00),(17,11,5,34.50),(18,10,1,449.00),(19,1,1,1299.00),(19,6,3,89.90),(20,2,2,2499.00),
(21,3,1,999.00),(22,8,3,79.00),(23,7,1,549.00),(24,5,1,299.00),(25,12,2,379.00),(26,4,1,399.00),(26,6,1,89.90),
(27,1,1,1299.00),(28,3,1,999.00),(28,5,1,299.00),(29,10,1,449.00),(29,11,1,34.50),(30,2,1,2499.00),(30,12,1,379.00);

INSERT INTO audit_log (actor, action, details) VALUES
('system','schema.loaded','{"version":1}'),('alice','login',NULL),('alice','order.create','{"order":"ORD-10001"}'),
('bob','login',NULL),('system','backup.run','{"size_mb":12.5}'),('grace','order.cancel','{"order":"ORD-10006"}'),
('system','event.purge','{"deleted":0}'),('khalid','login',NULL),('alice','login',NULL),('system','backup.run','{"size_mb":12.7}');

INSERT INTO settings (name, value) VALUES ('shop.name','Navicat Web Demo Shop'),('shop.currency','USD'),('tax.rate','0.08'),('feature.flags','{"beta":true}');

CREATE VIEW v_order_summary AS
SELECT o.id AS order_id, o.order_no, CONCAT(c.first_name, ' ', c.last_name) AS customer, c.country, o.status, o.ordered_at,
       COUNT(i.id) AS item_count, IFNULL(SUM(i.line_total), 0) AS items_total
FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN order_items i ON i.order_id = o.id
GROUP BY o.id, o.order_no, customer, c.country, o.status, o.ordered_at;

CREATE VIEW v_customer_emails AS SELECT id, email, status FROM customers;

CREATE VIEW v_low_stock AS SELECT p.sku, p.name, p.stock, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.stock < 10;
