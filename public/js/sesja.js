// 🚀 REAL-TIME AI ASSISTANT - AssemblyAI + ChatGPT Integration
// Nowa wersja z prawdziwym real-time processing + Web Speech API dla języka polskiego

console.log('🚀 START - Real-time AI Assistant v3.0 - Multi-language');

// Global variables
let clients = [];
let products = [];
let currentSession = null;
let websocket = null;
let mediaRecorder = null;
let audioStream = null;
let sessionTimer = null;
let sessionStartTime = null;
let isRecording = false;
let realtimeTranscript = '';
let aiSuggestions = [];

// NOWE: Language selection variables
let selectedLanguage = 'pl'; // Default: Polish
let webSpeechRecognition = null;
let useWebSpeech = true; // Default: use Web Speech API for Polish

// DOM Elements - będą wyszukiwane dynamicznie bo AJAX może je zmieniać

// Initialize when DOM is ready
console.log('🎯 Sesja.js loaded, DOM state:', document.readyState);

// Dodaj małe opóźnienie dla stabilności przy ładowaniu sekcji przez AJAX
setTimeout(() => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRealtimeAssistant);
    } else {
        initRealtimeAssistant();
    }
}, 150); // Zwiększone opóźnienie dla sekcji AJAX

// Initialize Real-time AI Assistant
async function initRealtimeAssistant() {
    console.log('🎬 Initializing Real-time AI Assistant...');
    
    try {
        // Sprawdź czy DOM jest gotowy
        await waitForDOMElements();
        
        // NOWE: Initialize Web Speech API
        initWebSpeechAPI();
        
        // Ładuj dane w odpowiedniej kolejności
        await loadClients();
        await loadProducts();
        await loadRecentSessions();
        setupEventListeners();
        setupWebSocket();
        
        console.log('✅ Real-time AI Assistant initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize AI Assistant:', error);
        showToast('Błąd inicjalizacji asystenta AI', 'error');
    }
}

// Wait for DOM elements to be available
function waitForDOMElements() {
    return new Promise((resolve) => {
        const checkElements = () => {
            const sessionClientSelect = document.getElementById('sessionClient');
            const sessionProductSelect = document.getElementById('sessionProduct'); // POPRAWKA: sessionProduct zamiast sessionProductSelect
            const startSessionBtn = document.getElementById('startSessionBtn');
            
            if (sessionClientSelect && sessionProductSelect && startSessionBtn) {
                console.log('✅ DOM elements ready');
                resolve();
            } else {
                console.log('⏳ Waiting for DOM elements...', {
                    client: !!sessionClientSelect,
                    product: !!sessionProductSelect, 
                    button: !!startSessionBtn
                });
                setTimeout(checkElements, 50);
            }
        };
        
        checkElements();
    });
}

// Setup WebSocket Connection
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('🔌 Attempting WebSocket connection:', {
        url: wsUrl,
        protocol: protocol,
        host: window.location.host,
        location: window.location.href
    });
    
    try {
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = (event) => {
            console.log('✅ WebSocket connected successfully', {
                readyState: websocket.readyState,
                url: websocket.url,
                extensions: websocket.extensions,
                protocol: websocket.protocol
            });
        };
        
        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('❌ WebSocket message error:', error);
            }
        };
        
        websocket.onclose = (event) => {
            console.log('🔌 WebSocket connection closed', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                readyState: websocket ? websocket.readyState : 'null'
            });
            
            // Retry connection after 3 seconds
            setTimeout(() => {
                console.log('🔄 Retrying WebSocket connection...');
                setupWebSocket();
            }, 3000);
        };
        
        websocket.onerror = (error) => {
            console.error('❌ WebSocket error occurred:', {
                error: error,
                readyState: websocket ? websocket.readyState : 'null',
                url: websocket ? websocket.url : 'null'
            });
        };
        
    } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
    }
}

// Wait for WebSocket to be ready
function waitForWebSocketConnection() {
    return new Promise((resolve, reject) => {
        const maxRetries = 150; // 15 seconds max wait (increased)
        let retries = 0;
        
        const checkConnection = () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                console.log('✅ WebSocket is ready for communication');
                resolve();
            } else if (retries >= maxRetries) {
                console.error('❌ WebSocket connection timeout after 15 seconds');
                console.error('🔍 Final WebSocket state:', {
                    websocket: !!websocket,
                    readyState: websocket ? websocket.readyState : 'null',
                    url: websocket ? websocket.url : 'null'
                });
                reject(new Error('WebSocket connection timeout'));
            } else {
                retries++;
                if (retries % 10 === 0) { // Log every second
                    console.log(`⏳ Waiting for WebSocket connection... (${retries}/${maxRetries})`, {
                        websocket: !!websocket,
                        readyState: websocket ? websocket.readyState : 'null',
                        states: {
                            CONNECTING: WebSocket.CONNECTING,
                            OPEN: WebSocket.OPEN,
                            CLOSING: WebSocket.CLOSING,
                            CLOSED: WebSocket.CLOSED
                        }
                    });
                }
                setTimeout(checkConnection, 100);
            }
        };
        
        checkConnection();
    });
}

