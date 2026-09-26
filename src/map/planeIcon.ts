/** Built-in top-view airplane, nose pointing right (0°), as orient-to-path expects. */
const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
  <path d="M188 80c0 6-8 10-18 10H118L82 150H62l18-60H40l-14 20H12l8-30-8-30h14l14 20h40L62 10h20l36 60h52c10 0 18 4 18 10z"
    fill="#f8fafc" stroke="#0f172a" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

export const PLANE_ICON_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLANE_SVG)}`;
export const PLANE_ICON_ASPECT = 160 / 200;
