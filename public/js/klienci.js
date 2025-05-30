// Klienci - zarządzanie klientami
(function() {
    let clients = [];
    let products = [];
    let currentClient = null;
    let isEditing = false;

    // Elementy DOM
    const clientsGrid = document.getElementById('clientsGrid');
    const addClientBtn = document.getElementById('addClientBtn');
    const clientModal = document.getElementById('clientModal');
    const clientDetailsModal = document.getElementById('clientDetailsModal');
    const assignProductModal = document.getElementById('assignProductModal');
    const clientForm = document.getElementById('clientForm');
    const modalTitle = document.getElementById('modalTitle');
    
    // Modal controls
    const closeModal = document.getElementById('closeModal');
    const closeDetailsModal = document.getElementById('closeDetailsModal');
    const closeAssignModal = document.getElementById('closeAssignModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const cancelAssignBtn = document.getElementById('cancelAssignBtn');
    const saveBtn = document.getElementById('saveBtn');
    const saveAssignBtn = document.getElementById('saveAssignBtn');

    // Inicjalizacja
    init();

    async function init() {
        await loadClients();
        await loadProducts();
        setupEventListeners();
        renderClients();
    }

    function setupEventListeners() {
        addClientBtn.addEventListener('click', () => openModal());
        closeModal.addEventListener('click', () => closeModalHandler());
        closeDetailsModal.addEventListener('click', () => closeDetailsModalHandler());
        closeAssignModal.addEventListener('click', () => closeAssignModalHandler());
        cancelBtn.addEventListener('click', () => closeModalHandler());
        cancelAssignBtn.addEventListener('click', () => closeAssignModalHandler());
        clientForm.addEventListener('submit', handleFormSubmit);
        saveAssignBtn.addEventListener('click', handleAssignProducts);
        
        // Zamknij modal po kliknięciu w tło
        clientModal.addEventListener('click', (e) => {
            if (e.target === clientModal) closeModalHandler();
        });
        
        clientDetailsModal.addEventListener('click', (e) => {
            if (e.target === clientDetailsModal) closeDetailsModalHandler();
        });
        
        assignProductModal.addEventListener('click', (e) => {
            if (e.target === assignProductModal) closeAssignModalHandler();
        });
    }

    async function loadClients() {
        try {
            const response = await fetch('/api/clients');
            if (response.ok) {
                clients = await response.json();
            } else {
                console.error('Błąd ładowania klientów');
            }
        } catch (error) {
            console.error('Błąd ładowania klientów:', error);
        }
    }

    async function loadProducts() {
        try {
            const response = await fetch('/api/products');
            if (response.ok) {
                products = await response.json();
            } else {
                console.error('Błąd ładowania produktów');
            }
        } catch (error) {
            console.error('Błąd ładowania produktów:', error);
        }
    }

    function renderClients() {
        if (clients.length === 0) {
            clientsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>Brak klientów</h3>
                    <p>Dodaj pierwszego klienta aby rozpocząć</p>
                </div>
            `;
            return;
        }

        clientsGrid.innerHTML = clients.map(client => `
            <div class="client-card" onclick="showClientDetails(${client.id})">
                <div class="client-header">
                    <h3 class="client-title">${escapeHtml(client.name)}</h3>
                    <div class="client-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon btn-assign" onclick="assignProducts(${client.id})" title="Przypisz produkty">
                            <i class="fas fa-link"></i>
                        </button>
                        <button class="btn-icon btn-edit" onclick="editClient(${client.id})" title="Edytuj">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteClient(${client.id})" title="Usuń">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <p class="client-description">${escapeHtml(client.description)}</p>
                <div class="client-meta">
                    <span>Utworzono</span>
                    <div class="client-products">
                        <i class="fas fa-box"></i>
                        <span>0 produktów</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function openModal(client = null) {
        isEditing = !!client;
        currentClient = client;
        
        modalTitle.textContent = isEditing ? 'Edytuj klienta' : 'Dodaj nowego klienta';
        
        if (isEditing) {
            document.getElementById('clientName').value = client.name || '';
            document.getElementById('clientDescription').value = client.description || '';
            document.getElementById('clientComment').value = client.comment || '';
            document.getElementById('clientAiNotes').value = client.ai_notes || '';
        } else {
            clientForm.reset();
        }
        
        clientModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModalHandler() {
        clientModal.classList.remove('active');
        document.body.style.overflow = '';
        clientForm.reset();
        currentClient = null;
        isEditing = false;
    }

    function closeDetailsModalHandler() {
        clientDetailsModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function closeAssignModalHandler() {
        assignProductModal.classList.remove('active');
        document.body.style.overflow = '';
        currentClient = null;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(clientForm);
        const data = Object.fromEntries(formData);
        
        const btnText = saveBtn.querySelector('.btn-text');
        const spinner = saveBtn.querySelector('.spinner');
        
        // Pokaż spinner
        btnText.style.display = 'none';
        spinner.style.display = 'block';
        saveBtn.disabled = true;

        try {
            const url = isEditing ? `/api/clients/${currentClient.id}` : '/api/clients';
            const method = isEditing ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                await loadClients();
                renderClients();
                closeModalHandler();
                showNotification(isEditing ? 'Klient zaktualizowany!' : 'Klient dodany!', 'success');
            } else {
                showNotification(result.message || 'Wystąpił błąd', 'error');
            }
        } catch (error) {
            console.error('Błąd zapisywania klienta:', error);
            showNotification('Błąd połączenia z serwerem', 'error');
        } finally {
            // Ukryj spinner
            btnText.style.display = 'block';
            spinner.style.display = 'none';
            saveBtn.disabled = false;
        }
    }

    window.editClient = function(clientId) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            openModal(client);
        }
    };

    window.deleteClient = async function(clientId) {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        if (confirm(`Czy na pewno chcesz usunąć klienta "${client.name}"?`)) {
            try {
                const response = await fetch(`/api/clients/${clientId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.success) {
                    await loadClients();
                    renderClients();
                    showNotification('Klient usunięty!', 'success');
                } else {
                    showNotification(result.message || 'Wystąpił błąd', 'error');
                }
            } catch (error) {
                console.error('Błąd usuwania klienta:', error);
                showNotification('Błąd połączenia z serwerem', 'error');
            }
        }
    };

    window.assignProducts = function(clientId) {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        currentClient = client;
        
        // Renderuj listę produktów z checkboxami
        const assignProductsList = document.getElementById('assignProductsList');
        
        if (products.length === 0) {
            assignProductsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box"></i>
                    <h3>Brak produktów</h3>
                    <p>Najpierw dodaj produkty aby móc je przypisać</p>
                </div>
            `;
        } else {
            assignProductsList.innerHTML = products.map(product => `
                <label class="product-checkbox">
                    <input type="checkbox" value="${product.id}" data-product-id="${product.id}">
                    <div class="product-checkbox-content">
                        <div class="product-checkbox-title">${escapeHtml(product.name)}</div>
                        <div class="product-checkbox-desc">${escapeHtml(product.description)}</div>
                    </div>
                </label>
            `).join('');
        }

        assignProductModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    async function handleAssignProducts() {
        if (!currentClient) return;

        const checkboxes = document.querySelectorAll('#assignProductsList input[type="checkbox"]:checked');
        const selectedProductIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

        const btnText = saveAssignBtn.querySelector('.btn-text');
        const spinner = saveAssignBtn.querySelector('.spinner');
        
        // Pokaż spinner
        btnText.style.display = 'none';
        spinner.style.display = 'block';
        saveAssignBtn.disabled = true;

        try {
            // Tu będzie API do przypisywania produktów - na razie tylko symulacja
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            closeAssignModalHandler();
            showNotification(`Przypisano ${selectedProductIds.length} produktów do klienta!`, 'success');
        } catch (error) {
            console.error('Błąd przypisywania produktów:', error);
            showNotification('Błąd połączenia z serwerem', 'error');
        } finally {
            // Ukryj spinner
            btnText.style.display = 'block';
            spinner.style.display = 'none';
            saveAssignBtn.disabled = false;
        }
    }

    window.showClientDetails = function(clientId) {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const detailsContent = document.getElementById('clientDetails');
        detailsContent.innerHTML = `
            <div class="client-tabs">
                <button class="tab-button active" onclick="switchTab('info')">Informacje</button>
                <button class="tab-button" onclick="switchTab('products')">Produkty</button>
                <button class="tab-button" onclick="switchTab('meetings')">Spotkania</button>
            </div>
            
            <div class="tab-content active" id="info-tab">
                <div class="client-detail">
                    <h4>Nazwa klienta</h4>
                    <p>${escapeHtml(client.name)}</p>
                </div>
                <div class="client-detail">
                    <h4>Opis</h4>
                    <p>${escapeHtml(client.description)}</p>
                </div>
                ${client.comment ? `
                    <div class="client-detail">
                        <h4>Komentarz</h4>
                        <p>${escapeHtml(client.comment)}</p>
                    </div>
                ` : ''}
                ${client.ai_notes ? `
                    <div class="client-detail">
                        <h4>Uwagi AI</h4>
                        <p>${escapeHtml(client.ai_notes)}</p>
                    </div>
                ` : ''}
                <div class="client-actions-detail">
                    <button class="btn btn-success" onclick="assignProducts(${client.id}); closeDetailsModalHandler();">
                        <i class="fas fa-link"></i>
                        Przypisz produkty
                    </button>
                    <button class="btn btn-primary" onclick="editClient(${client.id}); closeDetailsModalHandler();">
                        <i class="fas fa-edit"></i>
                        Edytuj
                    </button>
                    <button class="btn btn-danger" onclick="deleteClient(${client.id}); closeDetailsModalHandler();">
                        <i class="fas fa-trash"></i>
                        Usuń
                    </button>
                </div>
            </div>
            
            <div class="tab-content" id="products-tab">
                <div class="empty-state">
                    <i class="fas fa-box"></i>
                    <h3>Brak przypisanych produktów</h3>
                    <p>Przypisz produkty do tego klienta</p>
                </div>
            </div>
            
            <div class="tab-content" id="meetings-tab">
                <div class="empty-state">
                    <i class="fas fa-calendar-alt"></i>
                    <h3>Brak spotkań</h3>
                    <p>Nie ma jeszcze spotkań z tym klientem</p>
                </div>
            </div>
        `;

        clientDetailsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    window.switchTab = function(tabName) {
        // Usuń aktywne klasy
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Dodaj aktywne klasy
        event.target.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    };

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showNotification(message, type = 'info') {
        // Usuń poprzednie powiadomienia
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Automatycznie usuń po 3 sekundach
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Dodaj style dla powiadomień
    const notificationStyles = document.createElement('style');
    notificationStyles.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 3000;
            animation: slideIn 0.3s ease-out;
        }
        
        .notification-success {
            background: #10b981;
        }
        
        .notification-error {
            background: #ef4444;
        }
        
        .notification-info {
            background: #3b82f6;
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(notificationStyles);
})(); 