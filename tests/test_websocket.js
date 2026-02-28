const WebSocket = require('ws');

// Get URL from command line or use default
const WS_URL = process.argv[2] || 'ws://localhost:3000';

console.log(`Testing WebSocket connection to: ${WS_URL}`);
console.log('-------------------------------------------');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    console.log(`   Connected to: ${WS_URL}`);
    
    // Send a ping
    const pingMessage = JSON.stringify({ type: 'ping' });
    ws.send(pingMessage);
    console.log('📤 Sent ping message:', pingMessage);
});

ws.on('message', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`\n📥 [${timestamp}] Received message:`);
    console.log('   Raw:', data.toString());
    
    try {
        const message = JSON.parse(data.toString());
        console.log('   Type:', message.type);
        console.log('   Data:', JSON.stringify(message.data || message, null, 2));
    } catch (err) {
        console.log('   (Not JSON format)');
    }
});

ws.on('error', (error) => {
    console.error('\n❌ WebSocket error:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
});

ws.on('close', (code, reason) => {
    console.log('\n🔌 WebSocket connection closed');
    console.log('   Code:', code);
    console.log('   Reason:', reason.toString() || 'No reason provided');
    console.log('-------------------------------------------');
    process.exit(0);
});

// Keep connection open for 30 seconds
setTimeout(() => {
    console.log('\n⏱️  Test timeout (30s), closing connection...');
    ws.close();
}, 30000);

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Interrupted by user, closing...');
    ws.close();
    process.exit(0);
});
