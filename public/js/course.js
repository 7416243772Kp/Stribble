const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const courseId = getCourseIdFromLocation();
  const container = document.getElementById("course-details");

  if (courseId) {
    loadCourseDetails(courseId);
  } else if (container) {
    container.innerHTML = "<p style='text-align:center; color:#666; margin-top:50px;'>No course selected. URL needs ?id=...</p>";
  }

});

function getCourseIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  let courseId = params.get("id");

  if (!courseId) {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === "course") {
      courseId = pathParts[pathParts.length - 1];
    }
  }

  return courseId;
}

async function loadCourseDetails(courseId) {
  const courseDetailsContainer = document.getElementById("course-details");
  if (!courseDetailsContainer) return;

  try {
    const [courseRes, userRes] = await Promise.all([
      fetch(`${API_BASE}/api/courses/${courseId}`),
      fetch(`${API_BASE}/auth/me`)
    ]);

    if (!courseRes.ok) throw new Error(`Course fetch failed: ${courseRes.status}`);

    const courseData = await courseRes.json();
    const course = courseData.course || courseData;
    const courseDescription = (course.description || "Course details will be updated soon.").trim();

    let user = null;
    try {
      const userData = await userRes.json();
      if (userData.success) user = userData.user;
    } catch (error) {
      console.log("User not logged in");
    }

    const isOwned = Boolean(
      user &&
      user.purchasedCourses &&
      user.purchasedCourses.some((item) => String(item._id || item) === String(course._id))
    );

    const thumb = (
      course.thumbnail &&
      (course.thumbnail.startsWith("http") || course.thumbnail.startsWith("//"))
    )
      ? course.thumbnail
      : `${API_BASE}${course.thumbnail || "/images/placeholder-course.png"}`;

    courseDetailsContainer.innerHTML = `
      <div class="course-content" id="course-content-area">
        <section class="course-section course-section--summary">
          <span class="course-summary__eyebrow">Course</span>
          <h1 class="course-summary__title">${course.title}</h1>

          <div class="course-summary__detail-card">
            <div class="course-summary__media-card">
              <img src="${thumb}" alt="${course.title}">
            </div>

            <div class="course-rich-text course-summary__description">
              <p>${courseDescription.replace(/\n/g, "<br>")}</p>
            </div>
          </div>
        </section>

        <section class="course-section course-section--reviews">
          <h2 class="course-section__heading">Course Reviews</h2>
          <div id="reviews-container" class="course-reviews-shell">
            <p class="course-loading-copy">Loading reviews...</p>
          </div>
        </section>

        <section class="course-section course-section--share">
          <div id="share-bar" class="course-share-card">
            <div class="course-share-header">
              <h3>Share this course</h3>
              <p>Send it to someone who would enjoy it.</p>
            </div>
            <div class="course-share-actions">
              <button id="copy-link" class="course-share-action course-share-action--copy" type="button">Copy Link</button>
              <a id="whatsapp-link" class="course-share-action" target="_blank" rel="noopener" href="#">WhatsApp</a>
              <a id="facebook-link" class="course-share-action" target="_blank" rel="noopener" href="#">Facebook</a>
              <a id="x-link" class="course-share-action" target="_blank" rel="noopener" href="#">X</a>
              <a id="linkedin-link" class="course-share-action" target="_blank" rel="noopener" href="#">LinkedIn</a>
            </div>
          </div>
        </section>
      </div>
    `;

    // Update Pricing Card
    const courseImg = document.getElementById("course-image");
    const coursePrice = document.getElementById("course-price");
    const buyBtn = document.getElementById("btn-buy");

    if (courseImg) courseImg.src = thumb;
    if (coursePrice) coursePrice.textContent = `₹${course.price}`;

    if (buyBtn) {
      if (isOwned) {
        buyBtn.textContent = "Read Now";
        buyBtn.onclick = () => {
          window.location.href = `/read?id=${course._id}`;
        };
      } else {
        buyBtn.textContent = "Enroll Now";
        buyBtn.onclick = () => {
          localStorage.setItem("selectedCourse", JSON.stringify(course));
          window.location.href = `/checkout/${course._id}`;
        };
      }
    }

    loadCourseReviews(courseId);
    updateShareLinks(course, window.location.href);
  } catch (error) {
    console.error("Error loading course:", error);
    courseDetailsContainer.innerHTML = "<p style='text-align:center; color:red;'>Failed to load course details.</p>";
  }
}

