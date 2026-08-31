class NewsTicker {
    constructor() {
        this.config = {};
        this.mapLibre = null;
        this.tiles = {};
        this.events = [];
        this.nationalEvents = [];
        this.availableMonths = new Set();
        this.prefectures = [];
        this.element = null;
        this.content = null;
        this.activeItem = null;
        this.sourceLink = null;
        this.previousButton = null;
        this.nextButton = null;
        this.currentEvents = [];
        this.resizeHandler = null;
        this.timer = null;
        this.currentKey = "";
        this.currentIndex = 0;
        this.loaded = false;
        this.loadedYears = new Set();
        this.loadingYears = new Map();
        this.dragState = null;
        this.suppressClickUntil = 0;
    }

    init(config, mapLibre, tiles) {
        this.config = config || {};
        this.mapLibre = mapLibre;
        this.tiles = tiles || {};

        if (this.config.use !== true) {
            this.hide();
            return;
        }

        this.createElement();
        this.load().catch((error) => {
            console.warn("NewsTicker: ニュース表示の初期化に失敗しました。", error);
            this.hide();
        });
    }

    createElement() {
        if (this.element || !this.mapLibre?.map) return;

        this.element = document.createElement("aside");
        this.element.id = "newsTicker";
        this.element.className = "news-ticker";
        this.element.hidden = true;
        this.element.setAttribute("aria-label", "全国・この地域のニュース");

        this.previousButton = this.createNavigationButton("◀", "▲", "前のニュースを表示");
        this.previousButton.addEventListener("click", () => this.showPrevious());

        this.content = document.createElement("div");
        this.content.className = "news-ticker__content";
        this.content.setAttribute("aria-live", "polite");
        this.content.addEventListener("pointerdown", (event) => this.startDrag(event));
        this.content.addEventListener("pointermove", (event) => this.moveDrag(event));
        this.content.addEventListener("pointerup", (event) => this.endDrag(event));
        this.content.addEventListener("pointercancel", (event) => this.cancelDrag(event));
        this.content.addEventListener("dragstart", (event) => event.preventDefault());
        this.content.addEventListener("click", (event) => {
            if (Date.now() > this.suppressClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
            this.suppressClickUntil = 0;
        }, true);

        this.nextButton = this.createNavigationButton("▶", "▼", "次のニュースを表示");
        this.nextButton.addEventListener("click", () => this.showNext());

        this.sourceLink = document.createElement("a");
        this.sourceLink.className = "news-ticker__source";
        this.sourceLink.href = "https://www.wikidata.org/";
        this.sourceLink.target = "_blank";
        this.sourceLink.rel = "noopener noreferrer";
        this.sourceLink.textContent = "News from Wikidata";

        this.element.append(this.previousButton, this.content, this.nextButton, this.sourceLink);
        this.mapLibre.map.getContainer().appendChild(this.element);

        this.resizeHandler = () => this.updateHeadlineScroll();
        window.addEventListener("resize", this.resizeHandler);
    }

    createNavigationButton(desktopLabel, mobileLabel, ariaLabel) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "news-ticker__button";
        button.setAttribute("aria-label", ariaLabel);

        const desktopIcon = document.createElement("span");
        desktopIcon.className = "news-ticker__button-icon news-ticker__button-icon--desktop";
        desktopIcon.textContent = desktopLabel;
        desktopIcon.setAttribute("aria-hidden", "true");

        const mobileIcon = document.createElement("span");
        mobileIcon.className = "news-ticker__button-icon news-ticker__button-icon--mobile";
        mobileIcon.textContent = mobileLabel;
        mobileIcon.setAttribute("aria-hidden", "true");

        button.append(desktopIcon, mobileIcon);
        button.disabled = true;
        return button;
    }

    async load() {
        const baseUrl = String(this.config.sourceBaseUrl || "").replace(/\/$/, "");
        const prefectureFile = String(this.config.prefectureFile || "");

        if (!baseUrl || !prefectureFile) {
            console.warn("NewsTicker: ニュースデータまたは都道府県境界のURLが設定されていません。");
            return;
        }

        const [prefectureResponse, indexResponse] = await Promise.all([
            fetch(window.withAppAssetVersion ? window.withAppAssetVersion(prefectureFile) : prefectureFile),
            fetch(`${baseUrl}/index.json`)
        ]);
        if (!prefectureResponse.ok) throw new Error(`${prefectureResponse.status} ${prefectureResponse.statusText}`);
        if (!indexResponse.ok) throw new Error(`index.json: ${indexResponse.status} ${indexResponse.statusText}`);
        const prefectureResult = await prefectureResponse.json();
        const indexResult = await indexResponse.json();

        if (prefectureResult?.type !== "FeatureCollection" || !Array.isArray(prefectureResult.features)) {
            console.warn("NewsTicker: 都道府県境界データの形式が不正です。");
            return;
        }
        if (!Array.isArray(indexResult?.months)) {
            console.warn("NewsTicker: index.json の形式が不正です。");
            return;
        }
        this.prefectures = prefectureResult.features;
        this.availableMonths = new Set(indexResult.months
            .map((month) => String(month))
            .filter((month) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)));
        this.loaded = true;

        const targetYear = this.tiles[this.mapLibre?.selectStyle]?.year;
        if (this.hasAvailableYear(targetYear)) await this.loadYear(targetYear);
        this.update();
    }

    getAvailableMonths(year) {
        if (!Number.isInteger(year)) return [];
        const prefix = `${year}-`;
        return [...this.availableMonths]
            .filter((month) => month.startsWith(prefix))
            .sort();
    }

    hasAvailableYear(year) {
        return this.getAvailableMonths(year).length > 0;
    }

    loadYear(year) {
        if (!this.hasAvailableYear(year) || this.loadedYears.has(year)) return Promise.resolve();
        if (this.loadingYears.has(year)) return this.loadingYears.get(year);

        const request = this.fetchYear(year).finally(() => this.loadingYears.delete(year));
        this.loadingYears.set(year, request);
        return request;
    }

    async fetchYear(year) {
        const baseUrl = String(this.config.sourceBaseUrl || "").replace(/\/$/, "");
        const urls = this.getAvailableMonths(year).map((month) => `${baseUrl}/${month}.json`);
        const results = await Promise.allSettled(urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                const error = new Error(`${response.status} ${response.statusText}`);
                error.status = response.status;
                throw error;
            }
            return response.json();
        }));

        const uniqueEvents = new Map(this.events.map((event) => [this.getRegionalStorageKey(event), event]));
        const uniqueNationalEvents = new Map(this.nationalEvents.map((event) => [this.getEventIdentity(event), event]));
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                if (result.reason?.status === 404) {
                    console.info(`NewsTicker: ${urls[index]} はまだ公開されていません。`);
                } else {
                    console.warn(`NewsTicker: ${urls[index]} の取得に失敗しました。`, result.reason);
                }
                return;
            }

            const data = result.value;
            if (data?.year !== year || !data?.regions || typeof data.regions !== "object") {
                console.warn(`NewsTicker: ${urls[index]} の形式が不正です。`);
                return;
            }

            Object.entries(data.regions).forEach(([region, events]) => {
                if (!Array.isArray(events)) return;
                events.forEach((event) => {
                    const latitude = this.toFiniteCoordinate(event.latitude);
                    const longitude = this.toFiniteCoordinate(event.longitude);
                    if (latitude === null || longitude === null) return;

                    const item = {
                        ...event,
                        year: data.year,
                        month: data.month,
                        region,
                        scope: "regional",
                        latitude,
                        longitude
                    };
                    uniqueEvents.set(this.getRegionalStorageKey(item), item);
                });
            });

            if (Array.isArray(data.national)) {
                data.national.forEach((event) => {
                    if (!event || typeof event !== "object" || !(event.headline || event.title)) return;

                    const latitude = this.toFiniteCoordinate(event.latitude);
                    const longitude = this.toFiniteCoordinate(event.longitude);
                    const item = {
                        ...event,
                        year: data.year,
                        month: data.month,
                        sourceRegion: String(event.region || ""),
                        displayRegion: "全国",
                        scope: "national"
                    };
                    if (latitude !== null) item.latitude = latitude;
                    if (longitude !== null) item.longitude = longitude;

                    uniqueNationalEvents.set(this.getEventIdentity(item), item);
                });
            }
        });

        this.events = [...uniqueEvents.values()];
        this.nationalEvents = [...uniqueNationalEvents.values()];
        this.loadedYears.add(year);
    }

    update() {
        if (this.config.use !== true || !this.loaded || !this.mapLibre?.map) return;

        const selectedTile = this.tiles[this.mapLibre.selectStyle];
        const targetYear = selectedTile?.year;
        if (!this.hasAvailableYear(targetYear)) {
            this.hide();
            return;
        }

        if (!this.loadedYears.has(targetYear)) {
            this.hide();
            this.loadYear(targetYear)
                .then(() => this.update())
                .catch((error) => console.warn(`NewsTicker: ${targetYear}年のニュース取得に失敗しました。`, error));
            return;
        }

        const configuredRegionalMinZoom = Number(this.config.regionalMinZoom ?? this.config.minZoom);
        const regionalMinZoom = Number.isFinite(configuredRegionalMinZoom) ? configuredRegionalMinZoom : 9.5;
        const scope = this.mapLibre.getZoom() >= regionalMinZoom ? "regional" : "national";
        const currentRegion = scope === "regional" ? this.getCurrentRegion() : "";
        const visibleEvents = this.getVisibleEvents(targetYear, currentRegion, scope);

        if (visibleEvents.length === 0) {
            this.hide();
            return;
        }

        const nextKey = `${targetYear}:${scope}:${currentRegion}:${visibleEvents.map((event) => `${this.getEventIdentity(event)}:${event.date || ""}`).join("|")}`;
        if (nextKey === this.currentKey) return;

        this.stopTimer();
        this.currentKey = nextKey;
        this.currentIndex = 0;
        this.currentEvents = visibleEvents;
        this.updateNavigationButtons();
        this.element.setAttribute("aria-label", scope === "national" ? "全国ニュース" : "この地域のニュース");
        this.element.hidden = false;
        this.render(this.currentEvents[this.currentIndex]);
        this.startTimer();
    }

    getVisibleEvents(targetYear, currentRegion, scope) {
        if (scope === "regional") {
            if (!currentRegion) return [];
            return this.events
                .filter((event) => event.year === targetYear && event.region === currentRegion)
                .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
                    || String(a.headline || a.title || "").localeCompare(String(b.headline || b.title || "")));
        }

        const configuredLimit = Number(this.config.nationalLimitPerMonth);
        const nationalLimitPerMonth = Number.isInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 5;
        const nationalCountByMonth = new Map();
        const nationalEvents = this.nationalEvents
            .filter((event) => event.year === targetYear)
            .sort((a, b) => Number(a.month || 0) - Number(b.month || 0)
                || Number(b.score || 0) - Number(a.score || 0)
                || String(a.date || "").localeCompare(String(b.date || "")))
            .filter((event) => {
                const month = Number(event.month || 0);
                const count = nationalCountByMonth.get(month) || 0;
                if (count >= nationalLimitPerMonth) return false;
                nationalCountByMonth.set(month, count + 1);
                return true;
            });

        return nationalEvents
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
                || String(a.headline || a.title || "").localeCompare(String(b.headline || b.title || "")));
    }

    getEventIdentity(event) {
        const year = Number(event?.year || 0);
        const wikidataId = String(event?.wikidata_id || "");
        if (wikidataId) return `${year}:${wikidataId}`;
        return `${year}:${event?.date || ""}:${event?.headline || event?.title || ""}`;
    }

    getRegionalStorageKey(event) {
        return `${event?.year || ""}:${event?.wikidata_id || ""}:${event?.date || ""}:${event?.latitude ?? ""}:${event?.longitude ?? ""}:${event?.headline || event?.title || ""}`;
    }

    toFiniteCoordinate(value) {
        if (value === null || value === "" || typeof value === "boolean") return null;
        const coordinate = Number(value);
        return Number.isFinite(coordinate) ? coordinate : null;
    }

    render(event, direction = 0) {
        if (!this.content) return;

        const wikipediaUrl = String(event.wikipedia_url || "");
        const hasLink = /^https?:\/\//i.test(wikipediaUrl);
        const item = hasLink ? document.createElement("a") : document.createElement("div");
        item.className = "news-ticker__item";
        if (hasLink) {
            item.href = wikipediaUrl;
            item.target = "_blank";
            item.rel = "noopener noreferrer";
            item.draggable = false;
        }

        const year = document.createElement("span");
        year.className = "news-ticker__year";
        year.textContent = `${event.year}年`;

        const date = document.createElement("span");
        date.className = "news-ticker__date";
        date.textContent = this.formatDate(event.date);

        const region = document.createElement("span");
        region.className = "news-ticker__region";
        if (event.scope === "national") region.classList.add("news-ticker__region--national");
        region.textContent = event.displayRegion || event.region;

        const mobileLabel = document.createElement("span");
        mobileLabel.className = "news-ticker__mobile-label";
        mobileLabel.textContent = "当時のニュース";

        const meta = document.createElement("span");
        meta.className = "news-ticker__meta";
        meta.append(mobileLabel, year, date, region);

        const headline = document.createElement("span");
        headline.className = "news-ticker__headline";

        const headlineTrack = document.createElement("span");
        headlineTrack.className = "news-ticker__headline-track";

        const headlineText = document.createElement("span");
        headlineText.className = "news-ticker__headline-text news-ticker__headline-text--primary";
        headlineText.textContent = event.headline || event.title || "";

        const headlineClone = document.createElement("span");
        headlineClone.className = "news-ticker__headline-text news-ticker__headline-text--clone";
        headlineClone.textContent = headlineText.textContent;
        headlineClone.setAttribute("aria-hidden", "true");

        headlineTrack.append(headlineText, headlineClone);
        headline.appendChild(headlineTrack);

        item.append(meta, headline);
        const previousItem = this.activeItem;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.activeItem = item;

        if (previousItem?.isConnected && direction !== 0 && !reduceMotion) {
            previousItem.classList.remove(
                "news-ticker__item--entering-next",
                "news-ticker__item--entering-previous"
            );
            previousItem.classList.add(direction > 0
                ? "news-ticker__item--leaving-next"
                : "news-ticker__item--leaving-previous");
            item.classList.add(direction > 0
                ? "news-ticker__item--entering-next"
                : "news-ticker__item--entering-previous");
            this.content.appendChild(item);

            const removePreviousItem = () => previousItem.remove();
            previousItem.addEventListener("animationend", (event) => {
                if (event.target === previousItem) removePreviousItem();
            });
            window.setTimeout(removePreviousItem, 600);
        } else {
            this.content.replaceChildren(item);
        }

        window.requestAnimationFrame(() => this.updateHeadlineScroll(item));
    }

    updateHeadlineScroll(item = this.activeItem) {
        const headline = item?.querySelector(".news-ticker__headline");
        const primaryText = headline?.querySelector(".news-ticker__headline-text--primary");
        if (!headline || !primaryText) return;

        headline.classList.remove("is-scrolling");
        if (!window.matchMedia("(max-width: 575px)").matches) return;
        const textWidth = primaryText.getBoundingClientRect().width;
        headline.classList.toggle("is-scrolling", textWidth > headline.clientWidth);
    }

    startDrag(event) {
        if (event.button !== 0 || event.isPrimary === false || this.currentEvents.length <= 1) return;

        this.stopTimer();
        this.dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            axis: null,
            item: this.activeItem
        };
    }

    moveDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        if (!state.axis) {
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
            state.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
            this.content?.setPointerCapture?.(event.pointerId);
            this.content?.classList.add("is-dragging");
        }

        event.preventDefault();
        const distance = state.axis === "x" ? deltaX : deltaY;
        if (state.item) {
            state.item.style.transform = state.axis === "x"
                ? `translateX(${distance}px)`
                : `translateY(${distance}px)`;
            state.item.style.opacity = String(Math.max(0.55, 1 - Math.abs(distance) / 500));
        }
    }

    endDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        const distance = state.axis === "y" ? deltaY : deltaX;
        const size = state.axis === "y" ? this.content?.clientHeight : this.content?.clientWidth;
        const threshold = Math.max(40, Math.min(80, Number(size || 0) * 0.15));
        const shouldChange = state.axis !== null && Math.abs(distance) >= threshold;

        this.resetDragState(state);
        if (shouldChange) {
            this.suppressClickUntil = Date.now() + 500;
            this.moveNews(distance < 0 ? 1 : -1, true);
        } else {
            this.startTimer();
        }
    }

    cancelDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;
        this.resetDragState(state);
        this.startTimer();
    }

    resetDragState(state) {
        if (state.item) {
            state.item.style.removeProperty("transform");
            state.item.style.removeProperty("opacity");
        }
        this.content?.classList.remove("is-dragging");
        if (this.content?.hasPointerCapture?.(state.pointerId)) {
            this.content.releasePointerCapture(state.pointerId);
        }
        this.dragState = null;
    }

    showPrevious(restartTimer = true) {
        this.moveNews(-1, restartTimer);
    }

    showNext(restartTimer = true) {
        this.moveNews(1, restartTimer);
    }

    moveNews(offset, restartTimer) {
        if (this.currentEvents.length === 0) return;
        this.currentIndex = (this.currentIndex + offset + this.currentEvents.length) % this.currentEvents.length;
        this.render(this.currentEvents[this.currentIndex], offset);
        if (restartTimer) this.startTimer();
    }

    startTimer() {
        this.stopTimer();
        if (this.currentEvents.length <= 1) return;

        const interval = Math.max(Number(this.config.displayDuration) || Number(this.config.interval) || 6500, 3000);
        this.timer = window.setInterval(() => this.showNext(false), interval);
    }

    updateNavigationButtons() {
        const disabled = this.currentEvents.length <= 1;
        if (this.previousButton) this.previousButton.disabled = disabled;
        if (this.nextButton) this.nextButton.disabled = disabled;
    }

    getCurrentRegion() {
        if (!this.mapLibre?.map || !Array.isArray(this.prefectures) || typeof turf === "undefined") return "";

        const center = this.mapLibre.map.getCenter();
        const point = turf.point([center.lng, center.lat]);
        const feature = this.prefectures.find((prefecture) => {
            try {
                return turf.booleanPointInPolygon(point, prefecture);
            } catch (error) {
                console.warn("NewsTicker: 都道府県境界の判定に失敗しました。", error);
                return false;
            }
        });
        return String(feature?.properties?.["name:ja"] || feature?.properties?.name || "");
    }

    formatDate(value) {
        const match = String(value || "").match(/^\d{4}-(\d{2})(?:-(\d{2}))?$/);
        if (!match) return String(value || "");
        return `${Number(match[1])}月${match[2] ? `${Number(match[2])}日` : ""}`;
    }

    hide() {
        this.stopTimer();
        this.currentKey = "";
        this.currentIndex = 0;
        this.currentEvents = [];
        this.activeItem = null;
        this.content?.replaceChildren();
        this.updateNavigationButtons();
        if (this.element) this.element.hidden = true;
    }

    stopTimer() {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }
}
