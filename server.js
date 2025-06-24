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
const WebSocket = require('ws');
const http = require('http');

// --- START: Zaawansowane logowanie do pliku ---
const logFile = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

const logToFile = (args, type = 'log') => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
  logStream.write(`[${timestamp}] [${type.toUpperCase()}] ${message}\\n`);
};

console.log = (...args) => {
  originalConsole.log.apply(console, args);
  logToFile(args, 'log');
};

console.error = (...args) => {
  originalConsole.error.apply(console, args);
  logToFile(args, 'error');
};

console.warn = (...args) => {
  originalConsole.warn.apply(console, args);
  logToFile(args, 'warn');
};

console.info = (...args) => {
  originalConsole.info.apply(console, args);
  logToFile(args, 'info');
};

console.debug = (...args) => {
  originalConsole.debug.apply(console, args);
  logToFile(args, 'debug');
};

console.log('--- Logger do pliku zainicjowany. Dane będą zapisywane w server.log ---');
// --- END: Zaawansowane logowanie do pliku ---

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support
const server = http.createServer(app);

// WebSocket Server for Real-time AI Assistant
const wss = new WebSocket.Server({ server });

// AssemblyAI Configuration
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_SAMPLE_RATE = 16000;

// Real-time sessions storage
const activeSessions = new Map();

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

// Endpoint diagnostyczny dla Railway
app.get('/api/health', async (req, res) => {
  try {
    const pool = getNeonPool();
    const result = await pool.query('SELECT COUNT(*) as user_count FROM users');
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      userCount: result.rows[0].user_count,
      environment: process.env.NODE_ENV,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAssemblyAIKey: !!process.env.ASSEMBLYAI_API_KEY,
      websocketReady: true,
      activeSessions: activeSessions.size
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
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAssemblyAIKey: !!process.env.ASSEMBLYAI_API_KEY,
      websocketReady: false
    });
  }
});

// TEST ENDPOINT - AssemblyAI Connection Test
app.get('/api/test-assemblyai', async (req, res) => {
  console.log('🧪 TEST: AssemblyAI Connection Test rozpoczęty');
  
  try {
    // Test 1: Sprawdź czy mamy API key
    if (!process.env.ASSEMBLYAI_API_KEY) {
      return res.json({
        success: false,
        error: 'ASSEMBLYAI_API_KEY not configured',
        step: 'API_KEY_CHECK'
      });
    }
    
    console.log('✅ TEST 1: API Key jest skonfigurowany');
    
    // Test 2: Sprawdź czy możemy uzyskać token
    const tokenResponse = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        'authorization': process.env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        expires_in: 3600,
        sample_rate: 16000
      })
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ TEST 2: Token request failed:', errorText);
      return res.json({
        success: false,
        error: `Token request failed: ${tokenResponse.status} ${errorText}`,
        step: 'TOKEN_REQUEST'
      });
    }
    
    const tokenData = await tokenResponse.json();
    console.log('✅ TEST 2: Token otrzymany:', tokenData.token.substring(0, 20) + '...');
    
    // Test 3: Sprawdź czy możemy utworzyć WebSocket
    const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?token=${tokenData.token}`;
    
    const testResult = await new Promise((resolve) => {
      const testWS = new WebSocket(wsUrl);
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          testWS.close();
          resolve({
            success: false,
            error: 'WebSocket connection timeout (10s)',
            step: 'WEBSOCKET_TIMEOUT'
          });
        }
      }, 10000);
      
      testWS.onopen = () => {
        console.log('✅ TEST 3: WebSocket połączony!');
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          
          // Wyślij konfigurację
          testWS.send(JSON.stringify({
            sample_rate: 16000,
            speaker_labels: true
          }));
          
          // Poczekaj chwilę na odpowiedź
          setTimeout(() => {
            testWS.close();
            resolve({
              success: true,
              message: 'AssemblyAI WebSocket connection successful',
              step: 'WEBSOCKET_SUCCESS'
            });
          }, 2000);
        }
      };
      
      testWS.onerror = (error) => {
        console.error('❌ TEST 3: WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            error: 'WebSocket connection error: ' + error.message,
            step: 'WEBSOCKET_ERROR'
          });
        }
      };
      
      testWS.onmessage = (message) => {
        console.log('📨 TEST 3: Otrzymano wiadomość z AssemblyAI:', message.data);
      };
    });
    
    res.json(testResult);
    
  } catch (error) {
    console.error('❌ TEST: AssemblyAI test failed:', error);
    res.json({
      success: false,
      error: error.message,
      step: 'GENERAL_ERROR'
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
- Słuchasz CAŁEJ rozmowy między mną (handlowcem) a klientem
- Sam rozpoznajesz kto mówi na podstawie kontekstu wypowiedzi
- Informujesz mnie na bieżąco w trakcie rozmowy co mogę poprawić
- Podpowiadasz pytania oraz sugestie co mogę jeszcze dodać aby domknąć sprzedaż
- Wyczuwasz intencje klienta i informujesz mnie o nich
- Odpowiadasz KRÓTKO i KONKRETNIE (max 2-3 zdania)
- Koncentrujesz się na praktycznych poradach sprzedażowych

WSKAZÓWKI DO ROZPOZNAWANIA KTO MÓWI:
- Klient: zadaje pytania o produkt, wyraża wątpliwości, mówi o swoich potrzebach
- Handlowiec: prezentuje produkt, odpowiada na pytania, składa ofertę
- Używaj kontekstu rozmowy do określenia kto mówi

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
- Informuj o emocjach i intencjach klienta
- ZAWSZE określaj kto mówi w analizowanym fragmencie`;
        
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

