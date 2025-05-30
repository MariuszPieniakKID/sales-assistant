# Przygotowanie bazy danych

## 1. Schemat bazy jest już poprawny (plik schemat.sql)

Twój obecny schemat jest odpowiedni dla aplikacji. Jedyne co musisz zrobić to dodać testowego użytkownika.

## 2. Dodanie testowego użytkownika

Wykonaj to zapytanie SQL aby dodać testowego użytkownika:

```sql
-- Dodanie testowego użytkownika (hasło: test123)
INSERT INTO users (first_name, last_name, email, phone, password_hash) 
VALUES (
    'Jan', 
    'Kowalski', 
    'test@test.pl', 
    '+48123456789', 
    '$2a$10$Shi35yNatnmaxAkK3/pbH.MaaBW2x9Ip23cS2eglLQQs6nFZK99/K'
);
```

**UWAGA:** Jeśli użytkownik już istnieje ale logowanie nie działa, zaktualizuj hasło:

```sql
-- Naprawa hasła dla istniejącego użytkownika
UPDATE users 
SET password_hash = '$2a$10$Shi35yNatnmaxAkK3/pbH.MaaBW2x9Ip23cS2eglLQQs6nFZK99/K'
WHERE email = 'test@test.pl';
```

## 3. Opcjonalnie - dodanie przykładowych danych

```sql
-- Dodanie przykładowego klienta
INSERT INTO clients (name, description, comment, ai_notes) 
VALUES (
    'ABC Sp. z o.o.',
    'Firma zajmująca się handlem detalicznym',
    'Klient zainteresowany fotowoltaiką',
    'Pozytywne nastawienie do ekologii'
);

-- Dodanie przykładowego produktu (po zalogowaniu się jako użytkownik ID=1)
INSERT INTO products (user_id, name, description, comment) 
VALUES (
    1,
    'Panele fotowoltaiczne 400W',
    'Wysokiej jakości panele słoneczne o mocy 400W',
    'Najlepszy stosunek jakości do ceny'
);
```

## 4. Sprawdzenie połączenia

Możesz sprawdzić czy wszystko działa wykonując:

```sql
SELECT * FROM users WHERE email = 'test@test.pl';
```

## Dane do logowania w aplikacji:
- **Email:** test@test.pl
- **Hasło:** test123

## WAŻNE: Naprawa schematu bazy danych

Jeśli otrzymujesz błędy typu "column name does not exist", wykonaj następujące zapytania:

```sql
-- Dodanie brakujących kolumn name
ALTER TABLE products ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Ustawienie wartości domyślnych i NOT NULL
UPDATE products SET name = 'Produkt bez nazwy' WHERE name IS NULL;
UPDATE clients SET name = 'Klient bez nazwy' WHERE name IS NULL;
ALTER TABLE products ALTER COLUMN name SET NOT NULL;
ALTER TABLE clients ALTER COLUMN name SET NOT NULL;
```

## Rozwiązywanie problemów:

### Problem z logowaniem:
1. Sprawdź czy serwer aplikacji działa na porcie 3000
2. Sprawdź logi serwera w konsoli
3. Otwórz narzędzia deweloperskie w przeglądarce (F12) i sprawdź zakładkę Console
4. Sprawdź zakładkę Network aby zobaczyć czy żądania są wysyłane

### Problem z bazą danych:
- Upewnij się że PostgreSQL działa
- Sprawdź czy baza danych 'asystent' istnieje
- Sprawdź czy użytkownik 'kid' ma dostęp do bazy 