// Handle WebSocket Messages
function handleWebSocketMessage(data) {
    console.log('📨 Frontend WebSocket message received:', {
        type: data.type,
        hasData: !!data.data,
        sessionId: data.sessionId,
        message: data.message,
        fullData: data
    });
    
    switch (data.type) {
        case 'SESSION_STARTED':
            onSessionStarted(data);
            break;
        case 'PARTIAL_TRANSCRIPT':
            console.log('⏳ Frontend: Otrzymano partial transcript:', data.transcript);
            onPartialTranscript(data);
            break;
        case 'FINAL_TRANSCRIPT':
            console.log('📝 Frontend: Otrzymano final transcript:', data.transcript);
            onFinalTranscript(data);
            break;
        case 'AI_SUGGESTIONS':
            console.log('🤖 Frontend: Otrzymano AI suggestions:', data.suggestions);
            onAISuggestions(data);
            break;
        case 'SESSION_ENDED':
            onSessionEnded(data);
            break;
        case 'SESSION_ERROR':
            onSessionError(data);
            break;
        case 'ASSEMBLYAI_ERROR':
            console.error('❌ Frontend: AssemblyAI error:', data.error);
            showToast('Błąd AssemblyAI: ' + data.error, 'error');
            break;
        default:
            console.log('❓ Unknown WebSocket message type:', data.type, data);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // NOWE: Language selection handler
    const languageSelect = document.getElementById('sessionLanguage');
    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            selectedLanguage = e.target.value;
            useWebSpeech = (selectedLanguage === 'pl' && webSpeechRecognition);
            
            console.log('🌐 Language changed:', {
                selectedLanguage,
                useWebSpeech,
                hasWebSpeech: !!webSpeechRecognition
            });
            
            // Update Web Speech API language if needed
            if (webSpeechRecognition && selectedLanguage === 'pl') {
                webSpeechRecognition.lang = 'pl-PL';
            }
            
            showToast(`Język zmieniony na: ${selectedLanguage === 'pl' ? '🇵🇱 Polski' : '🇺🇸 Angielski'}`, 'info');
        });
        
        // Set default language
        languageSelect.value = selectedLanguage;
    }
    
    // Client select change handler
    const clientSelect = document.getElementById('sessionClient');
    if (clientSelect) {
        clientSelect.addEventListener('change', validateSessionForm);
    }
    
    // Product select change handler  
    const productSelect = document.getElementById('sessionProduct');
    if (productSelect) {
        productSelect.addEventListener('change', validateSessionForm);
    }
    
    // Start session button
    const startBtn = document.getElementById('startSessionBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startRealtimeSession);
    }
    
    console.log('✅ Event listeners set up successfully');
}

// Load Clients
async function loadClients() {
    try {
        console.log('📥 Ładowanie klientów...');
        const response = await fetchWithAuth('/api/clients');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania klientów');
        }
        
        clients = await response.json();
        console.log('✅ Załadowano klientów:', clients.length);
        populateClientSelect();
        
    } catch (error) {
        console.error('❌ Błąd ładowania klientów:', error);
        showToast('Błąd ładowania klientów', 'error');
    }
}

// Load Products
async function loadProducts() {
    try {
        console.log('📥 Ładowanie produktów...');
        const response = await fetchWithAuth('/api/products');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania produktów');
        }
        
        products = await response.json();
        console.log('✅ Załadowano produktów:', products.length);
        populateProductSelect();
        
    } catch (error) {
        console.error('❌ Błąd ładowania produktów:', error);
        showToast('Błąd ładowania produktów', 'error');
    }
}

// Populate Client Select
function populateClientSelect() {
    console.log('🏢 populateClientSelect - start, klienci:', clients.length);
    
    // Znajdź element na nowo (może się zmienić przy AJAX)
    const clientSelect = document.getElementById('sessionClient');
    console.log('🔍 Element sessionClientSelect:', !!clientSelect);
    
    if (!clientSelect) {
        console.error('❌ Element sessionClientSelect nie istnieje!');
        return;
    }
    
    clientSelect.innerHTML = '<option value="">-- Wybierz klienta --</option>';
    
    clients.forEach((client, index) => {
        console.log(`👤 Dodaję klienta ${index + 1}:`, client.name, `(ID: ${client.id})`);
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        clientSelect.appendChild(option);
    });
    
    console.log('✅ populateClientSelect - zakończone, opcje:', clientSelect.children.length);
}

