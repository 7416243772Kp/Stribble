document.addEventListener("DOMContentLoaded", () => {
    // Set Year
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    checkSession();
});

// Reuse API_BASE from settings or default
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

async function checkSession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`);
        const data = await res.json();
        
        if (data.success && data.user) {
            renderPage(data.user);
        } else {
            // Not logged in -> Redirect to login or home
             window.location.href = "/?login=true";
        }
    } catch (e) {
        console.error("Session check failed", e);
        window.location.href = "/";
    }
}

function renderPage(user) {
    const authUI = document.getElementById("auth-ui");
    const grid = document.getElementById("courses-grid");
    const loading = document.getElementById("loading");
    const empty = document.getElementById("empty-state");
    const welcome = document.getElementById("user-welcome");

    // Header UI
    authUI.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <a href="index.html" class="btn btn--ghost">Browse</a>
            <button onclick="logout()" class="btn btn--outline">Logout</button>
        </div>
    `;

    welcome.textContent = `Logged in as ${user.name}`;
    loading.style.display = "none";

    const courses = user.purchasedCourses || [];

    if (courses.length === 0) {
        empty.style.display = "block";
        grid.style.display = "none";
    } else {
        empty.style.display = "none";
        grid.style.display = "grid";
        
        grid.innerHTML = courses.map(course => {
            // Handle if course is just ID (should not happen if populated)
            if (typeof course !== 'object') return ''; 

            // Fix thumbnail safety
            const thumb = course.thumbnail && (course.thumbnail.startsWith('http') || course.thumbnail.startsWith('//'))
                ? course.thumbnail 
                : (API_BASE + (course.thumbnail || '/images/placeholder-course.png'));

            return `
            <div class="my-course-card">
                <div class="my-course-media">
                    <img src="${thumb}" alt="${course.title}" loading="lazy" />
                </div>
                <div class="my-course-body">
                    <h3 class="my-course-title">${course.title}</h3>
                    <p class="my-course-desc">
                        ${course.description || "No description available for this course."}
                    </p>
                    <div class="my-course-actions">
                        <a href="/read?id=${course._id}" class="btn-start-reading">
                             Start Reading
                        </a>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        window.location.href = "/";
    } catch (e) {
        window.location.href = "/";
    }
}
window.logout = logout;


