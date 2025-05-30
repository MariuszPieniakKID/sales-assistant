const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Globalna konfiguracja pool dla Neon (serverless optimized)
let pool;
function getNeonPool() {
    if (!pool) {
        console.log('🔌 Tworzenie nowego pool połączeń Neon...');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            // Przywracam mniej agresywne settings
            max: 1, // Tylko 1 połączenie
            min: 0, // Żadnych stałych połączeń
            idleTimeoutMillis: 2000, // 2s zamiast 500ms
            connectionTimeoutMillis: 5000, // 5s zamiast 2s
            statement_timeout: 8000, // 8s zamiast 3s
            query_timeout: 8000, // 8s zamiast 3s
            acquireTimeoutMillis: 5000, // 5s zamiast 2s
            // Dodatkowe opcje dla stabilności
            keepAlive: false,
            keepAliveInitialDelayMillis: 0
        });
        
        // Event handlers
        pool.on('connect', (client) => {
            console.log('✅ Neon client połączony');
            // Ustaw timeout na connection level
            client.query('SET statement_timeout = 8000');
        });
        
        pool.on('error', (err) => {
            console.error('❌ Błąd Neon pool:', err.message);
        });
        
        pool.on('remove', () => {
            console.log('🔌 Neon client usunięty z pool');
        });
    }
    return pool;
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware dla Vercel
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    console.log(`📍 Request: ${req.method} ${req.url}`);
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));

// Konfiguracja sesji dla Vercel serverless z BAZĄ DANYCH
app.use(session({
    store: new pgSession({
        pool: getNeonPool(),                   // Używaj tego samego pool
        tableName: 'user_sessions',           // Nazwa tabeli sesji
        createTableIfMissing: true,           // Utwórz tabelę automatycznie
        errorLog: console.error,              // Logowanie błędów
        ttl: 30 * 60,                        // TTL w sekundach (30 min)
        pruneSessionInterval: 60 * 15        // Czyszczenie co 15 min
    }),
    secret: process.env.SESSION_SECRET || 'sales-assistant-secret-key-2023',
    resave: false, // FALSE dla pg-simple
    rolling: true, // Odnawianie sesji
    saveUninitialized: false,
    name: 'sales.sid', // Custom name
    cookie: {
        secure: false, // WYŁĄCZAM SECURE dla debugowania
        httpOnly: true,
        maxAge: 30 * 60 * 1000, // 30 minut
        sameSite: 'lax', // Ważne dla Vercel
        domain: undefined, // Pozwól na wszystkie domeny
        path: '/' // Explicit path
    }
}));

