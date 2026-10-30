/* Runs synchronously in <head> before first paint: applies the saved theme and
   zen mode so the page never flashes in the wrong colours. Keep this tiny. */
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
  root.classList.add("js");
})();
