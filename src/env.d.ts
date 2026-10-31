// Vite ambient types
declare module '*.css';

declare module '*?raw' {
    const source: string;
    export default source;
}

interface ImportMeta {
    readonly env: { readonly DEV: boolean };
}
