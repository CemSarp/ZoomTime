declare module '*.css' { const url: string; export default url; }
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
interface Window { zoomtime: import('./bridge.ts').ZoomTimeBridge }
