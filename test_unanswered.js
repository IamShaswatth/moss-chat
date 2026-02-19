import fetch from 'node-fetch';

async function main() {
    const url = 'http://localhost:3000/api/chat';
    const body = {
        message: "how many members are working in salon",
        tenantId: "d7d8d436-1b2f-4754-8915-833f215a8999",
        sessionId: "test-session-" + Date.now()
    };

    console.log('Sending query to chat API...');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // The response is a stream, so we just wait a bit or read it
        console.log(`Response status: ${response.status}`);

        // Read stream to ensure processing completes
        const reader = response.body;
        // Just consume stream
        for await (const chunk of reader) {
            // process.stdout.write(chunk.toString());
        }
        console.log('\nQuery finished.');

    } catch (error) {
        console.error('API Error:', error);
    }
}

main();
