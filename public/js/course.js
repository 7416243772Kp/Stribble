// Ensure API_BASE is available
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Setup Year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 2. Get Course ID from URL
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get("id");

  // 3. Initialize Page
  if (courseId) {
    loadCourseDetails(courseId);
    initReviews(courseId); // Initialize reviews immediately
  } else {
    const container = document.getElementById("course-details");
    if (container) {
      container.innerHTML = "<p style='text-align:center; color:#666; margin-top:50px;'>⚠️ No course selected. URL needs ?id=...</p>";
    }
  }

  // 4. Mobile Nav Logic
  const navToggle = document.getElementById('navToggle');
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      alert('Open menu (mobile)');
    });
  }
});

// ==========================================
// CORE: LOAD COURSE DETAILS
// ==========================================
async function loadCourseDetails(courseId) {
  const courseDetailsContainer = document.getElementById("course-details");
  if (!courseDetailsContainer) return;

  try {
    const res = await fetch(`${API_BASE}/api/courses/${courseId}`);
    if (!res.ok) throw new Error(`Course fetch failed: ${res.status}`);

    const data = await res.json();
    const course = data.course || data;

    // Render HTML
    courseDetailsContainer.innerHTML = `
      <div class="course-card">
        <div style="flex:0 0 360px; max-width:360px; width:100%;">
          <div style="border-radius:12px; overflow:hidden; background:#f0f0f0;">
            <img src="${course.thumbnail || '/images/placeholder-course.png'}" 
                 alt="${(course.title || '').replace(/\"/g, '')}" 
                 style="width:100%; height:220px; object-fit:cover; display:block;" />
          </div>
        </div>
        <div class="course-info" style="flex:1">
          <h3 style="margin-top:0">${course.title}</h3>
          <p style="color:var(--muted); line-height: 1.6;">${course.description}</p>
          
          <div style="margin-top:20px; display: flex; align-items: center; gap: 20px;">
            <span class="price" style="font-weight:800; font-size: 2em; color: #0f172a;">₹${course.price}</span>
            <button id="buy-btn" style="background-color: #000; color: #fff; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background 0.2s;">
              Buy Now
            </button>
          </div>
        </div>
      </div>
    `;

    // Update Share Links
    updateShareLinks(course, window.location.href);

    // Attach Buy Button Listener
    const buyBtn = document.getElementById('buy-btn');
    if (buyBtn) {
      buyBtn.onclick = () => {
        window.location.href = `checkout.html?courseId=${course._id}`;
      };
    }

  } catch (err) {
    console.error("Error loading course:", err);
    courseDetailsContainer.innerHTML = "<p style='text-align:center; color:red;'>Failed to load course details.</p>";
  }
}

