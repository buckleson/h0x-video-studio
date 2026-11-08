// Shared runtime for explainer scenes. Load after gsap.min.js and timings.js.
//
//   const { tl, at, end, show } = H0X.boot({ watermark: { src, label } });
//   tl.from("#title", { y: 40, opacity: 0, duration: 0.8 }, at("s1"));
//
// at(id, offset) -> start time (s) of voice line `id`; end(id) -> its end time.
// show(sceneId, from, to) makes a .scene visible for [from, to) with a crossfade.
(function () {
  const H0X = {};

  H0X.boot = function ({ watermark, subtitles = true, crossfade = 0.5 } = {}) {
    const T = window.TIMINGS;
    if (!T) throw new Error("timings.js not loaded");
    const byId = Object.fromEntries(T.lines.map((l) => [l.id, l]));
    const at = (id, off = 0) => {
      if (!byId[id]) throw new Error(`unknown voice line ${id}`);
      return byId[id].start + off;
    };
    const end = (id, off = 0) => byId[id].end + off;

    const tl = gsap.timeline({ paused: true });
    // Pin the timeline length to the voice track.
    tl.set({}, {}, T.total);

    if (watermark) {
      const wm = document.createElement("div");
      wm.id = "wm";
      if (watermark.src) wm.innerHTML = `<img src="${watermark.src}" alt="">`;
      if (watermark.label) wm.innerHTML += `<span>${watermark.label}</span>`;
      document.body.appendChild(wm);
    }

    if (subtitles) {
      const box = document.createElement("div");
      box.id = "subs";
      document.body.appendChild(box);
      for (const line of T.lines) {
        for (const c of line.cues) {
          const el = document.createElement("div");
          el.className = "cue";
          el.textContent = c.text;
          box.appendChild(el);
          tl.to(el, { opacity: 1, duration: 0.12 }, c.start);
          tl.to(el, { opacity: 0, duration: 0.12 }, c.end + 0.1);
        }
      }
    }

    const show = (sel, from, to) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      tl.set(el, { visibility: "visible", opacity: 0 }, from);
      tl.to(el, { opacity: 1, duration: crossfade, ease: "power2.out" }, from);
      if (to != null) {
        tl.to(el, { opacity: 0, duration: crossfade, ease: "power2.in" }, to - crossfade);
        tl.set(el, { visibility: "hidden" }, to);
      }
      return el;
    };

    // Split text into word spans for staggered reveals.
    const words = (sel) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="w" style="display:inline-block">${w}</span>`).join(" ");
      return el.querySelectorAll(".w");
    };

    window.__timeline = tl;
    window.__ready = (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await Promise.all([...document.querySelectorAll("video")].map((v) => (v.readyState >= 2 ? null : new Promise((r) => { v.onloadeddata = v.onerror = r; }))));
      tl.seek(0, false);
    })();
    return { tl, at, end, show, words, total: T.total, lines: T.lines };
  };

  window.H0X = H0X;
})();
