// Ensure API_BASE is available
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Setup Year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 2. Get Course ID from URL
  // 2. Get Course ID from URL
  const params = new URLSearchParams(window.location.search);
  let courseId = params.get("id");

  // Fallback: Try to get ID from path "/course/:id"
  if (!courseId) {
    const pathParts = window.location.pathname.split('/');
    // Filter out empty strings to handle trailing slashes
    const segments = pathParts.filter(p => p.trim() !== "");
    // If the path is like /course/123, the last segment should be the ID
    if (segments.length >= 2 && segments[segments.length - 2] === 'course') {
       courseId = segments[segments.length - 1];
    }
  }

  // 3. Initialize Page
  if (courseId) {
    loadCourseDetails(courseId);

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
    // Parallel fetch: Course Details + User Session
    const [courseRes, userRes] = await Promise.all([
      fetch(`${API_BASE}/api/courses/${courseId}`),
      fetch(`${API_BASE}/auth/me`)
    ]);

    if (!courseRes.ok) throw new Error(`Course fetch failed: ${courseRes.status}`);

    const courseData = await courseRes.json();
    const course = courseData.course || courseData;

    let user = null;
    try {
        const userData = await userRes.json();
        if (userData.success) user = userData.user;
    } catch (e) { console.log("User not logged in"); }

    // Check ownership
    const isOwned = user && user.purchasedCourses && user.purchasedCourses.some(c => (c._id || c) === course._id);
    const thumb = (course.thumbnail && (course.thumbnail.startsWith('http') || course.thumbnail.startsWith('//'))) 
                  ? course.thumbnail 
                  : (API_BASE + (course.thumbnail || '/images/placeholder-course.png'));

    // 1. Render Premium Layout
    courseDetailsContainer.innerHTML = `
      <!-- HERO SECTION -->
      <div class="course-hero">
        <div class="course-hero__inner">
            <div class="course-breadcrumb">Courses &nbsp;/&nbsp; ${course.title}</div>
            <h1>${course.title}</h1>
            <p class="course-hero__desc">${course.description.slice(0, 150)}${course.description.length > 150 ? '...' : ''}</p>
        </div>
      </div>

      <!-- MAIN GRID -->
      <div class="course-container">
        <div class="course-grid-layout">
            
            <!-- LEFT COLUMN (Content) -->
            <div class="course-content" id="course-content-area">
                <h2 style="font-size:1.5rem; font-weight:600; color:var(--text-main); margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid var(--primary);">About Course</h2>
                
                <div style="font-size:1.05rem; line-height:1.7; color:var(--text-main); margin-bottom:40px;">
                    <p>${course.description.replace(/\n/g, '<br>')}</p>
                </div>

                <!-- Reviews Section (displayed directly below About Course) -->
                <div style="margin-top:40px;">
                    <h2 style="font-size:1.5rem; font-weight:600; color:var(--text-main); margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid var(--primary);">Course Reviews</h2>
                    <div id="reviews-container">
                        <p style="text-align:center; padding:40px; color:#64748b;">Loading reviews...</p>
                    </div>
                </div>

                <div id="share-bar" style="margin-top: 40px; margin-bottom: 40px;">
                  <h4 style="display:inline-block; margin-right:10px;">Share this course:</h4>
                  <button id="copy-link">Copy Link</button>
                  <a id="whatsapp-link" target="_blank" rel="noopener" href="#">WhatsApp</a>
                  <a id="facebook-link" target="_blank" rel="noopener" href="#">Facebook</a>
                  <a id="x-link" target="_blank" rel="noopener" href="#">X</a>
                  <a id="linkedin-link" target="_blank" rel="noopener" href="#">LinkedIn</a>
                </div>
            </div>

            <!-- RIGHT COLUMN (Sidebar) -->
            <div class="course-sidebar">
                <div class="pricing-card">
                    <img src="${thumb}" alt="${course.title}">
                    
                    <div class="pricing-price">₹${course.price}</div>

                    ${isOwned 
                        ? `<a href="/read?id=${course._id}" class="btn btn--primary btn--block" style="padding:1rem; font-size:1rem; background-color:#10b981;">📖 Read Now</a>`
                        : `<button id="buy-btn" class="btn btn--primary btn--block" style="padding:1rem; font-size:1rem;">Buy Now</button>`
                    }
                </div>
            </div>

        </div>
      </div>
    `;

    // Initialize Reviews Logic immediately
    loadCourseReviews(courseId);

    // Update Share Links
    updateShareLinks(course, window.location.href);

    // Attach Buy Button Listener (Only if not owned)
    if (!isOwned) {
        const buyBtn = document.getElementById('buy-btn');
        if (buyBtn) {
          buyBtn.onclick = () => {
             // Store selection locally
             localStorage.setItem("selectedCourse", JSON.stringify(course));
             window.location.href = `/checkout/${course._id}`;
          };
        }
    }

  } catch (err) {
    console.error("Error loading course:", err);
    courseDetailsContainer.innerHTML = "<p style='text-align:center; color:red;'>Failed to load course details.</p>";
  }
}



