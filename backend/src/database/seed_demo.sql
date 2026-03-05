-- =============================================
-- VORTEXYS — Dados de Demonstração
-- Execute via: docker exec -i vortexys-db psql -U postgres -d vortexys < seed_demo.sql
-- OU cole no psql do container
-- =============================================

-- Limpa dados existentes (na ordem correta de FK) antes de inserir
-- Comente estas linhas se quiser ACUMULAR em vez de substituir
TRUNCATE TABLE
  service_order_messages, service_order_logs, service_order_approvals,
  service_order_checklists, service_order_items, service_order_devices,
  service_orders,
  wa_conversation_tags, wa_messages, wa_conversations, wa_contacts,
  wa_quick_replies, wa_tags, wa_agents, wa_departments,
  activities, lead_events, lead_products,
  audit_logs, refresh_tokens,
  transactions,
  return_items, returns,
  client_credits,
  order_items, orders,
  stock_movements,
  leads,
  proposals,
  sellers,
  clients,
  products,
  financial_categories,
  categories,
  warehouses,
  pipelines
  RESTART IDENTITY CASCADE;

-- ─── CATEGORIAS DE PRODUTO ───────────────────────────────────────────────────

INSERT INTO categories (name, type, color) VALUES
  ('Eletrônicos',       'product', '#3b82f6'),
  ('Acessórios',        'product', '#8b5cf6'),
  ('Periféricos',       'product', '#10b981'),
  ('Áudio',             'product', '#f59e0b'),
  ('Cabos e Adaptadores','product','#ef4444'),
  ('Armazenamento',     'product', '#06b6d4'),
  ('Energia',           'product', '#84cc16'),
  ('Câmeras',           'product', '#ec4899');

-- ─── DEPÓSITOS ──────────────────────────────────────────────────────────────

INSERT INTO warehouses (name, location, active) VALUES
  ('Depósito Principal', 'Galpão A - Setor 1', true),
  ('Loja Centro',        'Rua das Flores, 100', true),
  ('Filial Norte',       'Av. Industrial, 500', true);

-- ─── CATEGORIAS FINANCEIRAS ──────────────────────────────────────────────────

INSERT INTO financial_categories (name, type, color) VALUES
  ('Venda de Produtos',    'income',  '#10b981'),
  ('Prestação de Serviço', 'income',  '#3b82f6'),
  ('Recebimento de Pedido','income',  '#8b5cf6'),
  ('Aluguel',              'expense', '#ef4444'),
  ('Salários',             'expense', '#f59e0b'),
  ('Fornecedores',         'expense', '#ec4899'),
  ('Marketing',            'expense', '#06b6d4'),
  ('Logística',            'expense', '#84cc16'),
  ('Impostos',             'expense', '#6b7280'),
  ('Manutenção',           'expense', '#a855f7');

-- ─── PRODUTOS (50+) ─────────────────────────────────────────────────────────

