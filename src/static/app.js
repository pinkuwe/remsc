const API_BASE = '/api';
const audio = document.getElementById('audio');
const playPauseBtn = document.getElementById('play-pause-btn');
const progressFill = document.getElementById('progress-fill');
const timeCurrentEl = document.getElementById('time-current');
const timeTotalEl = document.getElementById('time-total');
const PLAY_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const artworkContainer = document.getElementById('now-playing-artwork');
const artworkImg = document.getElementById('now-playing-artwork-img');
const breadcrumbEl = document.getElementById('breadcrumb');
const playlistContentEl = document.getElementById('playlist-content');
const playlistControlsEl = document.querySelector('.library-actions');
const queueContentEl = document.getElementById('queue-content');
const queueCountEl = document.getElementById('queue-count');
const queuePanelEl = document.getElementById('queue-panel');
const queueChevronEl = document.getElementById('queue-chevron');
const searchInputEl = document.getElementById('search-input');
const searchClearBtnEl = document.getElementById('search-clear-btn');
const baseDocumentTitle = document.title;
const mediaSessionSupported = 'mediaSession' in navigator;
const positionStateSupported =
    mediaSessionSupported && typeof navigator.mediaSession.setPositionState === 'function';

// Repeat modes: 'off' | 'all' | 'one'
let repeatMode = 'off';

let currentPath = '';
let currentAlbums = [];
let currentPlaylist = [];
let currentDisplayTracks = [];
let currentTrackIndex = -1;
let currentM3U8 = '';
let tracksLoading = false;
let tracksError = '';
let playQueue = [];
let queueIndex = -1;
let isShuffleEnabled = false;
let scanPollTimer = null;
let queueCollapsed = true; // Start collapsed
let searchQuery = '';
let searchDebounceTimer = null;
let baseDisplayTracks = []; // Tracks after folder filter, before search

function cloneTrack(track) {
    if (!track) {
        return null;
    }
    return {
        name: track.name,
        displayName: track.displayName || track.name,
        relative_path: track.relative_path || track.name || '',
        url: track.url,
        title: track.title || null,
        artist: track.artist || null,
        album: track.album || null,
        duration: typeof track.duration === 'number' ? track.duration : null,
        artwork_url: track.artwork_url || null,
    };
}

function clearQueue() {
    playQueue = [];
    queueIndex = -1;
    isShuffleEnabled = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setPlayPauseVisual(false);
    currentTrackIndex = -1;
    updatePlayerInfo(null);
    updateTrackHighlight();
    updateShuffleButton();
    updateRepeatButton();
    renderQueue();
}

function setQueueFromTracks(tracks, startIndex = 0) {
    const cloned = tracks.map(cloneTrack).filter(Boolean);
    if (!cloned.length) {
        clearQueue();
        return;
    }
    playQueue = cloned;
    queueIndex = Math.max(0, Math.min(startIndex, playQueue.length - 1));
    playQueueTrack(queueIndex);
    updateShuffleButton();
    updateRepeatButton();
    renderQueue();
}

function playQueueTrack(index, autoplay = true) {
    if (!playQueue.length) {
        clearQueue();
        return;
    }
    queueIndex = ((index % playQueue.length) + playQueue.length) % playQueue.length;
    const track = playQueue[queueIndex];
    if (!track) {
        return;
    }
    if (audio.src !== track.url) {
        audio.src = track.url;
    }
    if (autoplay) {
        audio.play().catch((error) => {
            console.error('Playback error:', error);
        });
    } else {
        audio.pause();
    }
    const playlistIdx = currentPlaylist.findIndex((item) => item.url === track.url);
    currentTrackIndex = playlistIdx;
    updatePlayerInfo(track);
    updateTrackHighlight();
    updatePositionState();
    updateTimeDisplay();
    renderQueue();
}

