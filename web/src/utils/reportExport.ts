import { Browser } from "@capacitor/browser";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { ReportExportResponse } from "../services/api";
import { isNativeApp } from "./runtime";

const REPORTS_DIR = "relatorios";
const NATIVE_REPORTS_DIRECTORY = Directory.Cache;

type HandleReportExportOptions = {
  contentType?: string;
  dialogTitle?: string;
};

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadBlobOnWeb(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function decodeBase64(base64Value: string) {
  const binary = window.atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Nao foi possivel preparar o arquivo para download."));
        return;
      }
      const [, base64Content = ""] = reader.result.split(",", 2);
      resolve(base64Content);
    };
    reader.onerror = () => {
      reject(new Error("Nao foi possivel preparar o arquivo para download."));
    };
    reader.readAsDataURL(blob);
  });
}

async function shareSavedFile(fileUri: string, filename: string, dialogTitle?: string) {
  try {
    const canShare = await Share.canShare();
    if (!canShare.value) {
      return;
    }

    await Share.share({
      title: filename,
      text: `Relatorio exportado: ${filename}`,
      files: [fileUri],
      dialogTitle: dialogTitle ?? "Abrir ou compartilhar relatorio",
    });
  } catch {
    // The file is already saved locally; sharing is optional.
  }
}

async function saveRemoteFileToDevice(
  downloadUrl: string,
  targetPath: string,
  filename: string,
  dialogTitle?: string
) {
  try {
    const remoteResponse = await fetch(downloadUrl);
    if (!remoteResponse.ok) {
      throw new Error(`Erro ${remoteResponse.status}`);
    }
    const blob = await remoteResponse.blob();
    const base64Content = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: targetPath,
      data: base64Content,
      directory: NATIVE_REPORTS_DIRECTORY,
      recursive: true,
    });
  } catch (error) {
    await Browser.open({ url: downloadUrl });
    throw new Error(
      error instanceof Error
        ? `${error.message}. O arquivo foi aberto no navegador para concluir o download.`
        : "O arquivo foi aberto no navegador para concluir o download."
    );
  }

  const { uri } = await Filesystem.getUri({
    path: targetPath,
    directory: NATIVE_REPORTS_DIRECTORY,
  });
  await shareSavedFile(uri, filename, dialogTitle);
  return `Relatorio preparado no celular como ${filename}.`;
}

async function saveGeneratedFileToDevice(
  response: ReportExportResponse,
  filename: string,
  dialogTitle?: string
) {
  const targetPath = `${REPORTS_DIR}/${filename}`;
  if (response.content_base64) {
    await Filesystem.writeFile({
      path: targetPath,
      data: response.content_base64,
      directory: NATIVE_REPORTS_DIRECTORY,
      recursive: true,
    });
  } else if (response.content) {
    await Filesystem.writeFile({
      path: targetPath,
      data: response.content,
      directory: NATIVE_REPORTS_DIRECTORY,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } else if (response.download_url) {
    return saveRemoteFileToDevice(
      response.download_url,
      targetPath,
      filename,
      dialogTitle
    );
  } else {
    throw new Error("Nao foi possivel exportar o relatorio.");
  }

  const { uri } = await Filesystem.getUri({
    path: targetPath,
    directory: NATIVE_REPORTS_DIRECTORY,
  });
  await shareSavedFile(uri, filename, dialogTitle);
  return `Relatorio preparado no celular como ${filename}.`;
}

export async function handleReportExport(
  response: ReportExportResponse,
  filename: string,
  options: HandleReportExportOptions = {}
) {
  const resolvedFilename = sanitizeFilename(filename) || "relatorio";
  const contentType =
    response.content_type ?? options.contentType ?? "application/octet-stream";

  if (isNativeApp) {
    return saveGeneratedFileToDevice(
      response,
      resolvedFilename,
      options.dialogTitle
    );
  }

  if (response.download_url) {
    window.open(response.download_url, "_blank", "noopener,noreferrer");
    return null;
  }

  if (response.content_base64) {
    const bytes = decodeBase64(response.content_base64);
    const blob = new Blob([bytes], { type: contentType });
    downloadBlobOnWeb(blob, resolvedFilename);
    return null;
  }

  if (response.content) {
    const blob = new Blob([response.content], { type: contentType });
    downloadBlobOnWeb(blob, resolvedFilename);
    return null;
  }

  throw new Error("Nao foi possivel exportar o relatorio.");
}
