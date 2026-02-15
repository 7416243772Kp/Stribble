// C:\Ebook\src\utils\pdfToImages.js
// Converts a PDF file into individual PNG page images at upload time.

import fs from 'fs';
import path from 'path';

/**
 * Convert a PDF file into individual PNG images (one per page).
 * @param {string} pdfFilePath  — absolute path to the source PDF
 * @param {string} outputDir    — directory where page images will be saved
 * @returns {Promise<{ pageImages: string[], totalPages: number }>}
 */
export async function convertPdfToImages(pdfFilePath, outputDir) {
  // pdf-to-img is ESM-only, dynamic import works fine in our ESM project
  const { pdf } = await import('pdf-to-img');

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pageImages = [];
  let pageNum = 0;

  // pdf() returns an async iterable of page image buffers (PNG by default)
  // scale: 4.0 → renders at ~288 DPI (4× base 72 DPI) for HD quality
  const document = await pdf(pdfFilePath, { scale: 4.0 });

  for await (const image of document) {
    pageNum++;
    const filename = `page-${pageNum}.png`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, image);
    pageImages.push(filename);
  }



  return { pageImages, totalPages: pageNum };
}

/**
 * Delete all generated page images for a course.
 * @param {string} imageDir — directory containing page images
 */
export function deletePageImages(imageDir) {
  if (fs.existsSync(imageDir)) {
    fs.rmSync(imageDir, { recursive: true, force: true });

  }
}
