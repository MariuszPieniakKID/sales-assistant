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
const puppeteer = require('puppeteer');
const htmlPdf = require('html-pdf-node');
const pdfParse = require('pdf-parse');

// Initialize OpenAI globally
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
            
            // Wykonaj migracje bazy danych
            await runDatabaseMigrations(pool);
            
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

// Funkcja do automatycznych migracji bazy danych
async function runDatabaseMigrations(pool) {
    try {
        console.log('🔄 Sprawdzanie i wykonywanie migracji bazy danych...');
        
        // Sprawdź czy kolumny skryptu sprzedażowego istnieją
        const checkColumnsQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' 
            AND column_name IN ('sales_script_text', 'sales_script_filename', 'sales_script_path')
        `;
        
        const existingColumns = await pool.query(checkColumnsQuery);
        const columnNames = existingColumns.rows.map(row => row.column_name);
        
        // Dodaj brakujące kolumny
        if (!columnNames.includes('sales_script_text')) {
            console.log('➕ Dodawanie kolumny sales_script_text...');
            await pool.query('ALTER TABLE products ADD COLUMN sales_script_text TEXT');
            console.log('✅ Kolumna sales_script_text dodana');
        } else {
            console.log('✅ Kolumna sales_script_text już istnieje');
        }
        
        if (!columnNames.includes('sales_script_filename')) {
            console.log('➕ Dodawanie kolumny sales_script_filename...');
            await pool.query('ALTER TABLE products ADD COLUMN sales_script_filename VARCHAR(255)');
            console.log('✅ Kolumna sales_script_filename dodana');
        } else {
            console.log('✅ Kolumna sales_script_filename już istnieje');
        }
        
        if (!columnNames.includes('sales_script_path')) {
            console.log('➕ Dodawanie kolumny sales_script_path...');
            await pool.query('ALTER TABLE products ADD COLUMN sales_script_path TEXT');
            console.log('✅ Kolumna sales_script_path dodana');
        } else {
            console.log('✅ Kolumna sales_script_path już istnieje');
        }
        
        // NOWE: Sprawdź czy tabela recordings istnieje
        console.log('🔍 Sprawdzanie tabeli recordings...');
        const checkRecordingsTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'recordings'
            )
        `;
        
        const recordingsTableExists = await pool.query(checkRecordingsTable);
        
        if (!recordingsTableExists.rows[0].exists) {
            console.log('➕ Tworzenie tabeli recordings...');
            await pool.query(`
                CREATE TABLE recordings (
                    id VARCHAR(255) PRIMARY KEY,
                    client_id INTEGER NOT NULL REFERENCES clients(id),
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    notes TEXT,
                    transcript TEXT,
                    duration INTEGER DEFAULT 0,
                    status VARCHAR(50) DEFAULT 'recording',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);
            console.log('✅ Tabela recordings utworzona');
        } else {
            console.log('✅ Tabela recordings już istnieje');
        }
        
        console.log('✅ Migracje bazy danych ukończone pomyślnie');
        
    } catch (error) {
        console.error('❌ Błąd podczas migracji bazy danych:', error);
        // Nie przerywaj startowania serwera w przypadku błędu migracji
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

// DEBUG: Test endpoint do sprawdzenia struktury bazy danych
app.get('/api/debug/database-structure', requireAuth, async (req, res) => {
    try {
        const pool = getNeonPool();
        
        // Sprawdź strukturę tabeli products
        const columnsQuery = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'products' 
            ORDER BY ordinal_position
        `;
        
        const columnsResult = await pool.query(columnsQuery);
        
        // Spróbuj wykonać podstawowe query
        const testQuery = 'SELECT COUNT(*) as total FROM products';
        const testResult = await pool.query(testQuery);
        
        res.json({
            success: true,
            table_structure: columnsResult.rows,
            test_query_result: testResult.rows[0],
            user_id: req.session.userId
        });
        
    } catch (error) {
        console.error('❌ Database debug error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// DEBUG: Test endpoint do dodawania prostego produktu
app.post('/api/debug/test-product', requireAuth, async (req, res) => {
    try {
        const pool = getNeonPool();
        const client = await pool.connect();
        
        console.log('🧪 Test dodawania produktu dla user_id:', req.session.userId);
        
        // Prosta wersja bez skryptu
        const testQuery = `
            INSERT INTO products (user_id, name, description, comment) 
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        
        const testValues = [
            req.session.userId, 
            'Test Product ' + Date.now(), 
            'Test Description', 
            'Test Comment'
        ];
        
        const result = await client.query(testQuery, testValues);
        await client.release();
        
        res.json({
            success: true,
            product: result.rows[0],
            message: 'Test product created successfully'
        });
        
    } catch (error) {
        console.error('❌ Test product creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            detail: error.detail
        });
    }
});

// DEBUG: Test endpoint do dodawania produktu ze skryptem
app.post('/api/debug/test-product-with-script', requireAuth, async (req, res) => {
    try {
        const pool = getNeonPool();
        const client = await pool.connect();
        
        console.log('🧪 Test dodawania produktu ze skryptem dla user_id:', req.session.userId);
        
        // Test ze skryptem sprzedażowym
        const testQuery = `
            INSERT INTO products (user_id, name, description, comment, sales_script_text, sales_script_filename) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        
        const testValues = [
            req.session.userId, 
            'Test Product with Script ' + Date.now(), 
            'Test Description with Sales Script', 
            'Test Comment',
            'To jest testowy skrypt sprzedażowy zawierający informacje o produkcie...',
            'test-skrypt.pdf'
        ];
        
        const result = await client.query(testQuery, testValues);
        await client.release();
        
        res.json({
            success: true,
            product: result.rows[0],
            message: 'Test product with script created successfully'
        });
        
    } catch (error) {
        console.error('❌ Test product with script creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint
        });
    }
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
        
        // OpenAI is initialized globally
        
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
        // OpenAI is initialized globally
        
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

// Endpoint do przetwarzania skryptu sprzedażowego przez OCR
app.post('/api/process-sales-script', requireAuth, upload.single('salesScript'), async (req, res) => {
    console.log('📍 Processing sales script PDF...');
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Brak pliku PDF' });
    }

    try {
        // Sprawdź czy to PDF
        if (req.file.mimetype !== 'application/pdf') {
            // Usuń plik
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ success: false, message: 'Plik musi być w formacie PDF' });
        }

        // Wczytaj PDF
        const dataBuffer = fs.readFileSync(req.file.path);
        
        // Przetworz PDF przez OCR
        console.log('🔍 Extracting text from PDF...');
        const pdfData = await pdfParse(dataBuffer);
        
        const extractedText = pdfData.text.trim();
        
        if (!extractedText || extractedText.length < 10) {
            // Usuń plik
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ 
                success: false, 
                message: 'Nie udało się wyodrębnić tekstu z PDF. Plik może być uszkodzony lub zawierać tylko obrazy.' 
            });
        }

        console.log(`✅ Extracted ${extractedText.length} characters from PDF`);
        
        // Usuń tymczasowy plik (tekst jest już wyodrębniony)
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({
            success: true,
            extractedText: extractedText,
            filename: req.file.originalname,
            textLength: extractedText.length
        });

    } catch (error) {
        console.error('❌ Błąd przetwarzania PDF:', error);
        
        // Usuń plik w przypadku błędu
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Błąd przetwarzania PDF: ' + error.message 
        });
    }
});

app.post('/api/products', requireAuth, upload.fields([
  { name: 'files', maxCount: 10 },
  { name: 'salesScript', maxCount: 1 }
]), async (req, res) => {
  const { name, description, comment, salesScriptText, salesScriptFilename } = req.body;
  
  console.log('📍 POST /api/products - Request data:', {
    name, 
    description: description?.substring(0, 50) + '...',
    comment: comment?.substring(0, 50) + '...',
    hasSalesScript: !!salesScriptText,
    scriptLength: salesScriptText?.length || 0,
    salesScriptFilename: salesScriptFilename,
    filesCount: req.files?.files?.length || 0,
    userId: req.session?.userId,
    contentType: req.headers['content-type']
  });
  
  // Dodatkowe debugowanie FormData
  console.log('🔍 Full request body keys:', Object.keys(req.body));
  console.log('🔍 Sales script preview:', salesScriptText?.substring(0, 100) + '...');
  
  try {
    const pool = getNeonPool();
    const client = await pool.connect();
    
    // Sprawdź czy istnieją nowe kolumny (dodane w migracji)
    let productQuery, productValues;
    
    if (salesScriptText) {
      // Dodaj produkt ze skryptem sprzedażowym
      productQuery = `
        INSERT INTO products (user_id, name, description, comment, sales_script_text, sales_script_filename) 
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `;
      
      // Znajdź oryginalną nazwę pliku ze skryptu w req.body lub ustaw domyślną
      const scriptFilename = req.body.salesScriptFilename || 'skrypt-sprzedazowy.pdf';
      
      productValues = [req.session.userId, name, description, comment, salesScriptText, scriptFilename];
    } else {
      // Standardowy produkt bez skryptu
      productQuery = 'INSERT INTO products (user_id, name, description, comment) VALUES ($1, $2, $3, $4) RETURNING *';
      productValues = [req.session.userId, name, description, comment];
    }
    
    const productResult = await client.query(productQuery, productValues);
    const productId = productResult.rows[0].id;
    
    // Dodaj pliki jeśli zostały przesłane
    if (req.files && req.files.files && req.files.files.length > 0) {
      for (const file of req.files.files) {
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
    console.error('Stack trace:', err.stack);
    console.error('SQL Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      query: err.query
    });
    res.status(500).json({ success: false, message: 'Błąd serwera: ' + err.message });
  }
});

// Pobieranie skryptu sprzedażowego jako plik TXT
app.get('/api/products/:id/download-script', requireAuth, async (req, res) => {
  const productId = req.params.id;
  
  try {
    const pool = getNeonPool();
    const client = await pool.connect();
    
    // Pobierz produkt ze skryptem
    const productResult = await client.query(
      'SELECT name, sales_script_text, sales_script_filename FROM products WHERE id = $1 AND user_id = $2',
      [productId, req.session.userId]
    );
    
    await client.release();
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Produkt nie znaleziony' });
    }
    
    const product = productResult.rows[0];
    
    if (!product.sales_script_text) {
      return res.status(404).json({ success: false, message: 'Produkt nie ma skryptu sprzedażowego' });
    }
    
    // Przygotuj nazwę pliku
    const originalFilename = product.sales_script_filename || 'skrypt-sprzedazowy.pdf';
    const txtFilename = originalFilename.replace(/\.pdf$/i, '_OCR.txt');
    const safeTxtFilename = txtFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Przygotuj zawartość pliku
    const fileContent = `SKRYPT SPRZEDAŻOWY - TEKST WYODRĘBNIONY PRZEZ OCR
==================================================

Produkt: ${product.name}
Oryginalny plik: ${originalFilename}
Data wyodrębnienia: ${new Date().toLocaleString('pl-PL')}
Liczba znaków: ${product.sales_script_text.length}

==================================================

${product.sales_script_text}

==================================================
KONIEC SKRYPTU SPRZEDAŻOWEGO
`;

    // Ustaw nagłówki dla pobierania pliku
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTxtFilename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(fileContent, 'utf8'));
    
    console.log(`📄 Pobieranie skryptu sprzedażowego: ${safeTxtFilename} (${product.sales_script_text.length} znaków)`);
    
    res.send(fileContent);
    
  } catch (err) {
    console.error('Błąd pobierania skryptu:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera: ' + err.message });
  }
});

