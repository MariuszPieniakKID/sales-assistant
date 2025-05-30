// Produkty - zarządzanie produktami
(function() {
    let products = [];
    let currentProduct = null;
    let isEditing = false;

    // Elementy DOM
    const productsGrid = document.getElementById('productsGrid');
    const addProductBtn = document.getElementById('addProductBtn');
    const productModal = document.getElementById('productModal');
    const productDetailsModal = document.getElementById('productDetailsModal');
    const productForm = document.getElementById('productForm');
    const modalTitle = document.getElementById('modalTitle');
    const closeModal = document.getElementById('closeModal');
    const closeDetailsModal = document.getElementById('closeDetailsModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const saveBtn = document.getElementById('saveBtn');

    // Funkcja pomocnicza do fetch z automatycznym sprawdzaniem sesji
    async function fetchWithAuth(url, options = {}) {
        try {
            const response = await fetch(url, options);
            
            if (response.status === 401) {
                console.log('❌ API zwróciło 401 - sesja wygasła w produkty.js');
                window.location.href = '/login';
                return null;
            }
            
            if (response.ok && response.url.includes('/login')) {
                console.log('❌ Otrzymano przekierowanie do /login w produkty.js');
                window.location.href = '/login';
                return null;
            }
            
            return response;
        } catch (error) {
            console.error('❌ Błąd fetchWithAuth w produkty.js:', error);
            throw error;
        }
    }

    // Inicjalizacja
    init();

    async function init() {
        await loadProducts();
        setupEventListeners();
        renderProducts();
    }

    function setupEventListeners() {
        addProductBtn.addEventListener('click', () => openModal());
        closeModal.addEventListener('click', () => closeModalHandler());
        closeDetailsModal.addEventListener('click', () => closeDetailsModalHandler());
        cancelBtn.addEventListener('click', () => closeModalHandler());
        productForm.addEventListener('submit', handleFormSubmit);
        
        // Zamknij modal po kliknięciu w tło
        productModal.addEventListener('click', (e) => {
            if (e.target === productModal) closeModalHandler();
        });
        
        productDetailsModal.addEventListener('click', (e) => {
            if (e.target === productDetailsModal) closeDetailsModalHandler();
        });
    }

    async function loadProducts() {
        try {
            console.log('📥 Ładowanie produktów w produkty.js...');
            const response = await fetchWithAuth('/api/products');
            
            if (!response) {
                // fetchWithAuth już obsłużył przekierowanie
                return;
            }
            
            if (response.ok) {
                products = await response.json();
                console.log('✅ Załadowano produktów:', products.length);
            } else {
                console.error('❌ Błąd ładowania produktów - HTTP', response.status);
            }
        } catch (error) {
            console.error('❌ Błąd ładowania produktów:', error);
        }
    }

    function renderProducts() {
        if (products.length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box"></i>
                    <h3>Brak produktów</h3>
                    <p>Dodaj pierwszy produkt aby rozpocząć</p>
                </div>
            `;
            return;
        }

        productsGrid.innerHTML = products.map(product => `
            <div class="product-card" onclick="showProductDetails(${product.id})">
                <div class="product-header">
                    <h3 class="product-title">${escapeHtml(product.name)}</h3>
                    <div class="product-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon btn-edit" onclick="editProduct(${product.id})" title="Edytuj">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteProduct(${product.id})" title="Usuń">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <p class="product-description">${escapeHtml(product.description)}</p>
                <div class="product-meta">
                    <span>${formatDate(product.created_at)}</span>
                    <div class="product-files">
                        <i class="fas fa-paperclip"></i>
                        <span>0 plików</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function openModal(product = null) {
        isEditing = !!product;
        currentProduct = product;
        
        modalTitle.textContent = isEditing ? 'Edytuj produkt' : 'Dodaj nowy produkt';
        
        if (isEditing) {
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productComment').value = product.comment || '';
        } else {
            productForm.reset();
        }
        
        productModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModalHandler() {
        productModal.classList.remove('active');
        document.body.style.overflow = '';
        productForm.reset();
        currentProduct = null;
        isEditing = false;
    }

    function closeDetailsModalHandler() {
        productDetailsModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(productForm);
        const btnText = saveBtn.querySelector('.btn-text');
        const spinner = saveBtn.querySelector('.spinner');
        
        // Pokaż spinner
        btnText.style.display = 'none';
        spinner.style.display = 'block';
        saveBtn.disabled = true;

        try {
            const url = isEditing ? `/api/products/${currentProduct.id}` : '/api/products';
            const method = isEditing ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                await loadProducts();
                renderProducts();
                closeModalHandler();
                showNotification(isEditing ? 'Produkt zaktualizowany!' : 'Produkt dodany!', 'success');
            } else {
                showNotification(result.message || 'Wystąpił błąd', 'error');
            }
        } catch (error) {
            console.error('Błąd zapisywania produktu:', error);
            showNotification('Błąd połączenia z serwerem', 'error');
        } finally {
            // Ukryj spinner
            btnText.style.display = 'block';
            spinner.style.display = 'none';
            saveBtn.disabled = false;
        }
    }

    window.editProduct = function(productId) {
        const product = products.find(p => p.id === productId);
        if (product) {
            openModal(product);
        }
    };

    window.deleteProduct = async function(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        if (confirm(`Czy na pewno chcesz usunąć produkt "${product.name}"?`)) {
            try {
                const response = await fetch(`/api/products/${productId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.success) {
                    await loadProducts();
                    renderProducts();
                    showNotification('Produkt usunięty!', 'success');
                } else {
                    showNotification(result.message || 'Wystąpił błąd', 'error');
                }
            } catch (error) {
                console.error('Błąd usuwania produktu:', error);
                showNotification('Błąd połączenia z serwerem', 'error');
            }
        }
    };

    window.showProductDetails = function(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const detailsContent = document.getElementById('productDetails');
        detailsContent.innerHTML = `
            <div class="product-detail">
                <h4>Nazwa produktu</h4>
                <p>${escapeHtml(product.name)}</p>
            </div>
            <div class="product-detail">
                <h4>Opis</h4>
                <p>${escapeHtml(product.description)}</p>
            </div>
            ${product.comment ? `
                <div class="product-detail">
                    <h4>Komentarz</h4>
                    <p>${escapeHtml(product.comment)}</p>
                </div>
            ` : ''}
            <div class="product-detail">
                <h4>Data utworzenia</h4>
                <p>${formatDate(product.created_at)}</p>
            </div>
            <div class="product-actions-detail">
                <button class="btn btn-primary" onclick="editProduct(${product.id}); closeDetailsModalHandler();">
                    <i class="fas fa-edit"></i>
                    Edytuj
                </button>
                <button class="btn btn-danger" onclick="deleteProduct(${product.id}); closeDetailsModalHandler();">
                    <i class="fas fa-trash"></i>
                    Usuń
                </button>
            </div>
        `;

        productDetailsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
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
        
        .product-detail {
            margin-bottom: 20px;
        }
        
        .product-detail h4 {
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .product-detail p {
            color: #1e293b;
            line-height: 1.6;
        }
        
        .product-actions-detail {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }
    `;
    document.head.appendChild(notificationStyles);
})(); 