function updateShuffleButton() {
    if (!shuffleBtn) {
        return;
    }
    const disabled = playQueue.length <= 1;
    if (disabled && isShuffleEnabled) {
        isShuffleEnabled = false;
    }
    shuffleBtn.disabled = disabled;
    shuffleBtn.classList.toggle('active', isShuffleEnabled && !disabled);
    shuffleBtn.setAttribute('aria-label', isShuffleEnabled ? 'Shuffle on' : 'Shuffle off');
    shuffleBtn.title = disabled
        ? 'Need at least two tracks to shuffle'
        : isShuffleEnabled
            ? 'Shuffle enabled'
            : 'Shuffle disabled';
}

function updateRepeatButton() {
    if (!repeatBtn) {
        return;
    }
    const noQueue = playQueue.length === 0;
    const effectiveMode = noQueue ? 'off' : repeatMode;
    repeatBtn.classList.toggle('active', effectiveMode === 'all');
    repeatBtn.classList.toggle('repeat-one', effectiveMode === 'one');
    repeatBtn.setAttribute('aria-label', `Repeat ${effectiveMode}`);
    repeatBtn.title = effectiveMode === 'off'
        ? 'Repeat: off'
        : effectiveMode === 'all'
            ? 'Repeat: all'
            : 'Repeat: one';
}

function cycleRepeat() {
    if (playQueue.length === 0) {
        return;
    }
    if (repeatMode === 'off') {
        repeatMode = 'all';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
    } else {
        repeatMode = 'off';
    }
    updateRepeatButton();
}

function addTrackToQueue(event, playlistIndex) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!currentPlaylist.length) {
        return;
    }
    const track = currentPlaylist[playlistIndex];
    if (!track) {
        return;
    }
    const cloned = cloneTrack(track);
    const wasEmpty = playQueue.length === 0;
    playQueue.push(cloned);
    if (wasEmpty) {
        queueIndex = 0;
        playQueueTrack(queueIndex);
    }
    updateShuffleButton();
    updateRepeatButton();
    renderQueue();
}

function removeFromQueue(event, queuePos) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (queuePos < 0 || queuePos >= playQueue.length) {
        return;
    }
    const removingCurrent = queuePos === queueIndex;
    playQueue.splice(queuePos, 1);

    if (playQueue.length === 0) {
        clearQueue();
        return;
    }
    if (removingCurrent) {
        if (queueIndex >= playQueue.length) {
            queueIndex = playQueue.length - 1;
        }
        playQueueTrack(queueIndex, !audio.paused);
    } else if (queuePos < queueIndex) {
        queueIndex -= 1;
    }
    updateShuffleButton();
    updateRepeatButton();
    renderQueue();
}

function playFromQueue(event, queuePos) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (queuePos < 0 || queuePos >= playQueue.length) {
        return;
    }
    playQueueTrack(queuePos, true);
}

function clearQueueHandler(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    clearQueue();
}

function moveQueueItem(event, fromPos, toPos) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (fromPos < 0 || fromPos >= playQueue.length) {
        return;
    }
    if (toPos < 0 || toPos >= playQueue.length) {
        return;
    }
    if (fromPos === toPos) {
        return;
    }
    const [moved] = playQueue.splice(fromPos, 1);
    playQueue.splice(toPos, 0, moved);

    // Adjust current index to keep the same track playing
    if (queueIndex === fromPos) {
        queueIndex = toPos;
    } else if (fromPos < queueIndex && toPos >= queueIndex) {
        queueIndex -= 1;
    } else if (fromPos > queueIndex && toPos <= queueIndex) {
        queueIndex += 1;
    }

    updateShuffleButton();
    updateRepeatButton();
    renderQueue();
}

function toggleQueue() {
    queueCollapsed = !queueCollapsed;
    if (queuePanelEl) {
        queuePanelEl.classList.toggle('collapsed', queueCollapsed);
    }
    if (queueChevronEl) {
        queueChevronEl.classList.toggle('expanded', !queueCollapsed);
    }
}