// Populate Product Select
function populateProductSelect() {
    console.log('📦 populateProductSelect - start, produkty:', products.length);
    
    // Znajdź element na nowo (może się zmienić przy AJAX)
    const productSelect = document.getElementById('sessionProduct'); // POPRAWKA: sessionProduct
    console.log('🔍 Element sessionProduct:', !!productSelect);
    
    if (!productSelect) {
        console.error('❌ Element sessionProductSelect nie istnieje!');
        return;
    }
    
    productSelect.innerHTML = '<option value="">-- Wybierz produkt --</option>';
    
    products.forEach((product, index) => {
        console.log(`📦 Dodaję produkt ${index + 1}:`, product.name, `(ID: ${product.id})`);
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        productSelect.appendChild(option);
    });
    
    console.log('✅ populateProductSelect - zakończone, opcje:', productSelect.children.length);
}

// Validate Session Form
function validateSessionForm() {
    // Znajdź elementy na nowo
    const clientSelect = document.getElementById('sessionClient');
    const productSelect = document.getElementById('sessionProduct'); // POPRAWKA: sessionProduct
    const startBtn = document.getElementById('startSessionBtn');
    
    if (!clientSelect || !productSelect || !startBtn) {
        console.error('❌ Elementy formularza nie istnieją podczas walidacji');
        return;
    }
    
    const clientSelected = clientSelect.value !== '';
    const productSelected = productSelect.value !== '';
    
    startBtn.disabled = !(clientSelected && productSelected);
    
    console.log('🔍 Walidacja formularza:', {
        clientSelected,
        productSelected,
        buttonEnabled: !startBtn.disabled
    });
}

// Start Real-time AI Assistant Session
async function startRealtimeSession() {
    console.log('🚀 Starting real-time AI assistant session...');
    
    // Znajdź elementy na nowo
    const clientSelect = document.getElementById('sessionClient');
    const productSelect = document.getElementById('sessionProduct'); // POPRAWKA: sessionProduct
    const notesTextarea = document.getElementById('sessionNotes');
    
    if (!clientSelect || !productSelect) {
        showToast('Elementy formularza nie zostały znalezione', 'error');
        return;
    }
    
    const clientId = clientSelect.value;
    const productId = productSelect.value;
    const notes = notesTextarea ? notesTextarea.value : '';
    
    if (!clientId || !productId) {
        showToast('Proszę wybierz klienta i produkt', 'error');
        return;
    }
    
    try {
        console.log('🔍 Debug: Getting user info...');
        
        // Get user info from current session
        const userResponse = await fetchWithAuth('/api/user');
        if (!userResponse || !userResponse.ok) {
            throw new Error('Failed to get user info');
        }
        const user = await userResponse.json();
        
        console.log('🔍 Debug: User info received:', user.user.id);
        
        // Request microphone access
        console.log('🔍 Debug: Requesting microphone access...');
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        
        console.log('🎤 Microphone access granted');
        
        // Initialize session object (without sessionId - backend will create it)
        currentSession = {
            clientId,
            productId,
            notes,
            userId: user.user.id,
            startTime: new Date(),
            transcript: '',
            suggestions: []
        };
        
        console.log('🔍 Debug: Session object created:', currentSession);
        
        // Wait for WebSocket connection before sending message
        console.log('⏳ Waiting for WebSocket connection...');
        await waitForWebSocketConnection();
        
        console.log('🔍 Debug: WebSocket ready, sending START_REALTIME_SESSION...');
        
        // Send session start message to WebSocket (backend will generate sessionId)
        const startMessage = {
            type: 'START_REALTIME_SESSION',
            clientId,
            productId,
            notes,
            userId: user.user.id
        };
        
        console.log('📤 Sending START_REALTIME_SESSION:', startMessage);
        websocket.send(JSON.stringify(startMessage));
        
        console.log('✅ Session start request sent, waiting for response...');
        
    } catch (error) {
        console.error('❌ Error starting real-time session:', error);
        if (error.name === 'NotAllowedError') {
            showToast('Dostęp do mikrofonu został odrzucony. Włącz mikrofon w ustawieniach przeglądarki.', 'error');
        } else {
            showToast('Błąd rozpoczynania sesji: ' + error.message, 'error');
        }
    }
}