// Konfiguracja multer dla uploadów
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Testowanie połączenia z Neon (z retry logic)
async function testNeonConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🔌 Próba połączenia z Neon (${i + 1}/${retries})...`);
            const pool = getNeonPool();
            const result = await pool.query('SELECT NOW()');
            console.log('✅ Połączenie z bazą danych Neon udane!');
            
            // Sprawdzenie tabel
            const tablesResult = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            const tables = tablesResult.rows.map(row => row.table_name);
            console.log('📊 Dostępne tabele:', tables);
            return true;
        } catch (error) {
            console.error(`❌ Próba ${i + 1} nieudana:`, error.message);
            if (i === retries - 1) {
                console.error('🔧 Szczegóły błędu:', error);
                throw error;
            }
            // Czekaj przed retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Bezpieczna funkcja do wykonywania query z timeout handling
async function safeQuery(query, params = []) {
    const pool = getNeonPool();
    let client;
    
    try {
        // Timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout po 8 sekundach')), 8000);
        });
        
        const queryPromise = (async () => {
            client = await pool.connect();
            const result = await client.query(query, params);
            return result;
        })();
        
        const result = await Promise.race([queryPromise, timeoutPromise]);
        return result;
        
    } catch (error) {
        console.error('❌ Błąd safeQuery:', error.message);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Middleware do sprawdzania autoryzacji
function requireAuth(req, res, next) {
    console.log('🔐 [AUTH] Sprawdzanie autoryzacji:', {
        hasSession: !!req.session,
        hasUserId: !!req.session?.userId,
        userId: req.session?.userId,
        sessionID: req.session?.id,
        url: req.url,
        isAjax: req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest'
    });

    if (!req.session || !req.session.userId) {
        console.log('❌ [AUTH] Brak autoryzacji - przekierowanie do logowania');
        
        // Sprawdź czy to AJAX request
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
            console.log('🔧 [AUTH] AJAX request - zwracam JSON error');
            return res.status(401).json({ 
                success: false, 
                message: 'Sesja wygasła. Zaloguj się ponownie.',
                redirect: '/login.html'
            });
        }
        
        return res.redirect('/login.html');
    }
    next();
}

// Middleware sprawdzający uprawnienia admina
function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.userId === 3) { // User ID 3 to admin
    next();
  } else {
    res.status(403).json({ success: false, message: 'Brak uprawnień administratora' });
  }
}

// Debugging middleware (tylko w development)
if (process.env.NODE_ENV !== 'production') {
    app.use('/debug-session', (req, res) => {
        res.json({
            session: req.session,
            sessionID: req.sessionID,
            userId: req.session?.userId || null,
            userFirstName: req.session?.userFirstName || null,
            userLastName: req.session?.userLastName || null,
            isAuthenticated: !!req.session?.userId,
            timestamp: new Date().toISOString()
        });
    });
}

// Session debugging middleware z cookie info
app.use((req, res, next) => {
    if (req.url.includes('/api/') || req.url.includes('/dashboard')) {
        console.log(`🔍 Session Debug [${req.method} ${req.url}]:`, {
            sessionID: req.sessionID?.substring(0, 8) + '...',
            userId: req.session?.userId,
            userFirstName: req.session?.userFirstName,
            userLastName: req.session?.userLastName,
            hasUser: !!req.session?.userId,
            cookieHeader: req.headers.cookie,
            hasSessionCookie: req.headers.cookie?.includes('sales.sid')
        });
    }
    next();
});

// Routes

// Strona logowania
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

// Endpoint logowania
app.post('/api/login', async (req, res) => {
    console.log('📍 Request: POST /api/login');
    console.log('🔐 Login attempt for:', req.body.email);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
        console.log('❌ Brak email lub hasła');
        return res.status(400).json({ 
            success: false, 
            message: 'Email i hasło są wymagane' 
        });
    }

    try {
        // Sprawdzenie czy użytkownik istnieje - POPRAWKA: bez kolumny role!
        const userResult = await safeQuery(
            'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            console.log('❌ Użytkownik nie istnieje:', email);
            return res.status(401).json({ 
                success: false, 
                message: 'Nieprawidłowy email lub hasło' 
            });
        }

        const user = userResult.rows[0];
        console.log('👤 Znaleziony użytkownik:', { 
            id: user.id, 
            email: user.email
        });

        // Sprawdzenie hasła z bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            console.log('❌ Nieprawidłowe hasło dla:', email);
            return res.status(401).json({ 
                success: false, 
                message: 'Nieprawidłowy email lub hasło' 
            });
        }

        // Ustawienie sesji - PRZYWRACAM ORYGINALNE NAZEWNICTWO
        req.session.userId = user.id;  // małe d jak było wcześniej
        req.session.userEmail = user.email;
        req.session.userFirstName = user.first_name;
        req.session.userLastName = user.last_name;

        console.log('✅ Logowanie udane - sesja ustawiona:', {
            sessionID: req.session.id,
            userId: req.session.userId,  // małe d
            userEmail: req.session.userEmail
        });

        // Wymuś zapisanie sesji
        req.session.save((err) => {
            if (err) {
                console.error('❌ Błąd zapisywania sesji:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Błąd zapisywania sesji' 
                });
            }

            console.log('💾 Sesja zapisana pomyślnie');
            res.json({
                success: true,
                message: 'Zalogowano pomyślnie',
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name
                }
            });
        });

    } catch (error) {
        console.error('❌ Błąd podczas logowania:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera podczas logowania',
            error: error.message 
        });
    }
});

// Endpoint strony dashboard (dla zalogowanych użytkowników)
app.get('/dashboard', requireAuth, async (req, res) => {
    console.log('📍 Request: GET /dashboard');
    console.log('🔍 Dashboard access for user:', {
        userId: req.session.userId,
        userEmail: req.session.userEmail
    });
    
    try {
        // Pobierz podstawowe informacje o użytkowniku
        const userResult = await safeQuery(
            'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            console.log('❌ User not found in database');
            req.session.destroy();
            return res.redirect('/login.html');
        }

        const user = userResult.rows[0];
        console.log('✅ Dashboard loaded for user:', user.email);
        
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } catch (error) {
        console.error('❌ Błąd ładowania dashboard:', error.message);
        res.status(500).send('Błąd serwera');
    }
});

// Endpoint do pobierania informacji o użytkowniku
app.get('/api/user', requireAuth, async (req, res) => {
    console.log('📍 Request: GET /api/user');
    
    try {
        const result = await safeQuery(
            'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Użytkownik nie znaleziony' 
            });
        }

        const user = result.rows[0];
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });
    } catch (error) {
        console.error('❌ Błąd pobierania danych użytkownika:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera',
            error: error.message 
        });
    }
});

// Endpoint diagnostyczny dla Vercel
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) as user_count FROM users');
    
    // Test hasła
    const testUser = await client.query('SELECT email, password_hash FROM users WHERE email = $1', ['test@test.pl']);
    const passwordTest = testUser.rows.length > 0 ? 
      await bcrypt.compare('test123', testUser.rows[0].password_hash) : false;
    
    await client.release();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      userCount: result.rows[0].user_count,
      environment: process.env.NODE_ENV,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      bcryptTest: passwordTest,
      testUserExists: testUser.rows.length > 0,
      testUserHash: testUser.rows.length > 0 ? testUser.rows[0].password_hash.substring(0, 10) + '...' : 'N/A'
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'Failed',
      error: err.message,
      environment: process.env.NODE_ENV,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL
    });
  }
});

// Wylogowanie
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Błąd wylogowania' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Wylogowano pomyślnie' });
  });
});

// === OPENAI CHAT ENDPOINTS ===

// Endpoint do rozpoczęcia live chatu z OpenAI
app.post('/api/chat/start', requireAuth, async (req, res) => {
    console.log('📍 Request: POST /api/chat/start');
    
    const { clientId, productId, notes } = req.body;
    
    if (!clientId || !productId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Client ID i Product ID są wymagane' 
        });
    }
    
    try {
        // Pobierz informacje o kliencie i produkcie
        const clientResult = await safeQuery(
            'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
            [clientId, req.session.userId]
        );
        
        const productResult = await safeQuery(
            'SELECT * FROM products WHERE id = $1 AND user_id = $2',
            [productId, req.session.userId]
        );
        
        if (clientResult.rows.length === 0 || productResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Klient lub produkt nie znaleziony' 
            });
        }
        
        const client = clientResult.rows[0];
        const product = productResult.rows[0];
        
        // Pobierz 3 ostatnie rozmowy z tym klientem
        const historyResult = await safeQuery(`
            SELECT transcription, positive_findings, negative_findings, recommendations, meeting_datetime
            FROM sales 
            WHERE client_id = $1 
            AND product_id IN (SELECT id FROM products WHERE user_id = $2)
            ORDER BY meeting_datetime DESC 
            LIMIT 3
        `, [clientId, req.session.userId]);
        
        const previousMeetings = historyResult.rows;
        
        // Utwórz rozszerzony kontekst dla ChatGPT
        let historySection = '';
        if (previousMeetings.length > 0) {
            historySection = `\n\nHISTORIA 3 OSTATNICH ROZMÓW Z KLIENTEM:`;
            previousMeetings.forEach((meeting, index) => {
                historySection += `\n--- ROZMOWA ${index + 1} (${new Date(meeting.meeting_datetime).toLocaleDateString('pl-PL')}) ---`;
                if (meeting.transcription) {
                    historySection += `\nTranskrypcja: ${meeting.transcription.substring(0, 500)}...`;
                }
                if (meeting.positive_findings) {
                    historySection += `\nPozytywne wnioski: ${meeting.positive_findings}`;
                }
                if (meeting.negative_findings) {
                    historySection += `\nNegatywne wnioski: ${meeting.negative_findings}`;
                }
                if (meeting.recommendations) {
                    historySection += `\nRekomendacje: ${meeting.recommendations}`;
                }
            });
        } else {
            historySection = '\n\nHISTORIA ROZMÓW: To pierwsza rozmowa z tym klientem.';
        }
        
        const systemPrompt = `Jesteś moim asystentem sprzedażowym. Pomagasz mi sprzedać mój produkt. 