// Fetch and Render Reviews
async function loadCourseReviews(courseId, ratingFilter = null, page = 1) {
    const container = document.getElementById('reviews-container');
    if(!container) return;

    try {
        // Fetch stats and paginated reviews in parallel
        // For the public course page, we only want to show top reviews (4 & 5 stars) unless a specific rating is selected
        let reviewsUrl = `/api/reviews/${courseId}?page=${page}`;
        if (ratingFilter) {
            reviewsUrl += `&rating=${ratingFilter}`;
        } else {
            reviewsUrl += `&onlyTop=true`;
        }
        
        const [statsRes, reviewsRes] = await Promise.all([
            fetch(`/api/reviews/course/${courseId}/stats`),
            fetch(reviewsUrl)
        ]);
        
        const statsData = await statsRes.json();
        const reviewsData = await reviewsRes.json();
        
        if(statsData.success && reviewsData.success) {
            const stats = statsData.stats;
            const reviews = reviewsData.reviews || [];
            const pagination = reviewsData.pagination;
            
            if(stats.totalReviews === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:60px 0;">
                        <span style="font-size:3rem;">📝</span>
                        <h3 style="margin-top:10px; color:#1e293b;">No reviews yet</h3>
                        <p style="color:#64748b;">Be the first to share your thoughts on this course!</p>
                    </div>
                `;
                return;
            }

            // Render Review List
            let listHtml = "";
            if (reviews.length === 0) {
                listHtml = `<p style="color:#64748b; padding: 20px 0;">No reviews found for this rating.</p>`;
            } else {
                listHtml = reviews.map(r => `
                    <div class="review-list-item" style="padding: 20px; border-bottom: 1px solid #e2e8f0;">
                        <div class="reviewer-info" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                            <div class="reviewer-avatar" style="width: 40px; height: 40px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #475569;">
                                ${r.userId?.name ? r.userId.name.charAt(0).toUpperCase() : (r.userName?.charAt(0).toUpperCase() || 'U')}
                            </div>
                            <div class="reviewer-meta">
                                <h4 style="margin: 0; font-size: 1rem; color: #0f172a;">${r.userId?.name || r.userName || 'Learner'}</h4>
                                <span style="font-size: 0.85rem; color: #64748b;">${new Date(r.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div style="color:#fbbf24; margin-bottom:10px; font-size:1.1rem;">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div>
                        <p style="color:#334155; line-height:1.6; margin: 0;">${r.comment}</p>
                    </div>
                `).join('');
            }

            // Pagination Controls
            let paginationHtml = "";
            if (pagination && pagination.totalPages > 1) {
                paginationHtml = `<div style="display: flex; gap: 8px; margin-top: 24px; justify-content: flex-start;">`;
                for (let i = 1; i <= pagination.totalPages; i++) {
                    const isActive = i === pagination.currentPage;
                    paginationHtml += `<button onclick="loadCourseReviews('${courseId}', ${ratingFilter}, ${i})" style="padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${isActive ? '#3b82f6' : '#fff'}; color: ${isActive ? '#fff' : '#475569'}; cursor: pointer; font-weight: ${isActive ? 'bold' : 'normal'}; transition: all 0.2s;">${i}</button>`;
                }
                paginationHtml += `</div>`;
            }

            const filterClearHtml = ratingFilter ? `
                <div style="margin-top: 10px; margin-bottom: 20px;">
                    <span style="font-size: 0.95rem; font-weight: 500;">Showing ${ratingFilter}-star reviews</span>
                    <button onclick="loadCourseReviews('${courseId}', null, 1)" style="margin-left: 12px; font-size: 0.85rem; color: #ef4444; background: none; border: none; cursor: pointer; text-decoration: underline;">Clear Filter</button>
                </div>
            ` : "";

            // Render Full UI
            container.innerHTML = `
                <div class="rating-snapshot" style="display: flex; flex-wrap: wrap; gap: 40px; margin-bottom: 40px; align-items: center; background: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div class="rating-big-score" style="text-align: center; min-width: 150px;">
                        <div class="big-rating" style="font-size: 4rem; font-weight: 800; color: #0f172a; line-height: 1;">${stats.avgRating}</div>
                        <div class="big-stars" style="color: #fbbf24; font-size: 1.5rem; margin: 8px 0;">${"★".repeat(Math.round(stats.avgRating))}${"☆".repeat(5-Math.round(stats.avgRating))}</div>
                        <div style="color:#64748b; font-weight:500; font-size: 0.95rem;">${stats.totalReviews} Ratings</div>
                    </div>
                    <div class="rating-bars" style="flex: 1; min-width: 250px;">
                        ${[5,4,3,2,1].map(star => {
                            const percent = stats.percentages[star];
                            return `
                                <div class="bar-row" style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px; padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onclick="loadCourseReviews('${courseId}', ${star}, 1)" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                                    <div class="bar-label" style="width: 40px; font-size: 0.9rem; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 4px;"><span>${star}</span><span style="color: #fbbf24; font-size: 1rem; line-height: 1;">★</span></div>
                                    <div class="bar-bg" style="flex: 1; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; position: relative;">
                                        <div class="bar-fill" style="width:${percent}%; height: 100%; background: #fbbf24; border-radius: 5px; transition: width 0.5s ease-out;"></div>
                                    </div>
                                    <div class="bar-percent" style="width: 45px; text-align: right; font-size: 0.9rem; color: #64748b; font-variant-numeric: tabular-nums;">${percent}%</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                ${filterClearHtml}
                
                <h3 style="margin-bottom:20px; font-size: 1.25rem; color: #0f172a;">Reviews</h3>
                <div class="reviews-list">
                    ${listHtml}
                </div>
                ${paginationHtml}
            `;

        } else {
             container.innerHTML = "<p>Failed to load reviews.</p>";
        }
    } catch(err) {
        console.error("Review fetch error", err);
        container.innerHTML = "<p>Error loading reviews.</p>";
    }
}


// ==========================================
// SHARE LINKS UTILITY
// ==========================================
function updateShareLinks(course, currentUrl) {
  const copyBtn = document.getElementById('copy-link');
  const whatsapp = document.getElementById('whatsapp-link');
  const facebook = document.getElementById('facebook-link');
  const xlink = document.getElementById('x-link');
  const linkedin = document.getElementById('linkedin-link');

  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 1500);
      } catch (e) {
        prompt('Copy this link', currentUrl);
      }
    };
  }

  const text = encodeURIComponent(course.title + ' — Learn on Stribble');
  const urlEncoded = encodeURIComponent(currentUrl);

  if (whatsapp) whatsapp.href = `https://wa.me/?text=${text}%20${urlEncoded}`;
  if (facebook) facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`;
  if (xlink) xlink.href = `https://twitter.com/intent/tweet?text=${text}&url=${urlEncoded}`;
  if (linkedin) linkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${urlEncoded}`;
}