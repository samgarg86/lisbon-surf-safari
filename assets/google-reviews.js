const CAROUSEL_GAP = 16;
const BREAKPOINT = 768;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

function buildStars(rating) {
  const filled = Math.round(rating || 0);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GOOGLE_ICON = `<svg class="review-card__google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-label="Google review" role="img" width="18" height="18">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

function buildCardHTML(review) {
  const rawName = review.authorAttribution?.displayName || 'Guest';
  const initial = rawName[0].toUpperCase();
  const name = escapeHTML(rawName);
  const date = escapeHTML(review.relativePublishTimeDescription || '');
  const text = escapeHTML(review.text?.text || '');
  const rating = review.rating || 5;
  const photoUri = review.authorAttribution?.photoUri;

  const avatar = photoUri
    ? `<img src="${escapeHTML(photoUri)}" alt="${name}" class="review-card__avatar" loading="lazy" width="48" height="48">`
    : `<div class="review-card__avatar-fallback" aria-hidden="true">${initial}</div>`;

  return `<div class="review-card">
    <div class="review-card__header">
      ${avatar}
      <div class="review-card__meta">
        <p class="review-card__name">${name}</p>
        <p class="review-card__date">${date}</p>
      </div>
      ${GOOGLE_ICON}
    </div>
    <div class="review-card__stars" aria-label="${rating} out of 5 stars" role="img">${buildStars(rating)}</div>
    <p class="review-card__text">${text}</p>
  </div>`;
}

class GoogleReviewsCarousel extends HTMLElement {
  connectedCallback() {
    const apiKey = this.dataset.apiKey;
    const placeId = this.dataset.placeId;
    if (!apiKey || !placeId) return;

    this.currentIndex = 0;
    this.reviews = [];

    this.track = this.querySelector('.google-reviews__track');
    this.slider = this.querySelector('.google-reviews__slider');
    this.loading = this.querySelector('.google-reviews__loading');
    this.prevBtn = this.querySelector('.google-reviews__arrow--prev');
    this.nextBtn = this.querySelector('.google-reviews__arrow--next');

    this._onPrev = () => this.slide(-1);
    this._onNext = () => this.slide(1);
    this.prevBtn.addEventListener('click', this._onPrev);
    this.nextBtn.addEventListener('click', this._onNext);

    this._resizeHandler = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.goto(0), 150);
    };
    window.addEventListener('resize', this._resizeHandler);

    this._transitionEndHandler = () => {
      this.track.style.willChange = '';
    };
    this.track.addEventListener('transitionend', this._transitionEndHandler);

    this._fetchReviews(apiKey, placeId).catch(() => { this.hidden = true; });
  }

  disconnectedCallback() {
    clearTimeout(this._resizeTimer);
    window.removeEventListener('resize', this._resizeHandler);
    this.prevBtn?.removeEventListener('click', this._onPrev);
    this.nextBtn?.removeEventListener('click', this._onNext);
    if (this.track) {
      this.track.removeEventListener('transitionend', this._transitionEndHandler);
    }
  }

  async _fetchReviews(apiKey, placeId) {
    const detailsRes = await fetch(
      `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}?key=${encodeURIComponent(apiKey)}`,
      { headers: { 'X-Goog-FieldMask': 'reviews,displayName' } }
    );
    if (!detailsRes.ok) { this.hidden = true; return; }
    const details = await detailsRes.json();
    const reviews = (details.reviews || []).filter(r => (r.rating || 0) >= 3);
    if (!reviews.length) { this.hidden = true; return; }

    const placeName = encodeURIComponent(details.displayName?.text || '');
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${placeName}&query_place_id=${placeId}`;
    this._renderReviews(reviews, mapsUrl);
  }

  _renderReviews(reviews, mapsUrl) {
    this.reviews = reviews;
    this.track.innerHTML = reviews.map(buildCardHTML).join('');
    this.querySelector('.google-reviews__loading').hidden = true;
    this.slider.hidden = false;
    this.updateButtons();
    const seeAll = this.querySelector('.google-reviews__see-all');
    if (seeAll) { seeAll.href = mapsUrl; seeAll.hidden = false; }
  }

  get visibleCount() {
    return window.innerWidth >= BREAKPOINT ? 3 : 1;
  }

  goto(index) {
    const max = Math.max(0, this.reviews.length - this.visibleCount);
    this.currentIndex = Math.max(0, Math.min(max, index));
    const firstCard = this.track.children[0];
    if (!firstCard) return;
    const cardWidth = firstCard.offsetWidth;
    this.track.style.willChange = 'transform';
    this.track.style.transform = `translateX(-${this.currentIndex * (cardWidth + CAROUSEL_GAP)}px)`;
    this.updateButtons();
  }

  slide(direction) {
    this.goto(this.currentIndex + direction);
  }

  updateButtons() {
    const max = Math.max(0, this.reviews.length - this.visibleCount);
    this.prevBtn.disabled = this.currentIndex === 0;
    this.nextBtn.disabled = this.currentIndex >= max;
  }
}

if (!customElements.get('google-reviews-carousel')) {
  customElements.define('google-reviews-carousel', GoogleReviewsCarousel);
}
