// admin.js - Nowy panel administratora

console.log('🚀 Admin panel ładowany...');

let currentEditUserId = null;

// Funkcja inicjalizacji wywoływana po załadowaniu sekcji
function initAdminPanel() {
    console.log('📋 Admin panel inicjalizowany...');
    
    // Załaduj dane dla wszystkich zakładek
    loadUsers();
    loadProducts();
    loadClients();
    loadMeetings();
    
    // Ustaw handler dla formularza użytkownika
    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', handleUserSubmit);
    }
}

// Wywołaj inicjalizację od razu (sekcja już jest załadowana)
setTimeout(initAdminPanel, 100);

// Funkcje przełączania zakładek
function showTab(tabName) {
    console.log('🔄 Przełączanie na zakładkę:', tabName);
    
    // Ukryj wszystkie zakładki
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Usuń active z przycisków
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Pokaż wybraną zakładkę
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Aktywuj przycisk
    event.target.classList.add('active');
}

// === UŻYTKOWNICY ===

function loadUsers() {
    console.log('👥 Ładowanie użytkowników...');
    
    // Sprawdź czy element istnieje
    const tbody = document.getElementById('users-tbody');
    console.log('🔧 Element users-tbody:', tbody);
    
    if (!tbody) {
        console.error('❌ Element users-tbody nie znaleziony!');
        setTimeout(loadUsers, 500); // Spróbuj ponownie za 500ms
        return;
    }
    
    fetch('/api/admin/users')
        .then(response => {
            console.log('📡 Response users:', response.status);
            if (!response.ok) {
                throw new Error('Błąd pobierania użytkowników');
            }
            return response.json();
        })
        .then(users => {
            console.log('✅ Pobrano użytkowników:', users.length);
            displayUsers(users);
        })
        .catch(error => {
            console.error('❌ Błąd ładowania użytkowników:', error);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 20px; color: red;">
                            Błąd ładowania użytkowników: ${error.message}
                        </td>
                    </tr>
                `;
            }
        });
}

function displayUsers(users) {
    console.log('🔧 displayUsers wywołane z', users.length, 'użytkownikami');
    const tbody = document.getElementById('users-tbody');
    
    if (!tbody) {
        console.error('❌ Element users-tbody nie znaleziony w displayUsers!');
        return;
    }
    
    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 20px;">
                    Brak użytkowników w systemie
                </td>
            </tr>
        `;
        return;
    }
    
    console.log('🔧 Tworzenie HTML dla użytkowników...');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.first_name}</td>
            <td>${user.last_name}</td>
            <td>${user.email}</td>
            <td>${user.phone || '-'}</td>
            <td>${new Date(user.created_at).toLocaleDateString('pl-PL')}</td>
            <td>
                <button class="btn btn-edit" onclick="editUser(${user.id})">
                    <i class="fas fa-edit"></i> Edytuj
                </button>
                <button class="btn btn-danger" onclick="deleteUser(${user.id}, '${user.first_name} ${user.last_name}')">
                    <i class="fas fa-trash"></i> Usuń
                </button>
            </td>
        </tr>
    `).join('');
    
    console.log('✅ Użytkownicy wyświetleni w tabeli');
}

function showAddUserModal() {
    currentEditUserId = null;
    document.getElementById('user-modal-title').textContent = 'Dodaj użytkownika';
    document.getElementById('password-help').style.display = 'none';
    document.getElementById('user-password').required = true;
    document.getElementById('user-form').reset();
    document.getElementById('user-modal').style.display = 'block';
}

function editUser(userId) {
    console.log('✏️ Edycja użytkownika:', userId);
    
    fetch('/api/admin/users')
        .then(response => response.json())
        .then(users => {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            
            currentEditUserId = userId;
            document.getElementById('user-modal-title').textContent = 'Edytuj użytkownika';
            document.getElementById('password-help').style.display = 'block';
            document.getElementById('user-password').required = false;
            
            document.getElementById('user-firstname').value = user.first_name;
            document.getElementById('user-lastname').value = user.last_name;
            document.getElementById('user-email').value = user.email;
            document.getElementById('user-phone').value = user.phone || '';
            document.getElementById('user-password').value = '';
            
            document.getElementById('user-modal').style.display = 'block';
        })
        .catch(error => {
            console.error('Błąd pobierania danych użytkownika:', error);
            alert('Błąd pobierania danych użytkownika');
        });
}

function deleteUser(userId, userName) {
    if (!confirm(`Czy na pewno chcesz usunąć użytkownika ${userName}?`)) {
        return;
    }
    
    console.log('🗑️ Usuwanie użytkownika:', userId);
    
    fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('Użytkownik został usunięty');
            loadUsers();
        } else {
            throw new Error(result.message);
        }
    })
    .catch(error => {
        console.error('Błąd usuwania użytkownika:', error);
        alert('Błąd usuwania użytkownika: ' + error.message);
    });
}

function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
    currentEditUserId = null;
}

function handleUserSubmit(e) {
    e.preventDefault();
    
    const formData = {
        firstName: document.getElementById('user-firstname').value,
        lastName: document.getElementById('user-lastname').value,
        email: document.getElementById('user-email').value,
        phone: document.getElementById('user-phone').value,
        password: document.getElementById('user-password').value
    };
    
    console.log('💾 Zapisywanie użytkownika:', currentEditUserId ? 'edycja' : 'nowy');
    
    const url = currentEditUserId ? `/api/admin/users/${currentEditUserId}` : '/api/admin/users';
    const method = currentEditUserId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert(currentEditUserId ? 'Użytkownik zaktualizowany' : 'Użytkownik dodany');
            closeUserModal();
            loadUsers();
        } else {
            throw new Error(result.message);
        }
    })
    .catch(error => {
        console.error('Błąd zapisywania użytkownika:', error);
        alert('Błąd zapisywania użytkownika: ' + error.message);
    });
}

// === PRODUKTY ===

function loadProducts() {
    console.log('📦 Ładowanie produktów...');
    
    fetch('/api/admin/all-products')
        .then(response => {
            console.log('📡 Response products:', response.status);
            if (!response.ok) {
                throw new Error('Błąd pobierania produktów');
            }
            return response.json();
        })
        .then(products => {
            console.log('✅ Pobrano produkty:', products.length);
            displayProducts(products);
        })
        .catch(error => {
            console.error('❌ Błąd ładowania produktów:', error);
            document.getElementById('products-tbody').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: red;">
                        Błąd ładowania produktów: ${error.message}
                    </td>
                </tr>
            `;
        });
}

