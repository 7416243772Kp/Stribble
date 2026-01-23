// Node v18+ has built-in fetch


async function testContact() {
    console.log("Testing Rate Limiter (Max 5 per 30m)...");
    
    for (let i = 1; i <= 6; i++) {
        try {
            console.log(`\n--- Request ${i} ---`);
            const response = await fetch('http://localhost:5000/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: `test${i}@example.com`,
                    message: `Rate limit test message ${i}`
                })
            });

            const data = await response.json();
            console.log(`Status: ${response.status}`);
            console.log(`Response:`, data);
            
            if (response.status === 429) {
                console.log("✅ Rate limit hit as expected!");
            }

        } catch (error) {
            console.error("Request failed:", error);
        }
    }
}

testContact();
