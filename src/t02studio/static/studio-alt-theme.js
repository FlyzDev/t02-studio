/* Theme belongs to the optional /alt workbench, never changes / or /classic. */
(() => {
  const key = "t02-studio-alt-theme";
  const root = document.documentElement;
  let theme = "dark";
  try {
    if (localStorage.getItem(key) === "light") theme = "light";
  } catch { /* Private browsing may disable storage. */ }

  const apply = () => {
    root.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      const isDark = theme === "dark";
      button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      button.setAttribute("aria-pressed", String(isDark));
      button.innerHTML = isDark ? "☼ <span>Light theme</span>" : "☾ <span>Dark theme</span>";
    }
  };

  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, theme); } catch { /* Still usable without persistence. */ }
      apply();
    });
  });
})();
