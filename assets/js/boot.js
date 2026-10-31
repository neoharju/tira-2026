/* Runs synchronously in <head> before first paint: applies the saved theme,
   zen mode and text size, so the page never flashes in the wrong colours or
   jumps to another text size. Keep this tiny. */
(function () {
  var root = document.documentElement;
  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  var theme = read("tira-theme");
  var dark = theme === "dark" ||
    (theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  if (read("tira-zen") === "1") root.classList.add("zen");
  var size = read("tira-font-size");
  if (size === "large" || size === "xlarge") root.setAttribute("data-font-size", size);
  root.classList.add("js");
})();
