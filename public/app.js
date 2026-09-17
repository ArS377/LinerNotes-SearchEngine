const views = [...document.querySelectorAll("[data-view]")];
const searchForms = [...document.querySelectorAll("[data-search-form]")];
const searchInputs = [...document.querySelectorAll("[data-search-input]")];
const resultsTitle = document.querySelector("[data-results-title]");
const resultsSummary = document.querySelector("[data-results-summary]");
const resultsList = document.querySelector("[data-results-list]");
const songContent = document.querySelector("[data-song-content]");
const collectionContent = document.querySelector("[data-collection-content]");
const homeDiscovery = document.querySelector("[data-home-discovery]");
const audioDialog = document.querySelector("[data-audio-dialog]");
const toast = document.querySelector("[data-toast]");
const savedCount = document.querySelector("[data-saved-count]");
const audioCapability = document.querySelector("[data-audio-capability]");
const recentSearches = document.querySelector("[data-recent-searches]");
const audioForm = document.querySelector("[data-audio-form]");
const audioInput = document.querySelector("[data-audio-input]");
const audioLabel = document.querySelector("[data-audio-label]");
const audioStatus = document.querySelector("[data-audio-status]");
const savedKey = "liner-notes-saved";
const recentKey = "liner-notes-recent-searches";
let currentSong = null;
let capabilities = null;

