import fetch from 'node-fetch';

const tenantId = '94aece93-be80-4cf4-b13c-a464751394d9';
const sessionId = 'test_session_' + Date.now();

async function sendMessage() {
    console.log(`Sending message for tenant: ${tenantId}, session: ${sessionId}`);

    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Hello from backend test script " + new Date().toISOString(),
                tenantId: tenantId,
                sessionId: sessionId,
                visitorId: 'vis_test',
                userName: 'Test User',
                userEmail: 'test@example.com'
            })
        });

        console.log(`Status: ${response.status}`);

        if (response.ok) {
            console.log('Message sent successfully. Reading stream...');
            const text = await response.text();
            console.log('Response length:', text.length);
        } else {
            console.log('Failed:', await response.text());
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

sendMessage();