TWOJA ROLA:
- Informuj mnie na bieżąco w trakcie rozmowy co mogę poprawić
- Podpowiadaj pytania oraz sugestje co mogę jeszcze dodać aby domknąć sprzedaż
- Wyczuwaj intencje klienta i informuj mnie o nich
- Odpowiadaj KRÓTKO i KONKRETNIE (max 2 zdania)
- Koncentruj się na praktycznych poradach sprzedażowych

INFORMACJE O KLIENCIE:
- Nazwa: ${client.name}
- Opis: ${client.description || 'Brak opisu'}
- Komentarz: ${client.comment || 'Brak komentarza'}
- AI Notes: ${client.ai_notes || 'Brak notatek AI'}

INFORMACJE O PRODUKCIE:
- Nazwa: ${product.name}
- Opis: ${product.description || 'Brak opisu'}
- Komentarz: ${product.comment || 'Brak komentarza'}

NOTATKI WSTĘPNE: ${notes || 'Brak notatek'}${historySection}

INSTRUKCJE ODPOWIEDZI:
- Dawaj mi konkretne sugestie co powiedzieć
- Ostrzegaj przed błędami
- Wskazuj kiedy klient jest gotowy na ofertę
- Podpowiadaj pytania otwarte
- Informuj o emocjach i intencjach klienta`;
        
        res.json({
            success: true,
            message: 'Chat rozpoczęty',
            chatContext: {
                clientName: client.name,
                productName: product.name,
                systemPrompt: systemPrompt,
                hasHistory: previousMeetings.length > 0,
                historyCount: previousMeetings.length
            }
        });
        
    } catch (error) {
        console.error('❌ Błąd rozpoczynania chatu:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera podczas rozpoczynania chatu',
            error: error.message 
        });
    }
});

// Endpoint do zapisywania sesji po zakończeniu rozmowy
app.post('/api/chat/save-session', requireAuth, async (req, res) => {
    console.log('📍 Request: POST /api/chat/save-session');
    
    const { clientId, productId, conversationHistory, notes, startTime } = req.body;
    
    if (!clientId || !productId || !conversationHistory) {
        return res.status(400).json({ 
            success: false, 
            message: 'Dane sesji są niekompletne' 
        });
    }
    
    try {
        // Stwórz transkrypcję z historii rozmowy
        const transcription = conversationHistory
            .filter(msg => msg.role !== 'system')
            .map(msg => {
                const role = msg.role === 'user' ? 'SPRZEDAWCA' : 'ASYSTENT';
                return `${role}: ${msg.content}`;
            })
            .join('\n\n');
        
        console.log('📝 Transkrypcja utworzona, długość:', transcription.length);
        
        // Wyślij całą rozmowę do ChatGPT dla analizy
        console.log('🤖 Wysyłam rozmowę do analizy ChatGPT...');
        
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        const analysisPrompt = `Przeanalizuj poniższą rozmowę sprzedażową i podaj:

1. POZYTYWNE WNIOSKI: Co poszło dobrze w tej rozmowie? (maksymalnie 200 słów)
2. NEGATYWNE WNIOSKI: Co można było zrobić lepiej? (maksymalnie 200 słów)  
3. REKOMENDACJE: Konkretne sugestie na następną rozmowę z tym klientem (maksymalnie 200 słów)

TRANSKRYPCJA ROZMOWY:
${transcription}

Odpowiedz w formacie:
POZYTYWNE:
[twoja analiza]

NEGATYWNE:
[twoja analiza]

REKOMENDACJE:
[twoje rekomendacje]`;

        const analysisResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: analysisPrompt }],
            max_tokens: 800,
            temperature: 0.3
        });
        
        const analysis = analysisResponse.choices[0].message.content;
        console.log('✅ Analiza otrzymana:', analysis.substring(0, 100) + '...');
        
        // Parsuj analizę
        const sections = analysis.split(/POZYTYWNE:|NEGATYWNE:|REKOMENDACJE:/);
        const positiveFindings = sections[1]?.trim() || 'Brak analizy pozytywnej';
        const negativeFindings = sections[2]?.trim() || 'Brak analizy negatywnej';
        const recommendations = sections[3]?.trim() || 'Brak rekomendacji';
        
        // Zapisz sesję do bazy danych
        const sessionResult = await safeQuery(`
            INSERT INTO sales (
                product_id, client_id, recording_path, transcription, meeting_datetime,
                positive_findings, negative_findings, recommendations, own_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [
            productId,
            clientId,
            'live_chat_session', // Placeholder dla recording_path
            transcription,
            startTime || new Date(),
            positiveFindings,
            negativeFindings,
            recommendations,
            notes || ''
        ]);
        
        const savedSession = sessionResult.rows[0];
        console.log('✅ Sesja zapisana z ID:', savedSession.id);
        
        res.json({
            success: true,
            message: 'Sesja zapisana pomyślnie',
            session: {
                id: savedSession.id,
                transcription: transcription,
                positiveFindings: positiveFindings,
                negativeFindings: negativeFindings,
                recommendations: recommendations,
                meetingDatetime: savedSession.meeting_datetime
            }
        });
        
    } catch (error) {
        console.error('❌ Błąd zapisywania sesji:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd zapisywania sesji: ' + error.message 
        });
    }
});