function showView(name) {
  for (const view of views) {
    view.hidden = view.dataset.view !== name;
  }
  document.querySelector("#app").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function syncInputs(value) {
  for (const input of searchInputs) input.value = value;
}

function formatDate(value) {
  if (!value) return "Release date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function route(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  renderRoute();
}

function getSavedSlugs() {
  try {
    const value = JSON.parse(localStorage.getItem(savedKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateSavedCount() {
  savedCount.textContent = String(getSavedSlugs().length);
}

function isSaved(slug) {
  return getSavedSlugs().includes(slug);
}

function toggleSaved(slug) {
  const saved = new Set(getSavedSlugs());
  const willSave = !saved.has(slug);
  if (willSave) saved.add(slug);
  else saved.delete(slug);
  localStorage.setItem(savedKey, JSON.stringify([...saved]));
  updateSavedCount();
  return willSave;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function getRecentSearches() {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(value) ? value.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberSearch(query) {
  const searches = [
    query,
    ...getRecentSearches().filter(
      (candidate) => candidate.toLowerCase() !== query.toLowerCase()
    )
  ].slice(0, 6);
  localStorage.setItem(recentKey, JSON.stringify(searches));
  renderRecentSearches();
}

function renderRecentSearches() {
  const searches = getRecentSearches();
  recentSearches.hidden = searches.length === 0;
  recentSearches.innerHTML = searches.length
    ? `<span>Recent</span>${searches
        .map(
          (query) =>
            `<button type="button" data-example="${escapeHtml(query)}">${escapeHtml(query)}</button>`
        )
        .join("")}<button type="button" data-clear-history>Clear</button>`
    : "";
}

async function loadCapabilities() {
  try {
    const response = await fetch("/api/capabilities");
    if (!response.ok) return;
    capabilities = await response.json();
    audioCapability.textContent = capabilities.audioIdentification
      ? "Ready"
      : "Setup";
    audioCapability.classList.toggle(
      "is-ready",
      capabilities.audioIdentification
    );
    if (!capabilities.audioIdentification) {
      audioStatus.innerHTML = `
        <p>
          Audio recognition needs ACRCloud server credentials. Add the three
          <code>ACRCLOUD_*</code> values from <code>.env.example</code> to enable it.
        </p>
      `;
    }
    syncAssistantVisibility();
  } catch {
    capabilities = null;
    audioCapability.textContent = "Offline";
    syncAssistantVisibility();
  }
}

function syncAssistantVisibility() {
  for (const panel of document.querySelectorAll("[data-assistant-panel]")) {
    panel.hidden = !capabilities?.musicAssistant;
  }
}

function renderAssistantPanel(kind) {
  const heading = kind === "song" ? "Ask about this recording" : "Ask about these results";
  const placeholder = kind === "song"
    ? "Ask about influences, versions, credits, or where to listen next"
    : "Ask for listening paths, likely matches, or context around this search";
  return `
    <section class="assistant-panel" data-assistant-panel data-assistant-kind="${kind}" hidden>
      <div>
        <p class="eyebrow">DeepInfra assistant</p>
        <h2>${heading}</h2>
      </div>
      <form class="assistant-form" data-assistant-form>
        <label class="sr-only">Ask DeepInfra</label>
        <textarea name="prompt" rows="3" placeholder="${placeholder}" required></textarea>
        <button type="submit">Ask DeepInfra</button>
      </form>
      <div class="assistant-response" data-assistant-response aria-live="polite"></div>
    </section>
  `;
}

function assistantContext(panel) {
  if (panel.dataset.assistantKind === "song" && currentSong) {
    return {
      type: "song",
      song: {
        title: currentSong.title,
        artist: currentSong.artist?.name,
        album: currentSong.album,
        releaseDate: currentSong.releaseDate,
        version: currentSong.version,
        genres: currentSong.genres,
        story: currentSong.story,
        sources: currentSong.sources,
        links: {
          appleMusicUrl: currentSong.appleMusicUrl,
          spotifyUrl: currentSong.spotifyUrl || currentSong.spotifySearchUrl,
          musicBrainzUrl: currentSong.musicBrainzUrl
        }
      }
    };
  }

  const url = new URL(window.location.href);
  return {
    type: "search",
    query: url.searchParams.get("q") || "",
    visibleResults: [...resultsList.querySelectorAll(".result-card")]
      .slice(0, 8)
      .map((card) => ({
        title: card.querySelector(".result-title")?.textContent || "",
        meta: card.querySelector(".result-meta")?.textContent || ""
      }))
  };
}

function renderAssistantAnswer(body) {
  const answer = escapeHtml(body.answer || "DeepInfra did not return an answer.");
  const citations = Array.isArray(body.citations) && body.citations.length
    ? `<ul>${body.citations
        .slice(0, 5)
        .map((citation) => `<li>${escapeHtml(citation.title || citation.url || citation)}</li>`)
        .join("")}</ul>`
    : "";
  const model = body.model ? `<small>Model: ${escapeHtml(body.model)}</small>` : "";
  return `<p>${answer}</p>${citations}${model}`;
}

function renderResult(result, { showMatch = true } = {}) {
  const title = escapeHtml(result.title);
  const artist = escapeHtml(result.artist);
  const href = `/songs/${encodeURIComponent(result.slug)}`;
  const releaseYear = result.releaseDate
    ? String(result.releaseDate).slice(0, 4)
    : "Date unknown";
  return `
    <a class="result-card${result.external ? " global-result" : ""}" href="${href}">
      <span
        class="result-art${result.thumbnailUrl || result.artworkUrl ? " has-artwork" : ""}"
        style="--art-color: ${escapeHtml(result.color)}${
          result.thumbnailUrl || result.artworkUrl
            ? `; background-image: url('${escapeHtml(result.thumbnailUrl || result.artworkUrl)}')`
            : ""
        }"
        aria-hidden="true"
      ></span>
      <span>
        ${showMatch && result.matchReason ? `<span class="match-badge">${escapeHtml(result.matchReason)}</span>` : ""}
        ${
          result.providers?.length
            ? result.providers.map((provider) => `<span class="source-badge">${escapeHtml(provider)}</span>`).join("")
            : result.source
              ? `<span class="source-badge">${escapeHtml(result.source)}</span>`
              : ""
        }
        ${
          Number.isFinite(result.spotifyPopularity)
            ? `<span class="popularity-badge">Spotify popularity ${result.spotifyPopularity}</span>`
            : ""
        }
        <span class="result-title">${title}</span>
        <span class="result-meta">${artist} · ${escapeHtml(result.album)}</span>
      </span>
      <span class="result-version">${escapeHtml(result.version)}<br>${releaseYear}</span>
      <span class="result-arrow" aria-hidden="true">↗</span>
    </a>
  `;
}

function renderRecordingGrid(recordings) {
  return `
    <div class="recording-grid">
      ${recordings
        .map(
          (recording) => `
            <a class="recording-tile" href="/songs/${encodeURIComponent(recording.slug)}">
              <span
                class="recording-tile-art"
                style="--art-color: ${escapeHtml(recording.color)}"
                aria-hidden="true"
              ></span>
              <span class="recording-tile-title">${escapeHtml(recording.title)}</span>
              <span class="recording-tile-meta">${escapeHtml(recording.artist)} · ${recording.releaseDate.slice(0, 4)}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function suggestionHref(result) {
  return `/songs/${encodeURIComponent(result.slug)}`;
}

function renderSuggestions(results) {
  if (results.length === 0) {
    return '<div class="suggestion-empty">No quick matches. Press Enter for full search.</div>';
  }
  return results
    .map(
      (result, index) => `
        <a
          class="suggestion-item"
          href="${suggestionHref(result)}"
          role="option"
          aria-selected="false"
          data-suggestion-index="${index}"
        >
          <span
            class="suggestion-art${result.thumbnailUrl || result.artworkUrl ? " has-artwork" : ""}"
            style="--art-color: ${escapeHtml(result.color)}${
              result.thumbnailUrl || result.artworkUrl
                ? `; background-image: url('${escapeHtml(result.thumbnailUrl || result.artworkUrl)}')`
                : ""
            }"
            aria-hidden="true"
          ></span>
          <span>
            <strong>${escapeHtml(result.title)}</strong>
            <small>${escapeHtml(result.artist)} · ${escapeHtml(result.source || "Catalog")}</small>
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      `
    )
    .join("");
}

function setupSuggestions(form, formIndex) {
  const input = form.querySelector("[data-search-input]");
  const panel = document.createElement("div");
  panel.id = `search-suggestions-${formIndex}`;
  panel.className = "suggestions-panel";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  form.append(panel);

  let controller = null;
  let timer = null;
  let activeIndex = -1;

  function close() {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    controller?.abort();
  }

  function setActive(index) {
    const items = [...panel.querySelectorAll("[data-suggestion-index]")];
    if (items.length === 0) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
      item.id = `${panel.id}-option-${itemIndex}`;
      if (active) input.setAttribute("aria-activedescendant", item.id);
    });
  }

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      close();
      return;
    }

    timer = window.setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const body = await response.json();
        if (input.value.trim() !== query) return;
        panel.innerHTML = renderSuggestions(body.suggestions);
        panel.hidden = false;
        input.setAttribute("aria-expanded", "true");
        activeIndex = -1;
      } catch (error) {
        if (error.name !== "AbortError") close();
      }
    }, 220);
  });

  input.addEventListener("keydown", (event) => {
    if (panel.hidden) return;
    const items = [...panel.querySelectorAll("[data-suggestion-index]")];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      route(items[activeIndex].getAttribute("href"));
      close();
    } else if (event.key === "Escape") {
      close();
    }
  });

  form.addEventListener("submit", close);
  form.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!form.contains(document.activeElement)) close();
    }, 0);
  });
}