// Edycja produktu
app.put('/api/products/:id', requireAuth, upload.fields([
  { name: 'files', maxCount: 10 },
  { name: 'salesScript', maxCount: 1 }
]), async (req, res) => {
  const productId = req.params.id;
  const { name, description, comment, salesScriptText } = req.body;
  
  try {
    const pool = getNeonPool();
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
    
    // Aktualizuj produkt - sprawdź czy skrypt sprzedażowy został przesłany
    let updateQuery, updateValues;
    
    if (salesScriptText) {
      // Aktualizuj ze skryptem sprzedażowym
      const scriptFilename = req.body.salesScriptFilename || 'skrypt-sprzedazowy.pdf';
      updateQuery = `
        UPDATE products 
        SET name = $1, description = $2, comment = $3, sales_script_text = $4, sales_script_filename = $5 
        WHERE id = $6 AND user_id = $7 RETURNING *
      `;
      updateValues = [name, description, comment, salesScriptText, scriptFilename, productId, req.session.userId];
    } else {
      // Standardowa aktualizacja bez zmiany skryptu
      updateQuery = 'UPDATE products SET name = $1, description = $2, comment = $3 WHERE id = $4 AND user_id = $5 RETURNING *';
      updateValues = [name, description, comment, productId, req.session.userId];
    }
    
    const updateResult = await client.query(updateQuery, updateValues);
    
    // Dodaj nowe pliki jeśli zostały przesłane
    if (req.files && req.files.files && req.files.files.length > 0) {
      for (const file of req.files.files) {
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
    console.error('Stack trace:', err.stack);
    console.error('SQL Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      query: err.query
    });
    res.status(500).json({ success: false, message: 'Błąd serwera: ' + err.message });
  }
});

// Usuwanie produktu
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const productId = req.params.id;
  
  try {
    const pool = getNeonPool();
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

// API dla spotkań (live sessions)
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

// API dla nagrań
app.get('/api/recordings', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT r.*, c.name as client_name, p.name as product_name,
             r.created_at as meeting_datetime,
             'recording' as type
      FROM recordings r 
      JOIN clients c ON r.client_id = c.id 
      JOIN products p ON r.product_id = p.id 
      WHERE p.user_id = $1 
      ORDER BY r.created_at DESC
    `, [req.session.userId]);
    await client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Błąd pobierania nagrań:', err);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

// API dla wszystkich spotkań (live sessions + nagrania)
app.get('/api/meetings-all', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Pobierz live sessions
    const salesResult = await client.query(`
      SELECT s.*, c.name as client_name, p.name as product_name,
             'live_session' as type
      FROM sales s 
      JOIN clients c ON s.client_id = c.id 
      JOIN products p ON s.product_id = p.id 
      WHERE p.user_id = $1
    `, [req.session.userId]);
    
    // Pobierz nagrania
    const recordingsResult = await client.query(`
      SELECT r.*, c.name as client_name, p.name as product_name,
             r.created_at as meeting_datetime,
             'recording' as type
      FROM recordings r 
      JOIN clients c ON r.client_id = c.id 
      JOIN products p ON r.product_id = p.id 
      WHERE p.user_id = $1
    `, [req.session.userId]);
    
    await client.release();
    
    // Połącz wyniki i posortuj po dacie
    const allMeetings = [
      ...salesResult.rows,
      ...recordingsResult.rows
    ].sort((a, b) => new Date(b.meeting_datetime) - new Date(a.meeting_datetime));
    
    res.json(allMeetings);
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

// Eksport spotkania do PDF
app.post('/api/meetings/export-pdf', requireAuth, async (req, res) => {
  let browser = null;
  
  try {
    const {
      meetingId, clientName, productName, meetingDate,
      transcription, aiSuggestions, chatgptHistory, finalSummary,
      positiveFindings, negativeFindings, recommendations, ownNotes
    } = req.body;
    
    console.log('🎯 Generowanie prawdziwego PDF dla spotkania:', meetingId);
    
    // Przygotuj zawartość PDF jako HTML
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Spotkanie ${clientName} - ${meetingId}</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                margin: 0; 
                padding: 20px; 
                line-height: 1.6; 
                color: #333; 
                background: white;
            }
            .header { 
                border-bottom: 3px solid #667eea; 
                padding-bottom: 20px; 
                margin-bottom: 30px; 
                text-align: center;
            }
            .header h1 { 
                color: #667eea; 
                margin: 0; 
                font-size: 28px;
                font-weight: 700;
            }
            .header .meta { 
                color: #666; 
                margin-top: 15px; 
                font-size: 16px;
                line-height: 1.8;
            }
            .section { 
                margin-bottom: 35px; 
                page-break-inside: avoid; 
            }
            .section h2 { 
                color: #667eea; 
                border-bottom: 2px solid #e2e8f0; 
                padding-bottom: 8px; 
                margin-bottom: 15px;
                font-size: 20px;
                font-weight: 600;
            }
            .transcription { 
                background: #f8fafc; 
                padding: 20px; 
                border-radius: 8px; 
                white-space: pre-wrap; 
                border-left: 4px solid #667eea;
                font-size: 14px;
                max-height: none;
                overflow: visible;
            }
            .speaker-highlight { 
                font-weight: bold; 
                color: #667eea;
            }
            .ai-suggestions { 
                background: #f0fff4; 
                padding: 20px; 
                border-radius: 8px; 
                border-left: 4px solid #48bb78;
                font-size: 14px;
            }
            .summary { 
                background: #fff5f5; 
                padding: 20px; 
                border-radius: 8px; 
                border-left: 4px solid #f56565;
                font-size: 14px;
            }
            .findings { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 20px; 
                margin-bottom: 20px;
            }
            .findings > div { 
                page-break-inside: avoid;
            }
            .findings h3 {
                margin-top: 0;
                font-size: 16px;
                font-weight: 600;
            }
            .positive { 
                background: #f0fff4; 
                padding: 15px; 
                border-radius: 8px; 
                border-left: 4px solid #48bb78;
            }
            .negative { 
                background: #fef5e7; 
                padding: 15px; 
                border-radius: 8px; 
                border-left: 4px solid #ed8936;
            }
            .notes { 
                background: #f7fafc; 
                padding: 20px; 
                border-radius: 8px; 
                border-left: 4px solid #4299e1;
                font-size: 14px;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                font-size: 12px;
                color: #666;
            }
            @media print { 
                body { margin: 0; padding: 15px; }
                .section { page-break-inside: avoid; }
                .findings { page-break-inside: avoid; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 Raport ze spotkania sprzedażowego</h1>
            <div class="meta">
                <strong>👤 Klient:</strong> ${clientName}<br>
                <strong>📦 Produkt:</strong> ${productName}<br>
                <strong>📅 Data spotkania:</strong> ${meetingDate}<br>
                <strong>🆔 ID spotkania:</strong> ${meetingId}
            </div>
        </div>
        
        <div class="section">
            <h2>📝 Transkrypcja rozmowy</h2>
            <div class="transcription">${transcription.replace(/\n/g, '<br>')}</div>
        </div>
        
        ${aiSuggestions && aiSuggestions !== 'Brak sugestii AI - prawdopodobnie nie otrzymano transkrypcji z AssemblyAI' ? `
        <div class="section">
            <h2>🤖 Sugestie AI z sesji</h2>
            <div class="ai-suggestions">${aiSuggestions.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        ${finalSummary ? `
        <div class="section">
            <h2>📊 Podsumowanie spotkania</h2>
            <div class="summary">${finalSummary.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        <div class="section">
            <h2>📋 Wnioski i rekomendacje</h2>
            <div class="findings">
                <div>
                    <h3>✅ Pozytywne wnioski</h3>
                    <div class="positive">${positiveFindings || 'Brak pozytywnych wniosków'}</div>
                </div>
                <div>
                    <h3>⚠️ Obszary do poprawy</h3>
                    <div class="negative">${negativeFindings || 'Brak obszarów do poprawy'}</div>
                </div>
            </div>
            <h3>💡 Rekomendacje</h3>
            <div class="notes">${recommendations || 'Brak rekomendacji'}</div>
        </div>
        
        ${ownNotes ? `
        <div class="section">
            <h2>📓 Własne notatki</h2>
            <div class="notes">${ownNotes.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        <div class="footer">
            <p>
                🤖 Raport wygenerowany automatycznie przez <strong>Asystenta Sprzedaży</strong><br>
                📅 Data wygenerowania: ${new Date().toLocaleString('pl-PL')}<br>
                🔗 System wspierający doradców handlowych
            </p>
        </div>
    </body>
    </html>
    `;
    
    // Spróbuj najpierw Puppeteer
    try {
      console.log('🚀 Próba #1: Uruchamianie Puppeteer...');
      
      // Uruchom Puppeteer z optymalnymi ustawieniami
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      
      console.log('✅ Puppeteer uruchomiony pomyślnie');
      
      const page = await browser.newPage();
      
      // Ustaw viewport i content
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      console.log('📄 Generowanie PDF z Puppeteer...');
      
      // Generuj PDF z optymalnymi ustawieniami
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 10px; color: #666; text-align: center; width: 100%; margin: 0 15mm;">
            <span>Strona <span class="pageNumber"></span> z <span class="totalPages"></span></span>
          </div>
        `
      });
      
      console.log('📄 PDF Buffer utworzony, rozmiar:', pdfBuffer.length, 'bajtów');
      
      // Sprawdź czy buffer jest prawidłowy (PDF powinien zaczynać się od %PDF)
      const pdfHeader = pdfBuffer.slice(0, 4).toString();
      console.log('🔍 PDF Header:', pdfHeader);
      
      if (!pdfHeader.startsWith('%PDF')) {
        throw new Error('Wygenerowany buffer nie jest prawidłowym PDF-em');
      }
      
      await browser.close();
      browser = null;
      
      console.log('✅ PDF wygenerowany pomyślnie z Puppeteer');
      
      // Wyślij PDF jako odpowiedź
      const fileName = `spotkanie_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${meetingId}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
      
    } catch (puppeteerError) {
      console.error('❌ Puppeteer failed:', puppeteerError.message);
      
      // Zamknij browser jeśli był otwarty
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('❌ Błąd zamykania Puppeteer:', closeError);
        }
        browser = null;
      }
      
      // Spróbuj html-pdf-node jako backup
      console.log('🔄 Próba #2: Używanie html-pdf-node...');
      
      try {
        const options = { 
          format: 'A4',
          margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
          printBackground: true,
          preferCSSPageSize: true
        };
        
        const file = { content: htmlContent };
        const pdfBuffer = await htmlPdf.generatePdf(file, options);
        
        console.log('📄 PDF Buffer utworzony z html-pdf-node, rozmiar:', pdfBuffer.length, 'bajtów');
        
        // Sprawdź czy buffer jest prawidłowy
        const pdfHeader = pdfBuffer.slice(0, 4).toString();
        console.log('🔍 PDF Header:', pdfHeader);
        
        if (!pdfHeader.startsWith('%PDF')) {
          throw new Error('html-pdf-node nie wygenerował prawidłowego PDF-a');
        }
        
        console.log('✅ PDF wygenerowany pomyślnie z html-pdf-node');
        
        // Wyślij PDF jako odpowiedź
        const fileName = `spotkanie_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${meetingId}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
        
      } catch (htmlPdfError) {
        console.error('❌ html-pdf-node też nie działa:', htmlPdfError.message);
        throw new Error('Obie biblioteki PDF nie działają: ' + puppeteerError.message + ' | ' + htmlPdfError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Błąd generowania PDF z Puppeteer:', error);
    
    // Zamknij browser w przypadku błędu
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('❌ Błąd zamykania Puppeteer:', closeError);
      }
    }
    
    // FALLBACK: Jeśli Puppeteer nie działa, zwróć HTML z instrukcjami
    console.log('🔄 Fallback: Generowanie HTML zamiast PDF');
    
    try {
      const {
        meetingId, clientName, productName, meetingDate,
        transcription, aiSuggestions, chatgptHistory, finalSummary,
        positiveFindings, negativeFindings, recommendations, ownNotes
      } = req.body;
      
      const htmlFallback = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Spotkanie ${clientName} - ${meetingId}</title>
          <style>
              body { 
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                  margin: 20px; 
                  line-height: 1.6; 
                  color: #333; 
                  background: white;
              }
              .print-instructions {
                  background: #e3f2fd;
                  border: 2px solid #2196f3;
                  border-radius: 8px;
                  padding: 20px;
                  margin-bottom: 30px;
                  text-align: center;
              }
              .print-instructions h2 {
                  color: #1976d2;
                  margin-top: 0;
              }
              .print-instructions p {
                  margin: 10px 0;
                  font-size: 16px;
              }
              .header { 
                  border-bottom: 3px solid #667eea; 
                  padding-bottom: 20px; 
                  margin-bottom: 30px; 
                  text-align: center;
              }
              .header h1 { 
                  color: #667eea; 
                  margin: 0; 
                  font-size: 28px;
                  font-weight: 700;
              }
              .header .meta { 
                  color: #666; 
                  margin-top: 15px; 
                  font-size: 16px;
                  line-height: 1.8;
              }
              .section { 
                  margin-bottom: 35px; 
                  page-break-inside: avoid; 
              }
              .section h2 { 
                  color: #667eea; 
                  border-bottom: 2px solid #e2e8f0; 
                  padding-bottom: 8px; 
                  margin-bottom: 15px;
                  font-size: 20px;
                  font-weight: 600;
              }
              .transcription { 
                  background: #f8fafc; 
                  padding: 20px; 
                  border-radius: 8px; 
                  white-space: pre-wrap; 
                  border-left: 4px solid #667eea;
                  font-size: 14px;
              }
              .ai-suggestions { 
                  background: #f0fff4; 
                  padding: 20px; 
                  border-radius: 8px; 
                  border-left: 4px solid #48bb78;
                  font-size: 14px;
              }
              .summary { 
                  background: #fff5f5; 
                  padding: 20px; 
                  border-radius: 8px; 
                  border-left: 4px solid #f56565;
                  font-size: 14px;
              }
              .findings { 
                  display: grid; 
                  grid-template-columns: 1fr 1fr; 
                  gap: 20px; 
                  margin-bottom: 20px;
              }
              .positive { 
                  background: #f0fff4; 
                  padding: 15px; 
                  border-radius: 8px; 
                  border-left: 4px solid #48bb78;
              }
              .negative { 
                  background: #fef5e7; 
                  padding: 15px; 
                  border-radius: 8px; 
                  border-left: 4px solid #ed8936;
              }
              .notes { 
                  background: #f7fafc; 
                  padding: 20px; 
                  border-radius: 8px; 
                  border-left: 4px solid #4299e1;
                  font-size: 14px;
              }
              @media print { 
                  .print-instructions { display: none; }
                  body { margin: 0; padding: 15px; }
                  .section { page-break-inside: avoid; }
              }
          </style>
      </head>
      <body>
          <div class="print-instructions">
              <h2>📄 Instrukcje drukowania</h2>
              <p><strong>Aby zapisać jako PDF:</strong></p>
              <p>1. Naciśnij <kbd>Ctrl+P</kbd> (Windows) lub <kbd>Cmd+P</kbd> (Mac)</p>
              <p>2. W opcjach drukowania wybierz <strong>"Zapisz jako PDF"</strong></p>
              <p>3. Kliknij <strong>"Zapisz"</strong></p>
          </div>
          
          <div class="header">
              <h1>📊 Raport ze spotkania sprzedażowego</h1>
              <div class="meta">
                  <strong>👤 Klient:</strong> ${clientName}<br>
                  <strong>📦 Produkt:</strong> ${productName}<br>
                  <strong>📅 Data spotkania:</strong> ${meetingDate}<br>
                  <strong>🆔 ID spotkania:</strong> ${meetingId}
              </div>
          </div>
          
          <div class="section">
              <h2>📝 Transkrypcja rozmowy</h2>
              <div class="transcription">${transcription.replace(/\n/g, '<br>')}</div>
          </div>
          
          ${aiSuggestions && aiSuggestions !== 'Brak sugestii AI - prawdopodobnie nie otrzymano transkrypcji z AssemblyAI' ? `
          <div class="section">
              <h2>🤖 Sugestie AI z sesji</h2>
              <div class="ai-suggestions">${aiSuggestions.replace(/\n/g, '<br>')}</div>
          </div>
          ` : ''}
          
          ${finalSummary ? `
          <div class="section">
              <h2>📊 Podsumowanie spotkania</h2>
              <div class="summary">${finalSummary.replace(/\n/g, '<br>')}</div>
          </div>
          ` : ''}
          
          <div class="section">
              <h2>📋 Wnioski i rekomendacje</h2>
              <div class="findings">
                  <div>
                      <h3>✅ Pozytywne wnioski</h3>
                      <div class="positive">${positiveFindings || 'Brak pozytywnych wniosków'}</div>
                  </div>
                  <div>
                      <h3>⚠️ Obszary do poprawy</h3>
                      <div class="negative">${negativeFindings || 'Brak obszarów do poprawy'}</div>
                  </div>
              </div>
              <h3>💡 Rekomendacje</h3>
              <div class="notes">${recommendations || 'Brak rekomendacji'}</div>
          </div>
          
          ${ownNotes ? `
          <div class="section">
              <h2>📓 Własne notatki</h2>
              <div class="notes">${ownNotes.replace(/\n/g, '<br>')}</div>
          </div>
          ` : ''}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #666;">
              <p>
                  🤖 Raport wygenerowany automatycznie przez <strong>Asystenta Sprzedaży</strong><br>
                  📅 Data wygenerowania: ${new Date().toLocaleString('pl-PL')}<br>
                  🔗 System wspierający doradców handlowych
              </p>
          </div>
      </body>
      </html>
      `;
      
      const fileName = `spotkanie_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${meetingId}.html`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(htmlFallback);
      
    } catch (fallbackError) {
      console.error('❌ Błąd fallback HTML:', fallbackError);
      res.status(500).json({ 
        success: false, 
        message: 'Błąd generowania raportu: ' + fallbackError.message 
      });
    }
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

// NOWE: Endpoint do zapisywania postępu nagrania (co 10 sekund)
app.post('/api/recordings/save-progress', requireAuth, async (req, res) => {
    const { recordingId, transcript, duration } = req.body;
    
    console.log(`[${recordingId}] 💾 API: Zapisywanie postępu nagrania...`);
    
    try {
        if (!recordingId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Brak recordingId' 
            });
        }
        
        // Zaktualizuj nagranie w bazie danych
        const result = await safeQuery(`
            UPDATE recordings 
            SET transcript = $1, duration = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING id, duration
        `, [transcript || '', duration || 0, recordingId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Nagranie nie zostało znalezione' 
            });
        }
        
        console.log(`[${recordingId}] ✅ API: Postęp zapisany - ${transcript?.length || 0} znaków, ${duration || 0}s`);
        
        res.json({ 
            success: true, 
            message: 'Postęp nagrania zapisany',
            recordingId: recordingId,
            transcriptLength: transcript?.length || 0,
            duration: duration || 0
        });
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ API: Błąd zapisywania postępu:`, error);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera podczas zapisywania postępu' 
        });
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

// Endpoint do sprawdzania logów związanych z produktami
app.get('/debug/product-logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'server.log');
        
        if (!fs.existsSync(logPath)) {
            return res.json({ logs: 'Brak pliku logów', path: logPath });
        }
        
        const logs = fs.readFileSync(logPath, 'utf8');
        const lines = logs.split('\n')
            .filter(line => {
                const lowercaseLine = line.toLowerCase();
                return lowercaseLine.includes('products') || 
                       lowercaseLine.includes('pdf') || 
                       lowercaseLine.includes('script') ||
                       lowercaseLine.includes('error') || 
                       lowercaseLine.includes('błąd') ||
                       lowercaseLine.includes('post /api') ||
                       lowercaseLine.includes('formdata');
            })
            .slice(-30); // ostatnie 30 istotnych linii
        
        res.json({ 
            logs: lines.join('\n'),
            totalFilteredLines: lines.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Błąd odczytu logów: ' + error.message });
    }
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
                    
                case 'START_REALTIME_SESSION_METHOD2':
                    console.log('🚀🔬 Processing START_REALTIME_SESSION_METHOD2 (Enhanced Diarization) 🚀🔬');
                    console.log('🔬 Method 2 Data received:', {
                        clientId: data.clientId,
                        productId: data.productId,
                        userId: data.userId,
                        notes: data.notes?.substring(0, 50) + '...'
                    });
                    await startRealtimeSessionMethod2(ws, data);
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
                    
                case 'WEB_SPEECH_TRANSCRIPT':
                    console.log('🇵🇱 Processing WEB_SPEECH_TRANSCRIPT (Method 1 - Polish):', {
                        sessionId: data.sessionId,
                        text: data.transcript.text,
                        language: data.transcript.language,
                        confidence: data.transcript.confidence
                    });
                    await processWebSpeechTranscript(ws, data);
                    break;
                    
                case 'WEB_SPEECH_TRANSCRIPT_METHOD2':
                    console.log('🔬🇵🇱 Processing WEB_SPEECH_TRANSCRIPT_METHOD2 (Polish + Diarization):', {
                        sessionId: data.sessionId,
                        text: data.transcript.text,
                        language: data.transcript.language,
                        confidence: data.transcript.confidence,
                        speaker: data.transcript.speaker || 'unknown'
                    });
                    await processWebSpeechTranscriptMethod2(ws, data);
                    break;
                    
                case 'WEB_SPEECH_PARTIAL_METHOD2':
                    console.log('🔬🇵🇱⚡ Processing WEB_SPEECH_PARTIAL_METHOD2 (Polish + Live Suggestions):', {
                        sessionId: data.sessionId,
                        text: data.transcript.text.substring(0, 30) + '...',
                        wordsCount: data.transcript.wordsCount,
                        speaker: data.transcript.speaker || 'unknown',
                        speakerRole: data.transcript.speakerRole || 'unknown'
                    });
                    await processWebSpeechPartialMethod2(ws, data);
                    break;
                    
                case 'END_REALTIME_SESSION':
                    console.log('🛑 Processing END_REALTIME_SESSION:', data.sessionId);
                    await endRealtimeSession(ws, data);
                    break;
                    
                // NOWE: Recording session handlers
                case 'START_RECORDING_SESSION':
                    console.log('🎥 Processing START_RECORDING_SESSION:', {
                        clientId: data.clientId,
                        productId: data.productId,
                        notes: data.notes?.substring(0, 50) + '...'
                    });
                    await startRecordingSession(ws, data);
                    break;
                    
                case 'RECORDING_TRANSCRIPT':
                    console.log('🎥📝 Processing RECORDING_TRANSCRIPT:', {
                        recordingId: data.recordingId,
                        transcriptLength: data.transcript?.length || 0,
                        isFinal: data.isFinal
                    });
                    await processRecordingTranscript(ws, data);
                    break;
                    
                case 'RECORDING_TRANSCRIPT_METHOD2':
                    console.log('🎥🔬📝 Processing RECORDING_TRANSCRIPT_METHOD2:', {
                        recordingId: data.recordingId,
                        transcriptLength: data.transcript?.text?.length || 0,
                        speaker: data.transcript?.speaker,
                        speakerRole: data.transcript?.speakerRole,
                        isFinal: data.isFinal
                    });
                    await processRecordingTranscriptMethod2(ws, data);
                    break;
                    
                case 'RECORDING_PARTIAL_METHOD2':
                    console.log('🎥🔬⚡📝 Processing RECORDING_PARTIAL_METHOD2:', {
                        recordingId: data.recordingId,
                        transcriptLength: data.transcript?.text?.substring(0, 30) + '...' || 0,
                        speaker: data.transcript?.speaker,
                        speakerRole: data.transcript?.speakerRole,
                        wordsCount: data.transcript?.wordsCount,
                        isPartial: data.isPartial
                    });
                    await processRecordingPartialMethod2(ws, data);
                    break;
                    
                case 'STOP_RECORDING_SESSION':
                    console.log('🎥🛑 Processing STOP_RECORDING_SESSION:', {
                        recordingId: data.recordingId,
                        finalTranscriptLength: data.finalTranscript?.length || 0
                    });
                    await stopRecordingSession(ws, data);
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

// Start Real-time AI Assistant Session with Method 2 (Enhanced Diarization)
async function startRealtimeSessionMethod2(ws, data) {
    const { clientId, productId, notes } = data;
    const sessionId = `method2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${sessionId}] [METHOD2-KROK 1] 🔬 Rozpoczynanie sesji Method 2 z Enhanced Diarization.`);

    try {
        console.log(`[${sessionId}] [METHOD2-KROK 2] 🔬 Zapytanie do bazy o klienta i produkt.`);
        const [clientResult, productResult] = await Promise.all([
            safeQuery('SELECT * FROM clients WHERE id = $1', [clientId]),
            safeQuery('SELECT * FROM products WHERE id = $1', [productId])
        ]);
        console.log(`[${sessionId}] [METHOD2-KROK 3] 🔬 Zapytanie do bazy zakończone.`);

        if (clientResult.rows.length === 0 || productResult.rows.length === 0) {
            console.error(`[${sessionId}] [METHOD2-BŁĄD] Nieprawidłowy ID klienta lub produktu.`);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid client or product ID' }));
            return;
        }
        console.log(`[${sessionId}] [METHOD2-KROK 4] 🔬 Klient i produkt zweryfikowani.`);

        const client = clientResult.rows[0];
        const product = productResult.rows[0];

        console.log(`[${sessionId}] [METHOD2-KROK 5] 🔬 Tworzenie sesji AssemblyAI Universal z diarization.`);
        
        // Method 2 uses POST request to create transcription with enhanced settings
        const transcriptionConfig = {
            audio_url: null, // We'll use realtime streaming
            language_code: 'pl', // Polish language
            speaker_labels: true, // Enable diarization
            speech_model: 'nano', // Use fast model for realtime
            auto_highlights: false,
            // Note: sentiment_analysis is only available for English
            punctuate: true,
            format_text: true
        };
        
        console.log(`[${sessionId}] [METHOD2-KROK 6] 🔬 Konfiguracja AssemblyAI Universal:`, transcriptionConfig);

        // For Method 2, we still need WebSocket but with different handling
        const assemblyAISession = await createAssemblyAISessionMethod2(sessionId, transcriptionConfig);
        console.log(`[${sessionId}] [METHOD2-KROK 7] 🔬 Obiekt sesji AssemblyAI Method 2 utworzony.`);

        const session = {
            ws, sessionId, clientId, productId, notes, client, product,
            method: 2, // Mark as Method 2
            assemblyAISession: {
                websocket: assemblyAISession.websocket,
                isConfigured: false,
                audioQueue: [],
                config: transcriptionConfig
            },
            conversationHistory: [],
            aiSuggestions: [],
            chatGPTHistory: [], // Nowe pole dla conversation history z ChatGPT
            startTime: new Date(),
        };
        console.log(`[${sessionId}] [METHOD2-KROK 8] 🔬 Obiekt sesji Method 2 utworzony.`);

        activeSessions.set(sessionId, session);
        console.log(`[${sessionId}] [METHOD2-KROK 9] 🔬 Sesja Method 2 zapisana w activeSessions. Liczba aktywnych: ${activeSessions.size}`);

        setupAssemblyAIHandlerMethod2(sessionId, session);
        console.log(`[${sessionId}] [METHOD2-KROK 10] 🔬 Handler AssemblyAI Method 2 skonfigurowany.`);

        ws.send(JSON.stringify({
            type: 'SESSION_STARTED',
            sessionId,
            method: 2,
            message: 'Real-time session Method 2 started successfully with enhanced diarization'
        }));
        console.log(`[${sessionId}] [METHOD2-KROK 11] 🔬 Wysłano SESSION_STARTED Method 2 do klienta.`);

        // Inicjalizujemy conversation history z system promptem zaraz po utworzeniu sesji
        console.log(`[${sessionId}] [METHOD2-KROK 12] 🤖 Inicjalizacja ChatGPT conversation history...`);
        initializeChatGPTConversation(session);
        console.log(`[${sessionId}] [METHOD2-KROK 13] 🤖 ChatGPT conversation history zainicjalizowana - gotowy do rozmowy!`);

    } catch (error) {
        console.error(`[${sessionId}] [METHOD2-BŁĄD KRYTYCZNY] Błąd w startRealtimeSessionMethod2:`, error);
        ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Failed to start real-time session Method 2: ' + error.message
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
    console.log(`[${sessionId}] 🔧 Creating AssemblyAI session (Method 1 - English only)...`);
    
    try {
        const token = await getAssemblyAIToken();
        // Method 1: Legacy API - tylko angielski
        const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`;
        
        console.log(`[${sessionId}] 🔌 Connecting to AssemblyAI Legacy WebSocket (English only):`, wsUrl);
        
        const assemblySocket = new WebSocket(wsUrl);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error(`[${sessionId}] ❌ AssemblyAI WebSocket connection timeout`);
                reject(new Error('AssemblyAI WebSocket connection timeout'));
            }, 10000);
            
            assemblySocket.on('open', () => {
                console.log(`[${sessionId}] ✅ AssemblyAI Legacy WebSocket connected successfully`);
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

// Create AssemblyAI Universal Real-time Session for Method 2 (NAPRAWIONA WERSJA)
async function createAssemblyAISessionMethod2(sessionId, config) {
    console.log(`[${sessionId}] 🔬 Creating CORRECTED AssemblyAI session for Method 2...`);
    
    try {
        const token = await getAssemblyAIToken();
        
        // UWAGA: AssemblyAI Real-time Streaming API nie obsługuje polskiego!
        // Użyjemy hybrydowego podejścia: Web Speech API (polski) + AssemblyAI (angielski backup)
        console.log(`[${sessionId}] ⚠️ IMPORTANT: Real-time AssemblyAI doesn't support Polish!`);
        console.log(`[${sessionId}] 🔬 Method 2 will use Web Speech API for Polish + AssemblyAI for backup`);
        
        // Legacy API dla backupu (tylko angielski)
        const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`;
        
        console.log(`[${sessionId}] 🔌 Connecting to AssemblyAI Legacy WebSocket as backup:`, wsUrl);
        
        const assemblySocket = new WebSocket(wsUrl);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error(`[${sessionId}] ❌ AssemblyAI Method 2 WebSocket connection timeout`);
                reject(new Error('AssemblyAI Method 2 WebSocket connection timeout'));
            }, 10000);
            
            assemblySocket.on('open', () => {
                console.log(`[${sessionId}] ✅ AssemblyAI Method 2 WebSocket connected successfully (backup only)`);
                clearTimeout(timeout);
                resolve({
                    websocket: assemblySocket,
                    isConfigured: false,
                    audioQueue: [],
                    config: config,
                    isBackupOnly: true // Oznacz że to backup
                });
            });
            
            assemblySocket.on('error', (error) => {
                console.error(`[${sessionId}] ❌ AssemblyAI Method 2 WebSocket connection error:`, error);
                clearTimeout(timeout);
                reject(error);
            });
        });
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error creating AssemblyAI Method 2 session:`, error);
        throw error;
    }
}

// NOWE: Process Web Speech API Transcript (for Polish language)
async function processWebSpeechTranscript(ws, data) {
    const { sessionId, transcript } = data;
    
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processWebSpeechTranscript: ${sessionId}`);
        return;
    }
    
    try {
        console.log(`[${sessionId}] 🇵🇱 Processing Web Speech transcript: "${transcript.text}"`);
        
        // Create transcript object similar to AssemblyAI format
        const processedTranscript = {
            text: transcript.text,
            message_type: 'FinalTranscript', // Web Speech API provides final transcripts
            confidence: transcript.confidence || 0.9,
            language: transcript.language || 'pl'
        };
        
        // Process the transcript (same as AssemblyAI)
        await processTranscript(sessionId, processedTranscript);
        
        console.log(`[${sessionId}] ✅ Web Speech transcript processed successfully`);
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error processing Web Speech transcript:`, error);
        session.ws.send(JSON.stringify({
            type: 'WEB_SPEECH_ERROR',
            error: error.message
        }));
    }
}

