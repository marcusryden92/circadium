// Next.js declares *.module.css but not bare *.css. With moduleResolution:
// "bundler", side-effect imports like `import "./globals.css"` need an
// ambient declaration for tsc --noEmit to resolve them.
declare module "*.css";
