document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const responseMsg = document.getElementById('responseMsg');
    const data = {
        email: document.getElementById('email').value,
        message: document.getElementById('message').value
    };

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        responseMsg.style.display = 'block';
        responseMsg.innerText = result.message;
        responseMsg.style.color = response.ok ? 'green' : 'red';
        
        if(response.ok) document.getElementById('contactForm').reset();
    } catch (error) {
        responseMsg.style.display = 'block';
        responseMsg.innerText = 'Something went wrong. Please try again.';
        responseMsg.style.color = 'red';
    }
});