// NOWE: Process Web Speech API Transcript for Method 2 (Polish with Speaker Diarization)
async function processWebSpeechTranscriptMethod2(ws, data) {
    const { sessionId, transcript } = data;
    
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processWebSpeechTranscriptMethod2: ${sessionId}`);
        return;
    }
    
    try {
        console.log(`[${sessionId}] 🔬🇵🇱 Processing Web Speech Method 2 transcript: "${transcript.text}"`);
        console.log(`[${sessionId}] 🔬🇵🇱 Speaker info:`, {
            speaker: transcript.speaker || 'unknown',
            language: transcript.language || 'pl',
            confidence: transcript.confidence || 0.9
        });
        
        // Create enhanced transcript object with speaker diarization for Method 2
        const processedTranscript = {
            speaker: transcript.speaker || 'unknown',
            speakerRole: transcript.speakerRole || 'unknown', // Will be determined in processing
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence || 0.9,
            language: transcript.language || 'pl',
            method: 2, // Mark as Method 2
            message_type: 'FinalTranscript' // Add message_type for Web Speech API compatibility
        };
        
        // Process the transcript with Method 2 enhanced processing
        await processTranscriptMethod2(sessionId, processedTranscript);
        
        console.log(`[${sessionId}] ✅ Web Speech Method 2 transcript processed successfully`);
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error processing Web Speech Method 2 transcript:`, error);
        session.ws.send(JSON.stringify({
            type: 'WEB_SPEECH_ERROR',
            error: error.message
        }));
    }
}

