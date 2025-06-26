// Szczegóły spotkania - dedykowana strona
let meetingId = null;
let meetingData = null;

// Inicjalizacja strony
document.addEventListener('DOMContentLoaded', function() {
    // Pobierz ID spotkania z URL
    const urlParams = new URLSearchParams(window.location.search);
    meetingId = urlParams.get('id');
    
    if (!meetingId) {
        showError('Brak ID spotkania w URL');
        return;
    }
    
    // Załaduj szczegóły spotkania
    loadMeetingDetails();
});

// Ładowanie szczegółów spotkania
async function loadMeetingDetails() {
    try {
        console.log('Ładowanie szczegółów spotkania ID:', meetingId);
        
        const response = await fetch(`/api/sales/${meetingId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        meetingData = await response.json();
        console.log('Dane spotkania załadowane:', meetingData);
        
        // Renderuj dane
        renderMeetingHeader();
        renderTranscription();
        renderAISuggestions();
        renderSummary();
        
    } catch (error) {
        console.error('Błąd ładowania szczegółów spotkania:', error);
        showError('Nie udało się załadować szczegółów spotkania: ' + error.message);
    }
}

// Renderowanie nagłówka spotkania
function renderMeetingHeader() {
    const titleElement = document.getElementById('meetingTitle');
    const metaElement = document.getElementById('meetingMeta');
    
    const clientName = meetingData.client_name || 'Nieznany klient';
    const meetingDate = new Date(meetingData.created_at).toLocaleString('pl-PL');
    const duration = meetingData.duration ? `${Math.round(meetingData.duration / 60)} min` : 'Nieznany czas';
    
    titleElement.textContent = `Spotkanie z ${clientName}`;
    metaElement.innerHTML = `
        <i class="fas fa-calendar"></i> ${meetingDate} &nbsp;&nbsp;
        <i class="fas fa-clock"></i> ${duration} &nbsp;&nbsp;
        <i class="fas fa-user"></i> ${clientName}
    `;
}

// Renderowanie transkrypcji
function renderTranscription() {
    const transcriptionElement = document.getElementById('transcriptionContent');
    
    if (!meetingData.transcription || meetingData.transcription.trim() === '') {
        transcriptionElement.innerHTML = `
            <div class="empty-state-message">
                <i class="fas fa-microphone-slash"></i>
                <h3>Brak transkrypcji</h3>
                <p>Transkrypcja nie jest dostępna dla tego spotkania</p>
            </div>
        `;
        return;
    }
    
    console.log('Renderowanie transkrypcji, długość:', meetingData.transcription.length);
    
    const formattedTranscription = formatTranscriptionFullscreen(meetingData.transcription);
    transcriptionElement.innerHTML = formattedTranscription;
    
    // Scroll do góry
    transcriptionElement.scrollTop = 0;
}

// Formatowanie transkrypcji dla pełnoekranowego widoku
function formatTranscriptionFullscreen(transcription) {
    if (!transcription || transcription.trim() === '') {
        return '<div class="empty-state-message"><i class="fas fa-microphone-slash"></i>Brak transkrypcji</div>';
    }
    
    console.log('DEBUG: formatTranscriptionFullscreen input length:', transcription.length);
    
    // Podziel transkrypcję na linie
    const lines = transcription.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
        return '<div class="empty-state-message"><i class="fas fa-microphone-slash"></i>Transkrypcja jest pusta</div>';
    }
    
    return lines.map(line => {
        const trimmedLine = line.trim();
        
        // Sprawdź czy linia zawiera znacznik roli
        if (trimmedLine.includes('🔵') || trimmedLine.includes('🔴') || trimmedLine.includes('🟡')) {
            // Linia z rolą mówcy
            let role = 'unknown';
            let badgeText = '🟡 NIEZNANY';
            let text = trimmedLine;
            
            if (trimmedLine.includes('🔵')) {
                role = 'salesperson';
                badgeText = '🔵 SPRZEDAWCA';
                text = trimmedLine.replace(/🔵[^:]*:?\s*/, '');
            } else if (trimmedLine.includes('🔴')) {
                role = 'client';
                badgeText = '🔴 KLIENT';
                text = trimmedLine.replace(/🔴[^:]*:?\s*/, '');
            } else if (trimmedLine.includes('🟡')) {
                role = 'unknown';
                badgeText = '🟡 NIEZNANY';
                text = trimmedLine.replace(/🟡[^:]*:?\s*/, '');
            }
            
            return `
                <div class="speaker-line-fullscreen">
                    <div class="speaker-badge-fullscreen ${role}">
                        ${escapeHtml(badgeText)}
                    </div>
                    <div class="speaker-text-fullscreen">
                        ${escapeHtml(text)}
                    </div>
                </div>
            `;
        } else {
            // Linia bez znacznika roli - traktuj jako tekst ogólny
            return `
                <div class="speaker-line-fullscreen">
                    <div class="speaker-badge-fullscreen unknown">
                        🟡 NIEZNANY
                    </div>
                    <div class="speaker-text-fullscreen">
                        ${escapeHtml(trimmedLine)}
                    </div>
                </div>
            `;
        }
    }).join('');
}

// Renderowanie sugestii AI
function renderAISuggestions() {
    const aiSuggestionsElement = document.getElementById('aiSuggestionsContent');
    
    console.log('DEBUG: renderAISuggestions called');
    console.log('chatgpt_history:', meetingData.chatgpt_history ? 'present' : 'null');
    console.log('ai_suggestions:', meetingData.ai_suggestions ? 'present' : 'null');
    
    const formattedSuggestions = formatChatGPTHistoryFullscreen(
        meetingData.chatgpt_history, 
        meetingData.ai_suggestions
    );
    
    aiSuggestionsElement.innerHTML = formattedSuggestions;
    aiSuggestionsElement.scrollTop = 0;
}

// Formatowanie historii ChatGPT dla pełnoekranowego widoku
function formatChatGPTHistoryFullscreen(historyJSON, aiSuggestions) {
    console.log('DEBUG: formatChatGPTHistoryFullscreen called');
    
    // Spróbuj najpierw chatgpt_history
    if (historyJSON) {
        try {
            let history;
            if (typeof historyJSON === 'string') {
                history = JSON.parse(historyJSON);
            } else {
                history = historyJSON;
            }
            
            if (Array.isArray(history) && history.length > 0) {
                const aiResponses = history.filter(message => message.role === 'assistant');
                
                if (aiResponses.length > 0) {
                    console.log('DEBUG: Using chatgpt_history, found', aiResponses.length, 'AI responses');
                    return aiResponses.map((message, index) => {
                        const timestamp = `Odpowiedź AI #${index + 1}`;
                        
                        return `
                            <div class="ai-response-block-fullscreen">
                                <div class="response-badge-fullscreen">
                                    🤖 ${escapeHtml(timestamp)}
                                </div>
                                <div class="response-content-fullscreen">
                                    ${formatAIResponseFullscreen(message.content)}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Error parsing ChatGPT history:', error);
        }
    }
    
    // Fallback: Użyj ai_suggestions
    if (aiSuggestions) {
        console.log('DEBUG: Falling back to ai_suggestions field');
        try {
            const blocks = aiSuggestions.split('\n---\n');
            
            if (blocks.length > 0 && blocks[0].trim() !== '') {
                return blocks.map((block, index) => {
                    const lines = block.split('\n');
                    const timestamp = lines[0]?.match(/\[(.*?)\]/)?.[1] || `Sugestia #${index + 1}`;
                    const content = lines.slice(1).join('\n').trim();
                    
                    if (content) {
                        return `
                            <div class="ai-response-block-fullscreen">
                                <div class="response-badge-fullscreen">
                                    🤖 ${escapeHtml(timestamp)}
                                </div>
                                <div class="response-content-fullscreen">
                                    ${escapeHtml(content).replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        `;
                    }
                    return '';
                }).filter(block => block !== '').join('');
            }
        } catch (error) {
            console.error('Error parsing ai_suggestions:', error);
        }
    }
    
    // Jeśli oba nie działają
    console.log('DEBUG: Both chatgpt_history and ai_suggestions are empty or invalid');
    return `
        <div class="empty-state-message">
            <i class="fas fa-robot"></i>
            <h3>Brak sugestii AI</h3>
            <p>Sugestie AI nie są dostępne dla tego spotkania<br>
            <small>Sugestie AI pojawiają się podczas sesji na żywo</small></p>
        </div>
    `;
}