function displayProducts(products) {
    const tbody = document.getElementById('products-tbody');
    
    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px;">
                    Brak produktów w systemie
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.owner_name || 'Brak danych'}</td>
            <td>${product.description || '-'}</td>
            <td>${new Date(product.created_at).toLocaleDateString('pl-PL')}</td>
        </tr>
    `).join('');
}

// === KLIENCI ===

function loadClients() {
    console.log('🏢 Ładowanie klientów...');
    
    fetch('/api/admin/all-clients')
        .then(response => {
            console.log('📡 Response clients:', response.status);
            if (!response.ok) {
                throw new Error('Błąd pobierania klientów');
            }
            return response.json();
        })
        .then(clients => {
            console.log('✅ Pobrano klientów:', clients.length);
            displayClients(clients);
        })
        .catch(error => {
            console.error('❌ Błąd ładowania klientów:', error);
            document.getElementById('clients-tbody').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: red;">
                        Błąd ładowania klientów: ${error.message}
                    </td>
                </tr>
            `;
        });
}

function displayClients(clients) {
    const tbody = document.getElementById('clients-tbody');
    
    if (clients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px;">
                    Brak klientów w systemie
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = clients.map(client => `
        <tr>
            <td>${client.id}</td>
            <td>${client.name}</td>
            <td>${client.description || '-'}</td>
            <td>${client.ai_notes || '-'}</td>
            <td>${client.comment || '-'}</td>
        </tr>
    `).join('');
}

// === SPOTKANIA ===

function loadMeetings() {
    console.log('📅 Ładowanie spotkań...');
    
    fetch('/api/admin/all-meetings')
        .then(response => {
            console.log('📡 Response meetings:', response.status);
            if (!response.ok) {
                throw new Error('Błąd pobierania spotkań');
            }
            return response.json();
        })
        .then(meetings => {
            console.log('✅ Pobrano spotkania:', meetings.length);
            displayMeetings(meetings);
        })
        .catch(error => {
            console.error('❌ Błąd ładowania spotkań:', error);
            document.getElementById('meetings-tbody').innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px; color: red;">
                        Błąd ładowania spotkań: ${error.message}
                    </td>
                </tr>
            `;
        });
}

function displayMeetings(meetings) {
    const tbody = document.getElementById('meetings-tbody');
    
    if (meetings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px;">
                    Brak spotkań w systemie
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = meetings.map(meeting => `
        <tr>
            <td>${meeting.id}</td>
            <td>${meeting.client_name}</td>
            <td>${meeting.product_name}</td>
            <td>${meeting.owner_name || 'Brak danych'}</td>
            <td>${new Date(meeting.meeting_datetime).toLocaleDateString('pl-PL')}</td>
            <td>
                <button class="btn btn-primary" onclick="viewMeeting(${meeting.id})">
                    <i class="fas fa-eye"></i> Zobacz
                </button>
            </td>
        </tr>
    `).join('');
}

function viewMeeting(meetingId) {
    console.log('👁️ Podgląd spotkania:', meetingId);
    
    fetch('/api/admin/all-meetings')
        .then(response => response.json())
        .then(meetings => {
            const meeting = meetings.find(m => m.id === meetingId);
            if (!meeting) return;
            
            alert(`Szczegóły spotkania ${meetingId}:\n\nKlient: ${meeting.client_name}\nProdukt: ${meeting.product_name}\nWłaściciel: ${meeting.owner_name}\nData: ${new Date(meeting.meeting_datetime).toLocaleString('pl-PL')}\n\nTranskrypcja: ${meeting.transcription || 'Brak'}\nNotatki: ${meeting.own_notes || 'Brak'}`);
        })
        .catch(error => {
            console.error('Błąd pobierania szczegółów spotkania:', error);
            alert('Błąd pobierania szczegółów spotkania');
        });
}

// Obsługa kliknięcia poza modalem
window.onclick = function(event) {
    const modal = document.getElementById('user-modal');
    if (event.target === modal) {
        closeUserModal();
    }
}

// Eksportuj funkcje do globalnego zakresu dla onclick
window.showTab = showTab;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.showAddUserModal = showAddUserModal;
window.closeUserModal = closeUserModal;
window.viewMeeting = viewMeeting;

console.log('✅ Admin panel gotowy!'); 