// NOWE: Process Web Speech API Partial Transcript for Method 2 (Polish with Live AI Suggestions)
async function processWebSpeechPartialMethod2(ws, data) {
    const { sessionId, transcript } = data;
    
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processWebSpeechPartialMethod2: ${sessionId}`);
        return;
    }
    
    try {
        console.log(`[${sessionId}] 🔬🇵🇱⚡ Processing Web Speech Method 2 PARTIAL transcript for live suggestions: "${transcript.text.substring(0, 30)}..."`);
        console.log(`[${sessionId}] 🔬🇵🇱⚡ Partial transcript info:`, {
            speaker: transcript.speaker || 'unknown',
            speakerRole: transcript.speakerRole || 'unknown',
            wordsCount: transcript.wordsCount,
            language: transcript.language || 'pl',
            confidence: transcript.confidence || 0.9
        });
        
        // Create partial transcript object for live AI suggestions
        const partialTranscript = {
            speaker: transcript.speaker || 'unknown',
            speakerRole: transcript.speakerRole || 'unknown',
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence || 0.9,
            language: transcript.language || 'pl',
            method: 2,
            wordsCount: transcript.wordsCount || transcript.text.split(' ').length,
            isPartial: true // Mark as partial for live suggestions
        };
        
        // Process partial transcript for live AI suggestions
        await processPartialTranscriptMethod2(sessionId, partialTranscript);
        
        console.log(`[${sessionId}] ✅ Web Speech Method 2 PARTIAL transcript processed for live suggestions`);
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error processing Web Speech Method 2 partial transcript:`, error);
        session.ws.send(JSON.stringify({
            type: 'WEB_SPEECH_ERROR',
            error: error.message
        }));
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
            // Send audio data in JSON format (works for both legacy and Universal API)
            const audioMessage = JSON.stringify({ audio_data: audioData });
            assemblyAISession.websocket.send(audioMessage);
            
            // Enhanced logging for debugging
            if (session.method === 2) {
                if (ws.audioChunkCount % 500 === 0) {
                    console.log(`[${sessionId}] 🔬 Method 2 audio processing: chunk ${ws.audioChunkCount}, WebSocket state: ${assemblyAISession.websocket.readyState}`);
                }
            } else {
                if (ws.audioChunkCount % 1000 === 0) {
                    console.log(`[${sessionId}] 🔧 Method 1 audio processing: chunk ${ws.audioChunkCount}`);
                }
            }
        } else {
            // Queue audio data if not ready
            console.log(`🎵 Queueing audio chunk for session ${sessionId} (isConfigured: ${assemblyAISession.isConfigured}, state: ${assemblyAISession.websocket.readyState})`);
            assemblyAISession.audioQueue.push(audioData);

            // Check if we need to recreate the WebSocket
            if (assemblyAISession.websocket.readyState === WebSocket.CLOSED || 
                assemblyAISession.websocket.readyState === WebSocket.CLOSING) {
                console.log(`🔄 WebSocket for session ${sessionId} is closed. Attempting to recreate...`);
                try {
                    // Use correct session creation method based on session method
                    let newAssemblyAISession;
                    if (session.method === 2) {
                        newAssemblyAISession = await createAssemblyAISessionMethod2(sessionId, session.assemblyAISession.config);
                        console.log(`🔬 Recreating Method 2 session for ${sessionId}`);
                    } else {
                        newAssemblyAISession = await createAssemblyAISession(sessionId);
                        console.log(`🔧 Recreating Method 1 session for ${sessionId}`);
                    }
                    
                    // Update the session with new WebSocket but preserve queue
                    assemblyAISession.websocket = newAssemblyAISession.websocket;
                    assemblyAISession.isConfigured = false;
                    
                    // Setup correct handlers based on session method
                    if (session.method === 2) {
                        setupAssemblyAIHandlerMethod2(sessionId, session);
                        console.log(`✅ New Method 2 WebSocket for session ${sessionId} created with diarization handlers`);
                    } else {
                        setupAssemblyAIHandler(sessionId, session);
                        console.log(`✅ New Method 1 WebSocket for session ${sessionId} created with legacy handlers`);
                    }
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
        console.log(`[${sessionId}] ✅ AssemblyAI WebSocket opened, processing queue without config...`);
        
        // FOR LEGACY API: Configuration is set via URL parameters, not JSON message
        // The sample_rate is already set in the WebSocket URL
        session.assemblyAISession.isConfigured = true;
        
        console.log(`[${sessionId}] ⚡ Skipping configuration - using URL parameters`);
        
        // Process queued audio
        const queue = session.assemblyAISession.audioQueue;
        console.log(`[${sessionId}] 📦 Processing ${queue.length} queued audio chunks...`);
        
        while (queue.length > 0) {
            const audioData = queue.shift();
            try {
                const audioMessage = JSON.stringify({ audio_data: audioData });
                assemblySocket.send(audioMessage);
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

// Setup AssemblyAI Universal Real-time Handler for Method 2 (with enhanced diarization)
function setupAssemblyAIHandlerMethod2(sessionId, session) {
    const assemblySocket = session.assemblyAISession.websocket;
    
    console.log(`[${sessionId}] 🔬 Setting up AssemblyAI Universal handlers for Method 2...`);
    console.log(`[${sessionId}] 🔍 WebSocket readyState: ${assemblySocket.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);

    // Function to send configuration and process queue for Universal API
    const sendConfigurationAndProcessQueue = () => {
        console.log(`[${sessionId}] ✅ AssemblyAI Universal WebSocket opened, processing queue...`);
        
        // Universal API: Skip sending configuration - parameters are in URL  
        // The configuration is already set via URL parameters (?speaker_labels=true)
        console.log(`[${sessionId}] ⚡ Universal API: Configuration set via URL parameters, not WebSocket message`);
        
        session.assemblyAISession.isConfigured = true;
        console.log(`[${sessionId}] ⚡ Universal API configured with Polish language and diarization`);
        
        // Process queued audio
        const queue = session.assemblyAISession.audioQueue;
        console.log(`[${sessionId}] 📦 Processing ${queue.length} queued audio chunks...`);
        
        while (queue.length > 0) {
            const audioData = queue.shift();
            try {
                const audioMessage = JSON.stringify({ audio_data: audioData });
                assemblySocket.send(audioMessage);
            } catch (error) {
                console.error(`[${sessionId}] ❌ Error sending queued audio:`, error);
                break;
            }
        }
        
        console.log(`[${sessionId}] ✅ Audio queue processed for Universal API`);
    };

    // Check if WebSocket is already open
    if (assemblySocket.readyState === WebSocket.OPEN) {
        console.log(`[${sessionId}] 🔄 Universal WebSocket already open, sending configuration immediately`);
        sendConfigurationAndProcessQueue();
    }

    assemblySocket.on('open', () => {
        console.log(`[${sessionId}] 🔗 AssemblyAI Universal WebSocket 'open' event triggered`);
        sendConfigurationAndProcessQueue();
    });

    assemblySocket.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`[${sessionId}] 📨 Method 2 AssemblyAI Universal message:`, parsedMessage.message_type || 'unknown');
            
            // Enhanced debugging for Method 2
            if (parsedMessage.message_type === 'PartialTranscript' || parsedMessage.message_type === 'FinalTranscript') {
                console.log(`[${sessionId}] 🔬 Method 2 transcript:`, {
                    type: parsedMessage.message_type,
                    text: parsedMessage.text,
                    hasWords: !!parsedMessage.words,
                    wordsCount: parsedMessage.words?.length || 0,
                    confidence: parsedMessage.confidence
                });
            }
            
            if (parsedMessage.error) {
                console.error(`[${sessionId}] ❌ AssemblyAI Universal error:`, parsedMessage.error);
                session.ws.send(JSON.stringify({
                    type: 'ASSEMBLYAI_ERROR',
                    error: parsedMessage.error
                }));
                return;
            }

            // Handle different message types from Universal API
            switch (parsedMessage.message_type) {
                case 'SessionBegins':
                    console.log(`[${sessionId}] 🎬 AssemblyAI Universal session began`);
                    break;
                    
                case 'PartialTranscript':
                    if (parsedMessage.text && parsedMessage.text.trim()) {
                        console.log(`[${sessionId}] 📝 Universal Partial transcript:`, parsedMessage.text, 'Words:', parsedMessage.words?.length);
                        
                        // Extract speaker info from words if available
                        let speakerInfo = 'unknown';
                        if (parsedMessage.words && parsedMessage.words.length > 0) {
                            // Get speaker from first word or most common speaker
                            const speakers = parsedMessage.words.map(w => w.speaker).filter(s => s);
                            speakerInfo = speakers[0] || 'unknown';
                        }
                        
                        session.ws.send(JSON.stringify({
                            type: 'PARTIAL_TRANSCRIPT',
                            transcript: {
                                text: parsedMessage.text,
                                speaker: speakerInfo,
                                confidence: parsedMessage.confidence,
                                method: 2
                            }
                        }));
                        
                        // Generate live AI suggestions for longer partial transcripts (15+ words)
                        const wordCount = parsedMessage.text.split(' ').length;
                        if (wordCount >= 15) {
                            console.log(`[${sessionId}] 🔬⚡ Generating live AI suggestions for partial transcript (${wordCount} words)`);
                            
                            // Create temporary transcript object for live suggestions
                            const partialTranscript = {
                                speaker: speakerInfo,
                                speakerRole: 'unknown', // Will be determined in processing
                                text: parsedMessage.text,
                                timestamp: new Date().toISOString(),
                                confidence: parsedMessage.confidence || 0,
                                wordsCount: wordCount,
                                method: 2,
                                isPartial: true // Mark as partial for different handling
                            };
                            
                            // Process partial transcript for live suggestions without adding to history
                            await processPartialTranscriptMethod2(sessionId, partialTranscript);
                        }
                    }
                    break;
                    
                case 'FinalTranscript':
                    if (parsedMessage.text && parsedMessage.text.trim()) {
                        console.log(`[${sessionId}] ✅ Universal Final transcript:`, parsedMessage.text);
                        console.log(`[${sessionId}] 🔍 Full AssemblyAI response:`, JSON.stringify(parsedMessage, null, 2));
                        
                        // Debug speaker detection
                        if (parsedMessage.words && parsedMessage.words.length > 0) {
                            const speakers = parsedMessage.words.map(w => w.speaker).filter(s => s);
                            const uniqueSpeakers = [...new Set(speakers)];
                            console.log(`[${sessionId}] 🎤 Speaker detection:`, {
                                totalWords: parsedMessage.words.length,
                                wordsWithSpeakers: speakers.length,
                                uniqueSpeakers: uniqueSpeakers,
                                speakerSample: parsedMessage.words.slice(0, 3).map(w => ({word: w.text, speaker: w.speaker}))
                            });
                        } else {
                            console.log(`[${sessionId}] ❌ No words array in AssemblyAI response - diarization may not be working`);
                        }
                        
                        await processTranscriptMethod2(sessionId, parsedMessage);
                    }
                    break;
                    
                case 'SessionTerminated':
                    console.log(`[${sessionId}] 🔚 AssemblyAI Universal session terminated`);
                    break;
                    
                default:
                    console.log(`[${sessionId}] ❓ Unknown AssemblyAI Universal message type:`, parsedMessage.message_type);
            }
        } catch (error) {
            console.error(`[${sessionId}] ❌ Error parsing AssemblyAI Universal message:`, error, 'Raw message:', message.toString());
        }
    });

    assemblySocket.on('close', (code, reason) => {
        console.log(`[${sessionId}] 🔌 AssemblyAI Universal WebSocket closed. Code: ${code}, Reason: ${String(reason)}`);
        if (session && session.assemblyAISession) {
            session.assemblyAISession.isConfigured = false;
        }
    });

    assemblySocket.on('error', (error) => {
        console.error(`[${sessionId}] ❌ AssemblyAI Universal WebSocket error:`, error);
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

// Process Partial Transcript for Method 2 - Live AI Suggestions without saving to history
async function processPartialTranscriptMethod2(sessionId, partialTranscript) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processPartialTranscriptMethod2: ${sessionId}`);
        return;
    }

    console.log(`[${sessionId}] 🔬⚡ Processing Method 2 PARTIAL transcript for live suggestions:`, partialTranscript.text.substring(0, 50) + '...');

    try {
        // Determine speaker role based on existing conversation pattern (don't save to history)
        let speakerRole = 'unknown';
        const speakerInfo = partialTranscript.speaker;
        
        if (speakerInfo !== 'unknown' && session.conversationHistory.length > 0) {
            // Try to match with recent speakers to determine role
            const recentSpeakers = session.conversationHistory.slice(-3);
            const matchingSpeaker = recentSpeakers.find(t => t.speaker === speakerInfo);
            
            if (matchingSpeaker) {
                speakerRole = matchingSpeaker.speakerRole;
            } else {
                // New speaker - alternate roles
                const lastRole = session.conversationHistory[session.conversationHistory.length - 1].speakerRole;
                speakerRole = lastRole === 'salesperson' ? 'client' : 'salesperson';
            }
        } else if (session.conversationHistory.length === 0) {
            speakerRole = 'salesperson'; // First speaker is usually salesperson
        }

        // Create temporary transcript object with role
        const tempTranscript = {
            ...partialTranscript,
            speakerRole: speakerRole
        };

        console.log(`[${sessionId}] 🔬⚡ Live partial transcript - Speaker: ${speakerRole}, Words: ${partialTranscript.wordsCount || partialTranscript.text.split(' ').length}`);

        // NOWA LOGIKA: Inteligentne generowanie live suggestions
        const wordCount = partialTranscript.wordsCount || partialTranscript.text.split(' ').length;
        const conversationLength = session.conversationHistory.length;
        
        // Sprawdź czy wypowiedź ma sens semantyczny (nie jest w połowie słowa/zdania)
        const text = partialTranscript.text.trim();
        const endsWithPunctuation = /[.!?,:;]$/.test(text);
        const hasCompleteSentence = /[.!?]/.test(text);
        const lastWord = text.split(' ').pop();
        const seemsComplete = endsWithPunctuation || hasCompleteSentence || wordCount >= 12;
        
        // Sprawdź czy to nie jest powtórzenie ostatniej sugestii
        const lastSuggestionTime = session.lastLiveSuggestionTime || 0;
        const timeSinceLastSuggestion = Date.now() - lastSuggestionTime;
        const minTimeBetweenSuggestions = 3000; // 3 sekundy między sugestiami
        
        // Inteligentne progi słów
        let wordThreshold;
        if (conversationLength < 2) {
            wordThreshold = 8; // Pierwsza wypowiedź - poczekaj na więcej kontekstu
        } else if (conversationLength < 5) {
            wordThreshold = 6; // Początek rozmowy - trochę szybciej
        } else {
            wordThreshold = 10; // Później w rozmowie - czekaj na więcej kontekstu
        }
        
        // Generuj sugestie tylko jeśli:
        // 1. Wystarczająco słów
        // 2. Wypowiedź wydaje się kompletna ALBO jest bardzo długa
        // 3. Minęło wystarczająco czasu od ostatniej sugestii
        const shouldGenerate = wordCount >= wordThreshold && 
                              seemsComplete && 
                              timeSinceLastSuggestion > minTimeBetweenSuggestions;
        
        if (shouldGenerate) {
            console.log(`[${sessionId}] 🔬⚡ Generating SMART live AI suggestions:`, {
                wordCount,
                threshold: wordThreshold,
                seemsComplete,
                timeSinceLastSuggestion: `${timeSinceLastSuggestion}ms`,
                text: text.substring(0, 50) + '...'
            });
            
            session.lastLiveSuggestionTime = Date.now();
            await generateLiveAISuggestionsMethod2(session, tempTranscript);
        } else {
            console.log(`[${sessionId}] 🔬⚡ Skipping live suggestions:`, {
                wordCount,
                threshold: wordThreshold,
                seemsComplete,
                timeSinceLastSuggestion: `${timeSinceLastSuggestion}ms`,
                reason: !seemsComplete ? 'incomplete sentence' : 
                       wordCount < wordThreshold ? 'too few words' : 'too soon'
            });
        }
        
    } catch (error) {
        console.error(`[${sessionId}] 🔬❌ Error processing partial transcript Method 2:`, error);
    }
}

// Process Transcript for Method 2 with Enhanced Diarization
async function processTranscriptMethod2(sessionId, transcript) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.error(`❌ Session not found for processTranscriptMethod2: ${sessionId}`);
        return;
    }

    console.log(`[${sessionId}] 🔬 Processing Method 2 transcript with diarization:`, transcript.text);
    console.log(`[${sessionId}] 🔬 Words data:`, transcript.words?.slice(0, 5)); // Show first 5 words

    if (transcript.text && transcript.message_type === 'FinalTranscript') {
        // Enhanced speaker detection - handle both AssemblyAI (words array) and Web Speech API
        let speakerInfo = transcript.speaker || 'unknown';
        let speakerWords = {};
        
        if (transcript.words && transcript.words.length > 0) {
            // AssemblyAI mode: Count words per speaker from words array
            transcript.words.forEach(word => {
                if (word.speaker) {
                    if (!speakerWords[word.speaker]) {
                        speakerWords[word.speaker] = 0;
                    }
                    speakerWords[word.speaker]++;
                }
            });
            
            // Get dominant speaker for this transcript
            if (Object.keys(speakerWords).length > 0) {
                speakerInfo = Object.keys(speakerWords).reduce((a, b) => 
                    speakerWords[a] > speakerWords[b] ? a : b);
            }
            
            console.log(`[${sessionId}] 🔬 AssemblyAI Speaker analysis:`, {
                speakerWords,
                dominantSpeaker: speakerInfo,
                totalWords: transcript.words.length
            });
        } else {
            // Web Speech API mode: Use speaker from frontend detection
            console.log(`[${sessionId}] 🔬🇵🇱 Web Speech API mode - using frontend speaker detection:`, {
                speaker: speakerInfo,
                speakerRole: transcript.speakerRole,
                method: transcript.method
            });
        }
        
        // Determine speaker role - prioritize frontend detection (Web Speech API) or analyze conversation context
        let speakerRole = transcript.speakerRole || speakerInfo;
        
        if (!transcript.speakerRole && speakerInfo !== 'unknown') {
            // Fallback: Analyze conversation pattern for AssemblyAI mode
            const conversationLength = session.conversationHistory.length;
            if (conversationLength === 0) {
                speakerRole = 'salesperson'; // First speaker is usually salesperson
            } else {
                // Analyze conversation pattern to determine if speaker is salesperson or client
                const lastSpeaker = session.conversationHistory[conversationLength - 1].speaker;
                if (lastSpeaker === speakerInfo) {
                    speakerRole = session.conversationHistory[conversationLength - 1].speakerRole || 'unknown';
                } else {
                    // Different speaker - alternate between salesperson and client
                    const salespersonCount = session.conversationHistory.filter(t => t.speakerRole === 'salesperson').length;
                    const clientCount = session.conversationHistory.filter(t => t.speakerRole === 'client').length;
                    speakerRole = salespersonCount <= clientCount ? 'salesperson' : 'client';
                }
            }
        }
        
        console.log(`[${sessionId}] 🔬 Final speaker determination:`, {
            originalSpeaker: transcript.speaker,
            originalSpeakerRole: transcript.speakerRole,
            finalSpeaker: speakerInfo,
            finalSpeakerRole: speakerRole,
            method: transcript.method
        });

        const newTranscript = {
            speaker: speakerInfo, // Raw speaker ID from AssemblyAI (A, B, C, etc.) or Web Speech API
            speakerRole: speakerRole, // Enhanced role (salesperson, client, unknown)
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence || 0,
            wordsCount: transcript.words?.length || transcript.text.split(' ').length, // Use words array or count words
            method: 2
        };
        
        session.conversationHistory.push(newTranscript);
        console.log(`[${sessionId}] 📚 Added Method 2 transcript to conversation history. Total: ${session.conversationHistory.length}`);
        console.log(`[${sessionId}] 🔬 Transcript details:`, {
            speaker: newTranscript.speaker,
            speakerRole: newTranscript.speakerRole,
            text: newTranscript.text.substring(0, 50) + '...',
            wordsCount: newTranscript.wordsCount
        });

        // Send final transcript to frontend with enhanced info
        session.ws.send(JSON.stringify({
            type: 'FINAL_TRANSCRIPT',
            transcript: newTranscript
        }));

        // Generate and send enhanced AI suggestions with speaker context immediately
        console.log(`[${sessionId}] 🔬⚡ Generating real-time AI suggestions for Method 2...`);
        await generateAISuggestionsMethod2(session, newTranscript);
        
        // Also generate faster live suggestions for immediate feedback
        if (newTranscript.text.split(' ').length >= 8) {
            console.log(`[${sessionId}] 🔬⚡⚡ Also generating LIVE suggestions for immediate feedback...`);
            setTimeout(() => {
                generateLiveAISuggestionsMethod2(session, {
                    ...newTranscript,
                    isPartial: false // This is final but we want quick suggestions too
                });
            }, 100); // Small delay to not overwhelm the API
        }
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
                { role: "user", content: `REAL-TIME SALES COACHING - ANALIZA WYPOWIEDZI:

AKTUALNA WYPOWIEDŹ: "${newTranscript.text}"

KONTEKST ROZMOWY (ostatnie 5 wypowiedzi):
${latestHistory}

Jako EKSPERT SPRZEDAŻY przeanalizuj tę wypowiedź i podaj konkretne wskazówki dla sprzedawcy:
- Oceń poziom zainteresowania klienta
- Wykryj sygnały zakupowe lub oporu
- Wskaż konkretne akcje nastawione na domknięcie sprzedaży
- Wykorzystaj informacje o kliencie i produkcie
- Unikaj ogólników typu "słuchaj aktywnie", "zadawaj pytania"
- Podaj maksymalnie 3 konkretne, działalne sugestie` }
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

// Enhanced AI Suggestions for Method 2 with Speaker Diarization
async function generateAISuggestionsMethod2(session, newTranscript) {
    const sessionId = session.sessionId;
    const startTime = Date.now();
    
    try {
        console.log(`[${sessionId}] 🔬🤖 Generating Method 2 AI suggestions for: "${newTranscript.text}"`);
        console.log(`[${sessionId}] 🔬🤖 Speaker role: ${newTranscript.speakerRole}, Speaker ID: ${newTranscript.speaker}`);
        
        const gptContext = createGPTContextMethod2(session.client, session.product, session.notes);
        
        // Enhanced conversation history with speaker roles
        const latestHistory = session.conversationHistory.slice(-5).map(t => {
            const roleLabel = t.speakerRole === 'salesperson' ? '🔵SPRZEDAWCA' : 
                            t.speakerRole === 'client' ? '🔴KLIENT' : 
                            `🟡${t.speaker || 'NIEZNANY'}`;
            return `[${roleLabel}] ${t.text}`;
        }).join('\n');
        
        // Sprawdź czy to nie jest powtórzenie ostatniej analizy
        const lastFinalSuggestion = session.aiSuggestions.slice(-1)[0];
        const avoidRepetition = lastFinalSuggestion ? `

WAŻNE: Unikaj powtarzania poprzedniej analizy. Ostatnia analiza: "${JSON.stringify(lastFinalSuggestion.suggestions).substring(0, 150)}..."` : '';

        // Enhanced prompt with speaker context - zgodny z nowym głównym promptem
        const prompt = `ANALIZA KOMPLETNEJ WYPOWIEDZI - REAL-TIME SALES COACHING:

AKTUALNA WYPOWIEDŹ (FINALNA):
Mówca: ${newTranscript.speakerRole === 'salesperson' ? '🔵 SPRZEDAWCA' : 
       newTranscript.speakerRole === 'client' ? '🔴 KLIENT' : 
       '🟡 ' + (newTranscript.speaker || 'NIEZNANY')}
Tekst: "${newTranscript.text}"

KONTEKST ROZMOWY (ostatnie 5 wypowiedzi):
${latestHistory}

🎯 ANALIZA SPRZEDAŻOWA - KOMPLETNA WYPOWIEDŹ:

TWOJE ZADANIE jako REAL-TIME SALES COACH:
- Oceń poziom zainteresowania klienta
- Wykryj sygnały zakupowe lub oporu
- Wskaż konkretne akcje dla sprzedawcy
- Zidentyfikuj błędy w podejściu sprzedażowym
- Podpowiedz jak wykorzystać informacje o kliencie i produkcie

ZASADY ANALIZY:
- To jest kompletna wypowiedź - daj pełną analizę nastawioną na domknięcie sprzedaży
- Skoncentruj się na sygnałach kupna/oporu/zainteresowania
- Podaj maksymalnie 3 konkretne, działalne sugestie
- Unikaj ogólników typu "słuchaj aktywnie", "zadawaj pytania"
- Jeśli to klient - jak sprzedawca ma skutecznie reagować?
- Jeśli to sprzedawca - oceń jego technikę i podpowiedz lepsze podejście
- Wskaż momenty decyzyjne i najlepsze momenty na call-to-action${avoidRepetition}

STATYSTYKI SESJI:
- Liczba wypowiedzi: ${session.conversationHistory.length}
- Obecny mówca: ${newTranscript.speakerRole}
- Metoda: Enhanced Diarization`;

        // Debug: Check if OpenAI is available
        console.log(`[${sessionId}] 🔬🔍 OpenAI check:`, {
            openaiDefined: typeof openai !== 'undefined',
            openaiApiKey: !!process.env.OPENAI_API_KEY,
            hasApiKey: process.env.OPENAI_API_KEY?.substring(0, 20) + '...'
        });

        // Debug info removed for better performance

        // Dodaj nową wypowiedź do conversation history
        const userMessage = { role: "user", content: prompt };
        
        // Używamy conversation history zamiast wysyłania system prompt za każdym razem
        const messages = [
            ...session.chatGPTHistory, // Zawiera system prompt + poprzednie rozmowy
            userMessage
        ];

        // Ogranicz historię do ostatnich 20 wiadomości (+ system prompt) dla performance
        const maxMessages = 21; // system + 20 wiadomości
        const trimmedMessages = messages.length > maxMessages 
            ? [messages[0], ...messages.slice(-maxMessages + 1)] // Zachowaj system prompt + ostatnie wiadomości
            : messages;

        console.log(`[${sessionId}] 🔬📊 Using conversation history: ${trimmedMessages.length} messages (system + ${trimmedMessages.length - 1} conversation)`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: trimmedMessages,
            response_format: { type: "json_object" },
        });

        const responseTime = Date.now() - startTime;
        const aiSuggestions = JSON.parse(completion.choices[0].message.content);
        const assistantMessage = { role: "assistant", content: completion.choices[0].message.content };
        
        // Dodaj user message i assistant response do conversation history
        session.chatGPTHistory.push(userMessage, assistantMessage);
        
        console.log(`[${sessionId}] 🔬🎯 Method 2 AI suggestions generated in ${responseTime}ms:`, aiSuggestions);
        console.log(`[${sessionId}] 🔬💾 Conversation history updated: ${session.chatGPTHistory.length} total messages`);

        // Debug info removed for better performance

        // Enhanced suggestion object with Method 2 data
        const enhancedSuggestion = {
            transcript: newTranscript.text,
            speaker: newTranscript.speaker,
            speakerRole: newTranscript.speakerRole,
            suggestions: aiSuggestions,
            timestamp: new Date().toISOString(),
            method: 2
        };

        session.aiSuggestions.push(enhancedSuggestion);

        // Send AI suggestions to frontend with enhanced info
        session.ws.send(JSON.stringify({
            type: 'AI_SUGGESTIONS',
            suggestions: aiSuggestions,
            speakerInfo: {
                speaker: newTranscript.speaker,
                speakerRole: newTranscript.speakerRole,
                method: 2
            }
        }));
        
        console.log(`[${sessionId}] 🔬📤 Method 2 AI suggestions sent to frontend`);
        
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`[${sessionId}] 🔬❌ Error generating Method 2 AI suggestions after ${errorTime}ms:`, error);
        
        // Debug info removed for better performance
        
        // Send fallback suggestions with Method 2 context
        const fallbackSuggestions = {
            analiza_mowcy: newTranscript.speakerRole || "nieznany",
            intencja: "Kontynuuj rozmowę",
            emocje: "neutralne",
            sugestie: [
                newTranscript.speakerRole === 'client' ? 
                    "Klient wypowiedział się - przeanalizuj jego potrzeby" : 
                    "Kontynuuj rozmowę zgodnie z technikami sprzedaży",
                "Zadaj pytania odkrywcze",
                "Słuchaj aktywnie i dopasuj ofertę"
            ],
            sygnaly: [],
            dynamika_rozmowy: "Analiza automatyczna z rozpoznaniem mówców",
            nastepny_krok: "Dostosuj strategię do wypowiedzi " + (newTranscript.speakerRole === 'client' ? 'klienta' : 'rozmówcy')
        };
        
        session.ws.send(JSON.stringify({
            type: 'AI_SUGGESTIONS',
            suggestions: fallbackSuggestions,
            speakerInfo: {
                speaker: newTranscript.speaker,
                speakerRole: newTranscript.speakerRole,
                method: 2
            }
        }));
    }
}

// Generate Live AI Suggestions for Method 2 - Optimized for partial transcripts
async function generateLiveAISuggestionsMethod2(session, partialTranscript) {
    const sessionId = session.sessionId;
    const startTime = Date.now();
    
    try {
        console.log(`[${sessionId}] 🔬⚡ Generating LIVE Method 2 AI suggestions for partial: "${partialTranscript.text.substring(0, 30)}..."`);
        
        // Sprawdź czy ostatnia sugestia była podobna (unikaj powtórzeń)
        const lastSuggestion = session.chatGPTHistory?.slice(-2).find(msg => msg.role === 'assistant');
        const avoidRepetition = lastSuggestion ? `
        
WAŻNE: Unikaj powtarzania poprzedniej sugestii. Ostatnia sugestia: "${lastSuggestion.content.substring(0, 100)}..."` : '';

        // Prompt dla live suggestions zgodny z nowym głównym promptem
        const livePrompt = `LIVE SALES COACHING - WYPOWIEDŹ CZĘŚCIOWA:

KONTEKST MÓWCY: ${partialTranscript.speakerRole === 'salesperson' ? '🔵 SPRZEDAWCA' : 
                  partialTranscript.speakerRole === 'client' ? '🔴 KLIENT' : '🟡 NIEZNANY'}

WYPOWIEDŹ (${partialTranscript.wordsCount || partialTranscript.text.split(' ').length} słów): 
"${partialTranscript.text}"

🎯 REAL-TIME SALES COACHING:
Jako EKSPERT SPRZEDAŻY oceń:
- Czy wypowiedź zawiera kompletną myśl do analizy?
- Jakie są kluczowe sygnały sprzedażowe w tej wypowiedzi?
- Czy sprzedawca potrzebuje natychmiastowej pomocy?
- Czy klient wykazuje sygnały kupna/oporu/zainteresowania?

ZASADY LIVE COACHING:
- Jeśli wypowiedź jest niekompletna - poczekaj na więcej kontekstu
- Jeśli widać wyraźny sygnał sprzedażowy - podaj konkretną akcję
- Unikaj ogólników typu "słuchaj aktywnie", "zadawaj pytania"
- Maksymalnie 2 konkretne sugestie nastawione na domknięcie sprzedaży
- Wykorzystuj informacje o kliencie i produkcie do personalizacji${avoidRepetition}

JSON (po polsku):
{
  "analiza_mowcy": "sprzedawca|klient|nieznany",
  "czy_kompletna": "tak|nie|częściowo",
  "sugestie": ["max 2 konkretne sugestie sprzedażowe lub 'Poczekaj na więcej'"],
  "sygnaly": ["tylko wyraźne sygnały kupna/oporu/zainteresowania"],
  "akcja": "konkretna akcja sprzedażowa lub 'Słuchaj dalej'"
}`;

        // Debug info removed for better performance

        // Użyj conversation history zamiast krótkiego kontekstu
        const messages = [
            ...session.chatGPTHistory, // Pełna historia z system promptem
            { role: "user", content: livePrompt }
        ];

        // Ogranicz historię dla szybkości (system + ostatnie 10 wiadomości)
        const maxMessages = 11; // system + 10 wiadomości
        const trimmedMessages = messages.length > maxMessages 
            ? [messages[0], ...messages.slice(-maxMessages + 1)] // Zachowaj system prompt + ostatnie wiadomości
            : messages;

        console.log(`[${sessionId}] 🔬⚡ LIVE suggestions using conversation history: ${trimmedMessages.length} messages`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Szybszy model dla live suggestions
            messages: trimmedMessages,
            response_format: { type: "json_object" },
            max_tokens: 200, // Jeszcze mniej tokenów dla szybkości
        });

        const responseTime = Date.now() - startTime;
        const liveAISuggestions = JSON.parse(completion.choices[0].message.content);
        const assistantMessage = { role: "assistant", content: completion.choices[0].message.content };
        
        // Dodaj live prompt i response do conversation history (dla kontekstu następnych sugestii)
        const userMessage = { role: "user", content: livePrompt };
        session.chatGPTHistory.push(userMessage, assistantMessage);
        
        console.log(`[${sessionId}] 🔬⚡ LIVE Method 2 AI suggestions generated in ${responseTime}ms:`, liveAISuggestions);
        console.log(`[${sessionId}] 🔬⚡💾 LIVE conversation history updated: ${session.chatGPTHistory.length} total messages`);

        // Debug info removed for better performance

        // Send live AI suggestions to frontend with special indicator
        session.ws.send(JSON.stringify({
            type: 'AI_SUGGESTIONS',
            suggestions: liveAISuggestions,
            speakerInfo: {
                speaker: partialTranscript.speaker,
                speakerRole: partialTranscript.speakerRole,
                method: 2,
                isLive: true // Mark as live suggestion
            }
        }));
        
        console.log(`[${sessionId}] 🔬⚡ LIVE Method 2 AI suggestions sent to frontend`);
        
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`[${sessionId}] 🔬⚡❌ Error generating LIVE Method 2 AI suggestions after ${errorTime}ms:`, error);
        
        // Debug info removed for better performance
    }
}