async function loadCourseReviews(courseId, ratingFilter = null, page = 1) {
  const container = document.getElementById("reviews-container");
  if (!container) return;

  try {
    let reviewsUrl = `/api/reviews/${courseId}?page=${page}`;
    if (ratingFilter) {
      reviewsUrl += `&rating=${ratingFilter}`;
    }

    const [statsRes, reviewsRes] = await Promise.all([
      fetch(`/api/reviews/course/${courseId}/stats`),
      fetch(reviewsUrl)
    ]);

    const statsData = await statsRes.json();
    const reviewsData = await reviewsRes.json();

    if (!statsData.success || !reviewsData.success) {
      container.innerHTML = "<p class='course-error-copy'>Failed to load reviews.</p>";
      return;
    }

    const stats = statsData.stats;
    const reviews = reviewsData.reviews || [];
    const pagination = reviewsData.pagination;

    if (stats.totalReviews === 0) {
      container.innerHTML = `
        <div class="course-review-empty">
          <span class="course-review-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </span>
          <h3>No reviews yet</h3>
          <p>Be the first to share your thoughts on this course.</p>
        </div>
      `;
      return;
    }

    const listHtml = reviews.length === 0
      ? `<p class="course-empty-copy">No reviews found for this rating.</p>`
      : reviews.map((review) => `
          <article class="review-list-item course-review-card">
            <div class="course-review-card__header">
              <div class="course-review-card__identity">
                <div class="reviewer-meta course-review-card__meta">
                  <h4>${review.userId?.name || review.userName || "Learner"}</h4>
                  <div class="course-review-card__meta-line">
                    <span class="course-review-card__time">${formatRelativeTime(review.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div class="course-review-card__rating">
                <span class="course-review-card__stars">${renderStars(review.rating)}</span>
                <span class="course-review-card__rating-value">${review.rating}.0</span>
              </div>
            </div>
            <p class="course-review-card__text">${review.comment}</p>
          </article>
        `).join("");

    let paginationHtml = "";
    if (pagination && pagination.totalPages > 1) {
      paginationHtml = `<div class="course-review-pagination">`;
      for (let pageNumber = 1; pageNumber <= pagination.totalPages; pageNumber += 1) {
        const activeClass = pageNumber === pagination.currentPage ? " is-active" : "";
        paginationHtml += `
          <button
            type="button"
            class="course-review-page-btn${activeClass}"
            onclick="loadCourseReviews('${courseId}', ${ratingFilter}, ${pageNumber})"
          >
            ${pageNumber}
          </button>
        `;
      }
      paginationHtml += `</div>`;
    }

    const reviewFilterChips = `
      <div class="course-review-filters" role="group" aria-label="Filter reviews by rating">
        <button
          type="button"
          class="course-review-chip${ratingFilter === null ? " is-active" : ""}"
          onclick="loadCourseReviews('${courseId}', null, 1)"
        >
          All Reviews
        </button>
        ${[5, 4, 3, 2, 1].map((star) => `
          <button
            type="button"
            class="course-review-chip${Number(ratingFilter) === star ? " is-active" : ""}"
            onclick="loadCourseReviews('${courseId}', ${star}, 1)"
          >
            ${star} Star
          </button>
        `).join("")}
      </div>
    `;

    container.innerHTML = `
      <div class="course-reviews-panel">
        <div class="course-reviews-summary">
          <div class="course-reviews-score">
            <span class="course-reviews-score__eyebrow">Average Rating</span>
            <div class="big-rating">${stats.avgRating}</div>
            <div class="big-stars">${renderStars(Math.round(stats.avgRating))}</div>
            <div class="course-rating-count">Total ${stats.totalReviews} Reviews</div>
          </div>

          <div class="course-reviews-breakdown">
            <div class="rating-bars">
              ${[5, 4, 3, 2, 1].map((star) => {
                const percent = stats.percentages[star];
                const isActive = Number(ratingFilter) === star ? " is-active" : "";
                return `
                  <button
                    type="button"
                    class="course-rating-bar${isActive}"
                    onclick="loadCourseReviews('${courseId}', ${star}, 1)"
                    title="Show ${star}-star reviews"
                    aria-label="Show ${star}-star reviews"
                  >
                    <div class="course-rating-bar__meta">
                      <div class="course-rating-bar__value"><span>${star}</span><span class="bar-label__star">&#9733;</span></div>
                    </div>
                    <div class="bar-bg"><div class="bar-fill" style="width:${percent}%;"></div></div>
                    <div class="bar-percent">${percent}%</div>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </div>

        ${reviewFilterChips}

        <div class="course-review-list-heading">
          <div>
            <h3>${ratingFilter ? `${ratingFilter}-Star Reviews` : "Latest Reviews"}</h3>
            <p>${ratingFilter ? `${stats.breakdown[ratingFilter] || 0} verified reviews with a ${ratingFilter}-star rating.` : "All are verified reviews."}</p>
          </div>
        </div>
        <div class="reviews-list course-reviews-list">
          ${listHtml}
        </div>
        ${paginationHtml}
      </div>
    `;
  } catch (error) {
    console.error("Review fetch error", error);
    container.innerHTML = "<p class='course-error-copy'>Error loading reviews.</p>";
  }
}

function renderStars(rating) {
  return `${"&#9733;".repeat(rating)}${"&#9734;".repeat(5 - rating)}`;
}

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffMs < week) {
    const days = Math.max(1, Math.floor(diffMs / day));
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (diffMs < month) {
    const weeks = Math.max(1, Math.floor(diffMs / week));
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffMs < year) {
    const months = Math.max(1, Math.floor(diffMs / month));
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = Math.max(1, Math.floor(diffMs / year));
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function updateShareLinks(course, currentUrl) {
  const copyBtn = document.getElementById("copy-link");
  const whatsapp = document.getElementById("whatsapp-link");
  const facebook = document.getElementById("facebook-link");
  const xlink = document.getElementById("x-link");
  const linkedin = document.getElementById("linkedin-link");

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1500);
      } catch (error) {
        window.prompt("Copy this link", currentUrl);
      }
    });
  }

  const text = encodeURIComponent(`${course.title} - Learn on Stribble`);
  const urlEncoded = encodeURIComponent(currentUrl);

  if (whatsapp) whatsapp.href = `https://wa.me/?text=${text}%20${urlEncoded}`;
  if (facebook) facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`;
  if (xlink) xlink.href = `https://twitter.com/intent/tweet?text=${text}&url=${urlEncoded}`;
  if (linkedin) linkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${urlEncoded}`;
}

window.loadCourseReviews = loadCourseReviews;