INSERT INTO products (sku, name, description, category_id, unit, cost_price, sale_price, stock_quantity, min_stock, warehouse_id, active) VALUES
  ('EL-001', 'Smartphone Samsung Galaxy A54', '6.4" 128GB 8GB RAM', 1, 'un', 980.00,  1599.00, 42, 5,  1, true),
  ('EL-002', 'Smartphone Motorola Edge 40',   '6.55" 256GB 8GB RAM',1, 'un', 1100.00, 1899.00, 28, 5,  1, true),
  ('EL-003', 'Tablet Samsung Tab A9',         '10.5" 128GB WiFi',   1, 'un', 780.00,  1299.00, 15, 3,  1, true),
  ('EL-004', 'Notebook Dell Inspiron 15',     'i5 12ª 8GB 512GB',   1, 'un', 2400.00, 3799.00, 8,  2,  1, true),
  ('EL-005', 'Notebook Lenovo IdeaPad 3',     'Ryzen 5 8GB 256GB',  1, 'un', 1800.00, 2899.00, 12, 2,  1, true),
  ('EL-006', 'Smart TV LG 50" 4K',            'UHD NanoCell',       1, 'un', 1600.00, 2499.00, 6,  2,  2, true),
  ('EL-007', 'Smart TV Samsung 55" QLED',     '4K 120Hz',           1, 'un', 2200.00, 3599.00, 4,  1,  2, true),
  ('EL-008', 'Console PS5 Digital',           '825GB SSD',          1, 'un', 2700.00, 3999.00, 3,  1,  1, true),
  ('EL-009', 'Console Xbox Series S',         '512GB',              1, 'un', 1600.00, 2499.00, 7,  2,  1, true),
  ('AC-001', 'Capa iPhone 15 Pro Silicone',   'MagSafe compatível', 2, 'un', 35.00,   89.90,   150,20, 2, true),
  ('AC-002', 'Capa Samsung S24 Ultra TPU',    'Anti-impacto',       2, 'un', 25.00,   59.90,   200,30, 2, true),
  ('AC-003', 'Película Vidro iPhone 15',      '9H Full Cover',      2, 'un', 12.00,   39.90,   300,50, 2, true),
  ('AC-004', 'Película Vidro Samsung A54',    '9H Full Cover',      2, 'un', 10.00,   34.90,   280,50, 2, true),
  ('AC-005', 'Suporte Veicular Magnético',    'Universal 360°',     2, 'un', 28.00,   79.90,   90, 15, 2, true),
  ('AC-006', 'Carregador Portátil 20000mAh',  'PD 65W',             2, 'un', 95.00,   249.90,  45, 8,  1, true),
  ('AC-007', 'Carregador Portátil 10000mAh',  '22.5W',              2, 'un', 55.00,   139.90,  80, 10, 1, true),
  ('PE-001', 'Mouse Logitech MX Master 3S',   'Sem fio 8000DPI',    3, 'un', 280.00,  549.00,  25, 5,  1, true),
  ('PE-002', 'Mouse Gamer Razer DeathAdder',  '20000DPI RGB',       3, 'un', 220.00,  429.00,  18, 4,  1, true),
  ('PE-003', 'Teclado Mecânico HyperX Red',   'TKL Switch Red',     3, 'un', 350.00,  649.00,  15, 3,  1, true),
  ('PE-004', 'Teclado sem fio Logitech MK470','Combo mouse',        3, 'un', 180.00,  349.00,  22, 4,  1, true),
  ('PE-005', 'Monitor LG 27" 4K IPS',         '144Hz HDR400',       3, 'un', 1450.00, 2299.00, 7,  2,  1, true),
  ('PE-006', 'Monitor Samsung 24" FHD',       '75Hz IPS',           3, 'un', 650.00,  999.00,  10, 2,  2, true),
  ('PE-007', 'Webcam Logitech C920',          'Full HD 1080p',      3, 'un', 280.00,  499.00,  20, 4,  1, true),
  ('PE-008', 'Hub USB-C 7 em 1',              '4K HDMI PD100W',     3, 'un', 110.00,  229.00,  35, 6,  2, true),
  ('AU-001', 'Fone JBL Tune 710BT',           'Bluetooth 50h',      4, 'un', 220.00,  399.00,  30, 6,  1, true),
  ('AU-002', 'Fone Sony WH-1000XM5',          'ANC Premium',        4, 'un', 950.00,  1799.00, 8,  2,  1, true),
  ('AU-003', 'Fone AirPods Pro 2ª gen',       'ANC H2 chip',        4, 'un', 1100.00, 1999.00, 5,  1,  1, true),
  ('AU-004', 'Caixa JBL Flip 6',              'IP67 30h',           4, 'un', 380.00,  699.00,  20, 4,  1, true),
  ('AU-005', 'Caixa Marshall Stanmore III',   'Bluetooth WiFi',     4, 'un', 1600.00, 2799.00, 3,  1,  1, true),
  ('AU-006', 'Earbuds Samsung Galaxy Buds2',  'ANC IPX2',           4, 'un', 280.00,  499.00,  25, 5,  2, true),
  ('CA-001', 'Cabo USB-C 2m 100W',            'Nylon trançado',     5, 'un', 18.00,   49.90,   500,80, 2, true),
  ('CA-002', 'Cabo Lightning 1m MFi',         'Apple certificado',  5, 'un', 22.00,   59.90,   400,60, 2, true),
  ('CA-003', 'Cabo HDMI 2.1 2m',              '8K 48Gbps',          5, 'un', 35.00,   89.90,   120,20, 2, true),
  ('CA-004', 'Adaptador USB-C p/ HDMI 4K',    '60Hz',               5, 'un', 28.00,   69.90,   150,25, 2, true),
  ('CA-005', 'Cabo USB-A p/ USB-C 1m',        '3.0 5Gbps',          5, 'un', 12.00,   29.90,   600,100,2, true),
  ('AR-001', 'SSD Externo Kingston 1TB',      'USB 3.2 Gen2',       6, 'un', 320.00,  599.00,  22, 4,  1, true),
  ('AR-002', 'SSD Externo Samsung T7 2TB',    '1050MB/s',           6, 'un', 580.00,  999.00,  12, 2,  1, true),
  ('AR-003', 'Pen Drive SanDisk 128GB',       'USB 3.1 150MB/s',    6, 'un', 55.00,   119.00,  80, 15, 2, true),
  ('AR-004', 'Cartão MicroSD 256GB Samsung',  'UHS-I U3 A2',        6, 'un', 70.00,   149.00,  60, 10, 2, true),
  ('EN-001', 'Carregador GaN 65W Tipo-C',     'PD3.0 QC4+',         7, 'un', 75.00,   179.00,  50, 8,  1, true),
  ('EN-002', 'Carregador iPhone 30W USB-C',   'Original Apple',     7, 'un', 150.00,  279.00,  30, 5,  2, true),
  ('EN-003', 'Carregador sem fio 15W',        'MagSafe compatível', 7, 'un', 55.00,   129.00,  70, 12, 2, true),
  ('EN-004', 'Nobreak 600VA SMS',             'Bivolt auto',        7, 'un', 280.00,  499.00,  8,  2,  1, true),
  ('CM-001', 'Ring Light 18" com Tripé',      '3 tons de luz',      8, 'un', 180.00,  349.00,  15, 3,  1, true),
  ('CM-002', 'Webcam 4K Elgato Facecam Pro',  '60fps f/2.4',        8, 'un', 850.00,  1599.00, 5,  1,  1, true),
  ('CM-003', 'Microfone Rode PodMic USB',     'XLR/USB Dinâmico',   8, 'un', 650.00,  1199.00, 6,  1,  1, true),
  ('CM-004', 'Capturadora HDMI Elgato 4K60',  '4K60 HDR10',         8, 'un', 1100.00, 1999.00, 4,  1,  1, true),
  ('PE-009', 'Suporte para Notebook Ajust.',  'Alumínio 6 níveis',  3, 'un', 95.00,   199.00,  40, 8,  2, true),
  ('AC-008', 'Mouse Pad XL Gaming',           'RGB borda costurada',2, 'un', 45.00,   99.90,   60, 10, 2, true),
  ('AC-009', 'Case para Notebook 15"',        'Neoprene impermeável',2,'un', 40.00,   89.90,   55, 10, 2, true),
  ('EL-010', 'Roteador WiFi 6 TP-Link AX73', 'AX5400 4 antenas',   1, 'un', 380.00,  699.00,  14, 2,  1, true);

-- ─── VENDEDORES (10) ─────────────────────────────────────────────────────────

INSERT INTO sellers (name, email, phone, commission, goal, active) VALUES
  ('Lucas Ferreira',   'lucas@vortexys.com',   '(11) 98001-0001', 5.00, 25000.00, true),
  ('Ana Paula Silva',  'ana@vortexys.com',     '(11) 98001-0002', 5.50, 30000.00, true),
  ('Carlos Mendes',    'carlos@vortexys.com',  '(11) 98001-0003', 4.50, 20000.00, true),
  ('Fernanda Costa',   'fernanda@vortexys.com','(11) 98001-0004', 6.00, 35000.00, true),
  ('Rafael Oliveira',  'rafael@vortexys.com',  '(11) 98001-0005', 5.00, 22000.00, true),
  ('Juliana Ramos',    'juliana@vortexys.com', '(11) 98001-0006', 5.50, 28000.00, true),
  ('Thiago Barbosa',   'thiago@vortexys.com',  '(11) 98001-0007', 4.00, 18000.00, true),
  ('Mariana Lima',     'mariana@vortexys.com', '(11) 98001-0008', 6.00, 32000.00, true),
  ('Pedro Alves',      'pedro@vortexys.com',   '(11) 98001-0009', 5.00, 24000.00, true),
  ('Camila Souza',     'camila@vortexys.com',  '(11) 98001-0010', 5.50, 27000.00, true);

-- ─── CLIENTES (60) ──────────────────────────────────────────────────────────