// Create GPT Context
function createGPTContext(client, product, notes) {
    return `Jesteś EKSPERTEM SPRZEDAŻY i REAL-TIME SALES COACHEM.

Twoje zadanie to aktywne wsparcie sprzedawcy podczas rozmowy z klientem (lub grupą klientów), nawet jeśli transkrypcja jest nieidealna, a role rozmówców nie są jasno oznaczone. Twoim celem jest skuteczne domknięcie sprzedaży, maksymalizacja zaangażowania klienta i przekucie rozmowy w sukces biznesowy.

📊 INFORMACJE O KLIENCIE:
KLIENT: ${client.name}
${client.description ? `Opis: ${client.description}` : ''}
${client.comment ? `Notatki: ${client.comment}` : ''}

📦 INFORMACJE O PRODUKCIE:
PRODUKT: ${product.name}
${product.description ? `Opis: ${product.description}` : ''}
${product.comment ? `Notatki: ${product.comment}` : ''}

${notes ? `📝 NOTATKI SESJI: ${notes}` : ''}

🎯 ZASADY DZIAŁANIA:

1. Nasłuchuj rozmowy na bieżąco (również w formie ciągłego tekstu, bez wyraźnego rozróżnienia rozmówców).

2. Rozpoznawaj rolę wypowiadających się osób (sprzedawca/klient) na podstawie kontekstu.

3. Wykrywaj i oceniaj poziom zainteresowania klienta – sygnalizuj, gdy spada lub pojawia się opór.

4. Podpowiadaj sprzedawcy w czasie rzeczywistym, gdy rozmowa idzie w złym kierunku lub klient wykazuje brak zainteresowania.

5. Wskazuj, jakie argumenty, fakty, case studies lub dane z branży mogą przekonać klienta (uwzględnij dostarczone informacje o kliencie i produkcie).

6. Sugestie mają być konkretne, praktyczne i nastawione na domknięcie transakcji (np. jak przełamać obiekcje, jak stworzyć poczucie pilności, jak spersonalizować ofertę pod branżę klienta).

7. Wyłapuj sygnały zakupowe i momenty decyzyjne – sugeruj najlepszy moment na call-to-action.

8. Podpowiadaj, jak wykorzystać zainteresowania i potrzeby klienta, łącząc je z ofertą.

9. Reaguj na typowe obiekcje (np. cena, brak czasu, lojalność wobec innego dostawcy) gotowymi, skutecznymi ripostami.

10. Wskazuj błędy sprzedawcy w podejściu, argumentacji lub dynamice rozmowy.

⚠️ WAŻNE ZASADY:

- Unikaj ogólników typu "słuchaj aktywnie", "zadawaj pytania".
- Nie powtarzaj tych samych sugestii.
- Nie analizuj niepełnych wypowiedzi – poczekaj, aż padnie pełna myśl.
- Podawaj maksymalnie 3 najważniejsze sugestie na danym etapie rozmowy.
- Skupiaj się na jakości, nie ilości podpowiedzi.
- W przypadku niejasności w transkrypcji – korzystaj z kontekstu, domyślaj się ról i intencji na podstawie słów kluczowych i struktury wypowiedzi.
- Uwzględniaj dostarczone informacje o kliencie (branża, wyzwania, potrzeby) i produkcie (cechy, przewagi, case studies).

🎯 TWÓJ CEL: Nauczyć sprzedawcę skutecznych technik sprzedażowych i przekazać mu realną wartość po każdej rozmowie.

📝 FORMAT JSON (ZAWSZE po polsku):
{
  "analiza_mowcy": "sprzedawca|klient|nieznany",
  "intencja": "konkretna intencja tej wypowiedzi",
  "emocje": "pozytywne|negatywne|neutralne|mieszane",
  "sugestie": ["max 3 konkretne, działalne sugestie nastawione na domknięcie sprzedaży"],
  "sygnaly": ["tylko wyraźne sygnały kupna/oporu/zainteresowania"],
  "dynamika_rozmowy": "jak ta wypowiedź zmienia dynamikę sprzedaży",
  "nastepny_krok": "jedna konkretna rekomendacja dla sprzedawcy"
}`;
}