// Setup Audio Recording with Real-time Processing for AssemblyAI
function setupAudioRecording() {
    try {
        console.log('🎤 Setting up real-time audio recording for AssemblyAI...');
        console.log('🔍 Debug: audioStream:', !!audioStream, 'tracks:', audioStream ? audioStream.getTracks().length : 0);
        console.log('🔍 Debug: isRecording before:', isRecording);
        console.log('🔍 Debug: websocket:', !!websocket, 'readyState:', websocket ? websocket.readyState : 'null');
        
        // Create AudioContext for PCM audio processing
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000 // AssemblyAI requires 16kHz
        });
        
        console.log('🔍 Debug: AudioContext created:', {
            state: audioContext.state,
            sampleRate: audioContext.sampleRate,
            currentTime: audioContext.currentTime
        });
        
        // Resume AudioContext if suspended (required by some browsers)
        if (audioContext.state === 'suspended') {
            console.log('🔄 AudioContext suspended, resuming...');
            audioContext.resume();
        }
        
        // Create audio source from stream
        const source = audioContext.createMediaStreamSource(audioStream);
        console.log('🔍 Debug: MediaStreamSource created');
        
        // Create ScriptProcessor for real-time audio processing
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        console.log('🔍 Debug: ScriptProcessor created');
        
        let audioChunkCount = 0;
        let debugLogCount = 0;
        
        processor.onaudioprocess = (event) => {
            debugLogCount++;
            
            // Debug: log first few calls to see if processor is working
            if (debugLogCount <= 5) {
                console.log(`🔍 Debug: onaudioprocess call #${debugLogCount}:`, {
                    isRecording: isRecording,
                    websocket: !!websocket,
                    websocketState: websocket ? websocket.readyState : 'null',
                    inputBuffer: !!event.inputBuffer,
                    bufferLength: event.inputBuffer ? event.inputBuffer.length : 0,
                    hasSessionId: !!currentSession?.sessionId
                });
            }
            
            if (!isRecording || !websocket || websocket.readyState !== WebSocket.OPEN) {
                if (debugLogCount <= 10) {
                    console.log('⚠️ Debug: Skipping audio processing:', {
                        isRecording: isRecording,
                        hasWebsocket: !!websocket,
                        websocketState: websocket ? websocket.readyState : 'null'
                    });
                }
                return;
            }
            
            // CRITICAL: Don't send audio without sessionId
            if (!currentSession?.sessionId) {
                if (debugLogCount <= 10) {
                    console.log('⚠️ Debug: Skipping audio - no sessionId yet:', {
                        hasCurrentSession: !!currentSession,
                        sessionId: currentSession?.sessionId
                    });
                }
                return;
            }
            
            // Get PCM audio data
            const inputData = event.inputBuffer.getChannelData(0);
            
            // Check if we have actual audio data
            let hasAudio = false;
            for (let i = 0; i < inputData.length; i++) {
                if (Math.abs(inputData[i]) > 0.001) { // Check for non-silence
                    hasAudio = true;
                    break;
                }
            }
            
            // Convert float32 to int16 (required by AssemblyAI)
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            
            // Convert to base64
            const buffer = new ArrayBuffer(pcmData.length * 2);
            const view = new DataView(buffer);
            for (let i = 0; i < pcmData.length; i++) {
                view.setInt16(i * 2, pcmData[i], true); // little-endian
            }
            
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            
            // Debug: log every 50th chunk to see more activity
            audioChunkCount++;
            if (audioChunkCount % 50 === 0) {
                console.log('🎵 Frontend: Wysyłam audio chunk', audioChunkCount, {
                    audioDataLength: base64Audio.length,
                    inputDataLength: inputData.length,
                    pcmDataLength: pcmData.length,
                    websocketState: websocket.readyState,
                    sessionId: currentSession.sessionId,
                    hasAudio: hasAudio,
                    audioLevel: Math.max(...inputData.map(Math.abs)).toFixed(4)
                });
            }
            
            // Send to WebSocket
            websocket.send(JSON.stringify({
                type: 'AUDIO_CHUNK',
                sessionId: currentSession.sessionId,
                audioData: base64Audio
            }));
        };
        
        // Connect audio processing chain
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        console.log('🔍 Debug: Audio chain connected');
        
        // Store references for cleanup
        currentSession.audioContext = audioContext;
        currentSession.audioProcessor = processor;
        currentSession.audioSource = source;
        
        isRecording = true;
        console.log('🔍 Debug: isRecording set to:', isRecording);
        
        console.log('✅ Real-time audio recording started with PCM processing');
        
        // Additional debug after setup
        setTimeout(() => {
            console.log('🔍 Debug: Audio setup status after 2s:', {
                isRecording: isRecording,
                audioContext: {
                    state: audioContext.state,
                    currentTime: audioContext.currentTime
                },
                processor: !!processor,
                source: !!source,
                audioChunkCount: audioChunkCount
            });
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error setting up audio recording:', error);
        showToast('Błąd konfiguracji nagrywania audio: ' + error.message, 'error');
    }
}