function onSearchInput() {
    if (!searchInputEl) {
        return;
    }
    const value = searchInputEl.value;
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
        searchQuery = value.trim().toLowerCase();
        if (searchClearBtnEl) {
            searchClearBtnEl.classList.toggle('hidden', !searchQuery);
        }
        applySearchFilter();
        updatePlaylistContent();
    }, 150);
}

function clearSearch() {
    if (searchInputEl) {
        searchInputEl.value = '';
    }
    searchQuery = '';
    if (searchClearBtnEl) {
        searchClearBtnEl.classList.add('hidden');
    }
    applySearchFilter();
    updatePlaylistContent();
    if (searchInputEl) {
        searchInputEl.focus();
    }
}

function applySearchFilter() {
    if (!searchQuery) {
        currentDisplayTracks = baseDisplayTracks;
        return;
    }
    const q = searchQuery;
    currentDisplayTracks = baseDisplayTracks.filter((track) => {
        const title = (track.title || track.display_name || track.displayName || track.name || '').toLowerCase();
        const artist = (track.artist || '').toLowerCase();
        const album = (track.album || '').toLowerCase();
        const relPath = (track.relative_path || '').toLowerCase();
        return title.includes(q) || artist.includes(q) || album.includes(q) || relPath.includes(q);
    });
}

function renderQueue() {
    if (!queueContentEl) {
        return;
    }
    if (queueCountEl) {
        queueCountEl.textContent = String(playQueue.length);
    }
    if (!playQueue.length) {
        queueContentEl.innerHTML = '<div class="queue-empty">Queue is empty. Click <strong>+</strong> on a track to add it.</div>';
        return;
    }
    const items = playQueue.map((track, idx) => {
        const isCurrent = idx === queueIndex;
        const artwork = track.artwork_url
            ? `<img src="${escapeHtml(track.artwork_url)}" alt="" />`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="100%" height="100%" fill="#1f1f1f"/><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="#a3a3a3"/></svg>`;
        const canMoveUp = idx > 0;
        const canMoveDown = idx < playQueue.length - 1;
        const upDisabled = canMoveUp ? '' : 'disabled';
        const downDisabled = canMoveDown ? '' : 'disabled';
        return `
            <div class="queue-item${isCurrent ? ' playing' : ''}" onclick="playFromQueue(event, ${idx})">
                <div class="queue-item-art">${artwork}</div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${escapeHtml(track.title || track.displayName || track.name || 'Untitled')}</div>
                    <div class="queue-item-meta">${escapeHtml(track.artist || '')}${track.artist && track.album ? ' • ' : ''}${escapeHtml(track.album || '')}</div>
                </div>
                <div class="queue-item-actions">
                    <button class="queue-move-btn" onclick="moveQueueItem(event, ${idx}, ${idx - 1})" ${upDisabled} title="Move up" aria-label="Move up">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 14l5-5 5 5z"/>
                        </svg>
                    </button>
                    <button class="queue-move-btn" onclick="moveQueueItem(event, ${idx}, ${idx + 1})" ${downDisabled} title="Move down" aria-label="Move down">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 10l5 5 5-5z"/>
                        </svg>
                    </button>
                    <button class="queue-remove-btn" onclick="removeFromQueue(event, ${idx})" title="Remove from queue" aria-label="Remove from queue">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    queueContentEl.innerHTML = items;
}

if (searchInputEl) {
    searchInputEl.addEventListener('input', onSearchInput);
    searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSearch();
        }
    });
}

setupMediaSessionHandlers();
setDocumentTitle(null);
setPlayPauseVisual(false);
updatePlayerInfo(null);
updateShuffleButton();
updateRepeatButton();
renderQueue();
loadFolder();

