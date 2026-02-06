document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject Modal and Styles immediately
    injectReviewModal();

    // 2. Set Year
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // 3. Check Session
    checkSession();
});

// Reuse API_BASE
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

// --- 1. CORE RENDER LOGIC ---

async function checkSession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`);
        const data = await res.json();
        
        if (data.success && data.user) {
            console.log("User loaded:", data.user);
            renderPage(data.user);
        } else {
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
    if (authUI) {
        authUI.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <a href="index.html" class="btn btn--ghost">Browse</a>
                <button id="btn-logout" class="btn btn--outline">Logout</button>
            </div>
        `;
        document.getElementById('btn-logout').addEventListener('click', logout);
    }

    if (welcome) welcome.textContent = `Logged in as ${user.name}`;
    if (loading) loading.style.display = "none";

    const courses = user.purchasedCourses || [];
    // Ensure reviewedCourses is an array of strings for comparison
    const reviewedIds = (user.reviewedCourses || []).map(r => (r._id || r).toString());

    if (courses.length === 0) {
        if (empty) empty.style.display = "block";
        if (grid) grid.style.display = "none";
    } else {
        if (empty) empty.style.display = "none";
        if (grid) {
            grid.style.display = "grid";
            
            // Generate HTML
            grid.innerHTML = courses.map(course => {
                if (typeof course !== 'object') return ''; 

                const thumb = course.thumbnail && (course.thumbnail.startsWith('http') || course.thumbnail.startsWith('//'))
                    ? course.thumbnail 
                    : (API_BASE + (course.thumbnail || '/images/placeholder-course.png'));

                const isReviewed = reviewedIds.includes(course._id.toString());
                
                // CSP FIX: No 'onclick'. We use a class 'js-open-review' and data-attribute.
                const reviewBtn = isReviewed 
                    ? `<span class="reviewed-badge">✓ Reviewed</span>` 
                    : `<button class="btn-write-review js-open-review" data-id="${course._id}" data-title="${(course.title || '').replace(/"/g, '&quot;')}">⭐ Write Review</button>`;

                return `
                <div class="my-course-item">
                    <img src="${thumb}" alt="${course.title}" loading="lazy" />
                    <div class="my-course-content">
                        <h3>${course.title}</h3>
                        <div class="actions">
                            <a href="/read?id=${course._id}" class="btn-read">📖 Start Reading</a>
                            ${reviewBtn}
                        </div>
                    </div>
                </div>
                `;
            }).join('');

            // CSP FIX: Attach Event Listeners AFTER adding to DOM
            document.querySelectorAll('.js-open-review').forEach(btn => {
                console.log('Attaching click listener to review button:', btn);
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const courseId = e.currentTarget.getAttribute('data-id');
                    const courseTitle = e.currentTarget.getAttribute('data-title');
                    console.log('Review button clicked for course:', courseId, courseTitle);
                    openReviewModal(courseId, courseTitle);
                });
            });
        }
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

// --- 2. REVIEW MODAL LOGIC & INJECTION ---

function injectReviewModal() {
    // 1. Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        }
        .modal-content {
            background: white; padding: 25px; border-radius: 12px;
            width: 90%; max-width: 400px; position: relative;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .close-modal {
            position: absolute; right: 15px; top: 10px; font-size: 24px; cursor: pointer; color: #64748b;
        }
        .close-modal:hover { color: #000; }
        .star-rating {
            display: flex; flex-direction: row-reverse; justify-content: flex-end; gap: 5px;
        }
        .star-rating input { display: none; }
        .star-rating label { font-size: 24px; color: #ccc; cursor: pointer; transition: color 0.2s; }
        .star-rating input:checked ~ label,
        .star-rating label:hover,
        .star-rating label:hover ~ label { color: #fbbf24; }
    `;
    document.head.appendChild(style);

    // 2. Inject HTML
    const modalDiv = document.createElement('div');
    modalDiv.id = 'review-modal';
    modalDiv.className = 'modal-overlay';
    modalDiv.style.display = 'none';
    modalDiv.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" id="btn-close-modal">&times;</span>
            <h3 style="margin-top:0;">Write a Review</h3>
            <form id="review-form">
                <input type="hidden" id="review-course-id">
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display:block; font-weight:600; margin-bottom:5px;">Rate the Course</label>
                    <div class="star-rating">
                        <input type="radio" id="star5" name="rating" value="5" /><label for="star5" title="5 stars">★</label>
                        <input type="radio" id="star4" name="rating" value="4" /><label for="star4" title="4 stars">★</label>
                        <input type="radio" id="star3" name="rating" value="3" /><label for="star3" title="3 stars">★</label>
                        <input type="radio" id="star2" name="rating" value="2" /><label for="star2" title="2 stars">★</label>
                        <input type="radio" id="star1" name="rating" value="1" /><label for="star1" title="1 star">★</label>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label for="review-comment" style="display:block; font-weight:600; margin-bottom:5px;">Your Review about this Course</label>
                    <textarea id="review-comment" rows="4" placeholder="Share your experience with this course..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;"></textarea>
                </div>

                <button type="submit" class="btn btn--primary" style="width: 100%; padding: 10px; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Submit Review</button>
            </form>
        </div>
    `;
    document.body.appendChild(modalDiv);

    // 3. Attach Modal Event Listeners
    document.getElementById('btn-close-modal').addEventListener('click', closeReviewModal);
    
    // Close on clicking outside
    modalDiv.addEventListener('click', (e) => {
        if (e.target === modalDiv) closeReviewModal();
    });

    // Handle Form Submit
    document.getElementById('review-form').addEventListener('submit', submitReview);
}

function openReviewModal(courseId) {
    console.log("openReviewModal called with courseId:", courseId);
    const courseIdInput = document.getElementById('review-course-id');
    const modal = document.getElementById('review-modal');
    console.log("review-course-id element:", courseIdInput);
    console.log("review-modal element:", modal);
    
    if (courseIdInput && modal) {
        courseIdInput.value = courseId;
        modal.style.display = 'flex';
        console.log("Modal opened successfully");
    } else {
        console.error("Modal elements not found!");
    }
}

function closeReviewModal() {
    document.getElementById('review-modal').style.display = 'none';
    document.getElementById('review-form').reset();
}

async function submitReview(e) {
    e.preventDefault();
    const courseId = document.getElementById('review-course-id').value;
    const comment = document.getElementById('review-comment').value;
    
    // Get Rating
    const ratingEl = document.querySelector('input[name="rating"]:checked');
    if (!ratingEl) return alert("Please select a star rating");
    const rating = ratingEl.value;

    try {
        const res = await fetch(`${API_BASE}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, rating, comment })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert("Review submitted successfully!");
            closeReviewModal();
            location.reload(); // Reloads page to update the button to "Reviewed"
        } else {
            alert(data.message || "Failed to submit review");
        }
    } catch (err) {
        console.error(err);
        alert("Error submitting review");
    }
}
