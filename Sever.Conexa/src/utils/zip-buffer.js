import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';

/**
 * @param {Array<{ name: string, data: Buffer | string }>} files
 * @returns {Promise<Buffer>}
 */
export async function createZipBuffer(files) {
  const zip = new ZipArchive({ zlib: { level: 9 } });
  const bufferStream = new PassThrough();
  zip.pipe(bufferStream);

  for (const file of files) {
    zip.append(file.data, { name: file.name });
  }

  await zip.finalize();

  const chunks = [];
  for await (const chunk of bufferStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