async function loadFolder(path = '') {
    try {
        tracksLoading = true;
        tracksError = '';
        if (scanPollTimer) {
            clearTimeout(scanPollTimer);
            scanPollTimer = null;
        }
        playlistContentEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span>Loading music library...</span></div>';
        const url = path ? `${API_BASE}/folder?path=${encodeURIComponent(path)}` : `${API_BASE}/folder`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch folder');
        }
        const data = await response.json();
        if (data.scanning) {
            currentPath = data.path || '';
            breadcrumbEl.textContent = currentPath || 'home';
            playlistContentEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span>Scanning music library...</span></div>';
            scanPollTimer = setTimeout(() => {
                loadFolder(path);
            }, 2000);
            return;
        }
        currentPath = data.path;
        currentAlbums = data.albums || [];
        currentM3U8 = data.m3u8 || '';
        breadcrumbEl.textContent = currentPath || 'home';

        if (!audio.src) {
            setDocumentTitle(null);

            updateMediaSession(null);
        }

        const tracks = Array.isArray(data.tracks) ? data.tracks : [];
        currentPlaylist = tracks.map((track, index) => ({
            ...track,
            displayName: track.display_name || track.name,
            playlistIndex: index,
        }));
        baseDisplayTracks = computeDisplayTracks(currentPlaylist);
        applySearchFilter();
        tracksLoading = false;
        tracksError = !currentPlaylist.length && !currentAlbums.length ? 'no tracks found' : '';

        updatePlaylistControls();
        updatePlaylistContent();
        if (playQueue.length && queueIndex >= 0 && playQueue[queueIndex]) {
            updatePlayerInfo(playQueue[queueIndex]);
        } else {
            updatePlayerInfo(null);
        }
        updateTrackHighlight();
        updateShuffleButton();
        updateRepeatButton();
        updateTimeDisplay();
        scrollPlaylistToTop();
    } catch (error) {
        console.error('Error loading folder:', error);
        tracksLoading = false;
        tracksError = 'failed to load folder';
        currentAlbums = [];
        currentPlaylist = [];
        currentDisplayTracks = [];
        if (scanPollTimer) {
            clearTimeout(scanPollTimer);
            scanPollTimer = null;
        }
        updatePlaylistControls();
        updatePlaylistContent();
    }
}

