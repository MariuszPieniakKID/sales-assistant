-- schema.sql

-- Tabela użytkowników
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela produktów
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,         -- NOWE POLE: nazwa produktu
    description TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela plików dołączonych do produktów
CREATE TABLE product_files (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50), -- np. dokument, prezentacja
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela klientów
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,         -- NOWE POLE: nazwa klienta
    description TEXT NOT NULL,
    comment TEXT,
    ai_notes TEXT
);

-- Tabela łącząca klientów z produktami (wiele do wielu)
CREATE TABLE product_clients (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, client_id)
);

-- Tabela sprzedaży
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    recording_path TEXT NOT NULL, -- ścieżka do pliku z nagraniem
    transcription TEXT NOT NULL, -- transkrypcja spotkania
    meeting_datetime TIMESTAMP NOT NULL,
    negative_findings TEXT,
    positive_findings TEXT,
    recommendations TEXT,
    own_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