// Create Enhanced GPT Context for Method 2 with Speaker Diarization
function createGPTContextMethod2(client, product, notes) {
    return `Jesteś EKSPERTEM SPRZEDAŻY i REAL-TIME SALES COACHEM.

Twoje zadanie to aktywne wsparcie sprzedawcy podczas rozmowy z klientem (lub grupą klientów), nawet jeśli transkrypcja jest nieidealna, a role rozmówców nie są jasno oznaczone. Twoim celem jest skuteczne domknięcie sprzedaży, maksymalizacja zaangażowania klienta i przekucie rozmowy w sukces biznesowy.

📊 INFORMACJE O KLIENCIE:
KLIENT: ${client.name}
${client.description ? `Opis: ${client.description}` : ''}
${client.comment ? `Notatki: ${client.comment}` : ''}

📦 INFORMACJE O PRODUKCIE:
PRODUKT: ${product.name}
${product.description ? `Opis: ${product.description}` : ''}
${product.comment ? `Notatki: ${product.comment}` : ''}

${notes ? `📝 NOTATKI SESJI: ${notes}` : ''}

🎯 ZASADY DZIAŁANIA:

1. Nasłuchuj rozmowy na bieżąco (również w formie ciągłego tekstu, bez wyraźnego rozróżnienia rozmówców).

2. Rozpoznawaj rolę wypowiadających się osób (sprzedawca/klient) na podstawie kontekstu.

3. Wykrywaj i oceniaj poziom zainteresowania klienta – sygnalizuj, gdy spada lub pojawia się opór.

4. Podpowiadaj sprzedawcy w czasie rzeczywistym, gdy rozmowa idzie w złym kierunku lub klient wykazuje brak zainteresowania.

5. Wskazuj, jakie argumenty, fakty, case studies lub dane z branży mogą przekonać klienta (uwzględnij dostarczone informacje o kliencie i produkcie).

6. Sugestie mają być konkretne, praktyczne i nastawione na domknięcie transakcji (np. jak przełamać obiekcje, jak stworzyć poczucie pilności, jak spersonalizować ofertę pod branżę klienta).

7. Wyłapuj sygnały zakupowe i momenty decyzyjne – sugeruj najlepszy moment na call-to-action.

8. Podpowiadaj, jak wykorzystać zainteresowania i potrzeby klienta, łącząc je z ofertą.

9. Reaguj na typowe obiekcje (np. cena, brak czasu, lojalność wobec innego dostawcy) gotowymi, skutecznymi ripostami.

10. Wskazuj błędy sprzedawcy w podejściu, argumentacji lub dynamice rozmowy.

⚠️ WAŻNE ZASADY:

- Unikaj ogólników typu "słuchaj aktywnie", "zadawaj pytania".
- Nie powtarzaj tych samych sugestii.
- Nie analizuj niepełnych wypowiedzi – poczekaj, aż padnie pełna myśl.
- Podawaj maksymalnie 3 najważniejsze sugestie na danym etapie rozmowy.
- Skupiaj się na jakości, nie ilości podpowiedzi.
- W przypadku niejasności w transkrypcji – korzystaj z kontekstu, domyślaj się ról i intencji na podstawie słów kluczowych i struktury wypowiedzi.
- Uwzględniaj dostarczone informacje o kliencie (branża, wyzwania, potrzeby) i produkcie (cechy, przewagi, case studies).

🎯 TWÓJ CEL: Nauczyć sprzedawcę skutecznych technik sprzedażowych i przekazać mu realną wartość po każdej rozmowie.

📝 FORMAT JSON (ZAWSZE po polsku):
{
  "analiza_mowcy": "sprzedawca|klient|nieznany",
  "intencja": "konkretna intencja tej wypowiedzi",
  "emocje": "pozytywne|negatywne|neutralne|mieszane",
  "sugestie": ["max 3 konkretne, działalne sugestie nastawione na domknięcie sprzedaży"],
  "sygnaly": ["tylko wyraźne sygnały kupna/oporu/zainteresowania"],
  "dynamika_rozmowy": "jak ta wypowiedź zmienia dynamikę sprzedaży",
  "nastepny_krok": "jedna konkretna rekomendacja dla sprzedawcy"
}`;
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
        console.log(`--- DEBUG: chatGPTHistory length: ${session.chatGPTHistory?.length || 0} ---`);
        
        const transcription = session.conversationHistory.length > 0 
            ? session.conversationHistory.map(t => {
                if (session.method === 2 && t.speakerRole) {
                    const roleLabel = t.speakerRole === 'salesperson' ? '🔵SPRZEDAWCA' : 
                                    t.speakerRole === 'client' ? '🔴KLIENT' : 
                                    `🟡${t.speaker || 'NIEZNANY'}`;
                    return `[${roleLabel}] ${t.text}`;
                } else {
                    return `[${t.speaker}] ${t.text}`;
                }
            }).join('\n\n')
            : `Sesja Real-time AI Assistant${session.method === 2 ? ' Method 2 (Enhanced Diarization)' : ''} - brak transkrypcji (możliwy problem z mikrofonem lub AssemblyAI)`;
        
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
        
        // Przygotuj historię ChatGPT do zapisania
        console.log('--- DEBUG: chatGPTHistory type:', typeof session.chatGPTHistory);
        console.log('--- DEBUG: chatGPTHistory length:', session.chatGPTHistory?.length || 0);
        console.log('--- DEBUG: chatGPTHistory sample:', session.chatGPTHistory?.slice(0, 2));
        
        let chatGPTHistoryJSON = null;
        if (session.chatGPTHistory && session.chatGPTHistory.length > 0) {
            try {
                chatGPTHistoryJSON = JSON.stringify(session.chatGPTHistory);
                console.log('--- DEBUG: JSON.stringify successful, length:', chatGPTHistoryJSON.length);
            } catch (error) {
                console.error('--- DEBUG: JSON.stringify failed:', error);
                chatGPTHistoryJSON = null;
            }
        }
        
        // Generuj proste podsumowanie z istniejących danych (bez wywołania OpenAI)
        let finalSummary = null;
        if (session.conversationHistory.length > 0) {
            console.log('📝 Generowanie prostego podsumowania z danych sesji...');
            finalSummary = generateSimpleSummary(session, transcription);
        }
        
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
                positive_findings, negative_findings, recommendations, own_notes, ai_suggestions,
                chatgpt_history, final_summary
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
            aiSuggestionsText,
            chatGPTHistoryJSON,
            finalSummary
        ]);
        
        const savedId = result.rows[0].id;
        console.log('💾 Real-time session saved successfully to database:', {
            id: savedId,
            hasTranscription: session.conversationHistory.length > 0,
            hasAISuggestions: session.aiSuggestions.length > 0,
            hasChatGPTHistory: !!chatGPTHistoryJSON,
            hasFinalSummary: !!finalSummary
        });
        
    } catch (error) {
        console.error('❌ Error saving real-time session:', error);
        // Nie rzucaj błędu - pozwól sesji się zakończyć
    }
}