async function loadDiscover() {
  if (homeDiscovery.dataset.loaded === "true") return;
  try {
    const response = await fetch("/api/discover");
    if (!response.ok) throw new Error("Discover request failed");
    const body = await response.json();
    homeDiscovery.dataset.loaded = "true";
    homeDiscovery.innerHTML = `
      <div class="discovery-heading">
        <div>
          <p class="eyebrow">Start somewhere good</p>
          <h2>Featured recordings</h2>
        </div>
        <a class="text-link" href="/browse">Browse all genres <span aria-hidden="true">↗</span></a>
      </div>
      ${renderRecordingGrid(body.featured.slice(0, 4))}
      <div class="genre-cloud">
        ${body.genres
          .map(
            (genre) => `
              <a href="/genres/${encodeURIComponent(genre.slug)}" style="--genre-color: ${escapeHtml(genre.color)}">
                <span>${escapeHtml(genre.name)}</span>
                <small>${genre.count} ${genre.count === 1 ? "recording" : "recordings"}</small>
              </a>
            `
          )
          .join("")}
      </div>
    `;
  } catch {
    homeDiscovery.innerHTML = "";
  }
}

async function renderSearch(query, { append = false, offset = 0 } = {}) {
  showView("results");
  syncInputs(query);
  if (!append) {
    resultsTitle.textContent = `“${query}”`;
    resultsSummary.textContent = "";
    resultsList.innerHTML = '<div class="loading-state">Searching the catalog…</div>';
  } else {
    resultsList.querySelector("[data-load-more]")?.remove();
    resultsList.insertAdjacentHTML(
      "beforeend",
      '<div class="loading-state load-more-state">Searching deeper…</div>'
    );
  }
  document.title = `${query} - Liner Notes`;

  try {
    const response = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&offset=${offset}`
    );
    if (!response.ok) throw new Error("Search request failed");
    const body = await response.json();
    resultsList.querySelector(".load-more-state")?.remove();
    const coverage = body.remoteStatus === "unavailable"
      ? "Global catalog temporarily unavailable; showing local matches."
      : `${body.localCount} enriched locally · ${body.globalCount} global matches`;
    const providerCoverage = body.providerStatus
      ? ` · MusicBrainz ${body.providerStatus.musicBrainz || "unknown"} · Apple ${body.providerStatus.apple || "unknown"} · Spotify ${body.providerStatus.spotify || "not configured"}`
      : "";
    if (!append) {
      resultsSummary.textContent = `${body.results.length} ${
        body.results.length === 1 ? "recording" : "recordings"
      } on this page · ${coverage}${providerCoverage}`;
    }

    if (body.results.length === 0 && !append) {
      resultsList.innerHTML = `
        <div class="empty-state">
          <h2>Nothing surfaced yet.</h2>
          <p>Try a title, artist, or a longer lyric fragment.</p>
        </div>
      `;
      return;
    }

    const markup = body.results.map(renderResult).join("");
    if (append) resultsList.insertAdjacentHTML("beforeend", markup);
    else resultsList.innerHTML = markup;
    if (body.hasMore) {
      resultsList.insertAdjacentHTML(
        "beforeend",
        `<button class="load-more" type="button" data-load-more="${body.nextOffset}" data-load-query="${escapeHtml(query)}">
          Load more recordings
        </button>`
      );
    }
  } catch {
    resultsList.querySelector(".load-more-state")?.remove();
    if (append) {
      resultsList.insertAdjacentHTML(
        "beforeend",
        `<button class="load-more" type="button" data-load-more="${offset}" data-load-query="${escapeHtml(query)}">Retry loading more</button>`
      );
    } else {
      resultsList.innerHTML = `
        <div class="error-state">
          <h2>Search took a wrong turn.</h2>
          <p>Please try again in a moment.</p>
        </div>
      `;
    }
  }
}

function renderCredits(credits) {
  return credits
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `
    )
    .join("");
}