function updatePlaylistControls() {
    const hasParent = Boolean(currentPath);
    const playlistUrl = currentPlaylistUrl();
    const hasTracks = currentPlaylist.length > 0;
    const disabledAttr = (enabled) => (enabled ? '' : 'disabled');

    playlistControlsEl.innerHTML = `
        <button class="action-btn" onclick="goBack()" ${disabledAttr(hasParent)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Back
        </button>
        <button class="action-btn action-btn--primary" onclick="playPlaylist()" ${disabledAttr(hasTracks)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            Play all
        </button>
        <button class="action-btn" id="rescan-btn" onclick="rescanLibrary()" aria-label="Rescan music library">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            Rescan
        </button>
        <div class="dropdown">
            <button class="action-btn dropdown-btn" onclick="toggleDropdown()" aria-label="More options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg> M3U8
            </button>
            <div class="dropdown-menu" id="dropdown-menu">
                <button class="dropdown-item" id="copy-btn" onclick="copyM3U8()" ${disabledAttr(!!playlistUrl)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                    Copy URL
                </button>
                <button class="dropdown-item" id="download-btn" onclick="downloadM3U8()" ${disabledAttr(!!playlistUrl)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    Download
                </button>
            </div>
        </div>
    `;
}
function updatePlaylistContent() {
    let html = '';

    if (currentAlbums.length > 0) {
        html += currentAlbums
            .map((album) => {
                const escapedPath = escapeJsString(album.path);
                return `
            <div class="album-row" onclick="loadFolder('${escapedPath}')">
              <div class="album-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89
                           2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                </svg>
              </div>
              <div class="album-name">${escapeHtml(album.name)}</div>
            </div>
          `;
            })
            .join('');

    }

    if (tracksLoading) {
        html += '<div class="loading"><div class="loading-spinner"></div><span>Loading tracks...</span></div>';
    } else if (tracksError) {
        html += `<div class="error">${escapeHtml(tracksError)}</div>`;
    } else if (searchQuery && currentDisplayTracks.length === 0 && baseDisplayTracks.length > 0) {
        html += `<div class="no-search-results">No tracks match &ldquo;<strong>${escapeHtml(searchQuery)}</strong>&rdquo;. Try a different search term or <a href="javascript:void(0)" onclick="clearSearch()" style="color:var(--accent-primary)">clear the search</a>.</div>`;
    } else if (currentDisplayTracks.length > 0) {

        html += currentDisplayTracks
            .map((track) => {
                const isPlaying = track.playlistIndex === currentTrackIndex;
                const albumArtwork = track.artwork_url  ?
                    `<img src="${escapeHtml(track.artwork_url || '')}" alt="Cover of ${escapeHtml(track.title || track.display_name)}" />`
                    :
                    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="100%" height="100%" fill="#1f1f1f"/><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="#a3a3a3"/></svg>`;
                return `
      <div class="track-row${isPlaying ? ' playing' : ''}"
           id="track-${track.playlistIndex}"
           onclick="playTrack(${track.playlistIndex})">

        <!-- Col 1: Artwork -->
        <div class="track-col artwork-col">
          ${albumArtwork}
        </div>

        <!-- Col 2: Title + Artist -->
        <div class="track-col info-col">
          <div class="track-title">${escapeHtml(track.title || track.display_name || track.name)}</div>
          <div class="track-artist">${escapeHtml(track.artist || '')}</div>
        </div>

        <!-- Col 3: Album -->
        <div class="track-col album-col">
          ${escapeHtml(track.album || '')}
        </div>

        <!-- Col 4: Duration + Add to queue -->
        <div class="track-col duration-col">
          <span class="track-duration-text">${formatDuration(track.duration || 0)}</span>
          <button class="queue-add-btn" onclick="addTrackToQueue(event, ${track.playlistIndex})" title="Add to queue" aria-label="Add to queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
            })
            .join('');

    }

    if (!html) {
        html = '<div class="error">No items found</div>';
    }

    playlistContentEl.innerHTML = html;
}


function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function playTrack(index) {
    if (!currentPlaylist.length) {
        return;
    }
    if (index < 0 || index >= currentPlaylist.length) {
        return;
    }
    const upcomingTracks = currentPlaylist.slice(index);
    setQueueFromTracks(upcomingTracks, 0);
}

function playPlaylist() {
    if (!currentPlaylist.length) {
        if (!currentM3U8) {
            alert('Playlist URL not available');
        } else {
            alert('No tracks found in playlist');
        }
        return;
    }
    setQueueFromTracks(currentPlaylist, 0);
}

function togglePlayback() {
    if (!audio.src || !audio.src.length) {
        if (playQueue.length) {
            const start = queueIndex >= 0 ? queueIndex : 0;
            playQueueTrack(start);
        } else if (currentPlaylist.length) {
            setQueueFromTracks(currentPlaylist, 0);
        }
        return;
    }

    if (audio.paused) {
        audio.play().catch((error) => console.error('Playback error:', error));
    } else {
        audio.pause();
    }
}

function nextTrack(forceAutoPlay = false) {
    if (!playQueue.length) {
        return;
    }
    const shouldPlay = forceAutoPlay || !audio.paused;

    // Repeat one: replay the same track
    if (repeatMode === 'one' && shouldPlay) {
        audio.currentTime = 0;
        audio.play().catch((error) => console.error('Playback error:', error));
        return;
    }

    let nextIndex;
    if (isShuffleEnabled && playQueue.length > 1) {
        do {
            nextIndex = Math.floor(Math.random() * playQueue.length);
        } while (nextIndex === queueIndex);
    } else {
        nextIndex = queueIndex + 1;
        // Repeat all: wrap around at the end
        if (nextIndex >= playQueue.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                // At end with no repeat: stop
                audio.pause();
                audio.currentTime = 0;
                return;
            }
        }
    }
    playQueueTrack(nextIndex, shouldPlay);
}

