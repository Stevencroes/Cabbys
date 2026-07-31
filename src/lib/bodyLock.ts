// §4.3 — iOS-safe scroll lock, reference-counted: a search sheet can open
// on top of the booking modal and must not unlock the page beneath it.
let locks = 0;
let scrollY = 0;

export function lockBody(): void {
  if (locks++ === 0) {
    scrollY = window.scrollY;
    document.body.style.top = -scrollY + "px";
    document.body.classList.add("locked");
  }
}

export function unlockBody(): void {
  if (--locks <= 0) {
    locks = 0;
    document.body.classList.remove("locked");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
  }
}