function renderChartFacts(facts) {
  if (facts.length === 0) {
    return '<p class="provider-note">No verified chart fact is available for this recording yet.</p>';
  }

  return facts
    .map(
      (fact) => `
        <div class="chart-fact">
          <span>${escapeHtml(fact.label)}</span>
          <strong>${escapeHtml(fact.value)}</strong>
          <small>${escapeHtml(fact.source)} · ${escapeHtml(fact.asOf)}</small>
          ${fact.description ? `<p>${escapeHtml(fact.description)}</p>` : ""}
        </div>
      `
    )
    .join("");
}

function applySpotifyPopularity(song) {
  if (!Number.isFinite(song.spotifyPopularity)) return song;

  song.chartFacts = [
    ...(song.chartFacts || []).filter(
      (fact) => fact.label !== "Spotify popularity"
    ),
    {
      label: "Spotify popularity",
      value: `${song.spotifyPopularity} / 100`,
      asOf: new Date().toISOString().slice(0, 10),
      source: "Spotify",
      description:
        "An algorithmic score influenced by total and recent plays; it is not a lifetime stream count."
    }
  ];
  song.sources = [...new Set([...(song.sources || []), "Spotify"])];
  song.sourceFacts = [
    ...(song.sourceFacts || []).filter((fact) => fact.source !== "Spotify"),
    {
      source: "Spotify",
      fields: ["track link", "popularity score"],
      retrievedAt: new Date().toISOString(),
      confidence: "matched track metadata"
    }
  ];
  return song;
}

function renderRelated(related) {
  if (related.length === 0) return "";
  return `
    <section class="related-section">
      <span class="section-number">04 / RELATED RECORDINGS</span>
      <h2>Other versions</h2>
      ${related
        .map(
          (item) => `
            <a class="related-link" href="/songs/${encodeURIComponent(item.slug)}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.version)}</span>
              <span aria-hidden="true">↗</span>
            </a>
          `
        )
        .join("")}
    </section>
  `;
}

function correctionUrl(song) {
  const title = `Correction: ${song.title} by ${song.artist.name}`;
  const body = [
    "## Recording",
    `- Title: ${song.title}`,
    `- Artist: ${song.artist.name}`,
    `- Page: ${window.location.href}`,
    song.musicBrainzId ? `- MusicBrainz ID: ${song.musicBrainzId}` : null,
    song.appleTrackId ? `- Apple track ID: ${song.appleTrackId}` : null,
    "",
    "## What should be corrected?",
    "",
    "Describe the incorrect field and include a reliable source."
  ].filter((line) => line !== null).join("\n");
  return `https://github.com/ArS377/SearchEngine/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=data-correction`;
}

function renderSourceFacts(song) {
  const facts = song.sourceFacts?.length
    ? song.sourceFacts
    : song.sources.map((source) => ({
        source,
        fields: ["recording metadata"],
        confidence: "attributed source",
        retrievedAt: null
      }));

  return facts
    .map(
      (fact) => `
        <li class="source-fact">
          <strong>${escapeHtml(fact.source)}</strong>
          <span>${fact.fields.map(escapeHtml).join(" · ")}</span>
          <small>
            ${escapeHtml(fact.confidence)}
            ${fact.retrievedAt ? ` · retrieved ${formatDate(fact.retrievedAt)}` : ""}
          </small>
        </li>
      `
    )
    .join("");
}

function renderArtistLinks(artist) {
  const links = [
    ["Official site", artist.officialUrl],
    ["Wikipedia", artist.wikipediaUrl],
    ["Spotify", artist.spotifyUrl],
    ["Lyrics profile", artist.lyricsUrl]
  ].filter(([, url]) => url);
  if (links.length === 0) return "";

  return `
    <div class="artist-links">
      ${links
        .map(
          ([label, url]) =>
            `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`
        )
        .join("")}
    </div>
  `;
}