function previousTrack(forceAutoPlay = false) {
    if (!playQueue.length) {
        return;
    }
    const shouldPlay = forceAutoPlay || !audio.paused;
    // If we're past 3 seconds, restart current track
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        if (shouldPlay) {
            audio.play().catch((error) => console.error('Playback error:', error));
        }
        return;
    }
    const prevIndex = queueIndex - 1;
    playQueueTrack(prevIndex < 0 ? playQueue.length - 1 : prevIndex, shouldPlay);
}

function goBack() {
    if (!currentPath) {
        return;
    }
    const idx = currentPath.lastIndexOf('/');
    const parent = idx >= 0 ? currentPath.slice(0, idx) : '';
    loadFolder(parent);
}

function seekTo(event) {
    if (!audio.duration) {
        return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const percentage = (event.clientX - rect.left) / rect.width;
    audio.currentTime = percentage * audio.duration;
    updateProgress();
    updatePositionState();
    updateTimeDisplay();
}

function updatePlayerInfo(track) {
    const titleEl = document.getElementById('track-title');
    const infoEl = document.getElementById('track-info');
    if (!track) {
        titleEl.textContent = 'No track selected';
        infoEl.textContent = 'Ready to play';
        setDocumentTitle(null);
        updateMediaSession(null);
        setArtwork(null);
        return;
    }
    const displayName = track.displayName || track.name;
    titleEl.textContent = displayName;

    const metaParts = [];
    if (track.artist) {
        metaParts.push(track.artist);
    }
    if (track.album) {
        metaParts.push(track.album);
    }

    if (metaParts.length > 0) {
        infoEl.textContent = metaParts.join(' • ');
    } else {
        if (queueIndex >= 0 && playQueue.length > 1) {
            infoEl.textContent = `${queueIndex + 1} of ${playQueue.length}`;
        } else {
            infoEl.textContent = 'Unknown artist';
        }
    }

    setDocumentTitle(track);
    updateMediaSession(track);
    setArtwork(track.artwork_url || null);
}

function updateTrackHighlight() {
    updatePlaylistContent();
}

function updateProgress() {
    if (!progressFill) {
        return;
    }
    if (!audio.duration || Number.isNaN(audio.duration)) {
        progressFill.style.width = '0%';
        return;
    }
    const percentage = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${percentage}%`;
}

function updateTimeDisplay() {
    if (!timeCurrentEl || !timeTotalEl) {
        return;
    }
    const current = isFinite(audio.currentTime) ? audio.currentTime : 0;
    // Prefer audio.duration when available, fall back to track duration
    let total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!total && playQueue.length > 0 && queueIndex >= 0 && playQueue[queueIndex]) {
        total = playQueue[queueIndex].duration || 0;
    }
    timeCurrentEl.textContent = formatDuration(current);
    timeTotalEl.textContent = formatDuration(total);
}

function setPlayPauseVisual(isPlaying) {
    if (!playPauseBtn) {
        return;
    }
    playPauseBtn.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
    playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}

audio.addEventListener('play', () => {
    setPlayPauseVisual(true);
    updatePlaybackState('playing');
    updatePositionState();
    updateTimeDisplay();
});

audio.addEventListener('pause', () => {
    setPlayPauseVisual(false);
    updatePlaybackState('paused');
    updateTimeDisplay();
});

audio.addEventListener('ended', () => {
    updatePlaybackState('none');
    updateTimeDisplay();
    nextTrack(true);
});

audio.addEventListener('timeupdate', () => {
    updateProgress();
    updatePositionState();
    updateTimeDisplay();
});

audio.addEventListener('loadedmetadata', () => {
    updatePositionState();
    updateTimeDisplay();
});

audio.addEventListener('durationchange', () => {
    updatePositionState();
    updateTimeDisplay();
});

audio.addEventListener('ratechange', updatePositionState);

async function rescanLibrary() {
    const button = document.getElementById('rescan-btn');
    if (button) {
        button.disabled = true;
        button.textContent = 'rescanning...';
    }
    try {
        const response = await fetch(`${API_BASE.replace('/api', '')}/admin/rescan`);
        if (response.ok) {
            await loadFolder(currentPath);
        } else {
            throw new Error('rescan failed');
        }
    } catch (error) {
        alert('error rescanning library: ' + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'rescan';
        }
    }
}

function currentPlaylistUrl() {
    return currentM3U8 || '';
}

function copyM3U8() {
    const playlistUrl = currentPlaylistUrl();
    if (!playlistUrl) {
        return;
    }
    const btn = document.getElementById('copy-btn');
    const reset = () => {
        if (btn) {
            btn.classList.remove('copied');
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                Copy M3U8`;
        }
    };
    const markCopied = () => {
        if (btn) {
            btn.classList.add('copied');
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                Copied`;
            setTimeout(reset, 2000);
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(playlistUrl).then(markCopied).catch((error) => {
            console.error('Clipboard error:', error);
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = playlistUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        markCopied();
    }
}

async function downloadM3U8() {
    const playlistUrl = currentPlaylistUrl();
    if (!playlistUrl) {
        return;
    }
    try {
        const response = await fetch(playlistUrl);
        if (!response.ok) {
            throw new Error('failed to fetch playlist');
        }
        const text = await response.text();
        const blob = new Blob([text], { type: 'audio/x-mpegurl;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${sanitizeFileName(currentFolderLabel() || 'playlist')}.m3u8`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
    } catch (error) {
        console.error('Download failed:', error);
        window.open(playlistUrl, '_blank');
    }
}