// Formatowanie odpowiedzi AI dla pełnoekranowego widoku
function formatAIResponseFullscreen(content) {
    if (!content) return '';
    
    try {
        // Spróbuj sparsować jako JSON
        const parsed = JSON.parse(content);
        
        let formatted = '';
        
        if (parsed.czy_kompletna) {
            formatted += `<div class="ai-field"><strong>Status:</strong> ${escapeHtml(parsed.czy_kompletna)}</div>`;
        }
        
        if (parsed.akcja) {
            formatted += `<div class="ai-field"><strong>Akcja:</strong> ${escapeHtml(parsed.akcja)}</div>`;
        }
        
        if (parsed.sugestie && Array.isArray(parsed.sugestie)) {
            formatted += `<div class="ai-field"><strong>Sugestie:</strong></div>`;
            formatted += '<ul>';
            parsed.sugestie.forEach(suggestion => {
                formatted += `<li>${escapeHtml(suggestion)}</li>`;
            });
            formatted += '</ul>';
        }
        
        if (parsed.uwagi) {
            formatted += `<div class="ai-field"><strong>Uwagi:</strong> ${escapeHtml(parsed.uwagi)}</div>`;
        }
        
        return formatted || escapeHtml(content);
        
    } catch (error) {
        // Jeśli nie jest JSONem, wyświetl jako tekst
        return escapeHtml(content).replace(/\n/g, '<br>');
    }
}

