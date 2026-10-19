import fs from 'node:fs';

const manifestPath = new URL('../data/responsive-images.json',import.meta.url);
const images = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : {};
export function responsiveAttrs(src,sizes) {
 const variants=images[src];
 return variants?.length ? ` srcset="${variants.map(image=>`${image.src} ${image.width}w`).join(', ')}" sizes="${sizes}"` : '';
}
export const cardImageSizes='(max-width:780px) calc((100vw - 54px)/2), (max-width:1100px) calc((100vw - 118px)/4), 286px';
