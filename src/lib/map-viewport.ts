const MAX_ZOOM = 8;
const FIT_LIMIT = 5;
const ZOOM_STEP = 1.4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function initMapViewport(
  map: HTMLElement,
  pins: HTMLButtonElement[],
  openPin: (pin: HTMLButtonElement) => void,
) {
  const frame = map.querySelector<HTMLElement>('.map-frame')!;
  const world = map.querySelector<HTMLElement>('.map-world')!;
  const controls = map.querySelector<HTMLElement>('.map-controls')!;
  const zoomIn = controls.querySelector<HTMLButtonElement>('[data-map-in]')!;
  const zoomOut = controls.querySelector<HTMLButtonElement>('[data-map-out]')!;
  const fit = controls.querySelector<HTMLButtonElement>('[data-map-fit]')!;
  const points = pins.map(pin => ({
    x: parseFloat(pin.style.getPropertyValue('--x')) / 100,
    y: parseFloat(pin.style.getPropertyValue('--y')) / 100,
  }));
  const left = Math.min(...points.map(point => point.x));
  const right = Math.max(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y));
  const bottom = Math.max(...points.map(point => point.y));

  let zoom = 1;
  let centerX = 0.5;
  let centerY = 0.5;
  let fitted = false;
  let frameWidth = 0;
  let frameHeight = 0;
  let intro: IntersectionObserver | undefined;

  function render(animate = false) {
    frameWidth = frame.clientWidth;
    frameHeight = frame.clientHeight;
    const width = world.offsetWidth * zoom;
    const height = world.offsetHeight * zoom;
    if (!width || !height) return;

    const offset = (center: number, size: number, viewport: number) =>
      size <= viewport ? (viewport - size) / 2 : clamp(viewport / 2 - center * size, viewport - size, 0);
    const x = offset(centerX, width, frameWidth);
    const y = offset(centerY, height, frameHeight);
    centerX = (frameWidth / 2 - x) / width;
    centerY = (frameHeight / 2 - y) / height;
    world.classList.toggle('map-zooming', animate);
    world.style.setProperty('--map-zoom', String(zoom));
    world.style.setProperty('--map-x', `${x}px`);
    world.style.setProperty('--map-y', `${y - frameHeight / 2}px`);
    frame.classList.toggle('map-zoomed', zoom > 1);
    zoomIn.setAttribute('aria-disabled', String(zoom >= MAX_ZOOM));
    zoomOut.setAttribute('aria-disabled', String(zoom <= 1));
  }

  function fitVenues(animate = false) {
    const padding = 32;
    zoom = clamp(Math.min(
      (frame.clientWidth - 2 * padding) / ((right - left) * world.offsetWidth),
      (frame.clientHeight - 2 * padding) / ((bottom - top) * world.offsetHeight),
    ), 1, FIT_LIMIT);
    centerX = (left + right) / 2;
    centerY = (top + bottom) / 2;
    fitted = true;
    render(animate);
  }

  function changeZoom(factor: number) {
    const nextZoom = clamp(zoom * factor, 1, MAX_ZOOM);
    if (nextZoom === zoom) return;
    intro?.disconnect();
    fitted = false;
    zoom = nextZoom;
    render(true);
  }

  zoomIn.addEventListener('click', () => changeZoom(ZOOM_STEP));
  zoomOut.addEventListener('click', () => changeZoom(1 / ZOOM_STEP));
  fit.addEventListener('click', () => {
    intro?.disconnect();
    fitVenues(true);
  });

  // Keep vertical page scrolling available over the map on touch screens.
  let pointer: { id: number; x: number; y: number } | undefined;
  let dragged = false;
  world.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    intro?.disconnect();
    dragged = false;
    if (zoom > 1) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  world.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    if (!dragged) world.setPointerCapture(event.pointerId);
    dragged = true;
    fitted = false;
    centerX -= dx / (world.offsetWidth * zoom);
    centerY -= dy / (world.offsetHeight * zoom);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    render();
  });
  function endDrag(event: PointerEvent) {
    if (pointer?.id === event.pointerId) pointer = undefined;
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  world.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('.pin');
    if (!target || (dragged && event.detail > 0)) return;
    if (event.detail === 0) {
      openPin(target);
      return;
    }
    // When hit areas overlap, prefer the marker closest to the click or tap.
    let nearest = target;
    let distance = Infinity;
    for (const pin of pins) {
      const rect = pin.getBoundingClientRect();
      const next = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (next < distance) {
        nearest = pin;
        distance = next;
      }
    }
    openPin(nearest);
  });

  pins.forEach((pin, index) => pin.addEventListener('focus', () => {
    intro?.disconnect();
    const viewport = frame.getBoundingClientRect();
    const marker = pin.getBoundingClientRect();
    if (marker.left >= viewport.left && marker.right <= viewport.right &&
        marker.top >= viewport.top && marker.bottom <= viewport.bottom) return;
    fitted = false;
    ({ x: centerX, y: centerY } = points[index]);
    render();
  }));

  controls.hidden = false;
  render();
  if ('IntersectionObserver' in window) {
    intro = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.25) return;
      intro?.disconnect();
      fitVenues(true);
    }, { threshold: 0.25 });
    intro.observe(frame);
  } else {
    fitVenues();
  }
  new ResizeObserver(() => {
    if (frame.clientWidth === frameWidth && frame.clientHeight === frameHeight) return;
    if (fitted) fitVenues();
    else render();
  }).observe(frame);
}