// Renderowanie podsumowania
function renderSummary() {
    const summaryElement = document.getElementById('summaryContent');
    
    if (!meetingData.final_summary || meetingData.final_summary.trim() === '') {
        summaryElement.innerHTML = `
            <div class="empty-state-message">
                <i class="fas fa-chart-bar"></i>
                <h3>Brak podsumowania</h3>
                <p>Podsumowanie nie jest dostępne dla tego spotkania<br>
                <small>Podsumowania są generowane automatycznie na końcu sesji</small></p>
            </div>
        `;
        return;
    }
    
    const formattedSummary = formatSummaryFullscreen(meetingData.final_summary);
    summaryElement.innerHTML = formattedSummary;
    summaryElement.scrollTop = 0;
}

// Formatowanie podsumowania dla pełnoekranowego widoku
function formatSummaryFullscreen(summary) {
    if (!summary) return '';
    
    // Podstawowe formatowanie tekstu
    let formatted = escapeHtml(summary);
    
    // Formatowanie list
    formatted = formatted.replace(/\*\s+(.+)/g, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Formatowanie nagłówków
    formatted = formatted.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // Formatowanie pogrubienia
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Formatowanie nowych linii
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Funkcje pomocnicze
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    console.error('Error:', message);
    
    // Wyświetl błąd w głównym kontenerze
    const container = document.querySelector('.meeting-details-page');
    if (container) {
        container.innerHTML = `
            <div class="meeting-header">
                <a href="../dashboard.html#spotkania" class="back-button">
                    <i class="fas fa-arrow-left"></i> Powrót do listy spotkań
                </a>
                <h1 class="meeting-title">Błąd ładowania spotkania</h1>
            </div>
            <div class="content-section">
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Wystąpił błąd</h3>
                    <p>${escapeHtml(message)}</p>
                </div>
            </div>
        `;
    }
} 