// Endpoint do komunikacji z OpenAI (streaming)
app.post('/api/chat/message', requireAuth, async (req, res) => {
    console.log('📍 Request: POST /api/chat/message (STREAMING)');
    
    const { message, systemPrompt, conversationHistory } = req.body;
    
    if (!message) {
        return res.status(400).json({ 
            success: false, 
            message: 'Wiadomość jest wymagana' 
        });
    }
    
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        console.log('🤖 Wysyłam streaming request do OpenAI...');
        
        // Skrócona historia (ostatnie 6 wiadomości dla szybkości)
        const recentHistory = conversationHistory.slice(-6);
        
        const messages = [
            { 
                role: 'system', 
                content: systemPrompt || `Jesteś profesjonalnym asystentem sprzedażowym. Odpowiadaj KRÓTKO i KONKRETNIE (max 2-3 zdania). Mów naturalnie, jak w rozmowie telefonicznej.`
            },
            ...recentHistory,
            { role: 'user', content: message }
        ];
        
        // Ustaw nagłówki dla streaming
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        const stream = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', // Szybszy model
            messages: messages,
            stream: true,
            max_tokens: 150, // Ograniczenie dla szybkości
            temperature: 0.7
        });
        
        console.log('📡 Rozpoczynam streaming odpowiedzi...');
        let fullResponse = '';
        
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                // Wyślij chunk natychmiast
                res.write(content);
                console.log('📤 Chunk:', content);
            }
        }
        
        res.end();
        console.log('✅ Streaming zakończony, pełna odpowiedź:', fullResponse);
        
    } catch (error) {
        console.error('❌ Błąd streaming OpenAI:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                message: 'Błąd komunikacji z ChatGPT: ' + error.message 
            });
        } else {
            res.end();
        }
    }
});

// Endpoint do pobierania produktów
app.get('/api/products', requireAuth, async (req, res) => {
    console.log('📍 Request: GET /api/products');
    console.log('🔍 Session Debug [GET /api/products]:', {
        sessionID: req.session?.id?.slice(0, 8) + '...',
        userId: req.session?.userId,
        userFirstName: req.session?.userFirstName,
        userLastName: req.session?.userLastName,
        hasUser: !!req.session?.userId
    });

    try {
        const pool = getNeonPool();
        const result = await pool.query('SELECT * FROM products WHERE user_id = $1 ORDER BY id DESC', [req.session.userId]);
        console.log(`✅ Pobrano ${result.rows.length} produktów dla user_id: ${req.session.userId}`);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Błąd podczas pobierania produktów:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd podczas pobierania produktów',
            error: error.message 
        });
    }
});

