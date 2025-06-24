# 💼 Sales Assistant - Aplikacja dla Doradców Handlowych

Nowoczesna aplikacja webowa stworzona dla doradców handlowych do zarządzania produktami, klientami i spotkaniami sprzedażowymi.

## ✨ Funkcjonalności

### 👤 **Zarządzanie użytkownikami**
- Bezpieczne logowanie z hashowaniem haseł (bcrypt)
- System ról: użytkownik standardowy + administrator
- Panel administracyjny do zarządzania kontami

### 📦 **Zarządzanie produktami**
- Dodawanie, edycja i usuwanie produktów
- Upload plików i dokumentów
- Organizacja produktów według użytkowników

### 🏢 **Zarządzanie klientami**
- Baza danych klientów
- Notatki i komentarze
- Integracja z produktami

### 📅 **Spotkania sprzedażowe**
- Planowanie i organizacja spotkań
- Notatki ze spotkań
- Historia kontaktów z klientami

### 🤖 **Real-time AI Assistant**
- Nagrywanie rozmów w czasie rzeczywistym
- Automatyczna transkrypcja głosu (AssemblyAI)
- Inteligentne sugestie sprzedażowe (OpenAI GPT)
- Analiza intencji i emocji klienta
- Wykrywanie sygnałów kupna/oporu
- **⚠️ Wymaga platformy obsługującej WebSocket** (Railway, Heroku)

### 📱 **Responsive Design**
- Nowoczesny interfejs użytkownika
- Pełna responsywność (RWD)
- Menu mobilne i adaptacyjny layout

## 🛠️ Technologie

**Backend:**
- Node.js + Express.js
- PostgreSQL (Neon Database)
- bcryptjs (hashowanie haseł)
- express-session (zarządzanie sesjami)
- multer (upload plików)
- WebSocket (real-time komunikacja)

**AI Integration:**
- OpenAI GPT-3.5/4 (sugestie sprzedażowe)
- AssemblyAI (transkrypcja głosu)
- Real-time audio processing

**Frontend:**
- Vanilla JavaScript (ES6+)
- CSS3 z Flexbox/Grid
- Font Awesome (ikony)
- Responsywny design

**Baza danych:**
- PostgreSQL na Neon (cloud)
- SSL encryption
- Automatyczne backupy

## 🚀 Szybki start

### Instalacja lokalna

1. **Klonuj repozytorium:**
```bash
git clone https://github.com/[USERNAME]/sales-assistant.git
cd sales-assistant
```

2. **Zainstaluj zależności:**
```bash
npm install
```

3. **Skonfiguruj zmienne środowiskowe:**
```bash
# Utwórz plik .env
DATABASE_URL=your_neon_database_url
SESSION_SECRET=your_session_secret
OPENAI_API_KEY=your_openai_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
```

4. **Uruchom aplikację:**
```bash
npm start
```

5. **Otwórz w przeglądarce:**
```
http://localhost:3000
```

## 👥 Konta testowe

### Użytkownik standardowy
- **Email**: test@test.pl
- **Hasło**: test123

### Administrator
- **Email**: admin@admin.pl
- **Hasło**: test123

## 🗃️ Baza danych

Aplikacja używa PostgreSQL na platformie Neon:
- **Region**: eu-central-1 (Frankfurt)
- **SSL**: Wymagane
- **Backup**: Automatyczny

## 📂 Struktura projektu

```
sales-assistant/
├── server.js              # Główny serwer Express
├── neon-config.js         # Konfiguracja bazy danych
├── package.json           # Zależności npm
├── public/                # Pliki frontend
│   ├── login.html        # Strona logowania
│   ├── dashboard.html    # Główny dashboard
│   ├── css/              # Style CSS
│   ├── js/               # Skrypty JavaScript
│   └── sections/         # Sekcje aplikacji
├── DEPLOYMENT.md         # Instrukcje wdrożenia
├── TESTING.md           # Scenariusze testowe
└── README.md           # Ten plik
```

## 🚀 Wdrożenie

### Opcje hostingu:
- **Vercel** (rekomendowane) - darmowy plan
- **Railway** - $5/miesiąc
- **Render** - darmowy plan z ograniczeniami
- **Heroku** - $7/miesiąc

Szczegółowe instrukcje: [DEPLOYMENT.md](DEPLOYMENT.md)

## 🧪 Testowanie

Kompletne scenariusze testowe: [TESTING.md](TESTING.md)

## 🔐 Bezpieczeństwo

- ✅ Hashowanie haseł (bcrypt)
- ✅ Zabezpieczone sesje
- ✅ SSL dla bazy danych
- ✅ Walidacja danych wejściowych
- ✅ Kontrola dostępu oparta na rolach

## 📝 Licencja

MIT License - szczegóły w pliku LICENSE

## 🤝 Kontrybuowanie

1. Fork projektu
2. Utwórz branch na nową funkcjonalność (`git checkout -b feature/AmazingFeature`)
3. Commit zmiany (`git commit -m 'Add some AmazingFeature'`)
4. Push do brancha (`git push origin feature/AmazingFeature`)
5. Otwórz Pull Request

## 📞 Wsparcie

W przypadku problemów:
- Sprawdź [TESTING.md](TESTING.md) dla scenariuszy debugowania
- Otwórz issue na GitHub
- Sprawdź logi aplikacji w konsoli

---

**Wykonane przez**: AI Assistant  
**Technologia**: Node.js + PostgreSQL  
**Status**: Gotowe do produkcji ✅ 