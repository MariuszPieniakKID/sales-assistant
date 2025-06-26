// spotkania.js - Zarządzanie spotkaniami

console.log('🎬 spotkania.js - Start ładowania skryptu');

let meetings = [];
let filteredMeetings = [];

// Elementy DOM - sprawdzenie czy istnieją
console.log('🔍 Sprawdzanie elementów DOM...');
const meetingsTableBody = document.getElementById('meetingsTableBody');
const searchInput = document.getElementById('searchMeetings');
const meetingDetailsModal = document.getElementById('meetingDetailsModal');
const closeMeetingModal = document.getElementById('closeMeetingModal');
const meetingDetails = document.getElementById('meetingDetails');

console.log('📋 Elementy DOM znalezione:', {
    meetingsTableBody: !!meetingsTableBody,
    searchInput: !!searchInput,
    meetingDetailsModal: !!meetingDetailsModal,
    closeMeetingModal: !!closeMeetingModal,
    meetingDetails: !!meetingDetails
});

// Inicjalizacja - sprawdź czy DOM jest już gotowy
console.log('🎯 Sprawdzanie stanu DOM:', document.readyState);

function initializeMeetings() {
    console.log('🚀 Inicjalizacja sekcji spotkań...');
    console.log('🔍 Elementy DOM w inicjalizacji:', {
        meetingsTableBody: !!document.getElementById('meetingsTableBody'),
        searchInput: !!document.getElementById('searchMeetings'),
        meetingDetailsModal: !!document.getElementById('meetingDetailsModal')
    });
    
    loadMeetings();
    setupEventListeners();
}

if (document.readyState === 'loading') {
    console.log('⏳ DOM jeszcze się ładuje - czekam na DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initializeMeetings);
} else {
    console.log('✅ DOM już gotowy - uruchamiam inicjalizację z małym opóźnieniem');
    // DOM już gotowy, ale dodaj małe opóźnienie dla sekcji AJAX
    setTimeout(initializeMeetings, 200);
}

// Konfiguracja event listenerów
function setupEventListeners() {
    // Wyszukiwanie
    searchInput.addEventListener('input', handleSearch);
    
    // Zamykanie modala
    closeMeetingModal.addEventListener('click', closeMeetingDetailsModal);
    
    // Zamykanie modala przez kliknięcie w tło
    meetingDetailsModal.addEventListener('click', function(e) {
        if (e.target === meetingDetailsModal) {
            closeMeetingDetailsModal();
        }
    });
    
    // Zamykanie modala przez ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && meetingDetailsModal.classList.contains('active')) {
            closeMeetingDetailsModal();
        }
    });
}

// Ładowanie spotkań z API
async function loadMeetings() {
    try {
        console.log('🔄 Ładowanie spotkań z API...');
        showLoading();
        
        const response = await fetch('/api/sales');
        console.log('📡 Odpowiedź API:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error('Błąd pobierania spotkań');
        }
        
        meetings = await response.json();
        console.log('📊 Załadowano spotkań:', meetings.length, meetings);
        
        filteredMeetings = [...meetings];
        renderMeetingsTable();
        
    } catch (error) {
        console.error('❌ Błąd ładowania spotkań:', error);
        showError('Nie udało się załadować spotkań');
    }
}

