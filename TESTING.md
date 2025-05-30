# Testowanie aplikacji Sales Assistant

## 👥 Konta testowe

### Użytkownik standardowy
- **Email**: test@test.pl
- **Hasło**: test123
- **Uprawnienia**: CRUD na własnych produktach, podgląd klientów, spotkania

### Administrator
- **Email**: admin@admin.pl  
- **Hasło**: test123
- **Uprawnienia**: Pełny dostęp do systemu, panel administracyjny

## 🧪 Scenariusze testowe

### 1. Test logowania
1. Otwórz aplikację w przeglądarce
2. Zaloguj się jako użytkownik testowy
3. Sprawdź dashboard z powitaniem "Witaj Jan"
4. Wyloguj się i zaloguj jako admin
5. Sprawdź dostęp do panelu `/admin`

### 2. Test zarządzania produktami
1. Zaloguj się jako test@test.pl
2. Przejdź do sekcji "Produkty"
3. Dodaj nowy produkt z plikami
4. Edytuj produkt
5. Usuń produkt

### 3. Test zarządzania klientami
1. Przejdź do sekcji "Klienci"
2. Dodaj nowego klienta
3. Edytuj dane klienta
4. Usuń klienta

### 4. Test panelu administracyjnego
1. Zaloguj się jako admin@admin.pl
2. Przejdź do `/admin`
3. Sprawdź listę użytkowników
4. Dodaj nowego użytkownika
5. Edytuj istniejącego użytkownika
6. Sprawdź podgląd wszystkich produktów/klientów

### 5. Test responsywności
1. Otwórz aplikację na różnych urządzeniach
2. Sprawdź menu mobilne
3. Przetestuj wszystkie funkcje na telefonie

## 🔧 Debugowanie

### Logi serwera
Aplikacja wyświetla szczegółowe logi w konsoli:
- Informacje o połączeniu z bazą danych
- Szczegóły procesów logowania
- Błędy operacji CRUD

### Sprawdzanie bazy danych
Możesz sprawdzić dane bezpośrednio w bazie:
```sql
-- Użytkownicy
SELECT * FROM users;

-- Produkty
SELECT * FROM products;

-- Klienci  
SELECT * FROM clients;

-- Spotkania
SELECT * FROM sales;
```

## 🚨 Znane problemy

1. **Pliki uploadów**: W środowisku lokalnym pliki są zapisywane w katalogu `uploads/`
2. **Sesje**: Sesje są przechowywane w pamięci serwera (nie persistent)
3. **SSL**: W środowisku lokalnym SSL jest wyłączony

## ✅ Checklist wdrożenia

- [ ] Aplikacja uruchamia się bez błędów
- [ ] Logowanie działa dla obu kont testowych
- [ ] Dashboard wyświetla się poprawnie
- [ ] CRUD produktów funkcjonuje
- [ ] CRUD klientów funkcjonuje  
- [ ] Panel admina jest dostępny
- [ ] Responsywność działa na mobile
- [ ] Połączenie z bazą Neon jest stabilne 