INSERT INTO clients (type, name, document, email, phone, city, state, active) VALUES
  ('client','Ricardo Augusto Pereira',    '123.456.789-01','ricardo@gmail.com',      '(11) 99100-0001','São Paulo','SP',true),
  ('client','Amanda Cristina Rodrigues',  '234.567.890-02','amanda@hotmail.com',     '(11) 99100-0002','São Paulo','SP',true),
  ('client','Marcos Vinicius Santos',     '345.678.901-03','marcos@gmail.com',       '(11) 99100-0003','Campinas','SP',true),
  ('client','Beatriz Helena Carvalho',    '456.789.012-04','beatriz@yahoo.com',      '(11) 99100-0004','São Paulo','SP',true),
  ('client','Gabriel Eduardo Lima',       '567.890.123-05','gabriel@gmail.com',      '(11) 99100-0005','Guarulhos','SP',true),
  ('client','Isabela Martins Alves',      '678.901.234-06','isabela@hotmail.com',    '(11) 99100-0006','Osasco','SP',true),
  ('client','Diego Fonseca Neto',         '789.012.345-07','diego@gmail.com',        '(11) 99100-0007','Santo André','SP',true),
  ('client','Larissa Ferreira Gomes',     '890.123.456-08','larissa@gmail.com',      '(11) 99100-0008','São Bernardo','SP',true),
  ('client','Thales Roberto Pinto',       '901.234.567-09','thales@hotmail.com',     '(11) 99100-0009','São Paulo','SP',true),
  ('client','Natália Souza Barbosa',      '012.345.678-10','natalia@gmail.com',      '(11) 99100-0010','Mauá','SP',true),
  ('client','Bruno César Oliveira',       '111.222.333-11','bruno@gmail.com',        '(11) 99100-0011','São Paulo','SP',true),
  ('client','Patricia Lopes Mendes',      '222.333.444-12','patricia@hotmail.com',   '(11) 99100-0012','Diadema','SP',true),
  ('client','Rodrigo Henrique Castro',    '333.444.555-13','rodrigo@gmail.com',      '(11) 99100-0013','São Paulo','SP',true),
  ('client','Vanessa Ramos Teixeira',     '444.555.666-14','vanessa@yahoo.com',      '(11) 99100-0014','Barueri','SP',true),
  ('client','Leandro Augusto Freitas',    '555.666.777-15','leandro@gmail.com',      '(11) 99100-0015','Jundiaí','SP',true),
  ('client','Simone Cristina Araújo',     '666.777.888-16','simone@hotmail.com',     '(11) 99100-0016','São Paulo','SP',true),
  ('client','Eduardo Luiz Correia',       '777.888.999-17','eduardo@gmail.com',      '(11) 99100-0017','Ribeirão Preto','SP',true),
  ('client','Juliana Aparecida Rocha',    '888.999.000-18','juliana@gmail.com',      '(11) 99100-0018','São José dos Campos','SP',true),
  ('client','Fábio Roberto Melo',         '999.000.111-19','fabio@hotmail.com',      '(11) 99100-0019','Sorocaba','SP',true),
  ('client','Aline Silva Pereira',        '000.111.222-20','aline@gmail.com',        '(11) 99100-0020','São Paulo','SP',true),
  ('company','Tech Solutions Ltda',       '12.345.678/0001-90','contato@techsol.com.br','(11) 3100-0001','São Paulo','SP',true),
  ('company','InfoStore Comércio',        '23.456.789/0001-01','compras@infostore.com', '(11) 3100-0002','Campinas','SP',true),
  ('company','Digital World EIRELI',      '34.567.890/0001-02','digital@dworld.com',    '(11) 3100-0003','São Paulo','SP',true),
  ('company','MegaTech Distribuidora',    '45.678.901/0001-03','vendas@megatech.com.br','(11) 3100-0004','São Paulo','SP',true),
  ('company','ConnectStore ME',           '56.789.012/0001-04','connect@cstore.com.br', '(11) 3100-0005','Guarulhos','SP',true),
  ('client','Fernanda Oliveira Lima',     '111.333.555-26','fernanda.ol@gmail.com',  '(11) 99100-0026','São Paulo','SP',true),
  ('client','Alessandro Martins',        '222.444.666-27','ale.martins@gmail.com',  '(11) 99100-0027','Cotia','SP',true),
  ('client','Helena Ribeiro Nogueira',   '333.555.777-28','helena@hotmail.com',     '(11) 99100-0028','São Paulo','SP',true),
  ('client','Guilherme Nascimento',      '444.666.888-29','guil.nasc@gmail.com',    '(11) 99100-0029','Mogi das Cruzes','SP',true),
  ('client','Cláudia Monteiro Salas',    '555.777.999-30','claudia.ms@yahoo.com',   '(11) 99100-0030','São Paulo','SP',true),
  ('client','Renato Cordeiro Pires',     '111.444.777-31','renato.cp@gmail.com',    '(11) 99100-0031','Barueri','SP',true),
  ('client','Letícia Andrade Cunha',     '222.555.888-32','leticia.ac@hotmail.com', '(11) 99100-0032','São Paulo','SP',true),
  ('client','Jonas Pereira Braga',       '333.666.999-33','jonas.pb@gmail.com',     '(11) 99100-0033','Osasco','SP',true),
  ('client','Yasmin Cavalcante',         '444.777.000-34','yasmin.cv@gmail.com',    '(11) 99100-0034','São Paulo','SP',true),
  ('client','Henrique Dias Queiroz',     '555.888.111-35','henrique.dq@hotmail.com','(11) 99100-0035','Santo André','SP',true),
  ('client','Priscila Fontes Borges',    '666.999.222-36','priscila.fb@gmail.com',  '(11) 99100-0036','São Paulo','SP',true),
  ('client','Felipe Augusto Nunes',      '777.000.333-37','felipe.an@gmail.com',    '(11) 99100-0037','Campinas','SP',true),
  ('client','Tatiane Rezende Moura',     '888.111.444-38','tatiane.rm@yahoo.com',   '(11) 99100-0038','São Paulo','SP',true),
  ('client','Vitor Hugo Brandão',        '999.222.555-39','vitor.hb@gmail.com',     '(11) 99100-0039','Jundiaí','SP',true),
  ('client','Rosana Freire Magalhães',   '000.333.666-40','rosana.fm@gmail.com',    '(11) 99100-0040','São Paulo','SP',true),
  ('company','Prime Electronics SA',     '67.890.123/0001-05','prime@primeel.com.br',  '(11) 3100-0006','São Paulo','SP',true),
  ('company','Gamer Store Ltda',         '78.901.234/0001-06','loja@gamerstore.com.br','(11) 3100-0007','São Paulo','SP',true),
  ('company','Byte & Code Tecnologia',   '89.012.345/0001-07','byte@bytecode.com.br',  '(11) 3100-0008','Campinas','SP',true),
  ('client','Augusto Salles Vieira',     '121.212.121-43','augusto.sv@gmail.com',   '(11) 99100-0043','São Paulo','SP',true),
  ('client','Daniela Campos Lustosa',    '232.323.232-44','daniela.cl@hotmail.com', '(11) 99100-0044','Guarulhos','SP',true),
  ('client','Marcelo Trevizan Filho',    '343.434.343-45','marcelo.tf@gmail.com',   '(11) 99100-0045','São Paulo','SP',true),
  ('client','Andreia Leal Pinheiro',     '454.545.454-46','andreia.lp@yahoo.com',   '(11) 99100-0046','Diadema','SP',true),
  ('client','Sergio Batista Cardoso',    '565.656.565-47','sergio.bc@gmail.com',    '(11) 99100-0047','São Paulo','SP',true),
  ('client','Viviane Torres Esteves',    '676.767.676-48','viviane.te@hotmail.com', '(11) 99100-0048','Mauá','SP',true),
  ('client','Roberto Figueiredo Leal',   '787.878.787-49','roberto.fl@gmail.com',   '(11) 99100-0049','São Paulo','SP',true),
  ('client','Cristiane Moreira Paes',    '898.989.898-50','cristiane.mp@gmail.com', '(11) 99100-0050','São Bernardo','SP',true),
  ('client','André Gonçalves Rêgo',      '909.090.909-51','andre.gr@gmail.com',     '(11) 99100-0051','São Paulo','SP',true),
  ('client','Mônica Bastos Cavalcanti',  '010.101.010-52','monica.bc@hotmail.com',  '(11) 99100-0052','Barueri','SP',true),
  ('client','Thiago Tavares Maciel',     '120.234.345-53','thiago.tm@gmail.com',    '(11) 99100-0053','São Paulo','SP',true),
  ('client','Camila Noronha Rangel',     '230.345.456-54','camila.nr@yahoo.com',    '(11) 99100-0054','Osasco','SP',true),
  ('client','Danilo Prado Ferreira',     '340.456.567-55','danilo.pf@gmail.com',    '(11) 99100-0055','São Paulo','SP',true),
  ('client','Luciana Matos Rezende',     '450.567.678-56','luciana.mr@hotmail.com', '(11) 99100-0056','Cotia','SP',true),
  ('client','Pablo Moura Cavalcante',    '560.678.789-57','pablo.mc@gmail.com',     '(11) 99100-0057','São Paulo','SP',true),
  ('client','Sabrina Fontes Uchoa',      '670.789.890-58','sabrina.fu@gmail.com',   '(11) 99100-0058','Campinas','SP',true),
  ('client','Otávio Lins Coutinho',      '780.890.901-59','otavio.lc@hotmail.com',  '(11) 99100-0059','São Paulo','SP',true),
  ('client','Bruna Faria Domingues',     '890.901.012-60','bruna.fd@gmail.com',     '(11) 99100-0060','Jundiaí','SP',true);

