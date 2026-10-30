/* Runs synchronously in <head> before first paint: applies the saved theme so
   the page never flashes in the wrong colours. Keep this tiny. */
(function () {
  var root = document.documentElement;
  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  var theme = read("tira-theme");
  var dark = theme === "dark" ||
    (theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.add("js");
})();
