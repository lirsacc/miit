export default function onDomReady(func) {
  if (['complete', 'loaded', 'interactive'].indexOf(document.readyState) > -1) {
    func();
  } else {
    document.addEventListener('DOMContentLoaded', func);
  }
}