app.post('/api/products', requireAuth, upload.array('files'), async (req, res) => {
  const { name, description, comment } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Dodaj produkt
    const productResult = await client.query(
      'INSERT INTO products (user_id, name, description, comment) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.session.userId, name, description, comment]
    );
    
    const productId = productResult.rows[0].id;
    
    // Dodaj pliki jeśli zostały przesłane
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES ($1, $2, $3, $4)',
          [productId, file.originalname, file.path, file.mimetype]
        );
      }
    }
    
    await client.release();
    res.json({ success: true, product: productResult.rows[0] });
    
  } catch (err) {
    console.error('Błąd dodawania produktu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Edycja produktu
app.put('/api/products/:id', requireAuth, upload.array('files'), async (req, res) => {
  const productId = req.params.id;
  const { name, description, comment } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy produkt należy do użytkownika
    const checkResult = await client.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [productId, req.session.userId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Produkt nie znaleziony' });
    }
    
    // Aktualizuj produkt
    const updateResult = await client.query(
      'UPDATE products SET name = $1, description = $2, comment = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
      [name, description, comment, productId, req.session.userId]
    );
    
    // Dodaj nowe pliki jeśli zostały przesłane
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES ($1, $2, $3, $4)',
          [productId, file.originalname, file.path, file.mimetype]
        );
      }
    }
    
    await client.release();
    res.json({ success: true, product: updateResult.rows[0] });
    
  } catch (err) {
    console.error('Błąd edycji produktu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Usuwanie produktu
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const productId = req.params.id;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy produkt należy do użytkownika
    const checkResult = await client.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [productId, req.session.userId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Produkt nie znaleziony' });
    }
    
    // Pobierz pliki do usunięcia
    const filesResult = await client.query(
      'SELECT file_path FROM product_files WHERE product_id = $1',
      [productId]
    );
    
    // Usuń pliki z dysku
    for (const fileRow of filesResult.rows) {
      try {
        if (fs.existsSync(fileRow.file_path)) {
          fs.unlinkSync(fileRow.file_path);
        }
      } catch (fileErr) {
        console.error('Błąd usuwania pliku:', fileErr);
      }
    }
    
    // Usuń produkt (CASCADE usunie też pliki z bazy)
    await client.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2',
      [productId, req.session.userId]
    );
    
    await client.release();
    res.json({ success: true, message: 'Produkt usunięty' });
    
  } catch (err) {
    console.error('Błąd usuwania produktu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Endpoint do pobierania klientów
app.get('/api/clients', requireAuth, async (req, res) => {
    console.log('📍 Request: GET /api/clients');
    console.log('🔍 Session Debug [GET /api/clients]:', {
        sessionID: req.session?.id?.slice(0, 8) + '...',
        userId: req.session?.userId,
        hasUser: !!req.session?.userId
    });

    try {
        const pool = getNeonPool();
        const result = await pool.query('SELECT * FROM clients WHERE user_id = $1 ORDER BY id DESC', [req.session.userId]);
        console.log(`✅ Pobrano ${result.rows.length} klientów dla user_id: ${req.session.userId}`);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Błąd podczas pobierania klientów:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd podczas pobierania klientów',
            error: error.message 
        });
    }
});

