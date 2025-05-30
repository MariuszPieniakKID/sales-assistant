# Wdrożenie aplikacji Sales Assistant

## 🗃️ Baza danych - Neon PostgreSQL

Twoja aplikacja jest już skonfigurowana do używania bazy danych Neon PostgreSQL:

- **Projekt ID**: `bitter-sun-28647435`
- **Database**: `asystent`
- **Region**: `eu-central-1` (Frankfurt)
- **Użytkownik testowy**: test@test.pl / hasło: test123
- **Administrator**: admin@admin.pl / hasło: test123

### Dane połączenia
```
Host: ep-red-salad-a28d0d0e-pooler.eu-central-1.aws.neon.tech
Database: asystent
User: asystent_owner
Password: npg_l5AZrIXmOu7D
```

## 🚀 Opcje hostingu dla aplikacji Node.js

### 1. Vercel (Rekomendowane) ⭐
- **Darmowy plan**: Do 100GB bandwidth/miesiąc
- **Automatyczne wdrożenia** z GitHub
- **Edge Functions** dla globalnego zasięgu

**Kroki wdrożenia:**
1. Pushuj kod do GitHub
2. Importuj projekt w Vercel
3. Dodaj zmienne środowiskowe:
   ```
   DATABASE_URL=postgresql://asystent_owner:npg_l5AZrIXmOu7D@ep-red-salad-a28d0d0e-pooler.eu-central-1.aws.neon.tech/asystent?sslmode=require
   SESSION_SECRET=your-secret-key
   ```

### 2. Railway
- **Proste wdrożenie** z GitHub
- **$5/miesiąc** za aktywny projekt
- **Automatyczne skalowanie**

### 3. Render
- **Darmowy plan** (z ograniczeniami)
- **Automatyczne wdrożenia**
- **SSL certificate** włączony

### 4. Heroku
- **Klasyczne rozwiązanie**
- **$7/miesiąc** za dyno
- **Dodatkowe koszty** za addony

## 📝 Przygotowanie do wdrożenia

1. **Dodaj do package.json scripts:**
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "echo 'No build step required'"
  }
}
```

2. **Ustaw zmienne środowiskowe:**
   - `DATABASE_URL` - connection string do Neon
   - `SESSION_SECRET` - losowy klucz sesji
   - `PORT` - port (zwykle ustawiany automatycznie)

3. **Pliki do dodania do .gitignore:**
```
node_modules/
.env
uploads/
*.log
.DS_Store
```

## 🔐 Bezpieczeństwo

- ✅ Baza danych Neon jest już zabezpieczona SSL
- ✅ Hasła są hashowane bcrypt
- ✅ Sesje są chronione
- 🔧 Zmień `SESSION_SECRET` na unikalny klucz w produkcji

## 📊 Monitoring

Neon automatycznie dostarcza:
- Monitoring wydajności bazy danych
- Backup automatyczny
- Metryki użycia

## 🎯 Następne kroki

1. Wybierz platformę hostingową
2. Skopiuj dane połączenia z Neon
3. Wdróż aplikację
4. Przetestuj funkcjonalność

## 👥 Konta testowe

**Użytkownik standardowy**: test@test.pl / test123
**Administrator**: admin@admin.pl / test123

### Panel administracyjny
Po zalogowaniu jako admin, dostęp do panelu przez: `/admin`
- Zarządzanie użytkownikami
- Podgląd wszystkich produktów
- Podgląd wszystkich klientów  
- Podgląd wszystkich spotkań 