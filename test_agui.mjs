// Quick test to verify AG-UI events
const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        message: 'what services do you offer',
        tenantId: 'd7d8d436-1b2f-4754-8915-833f215a8999',
        sessionId: 'test_agui_2',
        visitorId: 'test'
    })
});

const text = await res.text();
const lines = text.split('\n').filter(l => l.startsWith('data:'));

console.log(`Total AG-UI events: ${lines.length}\n`);

for (const line of lines) {
    try {
        const data = JSON.parse(line.slice(6));
        const summary = data.delta ? data.delta.substring(0, 80) : '';
        console.log(`  ${data.type}${data.runId ? ' runId=' + data.runId.substring(0, 8) : ''}${data.messageId ? ' msgId=' + data.messageId.substring(0, 8) : ''}${data.stepName ? ' step=' + data.stepName : ''} ${summary}`);
    } catch (e) { }
}