// === NOWY ENDPOINT: POBIERANIE LOGÓW ===
app.get('/api/download-logs', requireAuth, requireAdmin, (req, res) => {
  const logFilePath = path.join(__dirname, 'server.log');
  
  if (fs.existsSync(logFilePath)) {
    res.download(logFilePath, 'server.log', (err) => {
      if (err) {
        console.error("Błąd podczas wysyłania pliku z logami:", err);
        res.status(500).send("Nie udało się pobrać pliku z logami.");
      }
    });
  } else {
    res.status(404).send("Plik z logami nie istnieje.");
  }
});

// === NOWY ENDPOINT: WYŚWIETLANIE LOGÓW W KONSOLI ===
app.get('/api/view-logs', requireAuth, requireAdmin, (req, res) => {
  const logFilePath = path.join(__dirname, 'server.log');
  
  if (fs.existsSync(logFilePath)) {
    console.log("--- START LOG FILE CONTENT ---");
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    originalConsole.log(logContent); // Użyj oryginalnego console.log, aby uniknąć zapisu do pliku
    console.log("--- END LOG FILE CONTENT ---");
    res.status(200).send("Logi zostały wyświetlone w konsoli serwera. Możesz zamknąć tę kartę.");
  } else {
    res.status(404).send("Plik z logami nie istnieje.");
  }
});

// Endpoint do podglądu logów przez WWW (MOVED TO ROUTES SECTION)
app.get('/debug/logs', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Sprawdź czy plik server.log istnieje
        const logPath = path.join(__dirname, 'server.log');
        if (!fs.existsSync(logPath)) {
            return res.json({
                error: 'Log file not found',
                path: logPath,
                exists: false,
                cwd: process.cwd(),
                __dirname: __dirname
            });
        }
        
        // Odczytaj ostatnie 100 linii
        const logContent = fs.readFileSync(logPath, 'utf-8');
        const lines = logContent.split('\n').filter(line => line.trim());
        const recentLines = lines.slice(-100);
        
        res.json({
            totalLines: lines.length,
            recentLines: recentLines,
            activeSessions: Array.from(activeSessions.keys()),
            activeSessionsCount: activeSessions.size,
            timestamp: new Date().toISOString(),
            logPath: logPath
        });
        
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack,
            cwd: process.cwd(),
            __dirname: __dirname
        });
    }
});