// Generate simple summary without OpenAI API call
function generateSimpleSummary(session, transcription) {
    const startTime = Date.now();
    console.log(`[${session.sessionId}] 📝 Generating simple session summary...`);
    
    try {
        const duration = Math.round((Date.now() - session.startTime.getTime()) / 1000 / 60);
        const wordCount = transcription.split(' ').length;
        const aiSuggestionsCount = session.aiSuggestions.length;
        
        // Analyze conversation for basic insights
        const hasPositiveSignals = transcription.toLowerCase().includes('tak') || 
                                   transcription.toLowerCase().includes('dobrze') ||
                                   transcription.toLowerCase().includes('zainteresow');
        
        const hasQuestions = transcription.includes('?') || 
                           transcription.toLowerCase().includes('pytanie') ||
                           transcription.toLowerCase().includes('jak');
        
        const summary = `## 📊 PODSUMOWANIE SESJI

**Podstawowe informacje:**
- Klient: ${session.client.name}
- Produkt: ${session.product.name}
- Data: ${session.startTime.toLocaleString('pl-PL')}
- Czas trwania: ${duration} minut
- Liczba słów w transkrypcji: ${wordCount}
- Liczba sugestii AI: ${aiSuggestionsCount}

## 🎯 ANALIZA ROZMOWY

**Poziom zaangażowania:** ${hasQuestions ? 'Wysoki - klient zadawał pytania' : 'Średni - podstawowa rozmowa'}

**Sygnały pozytywne:** ${hasPositiveSignals ? 'Wykryto pozytywne reakcje klienta' : 'Brak wyraźnych sygnałów pozytywnych'}

**Aktywność AI:** ${aiSuggestionsCount > 5 ? 'Wysoka - wiele sugestii podczas rozmowy' : 'Umiarkowana - podstawowe wsparcie AI'}

## 📋 NASTĘPNE KROKI

${aiSuggestionsCount > 0 ? 
'- Przejrzyj sugestie AI z zakładki "Sugestie AI z sesji"' : 
'- Rozmowa była krótka - rozważ kolejne spotkanie'}
- Skontaktuj się z klientem w ciągu 24-48 godzin
- Przygotuj materiały na podstawie poruszonych tematów
- ${hasQuestions ? 'Odpowiedz na zadane pytania' : 'Przedstaw dodatkowe korzyści produktu'}

## 💡 REKOMENDACJE

- Wykorzystaj zebrane informacje do personalizacji oferty
- ${duration > 10 ? 'Długa rozmowa - dobry znak zaangażowania' : 'Krótka rozmowa - możliwość rozszerzenia w przyszłości'}
- Monitoruj rozwój relacji z klientem

---
*Podsumowanie wygenerowane automatycznie na podstawie danych sesji*`;

        const responseTime = Date.now() - startTime;
        console.log(`[${session.sessionId}] 📝 Simple summary generated in ${responseTime}ms`);
        
        return summary;
        
    } catch (error) {
        console.error(`[${session.sessionId}] ❌ Error generating simple summary:`, error);
        return `Błąd podczas generowania podsumowania: ${error.message}`;
    }
}