function computeDisplayTracks(allTracks) {
    const normalizedPath = currentPath.replace(/\\+/g, '/');
    const prefix = normalizedPath ? `${normalizedPath}/` : '';
    const seen = new Set();
    const result = [];
    allTracks.forEach((track, index) => {
        const relPath = (track.relative_path || '').replace(/\\+/g, '/');
        if (prefix) {
            if (!relPath.startsWith(prefix)) {
                return;
            }
        } else if (normalizedPath) {
            return;
        }
        if (seen.has(relPath)) {
            return;
        }
        seen.add(relPath);
        result.push({
            name: track.displayName || track.name,
            url: track.url,
            playlistIndex: index,
            ...track
        });
    });
    return result;
}

function scrollPlaylistToTop() {
    if (playlistContentEl) {
        playlistContentEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function currentFolderLabel() {
    if (!currentPath) {
        return 'library';
    }
    const parts = currentPath.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'library';
}

function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '-');
}

const HTML_AMP = String.fromCharCode(38) + 'amp;';
const HTML_LT = String.fromCharCode(38) + 'lt;';
const HTML_GT = String.fromCharCode(38) + 'gt;';
const HTML_QUOT = String.fromCharCode(38) + 'quot;';
const HTML_APOS = String.fromCharCode(38) + '#39;';
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, HTML_AMP)
        .replace(/</g, HTML_LT)
        .replace(/>/g, HTML_GT)
        .replace(/"/g, HTML_QUOT)
        .replace(/'/g, HTML_APOS);
}

function escapeJsString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function setDocumentTitle(track) {
    if (track && (track.displayName || track.name)) {
        const displayName = track.displayName || track.name;
        document.title = `${displayName} · RE:MUSIC`;
    } else {
        document.title = baseDocumentTitle;
    }
}

function setArtwork(url) {
    if (!artworkContainer || !artworkImg) {
        return;
    }
    if (url) {
        artworkImg.src = url;
        artworkContainer.classList.add('has-art');
    } else {
        artworkImg.removeAttribute('src');
        artworkImg.src = '';
        artworkContainer.classList.remove('has-art');
    }
}

function setupMediaSessionHandlers() {
    if (!mediaSessionSupported) {
        return;
    }
    const activeHandlers = {
        play: () => {
            audio.play().catch(() => { });
        },
        pause: () => {
            audio.pause();
        },
        previoustrack: () => {
            previousTrack();
        },
        nexttrack: () => {
            nextTrack();
        },
    };

    Object.entries(activeHandlers).forEach(([action, handler]) => {
        trySetActionHandler(action, handler);
    });

    ['stop', 'seekto', 'seekbackward', 'seekforward'].forEach((action) => {
        trySetActionHandler(action, null);
    });
}

function trySetActionHandler(action, handler) {
    try {
        navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
        if (handler !== null) {
            console.debug(`Media Session action '${action}' unsupported`, error);
        }
    }
}

function updateMediaSession(track) {
    if (!mediaSessionSupported) {
        return;
    }
    try {
        if (track) {
            const displayName = track.displayName || track.name;
            const artist = track.artist || currentFolderLabel();
            const album = track.album || currentFolderLabel();
            const artwork = track.artwork_url
                ? [
                    {
                        src: track.artwork_url,
                    },
                ]
                : [];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayName,
                artist,
                album,
                artwork,
            });
        } else {
            navigator.mediaSession.metadata = null;
        }
    } catch (error) {
        console.debug('Unable to update media metadata:', error);
    }
}