-- ─── PEDIDOS + ITENS (60 pedidos) ───────────────────────────────────────────

DO $$
DECLARE
  order_statuses TEXT[] := ARRAY['confirmed','processing','shipped','delivered','draft','cancelled'];
  v_order_id INTEGER;
  v_subtotal NUMERIC;
  v_discount NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Pedido 1
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0001',1,1,'delivered',1688.90,0,1688.90,1,true,NOW()-INTERVAL '45 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,10,2,89.90,0,179.80),(v_order_id,11,2,59.90,0,119.80),(v_order_id,13,1,34.90,0,34.90),(v_order_id,17,1,549.00,50,499.00),(v_order_id,25,1,399.00,0,399.00),(v_order_id,31,3,49.90,0,149.70),(v_order_id,33,1,89.90,0,89.90),(v_order_id,35,3,29.90,0,89.70),(v_order_id,41,1,179.00,0,179.00),(v_order_id,49,1,199.00,0,199.00),(v_order_id,50,1,99.90,0,99.90);

  -- Pedido 2
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0002',2,2,'delivered',3799.00,200,3599.00,1,true,NOW()-INTERVAL '42 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,4,1,3799.00,200,3599.00);

  -- Pedido 3
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0003',21,3,'delivered',5499.00,300,5199.00,1,true,NOW()-INTERVAL '40 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,6,1,2499.00,100,2399.00),(v_order_id,5,1,2899.00,200,2699.00),(v_order_id,8,2,49.90,0,99.80);

  -- Pedido 4
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0004',3,1,'delivered',1799.00,0,1799.00,1,true,NOW()-INTERVAL'38 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,26,1,1799.00,0,1799.00);

  -- Pedido 5
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0005',4,4,'delivered',2249.80,0,2249.80,1,true,NOW()-INTERVAL'36 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,1,1,1599.00,0,1599.00),(v_order_id,25,1,399.00,0,399.00),(v_order_id,12,2,39.90,0,79.80),(v_order_id,31,2,49.90,0,99.80),(v_order_id,33,1,89.90,0,89.90);

  -- Pedido 6
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0006',22,5,'delivered',8998.00,500,8498.00,1,true,NOW()-INTERVAL'34 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,4,2,3799.00,250,3549.00),(v_order_id,5,1,2899.00,0,2899.00),(v_order_id,17,1,549.00,0,549.00),(v_order_id,22,1,999.00,0,999.00),(v_order_id,23,1,499.00,0,499.00);

  -- Pedido 7
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0007',5,6,'shipped',1099.80,0,1099.80,1,true,NOW()-INTERVAL'30 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,3,1,1299.00,200,1099.00),(v_order_id,34,1,69.90,0,69.90),(v_order_id,31,2,49.90,0,99.80);

  -- Pedido 8
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0008',6,7,'shipped',699.80,0,699.80,1,true,NOW()-INTERVAL'28 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,28,1,699.00,0,699.00),(v_order_id,31,1,49.90,0,49.90);

  -- Pedido 9
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0009',7,2,'shipped',3999.00,0,3999.00,1,true,NOW()-INTERVAL'26 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,8,1,3999.00,0,3999.00);

  -- Pedido 10
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0010',23,8,'processing',12497.00,997,11500.00,1,true,NOW()-INTERVAL'24 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,7,1,3599.00,0,3599.00),(v_order_id,4,1,3799.00,497,3302.00),(v_order_id,5,1,2899.00,0,2899.00),(v_order_id,21,1,2299.00,500,1799.00),(v_order_id,17,1,549.00,0,549.00);

  -- Pedido 11
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0011',8,1,'processing',1898.80,0,1898.80,1,true,NOW()-INTERVAL'22 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,2,1,1899.00,0,1899.00),(v_order_id,12,2,39.90,0,79.80);

  -- Pedido 12
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0012',9,3,'processing',2498.80,0,2498.80,1,true,NOW()-INTERVAL'20 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,8,1,3999.00,0,3999.00);

  -- Pedido 13
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0013',10,4,'confirmed',549.90,0,549.90,1,false,NOW()-INTERVAL'18 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,17,1,549.00,0,549.00),(v_order_id,50,1,99.90,0,99.90);

  -- Pedido 14
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0014',11,5,'confirmed',1349.80,50,1299.80,1,false,NOW()-INTERVAL'16 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,1,1,1599.00,50,1549.00),(v_order_id,10,2,89.90,0,179.80),(v_order_id,12,2,39.90,0,79.80);

  -- Pedido 15
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0015',24,6,'confirmed',4998.00,0,4998.00,1,false,NOW()-INTERVAL'14 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,4,1,3799.00,0,3799.00),(v_order_id,17,1,549.00,0,549.00),(v_order_id,23,1,499.00,0,499.00),(v_order_id,22,1,999.00,0,999.00);

  -- Pedido 16
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0016',12,7,'confirmed',429.00,0,429.00,1,false,NOW()-INTERVAL'12 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,18,1,429.00,0,429.00);

  -- Pedido 17
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0017',13,8,'draft',1998.80,100,1898.80,1,false,NOW()-INTERVAL'10 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,2,1,1899.00,100,1799.00),(v_order_id,10,2,89.90,0,179.80),(v_order_id,12,1,39.90,0,39.90);

  -- Pedido 18
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0018',14,9,'draft',2299.00,0,2299.00,1,false,NOW()-INTERVAL'8 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,21,1,2299.00,0,2299.00);

  -- Pedido 19
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0019',15,10,'draft',699.00,0,699.00,1,false,NOW()-INTERVAL'6 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,28,1,699.00,0,699.00);

  -- Pedido 20
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at)
    VALUES ('ORD-2026-0020',16,1,'cancelled',3599.00,0,3599.00,1,false,NOW()-INTERVAL'35 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES
    (v_order_id,7,1,3599.00,0,3599.00);

  -- Pedidos 21-40 (variados)
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0021',17,2,'delivered',399.00,0,399.00,1,true,NOW()-INTERVAL'33 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,25,1,399.00,0,399.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0022',18,3,'delivered',1599.00,0,1599.00,1,true,NOW()-INTERVAL'31 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,1,1,1599.00,0,1599.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0023',25,4,'delivered',499.00,0,499.00,1,true,NOW()-INTERVAL'29 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,23,1,499.00,0,499.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0024',26,5,'delivered',2499.00,0,2499.00,1,true,NOW()-INTERVAL'27 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,9,1,2499.00,0,2499.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0025',27,6,'delivered',649.00,0,649.00,1,true,NOW()-INTERVAL'25 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,19,1,649.00,0,649.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0026',28,7,'delivered',1799.00,0,1799.00,1,true,NOW()-INTERVAL'23 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,26,1,1799.00,0,1799.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0027',29,8,'shipped',1199.00,0,1199.00,1,true,NOW()-INTERVAL'21 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,43,1,1199.00,0,1199.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0028',30,9,'shipped',999.00,0,999.00,1,true,NOW()-INTERVAL'19 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,36,1,599.00,0,599.00),(v_order_id,37,1,119.00,0,119.00),(v_order_id,41,1,179.00,0,179.00),(v_order_id,50,1,99.90,0,99.90);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0029',31,10,'shipped',549.00,0,549.00,1,true,NOW()-INTERVAL'17 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,17,1,549.00,0,549.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0030',32,1,'processing',2299.00,0,2299.00,1,true,NOW()-INTERVAL'15 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,21,1,2299.00,0,2299.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0031',33,2,'confirmed',3999.00,0,3999.00,1,false,NOW()-INTERVAL'11 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,8,1,3999.00,0,3999.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0032',34,3,'confirmed',499.00,0,499.00,1,false,NOW()-INTERVAL'9 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,30,1,499.00,0,499.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0033',35,4,'confirmed',1599.00,0,1599.00,1,false,NOW()-INTERVAL'7 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,1,1,1599.00,0,1599.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0034',36,5,'draft',229.00,0,229.00,1,false,NOW()-INTERVAL'5 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,24,1,229.00,0,229.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0035',37,6,'draft',899.00,0,899.00,1,false,NOW()-INTERVAL'4 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,9,1,2499.00,0,2499.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0036',38,7,'draft',699.00,0,699.00,1,false,NOW()-INTERVAL'3 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,28,1,699.00,0,699.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0037',39,8,'draft',349.00,0,349.00,1,false,NOW()-INTERVAL'2 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,20,1,349.00,0,349.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0038',40,9,'draft',1799.00,0,1799.00,1,false,NOW()-INTERVAL'1 day') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,5,1,2899.00,0,2899.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0039',41,10,'delivered',1999.00,0,1999.00,1,true,NOW()-INTERVAL'50 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,27,1,1999.00,0,1999.00);

  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES
    ('ORD-2026-0040',42,1,'delivered',2799.00,0,2799.00,1,true,NOW()-INTERVAL'48 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES (v_order_id,29,1,2799.00,0,2799.00);

  -- Pedidos 41-60
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0041',43,2,'delivered',599.00,0,599.00,1,true,NOW()-INTERVAL'46 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,36,1,599.00,0,599.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0042',44,3,'delivered',149.00,0,149.00,1,true,NOW()-INTERVAL'44 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,38,1,149.00,0,149.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0043',45,4,'delivered',179.00,0,179.00,1,true,NOW()-INTERVAL'43 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,41,1,179.00,0,179.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0044',46,5,'shipped',1599.00,0,1599.00,1,true,NOW()-INTERVAL'13 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,44,1,1599.00,0,1599.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0045',47,6,'shipped',1199.00,0,1199.00,1,true,NOW()-INTERVAL'11 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,45,1,1199.00,0,1199.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0046',48,7,'processing',999.00,0,999.00,1,true,NOW()-INTERVAL'9 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,22,1,999.00,0,999.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0047',49,8,'processing',349.00,0,349.00,1,true,NOW()-INTERVAL'7 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,20,1,349.00,0,349.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0048',50,9,'confirmed',129.00,0,129.00,1,false,NOW()-INTERVAL'5 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,43,1,129.00,0,129.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0049',51,10,'confirmed',2299.00,0,2299.00,1,false,NOW()-INTERVAL'3 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,21,1,2299.00,0,2299.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0050',52,1,'draft',499.00,0,499.00,1,false,NOW()-INTERVAL'1 day') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,16,1,499.00,0,499.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0051',53,2,'delivered',89.90,0,89.90,1,true,NOW()-INTERVAL'55 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,10,1,89.90,0,89.90);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0052',54,3,'delivered',249.90,0,249.90,1,true,NOW()-INTERVAL'53 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,16,1,249.90,0,249.90);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0053',55,4,'delivered',399.00,0,399.00,1,true,NOW()-INTERVAL'51 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,25,1,399.00,0,399.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0054',56,5,'delivered',549.00,0,549.00,1,true,NOW()-INTERVAL'49 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,17,1,549.00,0,549.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0055',57,6,'delivered',699.00,0,699.00,1,true,NOW()-INTERVAL'47 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,28,1,699.00,0,699.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0056',58,7,'cancelled',1899.00,0,1899.00,1,false,NOW()-INTERVAL'20 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,2,1,1899.00,0,1899.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0057',59,8,'confirmed',1299.00,0,1299.00,1,false,NOW()-INTERVAL'2 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,3,1,1299.00,0,1299.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0058',60,9,'draft',1999.00,0,1999.00,1,false,NOW()) RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,27,1,1999.00,0,1999.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0059',1,10,'delivered',2499.00,0,2499.00,1,true,NOW()-INTERVAL'60 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,9,1,2499.00,0,2499.00);
  INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,user_id,stock_deducted,created_at) VALUES ('ORD-2026-0060',2,1,'delivered',649.00,0,649.00,1,true,NOW()-INTERVAL'58 days') RETURNING id INTO v_order_id;
  INSERT INTO order_items VALUES (DEFAULT,v_order_id,19,1,649.00,0,649.00);