function renderSongMarkup(song) {
  const shadow = `${song.color}99`;
  const spotifyHref = song.spotifyUrl || song.spotifySearchUrl;
  const spotifyLabel = song.spotifyUrl ? "Open exact track on Spotify ↗" : "Search on Spotify ↗";
  return `
    <header class="song-hero">
      <div
        class="song-art${song.artworkUrl ? " has-artwork" : ""}"
        style="--art-color: ${escapeHtml(song.color)}; --art-shadow: ${escapeHtml(shadow)}${
          song.artworkUrl ? `; background-image: url('${escapeHtml(song.artworkUrl)}')` : ""
        }"
        role="img"
        aria-label="Abstract artwork for ${escapeHtml(song.title)}"
      ></div>
      <div>
        <p class="song-kicker">
          ${escapeHtml(song.version)}
          ${song.external ? " · Global catalog record" : " · Enriched locally"}
        </p>
        <h1>${escapeHtml(song.title)}</h1>
        <p class="song-artist">
          ${
            song.artist.slug
              ? `<a href="/artists/${encodeURIComponent(song.artist.slug)}">${escapeHtml(song.artist.name)} ↗</a>`
              : escapeHtml(song.artist.name)
          }
        </p>
        <div class="song-facts">
          <span>${formatDate(song.releaseDate)}</span>
          <span>${escapeHtml(song.album)}</span>
          <span>${escapeHtml(song.duration)}</span>
          <span>${song.genres.map(escapeHtml).join(" · ")}</span>
        </div>
        <div class="song-actions">
          ${
            spotifyHref
              ? `<a class="${song.spotifyUrl ? "primary-action" : "secondary-action"}" href="${escapeHtml(spotifyHref)}" target="_blank" rel="noreferrer">${spotifyLabel}</a>`
              : ""
          }
          ${
            song.appleMusicUrl
              ? `<a class="primary-action apple-action" href="${escapeHtml(song.appleMusicUrl)}" target="_blank" rel="noreferrer">Open in Apple Music ↗</a>`
              : ""
          }
          ${
            song.musicBrainzUrl
              ? `<a class="secondary-action" href="${escapeHtml(song.musicBrainzUrl)}" target="_blank" rel="noreferrer">View source ↗</a>`
              : ""
          }
          <button class="secondary-action" type="button" data-save-song="${escapeHtml(song.slug)}">
            ${isSaved(song.slug) ? "Saved ✓" : "Save song"}
          </button>
          <button class="secondary-action" type="button" data-share-song>Share</button>
          <button class="secondary-action" type="button" data-audio-trigger>Identify from audio</button>
        </div>
      </div>
    </header>

    ${
      song.previewUrl
        ? `<section class="preview-player">
            <div>
              <span class="section-number">LISTEN</span>
              <strong>Preview this recording</strong>
              <span>Provided by Apple Music</span>
            </div>
            <audio controls preload="metadata" src="${escapeHtml(song.previewUrl)}" data-preview-player>
              Your browser does not support audio playback.
            </audio>
            <p class="preview-error" data-preview-error hidden>
              This preview is unavailable. Use Apple Music or Spotify above to play the recording.
            </p>
          </section>`
        : ""
    }

    ${renderAssistantPanel("song")}

    <div class="song-body">
      <div>
        <section class="song-section">
          <span class="section-number">01 / LYRICS</span>
          <h2>Lyrics</h2>
          <div class="lyrics-unavailable">
            <p>${escapeHtml(song.lyrics.message)}</p>
            <span class="provider-note">
              We do not scrape or reproduce unlicensed lyrics.
            </span>
            ${
              song.lyrics.searchUrl
                ? `<a class="lyrics-destination" href="${escapeHtml(song.lyrics.searchUrl)}" target="_blank" rel="noreferrer">Search for these lyrics on Genius ↗</a>`
                : ""
            }
          </div>
        </section>

        <section class="song-section story-section">
          <span class="section-number">02 / THE STORY</span>
          <h2>Behind the song</h2>
          <p>${escapeHtml(song.story)}</p>
          ${
            song.external
              ? `<div class="enrichment-callout">
                  <strong>Global result</strong>
                  <span>This page was assembled on demand from linked open and commercial music sources. Song-specific editorial interpretation and licensed full lyrics may still be unavailable.</span>
                </div>`
              : ""
          }
        </section>
      </div>

      <aside class="song-sidebar">
        <section>
          <h3>Credits</h3>
          <dl class="credit-list">${renderCredits(song.credits)}</dl>
        </section>
        <section>
          <h3>About the artist</h3>
          ${
            song.artist.imageUrl
              ? `<img class="artist-image" src="${escapeHtml(song.artist.imageUrl)}" alt="${escapeHtml(song.artist.name)}">`
              : ""
          }
          <p><strong>${escapeHtml(song.artist.name)}</strong></p>
          <p class="artist-summary">${escapeHtml(song.artist.summary)}</p>
          <p class="provider-note">${escapeHtml(song.artist.country)}</p>
          ${
            song.artist.genres?.length
              ? `<p class="artist-genres">${song.artist.genres.map(escapeHtml).join(" · ")}</p>`
              : ""
          }
          ${renderArtistLinks(song.artist)}
        </section>
        <section>
          <h3>Listening and chart signals</h3>
          ${renderChartFacts(song.chartFacts)}
          <p class="provider-note">
            No estimated Spotify lifetime totals. Every metric is labeled by source and date.
          </p>
        </section>
        <section>
          <h3>Sources</h3>
          <ul class="source-facts">${renderSourceFacts(song)}</ul>
          <a
            class="correction-link"
            href="${escapeHtml(correctionUrl(song))}"
            target="_blank"
            rel="noreferrer"
          >
            Report a data correction ↗
          </a>
        </section>
      </aside>
    </div>
    ${renderRelated(song.related)}
  `;
}