// ==========================================
// REVIEWS SYSTEM LOGIC
// ==========================================
function initReviews(courseId) {
  const listContainer = document.getElementById("reviews-list");
  const form = document.getElementById("reviewForm");
  const msgDiv = document.getElementById("rev-msg");
  const submitBtn = document.getElementById("btn-submit-review"); // New ID target

  if (!listContainer || !form || !submitBtn) {
    console.warn("Review elements not found");
    return;
  }

  // 1. Handle Manual Submission (Click instead of Submit)
  submitBtn.addEventListener("click", async () => {

    // A. Manual Validation (Since we aren't using type="submit")
    if (!form.checkValidity()) {
      form.reportValidity(); // Shows the browser's "Please fill out this field" popup
      return;
    }

    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying...";

    msgDiv.textContent = "Verifying payment and posting...";
    msgDiv.style.color = "#64748b";

    const payload = {
      courseId: courseId,
      name: document.getElementById("rev-name").value.trim(),
      email: document.getElementById("rev-email").value.trim(),
      paymentId: document.getElementById("rev-paymentId").value.trim(),
      rating: document.getElementById("rev-rating").value,
      comment: document.getElementById("rev-comment").value.trim()
    };

    try {
      const apiBase = window.API_BASE || '';
      const res = await fetch(`${apiBase}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        msgDiv.textContent = "Review posted successfully!";
        msgDiv.style.color = "#10b981"; // Green
        form.reset();
        fetchReviews(); // Reload list dynamically
      } else {
        msgDiv.textContent = data.message || "Submission failed. Check Payment ID.";
        msgDiv.style.color = "#ef4444"; // Red
      }
    } catch (err) {
      console.error("Review submit error:", err);
      msgDiv.textContent = "Server connection error. Try again.";
      msgDiv.style.color = "#ef4444";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // 2. Fetch and Render Reviews
  async function fetchReviews() {
    try {
      const apiBase = window.API_BASE || '';
      const res = await fetch(`${apiBase}/api/reviews/${courseId}`);
      const data = await res.json();

      if (data.success && data.reviews.length > 0) {
        listContainer.innerHTML = data.reviews.map(renderReviewHTML).join("");
        attachReplyListeners();
      } else {
        listContainer.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px; background:#f8fafc; border-radius:8px;">No reviews yet. Be the first to review!</p>`;
      }
    } catch (err) {
      console.error("Failed to load reviews", err);
      listContainer.innerHTML = `<p style="color:#ef4444; text-align:center;">Failed to load reviews.</p>`;
    }
  }

  // Helper: HTML Generator
  function renderReviewHTML(review) {
    const date = new Date(review.createdAt).toLocaleDateString();
    const stars = Array.from({ length: 5 }, (_, i) => i < review.rating ? '★' : '☆').join('');

    const repliesHTML = (review.replies || []).map(r => `
      <div style="margin-top:10px; padding:10px; background:#f1f5f9; border-left:3px solid #cbd5e1; border-radius:0 4px 4px 0; margin-left:20px;">
        <div style="font-size:0.85rem; font-weight:600; color:#334155;">${escapeHtml(r.name)} <span style="font-weight:400; color:#94a3b8;">• Reply</span></div>
        <div style="font-size:0.9rem; color:#475569;">${escapeHtml(r.content)}</div>
      </div>
    `).join("");

    return `
      <div class="review-card" style="background:#fff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:15px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <div>
            <strong style="font-size:1rem; color:#0f172a;">${escapeHtml(review.userName)}</strong>
            <span style="color:#10b981; font-size:0.75rem; font-weight:600; margin-left:6px; background:#ecfdf5; padding:2px 6px; border-radius:4px; border:1px solid #bbf7d0;">✓ Verified</span>
          </div>
          <span style="color:#64748b; font-size:0.85rem;">${date}</span>
        </div>
        <div style="margin-bottom:10px; color:#fbbf24; letter-spacing:2px;">${stars}</div>
        <p style="color:#334155; line-height:1.5; margin-bottom:15px;">${escapeHtml(review.comment)}</p>
        
        <button class="btn-reply" data-id="${review._id}" style="background:none; border:none; color:#3b82f6; font-size:0.85rem; cursor:pointer; padding:0; text-decoration:underline;">Reply to this review</button>
        
        <div id="reply-form-${review._id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e2e8f0;">
          <input type="text" id="reply-name-${review._id}" placeholder="Your Name" style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.9rem;">
          <textarea id="reply-content-${review._id}" placeholder="Write a reply..." style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.9rem;" rows="2"></textarea>
          <button class="btn-submit-reply btn btn--primary" data-id="${review._id}" style="padding:6px 12px; font-size:0.85rem;">Post Reply</button>
        </div>

        <div class="replies-container">${repliesHTML}</div>
      </div>
    `;
  }

  // 3. Reply Logic
  function attachReplyListeners() {
    const apiBase = window.API_BASE || '';

    document.querySelectorAll(".btn-reply").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const formDiv = document.getElementById(`reply-form-${id}`);
        if (formDiv) formDiv.style.display = formDiv.style.display === "none" ? "block" : "none";
      };
    });

    document.querySelectorAll(".btn-submit-reply").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const nameInput = document.getElementById(`reply-name-${id}`);
        const contentInput = document.getElementById(`reply-content-${id}`);

        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) {
          alert("Please fill name and content");
          return;
        }

        const originalText = btn.textContent;
        btn.textContent = "Posting...";
        btn.disabled = true;

        try {
          const res = await fetch(`${apiBase}/api/reviews/${id}/reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, content })
          });
          const data = await res.json();
          if (data.success) {
            await fetchReviews(); // Reload list
          } else {
            alert(data.message || "Failed to reply");
          }
        } catch (err) {
          alert("Error posting reply");
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      };
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  fetchReviews();
}