END $$;

-- ─── TRANSAÇÕES FINANCEIRAS ──────────────────────────────────────────────────

INSERT INTO transactions (type, title, amount, due_date, paid_date, paid, category_id, client_id, notes, user_id, created_at) VALUES
  -- Receitas de pedidos entregues
  ('income','Venda ORD-2026-0001',  1688.90, NOW()-INTERVAL'45 days', NOW()-INTERVAL'45 days', true,  1, 1,  'Pedido entregue', 1, NOW()-INTERVAL'45 days'),
  ('income','Venda ORD-2026-0002',  3599.00, NOW()-INTERVAL'42 days', NOW()-INTERVAL'42 days', true,  1, 2,  'Notebook Dell', 1, NOW()-INTERVAL'42 days'),
  ('income','Venda ORD-2026-0003',  5199.00, NOW()-INTERVAL'40 days', NOW()-INTERVAL'40 days', true,  1, 21, 'TVs e acessórios', 1, NOW()-INTERVAL'40 days'),
  ('income','Venda ORD-2026-0004',  1799.00, NOW()-INTERVAL'38 days', NOW()-INTERVAL'38 days', true,  1, 3,  'Moto Edge', 1, NOW()-INTERVAL'38 days'),
  ('income','Venda ORD-2026-0005',  2249.80, NOW()-INTERVAL'36 days', NOW()-INTERVAL'36 days', true,  1, 4,  'Samsung + acessórios', 1, NOW()-INTERVAL'36 days'),
  ('income','Venda ORD-2026-0006',  8498.00, NOW()-INTERVAL'34 days', NOW()-INTERVAL'34 days', true,  1, 22, 'Corporativo notebooks', 1, NOW()-INTERVAL'34 days'),
  ('income','Venda ORD-2026-0021',   399.00, NOW()-INTERVAL'33 days', NOW()-INTERVAL'33 days', true,  1, 17, 'Fone JBL', 1, NOW()-INTERVAL'33 days'),
  ('income','Venda ORD-2026-0022',  1599.00, NOW()-INTERVAL'31 days', NOW()-INTERVAL'31 days', true,  1, 18, 'Samsung A54', 1, NOW()-INTERVAL'31 days'),
  ('income','Venda ORD-2026-0023',   499.00, NOW()-INTERVAL'29 days', NOW()-INTERVAL'29 days', true,  1, 25, 'Webcam Logitech', 1, NOW()-INTERVAL'29 days'),
  ('income','Venda ORD-2026-0024',  2499.00, NOW()-INTERVAL'27 days', NOW()-INTERVAL'27 days', true,  1, 26, 'Xbox Series S', 1, NOW()-INTERVAL'27 days'),
  ('income','Venda ORD-2026-0025',   649.00, NOW()-INTERVAL'25 days', NOW()-INTERVAL'25 days', true,  1, 27, 'Teclado Mecânico', 1, NOW()-INTERVAL'25 days'),
  ('income','Venda ORD-2026-0026',  1799.00, NOW()-INTERVAL'23 days', NOW()-INTERVAL'23 days', true,  1, 28, 'Moto Edge 40', 1, NOW()-INTERVAL'23 days'),
  ('income','Venda ORD-2026-0039',  1999.00, NOW()-INTERVAL'50 days', NOW()-INTERVAL'50 days', true,  1, 41, 'AirPods Pro', 1, NOW()-INTERVAL'50 days'),
  ('income','Venda ORD-2026-0040',  2799.00, NOW()-INTERVAL'48 days', NOW()-INTERVAL'48 days', true,  1, 42, 'Caixa Marshall', 1, NOW()-INTERVAL'48 days'),
  ('income','Venda ORD-2026-0051',    89.90, NOW()-INTERVAL'55 days', NOW()-INTERVAL'55 days', true,  1, 53, 'Capa iPhone', 1, NOW()-INTERVAL'55 days'),
  ('income','Venda ORD-2026-0052',   249.90, NOW()-INTERVAL'53 days', NOW()-INTERVAL'53 days', true,  1, 54, 'Carregador portátil', 1, NOW()-INTERVAL'53 days'),
  ('income','Venda ORD-2026-0053',   399.00, NOW()-INTERVAL'51 days', NOW()-INTERVAL'51 days', true,  1, 55, 'Fone JBL', 1, NOW()-INTERVAL'51 days'),
  ('income','Venda ORD-2026-0054',   549.00, NOW()-INTERVAL'49 days', NOW()-INTERVAL'49 days', true,  1, 56, 'Mouse MX Master', 1, NOW()-INTERVAL'49 days'),
  ('income','Venda ORD-2026-0055',   699.00, NOW()-INTERVAL'47 days', NOW()-INTERVAL'47 days', true,  1, 57, 'Fone Sony XM5', 1, NOW()-INTERVAL'47 days'),
  ('income','Venda ORD-2026-0059',  2499.00, NOW()-INTERVAL'60 days', NOW()-INTERVAL'60 days', true,  1, 1,  'Xbox Series S', 1, NOW()-INTERVAL'60 days'),
  ('income','Venda ORD-2026-0060',   649.00, NOW()-INTERVAL'58 days', NOW()-INTERVAL'58 days', true,  1, 2,  'Teclado HyperX', 1, NOW()-INTERVAL'58 days'),
  -- Receitas pendentes (a receber)
  ('income','Venda ORD-2026-0007',  1099.80, NOW()-INTERVAL'30 days', NULL, false, 1, 5,  'Pedido enviado', 1, NOW()-INTERVAL'30 days'),
  ('income','Venda ORD-2026-0008',   699.80, NOW()-INTERVAL'28 days', NULL, false, 1, 6,  'Pedido enviado', 1, NOW()-INTERVAL'28 days'),
  ('income','Venda ORD-2026-0009',  3999.00, NOW()-INTERVAL'26 days', NULL, false, 1, 7,  'PS5 enviado', 1, NOW()-INTERVAL'26 days'),
  ('income','Venda ORD-2026-0010', 11500.00, NOW()-INTERVAL'24 days', NULL, false, 1, 23, 'Corporativo', 1, NOW()-INTERVAL'24 days'),
  ('income','Serviço de Suporte TI', 1500.00, NOW()-INTERVAL'10 days', NULL, false, 2, 22, 'Mensal', 1, NOW()-INTERVAL'10 days'),
  ('income','Consultoria Tech',       800.00, NOW()-INTERVAL'5 days',  NULL, false, 2, 24, 'Setup sistemas', 1, NOW()-INTERVAL'5 days'),
  -- Despesas pagas
  ('expense','Aluguel Março/2026',   4500.00, NOW()-INTERVAL'5 days',  NOW()-INTERVAL'5 days',  true,  4, NULL, 'Loja + escritório', 1, NOW()-INTERVAL'5 days'),
  ('expense','Salários Fev/2026',   18000.00, NOW()-INTERVAL'5 days',  NOW()-INTERVAL'5 days',  true,  5, NULL, '10 vendedores', 1, NOW()-INTERVAL'5 days'),
  ('expense','Fornecedor Samsung',  25000.00, NOW()-INTERVAL'15 days', NOW()-INTERVAL'15 days', true,  6, NULL, 'Reposição smartphones', 1, NOW()-INTERVAL'15 days'),
  ('expense','Fornecedor Logitech',  8000.00, NOW()-INTERVAL'20 days', NOW()-INTERVAL'20 days', true,  6, NULL, 'Periféricos', 1, NOW()-INTERVAL'20 days'),
  ('expense','Google Ads',           1200.00, NOW()-INTERVAL'3 days',  NOW()-INTERVAL'3 days',  true,  7, NULL, 'Campanha Mar/2026', 1, NOW()-INTERVAL'3 days'),
  ('expense','Frete / Correios',      350.00, NOW()-INTERVAL'10 days', NOW()-INTERVAL'10 days', true,  8, NULL, 'Envios semana', 1, NOW()-INTERVAL'10 days'),
  ('expense','Imposto DAS',          2100.00, NOW()-INTERVAL'2 days',  NOW()-INTERVAL'2 days',  true,  9, NULL, 'Simples Nacional', 1, NOW()-INTERVAL'2 days'),
  ('expense','Manutenção sistemas',   600.00, NOW()-INTERVAL'7 days',  NOW()-INTERVAL'7 days',  true,  10,NULL, 'Servidor mensal', 1, NOW()-INTERVAL'7 days'),
  -- Despesas pendentes (a pagar)
  ('expense','Aluguel Abril/2026',   4500.00, NOW()+INTERVAL'25 days', NULL, false, 4, NULL, 'Próximo vencimento', 1, NOW()),
  ('expense','Salários Mar/2026',   18000.00, NOW()+INTERVAL'26 days', NULL, false, 5, NULL, '10 vendedores', 1, NOW()),
  ('expense','Fornecedor JBL',       5500.00, NOW()+INTERVAL'10 days', NULL, false, 6, NULL, 'Áudio nov lote', 1, NOW()),
  ('expense','Meta Ads',             1500.00, NOW()+INTERVAL'15 days', NULL, false, 7, NULL, 'Campanha Abr/2026', 1, NOW()),
  ('expense','Seguro da loja',        800.00, NOW()+INTERVAL'20 days', NULL, false, 10,NULL, 'Anual parcela', 1, NOW());

