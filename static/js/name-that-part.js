(() => {
  const rotationDelayMs = 3000;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const groups = {};
  const triggers = document.querySelectorAll(".joint-cycle[data-joint-cycle]");

  triggers.forEach((trigger) => {
    const groupName = trigger.getAttribute("data-joint-cycle");
    const container = document.querySelector(`[data-joint-container="${groupName}"]`);
    if (!container) return;

    const authorNodes = Array.from(container.querySelectorAll(".joint-author"));
    if (authorNodes.length < 2) return;

    groups[groupName] = {
      container,
      originalOrder: authorNodes.slice(),
      nodes: authorNodes.slice(),
      intervalId: null,
    };

    const rotate = () => {
      const data = groups[groupName];
      if (!data || data.nodes.length < 2) return;
      const first = data.nodes.shift();
      data.container.appendChild(first);
      data.nodes.push(first);
    };

    const startRotation = () => {
      const data = groups[groupName];
      if (prefersReducedMotion) return;
      if (!data || data.intervalId) return;
      data.nodes = Array.from(data.container.querySelectorAll(".joint-author"));
      data.intervalId = window.setInterval(rotate, rotationDelayMs);
    };

    const stopRotation = () => {
      const data = groups[groupName];
      if (!data) return;
      if (data.intervalId) {
        window.clearInterval(data.intervalId);
        data.intervalId = null;
      }
    };

    startRotation();

    trigger.addEventListener("mouseenter", stopRotation);
    trigger.addEventListener("mouseleave", startRotation);
    trigger.addEventListener("focusin", stopRotation);
    trigger.addEventListener("focusout", (event) => {
      if (!trigger.contains(event.relatedTarget)) startRotation();
    });
  });
})();

(() => {
  const widgets = document.querySelectorAll("[data-audio-target]");
  if (!widgets.length) return;

  const targetIds = Array.from(
    new Set(
      Array.from(widgets)
        .map((widget) => widget.getAttribute("data-audio-target"))
        .filter(Boolean),
    ),
  );

  const audiosById = new Map(
    targetIds
      .map((id) => [id, document.getElementById(id)])
      .filter(([, element]) => element instanceof HTMLAudioElement),
  );
  if (!audiosById.size) return;

  const pauseOthers = (currentAudio) => {
    audiosById.forEach((audio) => {
      if (audio !== currentAudio) audio.pause();
    });
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds,
      ).padStart(2, "0")}`;
    }
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  const isFiniteDuration = (audio) =>
    Number.isFinite(audio.duration) && audio.duration > 0;

  const seekingState = new WeakMap();

  const setButtonState = (button, audio) => {
    const isPlaying = !audio.paused && !audio.ended;
    button.setAttribute("aria-pressed", isPlaying ? "true" : "false");

    const icon = button.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-play", !isPlaying);
      icon.classList.toggle("fa-pause", isPlaying);
    }

    const label = button.querySelector(".podcast-toggle-label");
    if (label) label.textContent = isPlaying ? "Pause" : "Play";
  };

  audiosById.forEach((audio, targetId) => {
    const idSelector = `[data-audio-target="${targetId}"]`;
    const buttons = document.querySelectorAll(
      `[data-audio-toggle]${idSelector}`,
    );
    const progressBars = document.querySelectorAll(
      `[data-audio-progress]${idSelector}`,
    );
    const timeLabels = document.querySelectorAll(`[data-audio-time]${idSelector}`);

    progressBars.forEach((bar) => seekingState.set(bar, false));

    const syncProgress = () => {
      const hasDuration = isFiniteDuration(audio);
      const ratio = hasDuration ? audio.currentTime / audio.duration : 0;

      progressBars.forEach((bar) => {
        if (seekingState.get(bar)) return;
        bar.disabled = !hasDuration;
        bar.value = String(Math.min(Math.max(ratio, 0), 1));
      });

      const timeText = hasDuration
        ? `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`
        : `${formatTime(audio.currentTime)} / 0:00`;
      timeLabels.forEach((label) => {
        label.textContent = timeText;
      });
    };

    const syncButtons = () => {
      buttons.forEach((button) => setButtonState(button, audio));
    };

    const syncAll = () => {
      syncButtons();
      syncProgress();
    };

    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (audio.paused || audio.ended) {
          pauseOthers(audio);
          try {
            await audio.play();
          } catch {
            // Ignore play rejections (e.g., autoplay policies).
          }
        } else {
          audio.pause();
        }
        syncButtons();
      });
    });

    progressBars.forEach((bar) => {
      const startSeek = () => seekingState.set(bar, true);
      const endSeek = () => seekingState.set(bar, false);

      bar.addEventListener("mousedown", startSeek);
      bar.addEventListener("touchstart", startSeek, { passive: true });
      bar.addEventListener("mouseup", endSeek);
      bar.addEventListener("touchend", endSeek);
      bar.addEventListener("mouseleave", endSeek);

      bar.addEventListener("input", () => {
        if (!isFiniteDuration(audio)) return;
        const ratio = Number.parseFloat(bar.value);
        if (!Number.isFinite(ratio)) return;
        audio.currentTime = Math.min(Math.max(ratio, 0), 1) * audio.duration;
        syncProgress();
      });

      bar.addEventListener("change", endSeek);
    });

    audio.addEventListener("loadedmetadata", syncAll);
    audio.addEventListener("durationchange", syncAll);
    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("play", () => {
      pauseOthers(audio);
      syncButtons();
    });
    audio.addEventListener("pause", syncButtons);
    audio.addEventListener("ended", syncAll);

    syncAll();
  });
})();