// Endpoint do podglądu logów w HTML (MOVED TO ROUTES SECTION)
app.get('/debug/logs-viewer', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Live Logs Viewer</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; }
                .log-line { margin: 2px 0; padding: 2px 5px; }
                .error { background: #722f37; }
                .success { background: #2d5a27; }
                .websocket { background: #1a3a5c; }
                .session { background: #5c2d1a; }
                .info { background: #2d2d2d; }
                #logs { max-height: 80vh; overflow-y: auto; border: 1px solid #555; padding: 10px; }
                button { padding: 10px; margin: 5px; background: #007acc; color: white; border: none; cursor: pointer; }
                .stats { background: #333; padding: 10px; margin: 10px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>🔍 Live Server Logs</h1>
            <div class="stats" id="stats">Loading...</div>
            <button onclick="refreshLogs()">🔄 Refresh</button>
            <button onclick="autoRefresh()">⏯️ Auto Refresh</button>
            <button onclick="clearLogs()">🗑️ Clear</button>
            <div id="logs"></div>
            
            <script>
                let autoRefreshInterval = null;
                
                function refreshLogs() {
                    fetch('/debug/logs')
                        .then(r => r.json())
                        .then(data => {
                            const statsDiv = document.getElementById('stats');
                            statsDiv.innerHTML = \`
                                📊 Total Lines: \${data.totalLines} | 
                                🔗 Active Sessions: \${data.activeSessionsCount} | 
                                📅 Updated: \${new Date(data.timestamp).toLocaleTimeString()}
                                <br>Sessions: \${data.activeSessions.join(', ') || 'None'}
                                <br>Log Path: \${data.logPath || 'Unknown'}
                            \`;
                            
                            const logsDiv = document.getElementById('logs');
                            logsDiv.innerHTML = '';
                            
                            if (data.error) {
                                logsDiv.innerHTML = \`<div class="error">Error: \${data.error}</div>\`;
                                return;
                            }
                            
                            data.recentLines.forEach(line => {
                                const div = document.createElement('div');
                                div.className = 'log-line';
                                
                                if (line.includes('❌') || line.includes('ERROR') || line.includes('BŁĄD')) {
                                    div.className += ' error';
                                } else if (line.includes('✅') || line.includes('SUCCESS')) {
                                    div.className += ' success';
                                } else if (line.includes('WebSocket') || line.includes('WEBSOCKET')) {
                                    div.className += ' websocket';
                                } else if (line.includes('SESSION') || line.includes('KROK')) {
                                    div.className += ' session';
                                } else {
                                    div.className += ' info';
                                }
                                
                                div.textContent = line;
                                logsDiv.appendChild(div);
                            });
                            
                            logsDiv.scrollTop = logsDiv.scrollHeight;
                        })
                        .catch(err => {
                            document.getElementById('logs').innerHTML = \`<div class="error">Fetch Error: \${err}</div>\`;
                        });
                }
                
                function autoRefresh() {
                    if (autoRefreshInterval) {
                        clearInterval(autoRefreshInterval);
                        autoRefreshInterval = null;
                        document.querySelector('button[onclick="autoRefresh()"]').textContent = '▶️ Start Auto';
                    } else {
                        autoRefreshInterval = setInterval(refreshLogs, 2000);
                        document.querySelector('button[onclick="autoRefresh()"]').textContent = '⏸️ Stop Auto';
                    }
                }
                
                function clearLogs() {
                    document.getElementById('logs').innerHTML = '';
                }
                
                // Initial load
                refreshLogs();
            </script>
        </body>
        </html>
    `);
});

// WebSocket Connection Handler
wss.on('connection', (ws, req) => {
    console.log('🔌🔌🔌 NEW WEBSOCKET CONNECTION ESTABLISHED 🔌🔌🔌');
    console.log('🔗 Connection details:', {
        url: req.url,
        headers: req.headers,
        remoteAddress: req.socket.remoteAddress,
        timestamp: new Date().toISOString()
    });
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨📨📨 WEBSOCKET MESSAGE RECEIVED 📨📨📨');
            console.log('📨 Message type:', data.type);
            console.log('📨 Full message:', data);
            console.log('📨 Current active sessions:', activeSessions.size);
            console.log('📨 Session keys:', Array.from(activeSessions.keys()));
            
            switch (data.type) {
                case 'START_REALTIME_SESSION':
                    console.log('🚀🚀🚀 Processing START_REALTIME_SESSION 🚀🚀🚀');
                    console.log('🚀 Data received:', {
                        clientId: data.clientId,
                        productId: data.productId,
                        userId: data.userId,
                        notes: data.notes?.substring(0, 50) + '...'
                    });
                    await startRealtimeSession(ws, data);
                    break;
                    
                case 'AUDIO_CHUNK':
                    // Log every 100th audio chunk to track activity
                    if (!ws.audioChunkCount) ws.audioChunkCount = 0;
                    ws.audioChunkCount++;
                    
                    if (ws.audioChunkCount % 100 === 0) {
                        console.log('🎵 Backend: Otrzymano audio chunk', ws.audioChunkCount, {
                            sessionId: data.sessionId,
                            audioDataLength: data.audioData ? data.audioData.length : 0
                        });
                    }
                    
                    await processAudioChunk(ws, data);
                    break;
                    
                case 'END_REALTIME_SESSION':
                    console.log('🛑 Processing END_REALTIME_SESSION:', data.sessionId);
                    await endRealtimeSession(ws, data);
                    break;
                    
                case 'TEST':
                    console.log('🧪 TEST message received:', data);
                    ws.send(JSON.stringify({
                        type: 'TEST_RESPONSE',
                        message: 'WebSocket is working!',
                        originalMessage: data,
                        timestamp: new Date().toISOString()
                    }));
                    break;
                    
                default:
                    console.log('❓ Unknown message type:', data.type, data);
            }
        } catch (error) {
            console.error('❌ WebSocket message error:', error);
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: error.message
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
        // Clean up any active sessions for this connection
        for (const [sessionId, session] of activeSessions.entries()) {
            if (session.ws === ws) {
                cleanupRealtimeSession(sessionId);
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

// Start Real-time AI Assistant Session
async function startRealtimeSession(ws, data) {
    const { clientId, productId, notes } = data;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${sessionId}] [KROK 1] Rozpoczynanie sesji.`);

    try {
        console.log(`[${sessionId}] [KROK 2] Zapytanie do bazy o klienta i produkt.`);
        const [clientResult, productResult] = await Promise.all([
            safeQuery('SELECT * FROM clients WHERE id = $1', [clientId]),
            safeQuery('SELECT * FROM products WHERE id = $1', [productId])
        ]);
        console.log(`[${sessionId}] [KROK 3] Zapytanie do bazy zakończone.`);

        if (clientResult.rows.length === 0 || productResult.rows.length === 0) {
            console.error(`[${sessionId}] [BŁĄD] Nieprawidłowy ID klienta lub produktu.`);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid client or product ID' }));
            return;
        }
        console.log(`[${sessionId}] [KROK 4] Klient i produkt zweryfikowani.`);

        const client = clientResult.rows[0];
        const product = productResult.rows[0];

        console.log(`[${sessionId}] [KROK 5] Tworzenie sesji AssemblyAI.`);
        const assemblyAISession = await createAssemblyAISession(sessionId);
        console.log(`[${sessionId}] [KROK 6] Obiekt sesji AssemblyAI utworzony.`);

        const session = {
            ws, sessionId, clientId, productId, notes, client, product,
            assemblyAISession: {
                websocket: assemblyAISession.websocket,
                isConfigured: false,
                audioQueue: [],
            },
            conversationHistory: [],
            aiSuggestions: [],
            startTime: new Date(),
        };
        console.log(`[${sessionId}] [KROK 7] Obiekt sesji backendu utworzony.`);

        activeSessions.set(sessionId, session);
        console.log(`[${sessionId}] [KROK 8] Sesja zapisana w activeSessions. Liczba aktywnych: ${activeSessions.size}`);

        setupAssemblyAIHandler(sessionId, session);
        console.log(`[${sessionId}] [KROK 9] Handler AssemblyAI skonfigurowany.`);

        ws.send(JSON.stringify({
            type: 'SESSION_STARTED',
            sessionId,
            message: 'Real-time session started successfully'
        }));
        console.log(`[${sessionId}] [KROK 10] Wysłano SESSION_STARTED do klienta.`);

    } catch (error) {
        console.error(`[${sessionId}] [BŁĄD KRYTYCZNY] Błąd w startRealtimeSession:`, error);
        ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Failed to start real-time session: ' + error.message
        }));
    }
}

// Get temporary AssemblyAI token
async function getAssemblyAIToken() {
    if (!ASSEMBLYAI_API_KEY) {
        throw new Error('ASSEMBLYAI_API_KEY is not configured.');
    }
    
    console.log('🔑 Requesting AssemblyAI token...');
    
    const response = await fetch('https://api.assemblyai.com/v2/realtime/token', {
        method: 'POST',
        headers: { 
            'authorization': ASSEMBLYAI_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ 
            expires_in: 3600
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to get AssemblyAI token:', errorText);
        throw new Error(`Failed to get AssemblyAI token: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ AssemblyAI token received successfully');
    return data.token;
}

// Create AssemblyAI Real-time Session
async function createAssemblyAISession(sessionId) {
    console.log(`[${sessionId}] 🔧 Creating AssemblyAI session...`);
    
    try {
        const token = await getAssemblyAIToken();
        const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`;
        
        console.log(`[${sessionId}] 🔌 Connecting to AssemblyAI WebSocket:`, wsUrl);
        
        const assemblySocket = new WebSocket(wsUrl);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error(`[${sessionId}] ❌ AssemblyAI WebSocket connection timeout`);
                reject(new Error('AssemblyAI WebSocket connection timeout'));
            }, 10000);
            
            assemblySocket.on('open', () => {
                console.log(`[${sessionId}] ✅ AssemblyAI WebSocket connected successfully`);
                clearTimeout(timeout);
                resolve({
                    websocket: assemblySocket,
                    isConfigured: false,
                    audioQueue: []
                });
            });
            
            assemblySocket.on('error', (error) => {
                console.error(`[${sessionId}] ❌ AssemblyAI WebSocket connection error:`, error);
                clearTimeout(timeout);
                reject(error);
            });
        });
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error creating AssemblyAI session:`, error);
        throw error;
    }
}

// Process Audio Chunk
async function processAudioChunk(ws, data) {
    const { sessionId, audioData } = data;
    
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processAudioChunk: ${sessionId}`);
        return;
    }
    
    try {
        if (!audioData || audioData.length === 0) {
            console.warn(`⚠️ Empty audio data received for session: ${sessionId}`);
            return;
        }
        
        const { assemblyAISession } = session;

        if (assemblyAISession.isConfigured && assemblyAISession.websocket.readyState === WebSocket.OPEN) {
            // Send audio data directly as base64 string (not wrapped in JSON)
            assemblyAISession.websocket.send(audioData);
        } else {
            // Queue audio data if not ready
            console.log(`🎵 Queueing audio chunk for session ${sessionId} (isConfigured: ${assemblyAISession.isConfigured}, state: ${assemblyAISession.websocket.readyState})`);
            assemblyAISession.audioQueue.push(audioData);

            // Check if we need to recreate the WebSocket
            if (assemblyAISession.websocket.readyState === WebSocket.CLOSED || 
                assemblyAISession.websocket.readyState === WebSocket.CLOSING) {
                console.log(`🔄 WebSocket for session ${sessionId} is closed. Attempting to recreate...`);
                try {
                    const newAssemblyAISession = await createAssemblyAISession(sessionId);
                    // Update the session with new WebSocket but preserve queue
                    assemblyAISession.websocket = newAssemblyAISession.websocket;
                    assemblyAISession.isConfigured = false;
                    
                    // Setup handlers for the new WebSocket
                    setupAssemblyAIHandler(sessionId, session); 
                    console.log(`✅ New WebSocket for session ${sessionId} created and waiting for connection.`);
                } catch (error) {
                    console.error(`❌ Error recreating WebSocket for session ${sessionId}:`, error);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Error in processAudioChunk for session ${sessionId}:`, error);
    }
}

// Setup AssemblyAI Real-time Handler
function setupAssemblyAIHandler(sessionId, session) {
    const assemblySocket = session.assemblyAISession.websocket;
    
    console.log(`[${sessionId}] 🔧 Setting up AssemblyAI handlers...`);
    console.log(`[${sessionId}] 🔍 WebSocket readyState: ${assemblySocket.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);

    // Function to send configuration and process queue
    const sendConfigurationAndProcessQueue = () => {
        console.log(`[${sessionId}] ✅ AssemblyAI WebSocket opened, sending configuration...`);
        
        // Send initial configuration for the legacy API
        const config = {
            sample_rate: 16000,
            word_boost: [],
            encoding: "pcm_s16le"
        };
        
        assemblySocket.send(JSON.stringify(config));
        session.assemblyAISession.isConfigured = true;
        
        console.log(`[${sessionId}] 📤 Configuration sent:`, config);
        
        // Process queued audio
        const queue = session.assemblyAISession.audioQueue;
        console.log(`[${sessionId}] 📦 Processing ${queue.length} queued audio chunks...`);
        
        while (queue.length > 0) {
            const audioData = queue.shift();
            try {
                assemblySocket.send(audioData);
            } catch (error) {
                console.error(`[${sessionId}] ❌ Error sending queued audio:`, error);
                break;
            }
        }
        
        console.log(`[${sessionId}] ✅ Audio queue processed`);
    };

    // Check if WebSocket is already open
    if (assemblySocket.readyState === WebSocket.OPEN) {
        console.log(`[${sessionId}] 🔄 WebSocket already open, sending configuration immediately`);
        sendConfigurationAndProcessQueue();
    }

    assemblySocket.on('open', () => {
        console.log(`[${sessionId}] 🔗 AssemblyAI WebSocket 'open' event triggered`);
        sendConfigurationAndProcessQueue();
    });

    assemblySocket.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`[${sessionId}] 📨 AssemblyAI message:`, parsedMessage.message_type || 'unknown', parsedMessage);
            
            if (parsedMessage.error) {
                console.error(`[${sessionId}] ❌ AssemblyAI error:`, parsedMessage.error);
                session.ws.send(JSON.stringify({
                    type: 'ASSEMBLYAI_ERROR',
                    error: parsedMessage.error
                }));
                return;
            }

            // Handle different message types
            switch (parsedMessage.message_type) {
                case 'SessionBegins':
                    console.log(`[${sessionId}] 🎬 AssemblyAI session began`);
                    break;
                    
                case 'PartialTranscript':
                    if (parsedMessage.text && parsedMessage.text.trim()) {
                        console.log(`[${sessionId}] 📝 Partial transcript:`, parsedMessage.text);
                        session.ws.send(JSON.stringify({
                            type: 'PARTIAL_TRANSCRIPT',
                            transcript: {
                                text: parsedMessage.text,
                                speaker: 'user',
                                confidence: parsedMessage.confidence
                            }
                        }));
                    }
                    break;
                    
                case 'FinalTranscript':
                    if (parsedMessage.text && parsedMessage.text.trim()) {
                        console.log(`[${sessionId}] ✅ Final transcript:`, parsedMessage.text);
                        await processTranscript(sessionId, parsedMessage);
                    }
                    break;
                    
                case 'SessionTerminated':
                    console.log(`[${sessionId}] 🔚 AssemblyAI session terminated`);
                    break;
                    
                default:
                    console.log(`[${sessionId}] ❓ Unknown AssemblyAI message type:`, parsedMessage.message_type);
            }
        } catch (error) {
            console.error(`[${sessionId}] ❌ Error parsing AssemblyAI message:`, error, 'Raw message:', message.toString());
        }
    });

    assemblySocket.on('close', (code, reason) => {
        console.log(`[${sessionId}] 🔌 AssemblyAI WebSocket closed. Code: ${code}, Reason: ${String(reason)}`);
        if (session && session.assemblyAISession) {
            session.assemblyAISession.isConfigured = false;
        }
    });

    assemblySocket.on('error', (error) => {
        console.error(`[${sessionId}] ❌ AssemblyAI WebSocket error:`, error);
        session.ws.send(JSON.stringify({
            type: 'ASSEMBLYAI_ERROR',
            error: error.message
        }));
    });
}

// Process Transcript and Generate AI Suggestions
async function processTranscript(sessionId, transcript) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processTranscript: ${sessionId}`);
        return;
    }

    console.log(`[${sessionId}] 📝 Processing transcript:`, transcript.text);

    if (transcript.text && transcript.message_type === 'FinalTranscript') {
        const newTranscript = {
            speaker: 'user', // AssemblyAI legacy doesn't provide speaker info
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence || 0
        };
        
        session.conversationHistory.push(newTranscript);
        console.log(`[${sessionId}] 📚 Added to conversation history. Total: ${session.conversationHistory.length}`);

        // Send final transcript to frontend
        session.ws.send(JSON.stringify({
            type: 'FINAL_TRANSCRIPT',
            transcript: newTranscript
        }));

        // Generate and send AI suggestions
        await generateAISuggestions(session, newTranscript);
    }
}

async function generateAISuggestions(session, newTranscript) {
    const sessionId = session.sessionId;
    
    try {
        console.log(`[${sessionId}] 🤖 Generating AI suggestions for: "${newTranscript.text}"`);
        
        const gptContext = createGPTContext(session.client, session.product, session.notes);
        const latestHistory = session.conversationHistory.slice(-5).map(t => `[${t.speaker}] ${t.text}`).join('\n');
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: gptContext },
                { role: "user", content: `Przeanalizuj poniższy fragment rozmowy w czasie rzeczywistym. Ostatnia wypowiedź, na której masz się skupić, to: "${newTranscript.text}". Kontekst rozmowy:\n${latestHistory}` }
            ],
            response_format: { type: "json_object" },
        });

        const aiSuggestions = JSON.parse(completion.choices[0].message.content);
        console.log(`[${sessionId}] 🎯 AI suggestions generated:`, aiSuggestions);

        session.aiSuggestions.push({
            transcript: newTranscript.text,
            suggestions: aiSuggestions,
            timestamp: new Date().toISOString()
        });

        // Send AI suggestions to frontend
        session.ws.send(JSON.stringify({
            type: 'AI_SUGGESTIONS',
            suggestions: aiSuggestions
        }));
        
        console.log(`[${sessionId}] 📤 AI suggestions sent to frontend`);
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error generating AI suggestions:`, error);
        
        // Send fallback suggestions
        const fallbackSuggestions = {
            speaker_analysis: "user",
            intent: "Continue conversation",
            emotion: "neutral",
            suggestions: ["Continue the conversation naturally", "Ask follow-up questions"],
            signals: []
        };
        
        session.ws.send(JSON.stringify({
            type: 'AI_SUGGESTIONS',
            suggestions: fallbackSuggestions
        }));
    }
}

// Create GPT Context
function createGPTContext(client, product, notes) {
    return `Jesteś zaawansowanym asystentem sprzedażowym AI słuchającym rozmowy w CZASIE RZECZYWISTYM.

TWOJA ROLA:
- Analizujesz każdą wypowiedź natychmiastowo
- Rozpoznajesz intencje i emocje
- Podpowiadasz konkretne akcje
- Wykrywasz sygnały kupna/oporu
- Odpowiadasz w formacie JSON

INFORMACJE O KLIENCIE:
- Nazwa: ${client.name}
- Opis: ${client.description || 'Brak'}
- Notatki: ${client.comment || 'Brak'}

INFORMACJE O PRODUKCIE:
- Nazwa: ${product.name}
- Opis: ${product.description || 'Brak'}
- Notatki: ${product.comment || 'Brak'}

NOTATKI SESJI: ${notes || 'Brak'}

WSKAZÓWKI:
- Speaker "unknown" = automatycznie określ na podstawie kontekstu
- Sentiment z AssemblyAI: positive/negative/neutral
- Dawaj praktyczne, natychmiastowe sugestie
- Wykrywaj momenty na zamknięcie sprzedaży`;
}

// End Real-time Session
async function endRealtimeSession(ws, data) {
    const { sessionId } = data;
    
    console.log('🛑 Ending real-time session:', {
        sessionId: sessionId,
        hasSession: activeSessions.has(sessionId),
        totalActiveSessions: activeSessions.size
    });
    
    try {
        await cleanupRealtimeSession(sessionId);
        
        ws.send(JSON.stringify({
            type: 'SESSION_ENDED',
            sessionId,
            message: 'Real-time session ended successfully'
        }));
        
        console.log('✅ Real-time session ended successfully:', sessionId);
        
    } catch (error) {
        console.error('❌ Error ending real-time session:', error);
    }
}

// Cleanup Real-time Session
async function cleanupRealtimeSession(sessionId) {
    const session = activeSessions.get(sessionId);
    
    console.log('🧹 Cleaning up real-time session:', {
        sessionId: sessionId,
        hasSession: !!session,
        conversationLength: session ? session.conversationHistory.length : 0,
        aiSuggestionsLength: session ? session.aiSuggestions.length : 0
    });
    
    if (!session) {
        console.warn('⚠️ Session not found in activeSessions:', sessionId);
        return;
    }
    
    try {
        // Close AssemblyAI connection
        if (session.assemblyAISession && session.assemblyAISession.websocket) {
            console.log('🔌 Closing AssemblyAI WebSocket connection');
            session.assemblyAISession.websocket.close();
        }
        
        // Save session to database - zawsze zapisuj, nawet bez transkrypcji
        console.log('💾 Attempting to save session to database...');
        await saveRealtimeSession(session);
        
        // Remove from active sessions
        activeSessions.delete(sessionId);
        
        console.log('🧹 Real-time session cleaned up successfully:', sessionId);
        
    } catch (error) {
        console.error('❌ Error cleaning up session:', error);
        // Still remove from active sessions even if save failed
        activeSessions.delete(sessionId);
    }
}

// Save completed real-time session to database
async function saveRealtimeSession(session) {
    try {
        console.log('--- DEBUG: Entering saveRealtimeSession ---');
        console.log(`--- DEBUG: conversationHistory length: ${session.conversationHistory.length} ---`);
        console.log(`--- DEBUG: aiSuggestions length: ${session.aiSuggestions.length} ---`);
        
        const transcription = session.conversationHistory.length > 0 
            ? session.conversationHistory.map(t => `[${t.speaker}] ${t.text}`).join('\\n\\n')
            : 'Sesja Real-time AI Assistant - brak transkrypcji (możliwy problem z mikrofonem lub AssemblyAI)';
        
        // Create AI suggestions summary
        const aiSuggestionsText = session.aiSuggestions.length > 0 
            ? session.aiSuggestions.map(item => {
                const time = new Date(item.timestamp).toLocaleTimeString('pl-PL');
                return `[${time}] ${item.transcript}\n` +
                       `Sugestie: ${item.suggestions.suggestions?.join(', ') || 'Brak'}\n` +
                       `Sygnały: ${item.suggestions.signals?.join(', ') || 'Brak'}\n` +
                       `Emocje: ${item.suggestions.emotion || 'Nieznane'}\n`;
            }).join('\n---\n')
            : 'Brak sugestii AI - prawdopodobnie nie otrzymano transkrypcji z AssemblyAI';
        
        // Generate summary for positive/negative findings
        const allSuggestions = session.aiSuggestions.flatMap(item => item.suggestions.suggestions || []);
        const allSignals = session.aiSuggestions.flatMap(item => item.suggestions.signals || []);
        
        const positiveFindings = allSignals.filter(signal => 
            signal.toLowerCase().includes('kupna') || 
            signal.toLowerCase().includes('zainteresowanie') ||
            signal.toLowerCase().includes('pozytywny')
        ).join(', ') || (session.conversationHistory.length > 0 
            ? 'Sesja Real-time AI Assistant zakończona' 
            : 'Sesja zakończona - sprawdź ustawienia mikrofonu');
        
        const negativeFindings = allSignals.filter(signal => 
            signal.toLowerCase().includes('oporu') || 
            signal.toLowerCase().includes('wątpliwość') ||
            signal.toLowerCase().includes('negatywny')
        ).join(', ') || (session.conversationHistory.length > 0 
            ? 'Zobacz szczegóły w sugestiach AI' 
            : 'Brak danych - możliwy problem z nagrywaniem audio');
        
        const recommendations = allSuggestions.slice(0, 5).join('; ') || 
            (session.conversationHistory.length > 0 
                ? 'Kontynuuj komunikację zgodnie z sugestiami AI'
                : 'Sprawdź połączenie z mikrofonem i spróbuj ponownie');
        
        const result = await safeQuery(`
            INSERT INTO sales (
                product_id, client_id, recording_path, transcription, meeting_datetime,
                positive_findings, negative_findings, recommendations, own_notes, ai_suggestions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            session.productId,
            session.clientId,
            'realtime_ai_session',
            transcription,
            session.startTime,
            positiveFindings,
            negativeFindings,
            recommendations,
            session.notes || '',
            aiSuggestionsText
        ]);
        
        const savedId = result.rows[0].id;
        console.log('💾 Real-time session saved successfully to database:', {
            id: savedId,
            hasTranscription: session.conversationHistory.length > 0,
            hasAISuggestions: session.aiSuggestions.length > 0
        });
        
    } catch (error) {
        console.error('❌ Error saving real-time session:', error);
        // Nie rzucaj błędu - pozwól sesji się zakończyć
    }
}

// Start serwera z WebSocket support
server.listen(PORT, '::', async () => {
  console.log(`🚀 Serwer aplikacji działa na porcie ${PORT} (IPv6 ready)`);
  console.log(`🌐 NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`🔌 WebSocket server ready for real-time AI assistant`);
  
  // Test połączenia z bazą danych Neon
  await testNeonConnection();
});

// Export dla Vercel
module.exports = server; 