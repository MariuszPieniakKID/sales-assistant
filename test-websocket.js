const WebSocket = require('ws');

console.log('🧪 Testing WebSocket connection to Railway...');

const wsUrl = 'wss://asystent-production.up.railway.app';
console.log('🔌 Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    
    // Test sending a message
    const testMessage = {
        type: 'TEST',
        message: 'Hello from test script',
        timestamp: new Date().toISOString()
    };
    
    console.log('📤 Sending test message:', testMessage);
    ws.send(JSON.stringify(testMessage));
    
    // Close after 5 seconds
    setTimeout(() => {
        console.log('🔌 Closing connection...');
        ws.close();
    }, 5000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data);
        console.log('📨 Received message:', message);
    } catch (error) {
        console.log('📨 Received raw data:', data.toString());
    }
});

ws.on('close', (code, reason) => {
    console.log('🔌 WebSocket closed:', {
        code,
        reason: reason.toString(),
        wasClean: code === 1000
    });
    process.exit(0);
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('⏰ Connection timeout');
    ws.close();
    process.exit(1);
}, 10000); 