-- ─── PIPELINES E LEADS (CRM) ─────────────────────────────────────────────────

INSERT INTO pipelines (name, color, position) VALUES
  ('Prospecção',    '#6366f1', 0),
  ('Qualificação',  '#f59e0b', 1),
  ('Proposta',      '#3b82f6', 2),
  ('Negociação',    '#8b5cf6', 3),
  ('Fechamento',    '#10b981', 4);

INSERT INTO leads (name, company, email, phone, source, pipeline_id, estimated_value, probability, expected_close, status, user_id, notes, created_at) VALUES
  ('Gustavo Pedrosa',      'Pedrosa Tech ME',        'gustavo@pedrosatech.com', '(11) 98200-0001', 'site',       1, 5000.00,  20, NOW()+INTERVAL'30 days', 'open', 1, 'Interessado em notebooks', NOW()-INTERVAL'20 days'),
  ('Roberta Vianna',       NULL,                      'roberta@gmail.com',       '(11) 98200-0002', 'instagram',  1, 1500.00,  25, NOW()+INTERVAL'20 days', 'open', 1, 'Quer iPhone + acessórios', NOW()-INTERVAL'18 days'),
  ('Nelson Carvalho',      'NC Distribuidora',        'nelson@ncdist.com.br',    '(11) 98200-0003', 'indicação',  2, 30000.00, 40, NOW()+INTERVAL'45 days', 'open', 1, 'Compra em volume p/ revenda', NOW()-INTERVAL'15 days'),
  ('Silvana Motta',        NULL,                      'silvana@hotmail.com',     '(11) 98200-0004', 'google',     2, 3800.00,  45, NOW()+INTERVAL'15 days', 'open', 1, 'Notebook para home office', NOW()-INTERVAL'12 days'),
  ('Joaquim Bastos',       'Bastos Soluções',         'jbastos@bsol.com.br',     '(11) 98200-0005', 'linkedin',   3, 15000.00, 60, NOW()+INTERVAL'25 days', 'open', 1, 'Equipar novo escritório', NOW()-INTERVAL'10 days'),
  ('Renata Figueira',      NULL,                      'renata.fig@gmail.com',    '(11) 98200-0006', 'instagram',  3, 2000.00,  55, NOW()+INTERVAL'10 days', 'open', 1, 'Setup gamer completo', NOW()-INTERVAL'8 days'),
  ('Márcio Loureiro',      'Loureiro Consultoria',   'marcio@lconsult.com',     '(11) 98200-0007', 'indicação',  3, 8000.00,  65, NOW()+INTERVAL'20 days', 'open', 1, 'Workstations equipe', NOW()-INTERVAL'6 days'),
  ('Tania Cristofoletti',  NULL,                      'tania.c@yahoo.com',       '(11) 98200-0008', 'site',       4, 1200.00,  75, NOW()+INTERVAL'5 days',  'open', 1, 'Smart TV sala', NOW()-INTERVAL'5 days'),
  ('Wilson Pacheco',       'Pacheco e Filhos ME',     'wilson@pacheco.com.br',   '(11) 98200-0009', 'google',     4, 25000.00, 80, NOW()+INTERVAL'8 days',  'open', 1, 'Revenda eletrônicos', NOW()-INTERVAL'4 days'),
  ('Cíntia Lacerda',       NULL,                      'cintia.l@gmail.com',      '(11) 98200-0010', 'whatsapp',   4, 600.00,   80, NOW()+INTERVAL'3 days',  'open', 1, 'Fone premium + case', NOW()-INTERVAL'3 days'),
  ('Evandro Novaes',       'Novaes Agência Digital',  'evandro@nagencia.com.br', '(11) 98200-0011', 'linkedin',   5, 12000.00, 90, NOW()+INTERVAL'2 days',  'open', 1, 'Setup produção vídeo', NOW()-INTERVAL'2 days'),
  ('Mônica Salles',        NULL,                      'monica.s@hotmail.com',    '(11) 98200-0012', 'instagram',  5, 2800.00,  90, NOW()+INTERVAL'1 day',   'open', 1, 'Notebook + periféricos', NOW()-INTERVAL'1 day'),
  ('Arnaldo Corrêa',       'Corrêa Atacado',          'arnaldo@correa.com.br',   '(11) 98200-0013', 'indicação',  2, 50000.00, 35, NOW()+INTERVAL'60 days', 'open', 1, 'Grande volume trimestral', NOW()-INTERVAL'25 days'),
  ('Sônia Vasconcelos',    NULL,                      'sonia.v@gmail.com',       '(11) 98200-0014', 'google',     1, 900.00,   20, NOW()+INTERVAL'30 days', 'open', 1, 'Presente aniversário filha', NOW()-INTERVAL'7 days'),
  ('Eduardo Monteiro',     'EM Informática',          'edu@eminformatica.com',   '(11) 98200-0015', 'site',       3, 7500.00,  60, NOW()+INTERVAL'15 days', 'open', 1, 'Manutenção + peças', NOW()-INTERVAL'9 days'),
  -- Leads perdidos
  ('Rodrigo Assis',        NULL,                      'rodrigo.as@gmail.com',    '(11) 98200-0016', 'google',     1, 1500.00,  0,  NULL, 'lost', 1, 'Comprou na concorrência', NOW()-INTERVAL'30 days'),
  ('Keila Marques',        'Keila Moda',              'keila@keilamoda.com',     '(11) 98200-0017', 'instagram',  2, 3000.00,  0,  NULL, 'lost', 1, 'Orçamento acima do esperado', NOW()-INTERVAL'25 days');