function updatePlaybackState(state) {
    if (!mediaSessionSupported) {
        return;
    }
    try {
        navigator.mediaSession.playbackState = state;
    } catch (error) {
        console.debug('Unable to update playback state:', error);
    }
}

function updatePositionState() {
    if (!positionStateSupported) {
        return;
    }
    if (!audio.duration || !Number.isFinite(audio.duration)) {
        return;
    }
    try {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
        });
    } catch (error) {
        console.debug('Unable to update position state:', error);
    }
}

function toggleShuffle() {
    if (playQueue.length <= 1) {
        isShuffleEnabled = false;
        updateShuffleButton();
        return;
    }
    isShuffleEnabled = !isShuffleEnabled;
    updateShuffleButton();
}

function toggleDropdown() {
    const dropdownMenu = document.getElementById('dropdown-menu');
    if (dropdownMenu) {
        dropdownMenu.classList.toggle('show');
    }
}

document.addEventListener('click', function (event) {
    const dropdown = document.querySelector('.dropdown');
    const dropdownMenu = document.getElementById('dropdown-menu');

    if (dropdown && dropdownMenu && !dropdown.contains(event.target)) {
        dropdownMenu.classList.remove('show');
    }
});

// Expose functions on window for inline handlers
window.loadFolder = loadFolder;
window.playTrack = playTrack;
window.playPlaylist = playPlaylist;
window.togglePlayback = togglePlayback;
window.nextTrack = nextTrack;
window.previousTrack = previousTrack;
window.goBack = goBack;
window.seekTo = seekTo;
window.rescanLibrary = rescanLibrary;
window.copyM3U8 = copyM3U8;
window.downloadM3U8 = downloadM3U8;
window.addTrackToQueue = addTrackToQueue;
window.removeFromQueue = removeFromQueue;
window.playFromQueue = playFromQueue;
window.moveQueueItem = moveQueueItem;
window.clearQueueHandler = clearQueueHandler;
window.toggleQueue = toggleQueue;
window.cycleRepeat = cycleRepeat;
window.toggleShuffle = toggleShuffle;
window.toggleDropdown = toggleDropdown;
window.onSearchInput = onSearchInput;
window.clearSearch = clearSearch;