// Session Started Handler
function onSessionStarted(data) {
    console.log('✅ Real-time session started:', data.sessionId);
    
    // Update current session with the sessionId from backend
    if (currentSession) {
        currentSession.sessionId = data.sessionId;
        console.log('🔍 Debug: Session ID set to:', currentSession.sessionId);
    } else {
        console.error('❌ currentSession is null when session started!');
        return;
    }
    
    // NOWE: Choose audio recording method based on language
    if (useWebSpeech && selectedLanguage === 'pl' && webSpeechRecognition) {
        console.log('🇵🇱 Using Web Speech API for Polish language...');
        startWebSpeechRecording();
    } else {
        console.log('🇺🇸 Using AssemblyAI for English language...');
        setupAudioRecording();
    }
    
    // Show real-time interface
    showRealtimeInterface();
    
    // Start session timer
    startSessionTimer();
    
    const languageFlag = selectedLanguage === 'pl' ? '🇵🇱' : '🇺🇸';
    showToast(`🤖 ${languageFlag} Asystent AI rozpoczął nasłuchiwanie!`, 'success');
}

// NOWE: Start Web Speech API recording for Polish
function startWebSpeechRecording() {
    if (!webSpeechRecognition) {
        console.error('❌ Web Speech API not available');
        return;
    }
    
    try {
        isRecording = true;
        webSpeechRecognition.start();
        console.log('🎤🇵🇱 Web Speech API recording started for Polish');
    } catch (error) {
        console.error('❌ Error starting Web Speech API:', error);
        showToast('Błąd uruchamiania rozpoznawania mowy: ' + error.message, 'error');
    }
}

// Show Real-time Interface
function showRealtimeInterface() {
    console.log('🎬 Showing real-time interface...');
    
    // Hide setup form and recent sessions
    const setupCard = document.querySelector('.setup-card');
    const recentSessions = document.querySelector('.recent-sessions');
    
    if (setupCard) {
        setupCard.style.display = 'none';
    }
    if (recentSessions) {
        recentSessions.style.display = 'none';
    }
    
    // Create and show the real-time interface
    const container = document.querySelector('.session-content');
    const realtimeInterface = createRealtimeInterface();
    
    container.appendChild(realtimeInterface);
}

