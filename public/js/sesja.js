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

// NOWE: Recording session variables
let currentRecording = null;
let recordingTimer = null;
let recordingStartTime = null;
let recordingTranscript = '';
let recordingSaveInterval = null;

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
            const sessionProductSelect = document.getElementById('sessionProduct');
            const startSessionBtnMethod2 = document.getElementById('startSessionBtnMethod2');
            
            if (sessionClientSelect && sessionProductSelect && startSessionBtnMethod2) {
                console.log('✅ DOM elements ready');
                resolve();
            } else {
                console.log('⏳ Waiting for DOM elements...', {
                    client: !!sessionClientSelect,
                    product: !!sessionProductSelect, 
                    buttonMethod2: !!startSessionBtnMethod2
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
            if (data.speakerInfo) {
                console.log('🔬 Frontend: Method 2 speaker info:', data.speakerInfo);
            }
            onAISuggestions(data);
            break;
        case 'DEBUG_INFO':
            console.log('🔬 Frontend: Debug info received (debug panel removed):', data);
            // Debug panel removed - no updates needed
            break;
        case 'SESSION_ENDED':
            onSessionEnded(data);
            break;
        case 'SESSION_ERROR':
            onSessionError(data);
            break;
        case 'CHATGPT_READY':
            console.log('🤖 Frontend: ChatGPT ready:', data.message);
            onChatGPTReady(data);
            break;
        case 'ASSEMBLYAI_ERROR':
            console.error('❌ Frontend: AssemblyAI error:', data.error);
            showToast('Błąd AssemblyAI: ' + data.error, 'error');
            break;
        
        // NOWE: Recording WebSocket messages
        case 'RECORDING_STARTED':
            onRecordingStarted(data);
            break;
            
        case 'RECORDING_ERROR':
            onRecordingError(data);
            break;
            
        default:
            console.log('❓ Unknown WebSocket message type:', data.type, data);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Język jest teraz domyślnie ustawiony na polski (Method 2)
    
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
    
    // Method 1 został usunięty - używamy tylko Method 2
    
    // Start session button (Method 2 - with diarization)
    const startBtnMethod2 = document.getElementById('startSessionBtnMethod2');
    console.log('🔬 Method 2 button found:', !!startBtnMethod2);
    if (startBtnMethod2) {
        console.log('🔬 Adding Method 2 event listener...');
        startBtnMethod2.addEventListener('click', () => {
            console.log('🔬 Method 2 button clicked!');
            startRealtimeSessionMethod2();
        });
        console.log('🔬 Method 2 event listener added');
    } else {
        console.error('❌ Method 2 button not found!');
    }
    
    // NOWE: Start recording button
    const startRecordingBtn = document.getElementById('startRecordingBtn');
    console.log('🎥 Recording button found:', !!startRecordingBtn);
    if (startRecordingBtn) {
        console.log('🎥 Adding recording event listener...');
        startRecordingBtn.addEventListener('click', () => {
            console.log('🎥 Recording button clicked!');
            startRecordingSession();
        });
        
        // Walidacja jest teraz w głównej funkcji validateSessionForm()
        
        console.log('🎥 Recording event listener added');
    } else {
        console.error('❌ Recording button not found!');
    }
    
    // Stop recording button
    const stopRecordingBtn = document.getElementById('stopRecordingBtn');
    if (stopRecordingBtn) {
        stopRecordingBtn.addEventListener('click', () => {
            console.log('🛑 Stop recording button clicked!');
            stopRecordingSession();
        });
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
    const productSelect = document.getElementById('sessionProduct');
    const startBtnMethod2 = document.getElementById('startSessionBtnMethod2');
    const startRecordingBtn = document.getElementById('startRecordingBtn');
    
    if (!clientSelect || !productSelect) {
        console.error('❌ Elementy formularza nie istnieją podczas walidacji');
        return;
    }
    
    const clientSelected = clientSelect.value !== '';
    const productSelected = productSelect.value !== '';
    const formValid = clientSelected && productSelected;
    
    // Aktualizuj oba przyciski
    if (startBtnMethod2) {
        startBtnMethod2.disabled = !formValid;
    }
    
    if (startRecordingBtn) {
        startRecordingBtn.disabled = !formValid;
    }
    
    console.log('🔍 Walidacja formularza:', {
        clientSelected,
        productSelected,
        liveButtonEnabled: startBtnMethod2 ? !startBtnMethod2.disabled : 'brak przycisku',
        recordingButtonEnabled: startRecordingBtn ? !startRecordingBtn.disabled : 'brak przycisku'
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
            suggestions: [],
            method: 1 // Mark as Method 1
        };
        
        console.log('🔍 Debug: Session object created (Method 1):', currentSession);
        
        // Show real-time interface for Method 1 too
        showRealtimeInterface();
        
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

// Start Real-time AI Assistant Session with Method 2 (Enhanced Diarization)
async function startRealtimeSessionMethod2() {
    console.log('🔬 Method 2: Starting enhanced session with debug...');
    
    const clientId = document.getElementById('sessionClient').value;
    const productId = document.getElementById('sessionProduct').value;
    const notes = document.getElementById('sessionNotes').value;
    
    if (!clientId || !productId) {
        showToast('Wybierz klienta i produkt', 'error');
        return;
    }
    
    try {
        console.log('🔍 Method 2: Getting user info...');
        
        // Get user info from current session
        const userResponse = await fetchWithAuth('/api/user');
        if (!userResponse || !userResponse.ok) {
            throw new Error('Failed to get user info');
        }
        const user = await userResponse.json();
        
        console.log('🔍 Method 2: User info received:', user.user.id);
        
        // Request microphone access
        console.log('🔍 Method 2: Requesting microphone access...');
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        
        console.log('🎤 Method 2: Microphone access granted');
        
        // Initialize session object
        currentSession = {
            clientId,
            productId,
            notes,
            userId: user.user.id,
            startTime: new Date(),
            transcript: '',
            suggestions: [],
            method: 2 // Mark as Method 2
        };
        
        console.log('🔍 Method 2: Session object created:', currentSession);
        
        // Show real-time interface immediately
        showRealtimeInterface();
        
        // Debug panel removed for cleaner interface
        
        // Wait for WebSocket connection
        console.log('⏳ Method 2: Waiting for WebSocket connection...');
        await waitForWebSocketConnection();
        
        console.log('🔍 Method 2: WebSocket ready, sending START_REALTIME_SESSION_METHOD2...');
        
        // Send Method 2 session start message
        const startMessage = {
            type: 'START_REALTIME_SESSION_METHOD2',
            clientId,
            productId,
            notes,
            userId: user.user.id
        };
        
        console.log('📤 Method 2: Sending START_REALTIME_SESSION_METHOD2:', startMessage);
        websocket.send(JSON.stringify(startMessage));
        
        console.log('✅ Method 2: Session start message sent');
        
    } catch (error) {
        console.error('❌ Method 2: Error starting session:', error);
        showToast('Błąd podczas uruchamiania Method 2: ' + error.message, 'error');
        
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
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
                        sessionId: currentSession?.sessionId,
                        method: currentSession?.method
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
    console.log('🎉 Session started:', data);
    console.log('🔍 Debug: Session method:', data.method, 'Type:', typeof data.method);
    console.log('🔍 Debug: Current session before update:', currentSession);
    
    // CRITICAL: Update current session with sessionId
    if (currentSession) {
        currentSession.sessionId = data.sessionId;
        console.log('🔍 Debug: Session ID set to:', currentSession.sessionId);
        console.log('🔍 Debug: Current session after update:', currentSession);
    } else {
        console.error('❌ CRITICAL: currentSession is null when session started!');
        // Create currentSession if it doesn't exist
        currentSession = {
            sessionId: data.sessionId,
            method: data.method || 1
        };
        console.log('🔧 Debug: Created new currentSession:', currentSession);
    }
    
    if (data.method === 2) {
        console.log('🔬 Method 2 session started with enhanced diarization');
        // Debug panel removed for cleaner interface
    }
    
    const startButton = document.getElementById('startSessionBtn');
    const startButtonMethod2 = document.getElementById('startSessionBtnMethod2');
    const stopButton = document.getElementById('stopSessionBtn');
    
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = 'Sesja w toku...';
    }
    
    if (startButtonMethod2) {
        startButtonMethod2.disabled = true;
        startButtonMethod2.textContent = 'Method 2 w toku...';
    }
    
    if (stopButton) {
        stopButton.disabled = false;
        stopButton.style.display = 'inline-block';
    }
    
    // Show session info with method indicator
    const methodLabel = data.method === 2 ? ' (Method 2 - Enhanced Diarization)' : '';
    showToast(`Sesja Real-time AI Assistant${methodLabel} rozpoczęta!`, 'success');
    isRecording = true;
    
    // Start session timer
    startSessionTimer();
    
    // Start appropriate audio recording based on method
    if (currentSession.method === 1) {
        // Method 1: Use Web Speech API for Polish
        console.log('🇵🇱 Method 1: Starting Web Speech API for Polish...');
        if (webSpeechRecognition && useWebSpeech) {
            try {
                webSpeechRecognition.start();
                console.log('✅ Web Speech API started for Polish');
                showToast('Rozpoznawanie mowy po polsku uruchomione', 'success');
            } catch (error) {
                console.error('❌ Error starting Web Speech API:', error);
                showToast('Błąd uruchamiania rozpoznawania polskiego: ' + error.message, 'error');
            }
        } else {
            console.warn('⚠️ Web Speech API not available, fallback to AssemblyAI (English only)');
            setupAudioRecording(); // Fallback to AssemblyAI
        }
    } else if (currentSession.method === 2) {
        // Method 2: Hybrid approach - Web Speech API (Polish) + enhanced processing
        console.log('🔬🇵🇱 Method 2: Starting hybrid approach (Web Speech + enhanced processing)...');
        if (webSpeechRecognition && useWebSpeech) {
            try {
                // Override the result handler for Method 2
                setupWebSpeechHandlersMethod2();
                webSpeechRecognition.start();
                console.log('✅ Web Speech API started for Method 2 with enhanced processing');
                showToast('Method 2: Rozpoznawanie z diarization uruchomione', 'success');
            } catch (error) {
                console.error('❌ Error starting Web Speech API for Method 2:', error);
                showToast('Błąd uruchamiania Method 2: ' + error.message, 'error');
            }
        } else {
            console.warn('⚠️ Web Speech API not available for Method 2, using AssemblyAI backup');
            setupAudioRecording(); // Fallback to AssemblyAI
        }
    } else {
        // Default: AssemblyAI
        if (audioStream) {
            setupAudioRecording();
        }
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
            
        </div>
        
        <!-- Hidden transcript content element for Method 2 functionality -->
        <div id="transcriptContent" style="display: none;"></div>
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
    console.log('📝 onPartialTranscript called:', data);
    const transcriptContent = document.getElementById('transcriptContent');
    console.log('📝 Transcript content element:', !!transcriptContent);
    if (!transcriptContent) {
        console.log('📝 No transcript content element found');
        return;
    }
    
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
    console.log('📝 onFinalTranscript called:', data);
    const transcriptContent = document.getElementById('transcriptContent');
    console.log('📝 Transcript content element for final:', !!transcriptContent);
    if (!transcriptContent) {
        console.log('📝 No transcript content element found for final');
        return;
    }
    
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
    const isMethod2 = data.transcript.method === 2;
    
    // Enhanced speaker display for Method 2
    let speakerDisplay = data.transcript.speaker.toUpperCase();
    let speakerClass = data.transcript.speaker;
    
    if (isMethod2 && data.transcript.speakerRole) {
        const roleEmoji = data.transcript.speakerRole === 'salesperson' ? '🔵' : 
                        data.transcript.speakerRole === 'client' ? '🔴' : '🟡';
        const roleText = data.transcript.speakerRole === 'salesperson' ? 'SPRZEDAWCA' : 
                       data.transcript.speakerRole === 'client' ? 'KLIENT' : 
                       data.transcript.speaker || 'NIEZNANY';
        speakerDisplay = `${roleEmoji} ${roleText}`;
        speakerClass = data.transcript.speakerRole;
    }
    
    finalElement.innerHTML = `
        <div class="transcript-line-new final ${isMethod2 ? 'method-2' : ''}">
            <div class="transcript-meta-new">
                <span class="timestamp-new">${timestamp}</span>
                <span class="speaker-new ${speakerClass}">[${speakerDisplay}]</span>
                ${isMethod2 ? '<span class="method-badge" title="Method 2 - Enhanced Diarization">M2</span>' : ''}
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

// NOWE: Partial Transcript Handler for Method 2 (Enhanced Diarization)
function onPartialTranscriptMethod2(data) {
    console.log('📝 onPartialTranscriptMethod2 called:', data);
    const transcriptContent = document.getElementById('transcriptContent');
    
    if (!transcriptContent) {
        console.log('📝 No transcript content element found for Method 2 partial');
        return;
    }
    
    // Update live transcript with partial results (Method 2 enhanced)
    const partialElement = transcriptContent.querySelector('.partial-transcript-method2');
    
    const speakerEmoji = data.transcript.speakerRole === 'salesperson' ? '🔵' : 
                        data.transcript.speakerRole === 'client' ? '🔴' : '🟡';
    const speakerRole = data.transcript.speakerRole === 'salesperson' ? 'SPRZEDAWCA' : 
                       data.transcript.speakerRole === 'client' ? 'KLIENT' : 
                       data.transcript.speaker || 'NIEZNANY';
    
    if (partialElement) {
        partialElement.innerHTML = `
            <div class="transcript-line partial method-2">
                <span class="speaker method-2">[${speakerEmoji} ${speakerRole}]</span>
                <span class="text">${data.transcript.text}</span>
                <span class="partial-indicator method-2">...</span>
                <span class="method-badge" title="Method 2 - Enhanced Diarization">M2</span>
            </div>
        `;
    } else {
        const newPartial = document.createElement('div');
        newPartial.className = 'partial-transcript-method2';
        newPartial.innerHTML = `
            <div class="transcript-line partial method-2">
                <span class="speaker method-2">[${speakerEmoji} ${speakerRole}]</span>
                <span class="text">${data.transcript.text}</span>
                <span class="partial-indicator method-2">...</span>
                <span class="method-badge" title="Method 2 - Enhanced Diarization">M2</span>
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

// NOWE: Final Transcript Handler for Method 2 (Enhanced Diarization)
function onFinalTranscriptMethod2(data) {
    console.log('📝 onFinalTranscriptMethod2 called:', data);
    const transcriptContent = document.getElementById('transcriptContent');
    
    if (!transcriptContent) {
        console.log('📝 No transcript content element found for Method 2 final');
        return;
    }
    
    // Remove partial transcript for Method 2
    const partialElement = transcriptContent.querySelector('.partial-transcript-method2');
    if (partialElement) {
        partialElement.remove();
    }
    
    // Add final transcript with enhanced Method 2 styling
    const finalElement = document.createElement('div');
    finalElement.className = 'transcript-entry-new method-2';
    
    const timestamp = new Date().toLocaleTimeString('pl-PL');
    const speakerEmoji = data.transcript.speakerRole === 'salesperson' ? '🔵' : 
                        data.transcript.speakerRole === 'client' ? '🔴' : '🟡';
    const speakerRole = data.transcript.speakerRole === 'salesperson' ? 'SPRZEDAWCA' : 
                       data.transcript.speakerRole === 'client' ? 'KLIENT' : 
                       data.transcript.speaker || 'NIEZNANY';
    
    finalElement.innerHTML = `
        <div class="transcript-line-new final method-2">
            <div class="transcript-meta-new method-2">
                <span class="timestamp-new">${timestamp}</span>
                <span class="speaker-new ${data.transcript.speakerRole}">[${speakerEmoji} ${speakerRole}]</span>
                <span class="method-badge" title="Method 2 - Enhanced Diarization">M2</span>
                <span class="confidence-badge" title="Confidence: ${Math.round(data.transcript.confidence * 100)}%">
                    ${Math.round(data.transcript.confidence * 100)}%
                </span>
            </div>
            <div class="transcript-text-new method-2">
                ${data.transcript.text}
            </div>
        </div>
    `;
    
    transcriptContent.appendChild(finalElement);
    
    // Auto-scroll to bottom
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
    
    // Update session transcript with Method 2 formatting
    if (currentSession) {
        currentSession.transcript += `[${speakerEmoji} ${speakerRole}] ${data.transcript.text}\n`;
    }
    
    // Add animation effect for Method 2
    finalElement.classList.add('method-2-new-entry');
    setTimeout(() => {
        finalElement.classList.remove('method-2-new-entry');
    }, 500);
}

// AI Suggestions Handler - PRZEPROJEKTOWANE
function onAISuggestions(data) {
    console.log('💡 AI Suggestions received:', data.suggestions);
    console.log('💡 Speaker info:', data.speakerInfo);
    console.log('💡 Full data:', data);
    
    const suggestionsContent = document.getElementById('suggestionsContent');
    console.log('💡 Suggestions content element:', !!suggestionsContent);
    if (!suggestionsContent) {
        console.log('💡 No suggestions content element found');
        return;
    }
    
    // Remove placeholder if exists
    const placeholder = suggestionsContent.querySelector('.suggestion-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const suggestions = data.suggestions;
    if (!suggestions) {
        console.log('💡 No suggestions data');
        return;
    }
    
    // Create new suggestion card
    const suggestionCard = document.createElement('div');
    suggestionCard.className = 'suggestion-card new-suggestion';
    
    // Determine suggestion type and content
    let suggestionType = 'Sugestia AI';
    let suggestionIcon = 'fa-lightbulb';
    let suggestionContent = '';
    let suggestionClass = '';
    
    // Handle different suggestion formats
    if (typeof suggestions === 'string') {
        suggestionContent = suggestions;
    } else if (suggestions.sugestie && Array.isArray(suggestions.sugestie)) {
        suggestionContent = suggestions.sugestie.join('<br>• ');
        suggestionContent = '• ' + suggestionContent;
        suggestionType = 'Główne sugestie';
        suggestionIcon = 'fa-bullseye';
        suggestionClass = 'main-suggestion';
    } else if (suggestions.nastepny_krok || suggestions.akcja) {
        suggestionContent = suggestions.nastepny_krok || suggestions.akcja;
        suggestionType = 'Następny krok';
        suggestionIcon = 'fa-arrow-right';
        suggestionClass = 'action-needed';
    } else if (suggestions.analiza_mowcy) {
        suggestionContent = suggestions.analiza_mowcy;
        suggestionType = 'Analiza rozmówcy';
        suggestionIcon = 'fa-user-tie';
    } else if (suggestions.intencja) {
        suggestionContent = suggestions.intencja;
        suggestionType = 'Intencja klienta';
        suggestionIcon = 'fa-bullseye';
    } else if (suggestions.sygnaly && Array.isArray(suggestions.sygnaly)) {
        suggestionContent = suggestions.sygnaly.join('<br>• ');
        suggestionContent = '• ' + suggestionContent;
        suggestionType = 'Sygnały sprzedażowe';
        suggestionIcon = 'fa-chart-line';
        suggestionClass = 'positive-signal';
    } else {
        // Fallback - try to extract any meaningful content
        const keys = Object.keys(suggestions);
        for (const key of keys) {
            if (suggestions[key] && typeof suggestions[key] === 'string') {
                suggestionContent = suggestions[key];
                break;
            } else if (Array.isArray(suggestions[key]) && suggestions[key].length > 0) {
                suggestionContent = suggestions[key].join('<br>• ');
                suggestionContent = '• ' + suggestionContent;
                break;
            }
        }
    }
    
    // If we have multiple suggestion types, create a comprehensive display
    if (typeof suggestions === 'object' && suggestions !== null) {
        let combinedContent = '';
        
        // Main suggestions
        if (suggestions.sugestie && Array.isArray(suggestions.sugestie) && suggestions.sugestie.length > 0) {
            combinedContent += `<div class="suggestion-section">
                <h5><i class="fas fa-lightbulb"></i> Główne sugestie:</h5>
                <ul class="suggestion-list">
                    ${suggestions.sugestie.map(s => `<li class="action-item">${s}</li>`).join('')}
                </ul>
            </div>`;
        }
        
        // Next action
        if (suggestions.nastepny_krok || suggestions.akcja) {
            combinedContent += `<div class="suggestion-section">
                <h5><i class="fas fa-arrow-right"></i> Następny krok:</h5>
                <div class="suggestion-content action-needed">
                    ${suggestions.nastepny_krok || suggestions.akcja}
                </div>
            </div>`;
        }
        
        // Signals
        if (suggestions.sygnaly && Array.isArray(suggestions.sygnaly) && suggestions.sygnaly.length > 0) {
            combinedContent += `<div class="suggestion-section">
                <h5><i class="fas fa-chart-line"></i> Sygnały:</h5>
                <ul class="suggestion-list">
                    ${suggestions.sygnaly.map(s => `<li class="positive">${s}</li>`).join('')}
                </ul>
            </div>`;
        }
        
        // Analysis
        if (suggestions.analiza_mowcy) {
            combinedContent += `<div class="suggestion-section">
                <h5><i class="fas fa-user-tie"></i> Analiza:</h5>
                <div class="suggestion-content">
                    ${suggestions.analiza_mowcy}
                </div>
            </div>`;
        }
        
        // Intent
        if (suggestions.intencja) {
            combinedContent += `<div class="suggestion-section">
                <h5><i class="fas fa-bullseye"></i> Intencja:</h5>
                <div class="suggestion-content">
                    ${suggestions.intencja}
                </div>
            </div>`;
        }
        
        if (combinedContent) {
            suggestionContent = combinedContent;
            suggestionType = 'Analiza AI';
            suggestionIcon = 'fa-robot';
        }
    }
    
    // Ensure we have content
    if (!suggestionContent) {
        suggestionContent = 'Otrzymano sugestię AI (szczegóły w konsoli)';
    }
    
    // Create the suggestion card HTML
    suggestionCard.innerHTML = `
        <div class="suggestion-header">
            <div class="suggestion-type">
                <i class="fas ${suggestionIcon}"></i>
                ${suggestionType}
            </div>
            <div class="suggestion-time">
                ${new Date().toLocaleTimeString('pl-PL')}
            </div>
        </div>
        <div class="suggestion-content ${suggestionClass}">
            ${suggestionContent}
        </div>
    `;
    
    // Add to top of suggestions (newest first)
    suggestionsContent.insertBefore(suggestionCard, suggestionsContent.firstChild);
    
    // Remove new-suggestion class after animation
    setTimeout(() => {
        suggestionCard.classList.remove('new-suggestion');
    }, 2000);
    
    // Limit number of suggestions displayed (keep last 10)
    const allSuggestions = suggestionsContent.querySelectorAll('.suggestion-card');
    if (allSuggestions.length > 10) {
        for (let i = 10; i < allSuggestions.length; i++) {
            allSuggestions[i].remove();
        }
    }
    
    // Add updated animation to container
    suggestionsContent.classList.add('updated-new');
    setTimeout(() => {
        suggestionsContent.classList.remove('updated-new');
    }, 500);
    
    // Auto-scroll to top to show new suggestion
    suggestionsContent.scrollTop = 0;
}

// ChatGPT Ready Handler
function onChatGPTReady(data) {
    console.log('🤖 ChatGPT ready received:', data.message);
    
    const suggestionsContent = document.getElementById('suggestionsContent');
    if (!suggestionsContent) {
        console.log('🤖 No suggestions content element found');
        return;
    }
    
    // Remove placeholder if exists
    const placeholder = suggestionsContent.querySelector('.suggestion-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Create ChatGPT ready message
    const readyElement = document.createElement('div');
    readyElement.className = 'chatgpt-ready-container';
    readyElement.innerHTML = `
        <div class="chatgpt-ready-header">
            <i class="fas fa-brain"></i>
            <span>ChatGPT - Gotowy do analizy!</span>
            <span class="ready-time">${new Date().toLocaleTimeString('pl-PL')}</span>
        </div>
        <div class="chatgpt-ready-content">
            ${data.message}
        </div>
        <div class="chatgpt-ready-footer">
            <small>🚀 System prompt załadowany - rozpocznij rozmowę!</small>
            ${data.responseTime ? `<small>⚡ Inicjalizacja: ${data.responseTime}ms</small>` : ''}
        </div>
    `;
    
    suggestionsContent.appendChild(readyElement);
    
    // Add ready animation
    readyElement.classList.add('ready-animation');
    setTimeout(() => {
        readyElement.classList.remove('ready-animation');
    }, 1000);
    
    // Update debug panel
    // Debug panel removed - no updates needed
    
    // Show success toast
    showToast('ChatGPT gotowy do analizy rozmowy!', 'success');
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
    console.log('🛑 Session ended:', data);
    
    // Debug panel removed - no cleanup needed
    
    const startButton = document.getElementById('startSessionBtn');
    const startButtonMethod2 = document.getElementById('startSessionBtnMethod2');
    const stopButton = document.getElementById('stopSessionBtn');
    
    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'Rozpocznij nagrywanie (Metoda 1)';
    }
    
    if (startButtonMethod2) {
        startButtonMethod2.disabled = false;
        startButtonMethod2.textContent = 'Rozpocznij z diarization (Metoda 2)';
    }
    
    if (stopButton) {
        stopButton.disabled = true;
        stopButton.style.display = 'none';
    }
    
    showToast('Sesja zakończona i zapisana', 'success');
    isRecording = false;
    currentSession = null;
    
    // Stop audio stream
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    // Reset transcript display
    const transcriptContent = document.getElementById('transcriptContent');
    if (transcriptContent) {
        transcriptContent.innerHTML = `
            <div class="transcript-placeholder">
                <i class="fas fa-microphone"></i>
                <p>Transkrypcja pojawi się tutaj...</p>
            </div>
        `;
    }
    
    // Reset suggestions display
    const suggestionsContent = document.getElementById('suggestionsContent');
    if (suggestionsContent) {
        suggestionsContent.innerHTML = `
            <div class="suggestion-placeholder">
                <i class="fas fa-lightbulb"></i>
                <p>Sugestie AI pojawią się tutaj...</p>
            </div>
        `;
    }
    
    // Remove real-time interface and show setup form
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

// NOWE: Setup Web Speech API event handlers for Method 2 (Enhanced Diarization)
function setupWebSpeechHandlersMethod2() {
    if (!webSpeechRecognition) return;
    
    console.log('🔬🇵🇱 Setting up Web Speech API handlers for Method 2...');
    
    // Override handlers for Method 2
    webSpeechRecognition.onresult = (event) => {
        console.log('📝 Method 2 Web Speech API result:', event);
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence;
            const isFinal = result.isFinal;
            
            console.log(`🔬🇵🇱 ${isFinal ? 'Final' : 'Partial'} transcript (Method 2 PL):`, transcript);
            
            // For Method 2, we try to detect speaker based on patterns or timing
            // This is a simple heuristic - in real applications you might use more sophisticated methods
            let speakerInfo = {
                speaker: 'unknown',
                speakerRole: 'unknown'
            };
            
            // Simple heuristic: alternating speakers based on conversation flow
            if (currentSession && currentSession.conversationHistory) {
                const historyCount = currentSession.conversationHistory.length;
                if (historyCount === 0) {
                    // First speaker is usually salesperson
                    speakerInfo.speaker = 'A';
                    speakerInfo.speakerRole = 'salesperson';
                } else {
                    // Alternate between speakers
                    const lastSpeaker = currentSession.conversationHistory[historyCount - 1]?.speaker;
                    speakerInfo.speaker = lastSpeaker === 'A' ? 'B' : 'A';
                    speakerInfo.speakerRole = lastSpeaker === 'A' ? 'client' : 'salesperson';
                }
            }
            
            if (isFinal) {
                // Update local conversation history for speaker detection
                if (!currentSession.conversationHistory) {
                    currentSession.conversationHistory = [];
                }
                currentSession.conversationHistory.push({
                    speaker: speakerInfo.speaker,
                    speakerRole: speakerInfo.speakerRole,
                    text: transcript,
                    timestamp: new Date().toISOString()
                });
                
                // Send final transcript via WebSocket with Method 2 type
                if (websocket && websocket.readyState === WebSocket.OPEN && currentSession?.sessionId) {
                    console.log('🔬📤 Sending Method 2 transcript to backend...');
                    websocket.send(JSON.stringify({
                        type: 'WEB_SPEECH_TRANSCRIPT_METHOD2',
                        sessionId: currentSession.sessionId,
                        transcript: {
                            text: transcript,
                            confidence: confidence || 0.9,
                            language: 'pl',
                            speaker: speakerInfo.speaker,
                            speakerRole: speakerInfo.speakerRole
                        }
                    }));
                }
                
                // Update UI with enhanced Method 2 final transcript
                onFinalTranscriptMethod2({
                    transcript: {
                        text: transcript,
                        speaker: speakerInfo.speaker,
                        speakerRole: speakerInfo.speakerRole,
                        confidence: confidence || 0.9,
                        method: 2
                    }
                });
            } else {
                // Send partial transcript to backend for live AI suggestions
                if (websocket && websocket.readyState === WebSocket.OPEN && currentSession?.sessionId) {
                    console.log('🔬📤 Sending Method 2 PARTIAL transcript to backend for live suggestions...');
                    websocket.send(JSON.stringify({
                        type: 'WEB_SPEECH_PARTIAL_METHOD2',
                        sessionId: currentSession.sessionId,
                        transcript: {
                            text: transcript,
                            confidence: confidence || 0.9,
                            language: 'pl',
                            speaker: speakerInfo.speaker,
                            speakerRole: speakerInfo.speakerRole,
                            wordsCount: transcript.split(' ').length
                        }
                    }));
                }
                
                // Update UI with partial transcript (Method 2 enhanced)
                onPartialTranscriptMethod2({
                    transcript: {
                        text: transcript,
                        speaker: speakerInfo.speaker,
                        speakerRole: speakerInfo.speakerRole,
                        confidence: confidence || 0.9,
                        method: 2
                    }
                });
            }
        }
    };
    
    // Enhanced error handling for Method 2
    webSpeechRecognition.onerror = (event) => {
        console.error('❌ Method 2 Web Speech API error:', event.error);
        showToast(`Method 2 - Błąd rozpoznawania mowy: ${event.error}`, 'error');
    };
    
    // Enhanced end handling for Method 2
    webSpeechRecognition.onend = () => {
        console.log('🔚 Method 2 Web Speech API ended');
        if (isRecording && currentSession?.sessionId && currentSession?.method === 2) {
            // Restart if still recording Method 2 session
            setTimeout(() => {
                if (isRecording && currentSession?.method === 2) {
                    console.log('🔄 Restarting Method 2 Web Speech API...');
                    webSpeechRecognition.start();
                }
            }, 100);
        }
    };
}

// Debug panel functions removed for cleaner interface

// ===== NOWE FUNKCJE NAGRYWANIA =====

// Start Recording Session
async function startRecordingSession() {
    console.log('🎥 Starting recording session...');
    
    const clientSelect = document.getElementById('sessionClient');
    const productSelect = document.getElementById('sessionProduct');
    const notesTextarea = document.getElementById('sessionNotes');
    
    if (!clientSelect || !productSelect) {
        showToast('Elementy formularza nie zostały znalezione', 'error');
        return;
    }
    
    const clientId = parseInt(clientSelect.value);
    const productId = parseInt(productSelect.value);
    const notes = notesTextarea ? notesTextarea.value : '';
    
    if (!clientId || !productId) {
        showToast('Proszę wybierz klienta i produkt', 'error');
        return;
    }
    
    try {
        // Wait for WebSocket connection
        await waitForWebSocketConnection();
        
        // Setup audio recording
        await setupRecordingAudio();
        
        // Send WebSocket message to start recording
        const recordingData = {
            type: 'START_RECORDING_SESSION',
            clientId: clientId,
            productId: productId,
            notes: notes
        };
        
        console.log('🎥 Sending recording start message:', recordingData);
        websocket.send(JSON.stringify(recordingData));
        
        showToast('Rozpoczynanie nagrania...', 'info');
        
    } catch (error) {
        console.error('❌ Failed to start recording session:', error);
        showToast('Błąd rozpoczęcia nagrania: ' + error.message, 'error');
    }
}

// Setup Audio Recording (skopiowane z metody live)
async function setupRecordingAudio() {
    try {
        console.log('🎤 Setting up recording audio...');
        
        if (audioStream) {
            console.log('🔄 Closing existing audio stream...');
            audioStream.getTracks().forEach(track => track.stop());
        }
        
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000
            }
        });
        
        console.log('✅ Recording microphone access granted');
        
        // Setup Web Speech Recognition for Polish (z Method2)
        setupRecordingWebSpeech();
        
    } catch (error) {
        console.error('❌ Recording microphone setup failed:', error);
        throw error;
    }
}

// Setup Web Speech Recognition for Recording with Method 2 (Enhanced Speaker Diarization)
function setupRecordingWebSpeech() {
    console.log('🔧 Setting up Web Speech Recognition for recording...');
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('❌ Web Speech API not supported');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    webSpeechRecognition = new SpeechRecognition();
    
    // Configuration (Polish language) - ZOPTYMALIZOWANA dla długich nagrań
    webSpeechRecognition.lang = 'pl-PL';
    webSpeechRecognition.continuous = true;
    webSpeechRecognition.interimResults = true;
    webSpeechRecognition.maxAlternatives = 1;
    
    // Dodatkowe konfiguracje dla stabilności (jeśli są dostępne w przeglądarce)
    if ('speechTimeout' in webSpeechRecognition) {
        webSpeechRecognition.speechTimeout = 10000; // 10 sekund timeout
    }
    if ('serviceURI' in webSpeechRecognition) {
        // Możemy ustawić własny service jeśli jest dostępny
    }
    
    console.log('🔧 Web Speech Recognition configured:', {
        lang: webSpeechRecognition.lang,
        continuous: webSpeechRecognition.continuous,
        interimResults: webSpeechRecognition.interimResults,
        maxAlternatives: webSpeechRecognition.maxAlternatives
    });
    
    // Enhanced speaker tracking variables for recording
    let recordingLastSpeaker = null;
    let recordingLastSpeechTime = 0;
    let recordingWordBuffer = [];
    let recordingCurrentSpeaker = 'A'; // Start with speaker A
    let restartAttempts = 0; // Licznik prób restartowania
    
    // Event handlers
    webSpeechRecognition.onstart = () => {
        console.log('🎤🔬 Recording speech recognition started with Method 2 enhanced diarization');
        restartAttempts = 0; // Reset licznika po udanym starcie
    };
    
    webSpeechRecognition.onresult = (event) => {
        console.log('🎤🔬 Recording speech recognition got results:', event.results.length);
        
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            console.log('🎤🔬 Result', i, ':', transcript, 'isFinal:', event.results[i].isFinal);
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        console.log('🎤🔬 Final transcript:', finalTranscript);
        console.log('🎤🔬 Interim transcript:', interimTranscript);
        
        // Enhanced speaker detection for recording
        const currentTime = Date.now();
        const timeSinceLastSpeech = currentTime - recordingLastSpeechTime;
        
        // Detect speaker change based on silence duration and speech patterns
        if (timeSinceLastSpeech > 3000 || // Zwiększono z 2s na 3s dla stabilności
            (finalTranscript && detectSpeakerChange(finalTranscript, recordingWordBuffer))) {
            
            // Switch speaker
            recordingCurrentSpeaker = recordingCurrentSpeaker === 'A' ? 'B' : 'A';
            console.log(`🎤🔬 Recording speaker switched to: ${recordingCurrentSpeaker}`);
        }
        
        // Update word buffer for speaker detection
        if (finalTranscript) {
            recordingWordBuffer.push(...finalTranscript.split(' '));
            if (recordingWordBuffer.length > 50) {
                recordingWordBuffer = recordingWordBuffer.slice(-25); // Keep last 25 words
            }
        }
        
        recordingLastSpeechTime = currentTime;
        
        // Determine speaker role (same logic as Method 2)
        const speakerRole = recordingCurrentSpeaker === 'A' ? 'SPRZEDAWCA' : 'KLIENT';
        
        // Update transcript display with speaker info
        updateRecordingTranscriptWithSpeaker(finalTranscript, interimTranscript, recordingCurrentSpeaker, speakerRole);
        
        // Send final transcript to server with speaker info
        if (finalTranscript && websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('🎤🔬 Sending final transcript to server:', finalTranscript);
            
            const transcriptData = {
                type: 'RECORDING_TRANSCRIPT_METHOD2',
                recordingId: currentRecording?.id,
                transcript: {
                    text: finalTranscript,
                    speaker: recordingCurrentSpeaker,
                    speakerRole: speakerRole,
                    language: 'pl',
                    confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.9
                },
                isFinal: true
            };
            
            websocket.send(JSON.stringify(transcriptData));
        }
        
        // Send partial transcript for live updates (if interim text exists)
        if (interimTranscript && websocket && websocket.readyState === WebSocket.OPEN) {
            const wordsCount = interimTranscript.split(' ').length;
            
            if (wordsCount >= 5) { // Zwiększono z 3 na 5 słów dla stabilności
                console.log('🎤🔬 Sending partial transcript to server:', interimTranscript);
                
                const partialData = {
                    type: 'RECORDING_PARTIAL_METHOD2',
                    recordingId: currentRecording?.id,
                    transcript: {
                        text: interimTranscript,
                        speaker: recordingCurrentSpeaker,
                        speakerRole: speakerRole,
                        language: 'pl',
                        confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.9,
                        wordsCount: wordsCount
                    },
                    isPartial: true
                };
                
                websocket.send(JSON.stringify(partialData));
            }
        }
    };
    
    webSpeechRecognition.onerror = (event) => {
        console.error('❌ Recording speech recognition error:', event.error);
        console.error('❌ Error details:', event);
        
        // Handle specific error types - ULEPSZONA OBSŁUGA
        if (event.error === 'not-allowed') {
            console.error('❌ Microphone access denied');
            return; // Nie restartuj jeśli nie ma dostępu
        } else if (event.error === 'network') {
            console.error('❌ Network error in speech recognition');
            restartAttempts++;
        } else if (event.error === 'no-speech') {
            console.log('⚠️ No speech detected - to jest normalne podczas ciszy');
            // NIE traktuj jako błąd, to normalne podczas ciszy
            return;
        } else if (event.error === 'aborted') {
            console.error('❌ Speech recognition aborted');
            return; // Nie restartuj jeśli został przerwany celowo
        } else if (event.error === 'audio-capture') {
            console.error('❌ Audio capture error');
            restartAttempts++;
        } else if (event.error === 'service-not-allowed') {
            console.error('❌ Speech service not allowed');
            return; // Nie restartuj jeśli serwis nie jest dozwolony
        }
        
        // Ogranicz liczbę prób restartowania
        if (restartAttempts > 5) {
            console.error('❌ Too many restart attempts, stopping...');
            return;
        }
    };
    
    webSpeechRecognition.onend = () => {
        console.log('🎤🔬 Recording speech recognition ended');
        
        // Auto restart if still recording - ZOPTYMALIZOWANY RESTART
        if (currentRecording && !currentRecording.stopped) {
            console.log('🔄 Restarting recording speech recognition...');
            
            // Zwiększony timeout z 100ms na 1000ms dla stabilności
            setTimeout(() => {
                try {
                    if (currentRecording && !currentRecording.stopped && restartAttempts <= 5) {
                        webSpeechRecognition.start();
                        console.log('🔄 Recording speech recognition restarted');
                    }
                } catch (error) {
                    console.error('❌ Error restarting recording speech recognition:', error);
                    restartAttempts++;
                    
                    // Jeśli restart się nie udał, spróbuj ponownie za dłuższy czas
                    if (restartAttempts <= 5) {
                        setTimeout(() => {
                            try {
                                if (currentRecording && !currentRecording.stopped) {
                                    webSpeechRecognition.start();
                                    console.log('🔄 Recording speech recognition restarted after longer delay');
                                }
                            } catch (secondError) {
                                console.error('❌ Second restart attempt failed:', secondError);
                            }
                        }, 3000); // 3 sekundy opóźnienia
                    }
                }
            }, 1000); // Zwiększono z 100ms na 1000ms
        }
    };
    
    console.log('✅ Web Speech Recognition setup complete for recording');
}

// Speaker Change Detection Function for Recording (copied from Method 2)
function detectSpeakerChange(newText, wordBuffer) {
    // Simple heuristics for speaker change detection
    const text = newText.toLowerCase();
    
    // Question indicators suggest speaker change
    if (text.includes('?') || text.includes('tak') || text.includes('nie') || 
        text.includes('słucham') || text.includes('proszę')) {
        return true;
    }
    
    // Check for conversation markers
    if (text.includes('dzień dobry') || text.includes('dziękuję') || 
        text.includes('mogę') || text.includes('chciałbym')) {
        return true;
    }
    
    // Check word buffer for context changes
    if (wordBuffer.length > 10) {
        const lastWords = wordBuffer.slice(-10).join(' ').toLowerCase();
        if (lastWords.includes('produktu') && text.includes('tak')) {
            return true;
        }
    }
    
    return false;
}

// Update Recording Transcript Display with Speaker Information
function updateRecordingTranscriptWithSpeaker(finalText, interimText, speaker, speakerRole) {
    const transcriptContent = document.getElementById('recordingTranscriptContent');
    if (!transcriptContent) return;
    
    if (finalText) {
        // Add final transcript entry with speaker info
        recordingTranscript += finalText + ' ';
        
        const transcriptEntry = document.createElement('div');
        transcriptEntry.className = `transcript-entry final speaker-${speaker.toLowerCase()}`;
        
        // Create speaker indicator
        const speakerIndicator = document.createElement('span');
        speakerIndicator.className = 'speaker-indicator';
        speakerIndicator.textContent = speakerRole === 'SPRZEDAWCA' ? '🔵' : '🔴';
        
        // Create speaker label
        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'speaker-label';
        speakerLabel.textContent = speakerRole;
        
        // Create transcript text
        const transcriptText = document.createElement('span');
        transcriptText.className = 'transcript-text';
        transcriptText.textContent = finalText;
        
        // Assemble entry
        transcriptEntry.appendChild(speakerIndicator);
        transcriptEntry.appendChild(speakerLabel);
        transcriptEntry.appendChild(transcriptText);
        
        // Remove placeholder if exists
        const placeholder = transcriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        transcriptContent.appendChild(transcriptEntry);
        
        // Scroll to bottom
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }
    
    // Show interim text in placeholder with speaker info (if no final text yet)
    if (interimText && !finalText) {
        let placeholder = transcriptContent.querySelector('.transcript-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'transcript-placeholder';
            transcriptContent.appendChild(placeholder);
        }
        
        const speakerIcon = speakerRole === 'SPRZEDAWCA' ? '🔵' : '🔴';
        placeholder.innerHTML = `<span class="speaker-indicator">${speakerIcon}</span><span class="speaker-label">${speakerRole}</span><span class="transcript-text interim">${interimText}</span>`;
    }
}

// Legacy function for backward compatibility
function updateRecordingTranscript(finalText, interimText) {
    // Call the new function with default speaker info
    updateRecordingTranscriptWithSpeaker(finalText, interimText, 'A', 'SPRZEDAWCA');
}

// Start Recording Timer
function startRecordingTimer() {
    recordingStartTime = Date.now();
    
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timerDisplay = document.getElementById('recordingTimer');
        if (timerDisplay) {
            timerDisplay.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Save Recording Progress (co 30 sekund - zmniejszona częstotliwość dla stabilności)
function startRecordingSave() {
    recordingSaveInterval = setInterval(() => {
        if (currentRecording && recordingTranscript) {
            saveRecordingProgress();
        }
    }, 30000); // 30 sekund - zmniejszono częstotliwość żeby nie zakłócać transkrypcji
}

// Save Recording Progress to Database
async function saveRecordingProgress() {
    if (!currentRecording) return;
    
    try {
        const response = await fetchWithAuth('/api/recordings/save-progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recordingId: currentRecording.id,
                transcript: recordingTranscript,
                duration: Math.floor((Date.now() - recordingStartTime) / 1000)
            })
        });
        
        if (response && response.ok) {
            console.log('💾 Recording progress saved');
        }
    } catch (error) {
        console.error('❌ Error saving recording progress:', error);
    }
}

// Stop Recording Session
async function stopRecordingSession() {
    console.log('🛑 Stopping recording session...');
    
    try {
        // Stop timers
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        if (recordingSaveInterval) {
            clearInterval(recordingSaveInterval);
            recordingSaveInterval = null;
        }
        
        // Stop speech recognition
        if (webSpeechRecognition) {
            webSpeechRecognition.stop();
        }
        
        // Stop audio stream
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Send stop message to server
        if (websocket && websocket.readyState === WebSocket.OPEN && currentRecording) {
            const stopData = {
                type: 'STOP_RECORDING_SESSION',
                recordingId: currentRecording.id,
                finalTranscript: recordingTranscript
            };
            
            websocket.send(JSON.stringify(stopData));
        }
        
        // Hide recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.style.display = 'none';
        }
        
        // Show setup form
        const setupCard = document.querySelector('.setup-card');
        if (setupCard) {
            setupCard.style.display = 'block';
        }
        
        // Reset variables
        currentRecording = null;
        recordingTranscript = '';
        
        showToast('Nagranie zakończone', 'success');
        
    } catch (error) {
        console.error('❌ Error stopping recording:', error);
        showToast('Błąd zatrzymania nagrania: ' + error.message, 'error');
    }
}

// Handle Recording Started Message
function onRecordingStarted(data) {
    console.log('🎥 Recording started:', data);
    
    currentRecording = {
        id: data.recordingId,
        clientId: data.clientId,
        productId: data.productId,
        stopped: false
    };
    
    // Show recording status
    const recordingStatus = document.getElementById('recordingStatus');
    if (recordingStatus) {
        recordingStatus.style.display = 'block';
    }
    
    // Hide setup form
    const setupCard = document.querySelector('.setup-card');
    if (setupCard) {
        setupCard.style.display = 'none';
    }
    
    // Update client/product names
    const clientSelect = document.getElementById('sessionClient');
    const productSelect = document.getElementById('sessionProduct');
    
    if (clientSelect) {
        const clientName = clientSelect.options[clientSelect.selectedIndex]?.text || 'Nieznany';
        const recordingClientName = document.getElementById('recordingClientName');
        if (recordingClientName) recordingClientName.textContent = clientName;
    }
    
    if (productSelect) {
        const productName = productSelect.options[productSelect.selectedIndex]?.text || 'Nieznany';
        const recordingProductName = document.getElementById('recordingProductName');
        if (recordingProductName) recordingProductName.textContent = productName;
    }
    
    // Start timer and auto-save
    startRecordingTimer();
    startRecordingSave();
    
    // Start speech recognition
    console.log('🎤 Attempting to start recording speech recognition...');
    console.log('🎤 webSpeechRecognition status:', webSpeechRecognition ? 'exists' : 'null');
    
    if (webSpeechRecognition) {
        try {
            console.log('🎤 Calling webSpeechRecognition.start()...');
            webSpeechRecognition.start();
            console.log('🎤 Recording speech recognition started successfully');
        } catch (error) {
            console.error('❌ Error starting recording speech recognition:', error);
            console.error('❌ Error details:', error.message);
            
            // Try to setup again if it failed
            console.log('🔄 Attempting to setup Web Speech Recognition again...');
            setupRecordingWebSpeech();
            
            // Try to start again
            setTimeout(() => {
                try {
                    console.log('🔄 Second attempt to start speech recognition...');
                    webSpeechRecognition.start();
                    console.log('✅ Speech recognition started on second attempt');
                } catch (secondError) {
                    console.error('❌ Second attempt failed:', secondError);
                }
            }, 500);
        }
    } else {
        console.error('❌ webSpeechRecognition is null - setting up...');
        setupRecordingWebSpeech();
        
        // Try to start after setup
        setTimeout(() => {
            if (webSpeechRecognition) {
                try {
                    console.log('🔄 Starting speech recognition after setup...');
                    webSpeechRecognition.start();
                    console.log('✅ Speech recognition started after setup');
                } catch (error) {
                    console.error('❌ Error starting speech recognition after setup:', error);
                }
            } else {
                console.error('❌ webSpeechRecognition still null after setup');
            }
        }, 500);
    }
    
    showToast('Nagranie rozpoczęte', 'success');
}

// Handle Recording Error
function onRecordingError(data) {
    console.error('❌ Recording error:', data);
    showToast('Błąd nagrania: ' + (data.message || 'Nieznany błąd'), 'error');
    
    // Cleanup
    stopRecordingSession();
}

console.log('✅ Real-time AI Assistant loaded successfully'); 