app.post('/api/clients', requireAuth, async (req, res) => {
  const { name, description, comment, ai_notes } = req.body;
  
  try {
    const result = await safeQuery(
      'INSERT INTO clients (user_id, name, description, comment, ai_notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.session.userId, name, description, comment, ai_notes]
    );
    res.json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('Błąd dodawania klienta:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Edycja klienta
app.put('/api/clients/:id', requireAuth, async (req, res) => {
  const clientId = req.params.id;
  const { name, description, comment, ai_notes } = req.body;
  
  try {
    // Sprawdź czy klient należy do użytkownika
    const checkResult = await safeQuery(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [clientId, req.session.userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Klient nie znaleziony' });
    }
    
    const result = await safeQuery(
      'UPDATE clients SET name = $1, description = $2, comment = $3, ai_notes = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
      [name, description, comment, ai_notes, clientId, req.session.userId]
    );
    
    res.json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('Błąd edycji klienta:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Usuwanie klienta
app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  const clientId = req.params.id;
  
  try {
    // Sprawdź czy klient należy do użytkownika i usuń
    const result = await safeQuery(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2',
      [clientId, req.session.userId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Klient nie znaleziony' });
    }
    
    res.json({ success: true, message: 'Klient usunięty' });
  } catch (err) {
    console.error('Błąd usuwania klienta:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// API dla spotkań
app.get('/api/sales', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT s.*, c.name as client_name, p.name as product_name 
      FROM sales s 
      JOIN clients c ON s.client_id = c.id 
      JOIN products p ON s.product_id = p.id 
      WHERE p.user_id = $1 
      ORDER BY s.meeting_datetime DESC
    `, [req.session.userId]);
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania spotkań:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Aktualizacja notatek spotkania
app.put('/api/sales/:id/notes', requireAuth, async (req, res) => {
  const meetingId = req.params.id;
  const { notes } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy spotkanie należy do użytkownika (przez produkt)
    const checkResult = await client.query(`
      SELECT s.* FROM sales s 
      JOIN products p ON s.product_id = p.id 
      WHERE s.id = $1 AND p.user_id = $2
    `, [meetingId, req.session.userId]);
    
    if (checkResult.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Spotkanie nie znalezione' });
    }
    
    // Aktualizuj notatki
    const result = await client.query(
      'UPDATE sales SET own_notes = $1 WHERE id = $2 RETURNING *',
      [notes, meetingId]
    );
    
    await client.release();
    res.json({ success: true, meeting: result.rows[0] });
    
  } catch (err) {
    console.error('Błąd aktualizacji notatek:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// API dla profilu użytkownika
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT id, first_name, last_name, email, phone, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }
    
    await client.release();
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Błąd pobierania profilu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Aktualizacja profilu użytkownika
app.put('/api/profile', requireAuth, async (req, res) => {
  const { firstName, lastName, email, phone } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy email nie jest używany przez innego użytkownika
    if (email) {
      const emailCheck = await client.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, req.session.userId]
      );
      
      if (emailCheck.rows.length > 0) {
        await client.release();
        return res.status(400).json({ success: false, message: 'Ten email jest już używany' });
      }
    }
    
    // Aktualizuj profil
    const result = await client.query(`
      UPDATE users 
      SET first_name = $1, last_name = $2, email = $3, phone = $4 
      WHERE id = $5 
      RETURNING id, first_name, last_name, email, phone
    `, [firstName, lastName, email, phone, req.session.userId]);
    
    await client.release();
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Błąd aktualizacji profilu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Zmiana hasła
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Pobierz obecne hasło
    const userResult = await client.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }
    
    // Sprawdź obecne hasło
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    
    if (!isCurrentPasswordValid) {
      await client.release();
      return res.status(400).json({ success: false, message: 'Obecne hasło jest nieprawidłowe' });
    }
    
    // Zaszyfruj nowe hasło
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Zaktualizuj hasło
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, req.session.userId]
    );
    
    await client.release();
    res.json({ success: true, message: 'Hasło zostało zmienione' });
  } catch (err) {
    console.error('Błąd zmiany hasła:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Statystyki użytkownika
app.get('/api/user-stats', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Policz produkty użytkownika
    const productsResult = await client.query(
      'SELECT COUNT(*) as count FROM products WHERE user_id = $1',
      [req.session.userId]
    );
    
    // Policz spotkania użytkownika
    const meetingsResult = await client.query(`
      SELECT COUNT(*) as count FROM sales s 
      JOIN products p ON s.product_id = p.id 
      WHERE p.user_id = $1
    `, [req.session.userId]);
    
    // Oblicz wiek konta
    const userResult = await client.query(
      'SELECT created_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    let accountAge = 0;
    if (userResult.rows.length > 0) {
      const createdAt = new Date(userResult.rows[0].created_at);
      const now = new Date();
      accountAge = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    }
    
    await client.release();
    
    res.json({
      productsCount: parseInt(productsResult.rows[0].count),
      meetingsCount: parseInt(meetingsResult.rows[0].count),
      accountAge: accountAge
    });
  } catch (err) {
    console.error('Błąd pobierania statystyk:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Serwowanie stron poszczególnych sekcji
app.get('/produkty', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'produkty.html'));
});

app.get('/klienci', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'klienci.html'));
});

app.get('/spotkania', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'spotkania.html'));
});

app.get('/profil', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'profil.html'));
});

app.get('/sesja', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'sesja.html'));
});

// === ADMIN ENDPOINTS ===

// Route dla panelu admina
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sections', 'admin.html'));
});

// Pobieranie wszystkich użytkowników (admin)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT id, first_name, last_name, email, phone, created_at FROM users ORDER BY created_at DESC'
    );
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania użytkowników:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Dodawanie użytkownika (admin)
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy email nie istnieje
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      await client.release();
      return res.status(400).json({ success: false, message: 'Ten email jest już używany' });
    }
    
    // Zaszyfruj hasło
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Dodaj użytkownika
    const result = await client.query(
      'INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, phone, created_at',
      [firstName, lastName, email, phone, passwordHash]
    );
    
    await client.release();
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Błąd dodawania użytkownika:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Edycja użytkownika (admin)
app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { firstName, lastName, email, phone, password } = req.body;
  
  try {
    const client = await pool.connect();
    
    // Sprawdź czy email nie jest używany przez innego użytkownika
    const emailCheck = await client.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );
    
    if (emailCheck.rows.length > 0) {
      await client.release();
      return res.status(400).json({ success: false, message: 'Ten email jest już używany' });
    }
    
    let query, params;
    if (password) {
      // Zmień hasło też
      const passwordHash = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET first_name = $1, last_name = $2, email = $3, phone = $4, password_hash = $5 WHERE id = $6 RETURNING id, first_name, last_name, email, phone';
      params = [firstName, lastName, email, phone, passwordHash, userId];
    } else {
      // Bez zmiany hasła
      query = 'UPDATE users SET first_name = $1, last_name = $2, email = $3, phone = $4 WHERE id = $5 RETURNING id, first_name, last_name, email, phone';
      params = [firstName, lastName, email, phone, userId];
    }
    
    const result = await client.query(query, params);
    
    if (result.rows.length === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }
    
    await client.release();
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Błąd edycji użytkownika:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Usuwanie użytkownika (admin)
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  
  // Nie pozwól usunąć siebie
  if (parseInt(userId) === req.session.userId) {
    return res.status(400).json({ success: false, message: 'Nie możesz usunąć swojego konta' });
  }
  
  try {
    const client = await pool.connect();
    const result = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    
    if (result.rowCount === 0) {
      await client.release();
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }
    
    await client.release();
    res.json({ success: true, message: 'Użytkownik usunięty' });
  } catch (err) {
    console.error('Błąd usuwania użytkownika:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Pobieranie wszystkich produktów (admin)
app.get('/api/admin/all-products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT p.*, u.first_name || ' ' || u.last_name as owner_name 
      FROM products p 
      LEFT JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC
    `);
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Pobieranie wszystkich klientów (admin)
app.get('/api/admin/all-clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM clients ORDER BY name ASC');
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania klientów:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Pobieranie wszystkich spotkań (admin)
app.get('/api/admin/all-meetings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT s.*, c.name as client_name, p.name as product_name, 
             u.first_name || ' ' || u.last_name as owner_name
      FROM sales s 
      JOIN clients c ON s.client_id = c.id 
      JOIN products p ON s.product_id = p.id 
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY s.meeting_datetime DESC
    `);
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania spotkań:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// Start serwera
if (process.env.NODE_ENV !== 'production') {
  // Tryb rozwojowy - uruchom normalnie
  app.listen(PORT, async () => {
    console.log(`🚀 Serwer aplikacji doradców handlowych działa na porcie ${PORT}`);
    console.log(`🌐 Otwórz http://localhost:${PORT} w przeglądarce`);
    
    // Test połączenia z bazą danych Neon
    await testNeonConnection();
  });
} else {
  // Produkcja - Vercel
  console.log('🚀 Sales Assistant App initialized for Vercel');
  console.log('📁 __dirname:', __dirname);
  console.log('📂 Public path:', path.join(__dirname, 'public'));
  console.log('🌐 NODE_ENV:', process.env.NODE_ENV);
  testNeonConnection().catch(console.error);
}

// Export dla Vercel
module.exports = app; 