// Generate final summary of the conversation
async function generateFinalSummary(session, transcription) {
    const startTime = Date.now();
    console.log(`[${session.sessionId}] 🎯 Generating final conversation summary...`);
    
    try {
        const summaryPrompt = `Analizuj poniższą rozmowę sprzedażową i przygotuj szczegółowe podsumowanie.

INFORMACJE O SPOTKANIU:
- Klient: ${session.client.name}
- Produkt: ${session.product.name}
- Data: ${session.startTime.toLocaleString('pl-PL')}
- Czas trwania: ${Math.round((Date.now() - session.startTime.getTime()) / 1000 / 60)} minut

TRANSKRYPCJA ROZMOWY:
${transcription}

PRZYGOTUJ SZCZEGÓŁOWE PODSUMOWANIE W NASTĘPUJĄCYM FORMACIE:

## 📊 OGÓLNA OCENA SPOTKANIA
- Ogólny przebieg rozmowy (1-5 gwiazdek)
- Główny cel spotkania i czy został osiągnięty
- Poziom zaangażowania klienta

## ✅ CO POSZŁO DOBRZE
- Konkretne momenty, które były udane
- Dobre techniki sprzedażowe zastosowane przez sprzedawcę
- Pozytywne reakcje klienta

## ❌ CO MOŻNA POPRAWIĆ
- Błędy popełnione podczas rozmowy
- Niewykorzystane okazje
- Momenty, gdzie można było lepiej odpowiedzieć

## 🎯 KLUCZOWE WNIOSKI
- Główne potrzeby i obawy klienta
- Poziom zainteresowania produktem
- Prawdopodobieństwo zakupu (w %)

## 📋 NASTĘPNE KROKI
- Konkretne działania do podjęcia
- Terminy i zobowiązania
- Rekomendacje na przyszłość

Bądź szczegółowy, konkretny i konstruktywny w swojej analizie.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo", // Używamy lepszego modelu dla podsumowania
            messages: [
                { role: "system", content: "Jesteś ekspertem od analizy rozmów sprzedażowych. Twoje podsumowania są szczegółowe, konstruktywne i pomagają sprzedawcom się rozwijać." },
                { role: "user", content: summaryPrompt }
            ],
            max_tokens: 1500, // Więcej tokenów na szczegółowe podsumowanie
            temperature: 0.3 // Niższa temperatura dla bardziej precyzyjnej analizy
        });

        const responseTime = Date.now() - startTime;
        const summary = completion.choices[0].message.content;
        
        console.log(`[${session.sessionId}] 🎯 Final summary generated in ${responseTime}ms (${summary.length} characters)`);
        
        return summary;
        
    } catch (error) {
        console.error(`[${session.sessionId}] ❌ Error generating final summary:`, error);
        return `Błąd podczas generowania podsumowania: ${error.message}`;
    }
}

// Initialize ChatGPT Conversation History - bez wywołania API żeby uniknąć błędu 429
function initializeChatGPTConversation(session) {
    const startTime = Date.now();
    console.log(`[${session.sessionId}] 🤖 Initializing ChatGPT conversation with system prompt (no API call)...`);
    
    try {
        const systemPrompt = createGPTContextMethod2(session.client, session.product, session.notes);
        
        // Inicjalizujemy conversation history z system promptem (bez wywołania API)
        session.chatGPTHistory = [
            { role: "system", content: systemPrompt }
        ];
        
        const responseTime = Date.now() - startTime;
        console.log(`[${session.sessionId}] 🤖 ChatGPT initialized in ${responseTime}ms (system prompt only)`);
        console.log(`[${session.sessionId}] 🤖 ChatGPT history length: ${session.chatGPTHistory.length}`);
        
        // Wysyłamy potwierdzenie do frontend
        session.ws.send(JSON.stringify({
            type: 'CHATGPT_READY',
            sessionId: session.sessionId,
            message: "ChatGPT gotowy do analizy rozmowy",
            responseTime: responseTime,
            timestamp: new Date().toISOString()
        }));

    } catch (error) {
        console.error(`[${session.sessionId}] ❌ Error initializing ChatGPT conversation:`, error);
        
        // Fallback - przynajmniej system prompt
        const systemPrompt = createGPTContextMethod2(session.client, session.product, session.notes);
        session.chatGPTHistory = [
            { role: "system", content: systemPrompt }
        ];
        
        session.ws.send(JSON.stringify({
            type: 'CHATGPT_READY',
            sessionId: session.sessionId,
            message: "ChatGPT gotowy do analizy rozmowy (fallback mode)",
            error: error.message,
            timestamp: new Date().toISOString()
        }));
    }
}

// ===== NOWE FUNKCJE NAGRYWANIA =====

// Globalne zmienne dla nagrań
const activeRecordings = new Map(); // recordingId -> recording object

// Start Recording Session
async function startRecordingSession(ws, data) {
    const { clientId, productId, notes } = data;
    const recordingId = `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[${recordingId}] 🎥 Rozpoczynanie sesji nagrywania...`);
    
    try {
        // Sprawdź klienta i produkt w bazie
        const [clientResult, productResult] = await Promise.all([
            safeQuery('SELECT * FROM clients WHERE id = $1', [clientId]),
            safeQuery('SELECT * FROM products WHERE id = $1', [productId])
        ]);
        
        if (clientResult.rows.length === 0 || productResult.rows.length === 0) {
            console.error(`[${recordingId}] ❌ Nieprawidłowy ID klienta lub produktu`);
            ws.send(JSON.stringify({ 
                type: 'RECORDING_ERROR', 
                message: 'Nieprawidłowy ID klienta lub produktu' 
            }));
            return;
        }
        
        const client = clientResult.rows[0];
        const product = productResult.rows[0];
        
        // Utwórz nagranie w bazie danych - tabela recordings
        const insertResult = await safeQuery(`
            INSERT INTO recordings (
                id, client_id, product_id, notes, transcript, 
                duration, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, '', 0, 'recording', NOW(), NOW()
            ) RETURNING *
        `, [recordingId, clientId, productId, notes || '']);
        
        if (insertResult.rows.length === 0) {
            throw new Error('Nie udało się utworzyć nagrania w bazie danych');
        }
        
        const recording = insertResult.rows[0];
        
        // Zapisz w aktywnych nagraniach
        const recordingSession = {
            id: recordingId,
            ws: ws,
            clientId: clientId,
            productId: productId,
            client: client,
            product: product,
            notes: notes,
            transcript: '',
            startTime: new Date(),
            status: 'recording'
        };
        
        activeRecordings.set(recordingId, recordingSession);
        
        console.log(`[${recordingId}] ✅ Nagranie utworzone w bazie i pamięci`);
        
        // Wyślij potwierdzenie do frontendu
        ws.send(JSON.stringify({
            type: 'RECORDING_STARTED',
            recordingId: recordingId,
            clientId: clientId,
            productId: productId,
            message: 'Nagranie rozpoczęte pomyślnie'
        }));
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ Błąd podczas rozpoczynania nagrania:`, error);
        ws.send(JSON.stringify({
            type: 'RECORDING_ERROR',
            message: 'Błąd rozpoczęcia nagrania: ' + error.message
        }));
    }
}

// Process Recording Transcript
async function processRecordingTranscript(ws, data) {
    const { recordingId, transcript, isFinal } = data;
    
    if (!recordingId || !transcript) {
        console.error('❌ Brak recordingId lub transcript w processRecordingTranscript');
        return;
    }
    
    console.log(`[${recordingId}] 🎥📝 Przetwarzanie transkrypcji: ${transcript.substring(0, 50)}...`);
    
    try {
        const recording = activeRecordings.get(recordingId);
        if (!recording) {
            console.error(`[${recordingId}] ❌ Nie znaleziono aktywnego nagrania`);
            return;
        }
        
        // Dodaj transkrypcję do sesji
        recording.transcript += transcript + ' ';
        
        // Aktualizuj nagranie w bazie danych jeśli to finalna transkrypcja
        if (isFinal) {
            const duration = Math.floor((Date.now() - recording.startTime.getTime()) / 1000);
            
            await safeQuery(`
                UPDATE recordings 
                SET transcript = $1, duration = $2, updated_at = NOW()
                WHERE id = $3
            `, [recording.transcript, duration, recordingId]);
            
            console.log(`[${recordingId}] 💾 Zapisano transkrypcję do bazy danych`);
        }
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ Błąd podczas przetwarzania transkrypcji:`, error);
    }
}

// Stop Recording Session
async function stopRecordingSession(ws, data) {
    const { recordingId, finalTranscript } = data;
    
    console.log(`[${recordingId}] 🎥🛑 Zatrzymywanie nagrania...`);
    
    try {
        const recording = activeRecordings.get(recordingId);
        if (!recording) {
            console.error(`[${recordingId}] ❌ Nie znaleziono aktywnego nagrania`);
            return;
        }
        
        // Dodaj finalną transkrypcję jeśli została przekazana
        if (finalTranscript) {
            recording.transcript = finalTranscript;
        }
        
        // Oblicz czas trwania
        const duration = Math.floor((Date.now() - recording.startTime.getTime()) / 1000);
        
        // Zaktualizuj status w bazie danych
        await safeQuery(`
            UPDATE recordings 
            SET transcript = $1, duration = $2, status = 'completed', updated_at = NOW()
            WHERE id = $3
        `, [recording.transcript, duration, recordingId]);
        
        // Usuń z aktywnych nagrań
        activeRecordings.delete(recordingId);
        
        console.log(`[${recordingId}] ✅ Nagranie zakończone i zapisane`);
        
        // Wyślij potwierdzenie do frontendu
        ws.send(JSON.stringify({
            type: 'RECORDING_STOPPED',
            recordingId: recordingId,
            message: 'Nagranie zakończone pomyślnie',
            duration: duration,
            transcriptLength: recording.transcript.length
        }));
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ Błąd podczas zatrzymywania nagrania:`, error);
        ws.send(JSON.stringify({
            type: 'RECORDING_ERROR',
            message: 'Błąd zatrzymania nagrania: ' + error.message
        }));
    }
}

// Process Recording Transcript Method 2 (with Speaker Diarization)
async function processRecordingTranscriptMethod2(ws, data) {
    const { recordingId, transcript, isFinal } = data;
    
    if (!recordingId || !transcript) {
        console.error('❌ Brak recordingId lub transcript w processRecordingTranscriptMethod2');
        return;
    }
    
    console.log(`[${recordingId}] 🎥🔬📝 Przetwarzanie transkrypcji Method 2: ${transcript.text.substring(0, 50)}...`);
    console.log(`[${recordingId}] 🎥🔬📝 Speaker info:`, {
        speaker: transcript.speaker,
        speakerRole: transcript.speakerRole,
        language: transcript.language,
        confidence: transcript.confidence
    });
    
    try {
        const recording = activeRecordings.get(recordingId);
        if (!recording) {
            console.error(`[${recordingId}] ❌ Nie znaleziono aktywnego nagrania`);
            return;
        }
        
        // Initialize transcriptWithSpeakers if not exists
        if (!recording.transcriptWithSpeakers) {
            recording.transcriptWithSpeakers = [];
        }
        
        // Add transcript entry with speaker info
        const transcriptEntry = {
            speaker: transcript.speaker,
            speakerRole: transcript.speakerRole,
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence,
            language: transcript.language
        };
        
        recording.transcriptWithSpeakers.push(transcriptEntry);
        
        // Update plain transcript for backward compatibility
        recording.transcript += `[${transcript.speakerRole}] ${transcript.text} `;
        
        // Aktualizuj nagranie w bazie danych jeśli to finalna transkrypcja
        if (isFinal) {
            const duration = Math.floor((Date.now() - recording.startTime.getTime()) / 1000);
            
            await safeQuery(`
                UPDATE recordings 
                SET transcript = $1, duration = $2, updated_at = NOW()
                WHERE id = $3
            `, [recording.transcript, duration, recordingId]);
            
            console.log(`[${recordingId}] 💾 Zapisano transkrypcję Method 2 do bazy danych`);
        }
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ Błąd podczas przetwarzania transkrypcji Method 2:`, error);
    }
}

// Process Recording Partial Transcript Method 2 (for live updates)
async function processRecordingPartialMethod2(ws, data) {
    const { recordingId, transcript, isPartial } = data;
    
    if (!recordingId || !transcript || !isPartial) {
        console.error('❌ Brak recordingId, transcript lub isPartial w processRecordingPartialMethod2');
        return;
    }
    
    console.log(`[${recordingId}] 🎥🔬⚡📝 Przetwarzanie częściowej transkrypcji Method 2: ${transcript.text.substring(0, 30)}...`);
    console.log(`[${recordingId}] 🎥🔬⚡📝 Partial info:`, {
        speaker: transcript.speaker,
        speakerRole: transcript.speakerRole,
        wordsCount: transcript.wordsCount,
        language: transcript.language,
        confidence: transcript.confidence
    });
    
    try {
        const recording = activeRecordings.get(recordingId);
        if (!recording) {
            console.error(`[${recordingId}] ❌ Nie znaleziono aktywnego nagrania`);
            return;
        }
        
        // Store partial transcript for potential live processing
        recording.currentPartialTranscript = {
            speaker: transcript.speaker,
            speakerRole: transcript.speakerRole,
            text: transcript.text,
            timestamp: new Date().toISOString(),
            confidence: transcript.confidence,
            language: transcript.language,
            wordsCount: transcript.wordsCount
        };
        
        console.log(`[${recordingId}] 💾 Zapisano częściową transkrypcję Method 2 w pamięci`);
        
    } catch (error) {
        console.error(`[${recordingId}] ❌ Błąd podczas przetwarzania częściowej transkrypcji Method 2:`, error);
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