-- ─── ACTIVITIES (CRM) ────────────────────────────────────────────────────────

INSERT INTO activities (lead_id, type, title, description, due_date, done, user_id, created_at) VALUES
  (1,  'call',    'Ligar para Gustavo',          'Apresentar linha de notebooks', NOW()+INTERVAL'1 day',  false, 1, NOW()),
  (2,  'email',   'Enviar catálogo iPhones',     'Modelos A54 e iPhone 15',       NOW()+INTERVAL'1 day',  false, 1, NOW()),
  (3,  'meeting', 'Reunião corporativa Nelson',  'Proposta volume mínimo 50 un',  NOW()+INTERVAL'3 days', false, 1, NOW()),
  (4,  'call',    'Follow-up Silvana',           'Fechar especificações',         NOW()+INTERVAL'2 days', false, 1, NOW()),
  (5,  'meeting', 'Visita presencial Joaquim',   'Demo equipamentos escritório',  NOW()+INTERVAL'5 days', false, 1, NOW()),
  (6,  'email',   'Orçamento setup gamer',       'Monitor + teclado + fone',      NOW()+INTERVAL'1 day',  false, 1, NOW()),
  (7,  'call',    'Negociar prazo Márcio',       'Workstations + garantia',       NOW()+INTERVAL'4 days', false, 1, NOW()),
  (8,  'email',   'Proposta final TV Tania',     'Smart TV 55" QLED',             NOW(),                  false, 1, NOW()),
  (9,  'meeting', 'Reunião fechamento Wilson',   'Contrato revenda trimestral',   NOW()+INTERVAL'2 days', false, 1, NOW()),
  (10, 'call',    'Confirmar pedido Cíntia',     'Fone Sony + case proteção',     NOW(),                  false, 1, NOW()),
  (11, 'meeting', 'Entrega proposta Evandro',    'Setup completo produção vídeo', NOW()+INTERVAL'1 day',  false, 1, NOW()),
  (12, 'call',    'Fechar com Mônica',           'Notebook + monitor + mouse',    NOW(),                  false, 1, NOW()),
  (1,  'email',   'Enviado catálogo Gustavo',    'Modelos i5 e Ryzen 5',         NOW()-INTERVAL'5 days', true,  1, NOW()-INTERVAL'5 days'),
  (3,  'call',    'Primeiro contato Nelson',     'Mapeamento necessidades',       NOW()-INTERVAL'10 days',true,  1, NOW()-INTERVAL'10 days'),
  (5,  'email',   'Proposta inicial Joaquim',    'Cotação 20 notebooks',         NOW()-INTERVAL'3 days', true,  1, NOW()-INTERVAL'3 days');