async function renderSong(slug) {
  showView("song");
  songContent.innerHTML = '<div class="loading-state compact-search-wrap">Opening the liner notes…</div>';

  try {
    const response = await fetch(songApiUrl(slug));
    if (!response.ok) throw new Error("Song request failed");
    const song = await response.json();
    if (!song.external) {
      const playbackResponse = await fetch(
        `/api/playback/${encodeURIComponent(song.slug)}`
      ).catch(() => null);
      if (playbackResponse?.ok) {
        Object.assign(song, await playbackResponse.json());
      }
    }
    applySpotifyPopularity(song);
    currentSong = song;
    document.title = `${song.title} by ${song.artist.name} - Liner Notes`;
    songContent.innerHTML = renderSongMarkup(song);
    syncAssistantVisibility();
    const previewPlayer = songContent.querySelector("[data-preview-player]");
    previewPlayer?.addEventListener("error", () => {
      previewPlayer.hidden = true;
      songContent.querySelector("[data-preview-error]").hidden = false;
    });
  } catch {
    songContent.innerHTML = `
      <div class="error-state compact-search-wrap">
        <h2>That recording is not in the catalog.</h2>
        <a class="text-link" href="/">Return to search</a>
      </div>
    `;
  }
}

function songApiUrl(slug) {
  if (slug.startsWith("mbid-")) {
    return `/api/external-songs/${encodeURIComponent(slug.slice("mbid-".length))}`;
  }
  if (slug.startsWith("apple-")) {
    return `/api/apple-songs/${encodeURIComponent(slug.slice("apple-".length))}`;
  }
  return `/api/songs/${encodeURIComponent(slug)}`;
}

async function renderArtist(slug) {
  showView("collection");
  collectionContent.innerHTML = '<div class="loading-state collection-shell">Loading artist…</div>';
  try {
    const response = await fetch(artistApiUrl(slug));
    if (!response.ok) throw new Error("Artist request failed");
    const artist = await response.json();
    document.title = `${artist.name} - Liner Notes`;
    collectionContent.innerHTML = `
      <header class="collection-hero">
        <p class="eyebrow">Artist</p>
        ${
          artist.imageUrl
            ? `<img class="collection-artist-image" src="${escapeHtml(artist.imageUrl)}" alt="${escapeHtml(artist.name)}">`
            : ""
        }
        <h1>${escapeHtml(artist.name)}</h1>
        <p class="collection-summary">${escapeHtml(artist.summary)}</p>
        <div class="collection-meta">
          <span>${escapeHtml(artist.source || "Liner Notes")}</span>
          <span>${escapeHtml(artist.country)}</span>
          <span>${artist.recordings.length} ${artist.recordings.length === 1 ? "recording" : "recordings"}</span>
          <span>${artist.genres.map(escapeHtml).join(" · ")}</span>
        </div>
        ${
          artist.appleMusicUrl
            ? `<a class="text-link" href="${escapeHtml(artist.appleMusicUrl)}" target="_blank" rel="noreferrer">Open artist in Apple Music <span aria-hidden="true">↗</span></a>`
            : ""
        }
        ${renderArtistLinks(artist)}
      </header>
      <section class="collection-list">
        <span class="section-number">DISCOGRAPHY</span>
        ${artist.recordings.map((recording) => renderResult(recording, { showMatch: false })).join("")}
      </section>
    `;
  } catch {
    renderCollectionError("That artist is not in the catalog.");
  }
}

function artistApiUrl(slug) {
  if (slug.startsWith("mbid-")) {
    return `/api/external-artists/${encodeURIComponent(slug.slice("mbid-".length))}`;
  }
  if (slug.startsWith("apple-")) {
    return `/api/apple-artists/${encodeURIComponent(slug.slice("apple-".length))}`;
  }
  return `/api/artists/${encodeURIComponent(slug)}`;
}

