import JSZip from 'jszip';
import {
  buildGoogleMapsLinks,
  buildPlainText,
  collectRoutePoints,
  safeFileName,
} from '@/lib/googleMapsExport';
import type { Project } from '@/types';

export async function downloadProjectZip(project: Project): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(safeFileName(project.name)) ?? zip;

  for (const route of project.routes) {
    const points = collectRoutePoints(
      route,
      project.stops,
      project.depots,
      project.label_template,
    );
    if (points.length === 0) continue;
    const links = buildGoogleMapsLinks(points);
    const text = buildPlainText(route.name, points, links);
    const base = safeFileName(route.name);
    folder.file(`${base}.txt`, text);
    if (links.length > 0) {
      const urls = links
        .map((l) => `Part ${l.index} of ${l.total}: ${l.url}`)
        .join('\n');
      folder.file(`${base}-google-maps.txt`, urls);
    }
  }

  // Top-level summary
  const summary = [
    `Project: ${project.name}`,
    `Exported: ${new Date().toISOString()}`,
    `${project.routes.length} route${project.routes.length === 1 ? '' : 's'}`,
    `${project.stops.length} stop${project.stops.length === 1 ? '' : 's'}`,
    `${project.depots.length} depot${project.depots.length === 1 ? '' : 's'}`,
  ].join('\n');
  folder.file('README.txt', summary);

  const blob = await zip.generateAsync({ type: 'blob' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `lazysalesman-${safeFileName(project.name)}-${dateStr}.zip`;
  triggerDownload(blob, filename);
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