// Wyświetlanie tabeli spotkań
function renderMeetingsTable() {
    console.log('🎨 Renderowanie tabeli spotkań:', filteredMeetings.length);
    
    if (filteredMeetings.length === 0) {
        console.log('📭 Brak spotkań do wyświetlenia - pokazuję pusty stan');
        showEmptyState();
        return;
    }
    
    const tableHTML = filteredMeetings.map(meeting => {
        const meetingDate = new Date(meeting.meeting_datetime);
        const formattedDate = meetingDate.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const status = getMeetingStatus(meeting);
        
        return `
            <tr onclick="openMeetingDetails(${meeting.id})" data-meeting-id="${meeting.id}">
                <td>
                    <div class="client-name">${escapeHtml(meeting.client_name)}</div>
                </td>
                <td>
                    <div class="product-name">${escapeHtml(meeting.product_name)}</div>
                </td>
                <td>
                    <div class="meeting-date">${formattedDate}</div>
                </td>
                <td>
                    <span class="status-badge ${status.class}">
                        <i class="fas ${status.icon}"></i>
                        ${status.text}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-view" onclick="event.stopPropagation(); openMeetingDetails(${meeting.id})" title="Zobacz szczegóły">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    meetingsTableBody.innerHTML = tableHTML;
}

// Określanie statusu spotkania
function getMeetingStatus(meeting) {
    const now = new Date();
    const meetingDate = new Date(meeting.meeting_datetime);
    
    if (meetingDate > now) {
        return {
            class: 'status-pending',
            icon: 'fa-clock',
            text: 'Zaplanowane'
        };
    } else if (meeting.transcription && meeting.transcription.trim()) {
        return {
            class: 'status-completed',
            icon: 'fa-check-circle',
            text: 'Zakończone'
        };
    } else {
        return {
            class: 'status-cancelled',
            icon: 'fa-times-circle',
            text: 'Anulowane'
        };
    }
}

// Wyszukiwanie spotkań
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredMeetings = [...meetings];
    } else {
        filteredMeetings = meetings.filter(meeting => 
            meeting.client_name.toLowerCase().includes(searchTerm) ||
            meeting.product_name.toLowerCase().includes(searchTerm) ||
            (meeting.transcription && meeting.transcription.toLowerCase().includes(searchTerm)) ||
            (meeting.positive_findings && meeting.positive_findings.toLowerCase().includes(searchTerm)) ||
            (meeting.negative_findings && meeting.negative_findings.toLowerCase().includes(searchTerm)) ||
            (meeting.recommendations && meeting.recommendations.toLowerCase().includes(searchTerm)) ||
            (meeting.own_notes && meeting.own_notes.toLowerCase().includes(searchTerm))
        );
    }
    
    renderMeetingsTable();
}

// Otwieranie szczegółów spotkania - przekierowanie na dedykowaną stronę
async function openMeetingDetails(meetingId) {
    console.log('Przekierowanie do szczegółów spotkania ID:', meetingId);
    
    // Przekieruj na dedykowaną stronę szczegółów spotkania
    window.location.href = `sections/spotkanie-szczegoly.html?id=${meetingId}`;
    return;
}

// Zamykanie modala szczegółów
function closeMeetingDetailsModal() {
    meetingDetailsModal.classList.remove('active');
    meetingDetails.innerHTML = '';
    
    // Resetuj tytuł modala do stanu domyślnego
    const modalTitle = document.querySelector('#meetingDetailsModal .modal-header h3');
    if (modalTitle) {
        modalTitle.innerHTML = 'Szczegóły spotkania';
    }
}

// Zapisywanie notatek do spotkania
async function saveMeetingNotes(meetingId) {
    const notesTextarea = document.getElementById('meetingNotes');
    const notes = notesTextarea.value.trim();
    
    try {
        const response = await fetch(`/api/sales/${meetingId}/notes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        
        if (!response.ok) {
            throw new Error('Błąd zapisywania notatek');
        }
        
        // Aktualizuj lokalne dane
        const meeting = meetings.find(m => m.id === meetingId);
        if (meeting) {
            meeting.own_notes = notes;
        }
        
        showSuccess('Notatki zostały zapisane');
        
    } catch (error) {
        console.error('Błąd zapisywania notatek:', error);
        showError('Nie udało się zapisać notatek');
    }
}

// Wyświetlanie pustego stanu
function showEmptyState() {
    meetingsTableBody.innerHTML = `
        <tr>
            <td colspan="5">
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Brak spotkań</h3>
                    <p>Nie znaleziono żadnych spotkań spełniających kryteria wyszukiwania.</p>
                </div>
            </td>
        </tr>
    `;
}

// Wyświetlanie stanu ładowania
function showLoading() {
    meetingsTableBody.innerHTML = `
        <tr>
            <td colspan="5">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <h3>Ładowanie spotkań...</h3>
                    <p>Proszę czekać, pobieramy dane spotkań.</p>
                </div>
            </td>
        </tr>
    `;
}

// Funkcje pomocnicze
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    // Implementacja toast notification - można rozszerzyć
    console.log('Success:', message);
    // Tutaj można dodać toast notification system
}

function showError(message) {
    // Implementacja toast notification - można rozszerzyć
    console.error('Error:', message);
    // Tutaj można dodać toast notification system
}

// Switch between tabs in meeting details
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName + '-tab');
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