-- ─── MOVIMENTAÇÕES DE ESTOQUE ────────────────────────────────────────────────

INSERT INTO stock_movements (product_id, type, quantity, previous_qty, new_qty, reason, reference_type, user_id, created_at) VALUES
  (1,  'entrada', 50, 0,  50,  'Compra inicial fornecedor', 'manual', 1, NOW()-INTERVAL'60 days'),
  (2,  'entrada', 40, 0,  40,  'Compra inicial fornecedor', 'manual', 1, NOW()-INTERVAL'60 days'),
  (3,  'entrada', 20, 0,  20,  'Compra inicial fornecedor', 'manual', 1, NOW()-INTERVAL'60 days'),
  (4,  'entrada', 12, 0,  12,  'Compra inicial fornecedor', 'manual', 1, NOW()-INTERVAL'60 days'),
  (5,  'entrada', 15, 0,  15,  'Compra inicial fornecedor', 'manual', 1, NOW()-INTERVAL'60 days'),
  (17, 'entrada', 30, 0,  30,  'Compra lote mouse Logitech','manual', 1, NOW()-INTERVAL'45 days'),
  (25, 'entrada', 35, 0,  35,  'Compra lote JBL',           'manual', 1, NOW()-INTERVAL'45 days'),
  (10, 'entrada',200, 0, 200,  'Compra lote capas',         'manual', 1, NOW()-INTERVAL'45 days'),
  (31, 'entrada',600, 0, 600,  'Compra lote cabos',         'manual', 1, NOW()-INTERVAL'45 days'),
  (1,  'saida',   8, 50, 42,   'Pedidos confirmados',       'order',  1, NOW()-INTERVAL'30 days'),
  (4,  'saida',   4, 12, 8,    'Venda corporativa',         'order',  1, NOW()-INTERVAL'30 days'),
  (17, 'saida',   5, 30, 25,   'Pedidos enviados',          'order',  1, NOW()-INTERVAL'20 days'),
  (25, 'saida',   5, 35, 30,   'Pedidos entregues',         'order',  1, NOW()-INTERVAL'20 days');

-- Confirma tudo
SELECT
  (SELECT COUNT(*) FROM products)       AS produtos,
  (SELECT COUNT(*) FROM clients)        AS clientes,
  (SELECT COUNT(*) FROM sellers)        AS vendedores,
  (SELECT COUNT(*) FROM orders)         AS pedidos,
  (SELECT COUNT(*) FROM order_items)    AS itens_pedido,
  (SELECT COUNT(*) FROM transactions)   AS transacoes,
  (SELECT COUNT(*) FROM leads)          AS leads,
  (SELECT COUNT(*) FROM activities)     AS atividades,
  (SELECT COUNT(*) FROM categories)     AS categorias,
  (SELECT COUNT(*) FROM financial_categories) AS cat_financeiras;