async function renderGenre(slug) {
  showView("collection");
  collectionContent.innerHTML = '<div class="loading-state collection-shell">Opening genre…</div>';
  try {
    const response = await fetch(`/api/genres/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error("Genre request failed");
    const genre = await response.json();
    document.title = `${genre.name} music - Liner Notes`;
    collectionContent.innerHTML = `
      <header class="collection-hero genre-hero" style="--genre-color: ${escapeHtml(genre.color)}">
        <p class="eyebrow">Browse by genre</p>
        <h1>${escapeHtml(genre.name)}</h1>
        <p class="collection-summary">
          ${genre.count} ${genre.count === 1 ? "recording" : "recordings"} in the catalog.
        </p>
      </header>
      <section class="collection-list">
        ${genre.recordings.map((recording) => renderResult(recording, { showMatch: false })).join("")}
      </section>
    `;
  } catch {
    renderCollectionError("That genre is not in the catalog.");
  }
}

async function renderBrowse() {
  showView("collection");
  collectionContent.innerHTML = '<div class="loading-state collection-shell">Loading the catalog…</div>';
  try {
    const response = await fetch("/api/discover");
    if (!response.ok) throw new Error("Discover request failed");
    const body = await response.json();
    document.title = "Browse music - Liner Notes";
    collectionContent.innerHTML = `
      <header class="collection-hero browse-hero">
        <p class="eyebrow">Explore the catalog</p>
        <h1>Follow a sound.</h1>
        <p class="collection-summary">Browse genres or start with a landmark recording.</p>
      </header>
      <section class="browse-content">
        <div class="genre-cloud genre-cloud-large">
          ${body.genres
            .map(
              (genre) => `
                <a href="/genres/${encodeURIComponent(genre.slug)}" style="--genre-color: ${escapeHtml(genre.color)}">
                  <span>${escapeHtml(genre.name)}</span>
                  <small>${genre.count}</small>
                </a>
              `
            )
            .join("")}
        </div>
        <span class="section-number">FEATURED RECORDINGS</span>
        ${renderRecordingGrid(body.featured)}
      </section>
    `;
  } catch {
    renderCollectionError("The catalog could not be loaded.");
  }
}

async function renderSaved() {
  showView("collection");
  const slugs = getSavedSlugs();
  document.title = "Saved songs - Liner Notes";
  if (slugs.length === 0) {
    collectionContent.innerHTML = `
      <header class="collection-hero">
        <p class="eyebrow">Your library</p>
        <h1>Nothing saved yet.</h1>
        <p class="collection-summary">Save a song from its page and it will stay here on this device.</p>
        <a class="text-link" href="/browse">Browse the catalog <span aria-hidden="true">↗</span></a>
      </header>
    `;
    return;
  }

  collectionContent.innerHTML = '<div class="loading-state collection-shell">Opening your saved songs…</div>';
  const responses = await Promise.all(
    slugs.map((slug) => fetch(songApiUrl(slug)))
  );
  const songs = (await Promise.all(
    responses.filter((response) => response.ok).map((response) => response.json())
  )).map((song) => ({
    ...song,
    artist: song.artist.name,
    artistSlug: song.artist.slug
  }));

  collectionContent.innerHTML = `
    <header class="collection-hero">
      <p class="eyebrow">Your library</p>
      <h1>Saved songs</h1>
      <p class="collection-summary">${songs.length} ${songs.length === 1 ? "recording" : "recordings"}, stored on this device.</p>
    </header>
    <section class="collection-list">
      ${songs.map((song) => renderResult(song, { showMatch: false })).join("")}
    </section>
  `;
}

function renderCollectionError(message) {
  collectionContent.innerHTML = `
    <div class="error-state collection-shell">
      <h2>${escapeHtml(message)}</h2>
      <a class="text-link" href="/browse">Browse music</a>
    </div>
  `;
}

function renderRoute() {
  const url = new URL(window.location.href);
  currentSong = null;
  if (url.pathname === "/about") {
    document.title = "About - Liner Notes";
    showView("about");
    return;
  }

  if (url.pathname.startsWith("/songs/")) {
    renderSong(decodeURIComponent(url.pathname.slice("/songs/".length)));
    return;
  }

  if (url.pathname.startsWith("/artists/")) {
    renderArtist(decodeURIComponent(url.pathname.slice("/artists/".length)));
    return;
  }

  if (url.pathname.startsWith("/genres/")) {
    renderGenre(decodeURIComponent(url.pathname.slice("/genres/".length)));
    return;
  }

  if (url.pathname === "/browse") {
    renderBrowse();
    return;
  }

  if (url.pathname === "/saved") {
    renderSaved();
    return;
  }

  const query = url.searchParams.get("q");
  if (url.pathname === "/search" && query) {
    renderSearch(query);
    return;
  }

  document.title = "Liner Notes - Find the song. Know the story.";
  syncInputs("");
  showView("home");
  loadDiscover();
}

for (const [formIndex, form] of searchForms.entries()) {
  setupSuggestions(form, formIndex);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(form).get("q").trim();
    if (!query) return;
    rememberSearch(query);
    route(`/search?q=${encodeURIComponent(query)}`);
  });
}

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-assistant-form]")) return;
  event.preventDefault();
  const form = event.target;
  const panel = form.closest("[data-assistant-panel]");
  const responseNode = panel.querySelector("[data-assistant-response]");
  const submit = form.querySelector("button[type='submit']");
  const prompt = new FormData(form).get("prompt").trim();
  if (!prompt) return;

  responseNode.textContent = "Asking DeepInfra...";
  submit.disabled = true;
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        context: assistantContext(panel)
      })
    });
    const body = await response.json();
    if (response.status === 503) {
      responseNode.innerHTML = `
        <p>DeepInfra is not configured on this server.</p>
        <small>Required: ${body.required.map(escapeHtml).join(", ")}</small>
      `;
      return;
    }
    if (!response.ok) throw new Error(body.error || "DeepInfra request failed");
    responseNode.innerHTML = renderAssistantAnswer(body);
  } catch (error) {
    responseNode.textContent = error.message || "DeepInfra request failed.";
  } finally {
    submit.disabled = false;
  }
});

audioInput.addEventListener("change", () => {
  const file = audioInput.files?.[0];
  audioLabel.textContent = file ? file.name : "Choose an audio clip";
  audioStatus.textContent = "";
});

audioForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = audioInput.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    audioStatus.textContent = "Choose a clip smaller than 10 MB.";
    return;
  }

  audioStatus.textContent = "Listening…";
  const submit = audioForm.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    const response = await fetch("/api/identify", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream"
      },
      body: file
    });
    const body = await response.json();
    if (response.status === 503) {
      audioStatus.innerHTML = `
        <p>Audio identification is not configured on this server.</p>
        <small>Required: ${body.required.map(escapeHtml).join(", ")}</small>
      `;
      return;
    }
    if (!response.ok) throw new Error(body.error || "Identification failed");
    if (!body.matched || body.results.length === 0) {
      audioStatus.textContent = "No confident match was found. Try a clearer 10–20 second clip.";
      return;
    }

    const match = body.results[0];
    audioStatus.innerHTML = `
      <p><strong>Matched:</strong> ${escapeHtml(body.title)} by ${escapeHtml(body.artist)}</p>
      <a class="dialog-result" href="/songs/${encodeURIComponent(match.slug)}">
        Open ${escapeHtml(match.title)} <span aria-hidden="true">↗</span>
      </a>
    `;
  } catch (error) {
    audioStatus.textContent = error.message || "Audio identification failed.";
  } finally {
    submit.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save-song]");
  if (saveButton) {
    const saved = toggleSaved(saveButton.dataset.saveSong);
    saveButton.textContent = saved ? "Saved ✓" : "Save song";
    showToast(saved ? "Saved to your library" : "Removed from your library");
    return;
  }

  if (event.target.closest("[data-share-song]") && currentSong) {
    const shareData = {
      title: `${currentSong.title} by ${currentSong.artist.name}`,
      text: `Explore ${currentSong.title} on Liner Notes`,
      url: window.location.href
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
        .then(() => showToast("Link copied"))
        .catch(() => showToast("Copy failed"));
    } else {
      const field = document.createElement("textarea");
      field.value = window.location.href;
      field.setAttribute("readonly", "");
      field.className = "clipboard-field";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      showToast(copied ? "Link copied" : "Copy failed");
    }
    return;
  }

  const link = event.target.closest("a");
  if (
    link &&
    link.origin === window.location.origin &&
    !link.hasAttribute("download") &&
    link.target !== "_blank"
  ) {
    event.preventDefault();
    route(`${link.pathname}${link.search}`);
    return;
  }

  const example = event.target.closest("[data-example]");
  if (example) {
    route(`/search?q=${encodeURIComponent(example.dataset.example)}`);
    return;
  }

  if (event.target.closest("[data-clear-history]")) {
    localStorage.removeItem(recentKey);
    renderRecentSearches();
    return;
  }

  const loadMore = event.target.closest("[data-load-more]");
  if (loadMore) {
    loadMore.disabled = true;
    renderSearch(loadMore.dataset.loadQuery, {
      append: true,
      offset: Number(loadMore.dataset.loadMore)
    });
    return;
  }

  if (event.target.closest("[data-audio-trigger]")) {
    audioDialog.showModal();
  }

  if (event.target.closest("[data-dialog-close]")) {
    audioDialog.close();
  }
});

audioDialog.addEventListener("click", (event) => {
  if (event.target === audioDialog) audioDialog.close();
});

window.addEventListener("popstate", renderRoute);
updateSavedCount();
renderRecentSearches();
loadCapabilities();
renderRoute();