// Format transcription with speaker roles
function formatTranscription(transcription) {
    if (!transcription) return '';
    
    console.log('DEBUG: formatTranscription input length:', transcription.length);
    console.log('DEBUG: formatTranscription first 200 chars:', transcription.substring(0, 200));
    
    // Split by lines and format each speaker line
    const lines = transcription.split('\n');
    console.log('DEBUG: formatTranscription lines count:', lines.length);
    
    return lines.map(line => {
        if (line.trim() === '') return '<br>';
        
        // Check if line contains speaker role markers
        if (line.includes('[🔵SPRZEDAWCA]') || line.includes('🔵SPRZEDAWCA')) {
            const text = line.replace(/\[🔵SPRZEDAWCA\]/g, '').replace(/🔵SPRZEDAWCA/g, '').trim();
            return `<div class="speaker-line salesperson">
                <span class="speaker-badge salesperson">🔵 SPRZEDAWCA</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else if (line.includes('[🔴KLIENT]') || line.includes('🔴KLIENT')) {
            const text = line.replace(/\[🔴KLIENT\]/g, '').replace(/🔴KLIENT/g, '').trim();
            return `<div class="speaker-line client">
                <span class="speaker-badge client">🔴 KLIENT</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else if (line.includes('🟡') || line.includes('[🟡')) {
            // Handle unknown speakers
            const speakerMatch = line.match(/\[?🟡([^\]]*)\]?/);
            const speakerName = speakerMatch ? speakerMatch[1].trim() : 'NIEZNANY';
            const text = line.replace(/\[?🟡[^\]]*\]?/g, '').trim();
            return `<div class="speaker-line unknown">
                <span class="speaker-badge unknown">🟡 ${escapeHtml(speakerName)}</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else {
            // Regular line without speaker detection - check if it starts with [Speaker]
            const speakerMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (speakerMatch) {
                const speaker = speakerMatch[1];
                const text = speakerMatch[2];
                return `<div class="speaker-line generic">
                    <span class="speaker-badge generic">👤 ${escapeHtml(speaker)}</span>
                    <span class="speaker-text">${escapeHtml(text)}</span>
                </div>`;
            } else {
                // Regular line without speaker detection
                return `<div class="text-line">${escapeHtml(line)}</div>`;
            }
        }
    }).join('');
}

// Format ChatGPT conversation history - show AI suggestions from ai_suggestions field as fallback
function formatChatGPTHistory(historyJSON, aiSuggestions) {
    console.log('DEBUG: formatChatGPTHistory called with:', { 
        historyJSON: historyJSON ? 'present' : 'null', 
        aiSuggestions: aiSuggestions ? 'present' : 'null' 
    });
    
    // Try to parse chatgpt_history first
    if (historyJSON) {
        try {
            let history;
            if (typeof historyJSON === 'string') {
                history = JSON.parse(historyJSON);
            } else {
                history = historyJSON;
            }
            
            if (Array.isArray(history) && history.length > 0) {
                // Filter only assistant responses (AI suggestions) and skip system prompts
                const aiResponses = history.filter(message => message.role === 'assistant');
                
                if (aiResponses.length > 0) {
                    console.log('DEBUG: Using chatgpt_history, found', aiResponses.length, 'AI responses');
                    return aiResponses.map((message, index) => {
                        const timestamp = `Odpowiedź AI #${index + 1}`;
                        
                        return `<div class="ai-response-block">
                            <div class="response-header">
                                <span class="response-badge">🤖 ${timestamp}</span>
                            </div>
                            <div class="response-content">
                                ${formatAIResponse(message.content)}
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Error parsing ChatGPT history:', error);
        }
    }
    
    // Fallback: Use ai_suggestions field if chatgpt_history is empty or invalid
    if (aiSuggestions) {
        console.log('DEBUG: Falling back to ai_suggestions field');
        try {
            // ai_suggestions is usually a text field with suggestions separated by ---
            const blocks = aiSuggestions.split('\n---\n');
            
            if (blocks.length > 0 && blocks[0].trim() !== '') {
                return blocks.map((block, index) => {
                    const lines = block.split('\n');
                    const timestamp = lines[0]?.match(/\[(.*?)\]/)?.[1] || `Sugestia #${index + 1}`;
                    const content = lines.slice(1).join('\n').trim();
                    
                    if (content) {
                        return `<div class="ai-response-block">
                            <div class="response-header">
                                <span class="response-badge">🤖 ${escapeHtml(timestamp)}</span>
                            </div>
                            <div class="response-content">
                                <div class="ai-suggestion-content">
                                    ${escapeHtml(content).replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        </div>`;
                    }
                    return '';
                }).filter(block => block !== '').join('');
            }
        } catch (error) {
            console.error('Error parsing ai_suggestions:', error);
        }
    }
    
    // If both fail, show empty state
    console.log('DEBUG: Both chatgpt_history and ai_suggestions are empty or invalid');
    return '<div class="empty-state-message"><i class="fas fa-robot"></i>Brak sugestii AI w tej sesji<br><small>Sugestie AI pojawiają się podczas sesji na żywo</small></div>';
}

// Format AI response (try to parse JSON or show as text)
function formatAIResponse(content) {
    try {
        const parsed = JSON.parse(content);
        
        // Format as structured data
        let formatted = '<div class="ai-response-structured">';
        
        Object.keys(parsed).forEach(key => {
            const value = parsed[key];
            formatted += `<div class="response-field">
                <strong>${escapeHtml(key)}:</strong> `;
            
            if (Array.isArray(value)) {
                formatted += `<ul>`;
                value.forEach(item => {
                    formatted += `<li>${escapeHtml(item)}</li>`;
                });
                formatted += `</ul>`;
            } else {
                formatted += `<span>${escapeHtml(value)}</span>`;
            }
            
            formatted += `</div>`;
        });
        
        formatted += '</div>';
        return formatted;
        
    } catch (error) {
        // Not JSON, show as regular text
        return escapeHtml(content).replace(/\n/g, '<br>');
    }
}

// Format final summary with markdown-like formatting
function formatSummary(summary) {
    if (!summary) return '';
    
    let formatted = escapeHtml(summary);
    
    // Convert markdown-like headers
    formatted = formatted.replace(/## (.*)/g, '<h3>$1</h3>');
    formatted = formatted.replace(/### (.*)/g, '<h4>$1</h4>');
    
    // Convert line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Convert lists
    formatted = formatted.replace(/- (.*?)(<br>|$)/g, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    
    return `<div class="summary-formatted">${formatted}</div>`;
}

// Eksport funkcji dla dostępu globalnego
window.openMeetingDetails = openMeetingDetails;
window.saveMeetingNotes = saveMeetingNotes;
window.switchTab = switchTab; 