// Create Real-time Interface
function createRealtimeInterface() {
    const interface = document.createElement('div');
    interface.className = 'realtime-interface-new';
    interface.id = 'realtimeInterface';
    
    const selectedClient = clients.find(c => c.id == currentSession.clientId);
    const selectedProduct = products.find(p => p.id == currentSession.productId);
    
    interface.innerHTML = `
        <!-- Kompaktowy nagłówek sesji -->
        <div class="session-header-new">
            <div class="session-title-new">
                <div class="live-dot"></div>
                <span>Sesja na żywo: ${selectedClient ? selectedClient.name : 'Unknown'} - ${selectedProduct ? selectedProduct.name : 'Unknown'}</span>
            </div>
            <div class="session-controls-new">
                <div class="session-timer-new" id="sessionTimer">00:00:00</div>
                <button id="pauseBtn" class="btn-stop-new">
                    <i class="fas fa-pause"></i>
                    Zatrzymaj
                </button>
                <button id="stopBtn" class="btn-end-new">
                    <i class="fas fa-stop"></i>
                    Zakończ
                </button>
            </div>
        </div>
        
        <!-- Główna zawartość - pełnoekranowy pionowy layout -->
        <div class="session-main-content-vertical">
            <!-- Górny panel - Sugestie AI (pełna szerokość, główne miejsce) -->
            <div class="session-ai-panel-full">
                <h4>
                    <i class="fas fa-robot"></i>
                    Sugestie AI
                </h4>
                <div class="session-suggestions-content-full" id="suggestionsContent">
                    <div class="suggestion-placeholder">
                        <i class="fas fa-brain"></i>
                        <span>Sugestie pojawią się podczas rozmowy...</span>
                        <small>Asystent AI analizuje rozmowę w czasie rzeczywistym</small>
                    </div>
                </div>
            </div>
            
            <!-- Dolny panel - Transkrypcja (kompaktowa) -->
            <div class="session-transcript-panel-bottom">
                <h4>
                    <i class="fas fa-microphone"></i>
                    Transkrypcja na żywo
                </h4>
                <div class="session-transcript-content-bottom" id="transcriptContent">
                    <div class="transcript-placeholder">
                        <i class="fas fa-ear-listen"></i>
                        <span>Rozpocznij rozmowę - asystent AI nasłuchuje...</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- AI Status - floating -->
        <div class="ai-status-new" id="aiStatus">
            <div class="status-indicator-new">
                <div class="status-dot active"></div>
                <span>AI Assistant aktywny</span>
            </div>
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (pauseBtn) {
            pauseBtn.addEventListener('click', pauseSession);
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', stopRealtimeSession);
        }
    }, 100);
    
    return interface;
}

// Start Session Timer
function startSessionTimer() {
    sessionStartTime = Date.now();
    sessionTimer = setInterval(updateSessionTimer, 1000);
}

// Update Session Timer
function updateSessionTimer() {
    if (!sessionStartTime) return;
    
    const elapsed = Date.now() - sessionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const timeString = 
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    
    const timerElement = document.getElementById('sessionTimer');
    if (timerElement) {
        timerElement.textContent = timeString;
    }
}

// Partial Transcript Handler
function onPartialTranscript(data) {
    const transcriptContent = document.getElementById('transcriptContent');
    if (!transcriptContent) return;
    
    // Update live transcript with partial results
    const partialElement = transcriptContent.querySelector('.partial-transcript');
    
    if (partialElement) {
        partialElement.innerHTML = `
            <div class="transcript-line partial">
                <span class="speaker">[${data.transcript.speaker}]</span>
                <span class="text">${data.transcript.text}</span>
                <span class="partial-indicator">...</span>
            </div>
        `;
    } else {
        const newPartial = document.createElement('div');
        newPartial.className = 'partial-transcript';
        newPartial.innerHTML = `
            <div class="transcript-line partial">
                <span class="speaker">[${data.transcript.speaker}]</span>
                <span class="text">${data.transcript.text}</span>
                <span class="partial-indicator">...</span>
            </div>
        `;
        transcriptContent.appendChild(newPartial);
    }
    
    // Remove placeholder
    const placeholder = transcriptContent.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
}

// Final Transcript Handler
function onFinalTranscript(data) {
    const transcriptContent = document.getElementById('transcriptContent');
    if (!transcriptContent) return;
    
    // Remove partial transcript
    const partialElement = transcriptContent.querySelector('.partial-transcript');
    if (partialElement) {
        partialElement.remove();
    }
    
    // Add final transcript
    const finalElement = document.createElement('div');
    finalElement.className = 'transcript-entry-new';
    
    const timestamp = new Date().toLocaleTimeString('pl-PL');
    const sentiment = data.transcript.sentiment || 'neutral';
    const sentimentIcon = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😐' : '😌';
    
    finalElement.innerHTML = `
        <div class="transcript-line-new final">
            <div class="transcript-meta-new">
                <span class="timestamp-new">${timestamp}</span>
                <span class="speaker-new ${data.transcript.speaker}">[${data.transcript.speaker.toUpperCase()}]</span>
                <span class="sentiment-new" title="Sentiment: ${sentiment}">${sentimentIcon}</span>
            </div>
            <div class="transcript-text-new">
                ${data.transcript.text}
            </div>
        </div>
    `;
    
    transcriptContent.appendChild(finalElement);
    
    // Auto-scroll to bottom
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
    
    // Update session transcript
    if (currentSession) {
        currentSession.transcript += `[${data.transcript.speaker}] ${data.transcript.text}\n`;
    }
}

// AI Suggestions Handler
function onAISuggestions(data) {
    console.log('💡 AI Suggestions received:', data.suggestions);
    
    const suggestionsContent = document.getElementById('suggestionsContent');
    if (!suggestionsContent) return;
    
    // Remove placeholder
    const placeholder = suggestionsContent.querySelector('.suggestion-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Clear old suggestions
    suggestionsContent.innerHTML = '';
    
    // Add new suggestions with improved styling
    data.suggestions.forEach((suggestion, index) => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = `suggestion-item-new ${suggestion.type || 'general'}`;
        
        const typeIcon = {
            'speaker-analysis': 'fa-user-tie',
            'intent-analysis': 'fa-bullseye',
            'action-suggestion': 'fa-lightbulb',
            'signals': 'fa-chart-line',
            'general': 'fa-comment-dots'
        }[suggestion.type] || 'fa-comment-dots';
        
        const typeLabel = {
            'speaker-analysis': 'Analiza rozmówcy',
            'intent-analysis': 'Analiza intencji',
            'action-suggestion': 'Sugestia działania',
            'signals': 'Sygnały sprzedażowe',
            'general': 'Ogólna sugestia'
        }[suggestion.type] || 'Sugestia';
        
        suggestionElement.innerHTML = `
            <div class="suggestion-header-new">
                <i class="fas ${typeIcon}"></i>
                <span>${typeLabel}</span>
                <span class="suggestion-time">${new Date().toLocaleTimeString('pl-PL')}</span>
            </div>
            <div class="suggestion-content-new">
                ${suggestion.content}
            </div>
        `;
        
        suggestionsContent.appendChild(suggestionElement);
    });
    
    // Add updated animation
    suggestionsContent.classList.add('updated-new');
    setTimeout(() => {
        suggestionsContent.classList.remove('updated-new');
    }, 500);
    
    // Auto-scroll to bottom
    suggestionsContent.scrollTop = suggestionsContent.scrollHeight;
}

// Pause Session
function pauseSession() {
    if (!mediaRecorder || !isRecording) return;
    
    mediaRecorder.pause();
    isRecording = false;
    
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
    
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-play"></i> Wznów';
        pauseBtn.onclick = resumeSession;
    }
    
    showToast('Sesja wstrzymana', 'info');
}

// Resume Session
function resumeSession() {
    if (!mediaRecorder || isRecording) return;
    
    mediaRecorder.resume();
    isRecording = true;
    
    startSessionTimer();
    
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Wstrzymaj';
        pauseBtn.onclick = pauseSession;
    }
    
    showToast('Sesja wznowiona', 'info');
}

// Stop Real-time Session
async function stopRealtimeSession() {
    console.log('🛑 Stopping real-time session...');
    
    try {
        // Stop recording
        isRecording = false;
        
        // NOWE: Stop Web Speech API if using it
        if (useWebSpeech && webSpeechRecognition) {
            try {
                webSpeechRecognition.stop();
                console.log('🇵🇱 Web Speech API stopped');
            } catch (error) {
                console.error('❌ Error stopping Web Speech API:', error);
            }
        }
        
        // Clean up audio processing (for AssemblyAI)
        if (currentSession) {
            if (currentSession.audioProcessor) {
                currentSession.audioProcessor.disconnect();
                currentSession.audioProcessor = null;
            }
            
            if (currentSession.audioSource) {
                currentSession.audioSource.disconnect();
                currentSession.audioSource = null;
            }
            
            if (currentSession.audioContext) {
                await currentSession.audioContext.close();
                currentSession.audioContext = null;
            }
        }
        
        // Stop MediaRecorder if exists (fallback)
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        // Stop audio stream
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Stop timer
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }
        
        // Send end session message safely
        if (websocket && websocket.readyState === WebSocket.OPEN && currentSession) {
            websocket.send(JSON.stringify({
                type: 'END_REALTIME_SESSION',
                sessionId: currentSession.sessionId
            }));
        } else {
            console.warn('⚠️ WebSocket not ready to send end session message');
        }
        
        showToast('Sesja zakończona - zapisywanie...', 'info');
        
    } catch (error) {
        console.error('❌ Error stopping session:', error);
        showToast('Błąd kończenia sesji', 'error');
    }
}

// Session Ended Handler
function onSessionEnded(data) {
    console.log('✅ Session ended successfully');
    
    // Remove real-time interface
    const realtimeInterface = document.getElementById('realtimeInterface');
    if (realtimeInterface) {
        realtimeInterface.remove();
    }
    
    // Show setup form and recent sessions again
    const setupCard = document.querySelector('.setup-card');
    const recentSessions = document.querySelector('.recent-sessions');
    
    if (setupCard) {
        setupCard.style.display = 'block';
    }
    if (recentSessions) {
        recentSessions.style.display = 'block';
    }
    
    // Reset form
    const clientSelect = document.getElementById('sessionClient');
    const productSelect = document.getElementById('sessionProduct'); // POPRAWKA: sessionProduct
    const notesTextarea = document.getElementById('sessionNotes');
    
    if (clientSelect) clientSelect.value = '';
    if (productSelect) productSelect.value = '';
    if (notesTextarea) notesTextarea.value = '';
    
    // Reset variables
    currentSession = null;
    sessionStartTime = null;
    
    validateSessionForm();
    loadRecentSessions();
    
    showToast('Sesja została zapisana pomyślnie!', 'success');
}

// Session Error Handler
function onSessionError(data) {
    console.error('❌ Session error:', data.message);
    showToast('Błąd sesji: ' + data.message, 'error');
    
    // Reset state
    stopRealtimeSession();
}

// Load Recent Sessions
async function loadRecentSessions() {
    try {
        console.log('📅 Ładowanie ostatnich sesji...');
        const response = await fetchWithAuth('/api/sales');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania sesji');
        }
        
        const sessions = await response.json();
        console.log('✅ Załadowano sesji:', sessions.length);
        displayRecentSessions(sessions.slice(0, 5)); // Ostatnie 5 sesji
        
    } catch (error) {
        console.error('Błąd ładowania sesji:', error);
        // Nie blokujemy UI - pokaż pustą listę
        displayRecentSessions([]);
    }
}

// Display Recent Sessions
function displayRecentSessions(sessions) {
    // Znajdź element na nowo
    const sessionsList = document.getElementById('recentSessionsList');
    
    if (!sessionsList) {
        console.error('❌ Element recentSessionsList nie istnieje');
        return;
    }
    
    if (sessions.length === 0) {
        sessionsList.innerHTML = `
            <div class="no-sessions">
                <i class="fas fa-microphone-slash"></i>
                <p>Brak ostatnich sesji</p>
            </div>
        `;
        return;
    }
    
    sessionsList.innerHTML = sessions.map(session => `
        <div class="session-item">
            <div class="session-info">
                <h4>${session.client_name || 'Nieznany klient'}</h4>
                <p>${session.product_name || 'Nieznany produkt'}</p>
                <span class="session-date">${new Date(session.meeting_datetime).toLocaleDateString('pl-PL')}</span>
            </div>
            <div class="session-type">
                <i class="fas fa-robot"></i>
                <span>AI Session</span>
            </div>
        </div>
    `).join('');
}

// Fetch with Auth wrapper
async function fetchWithAuth(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        if (response.status === 401) {
            console.log('❌ API zwróciło 401 - sesja wygasła w sesja.js');
            window.location.href = '/login';
            return null;
        }
        
        if (response.ok && response.url.includes('/login')) {
            console.log('❌ Otrzymano przekierowanie do /login przez URL w sesja.js');
            window.location.href = '/login';
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('❌ Błąd fetchWithAuth w sesja.js:', error);
        throw error;
    }
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Show animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// NOWE: Initialize Web Speech API for Polish language
function initWebSpeechAPI() {
    console.log('🇵🇱 Initializing Web Speech API for Polish...');
    
    // Check if Web Speech API is supported
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('⚠️ Web Speech API not supported, falling back to AssemblyAI only');
        useWebSpeech = false;
        selectedLanguage = 'en';
        return;
    }
    
    try {
        // Create Speech Recognition instance
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        webSpeechRecognition = new SpeechRecognition();
        
        // Configure for Polish
        webSpeechRecognition.lang = 'pl-PL';
        webSpeechRecognition.continuous = true;
        webSpeechRecognition.interimResults = true;
        webSpeechRecognition.maxAlternatives = 1;
        
        console.log('✅ Web Speech API initialized for Polish language');
        
        // Setup event handlers
        setupWebSpeechHandlers();
        
    } catch (error) {
        console.error('❌ Error initializing Web Speech API:', error);
        useWebSpeech = false;
        selectedLanguage = 'en';
    }
}

// NOWE: Setup Web Speech API event handlers
function setupWebSpeechHandlers() {
    if (!webSpeechRecognition) return;
    
    webSpeechRecognition.onstart = () => {
        console.log('🎤 Web Speech API started listening...');
    };
    
    webSpeechRecognition.onresult = (event) => {
        console.log('📝 Web Speech API result:', event);
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence;
            const isFinal = result.isFinal;
            
            console.log(`🇵🇱 ${isFinal ? 'Final' : 'Partial'} transcript (PL):`, transcript);
            
            if (isFinal) {
                // Send final transcript via WebSocket
                if (websocket && websocket.readyState === WebSocket.OPEN && currentSession?.sessionId) {
                    websocket.send(JSON.stringify({
                        type: 'WEB_SPEECH_TRANSCRIPT',
                        sessionId: currentSession.sessionId,
                        transcript: {
                            text: transcript,
                            confidence: confidence || 0.9,
                            language: 'pl'
                        }
                    }));
                }
                
                // Update UI with final transcript
                onFinalTranscript({
                    transcript: {
                        text: transcript,
                        speaker: 'user',
                        confidence: confidence || 0.9
                    }
                });
            } else {
                // Update UI with partial transcript
                onPartialTranscript({
                    transcript: {
                        text: transcript,
                        speaker: 'user',
                        confidence: confidence || 0.9
                    }
                });
            }
        }
    };
    
    webSpeechRecognition.onerror = (event) => {
        console.error('❌ Web Speech API error:', event.error);
        showToast(`Błąd rozpoznawania mowy: ${event.error}`, 'error');
    };
    
    webSpeechRecognition.onend = () => {
        console.log('🔚 Web Speech API ended');
        if (isRecording && currentSession?.sessionId) {
            // Restart if still recording
            setTimeout(() => {
                if (isRecording) {
                    console.log('🔄 Restarting Web Speech API...');
                    webSpeechRecognition.start();
                }
            }, 100);
        }
    };
}

console.log('✅ Real-time AI Assistant loaded successfully'); 