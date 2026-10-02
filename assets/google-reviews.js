const CAROUSEL_GAP = 16;
const BREAKPOINT = 768;

let mapsLoadPromise = null;

function loadGoogleMapsAPI(apiKey) {
  if (window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    window.__googleMapsReady = resolve;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=__googleMapsReady`;
    script.async = true;
    script.onerror = () => {
      mapsLoadPromise = null;
      reject(new Error('Failed to load Google Maps API'));
    };
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

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

function buildCardHTML(review) {
  const rawName = review.author_name || 'Guest';
  const initial = rawName[0].toUpperCase();
  const name = escapeHTML(rawName);
  const date = escapeHTML(review.relative_time_description || '');
  const text = escapeHTML(review.text || '');
  const rating = review.rating || 5;

  const avatar = review.profile_photo_url
    ? `<img src="${escapeHTML(review.profile_photo_url)}" alt="${name}" class="review-card__avatar" loading="lazy" width="48" height="48">`
    : `<div class="review-card__avatar-fallback" aria-hidden="true">${initial}</div>`;

  return `<div class="review-card">
    <div class="review-card__header">
      ${avatar}
      <div class="review-card__meta">
        <p class="review-card__name">${name}</p>
        <p class="review-card__date">${date}</p>
      </div>
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
    this.attribution = this.querySelector('.google-reviews__attribution');

    if (!this._initialized) {
      this._onPrev = () => this.slide(-1);
      this._onNext = () => this.slide(1);
      this.prevBtn.addEventListener('click', this._onPrev);
      this.nextBtn.addEventListener('click', this._onNext);
      this._initialized = true;
    }

    this._resizeHandler = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.goto(0), 150);
    };
    window.addEventListener('resize', this._resizeHandler);

    // Add transitionend listener to clear will-change after animation completes
    this._transitionEndHandler = () => {
      this.track.style.willChange = '';
    };
    this.track.addEventListener('transitionend', this._transitionEndHandler);

    loadGoogleMapsAPI(apiKey)
      .then(() => this._fetchReviews(placeId))
      .catch(() => this.hidden = true);
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

  _fetchReviews(placeId) {
    const service = new google.maps.places.PlacesService(this.attribution);
    service.getDetails(
      { placeId, fields: ['reviews'] },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.reviews?.length) {
          this.hidden = true;
          return;
        }
        this._renderReviews(place.reviews);
      }
    );
  }

  _renderReviews(reviews) {
    this.reviews = reviews;
    this.track.innerHTML = reviews.map(buildCardHTML).join('');
    this.loading.hidden = true;
    this.slider.hidden = false;
    this.updateButtons();
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
    // Set will-change before transform to enable GPU acceleration only when needed
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
